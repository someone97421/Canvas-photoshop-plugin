# vite-remote-config-loader

A Vite plugin for loading remote JSON configuration files with intelligent fallback strategy. Perfect for dynamic configuration management in production environments.

## Features

- 🚀 **Zero Local Files**: No configuration files stored in your project
- ⚡ **Smart Fallback**: Automatic fallback to localStorage cache and build-time snapshots
- 🔧 **TypeScript Support**: Full TypeScript support with type definitions
- 🎯 **Intelligent Caching**: Automatic localStorage caching with configurable keys
- ⏱️ **Timeout Control**: Configurable timeout for remote requests
- 🛡️ **Error Resilient**: Graceful degradation when remote configs are unavailable

## Installation

```bash
npm install vite-remote-config-loader
# or
yarn add vite-remote-config-loader
# or
pnpm add vite-remote-config-loader
```

## Usage

### 1. Vite Configuration

Configure the plugin in your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { remoteConfigLoader } from 'vite-remote-config-loader/vite';

export default defineConfig({
  plugins: [
    remoteConfigLoader({
      configs: [
        {
          id: 'app-config',
          url: 'https://your-api.com/config.json',
          timeout: 100, // optional, defaults to 100ms
          localStorageKey: 'my-app-config' // optional
        },
        {
          id: 'feature-flags',
          url: 'https://your-api.com/feature-flags.json'
        }
      ],
      // Global defaults (optional)
      defaultTimeout: 100,
      defaultLocalStorageKey: 'remote-config'
    })
  ]
});
```

### 2. Runtime Usage

Use the `loadRemoteConfig` function in your application:

```typescript
import { loadRemoteConfig } from 'vite-remote-config-loader';

// Basic usage
async function initApp() {
  try {
    const config = await loadRemoteConfig('app-config');
    console.log('App config:', config);
    
    const flags = await loadRemoteConfig('feature-flags');
    console.log('Feature flags:', flags);
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// With custom options
async function loadConfigWithOptions() {
  const config = await loadRemoteConfig('app-config', {
    timeout: 200, // Override default timeout
    localStorageKey: 'custom-cache-key' // Override default cache key
  });
  
  return config;
}

// With TypeScript types
interface AppConfig {
  apiUrl: string;
  version: string;
  features: string[];
}

async function loadTypedConfig() {
  const config = await loadRemoteConfig<AppConfig>('app-config');
  // config is now typed as AppConfig
  console.log(config.apiUrl);
}
```

## How It Works

The plugin implements a three-tier fallback strategy:

### 1. Build Time
- Downloads remote configurations during Vite build process
- Stores snapshots as virtual modules in your bundle
- No local files created in your project

### 2. Runtime Priority
When `loadRemoteConfig()` is called:

1. **Remote First**: Attempts to fetch the latest config from the remote URL
2. **Cache Fallback**: If remote fails, uses localStorage cached data
3. **Build Snapshot**: If cache is empty, uses the build-time snapshot

### 3. Caching Strategy
- Successful remote requests are automatically cached in localStorage
- Cache keys are configurable per config
- Cache survives browser sessions

## Configuration Options

### Plugin Options

```typescript
interface RemoteConfigLoaderOptions {
  configs: RemoteConfigItem[];
  defaultTimeout?: number; // Default: 100ms
  defaultLocalStorageKey?: string; // Default: 'remote-config'
}

interface RemoteConfigItem {
  id: string; // Unique identifier
  url: string; // Remote config URL
  timeout?: number; // Request timeout in ms
  localStorageKey?: string; // Custom cache key
}
```

### Runtime Options

```typescript
interface LoadRemoteConfigOptions {
  timeout?: number; // Override config timeout
  localStorageKey?: string; // Override cache key
}
```

## Error Handling

The plugin gracefully handles various error scenarios:

- **Network failures**: Falls back to cached or build-time data
- **Timeout exceeded**: Uses fallback data immediately
- **Invalid JSON**: Logs error and uses fallback
- **Missing config**: Throws descriptive error

```typescript
try {
  const config = await loadRemoteConfig('app-config');
} catch (error) {
  if (error.message.includes('not found')) {
    // Config ID not defined in Vite config
  } else {
    // Other errors (network, parsing, etc.)
  }
}
```

## Examples

### Basic App Configuration

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    remoteConfigLoader({
      configs: [
        {
          id: 'app-settings',
          url: 'https://api.example.com/app-settings.json'
        }
      ]
    })
  ]
});

// main.ts
const settings = await loadRemoteConfig('app-settings');
```

### Feature Flags with Fast Timeout

```typescript
// vite.config.ts
remoteConfigLoader({
  configs: [
    {
      id: 'feature-flags',
      url: 'https://feature-service.com/flags.json',
      timeout: 50 // Fast timeout for feature flags
    }
  ]
})

// app.ts
const flags = await loadRemoteConfig('feature-flags');
if (flags.newFeatureEnabled) {
  // Enable new feature
}
```

### Multiple Environments

```typescript
const API_BASE = process.env.NODE_ENV === 'production' 
  ? 'https://api.prod.com' 
  : 'https://api.dev.com';

remoteConfigLoader({
  configs: [
    {
      id: 'app-config',
      url: `${API_BASE}/config.json`
    }
  ]
})
```

## TypeScript Support

The package includes full TypeScript support:

```typescript
// Type your configurations
interface MyConfig {
  theme: 'light' | 'dark';
  apiEndpoints: {
    users: string;
    posts: string;
  };
}

const config = await loadRemoteConfig<MyConfig>('my-config');
// config is now fully typed
```

## Best Practices

1. **Keep timeouts short** (50-200ms) for better user experience
2. **Use descriptive config IDs** that match their purpose
3. **Structure your remote JSON** consistently across environments  
4. **Handle errors gracefully** in your application logic
5. **Test offline scenarios** to ensure fallbacks work correctly

## License

MIT