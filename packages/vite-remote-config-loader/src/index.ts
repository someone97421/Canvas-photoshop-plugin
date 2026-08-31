// 运行时 API
export { loadRemoteConfig, init } from './runtime';
export { setStorageAdapter } from './runtime';

// 类型导出
export type {
  RemoteConfigItem,
  RemoteConfigLoaderOptions,
  LoadRemoteConfigOptions,
  ConfigMeta,
  ConfigMetaMap,
  FallbackDataMap,
  StorageAdapter
} from './types';