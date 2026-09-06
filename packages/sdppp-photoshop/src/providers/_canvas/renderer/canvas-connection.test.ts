import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ catalogs: new Map<string, Promise<any[]>>(), status: vi.fn(), preparing: false, storage: null as string | null }));
vi.mock('@sdppp/common', () => ({ sdpppSDK: { plugins: { photoshop: {
    getStorage: async () => ({ value: mocks.storage }), setStorage: async () => {}, removeStorage: async () => {},
} } } }));
vi.mock('./canvas-run', () => ({ canvasRunStore: { getState: () => ({ preparing: mocks.preparing }) } }));
vi.mock('../client', () => ({
    discoverCanvasBackend: async (url: string) => url,
    CanvasClient: class {
        constructor(readonly baseUrl: string) {}
        getStatus() { mocks.status(this.baseUrl); return Promise.resolve({ version: 'test' }); }
        listImageCapabilities() { return mocks.catalogs.get(this.baseUrl) || Promise.resolve([]); }
        listProjects() { return Promise.resolve([{ id: this.baseUrl, name: this.baseUrl }]); }
    },
}));
import { canvasStore } from './canvas.store';
import { canvasConnectionStore, connectCanvas, initializeCanvasConnection } from './canvas-connection';
beforeEach(() => {
    mocks.catalogs.clear(); mocks.status.mockClear(); mocks.preparing = false; mocks.storage = null;
    canvasStore.setState({ backendUrl: 'http://original', projects: [], capabilities: [], projectId: '', modelId: '', nodeType: '', providerId: '' });
});
describe('画布连接事务', () => {
    it('重复挂载只初始化一次，不重复发现后端', async () => {
        await Promise.all([initializeCanvasConnection(), initializeCanvasConnection()]);
        expect(mocks.status).toHaveBeenCalledOnce();
    });
    it('迟到的旧请求不覆盖新服务和目录', async () => {
        let finish!: (value: any[]) => void;
        mocks.catalogs.set('http://old', new Promise((resolve) => { finish = resolve; }));
        const old = connectCanvas('http://old');
        await connectCanvas('http://new');
        finish([]); await old;
        expect(canvasStore.getState()).toMatchObject({ backendUrl: 'http://new', projectId: 'http://new' });
        expect(canvasConnectionStore.getState()).toMatchObject({ ready: true, loading: false });
    });
    it('区分服务在线与能力目录失败，失败不发布半份目录', async () => {
        mocks.catalogs.set('http://broken', Promise.resolve().then(() => { throw new Error('图片能力未注册'); }));
        await connectCanvas('http://broken');
        expect(canvasConnectionStore.getState()).toMatchObject({ ready: false, error: '加载图片能力失败：图片能力未注册' });
        expect(canvasStore.getState().backendUrl).toBe('http://original');
    });
    it('参考图准备期间不改变连接', async () => {
        mocks.preparing = true;
        await connectCanvas('http://new');
        expect(mocks.status).not.toHaveBeenCalled();
    });
    it('旧草稿迁移保留参数和参考图，并按后端地址隔离', async () => {
        const migrated: any = await canvasStore.persist.getOptions().migrate!({
            backendUrl: 'http://saved', providerId: 'p', nodeType: 'n', modelId: 'm',
            commonValuesByProject: { project: { prompt: '保留提示词', __canvasReferenceImages: ['asset'] } },
            valuesByModel: { 'project::n::m': { resolution: '4K' } },
        }, 0);
        expect(migrated.commonValuesByProject['http://saved::project']).toEqual({ prompt: '保留提示词', __canvasReferenceImages: ['asset'] });
        expect(migrated.valuesByModel['http://saved::project::n::m']).toEqual({ resolution: '4K' });
        expect(migrated.selectionByProvider.p).toEqual({ nodeType: 'n', modelId: 'm' });
    });
    it('损坏的持久化数据显示错误，不永久卡在初始化', async () => {
        mocks.storage = '{invalid'; vi.resetModules();
        const connection = await import('./canvas-connection');
        await connection.initializeCanvasConnection();
        expect(connection.canvasConnectionStore.getState().error).toContain('无法读取已保存');
        expect(connection.canvasConnectionStore.getState().loading).toBe(false);
        expect(mocks.status).not.toHaveBeenCalled();
        await connection.connectCanvas('http://manual');
        expect(connection.canvasConnectionStore.getState().ready).toBe(true);
    });

});
