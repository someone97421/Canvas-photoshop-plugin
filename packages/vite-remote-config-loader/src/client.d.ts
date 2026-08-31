// 虚拟模块类型声明 - 仅用于使用此包的项目
declare module 'virtual:remote-configs-meta' {
  interface ConfigMeta {
    id: string;
    url: string;
    timeout: number;
    localStorageKey: string;
  }

  interface ConfigMetaMap {
    [id: string]: ConfigMeta;
  }

  const meta: ConfigMetaMap;
  export default meta;
}

declare module 'virtual:remote-configs-fallback' {
  interface FallbackDataMap {
    [id: string]: any;
  }

  const fallbackData: FallbackDataMap;
  export default fallbackData;
}