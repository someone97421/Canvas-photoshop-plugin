export interface CanvasOutputAssetMetadata {
    filename?: string;
    thumbnailPath?: string | null;
    width?: number;
    height?: number;
}

export function buildCanvasAssetCatalogPath(projectId: string, includeGenerated = false): string {
    const query = includeGenerated ? '?includeGenerated=true' : '';
    return `/api/projects/${encodeURIComponent(projectId)}/assets${query}`;
}

export function resolveCanvasOutputMetadata(
    outputPath: string | undefined,
    asset: CanvasOutputAssetMetadata | undefined,
) {
    const fileName = outputPath ? outputPath.split(/[\\/]/).pop() : asset?.filename;
    return {
        fileName,
        thumbnailPath: asset?.thumbnailPath || fileName?.replace(/\.[^.]+$/, '_thumb.jpg'),
        width: asset?.width,
        height: asset?.height,
    };
}
