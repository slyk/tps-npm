// src/@toopro/db/src/lib/utils/platform-types.ts
export interface IFormData {
  append(name: string, value: string | Blob, fileName?: string): void;
}

export interface IResponse {
  blob(): Promise<Blob>;
}

export interface IReadableStream {
  getReader(): any;
}

export interface IPlatformAPI {
  createFormData(): Promise<IFormData>;
  createResponse(body: any): Promise<IResponse>;
  isReadableStream(obj: any): Promise<boolean>;
}