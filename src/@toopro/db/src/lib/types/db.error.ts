/**
 * Main error class for the DB module.
 * Used to return more detailed and standardized error messages about DB errors,
 *
 * also to convert errors from different sources/SDKs/adaptors to the same format.
 * So consumers of DB_EntityServices can handle errors in the same way.
 *
 * ### Important notes about error handling:
 * Services in DB module have two ways of error reporting:
 * - throw errors as **exceptions** _(default behavior)_
 * - return error **strings** instead of data objects _(without any exceptions)_
 * you set this behavior using the `throwErrors` property of the service.
 *
 * With string errors you can also check if there was an error in the last operation,
 * using the `lastError` property of the service (but be careful with async code).
 *
 * @see DB_EntityServiceBase.throwErrors
 */
export class DB_Error extends Error {

  /** table or entity type that have a problem */
  table?:string;

  /** column or property of the entity with error if we hav one */
  field?:string;

  /** error code if we have one */
  code?:number;

  /** error type string constant code if we have one */
  errId?:string;

  /** any additional data that can be useful */
  data?:any;

  /** error level */
  level:DB_ErrorLevel = DB_ErrorLevel.ERROR;

  constructor(err:DB_Error_Directus | Error | DB_Error | string, table?:string, field?:string, level?:DB_ErrorLevel|null, data?:any) {
    super(); if(!err) return;

    if (typeof err === 'string') {
      this.name = 'DB_Error';
      this.message = err as string;
      this.table = table||undefined;
      this.field = field||undefined;
      this.data = data;
      this.level = level || DB_ErrorLevel.ERROR;
    } else if(typeof err === 'object') {
      const keys = Object.keys(err);
      //if we got same object
      if(err instanceof DB_Error) Object.assign(this, err);
      //parse directus error
      if(keys.includes('errors') && keys.includes('response')) this._parseError_Directus(err as DB_Error_Directus);
      //standard error
      if(keys.includes('message')) this.message = (err as Error).message;
    }
  }
  //override toString() { return this.message;  }

  /** parse error from Directus SDK */
  private _parseError_Directus(err:DB_Error_Directus) {
    let msg = '';
    if(!err || !err.errors) { this.message = msg; return; }
    for(const e of err.errors) {
      msg += e.message + '\n';
      if(e.extensions) {
        if(e.extensions.collection) this.table = e.extensions.collection;
        if(e.extensions.field) this.field = e.extensions.field;
        if(e.extensions.code) this.errId = e.extensions.code;
      }
    }
    this.message = msg;
  }
}

///////////////////////////////////////////////////////////////////////////
// Error levels

/**
 * Error levels for DB errors.
 * @remarks !!fut move to TpsUtils
 * @author Kyrylo Kuzmytskyy <slykirill@gmail.com>
 */
export enum DB_ErrorLevel {

  /**
   * Just information, nothing to worry about.
   * Used in verbose mode to log all points of interesting steps in db operations.
   */
  INFO = 'INFO',

  /**
   * Something that could be a problem, or not.
   * depends on the context, we need to check an error message to decide
   * should we care about it or not.
   * */
  WARNING = 'WARNING',

  /**
   * something went wrong, but it's not critical.
   * We need to just check the message and react to it accordingly.
   * */
  ERROR = 'ERROR',

  /**
   * something that could __break the system__,
   * most of the time we can't work with the service after this error,
   * but the system can still work.
   * */

  CRITICAL = 'CRITICAL',

  /**
   * Something that could __break the system__ at all (not just the service),
   * Most of the time we can't work with the system after this error,
   * and restart needed (maybe with some changed input params).
   * */
  FATAL = 'FATAL',

  /**
   * Something that could __ruin/destroy the data__ in DB,
   * immediate shutdown is requred to prevent data loss.
   * Log maximum info and manual intervention needed to fix the data,
   * BEFORE restarting the system.
   */
  DAMAGE = 'DAMAGE'
}

///////////////////////////////////////////////////////////////////////////
// SDK errors

export interface DB_Error_Directus {
  errors?:{
    message:string,
    extensions:{
      code:string,
      collection:string,
      field:string,
    }
  }[],
  response?:any;
}
