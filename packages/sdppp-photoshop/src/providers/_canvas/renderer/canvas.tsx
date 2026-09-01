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
import { canvasStore } from './canvas.store';

const { Text } = Typography;
const REFERENCE_IMAGES_FIELD = '__canvasReferenceImages';
const SIZE_MODE_FIELD = '__canvasSizeMode';
const CUSTOM_WIDTH_FIELD = '__canvasCustomWidth';
const CUSTOM_HEIGHT_FIELD = '__canvasCustomHeight';
const COMMON_FIELDS = new Set([REFERENCE_IMAGES_FIELD, 'prompt']);
const UI_ONLY_FIELDS = new Set([SIZE_MODE_FIELD, CUSTOM_WIDTH_FIELD, CUSTOM_HEIGHT_FIELD]);

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

function documentedProperties(capability: CanvasImageCapability, modelId: string, values: Record<string, unknown>) {
    const model = documentedModel(capability, modelId);
    if (!model) return capability.definition.dataSchema.properties || {};
    const source = capability.definition.dataSchema.properties || {};
    const resolutions = Object.keys(model.resolutionRatios || model.resolutionSizes || {});
    const rawResolution = String(values.resolution || '');
    const legacyCustomDimensions = model.supportsCustomSize ? parseDimensions(rawResolution) : null;
    const requestedMode = String(values[SIZE_MODE_FIELD] || '');
    const customActive = Boolean(model.supportsCustomSize && (
        requestedMode ? requestedMode === 'custom' : rawResolution === 'custom' || legacyCustomDimensions
    ));
    const resolution = !customActive && resolutions.includes(rawResolution)
        ? rawResolution
        : model.defaultResolution && resolutions.includes(model.defaultResolution) ? model.defaultResolution : resolutions[0];
    const ratios = model.resolutionRatios?.[resolution] || Object.keys(model.resolutionSizes?.[resolution] || {});
    const customDimensions = legacyCustomDimensions || parseDimensions(values.size) || { width: 1024, height: 1024 };
    const properties: Record<string, CanvasSchemaProperty> = { prompt: source.prompt };

    if (model.supportsCustomSize) {
        properties[SIZE_MODE_FIELD] = {
            type: 'string',
            default: customActive ? 'custom' : 'preset',
            ui: {
                widget: 'select',
                label: '尺寸模式',
                options: [
                    { label: '分辨率档位 + 比例', value: 'preset' },
                    { label: '自定义', value: 'custom' },
                ],
            },
        };
    }
    if (customActive) {
        properties[CUSTOM_WIDTH_FIELD] = {
            type: 'number',
            default: customDimensions.width,
            ui: { widget: 'number', label: '宽度', min: 16, max: 3840, step: 16 },
        };
        properties[CUSTOM_HEIGHT_FIELD] = {
            type: 'number',
            default: customDimensions.height,
            ui: { widget: 'number', label: '高度', min: 16, max: 3840, step: 16 },
        };
    } else {
        properties.resolution = {
            type: 'string',
            default: resolution,
            ui: { widget: 'select', label: '分辨率', options: resolutions.map((value) => ({ label: value, value })) },
        };
        if (model.parameterMode === 'resolution-ratio') {
            properties.aspectRatio = {
                type: 'string',
                default: ratios[0],
                ui: { widget: 'select', label: '比例', options: ratios.map((value) => ({ label: value, value })) },
            };
        } else {
            const sizes = model.resolutionSizes?.[resolution] || {};
            properties.size = {
                type: 'string',
                default: sizes[ratios[0]] || '',
                ui: {
                    widget: 'select',
                    label: '比例 / 具体分辨率',
                    options: ratios.map((ratio) => ({
                        label: `${ratio} · ${String(sizes[ratio] || '').replace('x', '×')}`,
                        value: sizes[ratio],
                    })),
                },
            };
        }
    }

    properties.n = source.n || { type: 'number', default: 1, ui: { widget: 'number', label: '生成数量', min: 1, max: 1, step: 1 } };
    if (model.qualityOptions?.length) {
        properties.quality = {
            type: 'string', default: model.defaultQuality || model.qualityOptions[0],
            ui: { widget: 'select', label: '质量', options: model.qualityOptions.map((value) => ({ label: value, value })) },
        };
    }
    if (model.responseFormats?.length) {
        properties.responseFormat = {
            type: 'string', default: model.responseFormats[0],
            ui: { widget: 'select', label: '响应格式', options: model.responseFormats.map((value) => ({ label: value, value })) },
        };
    }
    return properties;
}

function defaultValues(capability: CanvasImageCapability, modelId: string): Record<string, unknown> {
    const properties = documentedProperties(capability, modelId, {});
    return Object.fromEntries(Object.entries(properties)
        .filter(([name]) => name !== 'provider' && name !== 'model')
        .map(([name, property]) => [name, property.default ?? defaultValue(property)])) as Record<string, unknown>;
}

function sameValue(left: unknown, right: unknown): boolean {
    return String(left ?? '') === String(right ?? '');
}

