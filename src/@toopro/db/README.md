# db

TS lib to work with databases (drupal, mysql, etc).

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/slyk/tps-npm)

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
- 0.1.65 - moved to fetch url when getting file contents
- 0.1.63 - login check (for oauth) without any credentials (they are in httpOnly secured cookies)
- 0.1.62 - handle 503 'under pressure' errors by waaing 5 seconds and retrying the operation