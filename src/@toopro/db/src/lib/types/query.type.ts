import { DB_EntityID, DBtype } from './types.js';

/**
 * Interface representing a database query object.
 * This is based on the Directus query object structure.
 *
 * @template T - The type of the entity being queried.
 * @property [fields] - Fields to be selected in the query.
 * @property [alias] - Aliases for the fields.
 * @property [filter] - Filter conditions for the query of current entity.
 * @property [search] - Search string for full-text search.
 * @property [deep] - Deep query object for nested relations.
 * @property [limit] - Limit the number of results.
 * @property [sort] - Sort order for the results.
 * @property [offset] - Offset for pagination.
 * @property [page] - Page number for pagination.
 * @property [group] - Group by fields.
 * @property [aggregate] - Aggregate functions to be applied.
 * @property [skipCache] - Set true to skip cache and request from server.
 */
export interface I_DB_Query<T=object> {
  /**
   * Fields to be selected in the query.
   * Dot separated could be used to get fields data from nested objects.
   * For example, `fields: ['id', 'name', 'user.id', 'user.name', 'avatar.*']`
   * Also could do like this: ['*','avatar.filename'] - to get all top level fields
   * and only filename of the avatar (nested object).
   */
  fields?:string[]|Extract<keyof T, string>[]
  alias?:Record<string, string>

  filter?:DB_Filter<T>,
  search?:string,

  /**
   * analog of deep in directus,
   * used to get fields of the nested objects
   * by additional query params.
   *
   * For example, if a category has many children and we need to get only
   * two of them, the most recent, we can do:
   * {children:{limit:2, sort:['+id']}}
   */
  fieldQ?:Partial<Record<keyof T, I_DB_Query<any>>>,

  limit?:number,
  /** array of sort strings, example: ['+id', '-name'] */
  sort?:string[],
  offset?:number,
  page?:number,

  group?:string[],
  aggregate?:DB_Aggregate,

  //set true if you want to skip cache and even we have some need to request from server
  skipCache?:boolean
  //TODO: maybe we need to control do we need to save results to cache or not and also do we need to load from remote - its two different things
}

export interface I_DB_Query_Directus<T> extends I_DB_Query<T> {
  //remove parent fieldQ field
  fieldQ?:undefined
  //fieldQ will be converted to deep for directus:
  deep?:Partial<Record<keyof T,{[key:string]:any}>>
}

/**
 * used to filter, reference deep fields
 * Depth needed to not create circular references (some compilers could do this)
 * @example
 * dbqb().equal<2>('level_1.level2');
 * */
export type DB_FieldPath<T, Depth extends number = 1> =
  Depth extends 0 ? '' :
    {
      [K in Extract<keyof T, string>]-?:
      `${K}` |
      (T[K] extends object ? `${K}.${DB_FieldPath<T[K], Depth extends 1 ? 0 : Depth extends 2 ? 1 : Depth extends 3 ? 2 : never>}` : never)
    } [Extract<keyof T, string>];


/**
 * https://docs.directus.io/reference/filter-rules.html
 */
export interface DB_QueryBuilder<T=object> {
  is_builder:boolean;
  q:I_DB_Query<T>;

  /** select only the given fields */
  fields<Depth extends number = 1>(fields?:DB_FieldPath<T,Depth>[]|string[]|DB_FieldPath<T,Depth>):DB_QueryBuilder<T>;
  fieldAdd<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string):DB_QueryBuilder<T>;

  equal<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string , value:string|number):DB_QueryBuilder<T>;
  not  <Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string, value:string|number):DB_QueryBuilder<T>;
  notIn(field:DB_FieldPath<T,1>|string, values:string[]|number[]):DB_QueryBuilder<T>;
  in(field:Extract<keyof T,string>, values:DB_EntityID[]):DB_QueryBuilder<T>;
  isNull(field:Extract<keyof T,string>):DB_QueryBuilder<T>;
  isNotNull(field:Extract<keyof T,string>):DB_QueryBuilder<T>;

  greater(field:Extract<keyof T,string>, than:string|number):DB_QueryBuilder<T>;
  greaterOrEqual(field:Extract<keyof T,string>, than:string|number):DB_QueryBuilder<T>;
  less(field:Extract<keyof T,string>, than:string|number):DB_QueryBuilder<T>;
  lessOrEqual(field:Extract<keyof T,string>, than:string|number):DB_QueryBuilder<T>;
  contains<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string, value:string, caseInsensitive?:boolean):DB_QueryBuilder<T>;

  limit(limit?:number):DB_QueryBuilder<T>;
  sort(sort:string[]|string):DB_QueryBuilder<T>;
  offset(offset?: number): DB_QueryBuilder<T>;

  fieldQuery<NT = object>(field:Extract<keyof T, string>, q:DB_QueryBuilder<NT>|DB_Query<NT>):DB_QueryBuilder<T>;

  filtersAdd(filter:DB_Filter<T>):DB_QueryBuilder<T>;
  filtersGet():DB_Filter<T>;
  filter<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string, condition:DB_FieldFilterOperator):DB_QueryBuilder<T>;

  skipCache(skip:boolean|undefined):DB_QueryBuilder<T>;

  /** compile final query object for directus or mysql */
  for(qType?:DBtype):I_DB_Query<T>;
}

