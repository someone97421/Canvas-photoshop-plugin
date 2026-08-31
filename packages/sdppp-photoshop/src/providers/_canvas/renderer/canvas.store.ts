import { sdpppSDK } from '@sdppp/common';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CanvasImageCapability, CanvasProject } from '../client';

interface CanvasStoreState {
    backendUrl: string;
    projectId: string;
    providerId: string;
    nodeType: string;
    modelId: string;
    projects: CanvasProject[];
    capabilities: CanvasImageCapability[];
    valuesByModel: Record<string, Record<string, unknown>>;
    setBackendUrl: (backendUrl: string) => void;
    setProjectId: (projectId: string) => void;
    setSelection: (providerId: string, nodeType: string, modelId: string) => void;
    setCatalog: (projects: CanvasProject[], capabilities: CanvasImageCapability[]) => void;
    setValues: (key: string, values: Record<string, unknown>) => void;
}

export const canvasStore = create<CanvasStoreState>()(persist((set) => ({
    backendUrl: 'http://127.0.0.1:48051',
    projectId: '',
    providerId: '',
    nodeType: '',
    modelId: '',
    projects: [],
    capabilities: [],
    valuesByModel: {},
    setBackendUrl: (backendUrl) => set({ backendUrl }),
    setProjectId: (projectId) => set({ projectId }),
    setSelection: (providerId, nodeType, modelId) => set({ providerId, nodeType, modelId }),
    setCatalog: (projects, capabilities) => set({ projects, capabilities }),
    setValues: (key, values) => set((state) => ({ valuesByModel: { ...state.valuesByModel, [key]: values } })),
}), {
    name: 'canvas-provider-store-v2',
    storage: createJSONStorage(() => ({
        getItem: async (key) => {
            const result = await sdpppSDK.plugins.photoshop.getStorage({ key });
            return result.error ? null : result.value;
        },
        setItem: async (key, value) => { await sdpppSDK.plugins.photoshop.setStorage({ key, value }); },
        removeItem: async (key) => { await sdpppSDK.plugins.photoshop.removeStorage({ key }); },
    })),
    partialize: (state) => ({
        backendUrl: state.backendUrl,
        projectId: state.projectId,
        providerId: state.providerId,
        nodeType: state.nodeType,
        modelId: state.modelId,
        valuesByModel: state.valuesByModel,
    }),
}));
