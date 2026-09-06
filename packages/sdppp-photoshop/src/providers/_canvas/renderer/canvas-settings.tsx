import { Alert, Button, Flex, Input, Select, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { canvasStore } from './canvas.store';
import { canvasConnectionStore, connectCanvas } from './canvas-connection';
import { canvasRunStore } from './canvas-run';

export function CanvasSettings() {
    const { backendUrl, projectId, projects, setProjectId } = canvasStore();
    const { loading, status, error } = canvasConnectionStore();
    const preparing = canvasRunStore((state) => state.preparing);
    const [draftUrl, setDraftUrl] = useState(backendUrl);
    useEffect(() => setDraftUrl(backendUrl), [backendUrl]);
    return <Flex vertical gap={10} className="canvas-settings-page">
        <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} placeholder="画布后端地址" disabled={preparing} />
        <Flex gap={6}>
            <Button loading={loading} disabled={preparing} onClick={() => void connectCanvas(draftUrl)}>连接 / 刷新能力</Button>
            <Button disabled={preparing || loading} onClick={() => void connectCanvas(draftUrl, true)}>查找画布</Button>
        </Flex>
        <Select value={projectId || undefined} placeholder="选择节点保存到哪个画布项目"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
            disabled={loading || preparing || !projects.length} onChange={setProjectId} />
        {status && <Typography.Text type="secondary">{status}</Typography.Text>}
        {error && <Alert type="error" showIcon message={error} />}
    </Flex>;
}
