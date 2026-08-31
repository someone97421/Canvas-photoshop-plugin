export type CanvasSubmitFormat = 'png' | 'jpeg';

export interface CanvasSettings {
    backendUrl: string;
    projectId: string;
    maxLongEdge: string;
    compressionQuality: string;
    submitFormat: CanvasSubmitFormat;
    alphaBackground: string;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
    backendUrl: 'http://127.0.0.1:48051',
    projectId: '',
    maxLongEdge: '',
    compressionQuality: '',
    submitFormat: 'png',
    alphaBackground: '#FFFFFF',
};

const STORAGE_KEY = 'canvasPhotoshopPlugin.canvasSettings.v1';

export function loadCanvasSettings(): CanvasSettings {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<CanvasSettings>;
        return {
            ...DEFAULT_CANVAS_SETTINGS,
            ...stored,
            submitFormat: stored.submitFormat === 'jpeg' ? 'jpeg' : 'png',
        };
    } catch {
        return { ...DEFAULT_CANVAS_SETTINGS };
    }
}

export function saveCanvasSettings(settings: CanvasSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearCanvasSettings(): CanvasSettings {
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_CANVAS_SETTINGS };
}
