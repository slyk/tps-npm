import { IPlatformAPI, IFormData, IResponse } from './platform-types.js';

class BrowserPlatformAPI implements IPlatformAPI {
  async createFormData(): Promise<IFormData> {
    return new ((globalThis as any).FormData)();
  }

  async createResponse(body: any): Promise<IResponse> {
    return new ((globalThis as any).Response)(body);
  }

  async isReadableStream(obj: any): Promise<boolean> {
    return !!(globalThis as any).ReadableStream && obj instanceof (globalThis as any).ReadableStream;
  }
}

class NodePlatformAPI implements IPlatformAPI {
  private NodeFormData: any;
  private NodeResponse: any;
  private isInitialized = false;
  private initPromise: Promise<void>;

  constructor() {
    // Инициализируем сразу, но асинхронно
    this.initPromise = this.initializeNodeModules();
  }

  private async initializeNodeModules(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Проверяем, что мы действительно в Node.js
      const isNode = typeof process !== 'undefined' &&
                     process.versions != null &&
                     process.versions.node != null;

      if (!isNode) return;

      // Загружаем модули только в среде Node.js
      try {
        const formdataModule = await import('formdata-node');
        this.NodeFormData = formdataModule.FormData;

        const fetchModule = await import('@web-std/fetch');
        this.NodeResponse = fetchModule.Response;

        this.isInitialized = true;
      } catch (e) {
        console.warn('Optional Node.js modules for @toopro/db not found. Install formdata-node, @web-std/fetch, and stream packages if needed in Node.js environment.');
      }
    } catch (e) {
      // В браузере это может выдать ошибку, но мы ее подавляем
      console.debug('Running in browser environment, Node.js modules not available');
    }
  }

  async createFormData(): Promise<IFormData> {
    await this.initPromise;

    if (this.NodeFormData) {
      return new this.NodeFormData();
    }

    // Фолбэк для браузера или если модуль не загрузился
    return new ((globalThis as any).FormData)();
  }

  async createResponse(body: any): Promise<IResponse> {
    await this.initPromise;

    if (this.NodeResponse) {
      return new this.NodeResponse(body);
    }

    // Фолбэк для браузера или если модуль не загрузился
    return new ((globalThis as any).Response)(body);
  }

  async isReadableStream(obj: any): Promise<boolean> {
    await this.initPromise;

    // Проверка только для глобального ReadableStream в среде выполнения
    return !!(globalThis as any).ReadableStream && obj instanceof (globalThis as any).ReadableStream;
  }
}

// Определяем платформу, используя globalThis
export const platformIsBrowser = typeof (globalThis as any).window !== 'undefined' &&
                  !!(globalThis as any).window &&
                  !!(globalThis as any).window.FormData;

// Создаем экземпляр API в зависимости от окружения
export const platformAPI: IPlatformAPI = platformIsBrowser
  ? new BrowserPlatformAPI()
  : new NodePlatformAPI();
