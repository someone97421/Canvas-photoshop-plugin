import { create } from 'zustand';
import { CanvasClient, discoverCanvasBackend } from '../client';
import { canvasStore, canvasHydration, canvasHydrationError } from './canvas.store';
import { canvasRunStore } from './canvas-run';
import { modelIds } from './canvas-form';

export const canvasConnectionStore = create<{ loading: boolean; ready: boolean; status: string; error: string }>(() => ({
    loading: false, ready: false, status: '', error: '',
}));
let requestId = 0;
let initialized = false;

export async function connectCanvas(url: string | undefined, discover = false) {
    if (canvasRunStore.getState().preparing) return;
    const id = ++requestId;
    initialized = true;
    canvasConnectionStore.setState({ loading: true, ready: false, status: '正在连接画布...', error: '' });
    let stage = '读取本机设置';
    try {
        await canvasHydration;
        if (canvasHydrationError && url === undefined) throw new Error('无法读取已保存的画布设置，请在设置页手动连接');
        if (id !== requestId) return;
        stage = '连接服务';
        const preferredUrl = url ?? canvasStore.getState().backendUrl;
        const resolvedUrl = discover ? await discoverCanvasBackend(preferredUrl) : preferredUrl.trim().replace(/\/+$/, '');
        if (id !== requestId) return;
        const client = new CanvasClient(resolvedUrl);
        const status = await client.getStatus();
        if (id !== requestId) return;
        stage = '加载图片能力';
        const capabilities = await client.listImageCapabilities();
        if (id !== requestId) return;
        stage = '加载项目';
        const loaded = await client.listProjects();
        if (id !== requestId) return;
        const projects = loaded.length ? loaded : [await client.createProject()];
        if (id !== requestId) return;
        const state = canvasStore.getState();
        const sameBackend = state.backendUrl === resolvedUrl;
        const projectId = sameBackend && projects.some((item) => item.id === state.projectId) ? state.projectId : projects[0]?.id || '';
        const capability = capabilities.find((item) => item.nodeType === state.nodeType && item.provider.id === state.providerId)
            || capabilities.find((item) => item.provider.id === state.providerId) || capabilities[0];
        const models = capability ? modelIds(capability) : [];
        const preferred = capability?.definition.dataSchema.properties?.model?.default;
        const modelId = models.some((item) => item.id === state.modelId) ? state.modelId
            : models.find((item) => item.id === preferred)?.id || models[0]?.id || '';
        // 连接、目录及选择作为一个事务发布，避免渲染新服务 + 旧项目。
        canvasStore.setState({ backendUrl: resolvedUrl, projects, capabilities, projectId,
            providerId: capability?.provider.id || '', nodeType: capability?.nodeType || '', modelId,
            selectionByProvider: capability ? { ...state.selectionByProvider, [capability.provider.id]: { nodeType: capability.nodeType, modelId } } : state.selectionByProvider,
        });
        const changedModel = state.modelId && (state.modelId !== modelId || state.nodeType !== capability?.nodeType);
        canvasConnectionStore.setState({ ready: true, status: `已连接画布 ${status.version || ''}，发现 ${capabilities.length} 个图片能力${changedModel ? '；原选择已不可用，请确认当前模型' : ''}` });
    } catch (error) {
        if (id !== requestId) return;
        canvasConnectionStore.setState({ error: `${stage}失败：${error instanceof Error ? error.message : String(error)}`, status: '' });
    } finally {
        if (id === requestId) canvasConnectionStore.setState({ loading: false });
    }
}

export async function initializeCanvasConnection() {
    if (initialized) return;
    await connectCanvas(undefined, true);
}
