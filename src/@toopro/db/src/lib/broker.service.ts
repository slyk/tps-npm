import { IsLoginStatus, DB_ServerInfo, DB_ServerNamesStd, ServersConfigHash, DB_Credentials } from './types/types.js';
import { DB_EntityService_Base } from './service-base.js';
import { DB_EntityServiceBase_Directus } from './service-directus.js';

/**
 * Service to manage multiple directus servers and login to them
 *
 * usage:
 * 1. create service with config
 * 2. get server by name or by entity (better user server_name:entity_name)
 * 3. use server to execute requests
 */
export class DB_BrokerService {
  /**
   * servers by name
   */
  private servers: Partial<Record<DB_ServerNamesStd | string, DB_ServerInfo<any>>> = {};

  /**
   * list of callbacks that need to be called when any server is updated
   * */
  private serverUpdatesSubscribers: Map<
    DB_ServerNamesStd | '-any-' | string,
    ((updates:Partial<DB_ServerInfo>, fullSrv?:DB_ServerInfo) => void)[]
  > = new Map();


  /**
   * service by entity name (filled up when getServerByEntity() called)
   * (used by deepField to get nested field service to load its entities to host service)
   */
  private serviceByEntity: Partial<Record<string, DB_EntityService_Base<any>>> = {};

  /**
   * servers config
   * @private
   */
  private config?: ServersConfigHash;

  /**
   *
   */
  constructor(config?: ServersConfigHash, serverSuffix?: string) {
    DB_BrokerService._i = this;
    if(!config) return; else this.config = config;
    //cycle each server to prepare server info object
    for (const serverName of Object.keys(this.config.credentials)) {
      const credentials = this.config.credentials[serverName];
      if (!credentials) continue;
      credentials.entities = this.config.entitiesByServer[serverName] ?? [];
      credentials.url = credentials.url ?? 'https://' + serverName + (serverSuffix ?? '');
      this.upsertServer(serverName as DB_ServerNamesStd, credentials);
    }
  }
  private static _i:DB_BrokerService;
  public static get i(): DB_BrokerService {
    if(!DB_BrokerService._i) DB_BrokerService._i = new DB_BrokerService();
    return DB_BrokerService._i;
  }

  /**
   * Add/update server to broker with optional auto-login.
   *
   * Also broker internally need to use this function to, so any changes
   * to server will be send to subscrbers.
   *
   * @param serverNameOrFullSrv could be:
   *    - **string** server name to change and then
   *      in second param the actual records that need to be changed or
   *    - **object** with full server info data to be saved and `name` field required,
   *      so broker would know what server to modify.
   * @param changes
   * @param doLogin - if true - will relogin to server if credentials changed
   *    use `waitForLogin()` to wait for login to complete
   * @param notifySubscribers - if true - will notify all subscribers
   *    that changes were made to server. This will call all callbacks that
   *    are subscribed to events, be careful to not make infinite loop.
   *    This subscription used by ngrx clients, for example, to have state
   *    updated with actual, is logged in and uses info.
   * @see waitForLogin()
   * @return updated full server info object
   */
  upsertServer(serverNameOrFullSrv: DB_ServerNamesStd | string | DB_ServerInfo, changes?: Partial<DB_ServerInfo>, doLogin = false, notifySubscribers = true): DB_ServerInfo {
    //populate values depend on given type of data
    const serverName = typeof serverNameOrFullSrv === 'string' ? serverNameOrFullSrv : serverNameOrFullSrv.name;
    const changesIn: Partial<DB_ServerInfo> = (typeof serverNameOrFullSrv === 'string' ? (changes ?? {}) : serverNameOrFullSrv) as Partial<DB_ServerInfo>;
    const oldSrv = this.getServer(serverName);

    //if there is no server info exists - CREATE a new one and set default values
    if(!oldSrv) this.servers[serverName] = {
      name: serverName,
      url: changesIn.url ?? ('https://' + serverName),
      //login: changesIn.login,
      //password: changesIn.password,
      //token: changesIn.token,
      type: changesIn.type,
      isLoggedIn: IsLoginStatus.not,
      entities: changesIn.entities ?? [],
      broker: this,
    } as DB_ServerInfo<undefined>;

    const srvRef = this.servers[serverName]!;

    //if we have type but don't have login function - add it
    if(changesIn.type && !srvRef.loginFunction) {
      //this created circular dependency so maybe don't need in future
      if(changesIn.type === 'directus')
        srvRef.loginFunction =
          (DB_EntityServiceBase_Directus.loginToServer as unknown as (srv?: DB_ServerInfo<object, object>) => Promise<IsLoginStatus>);
    }

    //here will be only the changes that are actually different
    const realChanges: Partial<DB_ServerInfo> = this.getChanges(oldSrv as Partial<DB_ServerInfo>, changesIn);

    //update values without redefining the object itself
    Object.assign(srvRef, realChanges);

    //notify subscribers that changes were made
    if (notifySubscribers && realChanges && Object.keys(realChanges).length>0) {
      this.notifyServerUpdates(serverName, realChanges, srvRef);
    }

    //if we need to log in - do it
    const srv = srvRef;
    if(doLogin && srv.isLoggedIn<=0 &&
      (!!srv.loginFunction || !!srv.someService) &&
      (realChanges.login || realChanges.password || realChanges.token )
    ) {
      //if we are not logged in or credentials changed - login
      this._loginServer(srv).then(()=>console.log(`DB auto login ${serverName} done (in broker)`));
    }

    return srvRef;
  }

