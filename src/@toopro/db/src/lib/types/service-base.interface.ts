import { DB_EntityID, DB_VerboseLevel, EntityOrArray, IsLoginStatus } from './types.js';
import { DB_QueryBuilder, I_DB_Query } from './query.type.js';
import { DB_EntityBase } from './db-entity-base.js';
import { DB_Error } from './db.error.js';
import { DB_EntityService_Options } from './service-options.interface.js';

/**
 * Base interface for all DB Entity Services
 * @author Kyrylo Kuzmytskyy <slykirill@gmail.com>
 */
export interface I_DB_EntityServiceBase<T> extends DB_EntityService_Options {

  /**
   * do we need to throw errors or just return an error message like string,
   * consumer have to have different code to handle errors for diff cases
   *
   * @example
   * //if throw errors:
   * let res:IEntity;
   * try { service.add(entity) } catch(e) { ... }
   *
   * //if error strings returned:
   * const res = service.add(entity)
   * if(typeof res === 'string') { ... }
   *
   * @default false
   */
  throwErrors:boolean;

  /**
   * The last error that was happened in the service DB operations.
   *
   * @privateRemarks
   * you should __reset it (!)__ at the start of any functions that can throw errors,
   * because users in synchronous code can check it after the operation
   * `if(service.lastError) { ... }` or `if(service.hadError()) { ... }`
   *
   * Reset with this.lastErrorReset() protected function
   */
  lastError?:DB_Error;
  //protected lastErrorReset():void;

  /**
   * Check if there was an error in the last operation
   * shortcut to `lastError!==undefined`
   * @remarks careful with async code, because it can be changed by another operation
   * @return true if there was an error
   */
  hadError():boolean;

  /**
   * do we need to log errors to console
   * and start from what level
   * @default DB_VerboseLevel.ERROR
   */
  verboseLevel:DB_VerboseLevel;

  /**
   * do we need to log errors to console directly
   * from the service (not a good idea in production,
   * better errors be checked by the consumer to identify is it critical)
   *
   * @remarks
   * Proposal for new services to set this flag to true, to develop, debug.
   * And then after catching up all errors and working with them in the consumers,
   * turn off internal log to console errors, because they can too much
   * mess with the console.
   */
  errorsToConsole?:boolean;

  /**
   * entity name that is used in the server to get data
   */
  readonly entityName:string;

  /**
   * field name that is the PRIMARY KEY in db and should not be changed/updated.
   * Used in getById() and for cache enable.
   * most of the time it is 'id' or 'uuid', but you can use any field name in real life
   * @default 'id'
   */
  idFieldName:Extract<keyof T, string>|'id';

  /**
   * flag to fast tell the system that only read allowed
   * without making useless requests to server
   */
  readonly readonly:boolean;

  /**
   * default query that will be used in all requests if not set in the request
   * all other param will be merged with this one.
   * useful to set default limit, sort, etc
   */
  defaultQuery:I_DB_Query;

  // ENTITY FUNCTIONS

  /**
   * call function by name, if function not found - return undefined.
   * used in wrappers to fast map functions from host instance to this entity service
   * @param fName
   */
  getAll():Promise<T[]>,

  /**
   * @param id primary key of the entity (`idFieldName` used to search it)
   * @return found entity object or `null` (even if there were some error)
   *         so to check for error use `hadError()` and `lastError` prop
   * @see query
   */
  getById(id:DB_EntityID):Promise<T|null>,

  /**
   * @param ids array of primary keys of the entities (`idFieldName` used to search it)
   * @return array of found entities (even if there were some error empty array)
   *         so to check for error use `hadError()` and `lastError` prop
   * @see query
   */
  getByIds(ids:DB_EntityID[]):Promise<T[]>,
  getByField(field:Extract<keyof T, string>, value:string|number|null, fields?:Array<keyof T | string>, limit?:number):Promise<T[]>,

  /**
   * get one entity by field value
   * uses getByField() with limit=1 and cacheGetByField() to get the one entity
   * @param field name of the field to search on
   * @param value value of the field to search for
   * @param recheckCache true if we want to check cache again after getting null from cache (maybe first null was by error)
   * @param fields array of field names to load from the entity, load full entity if not set
   */
  getOneByField(field:Extract<keyof T, string>, value:string|number|null, recheckCache?:boolean, fields?:Array<keyof T | string>):Promise<T|null>,

  /**
   * get array of items that match all (AND) fields values
   * @param fields
   * @param limit default 1
   */
  getByFields(fields: Partial<T>, limit?:number): Promise<T[]>;

  /**
   * get one item that match all (AND) fields values
   * @param match fields values to match (all of them)
   * @param recheckCache true if we want to check cache again after getting null from cache (maybe first null was by error)
   * @param fields array of field names to load from the entity, load full entity if not set
   */
  getOneByFields(match: Partial<T>, recheckCache?:boolean, fields?:Array<keyof T | string>): Promise<T|null>;

  /**
   * Get value of one field (any first item that match all fields values will be used)
   * @param valueField name of the field to search on
   * @param fields values of the fields that should match (all of them)
   * @return value of the field (including undefined if entity found but has no value set in field)
   *   or null if not found
   * */
  getValueByFields<TF extends string|number>(valueField:Extract<keyof T, string>, fields: Partial<T>): Promise<TF|null|undefined>;

