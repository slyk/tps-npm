import { DB_BrokerService } from '../broker.service.js';
import { DB_EntityID } from './types.js';
import { DB_EntityServiceBase_Directus } from '../service-directus.js';
import { DB_EntityBase } from './db-entity-base.js';
import { DB_EntityService_Options } from './service-options.interface.js';

//export class ITestEntity extends DB_EntityBase<{id:DB_EntityID}>{
export interface ITestEntity {
  id?:DB_EntityID;
  date_created?: string;
  status?:string;
  value?:string;
  nested?:{field1?:string,field2?:string}|undefined;
  decimal?:number;
}

export class TestEntityService extends DB_EntityServiceBase_Directus<ITestEntity> {

  constructor(db:DB_BrokerService, opts?:DB_EntityService_Options) {
    super('stats:test', db, {casterOpts: {schema: {decimal: 'number'}}, ...opts});
  }

}

export interface ITestNestedEntity {
  id?:string;
  status?:string;
  date_created?:string;
}

export class TestNestedEntityService extends DB_EntityServiceBase_Directus<ITestNestedEntity> {
  constructor(db:DB_BrokerService) {
    super('stats:test_nested', db);
  }
}

export interface IDrupalRole { id?:string; name?:string; description?:string; icon?:string; }
export class RolesEntityService extends DB_EntityServiceBase_Directus<IDrupalRole> {
  constructor(db:DB_BrokerService) {
    super('directus_roles', db);
  }
}
