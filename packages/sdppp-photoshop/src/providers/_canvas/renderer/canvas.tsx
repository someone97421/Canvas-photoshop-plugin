import { sdpppSDK } from '@sdppp/common';
import { buildBoundaryUri } from '@sdppp/resourcing/src/resource-uris';
import { Alert, Button, Flex, Input, Progress, Select, Typography } from 'antd';
import { RefreshCw, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MainStore } from '../../../tsx/App.store';
import type { Task } from '../../base/Task';
import { CanvasClient, discoverCanvasBackend, type CanvasGraphNode } from '../client';
import { canvasStore } from './canvas.store';

const { Text } = Typography;

function nodeLabel(node: CanvasGraphNode): string {
    const model = typeof node.data.model === 'string' ? node.data.model : '';
    return node.ui?.label || model || `${node.type} · ${node.id.slice(0, 8)}`;
}

export default function CanvasRenderer({ showingPreview }: { showingPreview: boolean }) {
    const {
        backendUrl, projectId, nodeId, projects, nodes,
        setBackendUrl, setProjectId, setNodeId, setCatalog, setNodes,
    } = canvasStore();
    const [draftUrl, setDraftUrl] = useState(backendUrl);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const activeTaskRef = useRef<Task<Array<{ url: string; fileName?: string }>> | null>(null);
    const downloadAndAppendImage = MainStore((state) => state.downloadAndAppendImage);
    const client = useMemo(() => new CanvasClient(backendUrl), [backendUrl]);

    const loadNodes = async (nextClient: CanvasClient, nextProjectId: string) => {
        if (!nextProjectId) {
            setNodes([]);
            return;
        }
        const [graph, imageNodeTypes] = await Promise.all([
            nextClient.getProjectGraph(nextProjectId),
            nextClient.listImageNodeTypes(),
        ]);
        const availableNodes = graph.nodes.filter((node) => imageNodeTypes.has(node.type));
        setNodes(availableNodes);
        if (!availableNodes.some((node) => node.id === canvasStore.getState().nodeId)) {
            setNodeId(availableNodes[0]?.id || '');
        }
    };

    const connect = async (discover = false) => {
        setLoading(true);
        setError('');
        setStatus(discover ? '正在查找 Canvas 后端...' : '正在连接 Canvas...');
        try {
            const resolvedUrl = discover ? await discoverCanvasBackend(draftUrl) : draftUrl.trim().replace(/\/+$/, '');
            const nextClient = new CanvasClient(resolvedUrl);
            const [serverStatus, nextProjects] = await Promise.all([
                nextClient.getStatus(),
                nextClient.listProjects(),
            ]);
            const nextProjectId = nextProjects.some((project) => project.id === canvasStore.getState().projectId)
                ? canvasStore.getState().projectId
                : nextProjects[0]?.id || '';
            setBackendUrl(resolvedUrl);
            setDraftUrl(resolvedUrl);
            setCatalog(nextProjects);
            if (nextProjectId !== canvasStore.getState().projectId) setProjectId(nextProjectId);
            await loadNodes(nextClient, nextProjectId);
            setStatus(`已连接 Canvas ${serverStatus.version || ''}`.trim());
        } catch (connectError) {
            setStatus('');
            setError(connectError instanceof Error ? connectError.message : String(connectError));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void connect(true);
    }, []);

    const changeProject = async (value: string) => {
        setProjectId(value);
        setLoading(true);
        setError('');
        try {
            await loadNodes(client, value);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError));
        } finally {
            setLoading(false);
        }
    };

    const run = async () => {
        if (!projectId || !nodeId) return;
        setLoading(true);
        setError('');
        setProgress(0);
        setStatus('正在创建 Canvas 任务...');

        const docId = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID ?? 0;
        const webviewState = sdpppSDK.stores.WebviewStore.getState();
        const boundary = webviewState?.workBoundaries?.[docId] ?? null;
        const boundaryUri = buildBoundaryUri(docId, boundary);

        try {
            const task = await client.run(projectId, nodeId);
            activeTaskRef.current = task;
            const interval = setInterval(() => {
                setProgress(task.progress || 0);
                setStatus(task.progressMessage || 'Canvas 任务执行中...');
            }, 250);
            try {
                const outputs = await task.promise;
                await Promise.all(outputs.map((output) => downloadAndAppendImage({
                    url: output.url,
                    fileName: output.fileName,
                    source: 'canvas',
                    docId,
                    boundaryUri,
                    maskUri: null,
                    maskHandle: null,
                })));
                setProgress(100);
                setStatus(`Canvas 生成完成，已接收 ${outputs.length} 张图片`);
            } finally {
                clearInterval(interval);
                await sdpppSDK.plugins.photoshop.taskRemove({ taskId: task.taskId }).catch(() => undefined);
            }
        } catch (runError) {
            setStatus('');
            setError(runError instanceof Error ? runError.message : String(runError));
        } finally {
            activeTaskRef.current = null;
            setLoading(false);
        }
    };

    const cancel = async () => {
        if (!activeTaskRef.current?.cancelable) return;
        try {
            await activeTaskRef.current.cancel();
            setStatus('Canvas 任务已取消');
        } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : String(cancelError));
        }
    };

    if (showingPreview) return null;

    return (
        <Flex vertical gap={10} style={{ paddingTop: 8 }}>
            <Flex gap={6}>
                <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} placeholder="Canvas 后端地址" />
                <Button icon={<RefreshCw size={16} />} loading={loading} onClick={() => void connect(false)}>连接</Button>
            </Flex>
            <Select
                value={projectId || undefined}
                placeholder="选择 Canvas 项目"
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
                onChange={(value) => void changeProject(value)}
                disabled={loading || projects.length === 0}
            />
            <Select
                value={nodeId || undefined}
                placeholder="选择已有生图节点"
                options={nodes.map((node) => ({ value: node.id, label: nodeLabel(node) }))}
                onChange={setNodeId}
                disabled={loading || nodes.length === 0}
            />
            {projectId && nodes.length === 0 && !loading && <Alert type="warning" showIcon message="该项目没有当前品牌可用的生图节点" />}
            {error && <Alert type="error" showIcon message={error} />}
            {status && <Text type="secondary">{status}</Text>}
            {(loading || progress > 0) && <Progress percent={progress} size="small" status={error ? 'exception' : undefined} />}
            <Flex gap={8}>
                <Button type="primary" block disabled={!projectId || !nodeId || loading} onClick={() => void run()}>
                    运行节点并发送回 Photoshop
                </Button>
                {activeTaskRef.current?.cancelable && <Button danger icon={<Square size={15} />} onClick={() => void cancel()} />}
            </Flex>
        </Flex>
    );
}
