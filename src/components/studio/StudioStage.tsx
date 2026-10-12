'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { RoomScene, StudioSelection } from '@/lib/data/types';
import type { RenderController } from '@/lib/studio/types';
import type { PixelBuffer } from '@/lib/studio/render/sampling';
import type { Messages } from '@/lib/i18n/messages';
import { finalFrameWidth, presentFrame } from '@/lib/studio/presentation';
import { IconButton } from '../ui/IconButton';
const FADE_MS = 260;
// The stage keeps the last sharp frame on screen (with a hairline progress bar)
// until the full-resolution frame is ready, then cross-fades it in. No
// low-resolution intermediate is ever shown.
export function StudioStage({
  controller,
  scene,
  selection,
  label,
  roomName,
  messages: m,
  debug,
  onRendered,
  onReset,
}: {
  controller: RenderController;
  scene: RoomScene;
  selection: StudioSelection;
  label: string;
  roomName: string;
  messages: Messages;
  debug: boolean;
  onRendered: (selection: StudioSelection) => void;
  onReset: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null),
    canvasA = useRef<HTMLCanvasElement>(null),
    canvasB = useRef<HTMLCanvasElement>(null),
    front = useRef(-1),
    hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [size, setSize] = useState(0),
    [pending, setPending] = useState(true),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [compare, setCompare] = useState(false),
    [split, setSplit] = useState(50);
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
    const width = finalFrameWidth(size, devicePixelRatio),
      job = { selection, width, height: (width * 3) / 4, quality: 'settled' as const, rendererVersion: 2 as const },
      start = performance.now();
    const run = async () => {
      setPending(true);
      setFailed(false);
      try {
        const result = await controller.render(job);
        if (!current) return;
        present(result.pixels);
        setPending(false);
        onRendered(result.selection);
        if (debug && stage.current) {
          const entries = JSON.parse(stage.current.dataset.presentations || '[]');
          entries.push({ ms: performance.now() - start, width, selection: result.selection });
          stage.current.dataset.presentations = JSON.stringify(entries.slice(-100));
          stage.current.dataset.presentedSelection = JSON.stringify(result.selection);
        }
      } catch (e) {
        if (!current || (e instanceof DOMException && e.name === 'AbortError')) return;
        setPending(false);
        setFailed(true);
        if (debug && stage.current) stage.current.dataset.error = e instanceof Error ? e.message : String(e);
      }
    };
    void run();
    return () => {
      current = false;
      controller.cancel();
    };
  }, [controller, selection, size, retry, debug, onRendered]);
  return (
    <div className="studio-stage-area">
      <div
        ref={stage}
        className={`studio-stage${compare ? ' is-comparing' : ''}`}
        data-scene={scene.id}
        aria-busy={pending}
      >
        <picture className="studio-fallback">
          <img src={scene.fallback} alt="" width={960} height={720} decoding="async" />
        </picture>
        <canvas ref={canvasA} className="studio-canvas" aria-hidden="true" />
        <canvas ref={canvasB} className="studio-canvas" aria-hidden="true" />
        <p className="visually-hidden" aria-live="polite">
          {label}
        </p>
        {compare && (
          <CompareOverlay scene={scene} split={split} onSplit={setSplit} messages={m} />
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
        <div className="studio-stage-tools">
          <IconButton
            icon="compare"
            label={m['studio.compare']}
            pressed={compare}
            onClick={() => {
              setSplit(50);
              setCompare(v => !v);
            }}
          />
          <IconButton
            icon="reset"
            label={m['studio.reset']}
            onClick={() => {
              setCompare(false);
              onReset();
            }}
          />
        </div>
      </div>
      <div className="studio-caption">
        <p className="studio-caption-room">{roomName}</p>
        <p className="studio-caption-note">{m['studio.disclaimer']}</p>
      </div>
    </div>
  );
}
// Drag anywhere on the stage (horizontal intent only, so vertical page scroll
// still works on touch) or use the keyboard slider.
function CompareOverlay({
  scene,
  split,
  onSplit,
  messages: m,
}: {
  scene: RoomScene;
  split: number;
  onSplit: (value: number) => void;
  messages: Messages;
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
      <picture className="studio-compare-original" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
        <img src={scene.base} alt="" width={scene.width} height={scene.height} decoding="async" />
      </picture>
      <span className="studio-compare-label is-start">{m['studio.original']}</span>
      <span className="studio-compare-label is-end">{m['studio.yourChoice']}</span>
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
