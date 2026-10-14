// Floor segmentation for own-room photos. Every provider sits behind one
// interface (`segmentFloor(image) → mask`); the result is only a first guess
// that the visitor corrects with the brush and the perspective grid.
import type { PixelBuffer } from '../render/sampling';
import { decode } from '../render/color';

/** Floor coverage 0–255 at the photo's resolution. */
export interface FloorMask {
  width: number;
  height: number;
  data: Uint8Array;
}
export interface FloorSegmenter {
  /** 'on-device' runs in this browser; a server provider must disclose the upload first. */
  readonly id: 'on-device' | 'server';
  segment(image: PixelBuffer, signal?: AbortSignal): Promise<FloorMask>;
}

/** SegFormer-B0 fine-tuned on ADE20K (150 classes, 512×512 input, logits at ¼ size). */
export const SEGFORMER = {
  size: 512,
  classes: 150,
  /** ADE20K "floor, flooring"; rugs (28) are a separate class and stay as they are. */
  floorClass: 3,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
} as const;

/** NCHW float input: area-averaged resize to size×size (as the model was trained), ImageNet normalisation. */
export function segformerInput(image: PixelBuffer, size: number = SEGFORMER.size) {
  const { width: W, height: H, data } = image,
    out = new Float32Array(3 * size * size),
    plane = size * size;
  for (let y = 0; y < size; y++) {
    const y0 = (y * H) / size,
      y1 = ((y + 1) * H) / size;
    for (let x = 0; x < size; x++) {
      const x0 = (x * W) / size,
        x1 = ((x + 1) * W) / size;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      // Box average over the source footprint (at least the nearest pixel when upsampling).
      for (let sy = Math.floor(y0); sy < Math.max(Math.ceil(y1), Math.floor(y0) + 1); sy++)
        for (let sx = Math.floor(x0); sx < Math.max(Math.ceil(x1), Math.floor(x0) + 1); sx++) {
          const i = (Math.min(sy, H - 1) * W + Math.min(sx, W - 1)) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          n++;
        }
      const o = y * size + x;
      out[o] = (r / n / 255 - SEGFORMER.mean[0]) / SEGFORMER.std[0];
      out[plane + o] = (g / n / 255 - SEGFORMER.mean[1]) / SEGFORMER.std[1];
      out[2 * plane + o] = (b / n / 255 - SEGFORMER.mean[2]) / SEGFORMER.std[2];
    }
  }
  return out;
}

/** Softmax probability of one class from [classes, h, w] logits. */
export function classProbability(logits: Float32Array, classes: number, w: number, h: number, target: number) {
  const n = w * h;
  if (logits.length !== classes * n) throw new Error('Segmentation: unexpected logits size');
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let max = -Infinity;
    for (let c = 0; c < classes; c++) max = Math.max(max, logits[c * n + i]);
    let sum = 0;
    for (let c = 0; c < classes; c++) sum += Math.exp(logits[c * n + i] - max);
    out[i] = Math.exp(logits[target * n + i] - max) / sum;
  }
  return out;
}

/** Bilinear upsample of a low-resolution probability to coverage bytes, with a soft ramp at p = 0.5. */
export function maskFromProbability(prob: Float32Array, pw: number, ph: number, width: number, height: number) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(ph - 1, ((y + 0.5) * ph) / height - 0.5)),
      iy = Math.min(Math.floor(fy), ph - 2),
      ty = fy - iy;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(pw - 1, ((x + 0.5) * pw) / width - 0.5)),
        ix = Math.min(Math.floor(fx), pw - 2),
        tx = fx - ix,
        i = iy * pw + ix,
        p =
          (prob[i] * (1 - tx) + prob[i + 1] * tx) * (1 - ty) +
          (prob[i + pw] * (1 - tx) + prob[i + pw + 1] * tx) * ty;
      out[y * width + x] = Math.round(Math.max(0, Math.min(1, (p - 0.35) / 0.3)) * 255);
    }
  }
  return out;
}

/** Linear luminance of every pixel (the guide for edge snapping). */
export function luminanceOf(image: PixelBuffer) {
  const n = image.width * image.height,
    out = new Float32Array(n),
    d = image.data;
  for (let i = 0; i < n; i++)
    out[i] = 0.2126 * decode[d[i * 4]] + 0.7152 * decode[d[i * 4 + 1]] + 0.0722 * decode[d[i * 4 + 2]];
  return out;
}

