'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale, StudioSelection } from '@/lib/data/types';
import type { StudioCatalog } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { buildCombinationTitle } from '@/lib/studio/state';
import { createRenderController } from '@/lib/studio/render-controller';
import { readStudioBaseline, readStudioDebug, STUDIO_TIMING_EVENT } from '@/lib/studio/debug';
import { useInquiry } from '../inquiry/InquiryProvider';
import { Toast, useToast } from '../ui/Toast';
import { StudioStage } from './StudioStage';
import { StudioPanel } from './StudioPanel';
import { useStudioSelection } from './useStudioSelection';
import { StudioBaseline } from './StudioBaseline';
export default function StudioClient({
  catalog,
  locale,
  messages: m,
}: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
}) {
  const { toast, show, dismiss } = useToast();
  const [debug] = useState(() => readStudioDebug(window.location.search));
  const [baseline] = useState(() => readStudioBaseline(window.location.search));
  const { requested, update } = useStudioSelection(catalog, m, show);
  const [rendered, setRendered] = useState<StudioSelection | null>(null);
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
  const onRendered = useCallback((s: StudioSelection) => setRendered(s), []);
  const scene = catalog.materials.scenes.find(s => s.id === requested.sceneId)!;
  return (
    <section
      className="studio"
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
        onRendered={onRendered}
        onReset={() => update({ type: 'reset' })}
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
      />
      {baseline && <StudioBaseline catalog={catalog} requested={requested} onAction={update} />}
      <Toast message={toast} onDismiss={dismiss} />
    </section>
  );
}
