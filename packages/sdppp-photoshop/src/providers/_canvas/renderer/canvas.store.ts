import { sdpppSDK } from '@sdppp/common';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CanvasGraphNode, CanvasProject } from '../client';

interface CanvasStoreState {
    backendUrl: string;
    projectId: string;
    nodeId: string;
    projects: CanvasProject[];
    nodes: CanvasGraphNode[];
    setBackendUrl: (backendUrl: string) => void;
    setProjectId: (projectId: string) => void;
    setNodeId: (nodeId: string) => void;
    setCatalog: (projects: CanvasProject[], nodes?: CanvasGraphNode[]) => void;
    setNodes: (nodes: CanvasGraphNode[]) => void;
}

export const canvasStore = create<CanvasStoreState>()(persist((set) => ({
    backendUrl: 'http://127.0.0.1:48051',
    projectId: '',
    nodeId: '',
    projects: [],
    nodes: [],
    setBackendUrl: (backendUrl) => set({ backendUrl }),
    setProjectId: (projectId) => set({ projectId, nodeId: '', nodes: [] }),
    setNodeId: (nodeId) => set({ nodeId }),
    setCatalog: (projects, nodes = []) => set({ projects, nodes }),
    setNodes: (nodes) => set({ nodes }),
}), {
    name: 'canvas-provider-store',
    storage: createJSONStorage(() => ({
        getItem: async (key) => {
            const result = await sdpppSDK.plugins.photoshop.getStorage({ key });
            return result.error ? null : result.value;
        },
        setItem: async (key, value) => {
            await sdpppSDK.plugins.photoshop.setStorage({ key, value });
        },
        removeItem: async (key) => {
            await sdpppSDK.plugins.photoshop.removeStorage({ key });
        },
    })),
    partialize: (state) => ({
        backendUrl: state.backendUrl,
        projectId: state.projectId,
        nodeId: state.nodeId,
    }),
}));
