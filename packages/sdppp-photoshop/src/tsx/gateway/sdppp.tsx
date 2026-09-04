import { useStore } from "zustand";
import { Providers, PROVIDER_METADATA } from "../../providers";
import { MainStore } from "../App.store";
import { Button, Flex, Select, Tooltip } from "antd";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sdpppSDK } from '@sdppp/common';

export function SDPPPGateway() {
    const provider = MainStore(state => state.provider)
    const [settingsOpen, setSettingsOpen] = useState(false)
    // Select only the nested field we care about to avoid re-renders from whole-object identity changes
    const forceProvider = useStore(sdpppSDK.stores.PhotoshopStore, state => state.sdpppX?.["settings.forceProvider"])
    const settingsOpenNonce = useStore(
        sdpppSDK.stores.PhotoshopStore,
        (state: any) => state.canvasSettingsOpenNonce as number | undefined,
    )
    const lastSettingsOpenNonce = useRef(settingsOpenNonce)
    // Removed tracking logs; keep minimal state

    const Renderer = useMemo(() => {
        // Backward compatibility: map old 'Google' key to 'CustomAPI'
        const key = provider
        return key && Providers[key as keyof typeof Providers] ? Providers[key as keyof typeof Providers].Renderer : null
    }, [provider])
    useEffect(()=> {
        if (forceProvider && forceProvider !== provider) {
            const mapped = forceProvider === 'Google' ? 'CustomAPI' : forceProvider
            MainStore.setState({ provider: mapped as (keyof typeof Providers) | '' })
        }
    }, [forceProvider])

    useEffect(() => {
        if (settingsOpenNonce && settingsOpenNonce !== lastSettingsOpenNonce.current) {
            setSettingsOpen(true);
        }
        lastSettingsOpenNonce.current = settingsOpenNonce;
    }, [settingsOpenNonce]);

    // Removed render tracking
    
    const providerSelector = !forceProvider ? (
        <Select
            className="app-select"
            showSearch={true}
            value={provider || undefined}
            placeholder="选择服务类型"
            onChange={value => MainStore.setState({ provider: value as (keyof typeof Providers) | '' })}
            options={Object.keys(Providers).map(key => ({ value: key, label: PROVIDER_METADATA[key].name }))}
        />
    ) : null;

    if (settingsOpen) {
        return <Flex vertical gap={8} className="gateway-settings-page">
            <Flex align="center" justify="space-between">
                <span className="gateway-settings-page__title">设置</span>
                <Tooltip title="返回生成页面">
                    <Button
                        type="text"
                        icon={<ArrowLeft size={16} />}
                        onClick={() => setSettingsOpen(false)}
                    >
                        返回生成
                    </Button>
                </Tooltip>
            </Flex>
            {providerSelector}
            {provider === 'Canvas' && Renderer ? <Renderer showingPreview={true} /> : null}
        </Flex>;
    }

    return <>{Renderer && <Renderer showingPreview={false} />}</>;
}
