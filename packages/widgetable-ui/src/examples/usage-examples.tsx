import React, { useEffect } from 'react';
import { WidgetableProvider, useWidgetable } from '../context';
import { CustomImagesWidget, CustomMasksWidget, CustomWidgetableProvider, useCustomWidgetRegistration } from './custom-widgets';
import WorkflowEdit from '../index';

// Example 1: Using custom widgets through provider props
export const Example1_ProviderBasedCustomization = () => {
    const customUploader = async (uploadInput: any, signal?: AbortSignal) => {
        // Your custom upload logic here
        return 'uploaded-file-url';
    };

    const customWidgetRegistry = {
        'images': CustomImagesWidget,
        'masks': CustomMasksWidget,
    };

    return (
        <WidgetableProvider uploader={customUploader} widgetRegistry={customWidgetRegistry}>
            <div>
                <h2>Example 1: Custom Widgets via Provider</h2>
                <p>Images and masks widgets are now using custom implementations</p>
                {/* Your WorkflowEdit component here */}
            </div>
        </WidgetableProvider>
    );
};

// Example 2: Runtime widget registration
const RuntimeWidgetRegistrationDemo = () => {
    const { 
        enableCustomImages, 
        enableCustomMasks, 
        disableCustomImages, 
        disableCustomMasks 
    } = useCustomWidgetRegistration();

    return (
        <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
            <h3>Runtime Widget Registration</h3>
            <p>Dynamically switch between default and custom widgets</p>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button 
                    onClick={enableCustomImages}
                    style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    Enable Custom Images
                </button>
                <button 
                    onClick={disableCustomImages}
                    style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    Disable Custom Images
                </button>
                <button 
                    onClick={enableCustomMasks}
                    style={{ padding: '8px 16px', backgroundColor: '#FF9800', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    Enable Custom Masks
                </button>
                <button 
                    onClick={disableCustomMasks}
                    style={{ padding: '8px 16px', backgroundColor: '#9E9E9E', color: 'white', border: 'none', borderRadius: '4px' }}
                >
                    Disable Custom Masks
                </button>
            </div>
        </div>
    );
};

export const Example2_RuntimeRegistration = () => {
    const customUploader = async (uploadInput: any, signal?: AbortSignal) => {
        return 'uploaded-file-url';
    };

    return (
        <WidgetableProvider uploader={customUploader}>
            <div>
                <h2>Example 2: Runtime Widget Registration</h2>
                <RuntimeWidgetRegistrationDemo />
                {/* Your WorkflowEdit component here */}
            </div>
        </WidgetableProvider>
    );
};

// Example 3: Selective widget overriding
export const Example3_SelectiveOverriding = () => {
    const customUploader = async (uploadInput: any, signal?: AbortSignal) => {
        return 'uploaded-file-url';
    };

    // Only override images widget, keep default masks widget
    const partialCustomRegistry = {
        'images': CustomImagesWidget,
        // masks will use default implementation
    };

    return (
        <WidgetableProvider uploader={customUploader} widgetRegistry={partialCustomRegistry}>
            <div>
                <h2>Example 3: Selective Widget Overriding</h2>
                <p>Only images widget is customized, masks uses default implementation</p>
                {/* Your WorkflowEdit component here */}
            </div>
        </WidgetableProvider>
    );
};

// Example 4: Widget registry inspection
const WidgetRegistryInspector = () => {
    const { registry } = useWidgetable();

    return (
        <div style={{ padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
            <h3>Widget Registry Inspector</h3>
            <p>Current registered widgets:</p>
            <ul>
                {Object.keys(registry).map(widgetType => (
                    <li key={widgetType}>
                        <strong>{widgetType}</strong>: {registry[widgetType] ? '✅ Registered' : '❌ Not found'}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export const Example4_RegistryInspection = () => {
    const customUploader = async (uploadInput: any, signal?: AbortSignal) => {
        return 'uploaded-file-url';
    };

    return (
        <WidgetableProvider uploader={customUploader}>
            <div>
                <h2>Example 4: Widget Registry Inspection</h2>
                <WidgetRegistryInspector />
            </div>
        </WidgetableProvider>
    );
};

// Example 5: Using the custom provider wrapper
export const Example5_CustomProviderWrapper = () => {
    const customUploader = async (uploadInput: any, signal?: AbortSignal) => {
        return 'uploaded-file-url';
    };

    return (
        <div>
            <h2>Example 5: Custom Provider Wrapper</h2>
            
            <div style={{ marginBottom: '30px' }}>
                <h3>With Default Widgets</h3>
                <CustomWidgetableProvider uploader={customUploader} useCustomWidgets={false}>
                    <div style={{ padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                        Default images and masks widgets are used here
                    </div>
                </CustomWidgetableProvider>
            </div>

            <div>
                <h3>With Custom Widgets</h3>
                <CustomWidgetableProvider uploader={customUploader} useCustomWidgets={true}>
                    <div style={{ padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
                        Custom images and masks widgets are used here
                    </div>
                </CustomWidgetableProvider>
            </div>
        </div>
    );
};

// Main example app
export const WidgetableExtensibilityExamples = () => {
    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>Widgetable System - Extensibility Examples</h1>
            <p>These examples demonstrate how to extend the widgetable system with custom widgets.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                <Example1_ProviderBasedCustomization />
                <Example2_RuntimeRegistration />
                <Example3_SelectiveOverriding />
                <Example4_RegistryInspection />
                <Example5_CustomProviderWrapper />
            </div>
        </div>
    );
};