  /**
   * return server by name
   * @param serverName
   */
  getServer(serverName: DB_ServerNamesStd | string): DB_ServerInfo | undefined {
    return this.servers[serverName];
  }

  /**
   * ast to login to server by its name
   * the loginFunction from server info will be used
   * or someService.login() if loginFunction is not provided and someService is set
   * if no loginFunction could be used - set IsLoginStatus.error to server info
   * @param serverName
   * @param credentials
   * @return full server info object with updated login status
   */
  async loginServer(serverName: DB_ServerNamesStd, credentials?: DB_Credentials): Promise<DB_ServerInfo | undefined> {
    const srv = this.getServer(serverName);
    if(!srv) return Promise.resolve(undefined);
    await this._loginServer(srv,credentials);
    return srv;
  }

  /**
   * internal function to login to already given full server object
   * @param srv
   * @param credentials
   * @private
   */
  private async _loginServer(srv: DB_ServerInfo, credentials?:DB_Credentials): Promise<IsLoginStatus> {
    const loginFunction = srv.loginFunction ?? (srv.someService ? srv.someService.login : null);
    if(!loginFunction) {
      console.error('cant login to server:', srv, credentials);
      return srv.isLoggedIn = IsLoginStatus.error;
    }
    return loginFunction.call(srv.someService??this, srv);
  }

  /**
   * wait for login to server used after upsertServer() with re-login set to true
   * @param serverName
   * @param tries - how many times to check login status
   */
  async waitForLogin(serverName: DB_ServerNamesStd, tries = 10): Promise<IsLoginStatus> {
    const srv = this.getServer(serverName);
    if(!srv) return IsLoginStatus.error;
    if(srv.isLoggedIn>0) return srv.isLoggedIn;
    while(srv.isLoggedIn === IsLoginStatus.waiting && tries-- > 0)
      await new Promise(res => setTimeout(res, 500));
    return srv.isLoggedIn;
  }

  async logoutServer(serverName: DB_ServerNamesStd): Promise<IsLoginStatus> {
    const srv = this.getServer(serverName);
    if(!srv) return IsLoginStatus.error;
    if(!srv.someService) {
      console.warn('DB Broker: logoutServer() no service found for server:', serverName);
      return IsLoginStatus.error;
    }
    return srv.someService.logout().then(() => srv.isLoggedIn = IsLoginStatus.not);
  }

