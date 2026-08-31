export interface RemoteConfigItem {
  /** 配置的唯一标识符 */
  id: string;
  /** 远程配置的 URL */
  url: string;
  /** localStorage 存储的 key，默认使用 `remote-config-${id}` */
  localStorageKey?: string;
}

export interface RemoteConfigLoaderOptions {
  /** 远程配置列表 */
  configs: RemoteConfigItem[];
  /** 全局默认 localStorage key 前缀，默认 'remote-config' */
  defaultLocalStorageKey?: string;
}

export interface LoadRemoteConfigOptions {
  /** localStorage key，会覆盖配置中的默认值 */
  localStorageKey?: string;
}

export interface ConfigMeta {
  id: string;
  url: string;
  localStorageKey: string;
}

export interface ConfigMetaMap {
  [id: string]: ConfigMeta;
}

export interface FallbackDataMap {
  [id: string]: any;
}

// StorageAdapter interface - moved here to avoid circular dependency
export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}
