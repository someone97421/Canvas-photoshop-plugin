import type { WidgetableNode, WidgetableWidget } from '@sdppp/common/schemas/schemas';
import type { CanvasImageCapability, CanvasDocumentedModel, CanvasSchemaProperty } from '../client';
import { applyInlineCustomSize, aspectRatioForDocumentedSize, findInlineCustomSizeField, isPropertyVisible, resolveOptions, sameValue } from './canvas-schema';
export const REFERENCE_IMAGES_FIELD = '__canvasReferenceImages';
const LEGACY_SIZE_MODE_FIELD = '__canvasSizeMode';
const CUSTOM_WIDTH_FIELD = '__canvasCustomWidth';
const CUSTOM_HEIGHT_FIELD = '__canvasCustomHeight';
const CUSTOM_SIZE_TARGET_FIELD = '__canvasCustomSizeTarget';
const UI_ONLY_FIELDS = new Set([LEGACY_SIZE_MODE_FIELD, CUSTOM_WIDTH_FIELD, CUSTOM_HEIGHT_FIELD, CUSTOM_SIZE_TARGET_FIELD]);

export function selectionKey(nodeType: string, modelId: string): string {
    return `${nodeType}::${modelId}`;
}

export function modelIds(capability: CanvasImageCapability): Array<{ id: string; name: string }> {
    if (capability.models.length) return capability.models;
    const modelProperty = capability.definition.dataSchema.properties?.model;
    return (modelProperty?.ui?.options || []).map((option) => ({ id: String(option.value), name: option.label }));
}

function documentedModel(capability: CanvasImageCapability, modelId: string): CanvasDocumentedModel | undefined {
    return capability.documentedModels?.find((model) => model.id === modelId);
}

