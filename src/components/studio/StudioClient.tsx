'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale, StudioSelection } from '@/lib/data/types';
import type { StudioCatalog, SurfaceRole } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { buildCombinationTitle } from '@/lib/studio/state';
import { serializeStudioQuery } from '@/lib/studio/query';
import { selectionEqual } from '@/lib/studio/compatibility';
import { createRenderController } from '@/lib/studio/render-controller';
import { exportFileName, exportStudioImage, type ExportBrand, type ExportStage } from '@/lib/studio/export-image';
import { readStudioBaseline, readStudioDebug, STUDIO_TIMING_EVENT } from '@/lib/studio/debug';
import { useInquiry } from '../inquiry/InquiryProvider';
import { Toast, useToast } from '../ui/Toast';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { StudioStage } from './StudioStage';
import { StudioPanel, type Surface } from './StudioPanel';
import { useStudioSelection } from './useStudioSelection';
import { StudioBaseline } from './StudioBaseline';
import { ExportDialog, ProductDetailsDialog, ShareDialog } from './StudioDialogs';
export interface StudioBrand extends ExportBrand {
  siteUrl: string | null;
}
type StudioDialog = 'details' | 'export' | 'share';
const fullscreenElement = () =>
  document.fullscreenElement ?? (document as { webkitFullscreenElement?: Element }).webkitFullscreenElement ?? null;
