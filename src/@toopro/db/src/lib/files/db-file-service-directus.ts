import { I_DB_FilesService } from './db-files-service.interface.js';
import { DB_EntityID, DB_ServerInfo_Directus } from '../types/types.js';
import { I_DB_File, I_DB_FileOptions } from './file.types.js';
import { readAssetRaw, updateFile, uploadFiles } from '@directus/sdk';
import { DB_BrokerService } from '../broker.service.js';
import { platformAPI } from "../utils/platform-api.js";
import {IFormData, IReadableStream} from "../utils/platform-types.js";
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

  async getContents(file: I_DB_File | DB_EntityID): Promise<object> {
    const fileId:string = (typeof file === 'object') ? String(file.id ?? '') : String(file);
    //const q:DB_Query<I_DB_File> = {filter:{id:{_eq:fileId}}};

    //check if we have server instance
    //we did not have login function in this service so ust wait
    //add timeout to wait for server to be ready 2 seconds
    if(!this.srvInfo || !this.srvInfo.i) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if(!this.srvInfo || !this.srvInfo.i) {
        console.error('ERR: @toopro/db file read: no server instance',file, DB_BrokerService.i);
      }
    }

    let ret = null;
    try {
      const stream = await this.srvInfo!.i!.request(readAssetRaw(fileId));
      if(stream) ret = await DB_FileService_Directus.readableStreamToText(stream);
    } catch (e) {
      console.error('ERR: @toopro/db file read: ',e);
    }
    return ret as unknown as object;
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

  private static async readableStreamToText(stream:IReadableStream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let done = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        result += decoder.decode(value, { stream: true });
      }
    }

    result += decoder.decode(); // flush the decoder
    return result;
  }
}
