// Own-room photo intake: decode on the device (JPEG, PNG, WebP; HEIC where the
// browser can decode it, as Safari does), apply the EXIF orientation, and resize
// to at most 2048 px on the long edge (Egger's working size).
import type { PixelBuffer } from '../render/sampling';

export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_MIN_EDGE = 480;

export interface ExifInfo {
  orientation?: number;
  /** 35 mm-equivalent focal length (tag 0xA405). */
  focal35?: number;
}
export interface LoadedPhoto {
  pixels: PixelBuffer;
  /** Focal length in pixels at the loaded size when the photo says so (else null). */
  focalPx: number | null;
  name: string;
}
export class PhotoError extends Error {
  constructor(readonly code: 'heic-unsupported' | 'unreadable' | 'too-small') {
    super(code);
    this.name = 'PhotoError';
  }
}

/** Minimal EXIF reader (JPEG APP1): orientation and the 35 mm-equivalent focal length. */
export function readExif(bytes: Uint8Array): ExifInfo {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return {};
    const marker = bytes[p + 1],
      length = view.getUint16(p + 2);
    if (marker === 0xda || marker === 0xd9) return {};
    if (marker === 0xe1 && view.getUint32(p + 4) === 0x45786966) return parseTiff(view, p + 10, p + 2 + length);
    p += 2 + length;
  }
  return {};
}
function parseTiff(view: DataView, start: number, end: number): ExifInfo {
  if (start + 8 > end) return {};
  const little = view.getUint16(start) === 0x4949,
    u16 = (o: number) => view.getUint16(start + o, little),
    u32 = (o: number) => view.getUint32(start + o, little),
    out: ExifInfo = {};
  const ifd = (offset: number, visit: (tag: number, at: number) => void) => {
    if (offset < 8 || start + offset + 2 > end) return;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      if (start + at + 12 > end) return;
      visit(u16(at), at);
    }
  };
  let exif = 0;
  ifd(u32(4), (tag, at) => {
    if (tag === 0x0112) out.orientation = u16(at + 8);
    if (tag === 0x8769) exif = u32(at + 8);
  });
  ifd(exif, (tag, at) => {
    if (tag === 0xa405) out.focal35 = u16(at + 8) || undefined;
  });
  return out;
}

/** Focal length in pixels from a 35 mm-equivalent focal length (defined on the 43.27 mm diagonal). */
export function focalPxFrom35mm(focal35: number, width: number, height: number) {
  return (focal35 * Math.hypot(width, height)) / 43.27;
}

/** Output size with the long edge at most `max` (never enlarged). */
export function fitSize(width: number, height: number, max = PHOTO_MAX_EDGE) {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

const isHeic = (file: Blob & { name?: string }) =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? '');

async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    // Modern browsers apply the EXIF orientation here ('from-image' is the default).
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Safari decodes HEIC through <img> where createImageBitmap may refuse it.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function loadPhoto(file: Blob & { name?: string }): Promise<LoadedPhoto> {
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()),
    exif = readExif(head);
  let source: Awaited<ReturnType<typeof decode>>;
  try {
    source = await decode(file);
  } catch {
    throw new PhotoError(isHeic(file) ? 'heic-unsupported' : 'unreadable');
  }
  if (Math.min(source.width, source.height) < PHOTO_MIN_EDGE) throw new PhotoError('too-small');
  const { width, height } = fitSize(source.width, source.height),
    canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new PhotoError('unreadable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source && typeof source.close === 'function') source.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  canvas.width = canvas.height = 0;
  return {
    pixels: { width, height, data },
    focalPx: exif.focal35 ? focalPxFrom35mm(exif.focal35, width, height) : null,
    name: file.name ?? 'photo',
  };
}
