// Stage zoom: the frame is drawn with `translate(x, y) scale(scale)` (origin top
// left), x and y as fractions of the stage box. A scene point p (0–1) appears at
// stage point x + scale × p, so the frame always covers the whole stage.
export interface StageZoom {
  scale: number;
  x: number;
  y: number;
}
export const NO_ZOOM: StageZoom = { scale: 1, x: 0, y: 0 };
/** Full-resolution rooms zoom to 3×, the lighter phone variant to 2×. */
export const maxZoomFor = (sceneScale: 1 | 0.5) => (sceneScale === 1 ? 3 : 2);
export const isZoomed = (z: StageZoom) => z.scale > 1.01;
export function clampZoom(z: StageZoom, max: number): StageZoom {
  const scale = Math.min(max, Math.max(1, z.scale));
  if (scale <= 1.01) return NO_ZOOM;
  const fit = (v: number) => Math.min(0, Math.max(1 - scale, v));
  return { scale, x: fit(z.x), y: fit(z.y) };
}
/** Zooms to `scale` keeping the stage point (fx, fy) over the same scene point. */
export function zoomAt(z: StageZoom, scale: number, fx: number, fy: number, max: number) {
  const next = Math.min(max, Math.max(1, scale)),
    k = next / z.scale;
  return clampZoom({ scale: next, x: fx - (fx - z.x) * k, y: fy - (fy - z.y) * k }, max);
}
export const panBy = (z: StageZoom, dx: number, dy: number, max: number) =>
  clampZoom({ ...z, x: z.x + dx, y: z.y + dy }, max);
/** The scene point (0–1) under a stage point. */
export const sceneAt = (z: StageZoom, fx: number, fy: number): [number, number] => [
  (fx - z.x) / z.scale,
  (fy - z.y) / z.scale,
];
export const zoomTransform = (z: StageZoom) =>
  isZoomed(z) ? `translate(${z.x * 100}%, ${z.y * 100}%) scale(${z.scale})` : undefined;
