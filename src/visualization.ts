"use strict";

/**
 * @module visualization
 *
 * Renders a "lava" entropy heatmap on an HTML canvas element, providing
 * real-time visual feedback showing where entropy originates in a webcam feed.
 *
 * The heatmap maps per-pixel delta magnitudes (0-255) — computed by frame
 * differencing in the entropy collector — to a lava-themed color gradient:
 *
 *   - Dark/black regions indicate static pixels (no entropy contribution).
 *   - Glowing red/orange regions indicate moderate motion (some entropy).
 *   - Bright yellow/white regions indicate high motion (maximum entropy).
 *
 * **Design decisions:**
 *
 * 1. A 256-entry `Uint32Array` lookup table (LUT) is pre-computed once so that
 *    per-pixel color mapping during rendering is a single array index operation
 *    rather than a multi-branch interpolation.
 *
 * 2. The `ImageData` backing buffer is cached at module scope and reused across
 *    frames to avoid GC pressure from per-frame allocation of large typed arrays.
 *
 * 3. A `Uint32Array` view is overlaid on the `ImageData.data` buffer so that
 *    each pixel's four RGBA bytes can be written in a single 32-bit store
 *    instruction, which is ~4× faster than four individual byte writes.
 *
 * 4. Color interpolation uses HSL space (converted to RGB for packing) to
 *    produce perceptually smooth gradients that look natural and "lava-like".
 *
 * Runs entirely client-side. No external imports. No network calls.
 */

// ---------------------------------------------------------------------------
// Module-level cache for ImageData reuse across frames
// ---------------------------------------------------------------------------

/** Cached ImageData instance, reused across calls to avoid per-frame allocation. */
let cachedImageData: ImageData | null = null;

/** Width of the cached ImageData (invalidated when dimensions change). */
let cachedWidth: number = 0;

/** Height of the cached ImageData (invalidated when dimensions change). */
let cachedHeight: number = 0;

// ---------------------------------------------------------------------------
// HSL → RGB conversion helpers
// ---------------------------------------------------------------------------

/**
 * Converts an HSL color to an RGBA-packed `Uint32` value (little-endian: ABGR).
 *
 * The Web platform stores `ImageData` pixels in RGBA byte order, but when
 * accessed through a `Uint32Array` view on a little-endian machine the byte
 * layout is ABGR. We pack accordingly.
 *
 * @param h - Hue in degrees [0, 360)
 * @param s - Saturation [0, 1]
 * @param l - Lightness [0, 1]
 * @param a - Alpha [0, 255], defaults to 255 (fully opaque)
 * @returns RGBA color packed into a 32-bit unsigned integer (little-endian ABGR)
 */
function hslToPackedRGBA(h: number, s: number, l: number, a: number = 255): number {
  // HSL → RGB algorithm (see CSS Color Module Level 4 §4.2.4)
  const c: number = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime: number = h / 60;
  const x: number = c * (1 - Math.abs((hPrime % 2) - 1));
  const m: number = l - c / 2;

  let r1: number = 0;
  let g1: number = 0;
  let b1: number = 0;

  if (hPrime >= 0 && hPrime < 1) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hPrime >= 1 && hPrime < 2) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hPrime >= 2 && hPrime < 3) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hPrime >= 3 && hPrime < 4) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hPrime >= 4 && hPrime < 5) {
    r1 = x; g1 = 0; b1 = c;
  } else if (hPrime >= 5 && hPrime < 6) {
    r1 = c; g1 = 0; b1 = x;
  }

  const r: number = Math.round((r1 + m) * 255);
  const g: number = Math.round((g1 + m) * 255);
  const b: number = Math.round((b1 + m) * 255);

  // Pack as little-endian ABGR for Uint32Array view over ImageData
  // Byte order in memory: R, G, B, A  (ImageData RGBA)
  // Uint32 little-endian:  byte0=R, byte1=G, byte2=B, byte3=A
  //   → numeric value = A<<24 | B<<16 | G<<8 | R
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Linearly interpolates between two values.
 *
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor [0, 1]
 * @returns Interpolated value
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// LUT construction
// ---------------------------------------------------------------------------

