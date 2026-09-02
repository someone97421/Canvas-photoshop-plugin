import type { CanvasDocumentedModel, CanvasSchemaProperty } from '../client';

export function sameValue(left: unknown, right: unknown): boolean {
    return String(left ?? '') === String(right ?? '');
}

export function isPropertyVisible(
    name: string,
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
    resolving = new Set<string>(),
): boolean {
    const ui = properties[name]?.ui;
    if (!ui?.visibleWhen && !ui?.hiddenWhen) return true;
    if (resolving.has(name)) return false;
    const nextResolving = new Set(resolving).add(name);

    if (ui.visibleWhen) {
        const controller = ui.visibleWhen.field;
        if (properties[controller] && !isPropertyVisible(controller, properties, values, nextResolving)) return false;
        if (!ui.visibleWhen.values.some((value) => sameValue(value, values[controller]))) return false;
    }

    if (ui.hiddenWhen) {
        const controller = ui.hiddenWhen.field;
        if (properties[controller] && !isPropertyVisible(controller, properties, values, nextResolving)) return true;
        if (ui.hiddenWhen.values.some((value) => sameValue(value, values[controller]))) return false;
    }

    return true;
}

export function resolveOptions(property: CanvasSchemaProperty, values: Record<string, unknown>) {
    const dependency = property.ui?.dependencies;
    if (!dependency) return property.ui?.options || [];
    return dependency.mapping[String(values[dependency.field] ?? '')] || property.ui?.options || [];
}

export function usesCustomSize(property: CanvasSchemaProperty, values: Record<string, unknown>, value: unknown): boolean {
    const options = resolveOptions(property, values);
    return options.some((option) => option.value === 'custom')
        && (value === 'custom' || (
            /^\d+x\d+$/i.test(String(value || ''))
            && !options.some((option) => sameValue(option.value, value))
        ));
}

function controlsCustomBranch(name: string, properties: Record<string, CanvasSchemaProperty>): boolean {
    return Object.values(properties).some((property) => {
        const conditions = [property.ui?.visibleWhen, property.ui?.hiddenWhen];
        return conditions.some((condition) => condition?.field === name
            && condition.values.some((value) => sameValue(value, 'custom')));
    });
}

export function findInlineCustomSizeField(
    properties: Record<string, CanvasSchemaProperty>,
    values: Record<string, unknown>,
    savedTarget?: unknown,
): string | undefined {
    const eligible = (name: string) => Boolean(
        name !== 'resolution'
        && properties[name]
        && !controlsCustomBranch(name, properties)
        && isPropertyVisible(name, properties, values)
        && resolveOptions(properties[name], values).some((option) => option.value === 'custom'),
    );
    const savedName = String(savedTarget || '');
    if (savedName && eligible(savedName)) return savedName;
    return Object.keys(properties).find((name) => eligible(name)
        && usesCustomSize(properties[name], values, values[name]));
}

export function applyInlineCustomSize(
    values: Record<string, unknown>,
    target: unknown,
    width: unknown,
    height: unknown,
): Record<string, unknown> {
    const targetName = String(target || '');
    if (!targetName) return { ...values };
    const normalizedWidth = Math.round(Number(width) || 1024);
    const normalizedHeight = Math.round(Number(height) || 1024);
    return { ...values, [targetName]: `${normalizedWidth}x${normalizedHeight}` };
}

export function aspectRatioForDocumentedSize(
    model: CanvasDocumentedModel | undefined,
    resolution: unknown,
    size: unknown,
): string | undefined {
    if (!model || model.parameterMode === 'resolution-ratio' || resolution === 'custom') return undefined;
    const sizes = model.resolutionSizes?.[String(resolution)] || {};
    return Object.entries(sizes).find(([, candidate]) => sameValue(candidate, size))?.[0];
}
