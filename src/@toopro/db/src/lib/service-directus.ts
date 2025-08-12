import { I_DB_EntityServiceBase } from './types/service-base.interface.js';
import {
  authentication,
  AuthenticationData,
  AuthenticationMode,
  createDirectus,
  createItem,
  createItems,
  deleteItem,
  deleteItems,
  readFiles,
  readItems,
  readMe,
  readRoles,
  rest,
  UnpackList,
  updateItem,
  updateItems
} from '@directus/sdk';
import {
  DB_Credentials,
  DB_EntityID,
  DB_ServerInfo_Directus,
  DB_VerboseLevel,
  DBtype,
  IsLoginStatus
} from './types/types.js';
import { DB_BrokerService } from './broker.service.js';
import { DB_Query, DB_QueryBuilder, I_DB_Query, I_DB_Query_Directus } from './types/query.type.js';
import { DB_EntityService_Base } from './service-base.js';
import { DB_EntityBase } from './types/db-entity-base.js';
import { DB_Error, DB_ErrorLevel } from './types/db.error.js';
import { DB_EntityService_Options } from './types/service-options.interface.js';
import {platformAPI, platformIsBrowser} from "./utils/platform-api.js";

/**
 * Directus SDK: specific implementation of the DB_EntityServiceBase,
 * to load entities from Directus servers
 */
export abstract class DB_EntityServiceBase_Directus<T extends DB_EntityBase<object>|object> extends DB_EntityService_Base<T> implements I_DB_EntityServiceBase<T> {

  /**
   * server info used for this entity (url, credentials, etc.)
   * info with `srvInfo.i` object to work with directus (add request and auth methods)
   */
  declare srvInfo:DB_ServerInfo_Directus<T>;

  /**
   * Helper function to handle permission errors by attempting to relogin
   * and retry the operation.
   *
   * @param errStr The error string to check for permission/token issues
   * @param operation The operation to retry if relogin is successful
   * @returns The result of the operation or the error string
   * @private
   */
  private async handlePermissionError<R>( errStr: string, operation: () => Promise<R> ): Promise<R> {
    // Check if the error is related to permissions, token, or credentials
    if (errStr.includes('permission') || errStr.includes('token') || errStr.includes('Invalid user credentials')) {
      this.srvInfo.isLoggedIn = IsLoginStatus.ndef; // Reset login status
      const loginStatus = await this.login();
      // If login was successful, retry the operation; ELSE throw with original error
      if (loginStatus === IsLoginStatus.yes) return await operation();
    }
    // If not a permission error or login failed, throw the original error string
    throw new DB_Error(errStr);
  }

  /**
   * **WARNING: you can't use this service right after creation, **
   * because login is async, and you need to make sure that the server
   * is logged in before using it
   * @param entityName
   * @param dbBroker
   * @param options config verbosity level, error throw policy, etc
   * @protected
   */
  protected constructor(entityName:string, dbBroker:DB_BrokerService, options?:DB_EntityService_Options) {
    super(entityName, dbBroker, options);//init base class (save server from broker and login)
    const srvInfo = this.srvInfo as DB_ServerInfo_Directus<T>;
    if(!srvInfo.type) srvInfo.type = DBtype.directus; //the server 'directus' type must be set
    if(!srvInfo.loginFunction) srvInfo.loginFunction = DB_EntityServiceBase_Directus.loginToServer as any;// as (srv?:DB_ServerInfo)=>Promise<IsLoginStatus>;
  }

  //////////////////////////////////////////////////////////////////////////////
  // SERVER IMPLEMENTATION FUNCTIONS

  //for angular you should set this to 'cookies' to make it work
  public static AUTH_MODE:AuthenticationMode  = 'json';