/**
 * Color band breakpoint definition for the lava gradient.
 *
 * Each breakpoint defines an HSL color at a specific delta magnitude.
 * The LUT is built by linearly interpolating H, S, and L between
 * consecutive breakpoints.
 */
interface ColorBreakpoint {
  /** Delta magnitude value [0, 255] at which this color applies. */
  readonly index: number;
  /** Hue in degrees [0, 360). */
  readonly h: number;
  /** Saturation [0, 1]. */
  readonly s: number;
  /** Lightness [0, 1]. */
  readonly l: number;
}

/**
 * Creates a 256-entry lookup table mapping delta magnitude (0–255) to a
 * packed RGBA color value using a lava-themed gradient.
 *
 * The gradient bands are:
 *
 * | Delta Range | Visual            | Description                        |
 * |-------------|-------------------|------------------------------------|
 * | 0–15        | Black → dark red  | Static pixels, no entropy          |
 * | 16–63       | Dark red → red    | Minor motion, some entropy         |
 * | 64–127      | Red → orange → yellow | Moderate entropy                |
 * | 128–191     | Yellow → bright yellow | Good entropy                   |
 * | 192–255     | Bright yellow → white  | Maximum entropy / peak chaos   |
 *
 * Interpolation is performed in HSL space for perceptually smooth color
 * transitions that produce a natural "lava lamp" appearance.
 *
 * @returns A 256-element `Uint32Array` where `lut[delta]` is the packed RGBA
 *          color for that delta magnitude, suitable for direct write into a
 *          `Uint32Array` view over an `ImageData` buffer.
 */
export function createHeatmapLUT(): Uint32Array {
  const lut: Uint32Array = new Uint32Array(256);

  // Define the lava gradient breakpoints in HSL space.
  //
  // Hue rationale:
  //   - Red = 0°, Orange ≈ 30°, Yellow ≈ 60°
  //   - We stay in the warm 0°–60° hue range for the "lava" look.
  //   - White is achieved by pushing lightness to 1.0 at any hue.
  //
  // The breakpoints are chosen so that:
  //   - Very low deltas map to near-black (low lightness, low saturation)
  //   - Mid deltas sweep through the red-orange-yellow spectrum
  //   - High deltas push toward white (high lightness, decreasing saturation)
  const breakpoints: readonly ColorBreakpoint[] = [
    { index: 0,   h: 0,  s: 0.8, l: 0.00 },  // Black (no light)
    { index: 15,  h: 0,  s: 0.9, l: 0.12 },  // Very dark red
    { index: 63,  h: 0,  s: 1.0, l: 0.40 },  // Bright red
    { index: 95,  h: 20, s: 1.0, l: 0.50 },  // Orange (red→yellow transition)
    { index: 127, h: 45, s: 1.0, l: 0.50 },  // Orange-yellow
    { index: 159, h: 55, s: 1.0, l: 0.55 },  // Yellow
    { index: 191, h: 60, s: 1.0, l: 0.65 },  // Bright yellow
    { index: 223, h: 60, s: 0.8, l: 0.80 },  // Pale yellow (toward white)
    { index: 255, h: 60, s: 0.2, l: 1.00 },  // White
  ] as const;

  // Fill the LUT by interpolating between consecutive breakpoints
  for (let seg = 0; seg < breakpoints.length - 1; seg++) {
    const bp0: ColorBreakpoint = breakpoints[seg];
    const bp1: ColorBreakpoint = breakpoints[seg + 1];
    const span: number = bp1.index - bp0.index;

    for (let i: number = bp0.index; i <= bp1.index; i++) {
      const t: number = span === 0 ? 0 : (i - bp0.index) / span;
      const h: number = lerp(bp0.h, bp1.h, t);
      const s: number = lerp(bp0.s, bp1.s, t);
      const l: number = lerp(bp0.l, bp1.l, t);

      lut[i] = hslToPackedRGBA(h, s, l, 255);
    }
  }

  return lut;
}

// ---------------------------------------------------------------------------
// Heatmap renderer
// ---------------------------------------------------------------------------

