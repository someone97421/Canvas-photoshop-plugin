import { sdpppSDK } from '@sdppp/common';
import { Task } from '../base/Task';
import { buildCanvasAssetCatalogPath, resolveCanvasOutputMetadata } from './output-metadata';

export interface CanvasProject {
    id: string;
    name: string;
    description?: string;
    updatedAt: number;
}

export interface CanvasProvider {
    id: string;
    name: string;
    description?: string;
    supportedTypes: Array<'image' | 'video' | 'audio'>;
}

export interface CanvasModel {
    id: string;
    name: string;
    description?: string;
}

export interface CanvasSchemaProperty {
    type: string;
    default?: unknown;
    ui?: {
        widget?: string;
        label?: string;
        placeholder?: string;
        rows?: number;
        min?: number;
        max?: number;
        step?: number;
        options?: Array<{ label: string; value: string | number }>;
        dependencies?: {
            field: string;
            mapping: Record<string, Array<{ label: string; value: string | number }>>;
        };
        visibleWhen?: {
            field: string;
            values: Array<string | number | boolean>;
        };
        hiddenWhen?: {
            field: string;
            values: Array<string | number | boolean>;
        };
    };
}

export interface CanvasNodeDefinition {
    id: string;
    name: string;
    description?: string;
    inputs: Array<{ id: string; name: string; type: string; required?: boolean; maxCount?: number }>;
    outputs: Array<{ id: string; name: string; type: string }>;
    dataSchema: { properties?: Record<string, CanvasSchemaProperty> };
}

export interface CanvasImageCapability {
    nodeType: string;
    provider: CanvasProvider;
    models: CanvasModel[];
    definition: CanvasNodeDefinition;
    defaults?: Record<string, unknown>;
    documentedModels?: CanvasDocumentedModel[];
}

export interface CanvasDocumentedModel {
    id: string;
    label: string;
    parameterMode?: 'pixel-size' | 'resolution-ratio';
    resolutionSizes?: Record<string, Record<string, string>>;
    resolutionRatios?: Record<string, string[]>;
    defaultResolution?: string;
    qualityOptions?: string[];
    defaultQuality?: string;
    responseFormats?: string[];
    supportsCustomSize?: boolean;
}

export interface CanvasGraphNode {
    id: string;
    type: string;
    ui: { x: number; y: number; label?: string; nodeType?: string };
    data: Record<string, unknown>;
}

export interface CanvasProjectGraph {
    projectId: string;
    nodes: CanvasGraphNode[];
    edges: CanvasGraphEdge[];
}

export interface CanvasGraphEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface CanvasAsset {
    id: string;
    projectId: string;
    filename: string;
    originalName?: string;
    mimeType?: string;
    status: 'processing' | 'ready' | 'failed';
    error?: string;
    thumbnailPath?: string | null;
    width?: number;
    height?: number;
}

export interface CanvasTaskData {
    id: string;
    nodeId: string;
    projectId: string;
    providerId: string;
    modelId: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    progress: number;
    result: {
        outputAssetIds: string[];
        outputPaths: string[];
        primaryOutputAssetId?: string;
        error?: string;
    } | null;
}

interface CanvasResponse<T> {
    success: boolean;
    data: T;
    error?: string;
    errors?: Array<{ message?: string }>;
}

interface CanvasUploadInput {
    type: 'buffer' | 'token' | 'resource';
    tokenOrBuffer?: unknown;
    resource?: string;
    resourceId?: string;
    fileName: string;
    mimeType?: string;
}

function normalizeBaseUrl(value: string): string {
    const url = value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) throw new Error('后端地址必须以 http:// 或 https:// 开头');
    return url;
}

function errorMessage(body: CanvasResponse<unknown>, status?: number): string {
    const details = body.errors?.map((item) => item.message).filter(Boolean).join('；');
    return details || body.error || `Canvas 请求失败${status ? ` (${status})` : ''}`;
}

function createId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function encodeResourceToken(resource: string): string {
    return btoa(resource);
}

