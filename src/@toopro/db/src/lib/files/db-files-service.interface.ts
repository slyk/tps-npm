import { I_DB_File, I_DB_FileOptions } from './file.types.js';
import { DB_EntityID } from '../types/types.js';

/**
 * Interface for the Files Service,
 * that will work with any implementation of database server
 * if it can handle work with files
 */
export interface I_DB_FilesService<FILE_OBJ_TYPE> {
  /**
   * upload files to remote server
   * @param contents
   * @param options additional options
   * @returns id of the uploaded file or file object with other data too
   */
  upload(contents:string|object, options?:I_DB_FileOptions): Promise<DB_EntityID|FILE_OBJ_TYPE>;

  /**
   * read files from remote server to object
   * @param file
   */
  getContents(file:FILE_OBJ_TYPE|DB_EntityID): Promise<object>;

  /**
   * return public url to the files
   * (but it could be protected by server)
   * @param file
   */
  getURL(file:FILE_OBJ_TYPE|DB_EntityID): Promise<string>;

  /**
   * Replace file contents with new data, also you can update file record properties in DB
   * @param file
   * @param contents
   * @param props
   * @returns I_DB_File the file object for the updated file.
   */
  replaceContents(file:FILE_OBJ_TYPE|DB_EntityID, contents: string|object, props?:Partial<I_DB_File>):Promise<Partial<I_DB_File>>;

  /**
   * Only update file record properties in DB (not the contents of the file itself)
   * @param file
   * @param props
   */
  updateProps(file:FILE_OBJ_TYPE|DB_EntityID, props:Partial<I_DB_File>):Promise<object>;

}