function isPropertyVisible(
    name: string,
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
    resolving = new Set<string>(),
): boolean {
    const ui = properties[name]?.ui;
    const condition = ui?.visibleWhen;
    const hiddenCondition = ui?.hiddenWhen;
    if (!condition && !hiddenCondition) return true;
    if (resolving.has(name)) return false;
    const nextResolving = new Set(resolving).add(name);
    if (condition) {
        if (properties[condition.field] && !isPropertyVisible(condition.field, properties, values, nextResolving)) return false;
        if (!condition.values.some((value) => sameValue(value, values[condition.field]))) return false;
    }
    return !hiddenCondition?.values.some((value) => sameValue(value, values[hiddenCondition.field]));
}

function defaultValue(property: CanvasSchemaProperty): unknown {
    if (property.type === 'boolean') return false;
    if (property.type === 'number' || property.type === 'integer') return 0;
    return '';
}

function resolveOptions(property: CanvasSchemaProperty, values: Record<string, unknown>) {
    const dependency = property.ui?.dependencies;
    if (!dependency) return property.ui?.options || [];
    return dependency.mapping[String(values[dependency.field] || '')] || property.ui?.options || [];
}

function normalizeFormValues(
    capability: CanvasImageCapability,
    modelId: string,
    sourceValues: Record<string, unknown>,
): { properties: Record<string, CanvasSchemaProperty>; values: Record<string, unknown> } {
    let values: Record<string, unknown> = { ...sourceValues, model: modelId };
    let properties = documentedProperties(capability, modelId, values);
    const maxPasses = Object.keys(properties).length + 1;

    for (let pass = 0; pass < maxPasses; pass += 1) {
        properties = documentedProperties(capability, modelId, values);
        const nextValues: Record<string, unknown> = {
            model: modelId,
            ...(values[REFERENCE_IMAGES_FIELD] !== undefined ? { [REFERENCE_IMAGES_FIELD]: values[REFERENCE_IMAGES_FIELD] } : {}),
        };

        for (const [name, property] of Object.entries(properties)) {
            if (name === 'provider' || name === 'model' || !isPropertyVisible(name, properties, values)) continue;
            const options = resolveOptions(property, values);
            const rawValue = values[name] ?? property.default ?? defaultValue(property);
            const currentValue = rawValue === 'custom' && options.some((option) => option.value === 'custom')
                ? /^\d+x\d+$/i.test(String(property.default)) ? property.default : '1024x1024'
                : rawValue;
            const acceptsCustomValue = options.some((option) => option.value === 'custom')
                && /^\d+x\d+$/i.test(String(currentValue));
            if (!options.length || options.some((option) => sameValue(option.value, currentValue)) || acceptsCustomValue) {
                nextValues[name] = currentValue;
                continue;
            }
            const defaultOption = options.find((option) => sameValue(option.value, property.default));
            nextValues[name] = (defaultOption || options[0]).value;
        }

        if (properties[CUSTOM_WIDTH_FIELD] && properties[CUSTOM_HEIGHT_FIELD]) {
            const width = Math.round(Number(nextValues[CUSTOM_WIDTH_FIELD]) || 1024);
            const height = Math.round(Number(nextValues[CUSTOM_HEIGHT_FIELD]) || 1024);
            nextValues.resolution = 'custom';
            nextValues.size = `${width}x${height}`;
        }

        const stable = Object.keys(values).length === Object.keys(nextValues).length
            && Object.entries(nextValues).every(([name, value]) => sameValue(values[name], value));
        values = nextValues;
        if (stable) break;
    }

    properties = documentedProperties(capability, modelId, values);
    return { properties, values };
}

function toWidget(name: string, property: CanvasSchemaProperty, values: Record<string, unknown>): WidgetableWidget {
    const common = {
        name: name === CUSTOM_WIDTH_FIELD || name === CUSTOM_HEIGHT_FIELD ? '' : property.ui?.label || name,
        uiWeight: 12,
    };
    const options = resolveOptions(property, values);
    const currentValue = String(values[name] ?? property.default ?? '');
    const matchesPreset = options.some((option) => option.value !== 'custom' && sameValue(option.value, currentValue));
    const usesCustomInput = options.some((option) => option.value === 'custom')
        && (currentValue === 'custom' || (!matchesPreset && /^\d+x\d+$/i.test(currentValue)));
    if (name !== SIZE_MODE_FIELD && usesCustomInput) return { ...common, outputType: 'string', options: { required: false } };
    if (options.length) {
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

    if (showingPreview) return null;

    return (
        <Flex vertical gap={10} style={{ paddingTop: 8 }}>
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
            <Select
                value={providerId || undefined}
                placeholder="选择画布 Provider"
                options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                onChange={changeProvider}
                disabled={loading || !providers.length}
            />
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
    const activeTaskRef = useRef<Task<Array<{ url: string; fileName?: string }>> | null>(null);
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
            const nodeValues = { ...liveValues };
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
                    const nextValues = normalizeFormValues(capability, modelId, {
                        ...normalizedForm.values,
                        ...(state.valuesByModel[valuesKey] || {}),
                        ...(state.commonValuesByProject[projectId] || {}),
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
