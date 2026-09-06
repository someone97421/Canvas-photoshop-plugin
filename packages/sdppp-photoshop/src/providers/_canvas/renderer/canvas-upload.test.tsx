// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@sdppp/common', () => ({ t: (key: string) => key }));
import { UploadPassProvider, useUploadPasses } from '../../base/upload-pass-context';

let root: Root;
let element: HTMLDivElement;
const sessions: Record<string, ReturnType<typeof useUploadPasses>> = {};
function Capture({ name }: { name: string }) { sessions[name] = useUploadPasses(); return null; }
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    element = document.createElement('div'); document.body.append(element); root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); });

describe('切换能力的上传隔离', () => {
    it('不同 Provider 的上传通道不混用，取消后可再次采集', async () => {
        const first = vi.fn(async () => 'asset-a'); const second = vi.fn(async () => 'asset-b');
        await act(async () => root.render(<>
            <UploadPassProvider uploader={first}><Capture name="a" /></UploadPassProvider>
            <UploadPassProvider uploader={second}><Capture name="b" /></UploadPassProvider>
        </>));
        const pass = () => ({ getUploadFile: vi.fn(async () => ({ type: 'resource' as const, resource: 'image', fileName: 'image.png' })) });
        sessions.a.addUploadPass(pass()); sessions.b.addUploadPass(pass());
        await sessions.a.waitAllUploadPasses();
        expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled();
        sessions.a.cancelAllUploads();
        await sessions.a.waitAllUploadPasses(); await sessions.b.waitAllUploadPasses();
        expect(first).toHaveBeenCalledTimes(2); expect(second).toHaveBeenCalledOnce();
    });
    it('卸载后正在上传的旧图片不会回写到新能力草稿', async () => {
        let finish!: (asset: string) => void;
        const uploader = () => new Promise<string>((resolve) => { finish = resolve; });
        await act(async () => root.render(<UploadPassProvider uploader={uploader}><Capture name="a" /></UploadPassProvider>));
        const onUploaded = vi.fn(async () => {});
        const pending = sessions.a.runUploadPassOnce({ getUploadFile: async () => ({ type: 'resource', resource: 'image', fileName: 'image.png' }), onUploaded });
        const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(finish).toBeDefined());
        await act(async () => root.render(null)); finish('old-asset');
        await rejected; expect(onUploaded).not.toHaveBeenCalled();
    });
    it('同批部分失败时等待其余上传收尾，避免下一次任务交错', async () => {
        let finish!: (value: string) => void;
        const uploader = (input: any) => input.fileName === 'bad'
            ? Promise.reject(new Error('上传失败')) : new Promise<string>((resolve) => { finish = resolve; });
        await act(async () => root.render(<UploadPassProvider uploader={uploader}><Capture name="a" /></UploadPassProvider>));
        for (const fileName of ['bad', 'pending']) sessions.a.addUploadPass({ getUploadFile: async () => ({ type: 'resource', resource: 'image', fileName }) });
        let settled = false;
        const pending = sessions.a.waitAllUploadPasses().catch((error) => { settled = true; throw error; });
        const rejected = expect(pending).rejects.toThrow('上传失败');
        await vi.waitFor(() => expect(finish).toBeDefined());
        expect(settled).toBe(false);
        finish('asset'); await rejected;
    });
});