/**
 * Class representing a database query builder
 * @example
 * const query = DB_Query.qb().equal('id', 1).q;
 */
export class DB_Query<T> implements DB_QueryBuilder<T> {
  is_builder = true;

  /** the query object that we are building */
  query:I_DB_Query<T>;
  /** getter for the query object that we are building */
  public get q():I_DB_Query<T> {
    return this.query;
  }


  /**
   * Create a new query builder.
   * If an existing query object is given - return it without creating new.
   * @param q default query object data, you also can set global default query object
   * @returns query builder object, just a shortcut for new DB_Query(q)
   * @see DB_Query.defaultQuery
   * @see dbqb
   * @example
   * dbqb().equal('id', 1).for('drcts');
   */
  static qb<T=object>(q?:Partial<I_DB_Query<T>>|DB_QueryBuilder):DB_QueryBuilder<T> {
    //if an existing query object is given - return it
    if(q instanceof DB_Query) return q as DB_QueryBuilder<T>;
    //else create a new one
    return new DB_Query<T>(q as I_DB_Query<T>) as DB_QueryBuilder<T>;
  }
  constructor(q?:I_DB_Query<T>) {
    this.query = q || {...DB_Query.defaultQuery};
  }

  /**
   * global for all query builders default query object
   */
  static defaultQuery:I_DB_Query  = {limit:100};

  /**
   * in your project is it using the same DB type adaptor,
   * you can set this once in init of your project
   * to then use fast ...for() function
   * @see DB_Query.for
   */
  static defaultDBType = DBtype.directus;


  filtersAdd(filter:DB_Filter<T>):DB_QueryBuilder<T> {
    if(!this.query.filter) this.query.filter = {} as DB_Filter<T>;
    this.query.filter = this.deepMerge(this.query.filter, filter) as DB_Filter<T>;
    return this;
  }
  filtersGet():DB_Filter<T> {
    return this.query.filter || {} as DB_Filter<T>;
  }

  equal<Depth extends number = 1>(field: DB_FieldPath<T, Depth>|string, value: string | number): DB_QueryBuilder<T> {
    this.filter<Depth>(field, { _eq: value });
    return this;
  }
  not<Depth extends number = 1>(field: DB_FieldPath<T, Depth>|string, value: string | number): DB_QueryBuilder<T> {
    this.filter<Depth>(field, { _neq: value });
    return this;
  }

  isNull(field: Extract<keyof T, string>): DB_QueryBuilder<T> {
    this.filter(field, { _null: true });
    return this;
  }

  isNotNull(field: Extract<keyof T, string>): DB_QueryBuilder<T> {
    this.filter(field, { _nnull: true });
    return this;
  }

  greater(field: Extract<keyof T, string>, than: string | number): DB_QueryBuilder<T> {
    this.filter(field, { _gt: than });
    return this;
  }
  greaterOrEqual(field: Extract<keyof T, string>, than: string | number): DB_QueryBuilder<T> {
    this.filter(field, { _gte: than });
    return this
  }

  less(field: Extract<keyof T, string>, than: string | number): DB_QueryBuilder<T> {
    this.filter(field, { _lt: than });
    return this;
  }
  lessOrEqual(field: Extract<keyof T, string>, than: string | number): DB_QueryBuilder<T> {
    this.filter(field, { _lte: than });
    return this;
  }

  contains<Depth extends number = 1>(field: DB_FieldPath<T, Depth>|string, value: string, caseInsensitive = false): DB_QueryBuilder<T> {
    this.filter<Depth>(field, caseInsensitive ? { _icontains: value } : { _contains: value });
    return this;
  }

