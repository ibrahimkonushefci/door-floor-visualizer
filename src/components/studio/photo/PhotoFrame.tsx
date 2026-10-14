'use client';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { PixelBuffer } from '@/lib/studio/render/sampling';

/** Draws a pixel buffer into a canvas of its own size (CSS scales it). */
export function drawPixels(canvas: HTMLCanvasElement, pixels: PixelBuffer) {
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas
    .getContext('2d')
    ?.putImageData(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height), 0, 0);
}

/** The photo at its own aspect ratio, as large as the stage allows, with overlays on top. */
export function PhotoFrame({
  photo,
  children,
  className = '',
  hidePhoto = false,
}: {
  photo: PixelBuffer;
  children?: ReactNode;
  className?: string;
  hidePhoto?: boolean;
}) {
  const base = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (base.current) drawPixels(base.current, photo);
  }, [photo]);
  return (
    <div className={`photo-frame ${className}`.trim()} style={{ '--photo-ar': `${photo.width} / ${photo.height}`, '--photo-ratio': photo.width / photo.height } as CSSProperties}>
      <canvas ref={base} className="photo-layer" hidden={hidePhoto} aria-hidden="true" />
      {children}
    </div>
  );
}

/** Pointer position in photo pixels. */
export function photoPoint(e: { clientX: number; clientY: number }, el: Element, photo: { width: number; height: number }) {
  const r = el.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * photo.width,
    y: ((e.clientY - r.top) / r.height) * photo.height,
    scale: photo.width / r.width,
  };
}
