import { DB_Credentials, DB_EntityID, DB_ServerInfo, DB_VerboseLevel, IsLoginStatus } from './types/types.js';
import { DB_FieldFilterOperator, DB_FieldPath, DB_Query, DB_QueryBuilder, dbqb, I_DB_Query } from './types/query.type.js';
import { CacheBaseService } from './cache-base.service.js';
import { DB_BrokerService } from './broker.service.js';
import { I_DB_EntityServiceBase } from './types/service-base.interface.js';
import { DB_Error, DB_Error_Directus, DB_ErrorLevel } from './types/db.error.js';
import { DB_EntityService_Options } from './types/service-options.interface.js';
import { TpsCaster, TpsCasterOptions } from '@toopro/utils';

/**
 * Base class for all DB types/adaptors/SDKs, contain all common functions for all services.
 * For example, query functions which will just prepare DB_Query object and call the query() function,
 * and the actual `query()` then will be implemented in the child class specific for the DB adaptor.
 *
 * Work with queries, errors, cache, server info, etc. is handled in base,
 * trying to minimize the code in the child classes, that should just
 * implement DB adaptor specific functions.
 *
 * @extends CacheBaseService the main simple CacheBaseService with additional query functions
 * that is needed for the DB_EntityServiceBase
 *
 * @remarks
 * you __SHOULD__ use `this.etErrorString()` function to return error messages,
 * because it checks flags to log errors and a way a client waits for
 * errors: ret string or throw exception.
 * @see retErrorString
 * @throws DB_Error if throwErrors is true
 *
 * @author Kyrylo Kuzmytskyy <slykirill@gmail.com>
 */
export abstract class DB_EntityService_Base<T extends Record<string, any>> extends CacheBaseService<T> implements I_DB_EntityServiceBase<T>{

  readonly readonly:boolean = false;
  throwErrors = false;
  verboseLevel = DB_VerboseLevel.WARN;
  public readonly entityName:string;
  deepFields?: Partial<Record<DB_FieldPath<T,1>, string>>;
  casterOpts?: Partial<TpsCasterOptions>;

  /**
   * used to check login (after big delay of last request),
   * also to know should we return last requested item or make new request
   * */
  protected lastRequestTime?:Date;

  /**
   * if true - log errors to console directly from the service,
   * else they are returned as string in functions and stored in `lastError`
   * */
  errorsToConsole = true;

  /**
   * Use this to modify the entity after loading from directus
   */
  postLoadModifier?: (entity:T) => T;
  /**
   * before sending requests to remote server we pass arguments to this function
   * to modify them before sending
   */
  preLoadModifier?: (fName:string, ...args:any[]) => any[];

  defaultQuery:I_DB_Query = {};

  idFieldName:Extract<keyof T, string>;


  //server info used for this entity (url, credentials, etc)
  protected readonly srvInfo:DB_ServerInfo<any>;

  //////////////////////////////////////////////////////////////////////////////
  // BASE FUNCTIONS
  // we will make this class as base class for all entity services
  // so add functions that will be used in all entity services

  /**
   *
   * @param entityName will be used to get needed server from the broker,
   *      and log in to it if credentials already provided.
   *      If both servers have the **same entity names**, may use
   *      server prefix like `core:user_action`
   * @param dbBroker
   * @param options
   * @throws DB_Error if server for entity not found
   * @protected
   * @example
   * new DB_EntityService_Base('core:user_action', dbBroker);
   */
  protected constructor(entityName:string, dbBroker:DB_BrokerService, options?:DB_EntityService_Options) {
    super();                  //init base cache class
    this.idFieldName = 'id' as Extract<keyof T, string>;  //default id field name
    this.entityName = (entityName.indexOf(':')>0) ? entityName.split(':')[1] : entityName; //remove prefix from the entity name

    //get the needed server from the broker (by entity name)
    const srv = dbBroker.getServerByEntity(entityName, this);
    if(!srv) this.retErrorString(new DB_Error(`Server for ${entityName} NOT found. Check that you init server config with this entity name in list.`,this.entityName,'',DB_ErrorLevel.CRITICAL), true);
    this.srvInfo = srv!;

    //options apply (@see DB_EntityService_Options)
    Object.assign(this, options);
    if(this.casterOpts) this.casterOpts.rewriteFields = true; //always rewrite fields in caster for entity services
    this.log(`DB_Service created for ${this.entityName} using args (${entityName}) with server ${srv!.name}`, DB_VerboseLevel.DEBUG, this);

    //login if needed (this async arrow function is needed to use await in constructor)
    if(this.haveCredentials() && srv!.isLoggedIn<IsLoginStatus.ndef)  (async () => {
      this.log(`DB_Service login to ${srv!.name} with ${srv!.login}`, DB_VerboseLevel.DEBUG);
      this.login().catch(e=>console.error('login error:',e));
    })();
  }