  /**
   * base function to put condition data in the right place of field filter hierarchy.
   * other functions use it and user can use too.
   *
   * For exmaple:
   * `filter<3>('user.avatar.date', '2023');
   * will add to existing user.avatar field more information about date
   * this.q.filter.user.avatar = {
   *   date: '2023',
   *   type: 'jpg'
   * }
   *
   * @param field dot separated field names of the entity,
   *    or just field name if there is only one
   * @param condition full condition object from DB_FieldFilterOperator, for example {_eq:'val'}
   * @see DB_FieldFilterOperator
   */
  filter<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string, condition:DB_FieldFilterOperator) {
    if(!this.query.filter) this.query.filter = {} as DB_Filter<T>;
    const addFilter = {} as DB_FieldFilter<T>;
    field.split('.').reduce((prev, curr, index, arr) => {
      if(index === arr.length-1) (prev as any)[curr] = condition; //put given condition, for ex. {_eq:'val}
      else {  (prev as any)[curr] = {}; return (prev as any)[curr]; }
    }, addFilter as unknown as Record<string, any>);
    this.query.filter = this.deepMerge(this.query.filter as DB_FieldFilter<T>, addFilter) as DB_Filter<T>;
    return this;
  }

  /**
   * combine two deep objects to one merging nested props too
   * @param target
   * @param source
   * @private
   */
  private deepMerge(target: any, source: any): any {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        Object.assign(source[key], this.deepMerge(target[key], source[key]));
      }
    }
    Object.assign(target || {}, source);
    return target;
  }

  notIn(field:DB_FieldPath<T>|string, value:string[]|number[]):DB_QueryBuilder<T> {
    this.filter(field, {_nin:value} );
    return this;
  }

  in(field:Extract<keyof T,string> , value:DB_EntityID[]):DB_QueryBuilder<T> {
    if(!this.query.filter) this.query.filter = {} as DB_Filter<T>;
    (this.query.filter as any)[field as string] = {_in:value};
    return this;
  }

  /**
   * set limit to query
   * @param limit number of records to get,
   *    it can be undefined, so it will not be changed (this is useful
   *    in functions body to not make additional if statements)
   *  */
  limit(limit?:number):DB_QueryBuilder<T> {
    if(limit!==undefined) this.query.limit = limit;
    return this;
  }

  /**  add sort to request
   * @param sort array of sort strings, example: ['id', '-name']
   *    if array given then all sort data will be REPLACED,
   *    is just one string given - then it will be appended
   *    to the existing sort array
   * @example
   *    .sort(['id', '-name'])
   *    //minus means sort by descending
   * */
  sort(sort:string[]|string):DB_QueryBuilder<T> {
    if(typeof sort === 'string') {
      if(this.query.sort) this.query.sort.push(sort);
      else this.query.sort = [sort];
    }
    if (Array.isArray(sort)) this.query.sort = sort;
    return this;
  }

  /**
   * set fields to get from the query
   * @param fields array of field names (strings)
   *    - could be dot separated for nested fields
   *    and wildcards supported, for example `['*','avatar.*', 'parent.id']`
   *    - it can be `undefined`, so it will not be changed (this is useful
   *    in functions body to not make additional if statements)
   */
  fields<Depth extends number = 1>(fields?:DB_FieldPath<T,Depth>[]|string[]|DB_FieldPath<T,Depth>):DB_QueryBuilder<T> {
    if(typeof fields === 'string') fields = [fields];
    if(fields) this.query.fields = fields;
    return this;
  }

  /**
   * add one field to the list of fields to be selected in the query.
   * @param field field name if there is only one ot dot separated deep field name
   * @example
   *    const qb = dbqb().fields(['*']);
   *    qb.fieldAdd('author.*');
   *    //now fields is ['*', 'author.*']
   * @returns this
   */
  fieldAdd<Depth extends number = 1>(field:DB_FieldPath<T,Depth>|string):DB_QueryBuilder<T> {
    if(!this.query.fields) this.query.fields = [];
    this.query.fields.push(field as Extract<keyof T, string>);
    return this;
  }

  /**
   * Add additional query params for nested complex fields,
   * when to get data for this fields DB need to make additional queries to other tables.
   * For exmaple you can set limit and sort for latest transactions of the client.
   *
   * Analog of deep in directus. Will set internal fieldQ field in query object,
   * and then it must me converted to needed syntax in for() function,
   * depends on the DB type.
   *
   * @param field
   * @param q
   */
  fieldQuery<NT = object>(field:Extract<keyof T, string>, q:I_DB_Query<NT>|DB_QueryBuilder<NT>):DB_QueryBuilder<T> {
    //prepare empty field query prop:
    if(!this.query.fieldQ) this.query.fieldQ = {};
    //if q is given sd DB_Query class and not an object with direct query data
    if(q instanceof DB_Query) q = q.q as I_DB_Query<NT>;
    this.query.fieldQ[field] = q as I_DB_Query<NT>;
    return this;
  }

  skipCache(skip:boolean|undefined=true):DB_QueryBuilder<T> {
    if(skip !== undefined) this.query.skipCache = skip;
    return this;
  }

  offset(offset?: number): DB_QueryBuilder<T> {
    if (offset !== undefined) this.query.offset = offset;
    return this;
  }

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /** convert a query object to given syntax
   * that can be directly used in database SDK
   * */
  for(qType?:DBtype):I_DB_Query_Directus<T> {
    if(!qType) qType = DB_Query.defaultDBType;
    if(qType === DBtype.directus)  return this._for_drcts(this.query);
    throw new Error(`unknown query type: ${qType}`);
  }

  /**
   * convert generic query to directus query
   * the main difference now is fieldQ field that cotains subqeuries,
   * and in directus its another 'deep' field that have special syntax with _.
   * */
  private _for_drcts(q:I_DB_Query<T>, deep = false):I_DB_Query_Directus<T> {

    // DEEP CONVERT:
    // if we asked to make this queue for directus deep query - convert fields to deep
    // 'deep' in directus have the same fields as queue but with _ at the beginning
    if(deep) {
      const ret = {} as I_DB_Query_Directus<T>;       //prepare empty object
      for(const key in q as any) (ret as any)[`_${key}`] = (q as any)[key];    //copy all fields adding _
      if((ret as any).deep) delete (ret as any).deep;                   //remove deep field
      return ret;
    }

    //SIMPLE CONVERT:
    const ret = {...q} as I_DB_Query_Directus<T>; //create a copy of queue

    // if we have additional field queries - convert them recursively
    if(q.fieldQ) {
      if(!ret.deep) ret.deep = {};
      for(const key in q.fieldQ) if(typeof q.fieldQ[key] === 'object')  {
        ret.deep[key] = this._for_drcts(q.fieldQ[key], true);
      }
      delete ret.fieldQ;
    }

    return ret;
  }

}

