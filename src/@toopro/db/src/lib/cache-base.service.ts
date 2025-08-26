import { DB_EntityID } from './types/types.js';

/**
 * This is a base class for all services that are using cache.
 * when some request is made, you can store the result in cache...
 * the NULL results need to be stored in cache too,
 * to avoid multiple requests for the same entity
 * that we know that it doesn't exist.
 *
 * extend this class with your DB connection implementation and use
 * its cache function in your implementation
 * @see DB_EntityService_WithCache
 */
export abstract class CacheBaseService<T> {

  /**
   * if true - the cache will be used
   * if false - the cache will be ignored
   * @protected
   */
  protected cache = false;


  /**
   * the field name of the entity that is used as the cache key
   * most of the time, its primary id of the collection (id/uuid)
   * will be set on cache-enabling function
   * @protected
   */
  protected cacheIDField!:Extract<keyof T, string>;


  /**
   * Index (map) of the item IDs by the field value
   * we can have more indexes for other fields that are in cacheIndexedBy array.
   * the main entities are stored in cacheItems that is indexed by cacheIDField
   *
   * for each indexBy field we have hash of values for that field
   * and for each value - there is entity id that have that value
   *
   * indexBy field could complex field like 'module+name' or 'nid+placeId'
   * if we need to index by two fields combined value
   *
   * @example cacheIndex = new Map({
   *   'did': { 8: 1, 9: 2, 10: 3, ... },
   *   'module+name': { 'module1-name1': 1, 'module2-name2': 2, ... },
   * });
   *
   * @protected
   */
  protected cacheIndex:Map<
    Extract<keyof T, string>,
    { [fieldValue:string|number]: DB_EntityID|null }
  > = new Map();

  /**
   * field names that we index by value,
   * when some entity is loaded and it has this field in it,
   * it will be saved it separate field index, so you can fast
   * find it by this field value
   * @private
   */
  private get cacheIndexKeys() {
    return Array.from(this.cacheIndex.keys());
  }

  /**
   * all items that are stored in cache indexed by cacheIDField
   */
  private cachedItems:Map<DB_EntityID, T|null> = new Map();

  /**
   * how many items allowed to store in cache?
   * if we have more items, then we will delete some items from cache
   * */
  protected cacheMaxItems = 200;

  /**
   * how often we need to recheck cache for max items limit
   */
  private cacheRecheckTimeout = 1000*60*5; //5 minutes

  //this is a special cache for getById method for the last loaded item (to avoid double requests in chains)
  private cacheLastLoadedItem:T|null = null;
  private cacheLastLoadedItemID:DB_EntityID|null = null;

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /**
   * use to manually config cache, mostly for indexBy field
   * @param idPropName
   * @param indexBy create additional index in cache to fast find items by field value
   *    ВНИМАНИЕ! Индекс хранит только один элемент по полю, если будет несколько - они перезаписываются
   * @param maxItems how many items allowed to store in cache? other will be auto-removed
   * @param computedIndexBy -  когда нужно индексировать по вычисляемому полю, например, module+name,
   *    то есть в пределах каждого модуля есть уникальные имена, но в разных модулях могут быть одинаковые имена
   *    смотрит когда фильтруется по двум полям есть ли они в списке cacheIndexedBy TODO: нужно будет потом реализовать
   * @example
   *  cacheEnable(['did']); //to then fast find place by did
   *  const place = await this.placeService.getByOneField('did', 8);
   */
  public cacheEnable(indexBy:Extract<keyof T, string>[]=[], idPropName='id', maxItems = 100, computedIndexBy?:string[]) {
    this.cache = true;
    this.cacheIDField = idPropName as Extract<keyof T, string>; //be sure to have it in T entity!
    this.cacheMaxItems = maxItems;
    indexBy.forEach(indexName => this.cacheIndex.set(indexName, {}));
  }

  /**
   * save item in cache
   * @param item saved current value, so if you change it somewhere else
   *     if will be changed here too. be careful!
   * @param addToIndexBy if we need to add this item to index by some field
   *     if we don't have an index for this field yet - it will be created!
   *     WARNING!! from that moment that field will index all new items too
   */
  public cacheSet(item:T, addToIndexBy?:Extract<keyof T, string>) {
    if(!this.cache) return;
    if(this.cachedItems.size>this.cacheMaxItems) this.cacheMaintenance(); //try clear cache if we have too many items
    const saveItemId = item[this.cacheIDField] as DB_EntityID;

    //save last saved item to then fast return it by getById
    this.cacheLastLoadedItemID = saveItemId;
    this.cacheLastLoadedItem = item;

    //if we have this item in cache - remove it from all indexes because values could be changed and we need to reindex it
    if(this.cachedItems.has(saveItemId)) this.cacheDelete(saveItemId);

    //save item in cache
    this.cachedItems.set(saveItemId, item);

    //add item to existing indexesBy
    if(this.cacheIndex.size>0) for(const indexByField of this.cacheIndex.keys()) {
      //if we asked to add the current field to index, and it's already there - unset addToIndexBy
      if(indexByField===addToIndexBy) addToIndexBy = undefined;

      //skip if there is no such field in the item because we can't use value to index it
      const value = item[indexByField] as string|number|undefined|null;
      if(value===undefined || value===null) continue;

      //save item id in index by field value
      this.cacheSaveIndexByField(indexByField, value, saveItemId);
    }

    //add additional index if needed
    if(addToIndexBy && item[addToIndexBy]) this.cacheSaveIndexByField(
      addToIndexBy,
      item[addToIndexBy] as string|number,
      saveItemId
    );
  }