/** Separable box mean with clamped edges (radius r), in place into `out`. */
function boxMean(src: Float32Array, w: number, h: number, r: number, out: Float32Array, tmp: Float32Array) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.max(0, Math.min(w - 1, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

/**
 * Edge snapping: a fast guided filter (He & Sun) with the photo's luminance as
 * guide. The coefficients are solved at 1/`step` resolution and applied at full
 * resolution, so a soft or blocky mask boundary moves onto the photo's edges
 * without full-resolution float buffers.
 */
export function snapToEdges(mask: FloorMask, image: PixelBuffer, radius = 24, eps = 0.0004, step = 4) {
  const { width: W, height: H } = mask,
    guide = luminanceOf(image),
    w = Math.ceil(W / step),
    h = Math.ceil(H / step),
    n = w * h,
    I = new Float32Array(n),
    p = new Float32Array(n);
  // Downsample guide (sRGB-ish perceptual scale works better for edges) and mask.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let gi = 0,
        pi = 0,
        c = 0;
      for (let sy = y * step; sy < Math.min(H, (y + 1) * step); sy++)
        for (let sx = x * step; sx < Math.min(W, (x + 1) * step); sx++) {
          gi += Math.sqrt(guide[sy * W + sx]);
          pi += mask.data[sy * W + sx] / 255;
          c++;
        }
      I[y * w + x] = gi / c;
      p[y * w + x] = pi / c;
    }
  const r = Math.max(1, Math.round(radius / step)),
    tmp = new Float32Array(n),
    mI = new Float32Array(n),
    mp = new Float32Array(n),
    mIp = new Float32Array(n),
    mII = new Float32Array(n),
    prod = new Float32Array(n);
  boxMean(I, w, h, r, mI, tmp);
  boxMean(p, w, h, r, mp, tmp);
  for (let i = 0; i < n; i++) prod[i] = I[i] * p[i];
  boxMean(prod, w, h, r, mIp, tmp);
  for (let i = 0; i < n; i++) prod[i] = I[i] * I[i];
  boxMean(prod, w, h, r, mII, tmp);
  // a and b per window, then averaged (reuse buffers).
  const a = prod,
    b = I;
  for (let i = 0; i < n; i++) {
    const va = mII[i] - mI[i] * mI[i];
    a[i] = (mIp[i] - mI[i] * mp[i]) / (va + eps);
    b[i] = mp[i] - a[i] * mI[i];
  }
  boxMean(a, w, h, r, mIp, tmp);
  boxMean(b, w, h, r, mII, tmp);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(h - 1, (y + 0.5) / step - 0.5)),
      iy = Math.min(Math.floor(fy), Math.max(0, h - 2)),
      ty = h > 1 ? fy - iy : 0;
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(w - 1, (x + 0.5) / step - 0.5)),
        ix = Math.min(Math.floor(fx), Math.max(0, w - 2)),
        tx = w > 1 ? fx - ix : 0,
        i = iy * w + ix,
        j = Math.min(i + 1, n - 1),
        k = Math.min(i + w, n - 1),
        l = Math.min(i + w + 1, n - 1),
        A = (mIp[i] * (1 - tx) + mIp[j] * tx) * (1 - ty) + (mIp[k] * (1 - tx) + mIp[l] * tx) * ty,
        B = (mII[i] * (1 - tx) + mII[j] * tx) * (1 - ty) + (mII[k] * (1 - tx) + mII[l] * tx) * ty,
        q = A * Math.sqrt(guide[y * W + x]) + B;
      // Sharpen the filtered coverage back into a crisp, still antialiased edge.
      out[y * W + x] = Math.round(Math.max(0, Math.min(1, (q - 0.5) * 2.5 + 0.5)) * 255);
    }
  }
  return { width: W, height: H, data: out };
}

/** Logits → floor mask at the photo's size, snapped to the photo's edges. */
export function floorMaskFromLogits(logits: Float32Array, image: PixelBuffer, quarter = SEGFORMER.size / 4) {
  const prob = classProbability(logits, SEGFORMER.classes, quarter, quarter, SEGFORMER.floorClass),
    coarse = maskFromProbability(prob, quarter, quarter, image.width, image.height);
  return snapToEdges({ width: image.width, height: image.height, data: coarse }, image);
}

/** Intersection over union of two masks thresholded at 50 % (benchmark metric). */
export function maskIoU(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) throw new Error('IoU: size mismatch');
  let inter = 0,
    union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] >= 128,
      y = b[i] >= 128;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union ? inter / union : 1;
}
