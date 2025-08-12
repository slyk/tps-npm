import { DB_DateTimeString } from '../types/types.js';

export interface I_DB_FileOptions {

  name?:string;

  folder?:string;

  objToJson?:boolean;

  /**
   * if file uploaded to system will need to create also db record for it
   * you can pass other fields data here
   * */
  fields?:Partial<I_DB_File>;
}

export interface I_DB_File {

  /**
   * uuid of the files
   */
  id?:string;

  /**
   * name of the files as saved on the storage adapter.
   */
  filename_disk?:string;

  /**
   * Preferred filename when files is downloaded.
   */
  filename_download?:string;

  /**
   * MIME type of the files.
   */
  type?:string;

  /**
   * Size of the files.
   * directus SDK have it in string, don't know why
   */
  filesize?:string;

  /**
   * metadata of the files
   */
  metadata?:object;

  /**
   * uuid of the (virtual) folder the files is in.
   */
  folder?:string;

  /**
   * Tags for the files.
   */
  tags?:string[];

  /**
   * When the files was last uploaded/replaced.
   */
  uploaded_on?:DB_DateTimeString;

}
