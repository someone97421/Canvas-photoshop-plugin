import { WidgetableProvider, WorkflowEditApiFormat } from '@sdppp/widgetable-ui';
import { Alert, Button, Flex, Select, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModelSelector } from '../../base/components/ModelSelector';
import { UploadPassProvider, useUploadPasses } from '../../base/upload-pass-context';
import { WidgetablePhotoshopProvider, createImageMaskWidgetRegistry } from '../../base/widgetable-photoshop';
import { CanvasClient, type CanvasImageCapability } from '../client';
import { resolveOptions, sameValue } from './canvas-schema';
import { defaultValues, normalizeFormValues, buildWidgets, modelIds, selectionKey, REFERENCE_IMAGES_FIELD, referenceIds, referenceInput } from './canvas-form';
import { canvasRunStore, startCanvasRun } from './canvas-run';
import { canvasConnectionStore, initializeCanvasConnection } from './canvas-connection';
import { canvasStore } from './canvas.store';
import { renderCanvasNumber } from './canvas-number';
const { Text } = Typography;
const COMMON_FIELDS = new Set([REFERENCE_IMAGES_FIELD, 'prompt']);

export default function CanvasRenderer(_props: { showingPreview: boolean }) {
    const {
        backendUrl, projectId, providerId, nodeType, modelId, capabilities, commonValuesByProject, valuesByModel,
        setSelection, setCommonValues, setValues,
    } = canvasStore();
    const { loading, ready, status, error } = canvasConnectionStore();
    const preparing = canvasRunStore((state) => state.preparing);
    const client = useMemo(() => new CanvasClient(backendUrl), [backendUrl]);
    const widgetRegistry = useMemo(() => ({ ...createImageMaskWidgetRegistry(), number: renderCanvasNumber }), []);
    useEffect(() => { void initializeCanvasConnection(); }, []);

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
    const projectKey = `${backendUrl}::${projectId}`;
    const valuesKey = projectId && selectedModelKey ? `${projectKey}::${selectedModelKey}` : '';
    const rawValues: Record<string, unknown> = selectedCapability
        ? {
            ...defaultValues(selectedCapability, modelId),
            model: modelId,
            ...(valuesByModel[valuesKey] || {}),
            ...(commonValuesByProject[projectKey] || {}),
        }
        : {};
    const resolvedForm: ReturnType<typeof normalizeFormValues> = selectedCapability
        ? normalizeFormValues(selectedCapability, modelId, rawValues)
        : { values: rawValues, properties: {} };
    const values = resolvedForm.values;

    const normalizedFields = Object.keys(values).filter((name) => !name.startsWith('__') && name !== 'model'
        && rawValues[name] !== undefined && !sameValue(rawValues[name], values[name]));

    const preserveCommonValues = () => {
        if (!projectId) return;
        const currentCommonValues = Object.fromEntries(
            Object.entries(values).filter(([name]) => COMMON_FIELDS.has(name)),
        );
        setCommonValues(projectKey, currentCommonValues);
    };

    const changeProvider = (nextProviderId: string) => {
        if (preparing || loading) return;
        preserveCommonValues();
        const saved = canvasStore.getState().selectionByProvider[nextProviderId];
        const capability = capabilities.find((item) => item.provider.id === nextProviderId && item.nodeType === saved?.nodeType)
            || capabilities.find((item) => item.provider.id === nextProviderId);
        const models = capability ? modelIds(capability) : [];
        const firstModel = models.find((item) => item.id === saved?.modelId)?.id
            || models.find((item) => item.id === capability?.definition.dataSchema.properties?.model?.default)?.id
            || models[0]?.id || '';
        setSelection(nextProviderId, capability?.nodeType || '', firstModel);
    };

    const changeModel = (value: string) => {
        if (preparing || loading) return;
        const separator = value.indexOf('::');
        if (separator < 0) return;
        const nextNodeType = value.slice(0, separator);
        const nextModelId = value.slice(separator + 2);
        const capability = capabilities.find((item) => item.nodeType === nextNodeType);
        if (capability && modelIds(capability).some((item) => item.id === nextModelId)) {
            preserveCommonValues();
            setSelection(capability.provider.id, nextNodeType, nextModelId);
        }
    };

    return (
        <Flex vertical gap={10} style={{ paddingTop: 8 }}>
            <Select
                value={providerId || undefined}
                placeholder="选择画布 Provider"
                options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
                onChange={changeProvider}
                disabled={loading || preparing || !providers.length}
            />
            <ModelSelector
                disabled={preparing || loading}
                value={selectedModelKey || undefined}
                placeholder="选择画布模型"
                loading={loading}
                options={modelOptions}
                onChange={changeModel}
            />
            {error && <Alert type="error" showIcon message={error} />}
            {status && <Text type="secondary">{status}</Text>}
            {!loading && capabilities.length === 0 && !error && <Alert type="warning" showIcon message="画布没有已配置且可用的图片 Provider" />}
            {!!normalizedFields.length && <Text type="secondary">已按当前能力调整：{normalizedFields.map((name) => resolvedForm.properties[name]?.ui?.label || name).join('、')}</Text>}
            {providerId && !modelOptions.length && !loading && <Alert type="warning" showIcon message="当前 Provider 没有可用图片模型，请检查画布配置" />}
            {ready && selectedCapability && projectId && (
                <UploadPassProvider key={`${backendUrl}::${projectId}::${selectedModelKey}`} uploader={async (uploadInput, signal) => {
                    const asset = await client.uploadAsset(projectId, uploadInput as any, signal);
                    return asset.id;
                }}>
                    <WidgetablePhotoshopProvider>
                        <WidgetableProvider widgetRegistry={widgetRegistry}>
                            <CanvasGenerationForm
                                client={client}
                                projectId={projectId}
                                projectKey={projectKey}
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
    projectKey: string;
    capability: CanvasImageCapability;
    modelId: string;
    values: Record<string, unknown>;
    valuesKey: string;
    setCommonValues: (projectId: string, values: Record<string, unknown>) => void;
    setValues: (key: string, values: Record<string, unknown>) => void;
}

function CanvasGenerationForm({
    client, projectId, projectKey, capability, modelId, values, valuesKey, setCommonValues, setValues,
}: CanvasGenerationFormProps) {
    const { running, preparing } = canvasRunStore();
    const [adjustment, setAdjustment] = useState('');
    const { waitAllUploadPasses, cancelAllUploads } = useUploadPasses();
    const normalizedForm = useMemo(
        () => normalizeFormValues(capability, modelId, values),
        [capability, modelId, values],
    );
    const widgets = useMemo(
        () => buildWidgets(capability, normalizedForm.properties, normalizedForm.values),
        [capability, normalizedForm],
    );
    const displayValues = { ...normalizedForm.values };
    for (const node of widgets) {
        if (node.widgets[0]?.outputType === 'combo') displayValues[node.id] = String(displayValues[node.id] ?? '');
    }

    const input = referenceInput(capability, modelId);
    const referenceCount = referenceIds(normalizedForm.values[REFERENCE_IMAGES_FIELD]).length;
    const referenceWarning = !input && referenceCount ? '当前能力不支持参考图，请移除参考图后生成'
        : input?.maxCount !== undefined && referenceCount > input.maxCount
            ? `当前能力最多使用 ${input.maxCount} 张参考图，草稿保留了 ${referenceCount} 张，请移除多余图片`
            : '';
    const run = () => {
        const state = canvasStore.getState();
        return startCanvasRun({ client, projectId, capability, modelId,
        projectName: state.projects.find((project) => project.id === projectId)?.name,
        values: { ...normalizedForm.values, ...state.valuesByModel[valuesKey], ...state.commonValuesByProject[projectKey] },
        waitUploads: waitAllUploadPasses,
        readReferences: () => canvasStore.getState().commonValuesByProject[projectKey]?.[REFERENCE_IMAGES_FIELD],
        cancelUploads: cancelAllUploads,
        });
    };

    return (
        <Flex vertical gap={8}>
            {referenceWarning && <Alert type="warning" showIcon message={referenceWarning} />}
            <fieldset disabled={preparing} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, pointerEvents: preparing ? 'none' : undefined }}>
            <WorkflowEditApiFormat
                modelName={valuesKey}
                nodes={widgets}
                values={displayValues}
                errors={{}}
                onWidgetChange={(_widgetIndex, value, fieldInfo) => {
                    if (canvasRunStore.getState().preparing && fieldInfo.id !== REFERENCE_IMAGES_FIELD) return;
                    const state = canvasStore.getState();
                    const changedProperty = normalizedForm.properties[fieldInfo.id];
                    const changedOptions = changedProperty ? resolveOptions(changedProperty, normalizedForm.values) : [];
                    const controlsCustomSize = fieldInfo.id !== 'resolution'
                        && changedOptions.some((option) => option.value === 'custom');
                    const nextValues = normalizeFormValues(capability, modelId, {
                        ...normalizedForm.values,
                        ...(state.valuesByModel[valuesKey] || {}),
                        ...(state.commonValuesByProject[projectKey] || {}),
                        ...(controlsCustomSize ? {
                            ['__canvasCustomSizeTarget']: value === 'custom' ? fieldInfo.id : undefined,
                        } : {}),
                        [fieldInfo.id]: value,
                    }).values;
                    if (fieldInfo.id !== REFERENCE_IMAGES_FIELD) {
                        const adjusted = Object.keys(nextValues).filter((name) => name !== fieldInfo.id && name !== 'model'
                            && !name.startsWith('__') && !sameValue(nextValues[name], normalizedForm.values[name]));
                        setAdjustment(adjusted.length ? `已同步调整：${adjusted.map((name) => normalizedForm.properties[name]?.ui?.label || name).join('、')}` : '');
                    }
                    setCommonValues(projectKey, Object.fromEntries(
                        Object.entries(nextValues).filter(([name]) => COMMON_FIELDS.has(name)),
                    ));
                    setValues(valuesKey, Object.fromEntries(
                        Object.entries(nextValues).filter(([name]) => name !== 'model' && !COMMON_FIELDS.has(name)),
                    ));
                }}
            />
            </fieldset>
            {adjustment && <Text type="secondary">{adjustment}</Text>}
            <Button type="primary" block disabled={running || !modelId} onClick={() => void run()}>
                在画布创建节点并生成
            </Button>
        </Flex>
    );
}
