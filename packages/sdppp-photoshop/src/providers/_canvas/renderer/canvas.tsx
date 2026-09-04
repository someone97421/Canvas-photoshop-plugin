import { sdpppSDK } from '@sdppp/common';
import type { WidgetableNode, WidgetableWidget } from '@sdppp/common/schemas/schemas';
import { buildBoundaryUri } from '@sdppp/resourcing/src/resource-uris';
import { WidgetableProvider, WorkflowEditApiFormat } from '@sdppp/widgetable-ui';
import { Alert, Button, Flex, Input, Progress, Select, Tooltip, Typography } from 'antd';
import { CircleStop, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MainStore } from '../../../tsx/App.store';
import { ModelSelector } from '../../base/components/ModelSelector';
import type { Task } from '../../base/Task';
import { UploadPassProvider, useUploadPasses } from '../../base/upload-pass-context';
import { WidgetablePhotoshopProvider, createImageMaskWidgetRegistry } from '../../base/widgetable-photoshop';
import {
    CanvasClient,
    discoverCanvasBackend,
    type CanvasImageCapability,
    type CanvasDocumentedModel,
    type CanvasSchemaProperty,
} from '../client';
import {
    applyInlineCustomSize,
    aspectRatioForDocumentedSize,
    findInlineCustomSizeField,
    isPropertyVisible,
    resolveOptions,
    sameValue,
} from './canvas-schema';
import { canvasStore } from './canvas.store';

const { Text } = Typography;
const REFERENCE_IMAGES_FIELD = '__canvasReferenceImages';
const LEGACY_SIZE_MODE_FIELD = '__canvasSizeMode';
const CUSTOM_WIDTH_FIELD = '__canvasCustomWidth';
const CUSTOM_HEIGHT_FIELD = '__canvasCustomHeight';
const CUSTOM_SIZE_TARGET_FIELD = '__canvasCustomSizeTarget';
const COMMON_FIELDS = new Set([REFERENCE_IMAGES_FIELD, 'prompt']);
const UI_ONLY_FIELDS = new Set([LEGACY_SIZE_MODE_FIELD, CUSTOM_WIDTH_FIELD, CUSTOM_HEIGHT_FIELD, CUSTOM_SIZE_TARGET_FIELD]);

function selectionKey(nodeType: string, modelId: string): string {
    return `${nodeType}::${modelId}`;
}

function modelIds(capability: CanvasImageCapability): Array<{ id: string; name: string }> {
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
            ui: { ...source.quality?.ui, widget: 'select', label: '质量', options: model.qualityOptions.map((value) => ({ label: value, value })) },
        };
    } else delete properties.quality;
    if (model.responseFormats?.length) {
        properties.responseFormat = {
            ...source.responseFormat,
            type: 'string', default: model.responseFormats[0],
            ui: { ...source.responseFormat?.ui, widget: 'select', label: '响应格式', options: model.responseFormats.map((value) => ({ label: value, value })) },
        };
    } else delete properties.responseFormat;
    return properties;
}

function defaultValues(capability: CanvasImageCapability, modelId: string): Record<string, unknown> {
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
    if (property.type === 'number' || property.type === 'integer') return 0;
    return '';
}