export class CanvasClient {
    readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = normalizeBaseUrl(baseUrl);
        sdpppSDK.plugins.fetchProxy.registerProxyDomains(new URL(this.baseUrl).hostname);
    }

    private async request<T>(path: string, init?: {
        method?: string;
        body?: Record<string, unknown>;
        signal?: AbortSignal;
    }): Promise<T> {
        const result = await sdpppSDK.plugins.photoshop.proxiedFetch({
            url: `${this.baseUrl}${path}`,
            method: init?.method || 'GET',
            headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
            body: init?.body,
            bodyType: init?.body ? 'json' : undefined,
        }, init?.signal);
        const body = result.data as CanvasResponse<T> | undefined;
        if (!result.success || !body || body.success === false) {
            throw new Error(body ? errorMessage(body, result.status) : result.error || `Canvas 请求失败 (${result.status || 0})`);
        }
        return body.data;
    }

    async getStatus(signal?: AbortSignal): Promise<{ status: string; version?: string }> {
        const result = await sdpppSDK.plugins.photoshop.proxiedFetch({
            url: `${this.baseUrl}/api/system/status`, method: 'GET', headers: { Accept: 'application/json' },
        }, signal);
        if (!result.success || result.data?.status !== 'ok') throw new Error(result.error || `Canvas 连接失败 (${result.status || 0})`);
        return result.data;
    }

    listProjects(): Promise<CanvasProject[]> {
        return this.request('/api/projects');
    }

    createProject(name = 'Photoshop 生成'): Promise<CanvasProject> {
        return this.request('/api/projects', { method: 'POST', body: { name, description: '由画布插件创建' } });
    }

    getProjectGraph(projectId: string): Promise<CanvasProjectGraph> {
        return this.request(`/api/projects/${encodeURIComponent(projectId)}/graph`);
    }

    listImageCapabilities(): Promise<CanvasImageCapability[]> {
        return this.request('/api/providers/image-capabilities');
    }

    async uploadAsset(projectId: string, input: CanvasUploadInput, signal?: AbortSignal): Promise<CanvasAsset> {
        const resource = input.resource || input.resourceId || (typeof input.tokenOrBuffer === 'string' ? input.tokenOrBuffer : '');
        if (!resource) throw new Error('无法读取 Photoshop 图片资源');
        const result = await sdpppSDK.plugins.photoshop.proxiedFetch({
            url: `${this.baseUrl}/api/projects/${encodeURIComponent(projectId)}/assets`,
            method: 'POST',
            headers: { Accept: 'application/json' },
            bodyType: 'formData',
            body: [[
                'file',
                { type: 'file', data: encodeResourceToken(resource), name: input.fileName, mimeType: 'image/uxp' },
            ]],
        }, signal);
        const body = result.data as CanvasResponse<CanvasAsset> | undefined;
        if (!result.success || !body || body.success === false) {
            throw new Error(body ? errorMessage(body, result.status) : result.error || `Canvas 资产上传失败 (${result.status || 0})`);
        }
        return this.waitForAsset(projectId, body.data.id, signal);
    }

    async createGenerationGraph(
        projectId: string,
        capability: CanvasImageCapability,
        modelId: string,
        values: Record<string, unknown>,
        assetIds: string[],
        signal?: AbortSignal,
    ): Promise<string> {
        const graph = await this.request<CanvasProjectGraph>(`/api/projects/${encodeURIComponent(projectId)}/graph`, { signal });
        const rightmost = graph.nodes.reduce((max, node) => Math.max(max, Number(node.ui?.x) || 0), 0);
        const baseX = graph.nodes.length ? rightmost + 360 : 80;
        const baseY = graph.nodes.reduce((max, node) => Math.max(max, Number(node.ui?.y) || 0), 80);
        const generationNodeId = createId('ps-generation');
        const assets = await Promise.all(assetIds.map((assetId) => this.getAsset(projectId, assetId)));
        const assetNodes: CanvasGraphNode[] = assets.map((asset, index) => ({
            id: createId('ps-asset'),
            type: 'image-asset',
            ui: { x: baseX, y: baseY + index * 220, label: `Photoshop 参考图 ${index + 1}` },
            data: { assetId: asset.id, filename: asset.filename, status: asset.status },
        }));
        const generationNode: CanvasGraphNode = {
            id: generationNodeId,
            type: capability.nodeType,
            ui: {
                x: baseX + (assetNodes.length ? 360 : 0),
                y: baseY,
                label: `Photoshop · ${modelId}`,
                nodeType: capability.nodeType,
            },
            data: {
                ...capability.defaults,
                ...values,
                nodeType: capability.nodeType,
                provider: capability.provider.id,
                model: modelId,
                inputAssetOrder: assetNodes.map((node) => node.id),
            },
        };
        const edges: CanvasGraphEdge[] = assetNodes.map((node) => ({
            id: createId('ps-edge'), source: node.id, target: generationNodeId,
        }));
        await this.request(`/api/projects/${encodeURIComponent(projectId)}/graph/items`, {
            method: 'POST',
            body: { mutationId: createId('photoshop'), nodes: [...assetNodes, generationNode], edges },
            signal,
        });
        return generationNodeId;
    }

    async run(projectId: string, nodeId: string): Promise<Task<Array<{
        url: string;
        fileName?: string;
        thumbnail?: string;
        width?: number;
        height?: number;
    }>>> {
        const created = await this.request<CanvasTaskData>(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
            method: 'POST', body: { nodeId },
        });
        const task = new Task<Array<{
            url: string;
            fileName?: string;
            thumbnail?: string;
            width?: number;
            height?: number;
        }>>(created.id, {
            statusGetter: async (taskId) => {
                const current = await this.getTask(projectId, taskId);
                return {
                    isCompleted: ['succeeded', 'failed', 'canceled'].includes(current.status),
                    progress: current.progress,
                    progressMessage: this.statusMessage(current),
                    rawData: current,
                };
            },
            resultGetter: async (_taskId, status) => {
                const completed = status.rawData as CanvasTaskData;
                if (completed.status === 'failed') throw new Error(completed.result?.error || 'Canvas 生成任务失败');
                if (completed.status === 'canceled') throw new Error('Canvas 生成任务已取消');
                const outputIds = completed.result?.outputAssetIds || [];
                const primaryId = completed.result?.primaryOutputAssetId;
                const orderedIds = primaryId ? [primaryId, ...outputIds.filter((id) => id !== primaryId)] : outputIds;
                if (!orderedIds.length) throw new Error('Canvas 任务成功，但没有返回图片资产');
                const generatedAssets = await this.listAssets(projectId, true).catch(() => []);
                const generatedAssetById = new Map(generatedAssets.map((asset) => [asset.id, asset]));
                return Promise.all(orderedIds.map(async (assetId) => {
                    const index = outputIds.indexOf(assetId);
                    const outputPath = index >= 0 ? completed.result?.outputPaths[index] : undefined;
                    const outputAsset = generatedAssetById.get(assetId);
                    const metadata = resolveCanvasOutputMetadata(outputPath, outputAsset);
                    const outputUrl = `${this.baseUrl}/outputs/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`;
                    return {
                        url: metadata.fileName ? `${outputUrl}?filename=${encodeURIComponent(metadata.fileName)}` : outputUrl,
                        fileName: metadata.fileName,
                        thumbnail: metadata.thumbnailPath
                            ? `${this.baseUrl}/thumbnails/${encodeURIComponent(projectId)}/${encodeURIComponent(metadata.thumbnailPath)}`
                            : undefined,
                        width: metadata.width,
                        height: metadata.height,
                    };
                }));
            },
            canceler: async (taskId) => {
                await this.request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
            },
        });
        task.taskName = `Canvas - ${created.modelId || nodeId}`;
        task.metadata = { provider: 'canvas', projectId, nodeId };
        return task;
    }

    private async waitForAsset(projectId: string, assetId: string, signal?: AbortSignal): Promise<CanvasAsset> {
        while (true) {
            if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
            const asset = await this.request<CanvasAsset>(`/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, { signal });
            if (asset.status === 'ready') return asset;
            if (asset.status === 'failed') throw new Error(asset.error || 'Canvas 资产处理失败');
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }

    private getTask(projectId: string, taskId: string): Promise<CanvasTaskData> {
        return this.request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`);
    }

    private listAssets(projectId: string, includeGenerated = false): Promise<CanvasAsset[]> {
        return this.request(buildCanvasAssetCatalogPath(projectId, includeGenerated));
    }

    private getAsset(projectId: string, assetId: string): Promise<CanvasAsset> {
        return this.request(`/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`);
    }

    private statusMessage(task: CanvasTaskData): string {
        if (task.status === 'queued') return 'Canvas 任务排队中';
        if (task.status === 'running') return `Canvas 生成中 (${task.progress}%)`;
        if (task.status === 'succeeded') return 'Canvas 生成完成';
        if (task.status === 'canceled') return 'Canvas 任务已取消';
        return task.result?.error || 'Canvas 生成失败';
    }
}

async function canConnect(url: string, timeoutMs = 700): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        await new CanvasClient(url).getStatus(controller.signal);
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

export async function discoverCanvasBackend(preferredUrl: string): Promise<string> {
    const normalizedPreferred = normalizeBaseUrl(preferredUrl);
    if (await canConnect(normalizedPreferred)) return normalizedPreferred;
    const candidates = [
        'http://127.0.0.1:48051',
        ...Array.from({ length: 201 }, (_, index) => `http://127.0.0.1:${56888 + index}`),
    ].filter((url, index, values) => url !== normalizedPreferred && values.indexOf(url) === index);
    for (let index = 0; index < candidates.length; index += 20) {
        const batch = candidates.slice(index, index + 20);
        const results = await Promise.all(batch.map(async (url) => ({ url, found: await canConnect(url) })));
        const match = results.find((item) => item.found);
        if (match) return match.url;
    }
    throw new Error('未找到 Canvas 后端，请启动画布或填写当前启动器端口');
}