  /**
   * when we need to save a NULL item in cache to know that it doesn't exist
   * and avoid making multiple requests for the same item to the remote server
   *
   * you can also set fieldName and value to index this NULL item by this field,
   * @example if you know that there is no item with such field value:
   *    ```typescript
   *    //negative did is for local system items don't even try to load from server
   *    cacheSetNullItem('notfound', 'did', -1);
   *    ```
   *
   * @param id
   * @param fieldName
   * @param value
   */
  public cacheSetNullItem(id:DB_EntityID, fieldName?:Extract<keyof T, string>, value?:string|number) {
    if(!this.cache) return;
    this.cachedItems.set(id, null);     //set the main cache hash with NULL value with this id
    //if we index by given field - save NULL to the given [field][value] index
    if(fieldName && value !== undefined && value !== null && this.cacheIndex.has(fieldName) ) this.cacheSaveIndexByField(fieldName, value, id);
  }

  /**
   * helper function to save item id to index by field value
   * will create a new index if it doesn't exist yet
   *
   * in future when we're creating a new index, we can rescan cached items
   * to add them to this new index too
   *
   * @param fieldName
   * @param value
   * @param id
   * @private
   */
  private cacheSaveIndexByField(fieldName:Extract<keyof T, string>, value:string|number|null|undefined, id:DB_EntityID) {
    if(value===null || value===undefined) return;
    if(!this.cacheIndex.has(fieldName)) this.cacheIndex.set(fieldName, {});
    this.cacheIndex.get(fieldName)![value] = id;
  }

  /**
   * get an item from the cache by its id
   * @param id
   * @return T item if its in cache,
   *    or NULL if we know that it doesn't exist
   *    or undefined if we don't have this item in cache
   */
  public cacheGet(id:DB_EntityID):T|null|undefined {
    if(!this.cache) return undefined;
    //console.log('cacheGet', id, this.cachedItems, `last loaded item: ${this.cacheLastLoadedItemID}`, this.cacheLastLoadedItem);
    if(id === this.cacheLastLoadedItemID) return this.cacheLastLoadedItem;
    return this.cachedItems.get(id);
  }

  public cacheGetByField(fieldName:Extract<keyof T, string>, value:string|number):T|null|undefined {
    if(!this.cache) return undefined;
    const index = this.cacheIndex.get(fieldName);
    if(index) {
      const id = index[value];
      if(id!==undefined && id!==null) return this.cacheGet(id);
    }
    return undefined;
  }

  /*public cacheQuery(query:DB_Query):T[]|null|undefined {
    console.log('cacheQuery', query); console.warn('cacheQuery not implemented yet');
    return null;
  }*/

  /**
   * remove item from the cache by its id,
   * also remove it from all indexes
   * @param id
   * @protected
   */
  protected cacheDelete(id:DB_EntityID) {
    if(!this.cache) return;
    this.cachedItems.delete(id);
    //find and remove item ID from all indexes
    this.cacheIndex.forEach((indexObj) => {
      for (const valKey in indexObj) {
        if (Object.prototype.hasOwnProperty.call(indexObj, valKey)) {
          if (indexObj[valKey] === id) delete indexObj[valKey];
        }
      }
    });
    //remove from last loaded item cache
    if(id === this.cacheLastLoadedItemID) {
      this.cacheLastLoadedItem = null;
      this.cacheLastLoadedItemID = null;
    }
  }

  /**
   * clear cache from old items
   * @private
   */
  private cacheMaintenance() {
    if(this.cachedItems.size < this.cacheMaxItems) return;
    console.log('cache maintenance of entity:', this.constructor.name);

    //remove old items from map and indexes,
    //start from keys that were added first (oldest)
    const keys = Array.from(this.cachedItems.keys());
    for(const key of keys) {
      this.cacheDelete(key);
      if(this.cachedItems.size <= this.cacheMaxItems) break;
    }
  }

  /**
   * mostly for debug purposes
   */
  public cacheGetIndexInfo() {
    return {
      items: this.cachedItems,
      byField: this.cacheIndex,
      maxItems: this.cacheMaxItems,
    };
  }

}