/** shortcut to create a new query builder */
export const dbqb = DB_Query.qb;

/**
 * put the column names (or aliases) here that should be aggregated
 * by the given list of aggregate functions
 */
export type DB_Aggregate = {
  avg?: string[];
  avgDistinct?: string[];
  count?: string[];
  countDistinct?: string[];
  sum?: string[];
  sumDistinct?: string[];
  min?: string[];
  max?: string[];
}

// FILTER

export type DB_Filter<T=object> = DB_LogicalFilter<T> | DB_FieldFilter<T>;
export type DB_LogicalFilter<T> = { _or:DB_Filter<T>[] } | { _and:DB_Filter<T>[] };
export type DB_FieldFilter<T> = {
  [fname in Extract<keyof T, string>|string]: DB_FieldFilterOperator;
};

export type DB_FieldFilterOperator = {
  _eq?: string | number | boolean;
  _neq?: string | number | boolean;
  _lt?: string | number;
  _lte?: string | number;
  _gt?: string | number;
  _gte?: string | number;
  _in?: (string | number)[];
  _nin?: (string | number)[];
  _null?: boolean; //maybe it should be 1 or 0 instead of true/false
  _nnull?: boolean;
  _contains?: string;
  _ncontains?: string;
  _icontains?: string;
  _starts_with?: string;
  _nstarts_with?: string;
  _istarts_with?: string;
  _nistarts_with?: string;
  _ends_with?: string;
  _nends_with?: string;
  _iends_with?: string;
  _niends_with?: string;
  _between?: (string | number)[];
  _nbetween?: (string | number)[];
  _empty?: boolean;
  _nempty?: boolean;
  _intersects?: string;
  _nintersects?: string;
  _intersects_bbox?: string;
  _nintersects_bbox?: string;
}