function parseDimensions(value: unknown): { width: number; height: number } | null {
    const match = String(value || '').trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function schemaProperties(capability: CanvasImageCapability, modelId: string, values: Record<string, unknown>) {
    const resolved = capability.definitionsByModel?.[modelId];
    if (resolved) return resolved.dataSchema.properties || {};
    const source = capability.definition.dataSchema.properties || {};
    const model = ['image-generation-green-goblin', 'image-generation-geeknow'].includes(capability.nodeType)
        ? documentedModel(capability, modelId)
        : undefined;
    if (!model) return source;
    const resolutions = Object.keys(model.resolutionRatios || model.resolutionSizes || {});
    if (!resolutions.length) return source;
    const rawResolution = String(values.resolution || '');
    const legacyCustomDimensions = model.supportsCustomSize ? parseDimensions(rawResolution) : null;
    const resolution = resolutions.includes(rawResolution)
        ? rawResolution
        : model.defaultResolution && resolutions.includes(model.defaultResolution) ? model.defaultResolution : resolutions[0];
    const ratios = model.resolutionRatios?.[resolution] || Object.keys(model.resolutionSizes?.[resolution] || {});
    const customDimensions = legacyCustomDimensions || parseDimensions(values.size) || { width: 1024, height: 1024 };
    const properties: Record<string, CanvasSchemaProperty> = { ...source };

    properties.resolution = {
        ...source.resolution,
        type: 'string',
        default: model.defaultResolution && resolutions.includes(model.defaultResolution) ? model.defaultResolution : resolutions[0],
        ui: {
            ...source.resolution?.ui,
            dependencies: undefined,
            widget: 'select',
            label: '分辨率',
            options: [
                ...resolutions.map((value) => ({ label: value, value })),
                ...(model.supportsCustomSize ? [{ label: '自定义', value: 'custom' }] : []),
            ],
        },
    };

    if (model.parameterMode === 'resolution-ratio') {
        properties.aspectRatio = {
            ...source.aspectRatio,
            type: 'string',
            default: ratios[0],
            ui: {
                ...source.aspectRatio?.ui,
                dependencies: undefined,
                widget: 'select',
                label: '比例',
                options: ratios.map((value) => ({ label: value, value })),
            },
        };
        delete properties.size;
    } else {
        const optionMapping = Object.fromEntries(resolutions.map((resolutionOption) => {
            const sizes = model.resolutionSizes?.[resolutionOption] || {};
            return [resolutionOption, Object.entries(sizes).map(([ratio, size]) => ({
                label: `${ratio} · ${String(size).replace('x', '×')}`,
                value: size,
            }))];
        }));
        const sizes = model.resolutionSizes?.[resolution] || {};
        properties.size = {
            ...source.size,
            type: 'string',
            default: sizes[ratios[0]] || '',
            ui: {
                ...source.size?.ui,
                widget: 'select',
                label: '比例 / 具体分辨率',
                options: optionMapping[resolution] || [],
                dependencies: { field: 'resolution', mapping: optionMapping },
                ...(model.supportsCustomSize ? { hiddenWhen: { field: 'resolution', values: ['custom'] } } : {}),
            },
        };
        delete properties.aspectRatio;
    }

    if (model.supportsCustomSize) {
        properties[CUSTOM_WIDTH_FIELD] = {
            type: 'number',
            default: customDimensions.width,
            ui: {
                widget: 'number', label: '宽度', min: 16, max: 3840, step: 16,
                visibleWhen: { field: 'resolution', values: ['custom'] },
            },
        };
        properties[CUSTOM_HEIGHT_FIELD] = {
            type: 'number',
            default: customDimensions.height,
            ui: {
                widget: 'number', label: '高度', min: 16, max: 3840, step: 16,
                visibleWhen: { field: 'resolution', values: ['custom'] },
            },
        };
    }

    if (model.qualityOptions?.length) {
        properties.quality = {
            ...source.quality,
            type: 'string', default: model.defaultQuality || model.qualityOptions[0],
            ui: { ...source.quality?.ui, dependencies: undefined, widget: 'select', label: '质量', options: model.qualityOptions.map((value) => ({ label: value, value })) },
        };
    } else delete properties.quality;
    if (model.responseFormats?.length) {
        properties.responseFormat = {
            ...source.responseFormat,
            type: 'string', default: model.responseFormats[0],
            ui: { ...source.responseFormat?.ui, dependencies: undefined, widget: 'select', label: '响应格式', options: model.responseFormats.map((value) => ({ label: value, value })) },
        };
    } else delete properties.responseFormat;
    return properties;
}

export function defaultValues(capability: CanvasImageCapability, modelId: string): Record<string, unknown> {
    const properties = schemaProperties(capability, modelId, {});
    return Object.fromEntries(Object.entries(properties)
        .filter(([name]) => name !== 'provider' && name !== 'model')
        .map(([name, property]) => [name, property.default ?? defaultValue(property)])) as Record<string, unknown>;
}

function customSizeTarget(
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
): string | undefined {
    return findInlineCustomSizeField(properties, values, values[CUSTOM_SIZE_TARGET_FIELD]);
}

function withCustomSizeInputs(
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
): { properties: Record<string, CanvasSchemaProperty>; target?: string } {
    const target = customSizeTarget(properties, values);
    if (!target || properties[CUSTOM_WIDTH_FIELD] || properties[CUSTOM_HEIGHT_FIELD]) return { properties, target };
    const dimensions = parseDimensions(values[target]) || { width: 1024, height: 1024 };
    return {
        target,
        properties: {
            ...properties,
            [CUSTOM_WIDTH_FIELD]: {
                type: 'number', default: dimensions.width,
                ui: { widget: 'number', label: '宽度', min: 16, max: 3840, step: 16 },
            },
            [CUSTOM_HEIGHT_FIELD]: {
                type: 'number', default: dimensions.height,
                ui: { widget: 'number', label: '高度', min: 16, max: 3840, step: 16 },
            },
        },
    };
}

function defaultValue(property: CanvasSchemaProperty): unknown {
    if (property.type === 'boolean') return false;
    if (property.type === 'number' || property.type === 'integer') return undefined;
    return '';
}

export function normalizeFormValues(
    capability: CanvasImageCapability,
    modelId: string,
    sourceValues: Record<string, unknown>,
): { properties: Record<string, CanvasSchemaProperty>; values: Record<string, unknown> } {
    let values: Record<string, unknown> = { ...sourceValues, model: modelId };
    const model = capability.definitionsByModel?.[modelId] ? undefined : documentedModel(capability, modelId);
    const legacyCustomDimensions = model?.supportsCustomSize ? parseDimensions(values.resolution) : null;
    if (model?.supportsCustomSize && (values[LEGACY_SIZE_MODE_FIELD] === 'custom' || legacyCustomDimensions)) {
        values.resolution = 'custom';
        if (legacyCustomDimensions) {
            values[CUSTOM_WIDTH_FIELD] = legacyCustomDimensions.width;
            values[CUSTOM_HEIGHT_FIELD] = legacyCustomDimensions.height;
        }
    }
    delete values[LEGACY_SIZE_MODE_FIELD];
    let resolvedSchema = withCustomSizeInputs(schemaProperties(capability, modelId, values), values);
    let properties = resolvedSchema.properties;
    const maxPasses = Object.keys(properties).length + 1;

    for (let pass = 0; pass < maxPasses; pass += 1) {
        resolvedSchema = withCustomSizeInputs(schemaProperties(capability, modelId, values), values);
        properties = resolvedSchema.properties;
        const nextValues: Record<string, unknown> = {
            ...values,
            model: modelId,
        };
        if (resolvedSchema.target) nextValues[resolvedSchema.target] = 'custom';

        for (const [name, property] of Object.entries(properties)) {
            if (name === 'provider' || name === 'model') continue;
            if (nextValues[name] === undefined) nextValues[name] = property.default ?? defaultValue(property);
            if (!isPropertyVisible(name, properties, nextValues)) continue;
            const options = resolveOptions(property, nextValues);
            const rawValue = nextValues[name];
            const currentValue = rawValue;
            const acceptsCustomValue = options.some((option) => option.value === 'custom')
                && /^\d+x\d+$/i.test(String(currentValue));
            if (!options.length || options.some((option) => sameValue(option.value, currentValue)) || acceptsCustomValue) {
                const match = options.find((option) => sameValue(option.value, currentValue));
                nextValues[name] = match ? match.value : currentValue;
                continue;
            }
            const defaultOption = options.find((option) => sameValue(option.value, property.default));
            nextValues[name] = (defaultOption || options[0]).value;
        }

        if (!resolvedSchema.target && properties[CUSTOM_WIDTH_FIELD] && properties[CUSTOM_HEIGHT_FIELD] && nextValues.resolution === 'custom') {
            const width = Math.round(Number(nextValues[CUSTOM_WIDTH_FIELD]) || 1024);
            const height = Math.round(Number(nextValues[CUSTOM_HEIGHT_FIELD]) || 1024);
            nextValues.resolution = 'custom';
            nextValues.size = `${width}x${height}`;
        }
        if (resolvedSchema.target) {
            nextValues[CUSTOM_SIZE_TARGET_FIELD] = resolvedSchema.target;
        } else {
            delete nextValues[CUSTOM_SIZE_TARGET_FIELD];
        }
        const aspectRatio = aspectRatioForDocumentedSize(
            !capability.definitionsByModel?.[modelId] && ['image-generation-green-goblin', 'image-generation-geeknow'].includes(capability.nodeType) ? model : undefined,
            nextValues.resolution,
            nextValues.size,
        );
        if (aspectRatio) nextValues.aspectRatio = aspectRatio;

        const stable = Object.keys(values).length === Object.keys(nextValues).length
            && Object.entries(nextValues).every(([name, value]) => sameValue(values[name], value));
        values = nextValues;
        if (stable) break;
    }

    properties = withCustomSizeInputs(schemaProperties(capability, modelId, values), values).properties;
    return { properties, values };
}

function toWidget(name: string, property: CanvasSchemaProperty, values: Record<string, unknown>): WidgetableWidget {
    const common = {
        name: name === CUSTOM_WIDTH_FIELD || name === CUSTOM_HEIGHT_FIELD ? '' : property.ui?.label || name,
        uiWeight: 12,
    };
    const options = resolveOptions(property, values);
    if (options.length || property.ui?.widget === 'select' || property.ui?.dependencies) {
        return {
            ...common,
            outputType: 'combo',
            options: { required: false, values: options.map((option) => String(option.value)), labels: options.map((option) => option.label) },
        };
    }
    if (property.type === 'boolean') return { ...common, outputType: 'boolean', options: { required: false } };
    if (property.type === 'number' || property.type === 'integer') {
        return {
            ...common,
            outputType: 'number',
            options: {
                required: false,
                min: property.ui?.min,
                max: property.ui?.max,
                step: property.ui?.step,
                slider: property.ui?.widget === 'slider',
            },
        };
    }
    return { ...common, outputType: 'string', options: { required: name === 'prompt' } };
}

export function buildWidgets(
    capability: CanvasImageCapability,
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
): WidgetableNode[] {
    const nodes: WidgetableNode[] = [];
    const definition = capability.definitionsByModel?.[String(values.model)] || capability.definition;
    const imageInput = definition.inputs.find((input) => input.type === 'image');
    const draftCount = referenceIds(values[REFERENCE_IMAGES_FIELD]).length;
    if (imageInput || draftCount) {
        nodes.push({
            id: REFERENCE_IMAGES_FIELD,
            title: imageInput?.name || '参考图片草稿（当前能力不支持）',
            widgets: [{
                name: REFERENCE_IMAGES_FIELD,
                outputType: 'images',
                uiWeight: 12,
                options: {
                    required: Boolean(imageInput?.required),
                    maxCount: Math.max(imageInput?.maxCount ?? (imageInput ? 10 : 0), draftCount),
                    '#sdppp_selector_kind': 'multi-image',
                },
            }],
            uiWeightSum: 12,
        });
    }
    Object.entries(properties)
        .filter(([name]) => name !== 'provider' && name !== 'model' && isPropertyVisible(name, properties, values))
        .forEach(([name, property]) => nodes.push({
            id: name,
            title: property.ui?.label || name,
            widgets: [toWidget(name, property, values)],
            uiWeightSum: 12,
        }));
    return nodes;
}

export function submissionValues(capability: CanvasImageCapability, modelId: string, draft: Record<string, unknown>) {
    const { properties, values } = normalizeFormValues(capability, modelId, draft);
    const result = applyInlineCustomSize(values, values[CUSTOM_SIZE_TARGET_FIELD], values[CUSTOM_WIDTH_FIELD], values[CUSTOM_HEIGHT_FIELD]);
    const ratio = !capability.definitionsByModel?.[modelId]
        ? aspectRatioForDocumentedSize(documentedModel(capability, modelId), result.resolution, result.size) : undefined;
    // 只提交当前有效字段，草稿仍保留隐藏值供用户切回；旧像素接口需要派生比例。
    const active = Object.fromEntries(Object.entries(result).filter(([name, value]) =>
        value !== undefined && name !== 'model' && name !== 'provider' && !UI_ONLY_FIELDS.has(name)
        && name !== REFERENCE_IMAGES_FIELD && properties[name] && isPropertyVisible(name, properties, values)));
    if (ratio) active.aspectRatio = ratio;
    if (!capability.definitionsByModel?.[modelId] && result.resolution === 'custom' && result.size) active.size = result.size;
    return active;
}

export function referenceInput(capability: CanvasImageCapability, modelId: string) {
    return (capability.definitionsByModel?.[modelId] || capability.definition).inputs.find((input) => input.type === 'image');
}

export function referenceIds(value: unknown): string[] {
    return (Array.isArray(value) ? value : [value]).map((item) => typeof item === 'string' ? item : (item as { url?: string } | null)?.url || '').filter(Boolean);
}
