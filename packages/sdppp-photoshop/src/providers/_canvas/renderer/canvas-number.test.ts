import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InputNumber } from 'antd';
vi.mock('antd', () => ({ Flex: 'div', InputNumber: 'input' }));
import { renderCanvasNumber } from './canvas-number';

function inputProps(value: unknown, options: Record<string, unknown> = {}) {
    const onValueChange = vi.fn();
    const rendered = renderCanvasNumber({ widget: { outputType: 'number', name: '数值', options }, value, onValueChange } as any) as React.ReactElement<any>;
    const input = React.Children.toArray(rendered.props.children).find((item: any) => item.type === InputNumber) as React.ReactElement<any>;
    return { ...input.props, onValueChange };
}
describe('画布数值控件契约', () => {
    it('未声明范围不注入 0–100，空值不显示或提交为零', () => {
        const props = inputProps(undefined);
        expect(props.min).toBeUndefined(); expect(props.max).toBeUndefined(); expect(props.value).toBeNull();
        props.onChange(null); expect(props.onValueChange).toHaveBeenCalledWith(undefined);
    });
    it('宽高及显式范围保持能力提供的数值', () => {
        const props = inputProps(2048, { min: 16, max: 3840, step: 16 });
        expect(props).toMatchObject({ value: 2048, min: 16, max: 3840, step: 16 });
    });
});
