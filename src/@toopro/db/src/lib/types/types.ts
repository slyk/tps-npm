import { AuthenticationClient, DirectusClient, RestClient } from '@directus/sdk';
import { I_DB_EntityServiceBase } from './service-base.interface.js';
import { DB_BrokerService } from '../broker.service.js';

export enum DBtype {
  directus = 'directus',
  mysql = 'mysql',
}

export enum DB_ServerNamesStd {
  core = 'core',
  work = 'work',
  ddev = 'ddev',
  mcrsrv = 'mcrsrv',
  stats = 'stats',
}

export enum IsLoginStatus {
  yes = 10,
  ndef = 0,
  not = -10,
  waiting = -5, //when we sent login request and waiting for response
  error = -100,
}

export interface DB_Credentials {
  // credentials (email or username)
  login?: string,
  // password or null (to tell that we forced to ask user for password)
  password?: string|null,
  // static token for login
  token?: string,
  // url of the server
  url?: string
  // options (depend on the server type)
  options?: Record<string, any>
}

/**
 * for now typescript does not support mysql date time string to validate it,
 * but we can use string type to store it in db and then validate it in runtime
 */
export type DB_DateTimeString = string;

export type DB_EntityID = string | number;

export enum DB_VerboseLevel {
  ERROR,
  WARN,
  INFO,
  DEBUG,
  TRACE
}

/** If T is array the type will be array too */
export type EntityOrArray<T extends any|unknown[]> = T extends unknown[] ? T[] : T;


/**
 * used in servers broker to store all needed data about server state,
 * and also the instance of the actual server SDK object (i)
 * @template SDKT - type of the server SDK object
 * @template T - type of the entity object (optional)
 */
export interface DB_ServerInfo<SDKT = object, T extends object = object> extends DB_Credentials {
  name: string | DB_ServerNamesStd,
  url: string,
  //type of the DB server adaptor/SDK used in query functions to get it in needed format
  type: DBtype,

  // DB_Credentials:
  //credentials (email or username)
  login?: string,
  //password or null (to tell that we forced to ask user for password)
  password?: string|null,
  //static token for login
  token?: string,

  //state
  isLoggedIn: IsLoginStatus,

  /**
   * login function (function that will be called from the broker to login to server)
   * because each implementation of the server type will have its own login function
   * we need to store it here so broker can call it when it has credentials
   * @see DB_EntityServiceBase.loginToServer
   */
  loginFunction?: (srv?:DB_ServerInfo<T>, credentials?:DB_Credentials) => Promise<IsLoginStatus>,

  /**
   * any of the service implementation to this server
   * there could be many services for different entities,
   * but they all have some common methods to iteract with server,
   * like login,logout so access to any of this services could allow
   * to call any of the common methods.
   *
   * broker did not know the actual implementation of the service,
   * it could be directus, mysql, graphql etc. so the service
   * is stored as base class
   */
  someService?: I_DB_EntityServiceBase<T>,

  //entity names that this server is responsible for (loaded from config)
  entities?: string[],

  //instance of the actual server SDK object used in service base implementation to get data from server
  i?: SDKT,
  //number for browser and Timer for nodejs runtime
  autoRefresh$?: NodeJS.Timer | number,
  user?: {
    id?: string,
    //current access token (could be used to access server using http requests to put this token in headers)
    token?:string|null,
    //some internal data
    __data?:object,
  }

  /**
   * instance of the broker service that is working with this server
   * needed to access broker to tell this broker about updates to data
   */
  broker: DB_BrokerService
}

export type DB_ServerInfo_Directus<T = object> = DB_ServerInfo<
  DirectusClient<{ [key: string]: T }> &
  RestClient<{ [key: string]: T }> &
  AuthenticationClient<{ [key: string]: T }>
>;

export interface ServersConfigHash {
  credentials: Partial<Record<DB_ServerNamesStd | string, Partial<DB_ServerInfo>>>,
  entitiesByServer: Partial<Record<DB_ServerNamesStd | string, string[]>>,
}