  /**
   * shortcut to update server info in broker (needed for broker to notify all
   * subscribers about server changes), so you DO NOT modify server info by yourself,
   * only with this function.
   *
   * @protected
   * @param changesOrField
   * @param val
   *
   * @example
   * this.updateSrv('name', 'new name');
   * this.updateSrv({name:'new name'});
   */
  protected updateSrv(changesOrField:Partial<DB_ServerInfo>|Extract<keyof T, string>, val?:never) {
    const changes:Partial<DB_ServerInfo> = typeof changesOrField === 'string' ? { [changesOrField]: val } : changesOrField;
    return this.srvInfo.broker.upsertServer(this.srvInfo.name, changes);
  }

  /**
   * call a function by name if function not found - return undefined.
   * used in wrappers to fast map functions from the host instance to this entity service
   * @param fName
   * @param args
   * @return data that function returns or undefined if function not found
   */
  public async callFunction(fName:string, ...args:any[]):Promise<any> {
    const func = (this as any)[`${fName}`] as ((...args:any[])=>any)|undefined;
    if(typeof func !== 'function') return undefined;
    else return await func.apply(this, args);
  }

  /**
   * this function will call the self::loginToServer() function that is overloaded in the implementation
   * broker will call loginToServer() directly and in other functions of the
   * class implementation we will call this.login() function
   *
   * this is made because one server is wokring with many entity services,
   * so broker should be able to login without knowing the entity service
   * and entity service should be able to login fast before any request
   * @param toServer if not set - the owner server of this service will be used
   * @param credentials if not set the credentials from server info will be used
   */
  async login(toServer?:DB_ServerInfo, credentials?:DB_Credentials):Promise<IsLoginStatus> {
    const srv = (toServer as DB_ServerInfo)??this.srvInfo;
    return await (this.constructor as typeof DB_EntityService_Base).loginToServer(srv,credentials);
  }

  /**
   * you should implement this function in the entity service implementation
   * @param toServer is not
   * @param credentials
   */
  static async loginToServer(toServer:DB_ServerInfo, credentials?:DB_Credentials):Promise<IsLoginStatus> {
    throw new DB_Error('Method login not implemented.'+toServer+' with '+(credentials?.login ?? ''));
  }

  haveCredentials():boolean {
    return !!(this.srvInfo && this.srvInfo.url &&
      (this.srvInfo.token || (this.srvInfo.login && this.srvInfo.password)));
  }

  /**
   * simple check just test for login status variable,
   * it's made from many api functions before working with the server.
   *
   * @param recheck will try to ping server to check if we are still logged in
   * and then call login() if no connection
   */
  async checkLogin(recheck=false) {
    //for base class we just log in again, but for your implementation
    //you better check the token or session is still valid
    if(!recheck) if(this.srvInfo.isLoggedIn <= 0) return this.login(); else return this.srvInfo.isLoggedIn;

    //ELSE recheck: try to ping the server to check if we are still logged in
    //throw new Error ('Method checkLogin not implemented.');
    this.srvInfo.isLoggedIn = IsLoginStatus.ndef;
    return this.login();
  }

  //async logout():Promise<IsLoginStatus> {
  //  throw new Error ('Method logout not implemented.');
  //}

  //////////////////////////////////////////////////////////////////////////////
  // LOGS AND ERROR HANDLING

  // --- ERROR HANDLING ---
  // store last error object
  lastError?:DB_Error;
  hadError(): boolean { return this.lastError !== undefined; }
  protected lastErrorReset():void { this.lastError = undefined; }

