# db

TS lib to work with databases (drupal, mysql, etc).

## Usage

Both in nestjs and angular:
1. Put DB_BrokerService in providers array so it could be injected in any constructor in project.
```typescript
@NgModule({
  imports: [],
  providers: [DB_BrokerService],
  exports: []
})
```
2. Init broker with data about servers and entities (most of the times you do it in constructor):
```typescript
constructor(private readonly dbBroker: DB_BrokerService) {
  //use this function to login to server from broker (same static func for all servers because they all use same Directus implementation
  const loginFunction = DB_EntityServiceBase_Directus.loginToServer as (srv?:DB_ServerInfo) => Promise<IsLoginStatus>;
  //init servers with entities that we can work with !!fut: maybe move this data to tps_core server
  dbBroker.upsertServer(DB_ServerNamesStd.core, {
    name:'core', url: 'https://tps-core.test.com',
    entities: ['how','they','named','in_directus'],
    loginFunction: loginFunction,
    isLoggedIn: IsLoginStatus.not, user:undefined, i:{}
  });
  dbBroker.upsertServer(DB_ServerNamesStd.work, {
    name:'work', url: 'https://tps-work.nfeya.org',
    entities: ['more'],
    loginFunction: loginFunction,
    isLoggedIn: IsLoginStatus.not, user:undefined, i:{}
  });
}
```
3. Use broker in entity service that needs to be extended from DB_EntityService_Base class.
```typescript
export type IUserLoginInfo = TpsCoreDirectusTypes['server_user_login'];
@Injectable()
export class ServerUserLoginService extends DB_EntityServiceBase_Directus<IUserLoginInfo> {
  constructor(dbBroker:DB_BrokerService) {
    super('core:user_action', dbBroker); //server name optional if you init dbBroker with entity names
  }
}
```

### QueryBuilder
You can use `DB_Query.qb<T>()` or `dbqb<T>()` to create new instance of query builder.
You can chain functions to build query and then use it in query() function of entity service.

```typescript
import { DBtype } from './types';

const q = dbqb<T>()
  .fields('id', 'name', 'author.*', 'data.nested_field')
  .equal('id', 1)
  .in('author.id', [1,2,3])
  .equal('data.nested_field', 'value')
  .limit(10).offset(0)
  .for(DBtype.directus);
//for internal query() functions the for() is optional,
//the full DB_Query object can be passed to the query() function
```

### Error handling
You can use `DB_Error` class to handle errors in your services if `throwError` flag is set to true.
Or process `string` errors returned __instead of objects__. See more details in [DB_Error class](src/lib/types/db.error.ts).

## Build to publish

1. Build dev/prod to commonjs
2. Build 'esm' version (it will be stored to esm folder and 'module' link to that folders is already in package.json)
3. Release publish to npm

## Local dev faster
use `npm link` to link local version of the package to your project, 
so you can test it without publishing to npm.
Algo:
1. `npm run build` to build the package
2. `npm link` to link the package globally
3. `cd your-project` and `npm link @toopro/db` to link the package to your project
4. `npm run start` to start your project with linked package

When done, you can unlink the package with `npm unlink @toopro/db`
in your project and `npm unlink` in the package folder.


## release notes
- 0.1.61 - fix error with cache undefined!=null
- 0.1.60 - login with credentials save
- 0.1.59 - combine changes from two branches
- 0.1.57 - remove warnings in angular apps
- 0.1.58-nest - for nestjs only fix upsert() will merge to 0.1.57-angular next release
- 0.1.57 - remove warning in angual / on other branch: upsert() can return T or error string (no undefined result)
- 0.1.56 - refactor: update types and improve platform detection logic
- 0.1.53 - ESM only try with nestjs too on node22
- 0.1.51 - Fix build errors under strict TypeScript settings.
- 0.1.50 - allow auth mode change to directus, publish to npm
- 0.1.48 - fix upsert() reposting info
- 0.1.47 - add contains() to query builder
- 0.1.45 - bump versions of directus sdk
- 0.1.44 - add limit to get byIds (to get more than 100)
- 0.1.43 - fix _in() search for cached entities
- 0.1.42 - more relogin working with directus
- 0.1.40 - added checkLogin() to directus with a recheck option that will relogin
- 0.1.37 - added type generics for getValueByFields() value functions.
- 0.1.36 - batchDelete() by query added
- 0.1.35 - batchUpdate() function added
- 0.1.34 - add() now can save multiple entities in one query
- 0.1.32 - add offset() function to query builder
- 0.1.25 - fix caster to work with upsert(), update(), add() functions
- 0.1.20 - added not() for not equal filter and fixed mcrsrv name
- 0.1.16 - added fieldAdd() to query builder
- 0.1.08 - added generic type to DB_EntityServiceOptions.
- 0.1.06 - added TpsCaster to the base entity service class, so its now faster to make autocast.
- 0.1.03 - deeField will now force load entities (even if not requested with dot notation)
- 0.1.01 - added `deepField` option and ability to use another service to load deep entities from ANOTHER server
- 0.0.97 - removed the need to settings `loginFunction`, it is now added when Service searching for server by entity name. Also the code:entity_name is preferable way of adding entities
- 0.0.86 - added new option `errorsToConsole`, so we can disable emiting errors directly from servive and handle it in consumer (which is the preferable way)
- 0.0.82 - added DB_Error and functions to work with error to base and directus services
- 0.0.81 - added verboseLevel (DB_VerboseLevel) to services
- 0.0.79 - commonjs + esm builds, added credentials to login functions
- 0.0.68 - added greaterOrEqual() function to query builder
- 0.0.67 - added greater() function to query builder
- 0.0.66 - added many additioanal userful shortcut functions to get items by fields, to get value of entity fast by fields
- 0.0.65 - moved query() and all functions that use it to base service class, added constructor to pass server name in front of entity name.
- 0.0.57 - start adding deep.dot.field ability for filter for it
- 0.0.56 - query() in service can use queryBuilder instead of actual query object in params
- 0.0.55 - finilize querybuilder filters functions, add flag to throw errors in service
- 0.0.43 - added readonly flag to entity service
- 0.0.32 - fix getContents()
- 0.0.30 - added fields() to query builder
- 0.0.29 - added query builder instead of DB_Query
- 0.0.27 - start adding file service support for directus
- 0.0.24 - added subscriptions to broker so we can subsribe to server changes
- 0.0.20 - added ability to work with roles and files (sdk need other functions for this, and moved from commonjs to es module syntax)
- 0.0.18 - added error to console when query() got errors, need to add working with roles
- 0.0.16 - changed `loginServer()` function of the broker to return full server info object
- 0.0.14 - added `logout()` and fixed autologin when server credentials changed
- 0.0.13 - fix console error log
- 0.0.11 - entityName moved to public readonly property
- 0.0.10 - added `doLogErrorsToConsole` to enable or disable console log, also set `id` as optional field in `update()` function
- 0.0.09 - added `callFunction()` to the service
- 0.0.06 - added autologin from the broker if credentials are provided in the server info structure.
- 0.0.05 - added `loginFunction` to the server info structure so broker could autologin when it has credentials.
- 0.0.03 - added `loginToServer()` static method to entity services, that could be called from the broker.
- 0.0.02 - added `addServer()` to broker.