  /**
   * Return server info object by entity.
   * Using search in entities[] lists of servers or prefix: with server name
   *
   * @param entityName just entity name,
   *    or "serverName:entityName" to tell directly which server to use
   * @param serviceInstance put the instance of the EntityService_Base
   *    that will be used to work with given entity name
   *    (it will be stored in broker for later use).
   *    If not provided - just skip this step.
   * @return server info or undefined if not found
   */
  getServerByEntity<T extends Record<string, any>>(entityName: string, serviceInstance?:DB_EntityService_Base<T>): DB_ServerInfo | undefined {
    let ret:DB_ServerInfo | undefined;

    //if wa have server name in entity name by prefix - use it
    const entityNameParts = entityName.split(':');
    if(entityNameParts.length>1) {
      ret = this.getServer(entityNameParts[0] as DB_ServerNamesStd);
      entityName = entityNameParts[1];
    } else {
      //find by entity name (cycle all servers entity[] arrays)
      for (const serverName of Object.keys(this.servers)) {
        const currSrv = this.servers[serverName];
        if (!currSrv || !currSrv.entities || !currSrv.entities.includes(entityName)) continue;
        ret = currSrv; break;
      }
    }

    if(ret) {
      //add entityName to an entity list (just for info)
      if(ret.entities && !(entityName in ret.entities)) ret.entities.push(entityName);
      //save entityService instance (maybe will need it later)
      if(serviceInstance) this.serviceByEntity[entityName] = serviceInstance;
    }
    return ret;
  }

  getServiceByEntity<T extends Record<string, any>>(entityName: string): DB_EntityService_Base<T> {
    return this.serviceByEntity[entityName] as DB_EntityService_Base<T>;
  }

  //////////////////////////////////////////////////////////////////////////////
  // UPDATES SUBSCRIBER

  /**
   * subscribe to server updates events
   * @param toServer - server name or '-any-' to listen to all servers
   * @param callback - callback that will be called when server data is changed
   *    callback will receive:
   *    - updates hash with changed fields and
   *    - full server info (full server info can be optional)
   *
   * @example dbBroker.subscribe('-any-', (changes,srv)=>consoloe.log(changes))
   */
  subscribe(toServer:DB_ServerNamesStd|'-any-'|string, callback:(updates:Partial<DB_ServerInfo>, fullSrv?:DB_ServerInfo)=>void) {
    const subs = this.serverUpdatesSubscribers.get(toServer);
    if(!subs) {
      this.serverUpdatesSubscribers.set(toServer, [callback]);
    } else {
      subs.push(callback);
    }
  }

  unsubscribe(callback:(updates:Partial<DB_ServerInfo>)=>void) {
    //cycle each servers in subscribers hash to find this callback and remove it
    for(const subs of this.serverUpdatesSubscribers.values()) {
      const idx = subs.indexOf(callback);
      if(idx>=0) subs.splice(idx, 1);
    }
  }

  private notifyServerUpdates(serverName:DB_ServerNamesStd|string, updates:Partial<DB_ServerInfo>, fullSrv?:DB_ServerInfo) {
    if(!fullSrv) fullSrv = this.getServer(serverName);
    const subs = this.serverUpdatesSubscribers.get(serverName);
    if(subs) subs.forEach(sub => setTimeout(() => sub(updates, fullSrv), 0));
    //notify -any- too
    const subsAny = this.serverUpdatesSubscribers.get('-any-');
    if(subsAny) subsAny.forEach(sub => setTimeout(() => sub(updates, fullSrv), 0));
  }

  private getChanges(oldSrv: Partial<DB_ServerInfo>, newSrv: Partial<DB_ServerInfo>): Partial<DB_ServerInfo> {
    const changes: Partial<DB_ServerInfo> = {};
    if(!oldSrv) return newSrv; //if no data for oldSrv - then all

    for (const key in newSrv) {
      const k = key as keyof DB_ServerInfo;
      if ((newSrv as any)[k] !== (oldSrv as any)?.[k]) {
        (changes as any)[k] = (newSrv as any)[k];
      }
    }
    return changes;
  }

}
