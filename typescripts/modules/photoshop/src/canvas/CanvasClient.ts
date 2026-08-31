export interface CanvasProject {
    id: string;
    name: string;
    description?: string;
    updatedAt: number;
}

export interface CanvasAsset {
    id: string;
    projectId: string;
    filename: string;
    originalName: string;
    type: 'image' | 'video' | 'audio';
    status: 'ready' | 'processing' | 'failed';
    size: number;
    width?: number;
    height?: number;
}

export interface CanvasGraphNode {
    id: string;
    type: string;
    ui: { x: number; y: number; width?: number; height?: number };
    data: Record<string, unknown>;
    createdAt?: number;
    updatedAt?: number;
}

export interface CanvasProjectGraph {
    projectId: string;
    nodes: CanvasGraphNode[];
    edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
    viewport: { x: number; y: number; zoom: number };
}

export interface CanvasTask {
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

export interface CanvasProvider {
    id: string;
    name: string;
    description?: string;
}

export interface CanvasModel {
    id: string;
    name: string;
    description?: string;
}

export interface CanvasSchemaOption {
    label: string;
    value: string | number;
}

export interface CanvasSchemaProperty {
    type: string;
    default?: unknown;
    ui?: {
        widget?: string;
        label?: string;
        placeholder?: string;
        min?: number;
        max?: number;
        step?: number;
        options?: CanvasSchemaOption[];
        dependencies?: {
            field: string;
            mapping: Record<string, CanvasSchemaOption[]>;
        };
    };
}

export interface CanvasImageCapability {
    nodeType: string;
    provider: CanvasProvider;
    models: CanvasModel[];
    definition: {
        id: string;
        name: string;
        description?: string;
        inputs?: Array<{ id: string; name: string; type: string; required?: boolean; maxCount?: number }>;
        dataSchema?: {
            properties?: Record<string, CanvasSchemaProperty>;
        };
    };
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

interface CanvasResponse<T> {
    success: boolean;
    data: T;
    error?: string;
}

async function parseResponse<T>(response: Response): Promise<CanvasResponse<T> & { errors?: Array<{ message?: string }> }> {
    const text = await response.text();
    try {
        return JSON.parse(text) as CanvasResponse<T> & { errors?: Array<{ message?: string }> };
    } catch {
        throw new Error(`Canvas 返回了无效响应 (${response.status})${text ? `：${text.slice(0, 160)}` : ''}`);
    }
}

function normalizeBaseUrl(value: string): string {
    const url = value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
        throw new Error('后端地址必须以 http:// 或 https:// 开头');
    }
    return url;
}

async function request<T>(baseUrl: string, path: string): Promise<T> {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
    });
    const body = await parseResponse<T>(response);
    if (!response.ok || body.success === false) {
        throw new Error(body.error || `请求失败 (${response.status})`);
    }
    return body.data;
}

async function send<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, { credentials: 'include', ...init });
    const body = await parseResponse<T>(response);
    if (!response.ok || body.success === false) {
        const details = body.errors?.map((item) => item.message).filter(Boolean).join('；');
        throw new Error(details || body.error || `请求失败 (${response.status})`);
    }
    return body.data;
}

export async function testCanvasConnection(baseUrl: string): Promise<string> {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/system/status`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
    });
    if (!response.ok) throw new Error(`连接失败 (${response.status})`);
    const status = await response.json() as { status?: string; version?: string };
    if (status.status !== 'ok') throw new Error('后端未返回正常状态');
    return status.version ? `连接成功，Canvas ${status.version}` : '连接成功';
}

async function hasCanvasBackend(baseUrl: string, timeoutMs = 700): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/system/status`, { signal: controller.signal });
        if (!response.ok) return false;
        const status = await response.json() as { status?: string };
        return status.status === 'ok';
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

