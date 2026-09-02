import { describe, expect, it } from 'vitest';
import type { CanvasSchemaProperty } from '../client';
import {
    applyInlineCustomSize,
    aspectRatioForDocumentedSize,
    findInlineCustomSizeField,
    isPropertyVisible,
    resolveOptions,
    usesCustomSize,
} from './canvas-schema';

function visibleFields(properties: Record<string, CanvasSchemaProperty>, values: Record<string, unknown>) {
    return Object.keys(properties).filter((name) => isPropertyVisible(name, properties, values));
}

describe('Canvas schema conditions', () => {
    it('requires every visibleWhen ancestor to be visible', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            resolutionMode: {
                type: 'string',
                ui: { visibleWhen: { field: 'model', values: ['standard'] } },
            },
            customWidth: {
                type: 'number',
                ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } },
            },
        };

        expect(isPropertyVisible('customWidth', properties, {
            model: 'layered',
            resolutionMode: 'custom',
        })).toBe(false);
    });

    it('ignores hiddenWhen from an inactive controller branch', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            sizeMode: {
                type: 'string',
                ui: { visibleWhen: { field: 'model', values: ['custom-model'] } },
            },
            size: {
                type: 'string',
                ui: { hiddenWhen: { field: 'sizeMode', values: ['custom'] } },
            },
        };

        expect(isPropertyVisible('size', properties, {
            model: 'preset-only-model',
            sizeMode: 'custom',
        })).toBe(true);
    });

    it('resolves model-specific option menus', () => {
        const property: CanvasSchemaProperty = {
            type: 'string',
            ui: {
                widget: 'select',
                dependencies: {
                    field: 'model',
                    mapping: {
                        basic: [{ label: '1K', value: '1K' }],
                        pro: [{ label: '2K', value: '2K' }, { label: '4K', value: '4K' }],
                    },
                },
            },
        };

        expect(resolveOptions(property, { model: 'pro' }).map((option) => option.value)).toEqual(['2K', '4K']);
    });

    it('recognizes a concrete custom size selected through a custom option', () => {
        const property: CanvasSchemaProperty = {
            type: 'string',
            ui: {
                widget: 'select',
                options: [{ label: '1K', value: '1024x1024' }, { label: '自定义', value: 'custom' }],
            },
        };

        expect(usesCustomSize(property, {}, '1536x1024')).toBe(true);
        expect(usesCustomSize(property, {}, '1024x1024')).toBe(false);
        expect(usesCustomSize(property, {}, '1K')).toBe(false);
    });

    it('does not treat a custom mode controller as a size value field', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            resolutionMode: {
                type: 'string',
                ui: {
                    widget: 'select',
                    options: [{ label: '预设', value: 'preset' }, { label: '自定义', value: 'custom' }],
                },
            },
            customWidth: {
                type: 'number',
                ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } },
            },
        };

        expect(findInlineCustomSizeField(properties, { resolutionMode: 'custom' })).toBeUndefined();
    });

    it('finds a custom option that stores the concrete size in its own field', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            size: {
                type: 'string',
                ui: {
                    widget: 'select',
                    options: [{ label: '1K', value: '1024x1024' }, { label: '自定义', value: 'custom' }],
                },
            },
        };

        expect(findInlineCustomSizeField(properties, { size: 'custom' })).toBe('size');
    });

    it('switches the complete Xuanshang standard and layered branches', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            resolutionMode: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['standard'] } } },
            aspectRatio: { type: 'string', ui: { visibleWhen: { field: 'resolutionMode', values: ['preset'] } } },
            resolution: { type: 'string', ui: { visibleWhen: { field: 'resolutionMode', values: ['preset'] } } },
            customWidth: { type: 'number', ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } } },
            customHeight: { type: 'number', ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } } },
            size: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['layered'] } } },
            layerCount: { type: 'number', ui: { visibleWhen: { field: 'model', values: ['layered'] } } },
        };

        expect(visibleFields(properties, { model: 'standard', resolutionMode: 'preset' })).toEqual([
            'resolutionMode', 'aspectRatio', 'resolution',
        ]);
        expect(visibleFields(properties, { model: 'standard', resolutionMode: 'custom' })).toEqual([
            'resolutionMode', 'customWidth', 'customHeight',
        ]);
        expect(visibleFields(properties, { model: 'layered', resolutionMode: 'custom' })).toEqual([
            'size', 'layerCount',
        ]);
    });

    it('handles the RH Reverse mixed visible and hidden branch', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            resolutionMode: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['seedream5-pro'] } } },
            aspectRatio: { type: 'string', ui: { hiddenWhen: { field: 'resolutionMode', values: ['custom'] } } },
            resolution: { type: 'string', ui: { hiddenWhen: { field: 'resolutionMode', values: ['custom'] } } },
            customWidth: { type: 'number', ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } } },
            customHeight: { type: 'number', ui: { visibleWhen: { field: 'resolutionMode', values: ['custom'] } } },
        };

        expect(visibleFields(properties, { model: 'gpt-image-2', resolutionMode: 'custom' })).toEqual([
            'aspectRatio', 'resolution',
        ]);
        expect(visibleFields(properties, { model: 'seedream5-pro', resolutionMode: 'custom' })).toEqual([
            'resolutionMode', 'customWidth', 'customHeight',
        ]);
    });

    it('hides the complete Volcengine child branch when its model controller is inactive', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            sizeMode: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['pro'] } } },
            size: { type: 'string', ui: { hiddenWhen: { field: 'sizeMode', values: ['custom'] } } },
            customSize: { type: 'string', ui: { visibleWhen: { field: 'sizeMode', values: ['custom'] } } },
            sequential: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['pro'] } } },
            maxImages: { type: 'number', ui: { visibleWhen: { field: 'sequential', values: ['auto'] } } },
            layerCount: { type: 'number', ui: { visibleWhen: { field: 'model', values: ['layered'] } } },
        };

        expect(visibleFields(properties, { model: 'pro', sizeMode: 'custom', sequential: 'auto' })).toEqual([
            'sizeMode', 'customSize', 'sequential', 'maxImages',
        ]);
        expect(visibleFields(properties, { model: 'layered', sizeMode: 'custom', sequential: 'auto' })).toEqual([
            'size', 'layerCount',
        ]);
    });

    it('switches Ease AI size options through the visible resolution branch', () => {
        const properties: Record<string, CanvasSchemaProperty> = {
            resolution: { type: 'string', ui: { visibleWhen: { field: 'model', values: ['gpt-image-2'] } } },
            size: {
                type: 'string',
                ui: {
                    visibleWhen: { field: 'model', values: ['gpt-image-2'] },
                    dependencies: {
                        field: 'resolution',
                        mapping: {
                            '2K': [{ label: '1:1 · 2048×2048', value: '2048x2048' }],
                            custom: [{ label: '自定义', value: 'custom' }],
                        },
                    },
                },
            },
        };

        expect(visibleFields(properties, { model: 'gemini', resolution: 'custom' })).toEqual([]);
        expect(resolveOptions(properties.size, { model: 'gpt-image-2', resolution: '2K' })[0].value).toBe('2048x2048');
        expect(resolveOptions(properties.size, { model: 'gpt-image-2', resolution: 'custom' })[0].value).toBe('custom');
    });

    it('converts only the inline custom size target for submission', () => {
        expect(applyInlineCustomSize({ size: 'custom', model: 'gpt-image-2' }, 'size', 1536, 1024)).toEqual({
            size: '1536x1024',
            model: 'gpt-image-2',
        });
    });

    it('does not overwrite native custom mode fields during submission', () => {
        expect(applyInlineCustomSize({ resolutionMode: 'custom', customWidth: 1536 }, undefined, 1536, 1024)).toEqual({
            resolutionMode: 'custom',
            customWidth: 1536,
        });
    });

    it('keeps the aspect ratio represented by a documented pixel-size option', () => {
        const model = {
            id: 'gpt-image-2',
            label: 'GPT Image 2',
            resolutionSizes: {
                '2K': {
                    '1:1': '2048x2048',
                    '16:9': '2560x1440',
                },
            },
        };

        expect(aspectRatioForDocumentedSize(model, '2K', '2560x1440')).toBe('16:9');
        expect(aspectRatioForDocumentedSize(model, 'custom', '1536x1024')).toBeUndefined();
    });
});
