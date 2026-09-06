import { describe, expect, it } from 'vitest';
import type { CanvasImageCapability } from '../client';
import { buildWidgets, defaultValues, normalizeFormValues, referenceInput, submissionValues } from './canvas-form';

const capability: CanvasImageCapability = {
    nodeType: 'test', provider: { id: 'test', name: '测试', supportedTypes: ['image'] },
    models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    definition: { id: 'test', name: '测试', inputs: [], outputs: [], dataSchema: { properties: { stale: { type: 'string', default: 'old' } } } },
    definitionsByModel: {
        a: { id: 'test', name: 'A', inputs: [{ id: 'image', name: '图片', type: 'image', maxCount: 1 }], outputs: [], dataSchema: { properties: {
            prompt: { type: 'string' }, resolution: { type: 'string', default: '2K', ui: { options: [{ label: '2K', value: '2K' }, { label: '4K', value: '4K' }] } },
            ratio: { type: 'string', default: '1:1', ui: { dependencies: { field: 'resolution', mapping: {
                '2K': [{ label: '方形', value: '1:1' }, { label: '横向', value: '16:9' }], '4K': [{ label: '横向', value: '16:9' }],
            } } } },
            count: { type: 'number', default: 1, ui: { options: [{ label: '一张', value: 1 }, { label: '两张', value: 2 }] } },
            seed: { type: 'number' },
        } } },
        b: { id: 'test', name: 'B', inputs: [], outputs: [], dataSchema: { properties: {
            prompt: { type: 'string' }, mode: { type: 'string', default: 'preset' },
            width: { type: 'number', default: 1024, ui: { visibleWhen: { field: 'mode', values: ['custom'] } } },
        } } },
    },
};

describe('画布表单与提交契约', () => {
    it('模型切换使用当前模型字段，隐藏草稿不进入提交', () => {
        const values = { ...defaultValues(capability, 'b'), prompt: 'hello', stale: 'old', ratio: '16:9', width: 2048 };
        expect(submissionValues(capability, 'b', values)).toEqual({ prompt: 'hello', mode: 'preset' });
        expect(referenceInput(capability, 'b')).toBeUndefined();
    });
    it('分辨率切换归一化下游选项，并保留枚举原始类型', () => {
        const form = normalizeFormValues(capability, 'a', { resolution: '4K', ratio: '1:1', count: '2' });
        expect(form.values).toMatchObject({ ratio: '16:9', count: 2 });
        expect(submissionValues(capability, 'a', form.values)).not.toHaveProperty('seed');
    });
    it('超限参考图全部保留显示，避免只显示一张却提交多张', () => {
        const nodes = buildWidgets(capability, {}, { model: 'a', __canvasReferenceImages: ['one', 'two', 'three'] });
        expect(nodes[0].widgets[0].options).toMatchObject({ maxCount: 3 });
        expect(referenceInput(capability, 'a')?.maxCount).toBe(1);
    });
});
