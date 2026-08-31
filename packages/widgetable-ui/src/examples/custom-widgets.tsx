import React from 'react';
import { WidgetRenderer, WidgetRegistry } from '../widget-registry';
import { WidgetableProvider, useWidgetable } from '../context';
import { WidgetableImagesWidget } from "@sdppp/common/schemas/schemas";

// Example: Custom Images Widget with enhanced UI
export const CustomImagesWidget: WidgetRenderer = ({ fieldInfo, widget, widgetIndex, value, onValueChange, extraOptions }) => {
    const imageWidget = widget as WidgetableImagesWidget;
    
    return (
        <div style={{ 
            border: '2px dashed #4CAF50', 
            borderRadius: '8px', 
            padding: '16px',
            backgroundColor: '#f0f8f0'
        }}>
            <h4 style={{ color: '#2E7D32' }}>🖼️ Custom Images Widget</h4>
            <p>Enhanced image selector with custom styling</p>
            {/* Here you would implement your custom image selection logic */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Array.isArray(value) && value.map((img: any, idx: number) => (
                    <div key={idx} style={{ 
                        width: '60px', 
                        height: '60px', 
                        backgroundColor: '#ddd',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        📷
                    </div>
                ))}
                <button 
                    style={{ 
                        width: '60px', 
                        height: '60px', 
                        border: '2px dashed #4CAF50',
                        backgroundColor: 'transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '24px'
                    }}
                    onClick={() => {
                        // Custom image selection logic here
                        const newImage = {
                            url: 'custom-image-url',
                            thumbnail: 'custom-thumbnail-url',
                            source: 'custom'
                        };
                        if (imageWidget.options?.maxCount && imageWidget.options.maxCount > 1) {
                            onValueChange([...(value || []), newImage]);
                        } else {
                            onValueChange([newImage]);
                        }
                    }}
                >
                    +
                </button>
            </div>
        </div>
    );
};

// Example: Custom Masks Widget with AI-powered features
export const CustomMasksWidget: WidgetRenderer = ({ fieldInfo, widget, widgetIndex, value, onValueChange, extraOptions }) => {
    return (
        <div style={{ 
            border: '2px dashed #FF9800', 
            borderRadius: '8px', 
            padding: '16px',
            backgroundColor: '#fff8e1'
        }}>
            <h4 style={{ color: '#E65100' }}>🎭 AI-Powered Masks Widget</h4>
            <p>Smart mask generation with AI assistance</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {value && (
                    <div style={{ 
                        width: '100px', 
                        height: '100px', 
                        backgroundColor: '#333',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white'
                    }}>
                        🎭 Mask
                    </div>
                )}
                
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        style={{ 
                            padding: '8px 12px',
                            backgroundColor: '#FF9800',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                        onClick={() => {
                            // Custom mask generation logic
                            const newMask = {
                                url: 'ai-generated-mask-url',
                                thumbnail: 'ai-mask-thumbnail-url',
                                source: 'ai-generated'
                            };
                            onValueChange(newMask);
                        }}
                    >
                        🤖 Generate AI Mask
                    </button>
                    
                    <button 
                        style={{ 
                            padding: '8px 12px',
                            backgroundColor: '#757575',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                        onClick={() => {
                            // Manual mask selection logic
                            const manualMask = {
                                url: 'manual-mask-url',
                                thumbnail: 'manual-mask-thumbnail-url',
                                source: 'manual'
                            };
                            onValueChange(manualMask);
                        }}
                    >
                        ✏️ Manual Selection
                    </button>
                </div>
            </div>
        </div>
    );
};

// Example: How to use custom widget registry
export const createCustomWidgetRegistry = (): WidgetRegistry => {
    return {
        'images': CustomImagesWidget,
        'masks': CustomMasksWidget,
    };
};

// Example: Custom Provider wrapper that extends the default registry
interface CustomWidgetableProviderProps {
    children: React.ReactNode;
    uploader: (uploadInput: any, signal?: AbortSignal) => Promise<string>;
    useCustomWidgets?: boolean;
}

export const CustomWidgetableProvider: React.FC<CustomWidgetableProviderProps> = ({ 
    children, 
    uploader, 
    useCustomWidgets = false 
}) => {
    const customRegistry = useCustomWidgets ? createCustomWidgetRegistry() : undefined;
    
    return (
        <WidgetableProvider 
            uploader={uploader} 
            widgetRegistry={customRegistry}
        >
            {children}
        </WidgetableProvider>
    );
};

// Example: Runtime widget registration hook
export const useCustomWidgetRegistration = () => {
    const { registerWidget, unregisterWidget } = useWidgetable();
    
    const enableCustomImages = () => {
        registerWidget('images', CustomImagesWidget);
    };
    
    const enableCustomMasks = () => {
        registerWidget('masks', CustomMasksWidget);
    };
    
    const disableCustomImages = () => {
        unregisterWidget('images');
    };
    
    const disableCustomMasks = () => {
        unregisterWidget('masks');
    };
    
    return {
        enableCustomImages,
        enableCustomMasks,
        disableCustomImages,
        disableCustomMasks,
    };
};