import { describe, expect, it } from 'vitest';
import { buildCanvasAssetCatalogPath, resolveCanvasOutputMetadata } from './output-metadata';

describe('buildCanvasAssetCatalogPath', () => {
    it('requests generated output assets when resolving task results', () => {
        expect(buildCanvasAssetCatalogPath('project/1', true))
            .toBe('/api/projects/project%2F1/assets?includeGenerated=true');
    });
});

describe('resolveCanvasOutputMetadata', () => {
    it('keeps asset dimensions when the task also returns an output path', () => {
        expect(resolveCanvasOutputMetadata('outputs/result.png', {
            filename: 'catalog-name.png',
            thumbnailPath: 'result_thumb.jpg',
            width: 1536,
            height: 1024,
        })).toEqual({
            fileName: 'result.png',
            thumbnailPath: 'result_thumb.jpg',
            width: 1536,
            height: 1024,
        });
    });

    it('falls back to the catalog filename and derived thumbnail name', () => {
        expect(resolveCanvasOutputMetadata(undefined, {
            filename: 'result.webp',
            width: 1024,
            height: 1024,
        })).toEqual({
            fileName: 'result.webp',
            thumbnailPath: 'result_thumb.jpg',
            width: 1024,
            height: 1024,
        });
    });
});