  /**
   * return error string or throw exception if throwErrors is true
   *
   * @param errorObject any error object that SDK/adaptor returns will be parsed
   *    to our DB_Error object and returned here.
   * @param forceThrow set true if you need to throw error even if throwErrors in service is false
   *    _(we could need this in constructor, to say a DI system that
   *      this service can't be created and don't need to be injected)_
   *
   * @protected
   * @throws DB_Error if throwErrors is true
   *
   * @return error string from lastError object
   */
  protected retErrorString(
    errorObject:string | DB_Error_Directus | Error | DB_Error | any,
    forceThrow = false
  ):string {
    this.lastError = new DB_Error(errorObject);
    if(this.errorsToConsole) this.log('ERR_DB:', DB_VerboseLevel.ERROR, errorObject);
    if(this.throwErrors || forceThrow) throw this.lastError;
    const retStr = this.lastError.toString();

    //special processing of errors
    if(retStr.indexOf('oken expired')>0 || retStr.indexOf('permission')>0) {
      this.log('ERR_DB2: relogin with error:' + retStr, DB_VerboseLevel.WARN);
      this.checkLogin(true).then(); //try to relogin
    }

    return retStr;
  }

  /**
   * log error message only if verbose level is high enough
   * also log in console with correct level function
   * @param message
   * @param level
   * @param object if need to outbut some object to console
   * @protected
   */
  protected log(message: string, level: DB_VerboseLevel, object?:any) {
    if (level <= this.verboseLevel) switch (level) {
      case DB_VerboseLevel.ERROR:   console.error(message, object);      break;
      case DB_VerboseLevel.WARN:    console.warn(message, object);       break;
      case DB_VerboseLevel.INFO:    console.info(message, object);       break;
      case DB_VerboseLevel.DEBUG:   console.debug(message, object);      break;
      default:                      console.log(message, object);        break;
    }
  }


  //////////////////////////////////////////////////////////////////////////////
  // CACHE QUERY FUNCTIONS

  //overload the cacheEnable function to set the idFieldName from the entity service implementation
  public override cacheEnable(indexBy: Extract<keyof T, string>[] = [], idPropName = 'id', maxItems = 100, computedIndexBy?: string[]) {
    super.cacheEnable(indexBy, idPropName, maxItems, computedIndexBy);
  }

  /**
   * in some cases we can get data from cache without request to server
   * even on query with filters (id, and fields if we have index for them)
   * @param query
   */
  public cacheQuery(query:I_DB_Query):T[]|null|undefined {

    //if we have ID filter in a query
    if(query?.filter && (query.filter as any)[this.idFieldName as string]) {
      const idFilter = (query.filter as any)[this.idFieldName as string];      //get the ID filter to fast access
      //for _eq single ID
      if(typeof idFilter === 'object' && idFilter._eq) {
        const cached = this.cacheGet(idFilter._eq);
        if(cached) return [cached as T];
        else return undefined;
      }

      //for _in array of IDs
      if(typeof idFilter === 'object' && idFilter._in && Array.isArray(idFilter._in)) {
        const retArr:T[] = [];
        for(const id of idFilter._in) {
          const item = this.cacheGet(id);
          if(item) retArr.push(item); else return undefined;//if we have at least one item not in cache - return undefined
        }
        return retArr;
      }
    }

    //if we have query.filter field that is in cache indexBy - use cacheGetByField
    if(query?.filter) {
      for(const field in query.filter as any) {
        if(this.cacheIndex.has(field as Extract<keyof T, string>)) {
          const fieldFilter:DB_FieldFilterOperator = (query.filter as any)[field];
          if(typeof fieldFilter !== 'object' || typeof fieldFilter._eq !== 'number' && typeof fieldFilter._eq !== 'string') continue;
          const item = this.cacheGetByField(field as Extract<keyof T, string>, fieldFilter._eq);
          if(item) return [item]; else return undefined;
        }
      }
    }

    return undefined;
  }

