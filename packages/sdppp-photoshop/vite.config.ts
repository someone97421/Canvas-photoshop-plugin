import { remoteConfigLoader } from '@sdppp/vite-remote-config-loader/vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';

function reactDevOnlyPlugin() {
  const matcher = /node_modules\/(react|react-dom)\//;
  return {
    name: 'react-dev-only',
    enforce: 'pre',
    transform(code, id) {
      if (!matcher.test(id)) return null;
      return { code: code.replaceAll('process.env.NODE_ENV', '"development"'), map: null };
    }
  };
}

// 自定义插件来处理 sdpppX.js 文件
function sdpppXPlugin() {
  const sdpppXPath = resolve(import.meta.dirname, './plugin/sdpppX.js');
  
  return {
    name: 'sdppp-x-plugin',
    configResolved(config) {
      const isDev = config.command === 'serve';
      
      try {
        let content = readFileSync(sdpppXPath, 'utf-8');
        
        if (isDev) {
          // 开发模式：添加 __CWURL__ 配置
          if (!content.includes('__CWURL__')) {
            content = content.replace(
              'global.sdpppX = {',
              `global.sdpppX = {
  __CWURL__: 'http://localhost:19920/content.html',`
            );
            writeFileSync(sdpppXPath, content, 'utf-8');
            console.log('✅ Added __CWURL__ to sdpppX.js for development');
          }
        } else {
          // 构建模式：移除 __CWURL__ 配置
          if (content.includes('__CWURL__')) {
            content = content.replace(/,\s*__CWURL__:\s*'[^']*'/g, '');
            content = content.replace(/__CWURL__:\s*'[^']*',?\s*/g, '');
            writeFileSync(sdpppXPath, content, 'utf-8');
            console.log('✅ Removed __CWURL__ from sdpppX.js for build');
          }
        }
      } catch (error) {
        console.error('❌ Error modifying sdpppX.js:', error);
      }
    }
  };
}

function moveScriptToBodyPlugin() {
  return {
    name: 'move-script-to-body',
    writeBundle(options) {
      const outDir = options.dir || './plugin/webview';
      const htmlPath = resolve(import.meta.dirname, outDir, 'content.html');
      
      if (existsSync(htmlPath)) {
        try {
          let html = readFileSync(htmlPath, 'utf-8');
          
          // 匹配主脚本标签
          const scriptMatch = html.match(/<script[^>]*type="module"[^>]*src="[^"]*"[^>]*><\/script>/);
          
          if (scriptMatch) {
            const scriptTag = scriptMatch[0];
            
            // 从 head 中移除脚本
            html = html.replace(scriptTag, '');
            
            // 将脚本添加到 body 末尾（在现有脚本之后）
            html = html.replace(
              '</body>',
              '    ' + scriptTag + '\n  </body>'
            );
            
            writeFileSync(htmlPath, html, 'utf-8');
            console.log('✅ Moved main script to body end');
          }
        } catch (error) {
          console.error('❌ Error moving script to body:', error);
        }
      }
    }
  };
}

function sdkPlugin() {
  return {
    name: 'sdk-plugin',
    writeBundle(options) {
      const outDir = options.dir || './plugin/webview';
      const sdkChunkPath = resolve(import.meta.dirname, './src/sdk/sdppp-ps-sdk-chunk.js');
      const targetPath = resolve(import.meta.dirname, outDir, 'sdppp-ps-sdk-chunk.js');
      if (!existsSync(sdkChunkPath)) throw new Error(`缺少 Photoshop SDK: ${sdkChunkPath}`);
      // 上游 src/sdk 中曾保留旧协议版本；必须使用与当前宿主配套的发行 SDK。
      const release = JSON.parse(readFileSync(resolve(import.meta.dirname, './src/sdk/sdk-release.json'), 'utf8'));
      const digest = createHash('sha256').update(readFileSync(sdkChunkPath)).digest('hex');
      if (digest !== release.sha256) throw new Error('Photoshop SDK 与已确认的宿主配套版本不一致，请同步核对 SDK 及 sdk-release.json');
      copyFileSync(sdkChunkPath, targetPath);
      const htmlPath = resolve(import.meta.dirname, outDir, 'content.html');
      if (!existsSync(htmlPath)) throw new Error(`缺少 Webview 入口: ${htmlPath}`);
      const htmlContent = readFileSync(htmlPath, 'utf-8').replace(
        './plugin/webview/sdppp-ps-sdk-chunk.js', './sdppp-ps-sdk-chunk.js',
      );
      writeFileSync(htmlPath, htmlContent, 'utf-8');
      console.log('✅ 已复制 Photoshop SDK 并更新 Webview 引用');
    }
  };
}

function copyPublicAssetsPlugin() {
  return {
    name: 'copy-public-assets',
    writeBundle(options) {
      const outDir = options.dir || './plugin/webview';
      const publicDir = resolve(import.meta.dirname, './public');
      const targetDir = resolve(import.meta.dirname, outDir);

      try {
        // 复制 assets 目录
        const assetsSourceDir = resolve(publicDir, 'assets');
        const assetsTargetDir = resolve(targetDir, 'assets');

        if (existsSync(assetsSourceDir)) {
          // 创建目标目录
          mkdirSync(assetsTargetDir, { recursive: true });

          // 复制 provider-logos 目录
          const logosSourceDir = resolve(assetsSourceDir, 'provider-logos');
          const logosTargetDir = resolve(assetsTargetDir, 'provider-logos');

          if (existsSync(logosSourceDir)) {
            mkdirSync(logosTargetDir, { recursive: true });

            // 复制所有 logo 文件
            const logoFiles = readdirSync(logosSourceDir);
            logoFiles.forEach(file => {
              copyFileSync(
                resolve(logosSourceDir, file),
                resolve(logosTargetDir, file)
              );
            });

            console.log('✅ Copied provider logos to output directory');
          }
        }
      } catch (error) {
        console.error('❌ Error copying public assets:', error);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), reactDevOnlyPlugin(), sdpppXPlugin(), moveScriptToBodyPlugin(), sdkPlugin(), copyPublicAssetsPlugin(),
    remoteConfigLoader({
      configs: [
        {
          id: 'banners',
          url: 'https://sdppp.zombee.tech/banners/banners2.json'
        }
      ]
    })
  ],
  resolve: {
    // Ensure single instances across workspace to keep React/Antd contexts unified
    dedupe: ['react', 'react-dom', 'antd'],
    conditions: ['development', 'browser', 'module']
  },
  define: {
    SDPPP_VERSION: readFileSync(resolve(import.meta.dirname, '../../sdppp_python/version2.txt'), 'utf-8').trim(),
  },
  base: './',
  build: {
    emptyOutDir: false, // 构建前不清理目标目录
    outDir: resolve(import.meta.dirname, './plugin/webview'),
    rollupOptions: {
      input: {
        content: resolve(import.meta.dirname, './content.html'),
      },
      output: {
        // format: 'cjs',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: false,
      },
    },
  },
  server: {
    port: 19920,
  }
});
