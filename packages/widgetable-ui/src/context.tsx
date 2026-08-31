import React, { createContext, useContext, useState, ReactNode } from 'react';
import { debug } from 'debug';
import { WidgetRegistry, WidgetRenderer, WidgetRegistryContextType, createDefaultWidgetRegistry } from './widget-registry';

const log = debug('widgetable:context');

// 定义Context的类型
interface WidgetableContextType extends WidgetRegistryContextType {
}

// 创建Context
const WidgetableContext = createContext<WidgetableContextType | undefined>(undefined);

// Provider组件的Props类型
interface WidgetableProviderProps {
    children: ReactNode;
    widgetRegistry?: WidgetRegistry;
}

// Provider组件
export function WidgetableProvider({ children, widgetRegistry: initialRegistry }: WidgetableProviderProps) {
    const [registry, setRegistry] = useState<WidgetRegistry>(() => ({
        ...createDefaultWidgetRegistry(),
        ...initialRegistry
    }));

    const value: WidgetableContextType = {
        registry,
        registerWidget: (widgetType: string, renderer: WidgetRenderer) => {
            setRegistry(prev => ({
                ...prev,
                [widgetType]: renderer
            }));
        },
        unregisterWidget: (widgetType: string) => {
            setRegistry(prev => {
                const newRegistry = { ...prev };
                delete newRegistry[widgetType];
                return newRegistry;
            });
        },
        getWidgetRenderer: (widgetType: string) => {
            return registry[widgetType] || null;
        },
        // 移除上传队列逻辑，仅保留 Widget 注册与检索
    };

    return (
        <WidgetableContext.Provider value={value}>
            {children}
        </WidgetableContext.Provider>
    );
}

// 自定义Hook：使用Context
export function useWidgetable() {
    const context = useContext(WidgetableContext);
    if (context === undefined) {
        throw new Error('useWidgetable must be used within a WidgetableProvider');
    }
    return context;
}
