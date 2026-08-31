import { useState } from "react";
import CanvasPanel from "./CanvasPanel.js";
import { Content } from "./Content.js";
import { SDPPP, SDPPPProvider } from "./SDPPPInternalBridge.js";

export default function Main() {
    const [providerMode, setProviderMode] = useState<'canvas' | 'sdppp'>('canvas');
    return (
        <div className="container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
                <sp-button
                    variant={providerMode === 'canvas' ? 'accent' : 'secondary'}
                    onClick={() => setProviderMode('canvas')}
                >Canvas</sp-button>
                <sp-button
                    variant={providerMode === 'sdppp' ? 'accent' : 'secondary'}
                    onClick={() => setProviderMode('sdppp')}
                >ComfyUI / RunningHub</sp-button>
            </div>
            {providerMode === 'canvas' ? <CanvasPanel /> : (
                <SDPPPProvider loginAppID={''}>
                    <SDPPP
                    renderContent={(
                        connectState,
                        AddressBar,
                        WorkflowEditPhotoshop
                    ) => {
                        return (
                            <Content
                                connectState={connectState}
                                AddressBar={AddressBar}
                                WorkflowEditPhotoshop={WorkflowEditPhotoshop}
                            />
                        )
                    }}
                    />
                </SDPPPProvider>
            )}
        </div>
    )
}
