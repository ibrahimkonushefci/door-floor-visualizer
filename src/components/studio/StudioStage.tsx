'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { RoomScene, StudioSelection } from '@/lib/data/types';
import type { RenderController, SurfaceRole } from '@/lib/studio/types';
import type { PixelBuffer } from '@/lib/studio/render/sampling';
import { modelPatch } from '@/lib/studio/door-models';
import type { Messages } from '@/lib/i18n/messages';
import {
  finalFrameWidth,
  presentFrame,
  sceneScaleFor,
  PREVIEW_AFTER_MS,
} from '@/lib/studio/presentation';
import {
  NO_ZOOM,
  isZoomed,
  maxZoomFor,
  panBy,
  sceneAt,
  zoomAt,
  zoomTransform,
  type StageZoom,
} from '@/lib/studio/zoom';
import { STUDIO_PRESENTED_EVENT, STUDIO_RENDER_ERROR_EVENT } from '@/lib/studio/debug';
import { IconButton } from '../ui/IconButton';
const FADE_MS = 260;
// After a zoom gesture settles, the room is re-rendered at its variant's full width.
const SHARPEN_AFTER_MS = 220;
type CompareMode = 'off' | 'original' | 'ab';
// The stage keeps the last sharp frame on screen (with a hairline progress bar)
// until the full-resolution frame is ready, then cross-fades it in. Only when a
// scene's full frames are slow (large rendered rooms) is a half-width preview
// cross-faded in first, then replaced by the settled frame.
export function StudioStage({
  controller,
  scene,
  selection,
  label,
  roomName,
  messages: m,
  debug,
  titleFor,
  onRendered,
  onBusy,
  onSurface,
  onNotice,
  onReset,
  startTools,
  exporting,
}: {
  controller: RenderController;
  scene: RoomScene;
  selection: StudioSelection;
  label: string;
  roomName: string;
  messages: Messages;
  debug: boolean;
  titleFor: (selection: StudioSelection) => string;
  onRendered: (selection: StudioSelection) => void;
  onBusy: (busy: boolean) => void;
  onSurface: (role: SurfaceRole) => void;
  onNotice: (text: string) => void;
  onReset: () => void;
  startTools?: ReactNode;
  exporting: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null),
    canvasA = useRef<HTMLCanvasElement>(null),
    canvasB = useRef<HTMLCanvasElement>(null),
    front = useRef(-1),
    hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined),
    settledMs = useRef(new Map<string, number>());
  const [size, setSize] = useState(0),
    [pending, setPending] = useState(true),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [compare, setCompare] = useState<CompareMode>('off'),
    [ab, setAb] = useState<StudioSelection | null>(null),
    [settled, setSettled] = useState<StudioSelection | null>(null),
    [split, setSplit] = useState(50),
    [zoom, setZoom] = useState<StageZoom>(NO_ZOOM),
    [sharp, setSharp] = useState(false),
    [tap, setTap] = useState<{ x: number; y: number; key: number } | null>(null);
  // The variant (full or lighter) follows the unzoomed stage, so zoom never
  // switches a phone to the full-resolution room.
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    baseWidth = finalFrameWidth(size, dpr, scene.width),
    sceneScale = sceneScaleFor(baseWidth, scene.width),
    maxZoom = maxZoomFor(sceneScale),
    zoomed = isZoomed(zoom);
  const zoomRef = useRef({ maxZoom, compare });
  useLayoutEffect(() => {
    zoomRef.current = { maxZoom, compare };
  });
  useEffect(() => {
    const el = stage.current!;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(entries => {
      clearTimeout(timer);
      timer = setTimeout(() => setSize(Math.floor(entries[0].contentRect.width)), 120);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  useEffect(() => onBusy(pending), [pending, onBusy]);
  // A new room starts unzoomed; A/B compares two combinations of one room, and
  // an image export never runs while an A/B snapshot is held (memory bound).
  const [roomId, setRoomId] = useState(scene.id);
  if (roomId !== scene.id) {
    setRoomId(scene.id);
    setZoom(NO_ZOOM);
    if (compare === 'ab') setCompare('off');
  }
  if (exporting && compare === 'ab') setCompare('off');
  if (!zoomed && sharp) setSharp(false);
  useEffect(() => {
    if (!zoomed) return;
    const timer = setTimeout(() => setSharp(true), SHARPEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [zoomed]);
  // Trackpad pinch (ctrl + wheel) zooms; a plain wheel pans once zoomed.
  useEffect(() => {
    const el = stage.current!;
    const wheel = (e: WheelEvent) => {
      const { maxZoom, compare } = zoomRef.current;
      if (compare !== 'off') return;
      const r = el.getBoundingClientRect(),
        fx = (e.clientX - r.left) / r.width,
        fy = (e.clientY - r.top) / r.height;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(z => zoomAt(z, z.scale * Math.exp(-e.deltaY * 0.01), fx, fy, maxZoom));
      } else
        setZoom(z => {
          if (!isZoomed(z)) return z;
          e.preventDefault();
          return panBy(z, -e.deltaX / r.width, -e.deltaY / r.height, maxZoom);
        });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    if (!size) return;
    let current = true;
    const present = (pixels: PixelBuffer) => {
      const canvases = [canvasA.current, canvasB.current],
        nextIndex = front.current === 0 ? 1 : 0,
        next = canvases[nextIndex],
        previous = front.current >= 0 ? canvases[front.current] : null;
      if (!next) return;
      presentFrame(next, pixels);
      clearTimeout(hideTimer.current);
      next.style.transition = 'none';
      next.style.opacity = '0';
      next.style.zIndex = '2';
      if (previous) previous.style.zIndex = '1';
      void next.offsetWidth;
      next.style.transition = '';
      next.style.opacity = '1';
      hideTimer.current = setTimeout(() => {
        if (previous) previous.style.opacity = '0';
      }, FADE_MS + 40);
      front.current = nextIndex;
    };
    const width = sharp ? Math.max(baseWidth, Math.floor((scene.width * sceneScale) / 4) * 4) : baseWidth,
      job = {
        selection,
        width,
        height: (width * 3) / 4,
        quality: 'settled' as const,
        rendererVersion: 2 as const,
        sceneScale,
      },
      start = performance.now();
    const run = async () => {
      setPending(true);
      setFailed(false);
      try {
        let previewMs: number | undefined;
        if (!sharp && (settledMs.current.get(scene.id) ?? 0) > PREVIEW_AFTER_MS) {
          const half = Math.max(4, Math.floor(width / 8) * 4),
            preview = await controller.render({ ...job, width: half, height: (half * 3) / 4, quality: 'preview' });
          if (!current) return;
          present(preview.pixels);
          previewMs = performance.now() - start;
        }
        const settledStart = performance.now();
        const result = await controller.render(job);
        if (!current) return;
        settledMs.current.set(scene.id, performance.now() - settledStart);
        present(result.pixels);
        setSettled(result.selection);
        setPending(false);
        onRendered(result.selection);
        if (debug && stage.current) {
          const entries = JSON.parse(stage.current.dataset.presentations || '[]');
          const entry = { ms: performance.now() - start, previewMs, width, selection: result.selection };
          entries.push(entry);
          stage.current.dataset.presentations = JSON.stringify(entries.slice(-100));
          stage.current.dataset.presentedSelection = JSON.stringify(result.selection);
          window.dispatchEvent(new CustomEvent(STUDIO_PRESENTED_EVENT, { detail: entry }));
        }
      } catch (e) {
        if (!current || (e instanceof DOMException && e.name === 'AbortError')) return;
        setPending(false);
        setFailed(true);
        if (debug && stage.current) {
          const message = e instanceof Error ? e.message : String(e);
          stage.current.dataset.error = message;
          window.dispatchEvent(new CustomEvent(STUDIO_RENDER_ERROR_EVENT, { detail: { message, selection } }));
        }
      }
    };
    void run();
    return () => {
      current = false;
      controller.cancel();
    };
  }, [controller, scene, selection, size, baseWidth, sceneScale, sharp, retry, debug, onRendered]);
  // Pointer gestures on the room: tap selects a surface, drag pans (zoomed),
  // two fingers pinch. Unzoomed one-finger drags stay page scrolls on touch.
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      kind: 'tap' | 'pan' | 'pinch' | 'done';
      x: number;
      y: number;
      t: number;
      zoom: StageZoom;
      distance?: number;
    } | null>(null);
  const fraction = (x: number, y: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { fx: (x - r.left) / r.width, fy: (y - r.top) / r.height, w: r.width, h: r.height };
  };
  const pinchOf = () => {
    const [a, b] = [...pointers.current.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const selectAt = (clientX: number, clientY: number) => {
    const { fx, fy } = fraction(clientX, clientY),
      [sx, sy] = sceneAt(zoom, fx, fy),
      role = controller.hitTest(scene.id, sx, sy);
    if (!role) return;
    setTap({ x: fx * 100, y: fy * 100, key: performance.now() });
    onSurface(role);
  };
  const viewHandlers =
    compare === 'off'
      ? {
          onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            if ((e.pointerType === 'mouse' && e.button !== 0) || (e.target as Element).closest('button')) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 1) {
              gesture.current = { kind: 'tap', x: e.clientX, y: e.clientY, t: performance.now(), zoom };
              if (zoomed) e.currentTarget.setPointerCapture(e.pointerId);
            } else if (pointers.current.size === 2) {
              const p = pinchOf();
              gesture.current = { kind: 'pinch', x: p.x, y: p.y, t: 0, zoom, distance: p.distance };
              for (const id of pointers.current.keys()) e.currentTarget.setPointerCapture(id);
            }
          },
          onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            const g = gesture.current;
            if (!g || !pointers.current.has(e.pointerId)) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (g.kind === 'pinch' && pointers.current.size >= 2) {
              const p = pinchOf(),
                start = fraction(g.x, g.y),
                now = fraction(p.x, p.y),
                scaled = zoomAt(g.zoom, (g.zoom.scale * p.distance) / g.distance!, start.fx, start.fy, maxZoom);
              setZoom(panBy(scaled, now.fx - start.fx, now.fy - start.fy, maxZoom));
              return;
            }
            if (g.kind !== 'tap' && g.kind !== 'pan') return;
            const dx = e.clientX - g.x,
              dy = e.clientY - g.y;
            if (g.kind === 'tap' && Math.hypot(dx, dy) > 8) g.kind = 'pan';
            if (g.kind === 'pan' && isZoomed(g.zoom)) {
              const r = stage.current!.getBoundingClientRect();
              setZoom(panBy(g.zoom, dx / r.width, dy / r.height, maxZoom));
            }
          },
          onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
            const g = gesture.current;
            pointers.current.delete(e.pointerId);
            if (g?.kind === 'tap' && performance.now() - g.t < 600) selectAt(e.clientX, e.clientY);
            if (g?.kind === 'pinch') g.kind = 'done';
            if (!pointers.current.size) gesture.current = null;
          },
          onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
            pointers.current.delete(e.pointerId);
            gesture.current = null;
          },
          onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => {
            if ((e.target as Element).closest('button')) return;
            const { fx, fy } = fraction(e.clientX, e.clientY);
            setZoom(z => (isZoomed(z) ? NO_ZOOM : zoomAt(z, 2, fx, fy, maxZoom)));
          },
        }
      : {};
  const startCompare = (mode: CompareMode) => {
    setZoom(NO_ZOOM);
    setSplit(50);
    setAb(mode === 'ab' ? settled : null);
    if (mode === 'ab' && compare !== 'ab') onNotice(m['studio.abHint']);
    setCompare(compare === mode ? 'off' : mode);
  };
  const frontCanvas = () => [canvasA.current, canvasB.current][front.current] ?? null;
  return (
    <div className="studio-stage-area">
      <div
        ref={stage}
        className={`studio-stage${compare !== 'off' ? ' is-comparing' : ''}${zoomed ? ' is-zoomed' : ''}`}
        data-scene={scene.id}
        aria-busy={pending}
        onScroll={e => e.currentTarget.scrollTo(0, 0)}
        {...viewHandlers}
      >
        <div className="studio-view" style={{ transform: zoomTransform(zoom) }}>
          <picture className="studio-fallback">
            <img src={scene.fallback} alt="" width={960} height={720} decoding="async" draggable={false} />
          </picture>
          <canvas ref={canvasA} className="studio-canvas" aria-hidden="true" />
          <canvas ref={canvasB} className="studio-canvas" aria-hidden="true" />
        </div>
        <p className="visually-hidden" aria-live="polite">
          {label}
        </p>
        {tap && (
          <span
            key={tap.key}
            className="studio-tap"
            style={{ left: `${tap.x}%`, top: `${tap.y}%` }}
            aria-hidden="true"
            onAnimationEnd={() => setTap(null)}
          />
        )}
        {compare === 'original' && (
          <CompareOverlay
            split={split}
            onSplit={setSplit}
            startLabel={m['studio.original']}
            endLabel={m['studio.yourChoice']}
            messages={m}
          >
            <OriginalRoom scene={scene} modelId={selection.doorModelId} />
          </CompareOverlay>
        )}
        {compare === 'ab' && ab && (
          <CompareOverlay
            split={split}
            onSplit={setSplit}
            startLabel={`A · ${titleFor(ab)}`}
            endLabel={`B · ${m['studio.yourChoice']}`}
            messages={m}
          >
            <FrameSnapshot source={frontCanvas} />
          </CompareOverlay>
        )}
        {compare === 'off' && (
          <p className="studio-room-label" aria-hidden="true">
            {roomName}
          </p>
        )}
        {pending && <span className="studio-progress" aria-hidden="true" />}
        {failed && (
          <div className="studio-error" role="alert">
            <p>{m['studio.renderError']}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setRetry(v => v + 1)}>
              {m['common.retry']}
            </button>
          </div>
        )}
        {startTools && <div className="studio-stage-tools is-start">{startTools}</div>}
        <div className="studio-stage-tools">
          <IconButton
            icon="compare"
            label={m['studio.compare']}
            pressed={compare === 'original'}
            onClick={() => startCompare('original')}
          />
          <IconButton
            icon="ab"
            label={m['studio.compareAB']}
            pressed={compare === 'ab'}
            disabled={compare !== 'ab' && (pending || !settled)}
            onClick={() => startCompare('ab')}
          />
          <IconButton
            icon="reset"
            label={m['studio.reset']}
            onClick={() => {
              setCompare('off');
              setZoom(NO_ZOOM);
              onReset();
            }}
          />
        </div>
        {compare === 'off' && (
          <div className="studio-stage-tools is-zoom">
            <IconButton
              icon="zoom-out"
              label={m['studio.zoomOut']}
              disabled={!zoomed}
              onClick={() => setZoom(z => zoomAt(z, z.scale / 1.5, 0.5, 0.5, maxZoom))}
            />
            <IconButton
              icon="zoom-in"
              label={m['studio.zoomIn']}
              disabled={zoom.scale >= maxZoom}
              onClick={() => setZoom(z => zoomAt(z, z.scale * 1.5, 0.5, 0.5, maxZoom))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
function OriginalRoom({ scene, modelId }: { scene: RoomScene; modelId: string }) {
  // Other door models draw their own neutral render over the door region.
  const patch = modelPatch(scene, modelId);
  return (
    <>
      <picture>
        <img src={scene.original ?? scene.base} alt="" width={scene.width} height={scene.height} decoding="async" />
      </picture>
      {patch?.original && (
        <picture>
          <img
            className="studio-compare-patch"
            src={patch.original}
            alt=""
            decoding="async"
            style={{
              left: `${(patch.regionPx[0] / scene.width) * 100}%`,
              top: `${(patch.regionPx[1] / scene.height) * 100}%`,
              width: `${(patch.regionPx[2] / scene.width) * 100}%`,
            }}
          />
        </picture>
      )}
    </>
  );
}
// A/B: a copy of the frame on screen when A/B starts; the stage keeps rendering B.
function FrameSnapshot({ source }: { source: () => HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const from = source(),
      to = ref.current;
    if (!from || !to || !from.width) return;
    to.width = from.width;
    to.height = from.height;
    to.getContext('2d', { colorSpace: 'srgb' })?.drawImage(from, 0, 0);
    return () => {
      to.width = 0;
      to.height = 0;
    };
    // The snapshot is taken once, when A/B starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} className="studio-snapshot" aria-hidden="true" />;
}
// Drag anywhere on the stage (horizontal intent only, so vertical page scroll
// still works on touch) or use the keyboard slider.
function CompareOverlay({
  split,
  onSplit,
  startLabel,
  endLabel,
  messages: m,
  children,
}: {
  split: number;
  onSplit: (value: number) => void;
  startLabel: string;
  endLabel: string;
  messages: Messages;
  children: ReactNode;
}) {
  const id = useId(),
    drag = useRef<{ x: number; y: number; direction: 'pending' | 'horizontal' | 'vertical' } | null>(
      null,
    );
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSplit(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  return (
    <div
      className="studio-compare"
      onDragStart={e => e.preventDefault()}
      onPointerDown={e => {
        if (e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, direction: 'pending' };
        if (e.pointerType === 'mouse') {
          drag.current.direction = 'horizontal';
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }
      }}
      onPointerMove={e => {
        const start = drag.current;
        if (!start) return;
        const dx = Math.abs(e.clientX - start.x),
          dy = Math.abs(e.clientY - start.y);
        if (start.direction === 'pending' && Math.max(dx, dy) > 8) {
          start.direction = dx > dy * 1.2 ? 'horizontal' : 'vertical';
          if (start.direction === 'horizontal') e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (start.direction === 'horizontal') move(e);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="studio-compare-original" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        {children}
      </div>
      <span className="studio-compare-label is-start">{startLabel}</span>
      <span className="studio-compare-label is-end">{endLabel}</span>
      <span className="studio-compare-divider" style={{ left: `${split}%` }} aria-hidden="true">
        <span />
      </span>
      <label className="visually-hidden" htmlFor={id}>
        {m['studio.compareHint']}
      </label>
      <input
        id={id}
        className="visually-hidden"
        type="range"
        min={0}
        max={100}
        value={Math.round(split)}
        onChange={e => onSplit(Number(e.target.value))}
        autoFocus
      />
    </div>
  );
}
