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
    selectionByProvider: Record<string, { nodeType: string; modelId: string }>;
    projects: CanvasProject[];
    capabilities: CanvasImageCapability[];
    commonValuesByProject: Record<string, Record<string, unknown>>;
    valuesByModel: Record<string, Record<string, unknown>>;
    setBackendUrl: (backendUrl: string) => void;
    setProjectId: (projectId: string) => void;
    setSelection: (providerId: string, nodeType: string, modelId: string) => void;
    setCatalog: (projects: CanvasProject[], capabilities: CanvasImageCapability[]) => void;
    setCommonValues: (projectId: string, values: Record<string, unknown>) => void;
    setValues: (key: string, values: Record<string, unknown>) => void;
}

let finishHydration: () => void;
export let canvasHydrationError: unknown;
export const canvasHydration = new Promise<void>((resolve) => { finishHydration = resolve; });

export const canvasStore = create<CanvasStoreState>()(persist((set) => ({
    backendUrl: 'http://127.0.0.1:48051',
    projectId: '',
    providerId: '',
    nodeType: '',
    modelId: '',
    selectionByProvider: {},
    projects: [],
    capabilities: [],
    commonValuesByProject: {},
    valuesByModel: {},
    setBackendUrl: (backendUrl) => set({ backendUrl }),
    setProjectId: (projectId) => set({ projectId }),
    setSelection: (providerId, nodeType, modelId) => set((state) => ({ providerId, nodeType, modelId, selectionByProvider: { ...state.selectionByProvider, [providerId]: { nodeType, modelId } } })),
    setCatalog: (projects, capabilities) => set({ projects, capabilities }),
    setCommonValues: (projectId, values) => set((state) => ({
        commonValuesByProject: { ...state.commonValuesByProject, [projectId]: values },
    })),
    setValues: (key, values) => set((state) => ({ valuesByModel: { ...state.valuesByModel, [key]: values } })),
}), {
    name: 'canvas-provider-store-v2',
    onRehydrateStorage: () => (_state, error) => {
        canvasHydrationError = error;
        finishHydration();
    },
    version: 1,
    migrate: (persisted: any) => {
        const backend = persisted?.backendUrl || 'http://127.0.0.1:48051';
        const scope = (entries: Record<string, Record<string, unknown>> = {}) => Object.fromEntries(
            Object.entries(entries).map(([key, value]) => [`${backend}::${key}`, value]),
        );
        return { ...persisted, commonValuesByProject: scope(persisted?.commonValuesByProject),
            valuesByModel: scope(persisted?.valuesByModel), selectionByProvider: persisted?.selectionByProvider || (persisted?.providerId ? {
                [persisted.providerId]: { nodeType: persisted.nodeType, modelId: persisted.modelId },
            } : {}),
        };
    },
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
        commonValuesByProject: state.commonValuesByProject,
        valuesByModel: state.valuesByModel,
        selectionByProvider: state.selectionByProvider,
    }),
}));