function normalizeFormValues(
    capability: CanvasImageCapability,
    modelId: string,
    sourceValues: Record<string, unknown>,
): { properties: Record<string, CanvasSchemaProperty>; values: Record<string, unknown> } {
    let values: Record<string, unknown> = { ...sourceValues, model: modelId };
    const model = documentedModel(capability, modelId);
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
                nextValues[name] = currentValue;
                continue;
            }
            const defaultOption = options.find((option) => sameValue(option.value, property.default));
            nextValues[name] = (defaultOption || options[0]).value;
        }

        if (properties[CUSTOM_WIDTH_FIELD] && properties[CUSTOM_HEIGHT_FIELD] && nextValues.resolution === 'custom') {
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
            ['image-generation-green-goblin', 'image-generation-geeknow'].includes(capability.nodeType) ? model : undefined,
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

function buildWidgets(
    capability: CanvasImageCapability,
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
): WidgetableNode[] {
    const nodes: WidgetableNode[] = [];
    const imageInput = capability.definition.inputs.find((input) => input.type === 'image');
    if (imageInput) {
        nodes.push({
            id: REFERENCE_IMAGES_FIELD,
            title: imageInput.name || '参考图片',
            widgets: [{
                name: REFERENCE_IMAGES_FIELD,
                outputType: 'images',
                uiWeight: 12,
                options: {
                    required: Boolean(imageInput.required),
                    maxCount: imageInput.maxCount ?? 10,
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

export default function CanvasRenderer({ showingPreview }: { showingPreview: boolean }) {
    const {
        backendUrl, projectId, providerId, nodeType, modelId, projects, capabilities, commonValuesByProject, valuesByModel,
        setBackendUrl, setProjectId, setSelection, setCatalog, setCommonValues, setValues,
    } = canvasStore();
    const [draftUrl, setDraftUrl] = useState(backendUrl);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const client = useMemo(() => new CanvasClient(backendUrl), [backendUrl]);

    const selectCatalogDefaults = (
        nextProjects: typeof projects,
        nextCapabilities: CanvasImageCapability[],
        preferredProjectId = canvasStore.getState().projectId,
    ) => {
        const nextProjectId = nextProjects.some((project) => project.id === preferredProjectId)
            ? preferredProjectId
            : nextProjects[0]?.id || '';
        const current = canvasStore.getState();
        const selectedCapability = nextCapabilities.find((item) => item.nodeType === current.nodeType)
            || nextCapabilities.find((item) => item.provider.id === current.providerId)
            || nextCapabilities[0];
        const models = selectedCapability ? modelIds(selectedCapability) : [];
        const nextModelId = models.some((model) => model.id === current.modelId)
            ? current.modelId
            : models[0]?.id || '';
        setCatalog(nextProjects, nextCapabilities);
        setProjectId(nextProjectId);
        setSelection(selectedCapability?.provider.id || '', selectedCapability?.nodeType || '', nextModelId);
    };

    const connect = async (discover = false) => {
        setLoading(true);
        setError('');
        setStatus(discover ? '正在查找画布后端...' : '正在连接画布...');
        try {
            const resolvedUrl = discover ? await discoverCanvasBackend(draftUrl) : draftUrl.trim().replace(/\/+$/, '');
            const nextClient = new CanvasClient(resolvedUrl);
            const [serverStatus, loadedProjects, nextCapabilities] = await Promise.all([
                nextClient.getStatus(), nextClient.listProjects(), nextClient.listImageCapabilities(),
            ]);
            const nextProjects = loadedProjects.length ? loadedProjects : [await nextClient.createProject()];
            setBackendUrl(resolvedUrl);
            setDraftUrl(resolvedUrl);
            selectCatalogDefaults(nextProjects, nextCapabilities);
            setStatus(`已连接画布 ${serverStatus.version || ''}，发现 ${nextCapabilities.length} 个可用图片能力`.trim());
        } catch (connectError) {
            setStatus('');
            setError(connectError instanceof Error ? connectError.message : String(connectError));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void connect(true); }, []);

    const providers = useMemo(() => Array.from(new Map(capabilities.map((capability) => [
        capability.provider.id, capability.provider,
    ])).values()), [capabilities]);
    const providerCapabilities = capabilities.filter((capability) => capability.provider.id === providerId);
    const selectedCapability = capabilities.find((capability) => capability.nodeType === nodeType);
    const modelOptions = providerCapabilities.flatMap((capability) => modelIds(capability).map((model) => ({
        value: selectionKey(capability.nodeType, model.id),
        label: model.name,
        displayText: model.name,
        searchText: `${model.name} ${model.id} ${capability.definition.name}`,
    })));
    const selectedModelKey = nodeType && modelId ? selectionKey(nodeType, modelId) : '';
    const valuesKey = projectId && selectedModelKey ? `${projectId}::${selectedModelKey}` : '';
    const rawValues = selectedCapability
        ? {
            ...defaultValues(selectedCapability, modelId),
            model: modelId,
            ...(valuesByModel[valuesKey] || {}),
            ...(commonValuesByProject[projectId] || {}),
        }
        : {};
    const values = selectedCapability
        ? normalizeFormValues(selectedCapability, modelId, rawValues).values
        : rawValues;

    const preserveCommonValues = () => {
        if (!projectId) return;
        const currentCommonValues = Object.fromEntries(
            Object.entries(values).filter(([name]) => COMMON_FIELDS.has(name)),
        );
        setCommonValues(projectId, currentCommonValues);
    };

    const changeProvider = (nextProviderId: string) => {
        preserveCommonValues();
        const capability = capabilities.find((item) => item.provider.id === nextProviderId);
        const firstModel = capability ? modelIds(capability)[0]?.id || '' : '';
        setSelection(nextProviderId, capability?.nodeType || '', firstModel);
    };

    const changeModel = (value: string) => {
        const separator = value.indexOf('::');
        if (separator < 0) return;
        const nextNodeType = value.slice(0, separator);
        const nextModelId = value.slice(separator + 2);
        const capability = capabilities.find((item) => item.nodeType === nextNodeType);
        if (capability) {
            preserveCommonValues();
            setSelection(capability.provider.id, nextNodeType, nextModelId);
        }
    };

    if (showingPreview) {
        return (
            <Flex vertical gap={10} className="canvas-settings-page" style={{ paddingTop: 8 }}>
                <Select
                    value={providerId || undefined}
                    placeholder="选择画布 Provider"
                    options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                    onChange={changeProvider}
                    disabled={loading || !providers.length}
                />
                <Flex gap={6}>
                    <Input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} placeholder="画布后端地址" />
                    <Tooltip title="重新连接并刷新能力">
                        <Button icon={<RefreshCw size={16} />} loading={loading} onClick={() => void connect(false)} />
                    </Tooltip>
                </Flex>
                <Select
                    value={projectId || undefined}
                    placeholder="选择节点保存到哪个画布项目"
                    options={projects.map((project) => ({ value: project.id, label: project.name }))}
                    onChange={setProjectId}
                    disabled={loading || !projects.length}
                />
                {error && <Alert type="error" showIcon message={error} />}
                {status && <Text type="secondary">{status}</Text>}
                {!loading && capabilities.length === 0 && !error && <Alert type="warning" showIcon message="画布没有已配置且可用的图片 Provider" />}
            </Flex>
        );
    }

    return (
        <Flex vertical gap={10} style={{ paddingTop: 8 }}>
            <ModelSelector
                value={selectedModelKey || undefined}
                placeholder="选择画布模型"
                loading={loading}
                options={modelOptions}
                onChange={changeModel}
            />
            {error && <Alert type="error" showIcon message={error} />}
            {status && <Text type="secondary">{status}</Text>}
            {!loading && capabilities.length === 0 && !error && <Alert type="warning" showIcon message="画布没有已配置且可用的图片 Provider" />}
            {selectedCapability && projectId && (
                <UploadPassProvider uploader={async (uploadInput, signal) => {
                    const asset = await client.uploadAsset(projectId, uploadInput as any, signal);
                    return asset.id;
                }}>
                    <WidgetablePhotoshopProvider>
                        <WidgetableProvider widgetRegistry={createImageMaskWidgetRegistry()}>
                            <CanvasGenerationForm
                                client={client}
                                projectId={projectId}
                                capability={selectedCapability}
                                modelId={modelId}
                                values={values}
                                valuesKey={valuesKey}
                                setCommonValues={setCommonValues}
                                setValues={setValues}
                            />
                        </WidgetableProvider>
                    </WidgetablePhotoshopProvider>
                </UploadPassProvider>
            )}
        </Flex>
    );
}

interface CanvasGenerationFormProps {
    client: CanvasClient;
    projectId: string;
    capability: CanvasImageCapability;
    modelId: string;
    values: Record<string, unknown>;
    valuesKey: string;
    setCommonValues: (projectId: string, values: Record<string, unknown>) => void;
    setValues: (key: string, values: Record<string, unknown>) => void;
}

function CanvasGenerationForm({
    client, projectId, capability, modelId, values, valuesKey, setCommonValues, setValues,
}: CanvasGenerationFormProps) {
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const [running, setRunning] = useState(false);
    const activeTaskRef = useRef<Task<Array<{
        url: string;
        fileName?: string;
        thumbnail?: string;
        width?: number;
        height?: number;
    }>> | null>(null);
    const runControllerRef = useRef<AbortController | null>(null);
    const { waitAllUploadPasses, cancelAllUploads } = useUploadPasses();
    const downloadAndAppendImage = MainStore((state) => state.downloadAndAppendImage);
    const normalizedForm = useMemo(
        () => normalizeFormValues(capability, modelId, values),
        [capability, modelId, values],
    );
    const widgets = useMemo(
        () => buildWidgets(capability, normalizedForm.properties, normalizedForm.values),
        [capability, normalizedForm],
    );

    const run = async () => {
        setRunning(true);
        setError('');
        setProgress(0);
        setStatus('正在上传 Photoshop 参考图...');
        const runController = new AbortController();
        runControllerRef.current = runController;
        try {
            await waitAllUploadPasses(runController.signal);
            await new Promise((resolve) => setTimeout(resolve, 100));
            if (runController.signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            const storeState = canvasStore.getState();
            const liveValues = normalizeFormValues(capability, modelId, {
                ...values,
                ...(storeState.valuesByModel[valuesKey] || {}),
                ...(storeState.commonValuesByProject[projectId] || {}),
            }).values;
            const referenceValue = liveValues[REFERENCE_IMAGES_FIELD];
            const assetIds = (Array.isArray(referenceValue) ? referenceValue : [referenceValue])
                .map((item) => typeof item === 'string' ? item : (item as { url?: string } | null)?.url || '')
                .filter(Boolean);
            const nodeValues = applyInlineCustomSize(
                liveValues,
                liveValues[CUSTOM_SIZE_TARGET_FIELD],
                liveValues[CUSTOM_WIDTH_FIELD],
                liveValues[CUSTOM_HEIGHT_FIELD],
            );
            const submissionAspectRatio = aspectRatioForDocumentedSize(
                ['image-generation-green-goblin', 'image-generation-geeknow'].includes(capability.nodeType)
                    ? documentedModel(capability, modelId)
                    : undefined,
                nodeValues.resolution,
                nodeValues.size,
            );
            if (submissionAspectRatio) nodeValues.aspectRatio = submissionAspectRatio;
            delete nodeValues[REFERENCE_IMAGES_FIELD];
            delete nodeValues.model;
            UI_ONLY_FIELDS.forEach((field) => delete nodeValues[field]);
            setStatus('正在画布中创建资产、节点和连线...');
            const nodeId = await client.createGenerationGraph(projectId, capability, modelId, nodeValues, assetIds, runController.signal);
            if (runController.signal.aborted) throw new DOMException('Generation cancelled', 'AbortError');
            setStatus('正在创建画布生成任务...');
            const task = await client.run(projectId, nodeId);
            activeTaskRef.current = task;
            if (runController.signal.aborted) {
                await task.cancel();
                void task.promise.catch(() => undefined);
                throw new DOMException('Generation cancelled', 'AbortError');
            }
            const docId = sdpppSDK.stores.PhotoshopStore.getState().activeDocumentID ?? 0;
            const webviewState = sdpppSDK.stores.WebviewStore.getState();
            const boundary = webviewState?.workBoundaries?.[docId] ?? null;
            const boundaryUri = buildBoundaryUri(docId, boundary);
            const interval = setInterval(() => {
                setProgress(task.progress || 0);
                setStatus(task.progressMessage || '画布任务执行中...');
            }, 250);
            try {
                const outputs = await task.promise;
                await Promise.all(outputs.map((output) => downloadAndAppendImage({
                    url: output.url,
                    fileName: output.fileName,
                    thumbnail: output.thumbnail,
                    width: output.width,
                    height: output.height,
                    source: 'canvas',
                    docId,
                    boundaryUri,
                    maskUri: null,
                    maskHandle: null,
                })));
                setProgress(100);
                setStatus(`生成完成，已接收 ${outputs.length} 张图片`);
            } finally {
                clearInterval(interval);
                await sdpppSDK.plugins.photoshop.taskRemove({ taskId: task.taskId }).catch(() => undefined);
            }
        } catch (runError) {
            if (runController.signal.aborted || (runError instanceof Error && runError.name === 'AbortError')) {
                setStatus('画布任务已取消');
            } else {
                setStatus('');
                setError(runError instanceof Error ? runError.message : String(runError));
            }
        } finally {
            activeTaskRef.current = null;
            runControllerRef.current = null;
            setRunning(false);
        }
    };

    const cancel = async () => {
        runControllerRef.current?.abort();
        cancelAllUploads();
        if (activeTaskRef.current?.cancelable) await activeTaskRef.current.cancel();
        setStatus('画布任务已取消');
    };

    return (
        <Flex vertical gap={8}>
            <WorkflowEditApiFormat
                modelName={valuesKey}
                nodes={widgets}
                values={normalizedForm.values}
                errors={{}}
                onWidgetChange={(_widgetIndex, value, fieldInfo) => {
                    const state = canvasStore.getState();
                    const changedProperty = normalizedForm.properties[fieldInfo.id];
                    const changedOptions = changedProperty ? resolveOptions(changedProperty, normalizedForm.values) : [];
                    const controlsCustomSize = fieldInfo.id !== 'resolution'
                        && changedOptions.some((option) => option.value === 'custom');
                    const nextValues = normalizeFormValues(capability, modelId, {
                        ...normalizedForm.values,
                        ...(state.valuesByModel[valuesKey] || {}),
                        ...(state.commonValuesByProject[projectId] || {}),
                        ...(controlsCustomSize ? {
                            [CUSTOM_SIZE_TARGET_FIELD]: value === 'custom' ? fieldInfo.id : undefined,
                        } : {}),
                        [fieldInfo.id]: value,
                    }).values;
                    setCommonValues(projectId, Object.fromEntries(
                        Object.entries(nextValues).filter(([name]) => COMMON_FIELDS.has(name)),
                    ));
                    setValues(valuesKey, Object.fromEntries(
                        Object.entries(nextValues).filter(([name]) => name !== 'model' && !COMMON_FIELDS.has(name)),
                    ));
                }}
            />
            {error && <Alert type="error" showIcon message={error} />}
            {status && <Text type="secondary">{status}</Text>}
            {(running || progress > 0) && <Progress percent={progress} size="small" status={error ? 'exception' : undefined} />}
            <Flex gap={8}>
                <Button type="primary" block disabled={running || !modelId} onClick={() => void run()}>
                    在画布创建节点并生成
                </Button>
                {running && (
                    <Button danger icon={<CircleStop size={16} />} onClick={() => void cancel()} />
                )}
            </Flex>
        </Flex>
    );
}
