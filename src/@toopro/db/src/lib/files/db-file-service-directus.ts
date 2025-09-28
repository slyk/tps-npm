import { I_DB_FilesService } from './db-files-service.interface.js';
import { DB_EntityID, DB_ServerInfo_Directus } from '../types/types.js';
import { I_DB_File, I_DB_FileOptions } from './file.types.js';
import { updateFile, uploadFiles } from '@directus/sdk';
import { DB_BrokerService } from '../broker.service.js';
import { platformAPI } from "../utils/platform-api.js";
import { IFormData } from "../utils/platform-types.js";
declare global {
  interface FormData {
    append(name: string, value: string | Blob, fileName?: string): void;
  }
}

export class DB_FileService_Directus implements I_DB_FilesService<I_DB_File> {

  declare srvInfo:DB_ServerInfo_Directus<I_DB_File>;

  constructor(serverInfo:DB_ServerInfo_Directus) {
    this.srvInfo = serverInfo;
  }

  async upload(contents: string | object, options:I_DB_FileOptions = {objToJson:true}): Promise<DB_EntityID|I_DB_File> {

    // APPLY FILE PROPS FIELDS
    //according to SDK the file props need to go before the contents
    //soo first apply other fields data if we have them
    const formData = await platformAPI.createFormData();
    if(options.fields) await DB_FileService_Directus.propsToFormData(options.fields, formData);
    await DB_FileService_Directus.contentsToFormData(contents, formData); //add raw file data to formData

    //mekr request to server
    let res:I_DB_File|DB_EntityID;
    try {
      res = await this.srvInfo!.i!.request(uploadFiles(formData)) as I_DB_File;
    } catch (e) {
      console.error('ERR in @toopro/db file upload:',e);
      // return empty id string on error to satisfy return type
      res = '' as DB_EntityID;
    }
    return res;
  }

  async getContents(file: I_DB_File | DB_EntityID): Promise<object | null> {
    const fileId: string = (typeof file === 'object') ? String(file.id ?? '') : String(file);

    //check if we have server instance
    //we did not have login function in this service so ust wait
    //add timeout to wait for server to be ready 2 seconds
    if (!this.srvInfo || !this.srvInfo.i) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!this.srvInfo || !this.srvInfo.i) {
        console.error('ERR: @toopro/db file read: no server instance', file, DB_BrokerService.i);
        return null;
      }
    }

    try {
      let url = await this.getURL(fileId);
      if (!url) {
        console.error('ERR: @toopro/db file read: Failed to get URL for file', fileId);
        return null;
      }

      // Ensure fetch is available (polyfill for non-browser environments if needed)
      const g: any = globalThis as any;
      if (!g.fetch) {
        try {
          const polyfill = await import('@web-std/fetch');
          g.fetch = (polyfill as any).fetch ?? (polyfill as any).default ?? g.fetch;
        } catch (polyErr) {
          console.error('ERR: fetch is not available and polyfill failed to load', polyErr);
          return null;
        }
      }

      // Prepare auth:
      // - Always include cookies when possible (browser)
      // - Add Bearer token header when a token exists (srvInfo.user.token or srvInfo.token)
      const headers: Record<string, string> = {};
      const token = this.srvInfo.user?.token ?? this.srvInfo.token;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Use "any" for RequestInit to avoid TS issues in Node typings (credentials not in undici types)
      const init: any = {
        method: 'GET',
        headers,
        credentials: 'include',
      };

      const response = await g.fetch(url, init);
      if(!response)   { console.error('ERR: @toopro/db file read: Empty response for file', fileId); return null;  }
      if(!response.ok){ console.error('ERR: @toopro/db file read: HTTP status', response.status, 'for file', fileId); return null; }

      const contentType = response.headers?.get?.('content-type') || '';
      if (contentType.includes('application/json')) return await response.json();
      else {
        const text = await response.text();
        try { return JSON.parse(text); } catch { return text as unknown as object; }
      }
    } catch (e) {
      console.error('ERR: @toopro/db file read (fetch):', e);
      return null;
    }
  }

  async getURL(file: DB_EntityID | I_DB_File): Promise<string> {
    const fileId:string = (typeof file === 'object') ? String(file.id ?? '') : String(file);
    return this.srvInfo.url + '/assets/' + fileId;
  }

  /**
   * Replace file contents with new data, also you can update file record properties in DB
   * @param file
   * @param contents
   * @param props
   * @returns I_DB_File the file object for the updated file.
   */
  async replaceContents(file:I_DB_File|DB_EntityID, contents: string|object, props?:Partial<I_DB_File>):Promise<Partial<I_DB_File>> {
    //prepare formData
    const formData = await platformAPI.createFormData();
    if(props) await DB_FileService_Directus.propsToFormData(props, formData);
    await DB_FileService_Directus.contentsToFormData(contents, formData);

    //we can use same function to update file record props in DB but this should be made from other service
    const fileId:string = (typeof file === 'object') ? String(file.id ?? '') : String(file);
    return await this.srvInfo!.i!.request(updateFile(fileId, formData)) as Partial<I_DB_File>;
  }

  /**
   * Only update file record properties in DB (not the contents of the file itself)
   * @param file
   * @param props
   */
  async updateProps(file:I_DB_File|DB_EntityID, props:Partial<I_DB_File>):Promise<object> {
    const fileId:string = (typeof file === 'object') ? String(file.id ?? '') : String(file);
    const formData = await DB_FileService_Directus.propsToFormData(props);
    return await this.srvInfo!.i!.request(updateFile(fileId, formData));
  }

  /**
   * convert file contents to json string, to Response and put into formData
   * @param contents the data that need to be stored (will be converted to JSON if oject given)
   * @param formData to append 'file' data to, if not passed the new formData will be created
   * @private
   * @return formData with 'file' populated with converted contents data
   */
  private static async contentsToFormData(contents:any, formData?:IFormData) {
    let data = (typeof contents === 'object') ? JSON.stringify(contents) : contents;
    const response = await platformAPI.createResponse(data);
    const blob = await response.blob();
    if(!formData) formData = await platformAPI.createFormData();
    formData.append('file', blob);
    return formData;
  }

  private static async propsToFormData(props:Partial<I_DB_File>, formData?:IFormData) {
    if(!formData) formData = await platformAPI.createFormData();
    for(const key in props) {
      let data = props[key as keyof I_DB_File]??'';
      if(typeof data === 'object') data = JSON.stringify(data);
      if(typeof data === 'number') data = (data as number).toString();
      formData.append(key, data as string);
    }
    return formData;
  }
}
