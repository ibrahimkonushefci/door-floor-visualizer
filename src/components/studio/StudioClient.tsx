'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale, StudioSelection } from '@/lib/data/types';
import type { StudioCatalog, StudioAction, StudioSnapshot } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { QUERY_CHANGE_EVENT } from '@/lib/catalog/query';
import { parseStudioQuery, serializeStudioQuery } from '@/lib/studio/query';
import { reduceSelection, buildCombinationTitle, isGlass } from '@/lib/studio/state';
import { selectionEqual } from '@/lib/studio/compatibility';
import { createRenderController } from '@/lib/studio/render-controller';
import { useInquiry } from '../inquiry/InquiryProvider';
import { StudioOffline } from '../offline/SaveStudioOffline';
import { ScenePicker } from './ScenePicker';
import { StudioCanvas } from './StudioCanvas';
import { MaterialPicker } from './MaterialPicker';
import { SurfaceTabs } from './SurfaceTabs';
import { TrimControls } from './TrimControls';
import { CombinationSummary } from './CombinationSummary';
import { RenderStatus } from './RenderStatus';
export default function StudioClient({
  catalog,
  locale,
  messages: m,
}: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
}) {
  const [requestedAt, setRequestedAt] = useState(0);
  const [requested, setRequested] = useState(
      () => parseStudioQuery(new URLSearchParams(window.location.search), catalog).selection,
    ),
    [rendered, setRendered] = useState<StudioSelection | null>(null),
    [status, setStatus] = useState<StudioSnapshot['status']>('loading'),
    [error, setError] = useState(''),
    [surface, setSurface] = useState<'door' | 'floor'>('door'),
    [compare, setCompare] = useState(false),
    [notice, setNotice] = useState(() =>
      parseStudioQuery(new URLSearchParams(window.location.search), catalog).warnings.length
        ? m['studio.normalized']
        : '',
    ),
    [retry, setRetry] = useState(0);
  const [controller] = useState(() =>
    createRenderController(catalog, {
      ...(process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_STUDIO_TEST_MAIN === '1'
        ? {
            workerFactory: () => {
              throw new Error('Development fallback check');
            },
          }
        : {}),
      onTiming: e => {
        performance.measure(`studio-${e.quality}-${e.mode}`, {
          start: performance.now() - e.ms,
          end: performance.now(),
        });
        const el = document.querySelector('.studio');
        if (el && e.batchMs !== undefined)
          el.setAttribute(
            'data-max-batch-ms',
            String(Math.max(Number(el.getAttribute('data-max-batch-ms') || 0), e.batchMs)),
          );
        if (el && e.batchMs === undefined) {
          const entries = JSON.parse(el.getAttribute('data-render-timings') || '[]');
          entries.push(e);
          el.setAttribute('data-render-timings', JSON.stringify(entries.slice(-100)));
        }
      },
    }),
  );
  const { setContext, setBlocked } = useInquiry();
  const scene = catalog.materials.scenes.find(s => s.id === requested.sceneId)!,
    finish = catalog.materials.doorFinishes.find(f => f.id === requested.doorFinishId)!,
    pending = !selectionEqual(requested, rendered);
  useEffect(() => {
    const restore = () => {
      const parsed = parseStudioQuery(new URLSearchParams(window.location.search), catalog);
      setRequestedAt(performance.now());
      setRequested(parsed.selection);
      setStatus('loading');
      if (parsed.warnings.length) setNotice(m['studio.normalized']);
    };
    window.addEventListener('popstate', restore);
    const timer = setTimeout(() => {
      history.replaceState(null, '', `?${serializeStudioQuery(requested)}`);
      window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));
    }, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', restore);
    };
  }, [catalog, m, requested]);
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
  useEffect(() => {
    setBlocked(pending || compare);
    return () => setBlocked(false);
  }, [pending, compare, setBlocked]);
  useEffect(() => {
    setContext(
      rendered && !pending
        ? { kind: 'studio', selection: rendered }
        : { kind: 'catalog', productIds: [] },
    );
    return () => setContext({ kind: 'catalog', productIds: [] });
  }, [rendered, pending, setContext]);
  const complete = useCallback((s: StudioSelection) => {
    setRendered(s);
    setStatus('ready');
    setError('');
  }, []);
  const failed = useCallback((s: string) => {
    setStatus('error');
    setError(s);
  }, []);
  const update = (a: StudioAction) => {
    const next = reduceSelection(requested, a, catalog);
    setRequestedAt(performance.now());
    setRequested(next);
    setStatus('loading');
    setCompare(false);
    if (a.type === 'scene') {
      history.pushState(null, '', `?${serializeStudioQuery(next)}`);
      window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));
      if (next.doorProductId !== requested.doorProductId) setNotice(m['studio.normalized']);
    }
    if (a.type === 'door' && isGlass(a.finishId, catalog)) setNotice(m['studio.glassFrame']);
  };
  const doors = catalog.materials.doorFinishes.map(f => {
    const current = catalog.products.find(
      p => p.id === requested.doorProductId && p.kind === 'door' && p.finishIds.includes(f.id),
    );
    const p =
      current ||
      catalog.products.find(
        p =>
          p.kind === 'door' &&
          scene.allowedDoorProductIds.includes(p.id) &&
          p.finishIds.includes(f.id),
      );
    return {
      id: f.id,
      label: localize(f.name, locale),
      swatch: f.swatchColorSrgb,
      disabledReason: p ? undefined : m['studio.incompatible'],
      productId: p?.id,
    };
  });
  const floors = catalog.products
    .filter(p => p.kind === 'floor')
    .map(p => ({
      id: p.id,
      label: localize(p.name, locale),
      swatch: catalog.materials.floorCollections.find(
        c => p.kind === 'floor' && c.id === p.collectionId,
      )!.swatchColorSrgb,
    }));
  const title = rendered
    ? buildCombinationTitle(rendered, catalog, locale)
    : m['studio.defaultLoading'];
  return (
    <section
      className="studio"
      data-requested-selection={JSON.stringify(requested)}
      aria-label={m['nav.studio']}
    >
      <ScenePicker
        scenes={catalog.materials.scenes}
        value={scene.id}
        locale={locale}
        onChange={sceneId => update({ type: 'scene', sceneId })}
      />
      <div className="studio-layout">
        <div className="studio-view">
          <StudioCanvas
            requestedAt={requestedAt}
            retry={retry}
            controller={controller}
            scene={scene}
            selection={requested}
            onComplete={complete}
            onError={failed}
            compare={compare}
            label={compare ? m['studio.original'] : title}
          />
          <div className="studio-toolbar">
            <button aria-pressed={compare} onClick={() => setCompare(v => !v)}>
              {m['studio.compare']}
            </button>
            <button onClick={() => update({ type: 'reset' })}>{m['studio.reset']}</button>
          </div>
          <CombinationSummary selection={rendered} title={title} pending={pending} />
          <RenderStatus
            status={status}
            message={
              status === 'error'
                ? `${m['studio.error']} ${error}`
                : pending
                  ? m['studio.loading']
                  : m['studio.ready']
            }
            onRetry={() => {
              setRequestedAt(performance.now());
              setStatus('loading');
              setRetry(v => v + 1);
            }}
          />
          <p className="product-note">
            {m['studio.note']} {scene.depictedDoorSizeMm.width / 10} × 200 cm.
          </p>
        </div>
        <div className="studio-controls">
          <SurfaceTabs value={surface} onChange={setSurface} messages={m} />
          {surface === 'door' ? (
            <MaterialPicker
              items={doors}
              selectedId={requested.doorFinishId}
              label={m['studio.door']}
              onSelect={id => {
                const p = doors.find(i => i.id === id)!;
                update({ type: 'door', productId: p.productId!, finishId: id });
              }}
            />
          ) : (
            <MaterialPicker
              items={floors}
              selectedId={requested.floorProductId}
              label={m['studio.floor']}
              onSelect={productId => update({ type: 'floor', productId })}
            />
          )}
          <div className="rotation-controls" role="group" aria-label={m['studio.direction']}>
            <span>{m['studio.direction']}</span>
            {([90, 0] as const).map(degrees => (
              <button
                key={degrees}
                aria-pressed={requested.floorRotationDeg === degrees}
                onClick={() => update({ type: 'rotate', degrees })}
              >
                {' '}
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
                  <g
                    transform={degrees === 90 ? '' : 'rotate(90 10 10)'}
                    fill="none"
                    stroke="currentColor"
                  >
                    <rect x="2" y="2" width="16" height="16" />
                    <path d="M7 2v16M13 2v16M2 8h5M7 13h6M13 6h5" />
                  </g>
                </svg>
                {m[degrees === 90 ? 'studio.lengthwise' : 'studio.crosswise']}
              </button>
            ))}
          </div>
          <TrimControls
            frameMode={requested.frameMode}
            skirtingMode={requested.skirtingMode}
            allowedFrameModes={finish.kind === 'glass' ? ['black'] : scene.allowedFrameModes}
            allowedSkirtingModes={scene.allowedSkirtingModes}
            messages={m}
            onFrameChange={mode => update({ type: 'frame', mode })}
            onSkirtingChange={mode => update({ type: 'skirting', mode })}
          />
          <p className="product-note" role="status">
            {notice}
          </p>
          <StudioOffline messages={m} />
          <StudioInquiry
            disabled={pending || compare}
            selection={rendered}
            label={m['studio.inquiry']}
          />
        </div>
      </div>
    </section>
  );
}
function StudioInquiry({
  disabled,
  selection,
  label,
}: {
  disabled: boolean;
  selection: StudioSelection | null;
  label: string;
}) {
  const { open } = useInquiry();
  return (
    <button
      className="primary-button"
      disabled={disabled || !selection}
      onClick={() => selection && open('whatsapp', { kind: 'studio', selection })}
    >
      {label}
    </button>
  );
}
