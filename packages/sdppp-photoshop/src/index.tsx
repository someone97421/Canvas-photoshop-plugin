import './wdyr'
import './polyfill';
import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { setStorageAdapter, init as initRemoteConfig } from '@sdppp/vite-remote-config-loader'
import './sdk/sdppp-ps-sdk.js'
import { changeLanguage } from '@sdppp/common/i18n/core';


declare const sdpppSDK: any;
const startup = (window as any).__canvasStartup;

function StartupComplete() {
    useEffect(() => { startup?.done(); }, []);
    return null;
}

(async () => {
    startup?.stage('连接 Photoshop 宿主');
    await sdpppSDK.init();
    setStorageAdapter({
        getItem: async (key) => {
            const result = await sdpppSDK.plugins.photoshop.getStorage({ key });
            return result.error ? null : result.value;
        },
        setItem: async (key, value) => {
            await sdpppSDK.plugins.photoshop.setStorage({ key, value });
        },
        removeItem: async (key) => {
            await sdpppSDK.plugins.photoshop.removeStorage({ key });
        }
    })

    let lastLocale = 'en-US';
    // await new Promise((resolve) => {
        sdpppSDK.stores.PhotoshopStore.subscribe((state: any) => {
            // resolve(true);
            if (state.locale && state.locale !== lastLocale) {
                changeLanguage(state.locale);
                lastLocale = state.locale;
            }
        });
    // })

    startup?.stage('读取插件配置');
    await initRemoteConfig();
    startup?.stage('加载生成界面');
    const { default: App } = await import('./tsx/App.tsx')

    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <App />
            <StartupComplete />
        </StrictMode>,
    )
})().catch((error) => {
    console.error(error);
    startup?.fail(error);
})