/**
 * Module-level cached LUT instance. Lazily initialized on first render call.
 * Since the LUT is deterministic and immutable, we only need to compute it once.
 */
let cachedLUT: Uint32Array | null = null;

/**
 * Renders a lava-themed entropy heatmap onto the provided canvas element.
 *
 * Each pixel in the `deltaMap` is treated as a magnitude value (0–255)
 * representing the absolute difference between consecutive webcam frames
 * at that pixel position. Higher values indicate more motion and therefore
 * more entropy contribution.
 *
 * The function maps each delta value through a pre-computed color lookup
 * table to produce a visually rich "lava lamp" heat visualization:
 *
 *   - **Dark/black** areas are static (no entropy).
 *   - **Red/orange** areas show moderate motion.
 *   - **Yellow/white** areas show peak entropy activity.
 *
 * ### Performance characteristics
 *
 * - The color LUT is computed once and cached at module scope.
 * - The `ImageData` object is cached and reused across frames (re-created
 *   only when the canvas dimensions change).
 * - Pixel data is written through a `Uint32Array` view for 4× fewer store
 *   operations compared to byte-level writes.
 * - Total per-frame cost is a single pass over the deltaMap (O(width×height))
 *   with one array lookup and one 32-bit write per pixel.
 *
 * @param canvas   - The target `<canvas>` element to render onto.
 * @param deltaMap - A `Uint8Array` of length `width × height` containing
 *                   per-pixel delta magnitudes from frame differencing.
 *                   Values are clamped to [0, 255] by the Uint8 type.
 * @param width    - The width of the video frame (and desired canvas width)
 *                   in pixels.
 * @param height   - The height of the video frame (and desired canvas height)
 *                   in pixels.
 *
 * @throws {Error} If the canvas 2D rendering context cannot be obtained.
 * @throws {Error} If the deltaMap length does not match `width × height`.
 *
 * @example
 * ```ts
 * const canvas = document.getElementById('heatmap') as HTMLCanvasElement;
 * const deltaMap = computeFrameDelta(prevFrame, currFrame); // Uint8Array
 * renderLavaHeatmap(canvas, deltaMap, 640, 480);
 * ```
 */
export function renderLavaHeatmap(
  canvas: HTMLCanvasElement,
  deltaMap: Uint8Array,
  width: number,
  height: number
): void {
  // --- Input validation ---
  const expectedLength: number = width * height;
  if (deltaMap.length !== expectedLength) {
    throw new Error(
      `deltaMap length mismatch: expected ${expectedLength} (${width}×${height}), ` +
      `got ${deltaMap.length}`
    );
  }

  // --- Set canvas dimensions to match video ---
  // Only update if changed, to avoid clearing the canvas unnecessarily.
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }

  // --- Obtain 2D rendering context ---
  const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Failed to obtain 2D rendering context from canvas element.");
  }

  // --- Lazily initialize or re-create cached ImageData ---
  // We cache the ImageData to avoid allocating a new backing ArrayBuffer
  // every frame. If the dimensions change, we must re-create it.
  if (
    cachedImageData === null ||
    cachedWidth !== width ||
    cachedHeight !== height
  ) {
    cachedImageData = ctx.createImageData(width, height);
    cachedWidth = width;
    cachedHeight = height;
  }

  // --- Lazily initialize the color LUT ---
  if (cachedLUT === null) {
    cachedLUT = createHeatmapLUT();
  }
  const lut: Uint32Array = cachedLUT;

  // --- Map delta values to colors via the LUT ---
  // Create a Uint32Array view over the ImageData's underlying ArrayBuffer.
  // This allows us to write all four RGBA bytes per pixel in a single
  // 32-bit store operation.
  const pixelData: Uint32Array = new Uint32Array(cachedImageData.data.buffer);
  const totalPixels: number = expectedLength;

  for (let i: number = 0; i < totalPixels; i++) {
    // deltaMap[i] is already clamped to 0-255 by the Uint8Array type,
    // so it directly indexes into our 256-entry LUT.
    pixelData[i] = lut[deltaMap[i]];
  }

  // --- Blit the ImageData onto the canvas ---
  ctx.putImageData(cachedImageData, 0, 0);
}