export async function discoverCanvasBackend(preferredUrl: string): Promise<string> {
    if (await hasCanvasBackend(preferredUrl)) return normalizeBaseUrl(preferredUrl);
    const ports = Array.from({ length: 201 }, (_, index) => 56888 + index);
    for (let index = 0; index < ports.length; index += 20) {
        const candidates = ports.slice(index, index + 20).map((port) => `http://127.0.0.1:${port}`);
        const results = await Promise.all(candidates.map(async (url) => ({ url, found: await hasCanvasBackend(url) })));
        const found = results.find((result) => result.found);
        if (found) return found.url;
    }
    throw new Error('未找到 Canvas 后端，请启动画布或手动设置后端地址');
}

export function listCanvasProjects(baseUrl: string): Promise<CanvasProject[]> {
    return request<CanvasProject[]>(baseUrl, '/api/projects');
}

export function listImageCapabilities(baseUrl: string): Promise<CanvasImageCapability[]> {
    return request<CanvasImageCapability[]>(baseUrl, '/api/providers/image-capabilities');
}

export function getProjectGraph(baseUrl: string, projectId: string): Promise<CanvasProjectGraph> {
    return request<CanvasProjectGraph>(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/graph`);
}

export async function uploadCanvasAsset(
    baseUrl: string,
    projectId: string,
    bytes: Uint8Array,
    filename: string,
    mimeType: 'image/png' | 'image/jpeg',
): Promise<CanvasAsset> {
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: mimeType }), filename);
    return send<CanvasAsset>(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/assets`, {
        method: 'POST',
        body: formData,
    });
}

export async function waitForCanvasAsset(
    baseUrl: string,
    projectId: string,
    assetId: string,
    timeoutMs = 60_000,
): Promise<CanvasAsset> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const asset = await request<CanvasAsset>(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`);
        if (asset.status === 'ready') return asset;
        if (asset.status === 'failed') throw new Error('画布资产处理失败');
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('等待画布资产处理超时');
}

export function addGraphItems(
    baseUrl: string,
    projectId: string,
    payload: {
        mutationId: string;
        nodes: CanvasGraphNode[];
        edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
    },
): Promise<{ nodes: CanvasGraphNode[]; replayed: boolean }> {
    return send(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/graph/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export function createCanvasTask(baseUrl: string, projectId: string, nodeId: string): Promise<CanvasTask> {
    return send(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
    });
}

export function getCanvasTask(baseUrl: string, projectId: string, taskId: string): Promise<CanvasTask> {
    return request(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`);
}

export async function waitForCanvasTask(
    baseUrl: string,
    projectId: string,
    taskId: string,
    onUpdate: (task: CanvasTask) => void,
    signal?: AbortSignal,
    timeoutMs = 6 * 60 * 60 * 1_000,
): Promise<CanvasTask> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (signal?.aborted) throw new Error('已停止本地等待，画布任务仍会继续运行');
        const task = await getCanvasTask(baseUrl, projectId, taskId);
        onUpdate(task);
        if (task.status === 'succeeded') return task;
        if (task.status === 'failed') throw new Error(task.result?.error || '画布生成任务失败');
        if (task.status === 'canceled') throw new Error('画布生成任务已取消');
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error('等待画布任务超时，任务仍可能在后端继续运行');
}

export async function downloadOutputAsset(baseUrl: string, projectId: string, assetId: string): Promise<Uint8Array> {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/outputs/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`, {
        credentials: 'include',
    });
    if (!response.ok) throw new Error(`下载生成结果失败 (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
}

export async function downloadOutputAsPng(baseUrl: string, projectId: string, assetId: string): Promise<Uint8Array> {
    const converted = await send<CanvasAsset>(baseUrl, `/api/projects/${encodeURIComponent(projectId)}/assets/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, sourceKind: 'output', format: 'png' }),
    });
    try {
        const response = await fetch(`${normalizeBaseUrl(baseUrl)}/assets/${encodeURIComponent(projectId)}/${encodeURIComponent(converted.filename)}`, {
            credentials: 'include',
        });
        if (!response.ok) throw new Error(`下载 PNG 结果失败 (${response.status})`);
        return new Uint8Array(await response.arrayBuffer());
    } finally {
        void fetch(`${normalizeBaseUrl(baseUrl)}/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(converted.id)}`, {
            method: 'DELETE',
            credentials: 'include',
        }).catch(() => {});
    }
}
