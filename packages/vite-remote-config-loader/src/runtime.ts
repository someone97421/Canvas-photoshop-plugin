import type { LoadRemoteConfigOptions, ConfigMetaMap, FallbackDataMap, StorageAdapter } from './types';

// 默认 localStorage 实现
class LocalStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof window === 'undefined') return null;
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('[vite-remote-config-loader] Failed to get item from localStorage:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[vite-remote-config-loader] Failed to set item to localStorage:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (typeof window === 'undefined') return;
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[vite-remote-config-loader] Failed to remove item from localStorage:', error);
    }
  }
}

// 当前使用的存储适配器
let storageAdapter: StorageAdapter = new LocalStorageAdapter();

// 设置存储适配器
export function setStorageAdapter(adapter: StorageAdapter): void {
  storageAdapter = adapter;
}

// 获取当前存储适配器
export function getStorageAdapter(): StorageAdapter {
  return storageAdapter;
}

// 缓存配置元数据和降级数据
let cachedConfigMeta: ConfigMetaMap | null = null;
let cachedFallbackData: FallbackDataMap | null = null;

// 内存缓存存储已加载的数据
const memoryCache = new Map<string, any>();

// 正在更新的配置ID，避免重复请求
const updatingConfigs = new Set<string>();

// 配置最后更新时间缓存，每小时最多更新一次
const lastUpdateTimes = new Map<string, number>();

// 初始化状态
let isInitialized = false;

// 获取配置元数据 - 同步函数
function getConfigMeta(): ConfigMetaMap {
  if (cachedConfigMeta) {
    return cachedConfigMeta;
  }

  // 尝试从全局变量获取
  if (typeof window !== 'undefined' && (window as any).__VITE_REMOTE_CONFIG_META__) {
    cachedConfigMeta = (window as any).__VITE_REMOTE_CONFIG_META__;
    return cachedConfigMeta!;
  }

  console.warn('[vite-remote-config-loader] Config meta not available. Make sure the plugin is configured in vite.config.ts');
  return {};
}

// 获取降级数据 - 同步函数
function getFallbackData(): FallbackDataMap {
  if (cachedFallbackData) {
    return cachedFallbackData;
  }

  // 尝试从全局变量获取
  if (typeof window !== 'undefined' && (window as any).__VITE_REMOTE_CONFIG_FALLBACK__) {
    cachedFallbackData = (window as any).__VITE_REMOTE_CONFIG_FALLBACK__;
    return cachedFallbackData!;
  }

  console.warn('[vite-remote-config-loader] Fallback data not available. Make sure the plugin is configured in vite.config.ts');
  return {};
}

// 从内存缓存获取数据（同步）
function getCachedData(key: string): any | null {
  return memoryCache.get(key) ?? null;
}

// 异步从存储适配器加载数据到内存缓存
async function loadCachedDataToMemory(key: string): Promise<void> {
  try {
    const cached = await storageAdapter.getItem(key);
    if (cached) {
      const data = JSON.parse(cached);
      memoryCache.set(key, data);
    }
  } catch (error) {
    console.warn('[vite-remote-config-loader] Failed to load cached data:', error);
  }
}

// 保存数据到存储适配器和内存缓存
async function setCachedData(key: string, data: any): Promise<void> {
  try {
    // 同时更新内存缓存和持久化存储
    memoryCache.set(key, data);
    await storageAdapter.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn('[vite-remote-config-loader] Failed to cache data:', error);
  }
}

// 后台异步更新配置数据
async function updateConfigInBackground(id: string, url: string, localStorageKey: string): Promise<void> {
  if (updatingConfigs.has(id)) {
    return; // 避免重复请求
  }

  // 检查是否在一小时内已经更新过
  const now = Date.now();
  const lastUpdateTime = lastUpdateTimes.get(id);
  const oneHour = 60 * 60 * 1000; // 1小时的毫秒数
  
  if (lastUpdateTime && (now - lastUpdateTime) < oneHour) {
    console.log(`[vite-remote-config-loader] Config "${id}" was updated recently, skipping remote fetch`);
    return;
  }

  updatingConfigs.add(id);

  try {
    console.log(`[vite-remote-config-loader] Background updating config: ${id} from ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    await setCachedData(localStorageKey, data);
    
    // 更新最后更新时间
    lastUpdateTimes.set(id, now);
    
    console.log(`[vite-remote-config-loader] Successfully updated config: ${id}`);
  } catch (error) {
    console.warn(`[vite-remote-config-loader] Failed to update config: ${id}`, error);
  } finally {
    updatingConfigs.delete(id);
  }
}

/**
 * 加载远程配置数据（同步函数）
 * 立即返回 localStorage 或构建时的数据，同时在后台异步更新 localStorage
 * 
 * @param id 配置ID
 * @param options 选项
 * @returns 配置数据
 */
// 初始化函数 - 预加载所有配置的缓存数据
export async function init(): Promise<void> {
  if (isInitialized) {
    return;
  }

  console.log('[vite-remote-config-loader] Initializing cache...');
  
  try {
    const configMeta = getConfigMeta();
    const loadPromises = Object.values(configMeta).map(meta => 
      loadCachedDataToMemory(meta.localStorageKey)
    );
    
    await Promise.all(loadPromises);
    isInitialized = true;
    
    console.log('[vite-remote-config-loader] Cache initialization completed');
  } catch (error) {
    console.warn('[vite-remote-config-loader] Cache initialization failed:', error);
    isInitialized = true; // 即使失败也标记为已初始化，避免重复尝试
  }
}

export function loadRemoteConfig<T = any>(
  id: string, 
  options: LoadRemoteConfigOptions = {}
): T {
  // 获取配置元数据
  const configMeta = getConfigMeta();
  const meta = configMeta[id];
  
  if (!meta) {
    console.warn(`[vite-remote-config-loader] Configuration "${id}" not found. Available configs:`, Object.keys(configMeta));
    throw new Error(`Configuration with id "${id}" not found. Make sure it's defined in your Vite config.`);
  }

  // 使用选项覆盖默认配置
  const localStorageKey = options.localStorageKey ?? meta.localStorageKey;

  // 1. 优先返回内存缓存中的数据
  const cachedData = getCachedData(localStorageKey);
  if (cachedData !== null) {
    console.log(`[vite-remote-config-loader] Using cached data for config: ${id}`);
    
    // 后台异步更新数据
    updateConfigInBackground(id, meta.url, localStorageKey);
    
    return cachedData;
  }
  
  // 2. 如果没有缓存，使用构建时的降级数据
  const fallbackData = getFallbackData();
  const fallback = fallbackData[id];
  
  if (fallback !== undefined) {
    console.log(`[vite-remote-config-loader] Using fallback data for config: ${id}`);
    
    // 后台异步更新数据
    updateConfigInBackground(id, meta.url, localStorageKey);
    
    return fallback;
  }
  
  // 3. 如果都没有，抛出错误
  throw new Error(`No data available for config: ${id}`);
}