  /**
   * store the query result in cache (process query fields and filters to store in needed way)
   * for example save nulls in cache to avoid multiple requests for the same entity IDs
   * @param query
   * @param result
   * @protected
   */
  protected cacheSetQueryResult(query:I_DB_Query, result:T[]):void {
    //cycle existing items and store them in cache
    result.forEach(item => this.cacheSet(item));

    //ID FILTER: process empty results for entity ID requests (set nulls in cache)
    if(query?.filter && (query.filter as any)[this.idFieldName as string]) {    //if we have ID filter in query
      const idFilter = (query.filter as any)[this.idFieldName as string];      //get the ID filter to fast access
      //for _eq single ID
      if(typeof idFilter === 'object' && idFilter._eq) {
        this.cacheSetNullItem(idFilter._eq);
      }
      //for _in array of IDs
      if(typeof idFilter === 'object' && idFilter._in && Array.isArray(idFilter._in)) {
        idFilter._in.forEach((id:DB_EntityID) => this.cacheSetNullItem(id));
      }
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // SERVICE FUNCTIONS IMPLEMENTATIONS
  // some functions have same code for all DB adaptors/SDKs,
  // so we could implement it once here

  async getAll():Promise<T[]> {
    const res = await this.query();
    return res ? res as unknown as T[] : [];
  }

  async getById(id:DB_EntityID):Promise<T|null> {
    const q = dbqb<T>().equal(this.idFieldName, id);
    return await this.queryOne(q);
  }

  async getByField(field: Extract<keyof T, string>, value: string | number | null, fields?: Array<Extract<keyof T, string> | string>, limit?: number): Promise<T[]> {
    const qb = dbqb<T>();
    if (value === null) qb.isNull(field as Extract<keyof T, string>);
    else qb.equal(field, value).fields(fields).limit(limit);
    return await this.query(qb);
  }

  async getOneByField(field: Extract<keyof T, string>, value: string | number | null, recheckCache?: boolean, fields?: Array<Extract<keyof T, string> | string>): Promise<T|null> {
    const qb = dbqb<T>().skipCache(recheckCache);
    if (value === null) qb.isNull(field as Extract<keyof T, string>);
    else qb.equal(field, value).fields(fields);
    return await this.queryOne(qb);
  }

  async getByFields(fields: Partial<T>, limit = 1): Promise<T[]> {
    const q = dbqb<T>().limit(limit);
    for(const field in fields) q.equal(field, (fields as any)[field]);
    return await this.query(q);
  }

  async getOneByFields(match: Partial<T>, recheckCache?: boolean, fields?: Array<Extract<keyof T, string> | string>): Promise<T|null> {
    const res = await this.getByFields(match, 1);
    return res.length>0 ? res[0] : null;
  }

  async getValueByFields<TF extends string|number>(valueField: Extract<keyof T, string>, fields: Partial<T>): Promise<TF|null|undefined> {
    const res = await this.getOneByFields(fields, false, [valueField]);
    return res ? res[valueField] as TF|null|undefined : null;
  }

  async getFieldValById<TF extends string|number>(field: Extract<keyof T, string>, id: DB_EntityID): Promise<TF|null|undefined> {
    const q = dbqb<T>().equal(this.idFieldName, id).fields([field]);
    const res = await this.queryOne(q);
    return res ? res[field] as TF|null|undefined : null;
  }

  async getByIds(ids: DB_EntityID[], fields?:Array< Extract<keyof T,string> | string >): Promise<T[]> {
    const q = dbqb<T>().in(this.idFieldName, ids).limit(ids.length);
    if(fields) q.fields(fields);
    return await this.query(q);
  }

  async queryOne(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<T|null> {
    if(query instanceof DB_Query) query.limit(1); else query.limit = 1;
    const res = await this.query(query);
    if(res.length>0) return res[0];
    else return null;
  }

  // -- DB-specific functions --
  // that we can't implement here, but child classes should implement
  abstract query(query?:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<T[]>;
  abstract add<TEA extends T|T[]>(entityOrArray:TEA,skipPostProcess:boolean):Promise<TEA|string>;
  abstract delete(id: DB_EntityID): Promise<boolean | string>;
  abstract deleteIds(ids: DB_EntityID[], limit?: number): Promise<boolean | string>;
  abstract batchDelete(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<boolean|string>;
  abstract logout(): Promise<IsLoginStatus>;
  abstract update(updates: Partial<T>, id?: DB_EntityID): Promise<string | T>;
  abstract upsert(entityWithId: Partial<T>): Promise<string | T >;
  abstract batchUpdate(updates: Partial<T>, ids: DB_EntityID[], skipPostProcess?: boolean): Promise<T[] | string>;

  /**
   * Must be called in each implementation in query() function
   * when all data is loaded.
   * __Handles:__
   *  - ask to load deep entities (if deepFields set)
   *  - cast types (if casterOpts set)
   *  - cache query results
   *  - post process query results (like postLoadModifier)
   *
   * _This code same for all implementations, so we put it here_
   * @param query - query object that was used to get the data (or just ID if it was getById)
   * @param res - array of entities that is associated with this query/id given
   * @protected
   */
  protected async _query_post_process(query:I_DB_Query<T>|DB_EntityID, res:T[]) {

    //cache saves each item to index even if no items were loaded (even if NO items it will set nulls to ids)
    //need to store results (nulls) to cache to not ask server again
    if(typeof query !== 'object') query = dbqb<T>().equal(this.idFieldName, query).q;
    if(this.cache) this.cacheSetQueryResult(query, res);

    //save last request time
    this.lastRequestTime = new Date();

    //next processing is only for found items, so exit if no items
    if(res.length===0) return;

    //if we have a request for nested items that are in deepFields - load them
    if(this.deepFields) await this.loadDeepEntities(res, this._fullQueryFieldsArray);

    //apply caster if set
    if(this.casterOpts) {
      res=res.map(ent=>TpsCaster.cast<T>(ent,this.casterOpts));
      this.log(`${this.entityName}: Caster applied to ${res.length} items`, DB_VerboseLevel.TRACE, this.casterOpts);
    }

    //apply postLoadModifier if set
    if(this.postLoadModifier) res.map(this.postLoadModifier);
  }


  //////////////////////////////////////////////////////////////////////////////
  // HELPER FUNCTIONS

  /**
   * get the real item from the server or just return same if it's already an item
   * used to fast and clean in code access items by ID or by item itself
   * @param idOrItem
   */
  async getRealItem(idOrItem: DB_EntityID | T | null | undefined): Promise<T | null> {
    if(typeof idOrItem === 'string' || typeof idOrItem === 'number') return this.getById(idOrItem);
    else if(idOrItem) return idOrItem as T;
    else return null;
  }

  /**
   * get an array of mixed items as data and items as string IDs, and
   * it will remove NULLs and UNDEFINEDs from the array
   * @return array of items as Interfaces loaded with data from server
   */
  async normalizeItems(items: (DB_EntityID | T | null | undefined)[]): Promise<T[]> {
    const res = await Promise.all(items.map(async item => await this.getRealItem(item)).filter(item => item!==null));
    return res.filter(item => item!==null) as T[];
  }


  //////////////////////////////////////////////////////////////////////////////
  // DEEP ENTITIES

  /**
   * find in fields array the ones with the "." (dot) that means nested entities,
   * then checks do we have deepFields record for this field.
   *
   * If we have one - that's an indicator tells service needs manually made requests to
   * get those entities (using service for that nested entity from the broker).
   *
   * This is needed when a nested entity is located on another server and a simple
   * join query will not work.
   *
   * @param fields
   *
   * @deprecated we will force loading of ANY deepField from deepFields record,
   * so don't need to look for dot fields in query.fields.
   */
  protected checkForNestedEntities(fields:DB_FieldPath<T,1>[]|string[]):DB_FieldPath<T,2>[] {
    if(!this.deepFields || !fields || !fields.length) return [];
    const ret = fields
      //only fields with dot that are in deepFields
      .filter(field =>
        field.indexOf('.')>0 && (this.deepFields && (field.split('.')[0] in this.deepFields))
      )//use only the first part of the field name (before the dot)
      .map(field => field.split('.')[0]) as DB_FieldPath<T,2>[];

    //and only unique fields
    return Array.from(new Set(ret)) as DB_FieldPath<T,2>[];
  }

  /**
   * similar to checkForNestedEntities, but remove fields that are in deepFields
   * (remove fields with dot the first part of which is in deepFields)
   * and ADD simple fields (without dot) that are in deepFields
   * @param fromFields
   * @protected
   * @example
   * this.deepFields = {nested: 'nested_entity'};
   * res = removeConfiguredDeepFields(['nested.id','nested.field','field','id'])
   * //res: ['nested','field','id']
   */
  protected removeConfiguredDeepFields(fromFields:string[]) {
    if(!this.deepFields) return fromFields;
    this._fullQueryFieldsArray = fromFields;    //store for later use

    const foundDeepFields = new Set<string>();  //save only found deep fields
    const ret = fromFields.filter(f => {
      const field = f.split('.')[0];
      if(f.indexOf('.')>0 &&                //if field has dot
         (this.deepFields && (field in this.deepFields))) {            //and is in deepFields (remote entity server)
         foundDeepFields.add(field);return false;//save it for future and skip
      }  else return true;                       //simple fields
    });
    //add deep fields without dots (to load ids from the main entity table)
    if(foundDeepFields.size>0) ret.push(...foundDeepFields);
    return ret;
  }
  //stored temporary when nested fields removed from query.fields (used to load queued deep fields after they were removed from query)
  protected _fullQueryFieldsArray:string[]|undefined;

  /**
   * load deep entities for given entity only for given fields.
   * the entity types for given fields are taken from the deepFields record.
   *
   * for each field the service for that entity is taken from the broker,
   * and the request is made to get the entities by IDs.
   *
   * @param forEntities array if full entity objects
   *    with fields that have nested entities
   *    populated with id(string,number) or array of ids that will be used and
   *    replaced with the entities loaded from the server.
   * @param queryFields query.fields array that will be checked for nested entities
   * @see checkForNestedEntities
   * @protected
   */
  protected async loadDeepEntities(forEntities:T[], queryFields?:DB_FieldPath<T,2>[]|string[]):Promise<T[]> {
    if(!this.deepFields) return forEntities;  //if no deep fields - return as is
    if(!Array.isArray(forEntities)) forEntities = [forEntities];

    //if no field array given - use all props from the entity
    if(!queryFields) queryFields = Object.keys(forEntities[0] as any) as string[];

    //get only 'dot' fields that are in deepFields
    //const forFields = this.checkForNestedEntities(queryFields);

    //get a list of field names that we will be forced to load externally
    //if field name found in deepFields (field with dot - then only the first part)
    let forFields = queryFields
      //remove dots from fields (use only top-level field names)
      .map((f: string) => (f.indexOf('.')>0  ?  f.split('.')[0]  :  f) as string)
      //left only fields that are in deepFields (forced to load)
      .filter(f => this.deepFields && f in this.deepFields);
    forFields = Array.from(new Set(forFields)); //unique fields
    if(!forFields.length) return forEntities;
    this.log(`DB Srvc '${this.entityName}': loading deep fields:`, DB_VerboseLevel.TRACE, forFields);

    //cycle each entity each deep field
    for(const entity of forEntities) {
      for(const field of forFields) {
        //get only deep fields for the current field ([nested.id, nested.fld] will be only [id,fld])
        const fields = queryFields.filter(f => f.split('.')[0] === field).map(f => f.split('.')[1]);
        const entityType = (this.deepFields as any)[field] as string;
        const val = (entity as any)[field as string];
        const ids = Array.isArray(val) ? val : [val]; //there somehow could be objects already
        const fieldEntities = await this._loadDeepField(entityType, ids, fields);
        if(!fieldEntities) {      //skip if no entities found
          if(ids.length>0) this.log(`Deep field '${field}' NOT found for entity '${this.entityName}' with IDs:`, DB_VerboseLevel.WARN, ids);
          continue;
        }
        (entity as any)[field as string] = Array.isArray(val) ? fieldEntities : fieldEntities[0];
      }
    }
    return forEntities;
  }
  private async _loadDeepField(entityType:string, ids:DB_EntityID[], fields?:string[]) {
    this.log(`DB Srvc '${this.entityName}': loading deep '${entityType}' with IDs:`, DB_VerboseLevel.DEBUG, ids);
    const srvc = this.srvInfo.broker.getServiceByEntity(entityType);
    if(!srvc) {this.retErrorString(new DB_Error(`Service for ${entityType} NOT found for deep loading entity.`,'',DB_ErrorLevel.ERROR)); return null; }
    if(srvc.srvInfo.name === this.srvInfo.name) this.log(`DB Srvc '${this.entityName}': deep field ${entityType} is on the same server, better switch to normal query.`, DB_VerboseLevel.WARN, this.srvInfo.name);

    //sometimes we could have objects already in `ids` array
    //(when one instance of the DB have mock entity type without full info)
    //so we need to convert it back to array of IDs
    let realIds:DB_EntityID[];
    try {
      realIds = ids.map(id => {
        if(typeof id === 'object' && id) {
          if(id[this.idFieldName]) return id[this.idFieldName];
          else throw 'no id in the object';
        } else return id;
      });
    } catch(e) {
      this.log(`DB Srvc '${this.entityName}': deep field ${entityType} has wrong IDs: `, DB_VerboseLevel.ERROR, ids);
      return null;
    }
    return await srvc.getByIds(realIds, fields);
  }


}
