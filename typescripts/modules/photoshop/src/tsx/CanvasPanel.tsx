import { useEffect, useMemo, useRef, useState } from 'react';
import {
    addGraphItems,
    createCanvasTask,
    discoverCanvasBackend,
    downloadOutputAsPng,
    getProjectGraph,
    listCanvasProjects,
    listImageCapabilities,
    testCanvasConnection,
    uploadCanvasAsset,
    waitForCanvasAsset,
    waitForCanvasTask,
    type CanvasImageCapability,
    type CanvasProject,
    type CanvasSchemaOption,
    type CanvasSchemaProperty,
    type CanvasTask,
} from '../canvas/CanvasClient.js';
import {
    clearCanvasSettings,
    loadCanvasSettings,
    saveCanvasSettings,
    type CanvasSettings,
} from '../canvas/CanvasSettings.js';
import { exportPhotoshopImage, getActivePhotoshopDocumentId, importPhotoshopImage, type PhotoshopImageSource } from '../canvas/PhotoshopImageBridge.js';

const fieldStyle = { width: '100%', boxSizing: 'border-box' as const };
const rowStyle = { display: 'grid', gap: 4 };
const sectionStyle = { display: 'grid', gap: 10, padding: 12 };
const OMITTED_OPTION_FIELDS = new Set(['provider', 'model', 'prompt', 'inputAssetOrder']);

