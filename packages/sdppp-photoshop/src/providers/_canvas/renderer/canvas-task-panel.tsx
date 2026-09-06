import { Alert, Button, Flex, Progress, Typography } from 'antd';
import { canvasRunStore, cancelCanvasRun } from './canvas-run';

export function CanvasTaskPanel() {
    const { running, label, progress, status, error } = canvasRunStore();
    if (!label) return null;
    return <Flex vertical gap={6} style={{ padding: 8, border: '1px solid var(--sdppp-widget-border-color)', marginTop: 8 }}>
        <Typography.Text>{label}</Typography.Text>
        {status && <Typography.Text type="secondary">{status}</Typography.Text>}
        {error && <Alert type="error" showIcon message={error} />}
        <Progress percent={progress} size="small" status={error ? 'exception' : undefined} />
        {running && <Button danger onClick={() => void cancelCanvasRun()}>取消此任务</Button>}
    </Flex>;
}
