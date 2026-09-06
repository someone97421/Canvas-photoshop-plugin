import type { WidgetableNumberWidget } from '@sdppp/common/schemas/schemas';
import type { WidgetRenderer } from '@sdppp/widgetable-ui';
import { Flex, InputNumber } from 'antd';

/** 画布数值约束由能力契约决定；未声明上下限和默认值时不能注入 0–100。 */
export const renderCanvasNumber: WidgetRenderer = ({ widget, value, onValueChange }) => {
    const field = widget as WidgetableNumberWidget;
    const numeric = value === undefined || value === null || value === '' ? null : Number(value);
    return <Flex align="center" gap={8}>
        {field.name && <span style={{ flex: 1 }}>{field.name}</span>}
        <InputNumber style={{ flex: 2, minWidth: 0 }}
            value={numeric !== null && Number.isFinite(numeric) ? numeric : null}
            min={field.options?.min} max={field.options?.max} step={field.options?.step}
            placeholder="未设置"
            onChange={(next) => onValueChange(next ?? undefined)} />
    </Flex>;
};
