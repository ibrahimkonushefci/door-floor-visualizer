import type { PixelBuffer } from './render/sampling';
// Prepare completely before touching the displayed canvas. The synchronous final
// draw cannot expose a cleared or partially painted canvas between browser paints.
export function presentFrame(
  canvas: HTMLCanvasElement,
  pixels: PixelBuffer,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
) {
  if (
    pixels.width < 1 ||
    pixels.height < 1 ||
    pixels.data.length !== pixels.width * pixels.height * 4
  )
    throw new Error('Invalid render frame');
  const back = createCanvas();
  back.width = pixels.width;
  back.height = pixels.height;
  const backContext = back.getContext('2d', { colorSpace: 'srgb' }),
    frontContext = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!backContext || !frontContext) throw new Error('Canvas unavailable');
  backContext.putImageData(
    new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height),
    0,
    0,
  );
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  frontContext.drawImage(back, 0, 0);
  back.width = 0;
  back.height = 0;
}
// Photo scenes are authored at 1600×1200 and Blender-rendered scenes at
// 2400×1800; rendering beyond a scene's own width only upsamples.
export const MAX_FRAME_WIDTH = 1600;
export const MAX_RENDERED_FRAME_WIDTH = 2400;
export function finalFrameWidth(cssWidth: number, dpr: number, maxWidth = MAX_FRAME_WIDTH) {
  return Math.max(4, Math.floor(Math.min(maxWidth, cssWidth * Math.min(dpr, 2)) / 4) * 4);
}
/** Frames at most half the scene width use the lighter half-resolution decode. */
export function sceneScaleFor(frameWidth: number, sceneWidth: number): 1 | 0.5 {
  return frameWidth <= sceneWidth / 2 ? 0.5 : 1;
}
// A half-width preview is shown first only when this scene's full frames are
// slow enough for the wait to be noticeable.
export const PREVIEW_AFTER_MS = 160;
