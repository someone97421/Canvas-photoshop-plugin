import { app, core, imaging } from 'photoshop';
import { Jimp } from 'jimp';

export type PhotoshopImageSource = 'document' | 'layer';

export interface PhotoshopExportOptions {
    source: PhotoshopImageSource;
    maxLongEdge?: number;
    quality?: number;
    format: 'png' | 'jpeg';
    alphaBackground: string;
}

export function getActivePhotoshopDocumentId(): number {
    if (app.documents.length === 0) throw new Error('Photoshop 中没有打开的文档');
    return app.activeDocument.id;
}

function rgbaColor(value: string): number {
    return ((Number.parseInt(value.slice(1), 16) << 8) | 0xff) >>> 0;
}

function toRgba(data: Uint8Array, components: number): Uint8Array {
    if (components === 4) return data;
    const pixels = data.length / components;
    const rgba = new Uint8Array(pixels * 4);
    for (let index = 0; index < pixels; index++) {
        const source = index * components;
        const target = index * 4;
        if (components === 1 || components === 2) {
            rgba[target] = data[source];
            rgba[target + 1] = data[source];
            rgba[target + 2] = data[source];
            rgba[target + 3] = components === 2 ? data[source + 1] : 255;
        } else {
            rgba[target] = data[source];
            rgba[target + 1] = data[source + 1];
            rgba[target + 2] = data[source + 2];
            rgba[target + 3] = 255;
        }
    }
    return rgba;
}

export async function exportPhotoshopImage(options: PhotoshopExportOptions): Promise<Uint8Array> {
    if (app.documents.length === 0) throw new Error('Photoshop 中没有打开的文档');
    const document = app.activeDocument;
    const selectedLayer = options.source === 'layer' ? document.activeLayers[0] : undefined;
    if (options.source === 'layer' && !selectedLayer) throw new Error('请先选择一个 Photoshop 图层');

    const result = await imaging.getPixels({
        documentID: document.id,
        layerID: selectedLayer?.id,
        colorSpace: 'RGB',
        colorProfile: 'sRGB IEC61966-2.1',
        componentSize: 8,
        applyAlpha: false,
    });
    try {
        const raw = await result.imageData.getData({ chunky: true }) as Uint8Array;
        const rgba = toRgba(raw, result.imageData.components);
        let image = new Jimp({
            width: result.imageData.width,
            height: result.imageData.height,
            data: Buffer.from(rgba),
        });
        if (options.source === 'document' && (
            result.sourceBounds.left !== 0 ||
            result.sourceBounds.top !== 0 ||
            image.bitmap.width !== document.width ||
            image.bitmap.height !== document.height
        )) {
            const canvas = new Jimp({ width: document.width, height: document.height, color: 0x00000000 });
            canvas.composite(image, result.sourceBounds.left, result.sourceBounds.top);
            image = canvas;
        }
        const currentLongest = Math.max(image.bitmap.width, image.bitmap.height);
        if (options.maxLongEdge && currentLongest > options.maxLongEdge) {
            image.resize(image.bitmap.width >= image.bitmap.height
                ? { w: options.maxLongEdge }
                : { h: options.maxLongEdge });
        }
        const background = new Jimp({
            width: image.bitmap.width,
            height: image.bitmap.height,
            color: rgbaColor(options.alphaBackground),
        });
        background.composite(image, 0, 0);
        image = background;
        const encoded = options.format === 'jpeg'
            ? await image.getBuffer('image/jpeg', options.quality ? { quality: options.quality } : undefined)
            : await image.getBuffer('image/png');
        return new Uint8Array(encoded);
    } finally {
        await result.imageData.dispose();
    }
}

export async function importPhotoshopImage(bytes: Uint8Array, layerName: string, documentId: number): Promise<void> {
    const targetDocument = app.documents.find((document) => document.id === documentId);
    if (!targetDocument) throw new Error('提交任务时的 Photoshop 文档已关闭，结果仍保存在画布中');
    const decoded = await Jimp.read(Buffer.from(bytes));
    const rgba = new Uint8Array(decoded.bitmap.data);
    const imageData = await imaging.createImageDataFromBuffer(rgba, {
        width: decoded.bitmap.width,
        height: decoded.bitmap.height,
        components: 4,
        chunky: true,
        colorSpace: 'RGB',
        colorProfile: 'sRGB IEC61966-2.1',
    });
    try {
        await core.executeAsModal(async () => {
            app.activeDocument = targetDocument;
            const layer = await targetDocument.createPixelLayer({ name: layerName });
            if (!layer) throw new Error('Photoshop 无法创建结果图层');
            await imaging.putPixels({
                documentID: targetDocument.id,
                layerID: layer.id,
                imageData,
                replace: true,
                targetBounds: { left: 0, top: 0, width: decoded.bitmap.width, height: decoded.bitmap.height },
                commandName: '导入 Canvas 生成结果',
            });
        }, { commandName: '导入 Canvas 生成结果' });
    } finally {
        await imageData.dispose();
    }
}
