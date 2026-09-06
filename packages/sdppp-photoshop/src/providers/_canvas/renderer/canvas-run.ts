import { create } from 'zustand';
import { sdpppSDK } from '@sdppp/common';
import { buildBoundaryUri } from '@sdppp/resourcing/src/resource-uris';
import { MainStore } from '../../../tsx/App.store';
import type { Task } from '../../base/Task';
import type { CanvasClient, CanvasImageCapability } from '../client';
import { referenceIds, referenceInput, submissionValues } from './canvas-form';

type Output = { url: string; fileName?: string; thumbnail?: string; width?: number; height?: number };
export const canvasRunStore = create<{
    running: boolean; preparing: boolean; progress: number; status: string; error: string; label: string;
}>(() => ({ running: false, preparing: false, progress: 0, status: '', error: '', label: '' }));
let controller: AbortController | null = null;
let activeTask: Task<Output[]> | null = null;
let cancelUploads: (() => void) | null = null;

export async function cancelCanvasRun() {
    if (!canvasRunStore.getState().running) return;
    controller?.abort();
    cancelUploads?.();
    canvasRunStore.setState({ status: '正在取消画布任务...' });
    try { if (activeTask?.cancelable) await activeTask.cancel(); }
    catch (error) { canvasRunStore.setState({ error: `取消请求失败：${String(error)}` }); }
}

export async function startCanvasRun(input: {
    client: CanvasClient; projectId: string; capability: CanvasImageCapability; modelId: string;
    projectName?: string;
    values: Record<string, unknown>;
    waitUploads: (signal: AbortSignal) => Promise<readonly string[] | void>;
    readReferences: () => unknown;
    cancelUploads: () => void;
}) {
    if (canvasRunStore.getState().running) return;
    const { client, projectId, modelId } = input;
    const capability = structuredClone(input.capability);
    const values = structuredClone(input.values);
    // 在任何异步上传前固定目标文档、边界和本次参数。
    const docId = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID ?? 0;
    const boundary = sdpppSDK.stores.WebviewStore.getState()?.workBoundaries?.[docId] ?? null;
    const boundaryUri = buildBoundaryUri(docId, boundary);
    const runController = new AbortController();
    controller = runController;
    cancelUploads = input.cancelUploads;
    canvasRunStore.setState({ running: true, preparing: true, progress: 0, error: '',
        label: `${capability.provider.name} · ${capability.models.find((model) => model.id === modelId)?.name || modelId} · ${input.projectName || projectId}`,
        status: '正在准备 Photoshop 参考图...',
    });
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
        const uploaded = await input.waitUploads(runController.signal);
        runController.signal.throwIfAborted();
        const assets = referenceIds(input.readReferences());
        if (uploaded?.some((asset) => !assets.includes(asset)))
            throw new Error('参考图在上传期间发生变化，请确认当前参考图后重新生成');
        const imageInput = referenceInput(capability, modelId);
        if (!imageInput && assets.length) throw new Error('当前能力不支持参考图，请移除参考图后重试');
        if (imageInput?.required && !assets.length) throw new Error('当前能力需要参考图');
        if (imageInput?.maxCount !== undefined && assets.length > imageInput.maxCount)
            throw new Error(`当前能力最多使用 ${imageInput.maxCount} 张参考图，当前为 ${assets.length} 张，请调整后重试`);
        canvasRunStore.setState({ preparing: false, status: '正在画布中创建节点...' });
        cancelUploads = null;
        const nodeId = await client.createGenerationGraph(projectId, capability, modelId,
            submissionValues(capability, modelId, values), assets, runController.signal);
        runController.signal.throwIfAborted();
        const task = await client.run(projectId, nodeId);
        activeTask = task;
        void task.promise.catch(() => undefined);
        // 任务创建响应与取消可能交错；拿到 ID 后补发取消并继续收尾。
        if (runController.signal.aborted) await task.cancel();
        interval = setInterval(() => canvasRunStore.setState({ progress: task.progress || 0,
            status: task.progressMessage || '画布任务执行中...',
        }), 250);
        const outputs = await task.promise;
        runController.signal.throwIfAborted();
        await Promise.all(outputs.map((output) => MainStore.getState().downloadAndAppendImage({
            ...output, source: 'canvas', docId, boundaryUri, maskUri: null, maskHandle: null,
        })));
        canvasRunStore.setState({ progress: 100, status: `生成完成，已接收 ${outputs.length} 张图片` });
    } catch (error) {
        canvasRunStore.setState(runController.signal.aborted
            ? { status: '画布任务已取消' }
            : { status: '', error: error instanceof Error ? error.message : String(error) });
    } finally {
        runController.abort();
        cancelUploads?.();
        if (interval) clearInterval(interval);
        if (activeTask) await sdpppSDK.plugins.photoshop.taskRemove({ taskId: activeTask.taskId }).catch(() => undefined);
        activeTask = null;
        controller = null;
        cancelUploads = null;
        canvasRunStore.setState({ running: false, preparing: false });
    }
}
