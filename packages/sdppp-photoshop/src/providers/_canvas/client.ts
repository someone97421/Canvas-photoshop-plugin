import { sdpppSDK } from '@sdppp/common';
import { Task } from '../base/Task';

export interface CanvasProject {
    id: string;
    name: string;
    description?: string;
    updatedAt: number;
}

export interface CanvasGraphNode {
    id: string;
    type: string;
    ui: { label?: string };
    data: Record<string, unknown>;
}

export interface CanvasProjectGraph {
    projectId: string;
    nodes: CanvasGraphNode[];
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

function normalizeBaseUrl(value: string): string {
    const url = value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
        throw new Error('后端地址必须以 http:// 或 https:// 开头');
    }
    return url;
}

function errorMessage(body: CanvasResponse<unknown>, status?: number): string {
    const details = body.errors?.map((item) => item.message).filter(Boolean).join('；');
    return details || body.error || `Canvas 请求失败${status ? ` (${status})` : ''}`;
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
            url: `${this.baseUrl}/api/system/status`,
            method: 'GET',
            headers: { Accept: 'application/json' },
        }, signal);
        if (!result.success || result.data?.status !== 'ok') {
            throw new Error(result.error || `Canvas 连接失败 (${result.status || 0})`);
        }
        return result.data;
    }

    listProjects(): Promise<CanvasProject[]> {
        return this.request('/api/projects');
    }

    getProjectGraph(projectId: string): Promise<CanvasProjectGraph> {
        return this.request(`/api/projects/${encodeURIComponent(projectId)}/graph`);
    }

    async listImageNodeTypes(): Promise<Set<string>> {
        const capabilities = await this.request<Array<{ nodeType: string }>>('/api/providers/image-capabilities');
        return new Set(capabilities.map((item) => item.nodeType));
    }

    async run(projectId: string, nodeId: string): Promise<Task<Array<{ url: string; fileName?: string }>>> {
        const created = await this.request<CanvasTaskData>(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
            method: 'POST',
            body: { nodeId },
        });

        const task = new Task<Array<{ url: string; fileName?: string }>>(created.id, {
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
                const orderedIds = primaryId
                    ? [primaryId, ...outputIds.filter((id) => id !== primaryId)]
                    : outputIds;
                if (orderedIds.length === 0) throw new Error('Canvas 任务成功，但没有返回图片资产');

                return orderedIds.map((assetId) => {
                    const index = outputIds.indexOf(assetId);
                    const outputPath = index >= 0 ? completed.result?.outputPaths[index] : undefined;
                    return {
                        url: `${this.baseUrl}/outputs/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}`,
                        fileName: outputPath ? outputPath.split(/[\\/]/).pop() : undefined,
                    };
                });
            },
            canceler: async (taskId) => {
                await this.request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
                    method: 'DELETE',
                });
            },
        });
        task.taskName = `Canvas - ${created.modelId || nodeId}`;
        task.metadata = { provider: 'canvas', projectId, nodeId };
        return task;
    }

    private getTask(projectId: string, taskId: string): Promise<CanvasTaskData> {
        return this.request(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`);
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
