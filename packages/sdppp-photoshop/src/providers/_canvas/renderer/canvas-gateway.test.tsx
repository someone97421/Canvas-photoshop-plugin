// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const counts = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('@sdppp/common', async () => {
    const { createStore } = await import('zustand');
    return { sdpppSDK: { stores: { PhotoshopStore: createStore(() => ({ sdpppX: {}, canvasSettingsOpenNonce: 0 })) } } };
});
vi.mock('../../../tsx/App.store', async () => {
    const { create } = await import('zustand'); return { MainStore: create(() => ({ provider: 'Canvas' })) };
});
vi.mock('../../../providers', async () => {
    const React = await import('react');
    function Renderer() { React.useEffect(() => { counts.mounts++; }, []); return React.createElement('div', { 'data-testid': 'generation' }, '生成表单'); }
    return { Providers: { Canvas: { Renderer }, Other: { Renderer: () => null } }, PROVIDER_METADATA: { Canvas: { name: '画布' }, Other: { name: '其他' } } };
});
vi.mock('./canvas-settings', () => ({ CanvasSettings: () => <div data-testid="settings">画布设置</div> }));
vi.mock('./canvas-run', async () => {
    const { create } = await import('zustand');
    return { canvasRunStore: create(() => ({ preparing: false, running: true, label: '原模型任务', progress: 20, status: '生成中', error: '' })), cancelCanvasRun: vi.fn() };
});
vi.mock('antd', () => ({
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Flex: ({ children, style }: any) => <div style={style}>{children}</div>,
    Select: () => null, Tooltip: ({ children }: any) => children,
    Typography: { Text: ({ children }: any) => <span>{children}</span> }, Progress: () => null, Alert: () => null,
}));
import { sdpppSDK } from '@sdppp/common';
import { MainStore } from '../../../tsx/App.store';
import { SDPPPGateway } from '../../../tsx/gateway/sdppp';

it('设置只切换展示，生成表单不重复挂载；切 Provider 后任务仍可见', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const element = document.createElement('div'); document.body.append(element); const root = createRoot(element);
    try {
        await act(async () => root.render(<SDPPPGateway />));
        await act(async () => sdpppSDK.stores.PhotoshopStore.setState({ canvasSettingsOpenNonce: 1 } as any));
        expect(element.querySelector('[data-testid="settings"]')).not.toBeNull();
        expect(element.querySelectorAll('[data-testid="generation"]')).toHaveLength(1);
        expect(counts.mounts).toBe(1);
        await act(async () => (element.querySelector('button') as HTMLButtonElement).click());
        expect(element.querySelector('[data-testid="settings"]')).toBeNull();
        expect(counts.mounts).toBe(1);
        await act(async () => MainStore.setState({ provider: 'Other' } as any));
        expect(element.textContent).toContain('原模型任务');
        expect(element.textContent).toContain('取消此任务');
    } finally { await act(async () => root.unmount()); element.remove(); }
});