export default function StudioClient({
  catalog,
  locale,
  messages: m,
  brand,
}: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
  brand: StudioBrand;
}) {
  const { toast, show, dismiss } = useToast();
  const [debug] = useState(() => readStudioDebug(window.location.search));
  const [baseline] = useState(() => readStudioBaseline(window.location.search));
  const { requested, update } = useStudioSelection(catalog, m, show);
  const [rendered, setRendered] = useState<StudioSelection | null>(null),
    [busy, setBusy] = useState(true),
    [surface, setSurface] = useState<Surface>('door'),
    [presenting, setPresenting] = useState(false),
    [drawer, setDrawer] = useState(false),
    [dialog, setDialog] = useState<{ kind: StudioDialog; selection: StudioSelection } | null>(null);
  const [controller] = useState(() =>
    createRenderController(catalog, {
      onTiming: debug
        ? e => {
            window.dispatchEvent(new CustomEvent(STUDIO_TIMING_EVENT, { detail: e }));
            const el = document.querySelector<HTMLElement>('.studio');
            if (!el) return;
            if (e.batchMs !== undefined)
              el.dataset.maxBatchMs = String(Math.max(Number(el.dataset.maxBatchMs || 0), e.batchMs));
            else {
              const entries = JSON.parse(el.dataset.renderTimings || '[]');
              entries.push(e);
              el.dataset.renderTimings = JSON.stringify(entries.slice(-100));
            }
          }
        : undefined,
    }),
  );
  const { open, setContext } = useInquiry();
  // Strict Mode remounts effects; only dispose the controller on a real unmount.
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const ownership = lifecycle.current,
      token = ++ownership.generation;
    return () => {
      controller.cancel();
      queueMicrotask(() => {
        if (ownership.generation === token) controller.dispose();
      });
    };
  }, [controller]);
  // Inquiries always describe what the customer is looking at: the last finished frame.
  useEffect(() => {
    setContext(rendered ? { kind: 'studio', selection: rendered } : { kind: 'catalog', productIds: [] });
    return () => setContext({ kind: 'catalog', productIds: [] });
  }, [rendered, setContext]);
  // Presentation mode: the room fills the screen (true full screen where the
  // browser allows it) and the choices move into a drawer.
  const exitPresenting = useCallback(() => {
    setPresenting(false);
    if (fullscreenElement()) document.exitFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    if (!presenting) return;
    document.documentElement.classList.add('is-studio-presenting');
    const onFullscreen = () => !fullscreenElement() && setPresenting(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) exitPresenting();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('is-studio-presenting');
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      document.removeEventListener('keydown', onKey);
    };
  }, [presenting, exitPresenting]);
  const enterPresenting = () => {
    setDrawer(false);
    setPresenting(true);
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    // Phones without element full screen (iPhone Safari) keep the in-page layout.
    try {
      if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
      else root.webkitRequestFullscreen?.();
    } catch {}
  };
  // Tapping the door or floor in the picture opens that surface's choices.
  const onSurface = useCallback(
    (role: SurfaceRole) => {
      setSurface(role === 'floor' || role === 'skirting' ? 'floor' : 'door');
      if (presenting) setDrawer(true);
      requestAnimationFrame(() => {
        const target = document.querySelector('.studio-tabs, .studio-tabpanel'),
          room = document.querySelector('.studio-stage-area');
        if (!target || !room) return;
        // Single column: the room is pinned, so bring the choices up to just below it.
        if (!presenting && getComputedStyle(room).position === 'sticky')
          window.scrollTo({
            top: scrollY + target.getBoundingClientRect().top - room.getBoundingClientRect().bottom - 8,
            behavior: 'smooth',
          });
        else target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    },
    [presenting],
  );
  const onRendered = useCallback((s: StudioSelection) => setRendered(s), []);
  const titleFor = useCallback((s: StudioSelection) => buildCombinationTitle(s, catalog, locale), [catalog, locale]);
  const scene = catalog.materials.scenes.find(s => s.id === requested.sceneId)!;
  // Downloads and links capture the finished frame the customer is looking at.
  const settled = rendered !== null && !busy && selectionEqual(rendered, requested);
  const openDialog = (kind: StudioDialog) => rendered && setDialog({ kind, selection: rendered });
  const exportSelection = dialog?.kind === 'export' ? dialog.selection : null;
  const runExport = useCallback(
    (signal: AbortSignal, onProgress: (stage: ExportStage) => void) =>
      exportStudioImage(catalog, exportSelection!, locale, { controller, messages: m, brand, signal, onProgress }),
    [catalog, exportSelection, locale, controller, m, brand],
  );
  const shareUrl = (s: StudioSelection) => {
    const url = new URL(window.location.href);
    if (brand.siteUrl) {
      const site = new URL(brand.siteUrl);
      url.protocol = site.protocol;
      url.host = site.host;
    }
    url.pathname = `/${locale}/studio/`;
    url.search = serializeStudioQuery(s).toString();
    url.hash = '';
    return url.href;
  };
  const actions = (
    <>
      <button
        type="button"
        className="studio-action"
        aria-label={m['studio.details']}
        title={m['studio.details']}
        onClick={() => openDialog('details')}
        disabled={!rendered}
      >
        <Icon name="info" size={18} />
        <span className="studio-action-label">{m['studio.detailsShort']}</span>
      </button>
      <button
        type="button"
        className="studio-action"
        aria-label={m['studio.download']}
        title={m['studio.download']}
        onClick={() => openDialog('export')}
        disabled={!settled}
      >
        <Icon name="download" size={18} />
        <span className="studio-action-label">{m['studio.downloadShort']}</span>
      </button>
      <button
        type="button"
        className="studio-action"
        aria-label={m['studio.share']}
        title={m['studio.share']}
        onClick={() => openDialog('share')}
        disabled={!rendered}
      >
        <Icon name="qr" size={18} />
        <span className="studio-action-label">{m['studio.shareShort']}</span>
      </button>
    </>
  );
  const startTools = presenting ? (
    <>
      <IconButton icon="collapse" label={m['studio.exitPresent']} onClick={exitPresenting} />
      <IconButton icon="sliders" label={m['studio.choices']} pressed={drawer} onClick={() => setDrawer(d => !d)} />
      <IconButton icon="download" label={m['studio.download']} disabled={!settled} onClick={() => openDialog('export')} />
      <IconButton icon="qr" label={m['studio.share']} disabled={!rendered} onClick={() => openDialog('share')} />
    </>
  ) : (
    <IconButton icon="expand" label={m['studio.present']} onClick={enterPresenting} />
  );
  return (
    <section
      className={`studio${presenting ? ' is-presenting' : ''}${presenting && drawer ? ' is-drawer-open' : ''}`}
      data-requested-selection={debug ? JSON.stringify(requested) : undefined}
    >
      <StudioStage
        controller={controller}
        scene={scene}
        selection={requested}
        label={buildCombinationTitle(requested, catalog, locale)}
        roomName={localize(scene.name, locale)}
        messages={m}
        debug={debug}
        titleFor={titleFor}
        onRendered={onRendered}
        onBusy={setBusy}
        onSurface={onSurface}
        onNotice={show}
        onReset={() => update({ type: 'reset' })}
        startTools={startTools}
        exporting={dialog?.kind === 'export'}
      />
      <StudioPanel
        catalog={catalog}
        locale={locale}
        messages={m}
        requested={requested}
        canRequest={rendered !== null}
        onAction={update}
        onUnavailable={show}
        onRequest={() => rendered && open('whatsapp', { kind: 'studio', selection: rendered })}
        surface={surface}
        onSurface={setSurface}
        actions={actions}
        inert={presenting && !drawer}
      />
      {dialog?.kind === 'details' && (
        <ProductDetailsDialog
          open
          onClose={() => setDialog(null)}
          catalog={catalog}
          selection={dialog.selection}
          locale={locale}
          messages={m}
        />
      )}
      {dialog?.kind === 'export' && (
        <ExportDialog
          open
          onClose={() => setDialog(null)}
          run={runExport}
          fileName={exportFileName(brand.name, localize(scene.name, locale))}
          messages={m}
        />
      )}
      {dialog?.kind === 'share' && (
        <ShareDialog open onClose={() => setDialog(null)} url={shareUrl(dialog.selection)} messages={m} />
      )}
      {baseline && <StudioBaseline catalog={catalog} requested={requested} onAction={update} />}
      <Toast message={toast} onDismiss={dismiss} />
    </section>
  );
}
