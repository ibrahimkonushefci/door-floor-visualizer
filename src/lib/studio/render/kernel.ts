import type { SurfaceAppearance } from '../../data/types';
import type { PreparedMaterials, PreparedScene, PreparedSurface, RenderJob } from '../types';
import type { PixelBuffer } from './sampling';
import { sampleTrilinearInto } from './sampling';
import { decode, encodeByte, hexLinear, clamp } from './color';
import { shadeAt } from './lighting';
function channel(data: Uint8Array, w: number, h: number, x: number, y: number, linear = false) {
  const cx = Math.max(0, Math.min(w - 1, x)),
    cy = Math.max(0, Math.min(h - 1, y)),
    ix = Math.floor(cx),
    iy = Math.floor(cy),
    fx = cx - ix,
    fy = cy - iy;
  let a = data[iy * w + ix],
    b = data[iy * w + Math.min(ix + 1, w - 1)],
    c = data[Math.min(iy + 1, h - 1) * w + ix],
    d = data[Math.min(iy + 1, h - 1) * w + Math.min(ix + 1, w - 1)];
  if (linear) {
    a = decode[a];
    b = decode[b];
    c = decode[c];
    d = decode[d];
  }
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function maskByte(data: Uint8Array, w: number, h: number, x: number, y: number) {
  return x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x];
}
function cropped(s: PreparedSurface, data: Uint8Array, x: number, y: number, linear = false) {
  const [bx, by, w, h] = s.bounds,
    px = x - bx,
    py = y - by;
  if (linear) return channel(data, w, h, px, py, true);
  // Masks outside their cropped bounds are zero, not the clamped edge byte.
  // This preserves partitioned coverage when sampling fractional shared edges.
  if (px <= -1 || py <= -1 || px >= w || py >= h) return 0;
  const ix = Math.floor(px),
    iy = Math.floor(py),
    fx = px - ix,
    fy = py - iy;
  return (
    (maskByte(data, w, h, ix, iy) * (1 - fx) + maskByte(data, w, h, ix + 1, iy) * fx) * (1 - fy) +
    (maskByte(data, w, h, ix, iy + 1) * (1 - fx) + maskByte(data, w, h, ix + 1, iy + 1) * fx) * fy
  );
}
export function prepareRender(job: RenderJob, scene: PreparedScene, materials: PreparedMaterials) {
  const selection = job.selection,
    finish = materials.data.doorFinishes.find(f => f.id === selection.doorFinishId)!,
    product = materials.products.find(p => p.id === selection.floorProductId);
  if (!finish || product?.kind !== 'floor') throw new Error('Render: unresolved material');
  const floor = materials.data.floorCollections.find(f => f.id === product.collectionId)!;
  const black: SurfaceAppearance = { kind: 'solid', colorSrgb: '#202321' };
  const trim = (mode: string) =>
    mode === 'black'
      ? { appearance: black, specularStrength: 0.02 }
      : mode === 'floor'
        ? floor.trim
        : finish.trim;
  const prepared = scene.surfaces.map(s => {
    const role = s.definition.role,
      selected =
        role === 'floor'
          ? {
              appearance: {
                kind: 'texture',
                texture: floor.atlas.image,
                physicalSizeMm: floor.atlas.repeatSizeMm,
                grainAxis: 'u',
                fit: 'repeat',
                fallbackColorSrgb: floor.swatchColorSrgb,
              } as SurfaceAppearance,
              specularStrength: floor.specularStrength,
            }
          : role === 'door-leaf'
            ? finish.kind === 'opaque'
              ? finish
              : null
            : trim(role === 'frame' ? selection.frameMode : selection.skirtingMode);
    const a = selected?.appearance;
    // 'stretch-leaf' spans one texture repeat across the whole leaf, like a single
    // veneer sheet, instead of tiling a visible seam partway up the door.
    let stretch: { u0: number; v0: number; uSpan: number; vSpan: number } | null = null;
    if (a?.kind === 'texture' && a.fit === 'stretch-leaf' && role === 'door-leaf') {
      const quad = s.definition.mapping.worldQuadMm,
        xs = quad.map(p => p[0]),
        ys = quad.map(p => p[1]),
        [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      stretch =
        s.definition.uvRotationDeg === 90
          ? { u0: y0, uSpan: y1 - y0, v0: -x1, vSpan: x1 - x0 }
          : { u0: x0, uSpan: x1 - x0, v0: y0, vSpan: y1 - y0 };
    }
    return {
      s,
      a,
      stretch,
      strength: selected?.specularStrength || 0,
      solid: a?.kind === 'solid' ? hexLinear(a.colorSrgb) : null,
      mips: a?.kind === 'texture' ? materials.textures.get(a.texture) : null,
    };
  });
  const glass = finish.kind === 'glass' ? scene.inserts.get(finish.variantKey) : null,
    gm = finish.kind === 'glass' ? scene.insertMasks.get(finish.variantKey) : null;
  // A real door's reveal reads as a dark shadow tinted by the leaf and frame finishes.
  const tone = (a: SurfaceAppearance | null | undefined) =>
    a ? hexLinear(a.kind === 'solid' ? a.colorSrgb : a.fallbackColorSrgb) : null;
  const leafTone = tone(prepared.find(p => p.s.definition.role === 'door-leaf')?.a),
    frameTone = tone(prepared.find(p => p.s.definition.role === 'frame')?.a) || leafTone;
  const reveal =
    scene.reveal && leafTone && frameTone
      ? {
          ...scene.reveal,
          color: leafTone.map((v, i) => Math.min(v, frameTone[i]) * 0.22) as unknown as number[],
        }
      : null;
  return { prepared, glass, gm, reveal, rgb: [0, 0, 0] };
}
export function renderRows(
  job: RenderJob,
  scene: PreparedScene,
  materials: PreparedMaterials,
  output: PixelBuffer,
  startRow: number,
  endRow: number,
  compiled = prepareRender(job, scene, materials),
) {
  const { prepared, glass, gm, reveal, rgb } = compiled;
  for (let py = startRow; py < endRow; py++)
    for (let px = 0; px < job.width; px++) {
      const x = (px + 0.5) / job.width,
        y = (py + 0.5) / job.height,
        sx = x * scene.base.width - 0.5,
        sy = y * scene.base.height - 0.5,
        bi =
          (Math.max(0, Math.min(scene.base.height - 1, Math.round(sy))) * scene.base.width +
            Math.max(0, Math.min(scene.base.width - 1, Math.round(sx)))) *
          4,
        oi = (py * job.width + px) * 4;
      const replacement = gm
          ? channel(gm.replacement, scene.base.width, scene.base.height, sx, sy) / 255
          : 0,
        protection =
          channel(
            gm && replacement > 0 ? gm.protected : scene.protectedMask,
            scene.base.width,
            scene.base.height,
            sx,
            sy,
          ) / 255;
      let r = 0,
        g = 0,
        b = 0,
        total = 0;
      if (protection < 1 && replacement < 1)
        for (const entry of prepared) {
          const { s, a, solid, mips, strength, stretch } = entry;
          if (!a) continue;
          const coverage =
            (cropped(s, s.mask, sx, sy) / 255) * (1 - protection) * (1 - replacement);
          if (coverage <= 0) continue;
          let ar = solid?.[0] || 0,
            ag = solid?.[1] || 0,
            ab = solid?.[2] || 0;
          if (a.kind === 'texture') {
            if (!mips) throw new Error(`Render: texture missing ${a.texture}`);
            const h = s.inverse,
              den = h[6] * x + h[7] * y + h[8],
              nx = h[0] * x + h[1] * y + h[2],
              ny = h[3] * x + h[4] * y + h[5],
              X = nx / den,
              Y = ny / den;
            const dxDen = den + h[6] / job.width,
              dyDen = den + h[7] / job.height;
            let U = X,
              V = Y,
              dUx = (nx + h[0] / job.width) / dxDen - X,
              dVx = (ny + h[3] / job.width) / dxDen - Y,
              dUy = (nx + h[1] / job.height) / dyDen - X,
              dVy = (ny + h[4] / job.height) / dyDen - Y;
            const angle =
              s.definition.role === 'floor'
                ? job.selection.floorRotationDeg
                : s.definition.uvRotationDeg;
            if (angle === 90) {
              U = Y;
              V = -X;
              const tx = dUx,
                ty = dUy;
              dUx = dVx;
              dVx = -tx;
              dUy = dVy;
              dVy = -ty;
            }
            const sizeU = stretch ? stretch.uSpan : a.physicalSizeMm[0],
              sizeV = stretch ? stretch.vSpan : a.physicalSizeMm[1],
              tw = mips[0].width / sizeU,
              th = mips[0].height / sizeV;
            const rho = Math.max(1, Math.hypot(dUx * tw, dVx * th), Math.hypot(dUy * tw, dVy * th));
            sampleTrilinearInto(
              mips,
              (U - (stretch?.u0 ?? 0)) / sizeU,
              (V - (stretch?.v0 ?? 0)) / sizeV,
              Math.log2(rho),
              rgb,
            );
            ar = rgb[0];
            ag = rgb[1];
            ab = rgb[2];
          }
          const shade = shadeAt(
            cropped(s, s.diffuse, sx, sy, true),
            s.definition.lighting.baselineLinear,
          );
          let sr = 0,
            sg = 0,
            sb = 0;
          if (s.specular) {
            const [bx, by, w, h] = s.bounds,
              ix = Math.max(0, Math.min(w - 1, Math.round(sx - bx))),
              iy = Math.max(0, Math.min(h - 1, Math.round(sy - by))),
              i = (iy * w + ix) * 4;
            sr = decode[s.specular.data[i]];
            sg = decode[s.specular.data[i + 1]];
            sb = decode[s.specular.data[i + 2]];
          }
          r += clamp(ar * shade + sr * strength) * coverage;
          g += clamp(ag * shade + sg * strength) * coverage;
          b += clamp(ab * shade + sb * strength) * coverage;
          total += coverage;
        }
      if (glass && replacement > 0) {
        const coverage = (replacement * (1 - protection) * glass.data[bi + 3]) / 255;
        r += decode[glass.data[bi]] * coverage;
        g += decode[glass.data[bi + 1]] * coverage;
        b += decode[glass.data[bi + 2]] * coverage;
        total += coverage;
      }
      if (total > 1 + 1 / 255) throw new Error('Composite: overlapping/invalid masks');
      if (reveal && total < 1) {
        const [rx, ry, rw, rh] = reveal.bounds,
          ix = Math.round(sx) - rx,
          iy = Math.round(sy) - ry,
          open =
            ix >= 0 && iy >= 0 && ix < rw && iy < rh
              ? (reveal.mask[iy * rw + ix] / 255) * (1 - protection)
              : 0;
        if (open > 0) {
          const amount = Math.min(open, 1 - total);
          r += reveal.color[0] * amount;
          g += reveal.color[1] * amount;
          b += reveal.color[2] * amount;
          total += amount;
        }
      }
      if (!total) {
        output.data[oi] = scene.base.data[bi];
        output.data[oi + 1] = scene.base.data[bi + 1];
        output.data[oi + 2] = scene.base.data[bi + 2];
      } else {
        const weight = 1 - Math.min(1, total),
          factor = total > 1 ? 1 / total : 1;
        output.data[oi] = encodeByte(decode[scene.base.data[bi]] * weight + r * factor);
        output.data[oi + 1] = encodeByte(decode[scene.base.data[bi + 1]] * weight + g * factor);
        output.data[oi + 2] = encodeByte(decode[scene.base.data[bi + 2]] * weight + b * factor);
      }
      output.data[oi + 3] = 255;
      if (scene.foreground) {
        const fg = scene.foreground,
          alpha = fg.data[bi + 3] / 255;
        if (alpha)
          for (let k = 0; k < 3; k++)
            output.data[oi + k] = encodeByte(
              decode[output.data[oi + k]] * (1 - alpha) + decode[fg.data[bi + k]] * alpha,
            );
      }
    }
}