  /**
   * make it static, because db-broker will need to log in server without creating
   * any entity instance
   * !!fut: move part of this to base class as a static abstract method
   * @param toServer
   * @param credentials
   */
  static override async loginToServer(toServer:DB_ServerInfo_Directus, credentials?:DB_Credentials & {options?:{auth_mode:AuthenticationMode}}):Promise<IsLoginStatus> {
    const srv = toServer;  if(!srv) return IsLoginStatus.error;
    if(srv.isLoggedIn > IsLoginStatus.ndef) return srv.isLoggedIn;
    console.log('login to server:', srv.name, srv.isLoggedIn, ' service: ', srv.name);

    //if we are already waiting for login - wait some ms and check again
    if(srv.isLoggedIn === IsLoginStatus.waiting) {
      let tries = 10; //console.log('waiting for login');
      while (srv.isLoggedIn === IsLoginStatus.waiting && tries-- >0)
        await new Promise((res) => setTimeout(res, 500));
      console.log('waiting for login done, tries:', (10-tries), 'logins status: ', srv.isLoggedIn);
      return srv.isLoggedIn;
    }

    //prepare credentials
    if(credentials) {
      //if credentials given in arguments - use them and save to srv object (rewrite if needed)
      if(credentials.password && (srv.login!==credentials.login || srv.password!==credentials.password)) {
        srv.login = credentials.login;
        srv.password = credentials.password;
      }
      if(credentials.token && srv.token !== credentials.token) srv.token = credentials.token;
    } else {
      //else take credentials from srv object
      credentials = {login:srv.login, password:srv.password, token:srv.token};
    }

    //'json' | 'cookie' | 'session' depend on environment.
    //if we see that we are in browser - use 'cookie' auth mode
    //if we are in Node.js - use 'json' auth mode
    let authMode:AuthenticationMode = platformIsBrowser ? 'cookie' : 'json';
    if(credentials.options?.auth_mode) authMode = credentials.options.auth_mode;

    //if we are not logged in - try to log in and tell that we are waiting
    srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.waiting});

    //create a new directus client if not created yet
    if(!srv.i) srv.i = createDirectus(srv.url)
      .with(authentication(authMode, { credentials: 'include' }))
      .with(rest({ credentials: 'include' }));

    //login depend on what we have (token is in priority, because don't need to refresh)
    //FIRST try with token:
    let authData:AuthenticationData|undefined;
    if (credentials.token) {
      try {
        await srv.i.setToken(credentials.token);
        //const res = await srv.i.getToken(); //console.log('token:', res);
        srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.yes});//srv.isLoggedIn = IsLoginStatus.yes;
      } catch (e) {
        console.error('login error1:', e);
        srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.not});//srv.isLoggedIn = IsLoginStatus.not;
      }
    //ELSE try with login/password:
    } else if (credentials.login && credentials.password) {
      //console.log('try login with $login, $password');
      try {
        authData = await srv.i.login({email:credentials.login, password:credentials.password});
        //console.log('login result:', res);
        srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.yes}); //srv.isLoggedIn = IsLoginStatus.yes;
      } catch (e) {
        console.error('login error2:', e, srv);
        srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.not}); //srv.isLoggedIn = IsLoginStatus.not;
      }
    //ELSE we can't login without token or login/password:
    } else {
      console.warn('no token or login/password is set for server:', srv.name);
      srv.broker.upsertServer(srv.name, {isLoggedIn:IsLoginStatus.error}); //srv.isLoggedIn = IsLoginStatus.error;
    }

    //read user object if its not saved yet
    if(!srv.user && srv.isLoggedIn>0) srv.user = await srv.i.request(readMe());
    if (authData && srv.user) {
      srv.user.__data = {authData};
      srv.user.token = authData.access_token;
    }

    //return status
    return srv.isLoggedIn;
  }

  /**
   * simple check just test for login status variable,
   * it's made from many api functions before working with server.
   *
   * @param recheck will try to ping server to check if we are still logged in
   * and then call login() if no connection
   */
  override async checkLogin(recheck=false): Promise<IsLoginStatus> {
    //without recheck we just return login status if all ok and login if not
    //but there could be times when we think we are logged in, but we are not
    if(!recheck) {
      if(this.srvInfo.isLoggedIn>0) return this.srvInfo.isLoggedIn;
      else return this.login();
    } else this.srvInfo.isLoggedIn=IsLoginStatus.ndef;//if recheck - reset login status

    //RECHECK:
    //we first try pinging the server
    let refreshRes:AuthenticationData|undefined;
    try {
      refreshRes = await this.srvInfo.i?.refresh();
      if(refreshRes) return this.srvInfo.isLoggedIn = IsLoginStatus.yes;
    } catch (e) {
      console.warn('TPSDB: login check refresh error, will relogin. ', e);
    }
    //if we are here, then refresh failed - try to login again
    return this.login();
  }

  async logout():Promise<IsLoginStatus> {
    this.lastErrorReset();
    if(this.srvInfo.i && this.srvInfo.isLoggedIn>IsLoginStatus.ndef) {
      this.updateSrv({isLoggedIn: IsLoginStatus.waiting});    //this.srvInfo.isLoggedIn = IsLoginStatus.waiting;
      try {
        await this.srvInfo.i.logout();
      } catch (e) {
        this.updateSrv({isLoggedIn: IsLoginStatus.waiting}).isLoggedIn;    //this.srvInfo.isLoggedIn = IsLoginStatus.error;
        if(this.errorsToConsole) console.error('logout error:', e);
        this.retErrorString(e); return this.srvInfo.isLoggedIn;
      }
      this.updateSrv({isLoggedIn: IsLoginStatus.not});    //this.srvInfo.isLoggedIn = IsLoginStatus.not;
    }
    return this.srvInfo.isLoggedIn;
  }

  //////////////////////////////////////////////////////////////////////////////
  // ENTITY QUERY FUNCTIONS


  async query(query?:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<T[]> {
    let res:T[] = []; this.lastErrorReset();

    //if we have a queryBuilder instance given - convert it to a directus query
    if(query instanceof DB_Query) query = query.for(DBtype.directus);

    //merge default query with given query
    query = {...this.defaultQuery, ...query} as I_DB_Query_Directus<T>;
    this.log(`query ${this.entityName}: `, DB_VerboseLevel.DEBUG, query);

    //try to load from cache
    if(this.cache && !query?.skipCache) {
      res = this.cacheQuery(query) ?? [];
      if(res !== undefined) return res;
    }

    //remove deep fields from a query (they are on another server, so it would be an error)
    //the original fields are stored in private _fullQueryFieldsArray
    if(query.fields && this.deepFields) {
      query.fields = this.removeConfiguredDeepFields(query.fields);
      if(this._fullQueryFieldsArray && query.fields.length!=this._fullQueryFieldsArray.length) this.log('query fields after deepFields removed:', DB_VerboseLevel.DEBUG, query.fields);
    } else this._fullQueryFieldsArray = undefined; //if no deep fields reset full query field array, because its used only for deep fields loading

    //else request from server
    const readItemsFunction = this.getReadItemsFunction();
    try {
      //try login, if not - wait maybe credentials still loading
      if(this.srvInfo.isLoggedIn<=0 && this.haveCredentials()) await this.login(); //before requesting items need to check that we are logged in
      if(this.srvInfo.isLoggedIn<0) { //maybe credentials still aren't loaded from config wait 2 sec and try again
        await new Promise(res=>setTimeout(res,2000)); await this.login();
      }
      //try to read item:
      res = await this.srvInfo.i?.request((readItemsFunction as any).call(this,query)) as unknown as T[];
    } catch (e) {
      const errStr = this.retErrorString(e);
      // Handle permission error and retry the operation if re-login is successful
      try {
        res = await this.handlePermissionError<T[]>(
          errStr, async () => await this.srvInfo.i?.request((readItemsFunction as any).call(this,query)) as unknown as T[]
        );
      } catch (e2) {
        res = [];
        this.log(`Query error after relogin attempt: ${e2}`, DB_VerboseLevel.ERROR);
      }

    }

    //base class standard post-process of query results
    if(res) await this._query_post_process(query, res);

    return res;
  }

  /**
   * because directus SDK handles system tables using different functions
   * we need to make this wrapper to fast get function that need to be called in query()
   * and other functions that try to read items
   *
   * maybe if there is only one place to use it, can be inlined there
   * @private
   */
  private getReadItemsFunction() {
    switch (this.entityName) {
      case 'directus_roles': return readRoles;
      case 'directus_files': return readFiles;
      default: return (query:I_DB_Query) => readItems<{ [key: string]: T },any,any>(this.entityName, query);
    }
  }


  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  async update(updates:Partial<T>, id?:DB_EntityID):Promise<T|string> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    this.lastErrorReset();

    //if we have id in updates, remote it from there
    const upd = {...updates};
    if(upd[this.idFieldName]) {
      id = upd[this.idFieldName] as DB_EntityID;
      delete upd[this.idFieldName];
    }
    if(!id) return this.retErrorString('No ID in updates given');

    //use updateItem() function from directus SDK to update item
    let res:T;
    try {
      res = await this.srvInfo.i?.request(updateItem(this.entityName, id, updates)) as unknown as T;
    } catch(e) {  return this.retErrorString(e);   }

    //base class standard post-process of query results
    if(res) await this._query_post_process( res[this.idFieldName] as any, [res] );
    //if(res && this.cache) this.cacheSet(res);//ALREADY UPDATED IN queue post process

    return res;
  }

  /**
   * Batch updates multiple entities.
   * !!fut: we also can use a query instead of ids to faster apply value to query
   * @param updates Partial object containing the updates.
   * @param ids Array of entity IDs to update.
   * @param skipPostProcess Skip post-process after updating entities.
   * @throws DB_Error if something went wrong and `throwErrors` is true.
   * @return Updated entities or error string.
   */
  async batchUpdate(updates: Partial<T>, ids: DB_EntityID[], skipPostProcess = false): Promise<T[] | string> {
    if (this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`, this.entityName, '', DB_ErrorLevel.WARNING));
    if(!ids) return this.retErrorString('No IDs given for batch update');
    if(ids.length==0) return []; //empty array - nothing to update
    this.lastErrorReset();

    let tArr: T[];
    try {
      tArr = await this.srvInfo.i?.request(updateItems(this.entityName, ids as string[], updates as Partial<UnpackList<T>>)) as unknown as T[];
    } catch (e) {
      return this.retErrorString(e);
    }

    // base class standard post-process of query results
    if (!skipPostProcess && tArr) for(const ent of tArr) await this._query_post_process(ent[this.idFieldName] as any, [ent]);

    return tArr??[];
  }

  //----------------------------------------------------------------------------

  async upsert(entityWithId:Partial<T>):Promise<T|string|undefined> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    let res:T|string|undefined; let wasUpdatedOK = false; this.lastErrorReset();

    //directus do not have upsert to we need to check if the entity exists and update or add
    const id = entityWithId[this.idFieldName] as DB_EntityID;
    if (id) try {
      res = await this.srvInfo.i?.request(updateItem(this.entityName, id, entityWithId)) as unknown as T;
      if(typeof res === 'object') wasUpdatedOK = true;
    } catch(e) {
      wasUpdatedOK = false;
      if(this.errorsToConsole) console.warn(`[tps/db upsert] update error ${this.entityName}:${id}, try add:`, e);
    }

    //if we have error - try to add
    if(!wasUpdatedOK) res = await this.add(entityWithId as T);
    if(typeof res === 'string') return res; //if error - return it

    //base class standard post-process of query results
    if(res) await this._query_post_process( res[this.idFieldName] as any, [res] );
    //if(res && this.cache) this.cacheSet(res);//ALREADY UPDATED IN queue post process

    return res;
  }

  //----------------------------------------------------------------------------

  async add<TEA extends T|T[]>(entityOrArray:TEA, skipPostProcess=false):Promise<TEA|string> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    let res:T | undefined; this.lastErrorReset();
    let tArr:T[]|undefined;

    if(!Array.isArray(entityOrArray)) {
      try {
        res = await this.srvInfo.i?.request(createItem(this.entityName, entityOrArray as any)) as any as T;
      } catch (e) {
        const errStr = this.retErrorString(e);

        // Handle permission error and retry the operation if relogin is successful
        try {
          res = await this.handlePermissionError<T>(
            errStr,
            async () => await this.srvInfo!.i!.request(createItem(this.entityName, entityOrArray as any)) as any as Promise<T>
          );
        } catch (e2) {
          return this.retErrorString(e2);
        }
      }
      if(res) tArr = [res];
    } else {
      try {
        tArr = await this.srvInfo.i?.request(createItems(this.entityName, entityOrArray)) as any as T[];
      } catch (e) {
        const errStr = this.retErrorString(e);

        // Handle permission error and retry the operation if relogin is successful
        try {
          tArr = await this.handlePermissionError<T[]>(
            errStr,
            async () => await this.srvInfo!.i!.request(createItems(this.entityName, entityOrArray)) as any as Promise<T[]>
          );
        } catch (e2) {
          return this.retErrorString(e2);
        }
      }
    }

    //base class standard post-process of query results
    if(!skipPostProcess && tArr && tArr.length) for( const ent of tArr) {
      //appy post process for each item id that we loaded
      await this._query_post_process( ent[this.idFieldName] as unknown as DB_EntityID, [ent as T] );
      //if(res && this.cache) this.cacheSet(res);//ALREADY UPDATED IN queue post process
    };

    //return result if res(single entity is set use it), else return array
    return (res ? res : tArr) as TEA;
  }

  //----------------------------------------------------------------------------

  async delete(id:DB_EntityID):Promise<boolean|string> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    this.lastErrorReset();

    //use deleteItem() function from directus SDK
    try {
      await this.srvInfo!.i!.request(deleteItem(this.entityName, id));
      if(this.cache) this.cacheDelete(id);
      return true;
    } catch (e) {
      return this.retErrorString(e);
    }
  }

  //----------------------------------------------------------------------------

  async deleteIds(ids: DB_EntityID[], limit = 10): Promise<boolean | string> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    if(ids.length>limit) return this.retErrorString(`Can't delete more than ${limit} items at once`);
    this.lastErrorReset();

    //use deleteItems() function from directus SDK
    try {
      await this.srvInfo!.i!.request(deleteItems(this.entityName, ids as any));
      if(this.cache) ids.forEach(id=>this.cacheDelete(id));
      return true;
    } catch (e) {
      return this.retErrorString(e);
    }
  }

  async batchDelete(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<boolean|string> {
    if(this.readonly) return this.retErrorString(new DB_Error(`[tps/db] ${this.entityName} is readonly`,this.entityName,'',DB_ErrorLevel.WARNING));
    if(!query.limit) return this.retErrorString('limit must be set in query for batch delete');
    this.lastErrorReset();

    //if we have a queryBuilder instance given - convert it to a directus query
    if(query instanceof DB_Query) query = query.for(DBtype.directus);
    this.log(`query ${this.entityName}: `, DB_VerboseLevel.DEBUG, query);

    //use deleteItems() function from directus SDK
    try {
      await this.srvInfo!.i!.request(deleteItems(this.entityName, query as any));
      //if(this.cache) ids.forEach(id=>this.cacheDelete(id)); //TODO: remove from cache by query (need cache query function)
      return true;
    } catch (e) {
      return this.retErrorString(e);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////
}
