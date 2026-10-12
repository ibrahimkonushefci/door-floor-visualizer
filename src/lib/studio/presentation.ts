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
// Scenes are authored at 1600×1200; rendering beyond that only upsamples.
export const MAX_FRAME_WIDTH = 1600;
export const PREVIEW_FRAME_WIDTH = 720;
export function finalFrameWidth(cssWidth: number, dpr: number) {
  return Math.max(4, Math.floor(Math.min(MAX_FRAME_WIDTH, cssWidth * Math.min(dpr, 2)) / 4) * 4);
}
// A quick first pass for immediate feedback; only worthwhile when the final frame is much larger.
export function previewFrameWidth(finalWidth: number) {
  return finalWidth > PREVIEW_FRAME_WIDTH * 1.4 ? PREVIEW_FRAME_WIDTH : null;
}