  /**
   * Used to fast get value of the field by entity id,
   * for example, get supplier by product id
   * TODO: !!fut need to use last used cache to quick get value without making request to server
   * @param field
   * @param id
   * @return value of the field (including undefined if entity found but has no value set in field)
   *   or null if not found
   */
  getFieldValById<TF extends string|number>(field:Extract<keyof T, string>, id:DB_EntityID):Promise<TF|null|undefined>,

  /**
   * get full item data
   * @param idOrItem can be item ID, or item itself,
   *    or the result of other query or field value of other entity.
   *    So, for example, you load parent entity and want to get child entity
   *    just by `childService.getRealItem(parent.child)`
   *    and you don't need to check if it is ID or item or null
   *
   * @example most of the times the code inside will be like:
   * ```TypeScript
   *    if(typeof idOrItem=== 'string'||typeof idOrItem==='number') return await this.getById(idOrItem);
   *    else if(idOrItem) return (idOrItem as unknown as T);
   *    else return null;
   * ```
   */
  getRealItem(idOrItem:DB_EntityID|T|null|undefined):Promise<T|null>,

  /**
   * get an array of mixed items as data and items as string IDs and
   * @return array of items as Interfaces loaded with data from server
   *
   * @example most of the times the code inside will be like:
   * ```TypeScript
   *    const res = await Promise.all(items.map(async item => await this.getRealItem(item)));
   *    return res.filter(item => item!==null) as T[];
   * ```
   */
  normalizeItems(items:(DB_EntityID|T|null|undefined)[]):Promise<T[]>,

  /**
   * we use wrapper to make all requests to db through that function,
   * then this is the main point of the data pre-post process and cache
   * so you can override this function to change the way of getting entities
   *
   * @param query could be
   *    - {} **object** with query data or
   *    - instance of **query builder**
   *
   * @privateRemarks __In your implementation:__
   *   - `query` param MUST use `defaultQuery` as a base default data
   *     and merge it with a given query param
   *   - remember to build a query for your type of db
   *   - you should use `this.lastErrorReset()` at the start of the function to reset last error
   *   - remember to check cache (if enabled) before making request to server
   *   - you should check a query for nested entities with `this.checkNestedEntities(fields)`
   *   - you should apply `postLoadModifier` to the result of the query
   *   - you should save results to cache (if enabled)
   *
   * @return array of items.
   *    It's ALWAYS an array, even if some error happened (check for it in `this.hadError()`)
   *
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   *
   * @return array of found entities (even if there were some error empty array)
   *         so to check for error use `hadError()` and `lastError` prop
   */
  query(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<T[]>,

  /**
   * wrapper to fast get one entity by query() function
   * needed to make additional checks and return only one entity
   * @param query
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   * @return found entity object or `null` (even if there were some error)
   *         so to check for error use `hadError()` and `lastError` prop
   */
  queryOne(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<T|null>,

  /**
   * Add one or multiple entities.
   * @param entityOrArray A single entity or an array of entities to add.
   * @param skipPostProcess Skip post process after adding entities. When you don't care about results (saving to cache, casting values, deep loaders, etc).
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   * @return `T|T[]|string` Added entity/entities or error string.
   */
  add<TEA extends T|T[]>(entityOrArray:TEA, skipPostProcess:boolean):Promise<TEA|string>,

  /**
   * update one item by ID
   * @param updates hash of changed values only that need to be saved,
   *    you also can pass id of the item (it will be used as key to know which item to update)
   * @param id could be passed as second param or as part of updates hash
   * @return updated item or error string
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  update(updates:Partial<T>, id?:DB_EntityID):Promise<T|string>,

  /**
   * add or update item by ID
   * @param entityWithId
   * @return updated item or error string
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  upsert(entityWithId:Partial<T>):Promise<T|string|undefined>,

  /**
   * Update ALL entities with `ids` with the SAME data from `updates` object.
   * Use SDK/adaptor function that allow to run this code faster to update many items fast.
   *
   * !!fut: we also can use query instead of ids to faster apply value to query
   *
   * @param updates field=value hash of values that have to be written to all entities from `ids` array.
   * @param ids array of entity IDs that will have updates applied (same values for all entities in this list)
   * @param skipPostProcess Skip post process after adding entities. When you don't care about results (saving to cache, casting values, deep loaders, etc).
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  batchUpdate(updates: Partial<T>, ids: DB_EntityID[], skipPostProcess?: boolean): Promise<T[] | string>;

  /**
   * delete one item by ID
   * @param id
   * @return true if item was deleted and error string if cant delete
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  delete(id:DB_EntityID):Promise<boolean|string>,

  /**
   * delete items by IDs
   * @param ids array of IDs to delete
   * @param limit max number of items to delete
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  deleteIds(ids:DB_EntityID[], limit?:number):Promise<boolean|string>,

  /**
   * Delete items by query builder. Be careful with this function,
   * because it can delete all items from the table.
   * @param query for example `owner=123` or `age>18` to delete all items that match this query
   * @throws DB_Error if something went wrong and ✓`throwErrors`
   */
  batchDelete(query:I_DB_Query<T>|DB_QueryBuilder<T>):Promise<boolean|string>,

  //TODO: loadByParts
  //TODO: load

  // SERVER IMPLEMENTATION FUNCTIONS

  login():Promise<IsLoginStatus>,

  logout():Promise<IsLoginStatus>,

  haveCredentials():boolean,

  /**
   * force request to server to check current login status
   * sometimes we think that we are logged in, but the server
   * has ended the session, so we need could need to refresh
   * */
  checkLogin():Promise<IsLoginStatus>,

}
