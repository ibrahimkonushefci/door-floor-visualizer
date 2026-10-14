import type { Locale, StudioSelection } from '../data/types';
import type { RenderController, StudioCatalog } from './types';
import { localize, type Messages } from '../i18n/messages';
import { sceneShowsFloor, sceneShowsSkirting } from './compatibility';
import { sceneForModel } from './door-models';
export const EXPORT_JPEG_QUALITY = 0.92;
export interface ExportBrand {
  name: string;
  logo: string | null;
  /** Shown in the label strip while the brand runs in demo mode. */
  notice: string | null;
}
export type ExportStage = 'render' | 'compose' | 'encode';
/** Height of the label strip under a frame `width` pixels wide. */
export const exportStripHeight = (width: number) => Math.round((178 * width) / 1200);
/** The label strip's text: what the image shows, in the visitor's language. */
export function exportLabel(
  catalog: StudioCatalog,
  selection: StudioSelection,
  locale: Locale,
  m: Messages,
) {
  const { scenes, doorFinishes, doorModels, floorCollections } = catalog.materials;
  const scene = scenes.find(s => s.id === selection.sceneId)!,
    door = catalog.products.find(p => p.id === selection.doorProductId)!,
    floor = catalog.products.find(p => p.id === selection.floorProductId)!,
    finish = doorFinishes.find(f => f.id === selection.doorFinishId)!,
    model = doorModels.find(d => d.id === selection.doorModelId);
  const decor =
    floor.kind === 'floor' ? floorCollections.find(c => c.id === floor.collectionId)?.decor : undefined;
  const frame =
    finish.kind === 'glass'
      ? m['studio.blackProfile']
      : sceneForModel(scene, selection.doorModelId).frameType === 'concealed-aluminium'
        ? m['studio.concealedFrame']
        : m[`studio.mode.${selection.frameMode}`];
  const rows: [string, string][] = [
    [
      m['studio.door'],
      [localize(door.name, locale), model && localize(model.name, locale), localize(finish.name, locale)]
        .filter(Boolean)
        .join(' · '),
    ],
    [
      m['studio.floor'],
      sceneShowsFloor(scene)
        ? `${localize(floor.name, locale)}${decor ? ` · ${decor.code}` : ''}`
        : m['studio.fixedFloor'],
    ],
    [m['inquiry.frame'], frame],
  ];
  if (sceneShowsSkirting(scene))
    rows.push([m['inquiry.skirting'], m[`studio.mode.${selection.skirtingMode}`]]);
  return { room: localize(scene.name, locale), rows, notice: m['studio.disclaimer'] };
}
export function exportFileName(brand: string, room: string, date = new Date()) {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `${slug(brand)}-${slug(room)}-${date.toISOString().slice(0, 10)}.jpg`;
}
const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
/**
 * Renders the selection at the prepared room's own resolution (2400×1800 full,
 * 1200×900 on the lighter phone variant) through the Studio's controller, adds a
 * branded label strip and encodes a JPEG. Call it while the stage is idle: the
 * controller runs one job at a time, so a stage render started meanwhile
 * supersedes the export (it rejects with an AbortError and can be retried).
 */
export async function exportStudioImage(
  catalog: StudioCatalog,
  selection: StudioSelection,
  locale: Locale,
  {
    controller,
    messages,
    brand,
    signal,
    onProgress,
  }: {
    controller: RenderController;
    messages: Messages;
    brand: ExportBrand;
    signal?: AbortSignal;
    onProgress?: (stage: ExportStage) => void;
  },
): Promise<Blob> {
  const definition = catalog.materials.scenes.find(s => s.id === selection.sceneId)!,
    prepared = controller.prepared(),
    scale = prepared?.sceneId === selection.sceneId ? prepared.scale : 1,
    width = Math.floor((definition.width * scale) / 4) * 4,
    height = (width * 3) / 4;
  const stop = () => controller.cancel();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', stop);
  const canvas = document.createElement('canvas');
  try {
    onProgress?.('render');
    const { pixels } = await controller.render({
      selection,
      width,
      height,
      quality: 'settled',
      rendererVersion: 2,
      sceneScale: scale,
    });
    signal?.throwIfAborted();
    onProgress?.('compose');
    const u = width / 1200,
      strip = exportStripHeight(width);
    canvas.width = width;
    canvas.height = height + strip;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.putImageData(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    await document.fonts?.ready;
    const css = getComputedStyle(document.documentElement),
      sans = css.getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif',
      serif = css.getPropertyValue('--font-serif').trim() || 'Georgia, serif';
    const label = exportLabel(catalog, selection, locale, messages);
    ctx.fillStyle = '#F7F5F0';
    ctx.fillRect(0, height, width, strip);
    ctx.fillStyle = '#D9D4CA';
    ctx.fillRect(0, height, width, Math.max(1, Math.round(u)));
    const top = height,
      pad = 36 * u;
    ctx.textBaseline = 'alphabetic';
    // Brand and room.
    const logo = brand.logo ? await loadImage(brand.logo) : null;
    let x = pad;
    if (logo) {
      ctx.drawImage(logo, x, top + 30 * u, 30 * u, 30 * u);
      x += 42 * u;
    }
    ctx.fillStyle = '#202421';
    ctx.font = `600 ${17 * u}px ${sans}`;
    ctx.fillText(fit(ctx, brand.name, 340 * u - x), x, top + 51 * u);
    ctx.font = `500 ${34 * u}px ${serif}`;
    ctx.fillText(fit(ctx, label.room, 340 * u), pad, top + 112 * u);
    // Selection: two columns of label/value pairs.
    const columns = [430 * u, 815 * u],
      cell = 350 * u;
    label.rows.forEach(([name, value], i) => {
      const cx = columns[i % 2],
        cy = top + (i < 2 ? 46 : 104) * u;
      ctx.fillStyle = '#6E6A62';
      ctx.font = `600 ${11 * u}px ${sans}`;
      ctx.fillText(name.toLocaleUpperCase(locale), cx, cy);
      ctx.fillStyle = '#202421';
      ctx.font = `500 ${17 * u}px ${sans}`;
      ctx.fillText(fit(ctx, value, cell), cx, cy + 25 * u);
    });
    // Illustrative notice (and the demo notice) along the foot.
    ctx.fillStyle = '#6E6A62';
    ctx.font = `400 ${12 * u}px ${sans}`;
    ctx.fillText(fit(ctx, label.notice, 720 * u), pad, top + 156 * u);
    if (brand.notice) {
      ctx.textAlign = 'right';
      ctx.fillText(fit(ctx, brand.notice, 380 * u), width - pad, top + 156 * u);
      ctx.textAlign = 'left';
    }
    onProgress?.('encode');
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('Image encoding failed'))),
        'image/jpeg',
        EXPORT_JPEG_QUALITY,
      ),
    );
    signal?.throwIfAborted();
    return blob;
  } finally {
    signal?.removeEventListener('abort', stop);
    canvas.width = 0;
    canvas.height = 0;
  }
}
