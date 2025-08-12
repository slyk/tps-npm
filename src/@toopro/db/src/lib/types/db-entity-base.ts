/**
 * Used as parent for all the db entities.
 * right now for fast constructor with assign all data from a given
 * hash object
 */
export abstract class DB_EntityBase<TI=object> {
  constructor(data:TI)
  constructor(...args: any[]) {
    if (args.length === 1) {
      const data = args[0] as TI;
      Object.assign(this, data)
    }
  }

  /**
   * tell if this object has such a field
   */
  //adding this gives error when trying to extend class and implement interface
  // hasField?(field:Extract<keyof TI, string>):boolean {
  //   return Object.prototype.hasOwnProperty.call(this, field);
  // }

}
