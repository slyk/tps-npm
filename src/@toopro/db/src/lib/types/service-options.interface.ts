import { DB_FieldPath } from './query.type.js';
import { DB_VerboseLevel } from './types.js';
import { TpsCasterOptions } from '@toopro/utils';

export interface DB_EntityService_Options<T extends object = object> {

  /**
   * will service allow trying to modify entities or just return error
   * don't even try to send requests to server.
   *
   * **WARNING!** this can be changed in realtime,
   * so the server should still check permissions too.
   */
  readonly?: boolean,

  /**
   * do we need to throw exceptions on errors
   * or just return string errors without exceptions?
   */
  throwErrors?: boolean,

  /**
   * field name that is the PRIMARY KEY in db and should not be changed/updated.
   * most of the time it is 'id' or 'uuid', but you can use any field name in real life
   * @default 'id'
   */
  idFieldName?: string,

  /**
   * do we need to cast values to the correct types?
   * if not undefined, then each entity will be processed with the
   * TpsCast.cast() function before returning to the consumer.
   * @see TpsCast.cast
   * @example
   * constructor('work:bonus_vcard', broker, {
   *       deepFields: {'level':'bonus_level'},
   *       verboseLevel:DB_VerboseLevel.TRACE,
   *       casterOpts: { schema: {
   *         gold_balance: 'number',
   *         ltv_balance:  'number'
   *       }}
   *     });
   */
  casterOpts?: Partial<TpsCasterOptions<T>>

  /**
   * do we need to log errors to console directly
   * from the service (not a good idea in production,
   * better errors be checked by the consumer to identify is it critical)
   */
  errorsToConsole?: boolean,

  /**
   * Internal service.log() function will use this level to filter messages
   * that service is sending and log to console only ones that are more or equal to this level
   */
  verboseLevel?: DB_VerboseLevel

  /**
   * __entity names__ indexed by __field name__ *(to load nested entities)*
   * from __remote__ servers _(used for multiserver DB structure)_.
   *
   * set only if you want service to handle loading of nested entities,
   * and if those entities are loaded from **different servers than host entity**.
   *
   * for example 'vcard_they' in transaction is a text with uuid of the vcard entity,
   * but in DB its foreign key to vcard entity, so user can request it by
   * deep field 'vcard_they.name' _(its ok for one instance of directus, but not for multiserver)_
   *
   * so we need to know that 'vcard_they' is a foreign key to 'vcard' entity
   * and the server that is responsible for this entity to load it from the correct server.
   *
   * @remarks if you need to load deep nested fields from multiserver,
   *    you need to specify this in deepFields.
   * @example {'vcard_they':'work:vcard', 'product':'product'}
   *
   * @privateRemarks
   *      - using serviceByEntity of the broker, to aks nested entity service for entities
   *      - all deepFields with dots will be removed from query.fields,
   *        so if you set deepFields the entity that is no same server and could
   *        be requested with dot notation, you will do additional request to get it.
   * @see DB_BrokerService.serviceByEntity
   */
  deepFields?: Partial<Record<DB_FieldPath<T, 1>, string>>,
}