function uniqueId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function submittedValue(property: CanvasSchemaProperty | undefined, value: unknown): unknown {
    if (value === '') return undefined;
    if (property?.type === 'number') {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }
    return value;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function optionsFor(property: CanvasSchemaProperty, values: Record<string, unknown>): CanvasSchemaOption[] {
    const dependency = property.ui?.dependencies;
    if (dependency) return dependency.mapping[String(values[dependency.field] ?? '')] || [];
    return property.ui?.options || [];
}

function propertiesFor(capability: CanvasImageCapability, modelId: string): Record<string, CanvasSchemaProperty> {
    const properties = { ...capability.definition.dataSchema?.properties };
    const documented = capability.documentedModels?.find((model) => model.id === modelId);
    if (!documented) return properties;

    const resolutionMap = documented.resolutionRatios || documented.resolutionSizes || {};
    const resolutions = Object.keys(resolutionMap);
    if (resolutions.length > 0) {
        properties.resolution = {
            type: 'string',
            default: documented.defaultResolution || resolutions[0],
            ui: { widget: 'select', label: '分辨率', options: resolutions.map((value) => ({ label: value, value })) },
        };
        const ratioMapping = Object.fromEntries(Object.entries(resolutionMap).map(([resolution, value]) => {
            const ratios = Array.isArray(value) ? value : Object.keys(value);
            return [resolution, ratios.map((ratio) => ({ label: ratio, value: ratio }))];
        }));
        properties.aspectRatio = {
            type: 'string',
            ui: { widget: 'select', label: '比例', dependencies: { field: 'resolution', mapping: ratioMapping } },
        };
        if (documented.parameterMode !== 'resolution-ratio' && documented.resolutionSizes) {
            properties.size = {
                type: 'string',
                ui: {
                    widget: 'select',
                    label: '像素尺寸',
                    dependencies: {
                        field: 'resolution',
                        mapping: Object.fromEntries(Object.entries(documented.resolutionSizes).map(([resolution, sizes]) => [
                            resolution,
                            Object.entries(sizes).map(([ratio, size]) => ({ label: `${ratio} · ${size}`, value: size })),
                        ])),
                    },
                },
            };
        } else {
            delete properties.size;
        }
    }
    if (documented.qualityOptions?.length) {
        properties.quality = {
            type: 'string',
            default: documented.defaultQuality || documented.qualityOptions[0],
            ui: { widget: 'select', label: '质量', options: documented.qualityOptions.map((value) => ({ label: value, value })) },
        };
    } else {
        delete properties.quality;
    }
    if (documented.responseFormats?.length) {
        properties.responseFormat = {
            type: 'string',
            default: documented.responseFormats[0],
            ui: { widget: 'select', label: '响应格式', options: documented.responseFormats.map((value) => ({ label: value, value })) },
        };
    } else {
        delete properties.responseFormat;
    }
    return properties;
}

function initialModelOptions(properties: Record<string, CanvasSchemaProperty>, modelId: string): Record<string, unknown> {
    const values: Record<string, unknown> = { model: modelId };
    const entries = Object.entries(properties);
    for (const [key, property] of entries.filter(([, property]) => !property.ui?.dependencies)) {
        const options = optionsFor(property, values);
        values[key] = options.some((option) => option.value === property.default)
            ? property.default
            : options[0]?.value ?? property.default ?? '';
    }
    for (const [key, property] of entries.filter(([, property]) => property.ui?.dependencies)) {
        const options = optionsFor(property, values);
        values[key] = options.some((option) => option.value === property.default)
            ? property.default
            : options[0]?.value ?? property.default ?? '';
    }
    return values;
}

export default function CanvasPanel() {
    const [settings, setSettings] = useState<CanvasSettings>(loadCanvasSettings);
    const [draft, setDraft] = useState<CanvasSettings>(settings);
    const [showSettings, setShowSettings] = useState(false);
    const [projects, setProjects] = useState<CanvasProject[]>([]);
    const [capabilities, setCapabilities] = useState<CanvasImageCapability[]>([]);
    const [providerId, setProviderId] = useState('');
    const [modelId, setModelId] = useState('');
    const [modelOptions, setModelOptions] = useState<Record<string, unknown>>({});
    const [prompt, setPrompt] = useState('');
    const [submitPhotoshopImage, setSubmitPhotoshopImage] = useState(true);
    const [imageSource, setImageSource] = useState<PhotoshopImageSource>('document');
    const [activeTask, setActiveTask] = useState<CanvasTask | null>(null);
    const [status, setStatus] = useState('');
    const [statusKind, setStatusKind] = useState<'info' | 'success' | 'error'>('info');
    const [loading, setLoading] = useState(false);
    const taskAbortRef = useRef<AbortController | null>(null);

    useEffect(() => () => taskAbortRef.current?.abort(), []);

    const providers = useMemo(() => {
        const values = new Map<string, CanvasImageCapability['provider']>();
        capabilities.forEach((item) => values.set(item.provider.id, item.provider));
        return [...values.values()];
    }, [capabilities]);

    const providerCapabilities = useMemo(
        () => capabilities.filter((item) => item.provider.id === providerId),
        [capabilities, providerId],
    );
    const models = useMemo(() => {
        const values = new Map<string, { id: string; name: string; description?: string }>();
        providerCapabilities.forEach((item) => item.models.forEach((model) => values.set(model.id, model)));
        return [...values.values()];
    }, [providerCapabilities]);
    const capability = useMemo(
        () => providerCapabilities.find((item) => item.models.some((model) => model.id === modelId)) || providerCapabilities[0],
        [providerCapabilities, modelId],
    );
    const selectedProject = useMemo(
        () => projects.find((project) => project.id === settings.projectId),
        [projects, settings.projectId],
    );

    const refreshCatalog = async (nextSettings = settings) => {
        setLoading(true);
        setStatusKind('info');
        setStatus('正在读取 Canvas 数据...');
        try {
            const [nextProjects, nextCapabilities] = await Promise.all([
                listCanvasProjects(nextSettings.backendUrl),
                listImageCapabilities(nextSettings.backendUrl),
            ]);
            setProjects(nextProjects);
            setCapabilities(nextCapabilities);
            setProviderId((current) => nextCapabilities.some((item) => item.provider.id === current)
                ? current
                : nextCapabilities[0]?.provider.id || '');
            setStatus(`已读取 ${nextCapabilities.length} 个生图能力`);
            setStatusKind('success');
        } catch (error) {
            setProjects([]);
            setCapabilities([]);
            setStatus(errorMessage(error));
            setStatusKind('error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void (async () => {
            try {
                const discoveredUrl = await discoverCanvasBackend(settings.backendUrl);
                if (discoveredUrl !== settings.backendUrl) {
                    const next = { ...settings, backendUrl: discoveredUrl };
                    saveCanvasSettings(next);
                    setSettings(next);
                    setDraft(next);
                    setStatus(`已发现 Canvas 后端：${discoveredUrl}`);
                    setStatusKind('success');
                    return;
                }
                await refreshCatalog(settings);
            } catch (error) {
                setStatus(errorMessage(error));
                setStatusKind('error');
            }
        })();
    }, [settings.backendUrl]);

    useEffect(() => {
        setModelId((current) => models.some((model) => model.id === current) ? current : models[0]?.id || '');
    }, [models]);

    useEffect(() => {
        if (capability && modelId) {
            const properties = propertiesFor(capability, modelId);
            setModelOptions(initialModelOptions(properties, modelId));
        }
    }, [capability?.nodeType, modelId]);

    const updateDraft = <K extends keyof CanvasSettings>(key: K, value: CanvasSettings[K]) => {
        setDraft((current) => ({ ...current, [key]: value }));
    };

    const saveSettings = () => {
        const longEdge = draft.maxLongEdge.trim();
        const quality = draft.compressionQuality.trim();
        if (longEdge && (!Number.isInteger(Number(longEdge)) || Number(longEdge) <= 0)) {
            setStatus('长边限制必须留空或填写正整数');
            setStatusKind('error');
            return;
        }
        if (quality && (!Number.isFinite(Number(quality)) || Number(quality) < 1 || Number(quality) > 100)) {
            setStatus('压缩质量必须留空或填写 1 到 100');
            setStatusKind('error');
            return;
        }
        if (!/^#[0-9a-f]{6}$/i.test(draft.alphaBackground)) {
            setStatus('Alpha 区域底板颜色必须是 #RRGGBB');
            setStatusKind('error');
            return;
        }
        if (!draft.projectId || !projects.some((project) => project.id === draft.projectId)) {
            setStatus('请选择一个当前后端中可用的任务记录项目');
            setStatusKind('error');
            return;
        }
        const next = { ...draft, backendUrl: draft.backendUrl.trim().replace(/\/+$/, '') };
        saveCanvasSettings(next);
        setSettings(next);
        setShowSettings(false);
        setStatus('设置已保存');
        setStatusKind('success');
    };

    const resetSettings = () => {
        const next = clearCanvasSettings();
        setDraft(next);
        setSettings(next);
        setStatus('已恢复默认设置');
        setStatusKind('success');
    };

    const testConnection = async () => {
        setLoading(true);
        setStatusKind('info');
        setStatus('正在测试连接...');
        try {
            setStatus(await testCanvasConnection(draft.backendUrl));
            const nextProjects = await listCanvasProjects(draft.backendUrl);
            setProjects(nextProjects);
        } catch (error) {
            setStatus(errorMessage(error));
            setStatusKind('error');
        } finally {
            setLoading(false);
        }
    };

    const properties = capability ? propertiesFor(capability, modelId) : {};

    const submitGeneration = async () => {
        if (!settings.projectId) {
            setShowSettings(true);
            setStatus('请先在设置中选择任务记录项目');
            setStatusKind('error');
            return;
        }
        if (!selectedProject) {
            setShowSettings(true);
            setStatus('任务记录项目不可用，请在设置中重新选择');
            setStatusKind('error');
            return;
        }
        if (!capability || !providerId || !modelId) {
            setStatus('当前没有可用的生图模型');
            setStatusKind('error');
            return;
        }
        if (!prompt.trim()) {
            setStatus('请填写生图提示词');
            setStatusKind('error');
            return;
        }
        const imageInput = capability.definition.inputs?.find((input) => input.type === 'image');
        if (submitPhotoshopImage && !imageInput) {
            setStatus('当前模型节点不支持图片输入');
            setStatusKind('error');
            return;
        }

        setLoading(true);
        setStatusKind('info');
        setActiveTask(null);
        const execution = { backendUrl: settings.backendUrl, projectId: settings.projectId };
        const targetDocumentId = getActivePhotoshopDocumentId();
        const taskController = new AbortController();
        taskAbortRef.current = taskController;
        try {
            setStatus('正在写入画布节点...');
            const graph = await getProjectGraph(settings.backendUrl, settings.projectId);
            const rightmost = graph.nodes.reduce((value, node) => Math.max(value, node.ui.x + (node.ui.width || 300)), 0);
            const generationNodeId = uniqueId('ps-generation');
            const now = Date.now();
            const data = Object.fromEntries(Object.entries({
                ...modelOptions,
                provider: providerId,
                model: modelId,
                prompt: prompt.trim(),
            }).flatMap(([key, value]) => {
                const submitted = submittedValue(properties[key], value);
                return submitted === undefined ? [] : [[key, submitted]];
            }));
            const nodes = [{
                id: generationNodeId,
                type: capability.nodeType,
                ui: { x: rightmost + (submitPhotoshopImage ? 440 : 80), y: 80, width: 320, height: 260 },
                data,
                createdAt: now,
                updatedAt: now,
            }];
            const edges: Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }> = [];
            if (submitPhotoshopImage) {
                setStatus('正在从 Photoshop 读取图片...');
                const format = settings.submitFormat;
                const bytes = await exportPhotoshopImage({
                    source: imageSource,
                    format,
                    maxLongEdge: settings.maxLongEdge ? Number(settings.maxLongEdge) : undefined,
                    quality: settings.compressionQuality ? Number(settings.compressionQuality) : undefined,
                    alphaBackground: settings.alphaBackground,
                });
                const extension = format === 'jpeg' ? 'jpg' : 'png';
                const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
                setStatus(`正在上传 Photoshop 图片 (${Math.round(bytes.byteLength / 1024)} KB)...`);
                const uploaded = await uploadCanvasAsset(
                    settings.backendUrl,
                    settings.projectId,
                    bytes,
                    `photoshop-${Date.now()}.${extension}`,
                    mimeType,
                );
                const asset = uploaded.status === 'ready'
                    ? uploaded
                    : await waitForCanvasAsset(settings.backendUrl, settings.projectId, uploaded.id);
                const assetNodeId = uniqueId('ps-asset');
                if (capability.nodeType === 'image-generation-midjourney-rh') {
                    data.imageRefAssetId = asset.id;
                }
                nodes.unshift({
                    id: assetNodeId,
                    type: 'image-asset',
                    ui: { x: rightmost + 80, y: 80, width: 280, height: 220 },
                    data: {
                        assetId: asset.id,
                        filename: asset.filename,
                        originalName: asset.originalName,
                        type: 'image',
                        status: 'ready',
                    },
                    createdAt: now,
                    updatedAt: now,
                });
                edges.push({
                    id: uniqueId('ps-edge'),
                    source: assetNodeId,
                    target: generationNodeId,
                    sourceHandle: 'output',
                    targetHandle: imageInput?.id || 'image',
                });
            }
            setStatus('正在写入画布节点...');
            await addGraphItems(settings.backendUrl, settings.projectId, {
                mutationId: uniqueId('photoshop'),
                nodes,
                edges,
            });

            setStatus('任务已提交，等待画布生成...');
            const created = await createCanvasTask(execution.backendUrl, execution.projectId, generationNodeId);
            setActiveTask(created);
            const completed = await waitForCanvasTask(
                execution.backendUrl,
                execution.projectId,
                created.id,
                (task) => {
                    setActiveTask(task);
                    setStatus(`画布生成中：${task.progress}%`);
                },
                taskController.signal,
            );
            const outputIds = completed.result?.outputAssetIds || [];
            if (outputIds.length === 0) throw new Error('任务成功但没有返回图片资产');
            setStatus(`正在向 Photoshop 导入 ${outputIds.length} 张结果...`);
            for (let index = 0; index < outputIds.length; index++) {
                const output = await downloadOutputAsPng(execution.backendUrl, execution.projectId, outputIds[index]);
                await importPhotoshopImage(output, `Canvas ${capability.definition.name} ${index + 1}`, targetDocumentId);
            }
            setStatus(`生成完成，已导入 ${outputIds.length} 个 Photoshop 图层`);
            setStatusKind('success');
        } catch (error) {
            setStatus(errorMessage(error));
            setStatusKind('error');
        } finally {
            if (taskAbortRef.current === taskController) taskAbortRef.current = null;
            setLoading(false);
        }
    };

    const stopWaiting = () => {
        taskAbortRef.current?.abort();
        setStatus('已停止本地等待，任务继续由画布后台执行');
        setStatusKind('info');
    };

    return <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
            <sp-heading size="S">Xuanshang Canvas</sp-heading>
            <div style={{ display: 'flex', gap: 6 }}>
                <sp-action-button disabled={loading || undefined} onClick={() => void refreshCatalog()}>刷新</sp-action-button>
                <sp-action-button disabled={loading || undefined} onClick={() => { setDraft(settings); setShowSettings((value) => !value); }}>设置</sp-action-button>
            </div>
        </div>

        {showSettings && <div style={{ ...sectionStyle, border: '1px solid var(--spectrum-global-color-gray-500)', borderRadius: 6 }}>
            <sp-heading size="XS">Canvas 设置</sp-heading>
            <label style={rowStyle}>后端地址
                <input style={fieldStyle} value={draft.backendUrl} onChange={(event) => updateDraft('backendUrl', event.target.value)} disabled={loading} />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
                <sp-button variant="secondary" disabled={loading || undefined} onClick={() => void testConnection()}>测试连接</sp-button>
            </div>
            <label style={rowStyle}>任务记录项目
                <select style={fieldStyle} value={draft.projectId} onChange={(event) => updateDraft('projectId', event.target.value)} disabled={loading}>
                    <option value="">请选择项目</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
            </label>
            <sp-detail>上传资产、节点、连线和任务记录都会写入该项目。</sp-detail>
            <label style={rowStyle}>长边限制（px，留空不限制）
                <input style={fieldStyle} type="number" min="1" value={draft.maxLongEdge} onChange={(event) => updateDraft('maxLongEdge', event.target.value)} disabled={loading} />
            </label>
            <label style={rowStyle}>压缩质量（1-100，留空使用默认值）
                <input style={fieldStyle} type="number" min="1" max="100" value={draft.compressionQuality} onChange={(event) => updateDraft('compressionQuality', event.target.value)} disabled={loading} />
            </label>
            <label style={rowStyle}>提交格式
                <select style={fieldStyle} value={draft.submitFormat} onChange={(event) => updateDraft('submitFormat', event.target.value === 'jpeg' ? 'jpeg' : 'png')} disabled={loading}>
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                </select>
            </label>
            <label style={rowStyle}>Alpha 区域底板颜色
                <div style={{ display: 'flex', gap: 6 }}>
                    <input type="color" value={draft.alphaBackground} onChange={(event) => updateDraft('alphaBackground', event.target.value.toUpperCase())} disabled={loading} />
                    <input style={fieldStyle} value={draft.alphaBackground} onChange={(event) => updateDraft('alphaBackground', event.target.value)} disabled={loading} />
                </div>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
                <sp-button variant="accent" disabled={loading || undefined} onClick={saveSettings}>保存设置</sp-button>
                <sp-button variant="secondary" disabled={loading || undefined} onClick={resetSettings}>恢复默认设置</sp-button>
            </div>
        </div>}

        <div style={sectionStyle}>
            <sp-detail>
                当前任务项目：{selectedProject?.name || (settings.projectId ? '项目不可用，请重新选择' : '未选择')}
            </sp-detail>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                    type="checkbox"
                    checked={submitPhotoshopImage}
                    onChange={(event) => setSubmitPhotoshopImage(event.target.checked)}
                    disabled={loading}
                />
                提交 Photoshop 图片作为参考图
            </label>
            {submitPhotoshopImage && <label style={rowStyle}>Photoshop 图片来源
                <select style={fieldStyle} value={imageSource} onChange={(event) => setImageSource(event.target.value === 'layer' ? 'layer' : 'document')} disabled={loading}>
                    <option value="document">当前文档合成画面</option>
                    <option value="layer">当前选中图层</option>
                </select>
            </label>}
            <label style={rowStyle}>Provider
                <select style={fieldStyle} value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={loading}>
                    {providers.length === 0 && <option value="">暂无可用生图 Provider</option>}
                    {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </select>
            </label>
            <label style={rowStyle}>生图模型
                <select style={fieldStyle} value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={loading || models.length === 0}>
                    {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
            </label>
            {capability && <sp-detail>{capability.definition.name} · {capability.nodeType}</sp-detail>}
            <label style={rowStyle}>提示词
                <textarea
                    style={{ ...fieldStyle, minHeight: 88, resize: 'vertical' }}
                    value={prompt}
                    placeholder="描述希望生成或编辑的图片"
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={loading}
                />
            </label>
            {Object.entries(properties).filter(([key, property]) => {
                if (OMITTED_OPTION_FIELDS.has(key) || !property.ui) return false;
                return property.ui.widget !== 'textarea' && property.ui.widget !== 'chipinput';
            }).map(([key, property]) => {
                const options = optionsFor(property, modelOptions);
                const label = property.ui?.label || key;
                if (options.length > 0) return <label key={key} style={rowStyle}>{label}
                    <select style={fieldStyle} value={String(modelOptions[key] ?? '')} onChange={(event) => setModelOptions((current) => {
                        const next = { ...current, [key]: event.target.value };
                        for (const [dependentKey, dependent] of Object.entries(properties)) {
                            if (dependent.ui?.dependencies?.field !== key) continue;
                            const dependentOptions = optionsFor(dependent, next);
                            if (!dependentOptions.some((option) => String(option.value) === String(next[dependentKey]))) {
                                next[dependentKey] = dependentOptions[0]?.value ?? '';
                            }
                        }
                        return next;
                    })}>
                        {options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
                    </select>
                </label>;
                if (property.type === 'boolean') return <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={Boolean(modelOptions[key])} onChange={(event) => setModelOptions((current) => ({ ...current, [key]: event.target.checked }))} />
                    {label}
                </label>;
                if (property.type === 'number') return <label key={key} style={rowStyle}>{label}
                    <input style={fieldStyle} type="number" min={property.ui?.min} max={property.ui?.max} step={property.ui?.step} value={String(modelOptions[key] ?? '')} onChange={(event) => setModelOptions((current) => ({ ...current, [key]: event.target.value }))} />
                </label>;
                return null;
            })}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <sp-button variant="accent" disabled={loading || undefined} onClick={() => void submitGeneration()}>
                    {loading ? '处理中...' : '提交到 Canvas 并回传 PS'}
                </sp-button>
                {activeTask && (activeTask.status === 'queued' || activeTask.status === 'running') &&
                    <sp-button variant="secondary" onClick={stopWaiting}>停止等待</sp-button>}
            </div>
            {activeTask && <div style={{ display: 'grid', gap: 4 }}>
                <sp-progressbar value={activeTask.progress} max="100" />
                <sp-detail>任务 {activeTask.id} · {activeTask.status} · {activeTask.progress}%</sp-detail>
            </div>}
        </div>
        {status && <sp-label class={statusKind === 'error' ? 'error-label' : ''}>{status}</sp-label>}
    </div>;
}
