import { describe, expect, it } from "vitest";
import { normalizePixelAlpha, restoreOpaqueCanvasAlpha } from "./image-processing";

describe("restoreOpaqueCanvasAlpha", () => {
    it("restores an opaque alpha channel when Photoshop returns visible RGB with zero alpha", () => {
        const pixels = new Uint8Array([
            240, 80, 40, 0,
            20, 30, 40, 0
        ]);

        restoreOpaqueCanvasAlpha({ dataFromAPI: pixels, width: 2, height: 1 });

        expect(Array.from(pixels)).toEqual([
            240, 80, 40, 255,
            20, 30, 40, 255
        ]);
    });

    it("preserves a real alpha channel", () => {
        const pixels = new Uint8Array([
            240, 80, 40, 0,
            20, 30, 40, 128
        ]);

        restoreOpaqueCanvasAlpha({ dataFromAPI: pixels, width: 2, height: 1 });

        expect(Array.from(pixels)).toEqual([
            240, 80, 40, 0,
            20, 30, 40, 128
        ]);
    });

    it("preserves an empty transparent canvas", () => {
        const pixels = new Uint8Array(8);

        restoreOpaqueCanvasAlpha({ dataFromAPI: pixels, width: 2, height: 1 });

        expect(Array.from(pixels)).toEqual(Array(8).fill(0));
    });
});

describe("normalizePixelAlpha", () => {
    it("adds an opaque alpha channel to Photoshop RGB pixels", () => {
        const result = normalizePixelAlpha({
            dataFromAPI: new Uint8Array([240, 80, 40, 20, 30, 40]),
            width: 2,
            height: 1
        });

        expect(Array.from(result.dataFromAPI)).toEqual([
            240, 80, 40, 255,
            20, 30, 40, 255
        ]);
    });
});
