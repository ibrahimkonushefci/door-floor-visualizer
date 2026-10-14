'use client';
import { useEffect, useState } from 'react';
import type { Locale, Product, StudioSelection } from '@/lib/data/types';
import type { StudioCatalog } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { buildSpecRows } from '@/lib/catalog/selectors';
import { sceneShowsFloor } from '@/lib/studio/compatibility';
import type { ExportStage } from '@/lib/studio/export-image';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
function CloseButton({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button type="button" className="dialog-close icon-btn icon-btn-plain" onClick={onClose} aria-label={label}>
      <Icon name="close" />
    </button>
  );
}
/** Article details of the door and floor on screen, with links to their catalog pages. */
export function ProductDetailsDialog({
  open,
  onClose,
  catalog,
  selection,
  locale,
  messages: m,
}: {
  open: boolean;
  onClose: () => void;
  catalog: StudioCatalog;
  selection: StudioSelection;
  locale: Locale;
  messages: Messages;
}) {
  const { scenes, doorFinishes, doorModels, floorCollections } = catalog.materials;
  const scene = scenes.find(s => s.id === selection.sceneId)!,
    door = catalog.products.find(p => p.id === selection.doorProductId)!,
    floor = catalog.products.find(p => p.id === selection.floorProductId)!,
    finish = doorFinishes.find(f => f.id === selection.doorFinishId)!,
    model = doorModels.find(d => d.id === selection.doorModelId),
    collection = floor.kind === 'floor' ? floorCollections.find(c => c.id === floor.collectionId) : undefined;
  const card = (product: Product, eyebrow: string, choice: string, swatch: React.CSSProperties) => (
    <article className="studio-product">
      <span className="studio-product-swatch" style={swatch} aria-hidden="true" />
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h3>{localize(product.name, locale)}</h3>
        {choice && <p className="studio-product-choice">{choice}</p>}
      </div>
      <table className="product-specs">
        <tbody>
          {buildSpecRows(product, catalog.materials, locale).map(row => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a className="btn btn-secondary" href={`/${locale}/products/${product.slug}/`}>
        {m['studio.viewProduct']}
        <Icon name="arrow-right" size={18} />
      </a>
    </article>
  );
  return (
    <Dialog open={open} title={m['studio.details']} onClose={onClose}>
      <CloseButton label={m['common.close']} onClose={onClose} />
      <div className="studio-products">
        {card(
          door,
          m['studio.door'],
          [model && localize(model.name, locale), localize(finish.name, locale)].filter(Boolean).join(' · '),
          finish.kind === 'opaque' && finish.appearance.kind === 'texture'
            ? { backgroundImage: `url(${finish.appearance.texture})` }
            : { background: finish.swatchColorSrgb },
        )}
        {sceneShowsFloor(scene) &&
          card(
            floor,
            m['studio.floor'],
            '',
            collection ? { backgroundImage: `url(${collection.atlas.image})` } : {},
          )}
      </div>
    </Dialog>
  );
}
type ExportState =
  | { status: 'working'; stage: ExportStage }
  | { status: 'ready'; url: string; file: File }
  | { status: 'error' };
/** Renders the labelled JPEG, then offers Save (and Share where the browser can share files). */
export function ExportDialog({
  open,
  onClose,
  run,
  fileName,
  messages: m,
}: {
  open: boolean;
  onClose: () => void;
  run: (signal: AbortSignal, onProgress: (stage: ExportStage) => void) => Promise<Blob>;
  fileName: string;
  messages: Messages;
}) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<ExportState>({ status: 'working', stage: 'render' });
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let url = '';
    run(abort.signal, stage => setState({ status: 'working', stage })).then(
      blob => {
        if (abort.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setState({ status: 'ready', url, file: new File([blob], fileName, { type: 'image/jpeg' }) });
      },
      () => !abort.signal.aborted && setState({ status: 'error' }),
    );
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, attempt, run, fileName]);
  const canShare =
    state.status === 'ready' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [state.file] });
  return (
    <Dialog open={open} title={m['studio.download']} onClose={onClose}>
      <CloseButton label={m['common.close']} onClose={onClose} />
      <div className="studio-export" aria-live="polite">
        {state.status === 'working' && (
          <>
            <p className="presenter-status">
              {m[state.stage === 'render' ? 'studio.exportRender' : 'studio.exportCompose']}
            </p>
            <progress aria-label={m['common.loading']} />
          </>
        )}
        {state.status === 'ready' && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
            <img className="studio-export-preview" src={state.url} alt="" />
            <p className="presenter-status">{m['studio.exportReady']}</p>
            <div className="dialog-actions">
              <a className="btn btn-primary" href={state.url} download={fileName}>
                <Icon name="download" size={18} />
                {m['studio.saveImage']}
              </a>
              {canShare && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigator.share({ files: [state.file] }).catch(() => {})}
                >
                  <Icon name="share" size={18} />
                  {m['studio.shareImage']}
                </button>
              )}
            </div>
          </>
        )}
        {state.status === 'error' && (
          <>
            <p className="presenter-status" role="alert">
              {m['studio.exportError']}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setState({ status: 'working', stage: 'render' });
                  setAttempt(a => a + 1);
                }}
              >
                {m['offline.retry']}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** The shared link as a QR code, so a customer can take the combination home on their phone. */
export function ShareDialog({
  open,
  onClose,
  url,
  messages: m,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  messages: Messages;
}) {
  const [qr, setQr] = useState<{ url: string; size: number; path: string } | null>(null),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    // Loaded on demand: the QR encoder is only needed when sharing.
    import('qrcode-generator').then(({ default: qrcode }) => {
      if (!current) return;
      const code = qrcode(0, 'M');
      code.addData(url);
      code.make();
      const n = code.getModuleCount(),
        quiet = 4;
      let path = '';
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) if (code.isDark(r, c)) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
      setQr({ url, size: n + quiet * 2, path });
    });
    return () => {
      current = false;
    };
  }, [open, url]);
  const local = LOCAL_HOSTS.has(new URL(url).hostname);
  return (
    <Dialog open={open} title={m['studio.shareTitle']} onClose={onClose}>
      <CloseButton label={m['common.close']} onClose={onClose} />
      <div className="studio-share">
        <div className="studio-qr">
          {qr?.url === url && (
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={m['studio.qrAlt']} shapeRendering="crispEdges">
              <rect width={qr.size} height={qr.size} fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
          )}
        </div>
        <p className="dialog-lead">{m['studio.shareHint']}</p>
        {local && <p className="studio-share-note">{m['studio.shareLocal']}</p>}
        <p className="recipient">{url}</p>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              navigator.clipboard?.writeText(url).then(
                () => setCopied(true),
                () => {},
              )
            }
          >
            <Icon name={copied ? 'check' : 'copy'} size={18} />
            {copied ? m['contact.copied'] : m['studio.copyLink']}
          </button>
          {typeof navigator.share === 'function' && (
            <button type="button" className="btn btn-secondary" onClick={() => navigator.share({ url }).catch(() => {})}>
              <Icon name="share" size={18} />
              {m['studio.shareLink']}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
