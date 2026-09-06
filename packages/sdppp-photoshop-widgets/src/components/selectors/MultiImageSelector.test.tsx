// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const slots = vi.hoisted(() => new Map<string, { value: string[]; onValueChange: (value: string[]) => void }>());
vi.mock('./ImageSelector', () => ({ ImageSelector: (props: any) => { slots.set(props.widgetableId, props); return null; } }));
vi.mock('../../context/PhotoshopWidgetContext', () => ({ useWidgetText: () => (_key: string, options: any) => options?.defaultValue || '' }));
vi.mock('../shared/UploadIndicator', () => ({ UploadIndicator: () => null }));
vi.mock('antd', () => ({ Button: () => null, Tooltip: ({ children }: any) => children }));
import { MultiImageSelector } from './MultiImageSelector';
let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; slots.clear();
    element = document.createElement('div'); document.body.append(element); root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); });
describe('参考图片同步回写', () => {
    it('并行完成的两个上传在返回前完整通知父级，无需等待 React 重绘', async () => {
        const onChange = vi.fn();
        await act(async () => root.render(<MultiImageSelector widgetableId="images" value={['old-a', 'old-b']} maxCount={3} workBoundary="boundary" onValueChange={onChange} />));
        act(() => {
            slots.get('images-0')!.onValueChange(['new-a']);
            slots.get('images-1')!.onValueChange(['new-b']);
            expect(onChange).toHaveBeenLastCalledWith(['new-a', 'new-b']);
        });
    });
    it('外部清空参考图不会继续显示旧图片', async () => {
        await act(async () => root.render(<MultiImageSelector widgetableId="images" value={['old-a', 'old-b']} maxCount={3} workBoundary="boundary" />));
        await act(async () => root.render(<MultiImageSelector widgetableId="images" value={[]} maxCount={3} workBoundary="boundary" />));
        expect(slots.get('images-0')!.value).toEqual(['']);
        expect(slots.get('images-1')!.value).toEqual(['']);
    });
});
