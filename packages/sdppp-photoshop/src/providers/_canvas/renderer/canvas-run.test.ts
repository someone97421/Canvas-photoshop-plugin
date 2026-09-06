import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasClient, CanvasImageCapability } from '../client';

const host = vi.hoisted(() => ({ documentId: 8, append: vi.fn(async () => {}), remove: vi.fn(async () => {}) }));
vi.mock('@sdppp/common', () => ({ sdpppSDK: {
    stores: { PhotoshopStore: { getState: () => ({ activeDocumentID: host.documentId }) },
        WebviewStore: { getState: () => ({ workBoundaries: { 8: { width: 64, height: 32 } } }) } },
    plugins: { photoshop: { taskRemove: host.remove } },
} }));
vi.mock('@sdppp/resourcing/src/resource-uris', () => ({ buildBoundaryUri: (id: number, boundary: unknown) => JSON.stringify({ id, boundary }) }));
vi.mock('../../../tsx/App.store', () => ({ MainStore: { getState: () => ({ downloadAndAppendImage: host.append }) } }));
import { canvasRunStore, cancelCanvasRun, startCanvasRun } from './canvas-run';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}
const capability: CanvasImageCapability = {
    nodeType: 'image', provider: { id: 'p', name: 'Provider', supportedTypes: ['image'] }, models: [{ id: 'a', name: 'A' }],
    definition: { id: 'image', name: 'Image', inputs: [{ id: 'image', name: 'Image', type: 'image', maxCount: 1 }], outputs: [],
        dataSchema: { properties: { prompt: { type: 'string' } } } },
};
function input() {
    const task = { taskId: 'task1', cancelable: true, cancel: vi.fn(async () => {}), promise: Promise.resolve([{ url: 'output' }]), progress: 20 };
    const client = { createGenerationGraph: vi.fn(async () => 'node1'), run: vi.fn(async () => task) };
    return { client: client as unknown as CanvasClient, projectId: 'project1', capability,
        modelId: 'a', values: { prompt: '原提示词' }, waitUploads: vi.fn(async () => {}),
        readReferences: () => ['uploaded-reference'], cancelUploads: vi.fn(), task, mocks: client };
}
beforeEach(() => { vi.clearAllMocks(); host.documentId = 8; canvasRunStore.setState({ running: false, preparing: false, error: '', label: '' }); });

describe('画布任务快照与生命周期', () => {
    it('上传期间的表单与活动文档变化不改变任务快照', async () => {
        const options = input();
        const upload = deferred<void>();
        options.waitUploads = vi.fn(() => upload.promise);
        const pending = startCanvasRun(options);
        expect(canvasRunStore.getState().preparing).toBe(true);
        options.values.prompt = '下一次的提示词';
        host.documentId = 9;
        upload.resolve();
        await pending;
        expect(options.mocks.createGenerationGraph).toHaveBeenCalledWith('project1', capability, 'a', { prompt: '原提示词' }, ['uploaded-reference'], expect.any(AbortSignal));
        expect(host.append).toHaveBeenCalledWith(expect.objectContaining({ docId: 8, boundaryUri: JSON.stringify({ id: 8, boundary: { width: 64, height: 32 } }) }));
        expect(canvasRunStore.getState()).toMatchObject({ running: false, progress: 100 });
    });
    it('任务创建响应前取消，拿到 ID 后补发取消并清理', async () => {
        const options = input();
        const created = deferred<typeof options.task>();
        options.mocks.run.mockImplementation(() => created.promise);
        const pending = startCanvasRun(options);
        await vi.waitFor(() => expect(options.mocks.run).toHaveBeenCalled());
        await cancelCanvasRun();
        created.resolve(options.task);
        await pending;
        expect(options.task.cancel).toHaveBeenCalledOnce();
        expect(host.append).not.toHaveBeenCalled();
        expect(host.remove).toHaveBeenCalledWith({ taskId: 'task1' });
        expect(canvasRunStore.getState()).toMatchObject({ running: false, status: '画布任务已取消' });
    });
    it('超限参考图明确报错，不创建超出界面能力的任务', async () => {
        const options = input();
        options.readReferences = () => ['one', 'two'];
        await startCanvasRun(options);
        expect(options.mocks.createGenerationGraph).not.toHaveBeenCalled();
        expect(canvasRunStore.getState().error).toContain('最多使用 1 张');
    });
    it('运行中的任务不被第二次提交覆盖', async () => {
        const options = input(); const upload = deferred<void>();
        options.waitUploads = vi.fn(() => upload.promise);
        const pending = startCanvasRun(options);
        await startCanvasRun(input());
        expect(options.waitUploads).toHaveBeenCalledOnce();
        upload.resolve(); await pending;
        expect(host.append).toHaveBeenCalledOnce();
    });
    it('上传结果未写回时明确失败，不使用旧参考图提交', async () => {
        const options = input();
        await startCanvasRun({ ...options, waitUploads: async () => ['new-asset'], readReferences: () => ['old-asset'] });
        expect(options.mocks.createGenerationGraph).not.toHaveBeenCalled();
        expect(canvasRunStore.getState().error).toContain('参考图在上传期间发生变化');
    });
});
