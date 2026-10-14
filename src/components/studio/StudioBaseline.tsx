'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioSelection } from '@/lib/data/types';
import type { StudioAction, StudioCatalog } from '@/lib/studio/types';
import { reduceSelection } from '@/lib/studio/state';
import { selectionEqual } from '@/lib/studio/compatibility';
import {
  baselineAction,
  buildBaselineSteps,
  summarizeBaseline,
  type BaselineResult,
  type BaselineStep,
} from '@/lib/studio/baseline';
import { STUDIO_PRESENTED_EVENT, STUDIO_RENDER_ERROR_EVENT, STUDIO_TIMING_EVENT } from '@/lib/studio/debug';
import { useOffline } from '../offline/OfflineProvider';
// Diagnostics only (?debug=1&baseline=1), English only: the Phase 4 physical-iPad
// baseline. Progress is kept in localStorage after every step, so a tab that
// Safari reloads (memory pressure) is detected and reported on the next load.
const STORAGE_KEY = 'pd:studio-baseline';
const STEP_TIMEOUT_MS = 60000,
  GAP_MS = 400;
interface Stored {
  version: 1;
  status: 'idle' | 'running' | 'done' | 'interrupted';
  startScene: string;
  steps: BaselineStep[];
  next: number;
  results: BaselineResult[];
  environment: Record<string, unknown>;
  pageLoads: { at: string; ms: number | null; width?: number }[];
  offline: { at: string; ms: number; outcome: string; files?: number; bytes?: number; error?: string }[];
}
const read = (): Stored | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
};
const write = (s: Stored) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: results stay on screen only */
  }
};
const mark = (label: string) => {
  try {
    console.timeStamp(label);
  } catch {
    /* not supported */
  }
};
function environment() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    devicePixelRatio: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
    cores: navigator.hardwareConcurrency,
    build: document.querySelector('meta[name="porta-build"]')?.getAttribute('content') ?? null,
    url: location.pathname,
  };
}
type Timing = { quality: string; ms: number; mode: string; prepareMs?: number; renderMs?: number; cacheHit?: boolean };
export function StudioBaseline({
  catalog,
  requested,
  onAction,
}: {
  catalog: StudioCatalog;
  requested: StudioSelection;
  onAction: (action: StudioAction) => void;
}) {
  const offline = useOffline();
  const [state, setState] = useState<Stored>(() => {
    const stored = read();
    const fresh: Stored = {
      version: 1,
      status: 'idle',
      startScene: requested.sceneId,
      steps: buildBaselineSteps(catalog, requested.sceneId),
      next: 0,
      results: [],
      environment: environment(),
      pageLoads: [],
      offline: [],
    };
    if (!stored || stored.version !== 1) return fresh;
    if (stored.status === 'running')
      return {
        ...stored,
        status: 'interrupted',
        results: [
          ...stored.results,
          {
            step: stored.next,
            phase: 'reload',
            label: `Page reloaded during step ${stored.next + 1}`,
            outcome: 'reload',
            note: 'Safari reloaded or the tab was closed while this step ran',
          },
        ],
        next: stored.next + 1,
      };
    return stored;
  });
  const [open, setOpen] = useState(true),
    [running, setRunning] = useState(false),
    [copied, setCopied] = useState('');
  const selection = useRef(requested),
    action = useRef(onAction),
    stop = useRef(false),
    saveStart = useRef<number | null>(null);
  useEffect(() => {
    selection.current = requested;
    action.current = onAction;
  });
  const commit = useCallback((next: Stored) => {
    write(next);
    setState(next);
  }, []);
  // The first sharp frame after this page load (time since navigation start).
  useEffect(() => {
    const at = new Date().toISOString();
    const onPresented = (e: Event) => {
      const detail = (e as CustomEvent<{ width: number }>).detail;
      setState(s => {
        const next = { ...s, pageLoads: [...s.pageLoads, { at, ms: Math.round(performance.now()), width: detail.width }] };
        write(next);
        return next;
      });
      window.removeEventListener(STUDIO_PRESENTED_EVENT, onPresented);
    };
    window.addEventListener(STUDIO_PRESENTED_EVENT, onPresented);
    return () => window.removeEventListener(STUDIO_PRESENTED_EVENT, onPresented);
  }, []);
  const runStep = (step: BaselineStep, index: number): Promise<BaselineResult> => {
    const current = selection.current,
      label = `${step.kind} → ${step.value}`,
      act = baselineAction(step, current, catalog);
    if (!act) return Promise.resolve({ step: index, phase: step.phase, label, outcome: 'skipped', note: 'no product' });
    const target = reduceSelection(current, act, catalog);
    if (selectionEqual(target, current))
      return Promise.resolve({ step: index, phase: step.phase, label, outcome: 'skipped', note: 'already shown' });
    return new Promise(resolve => {
      const timings: Timing[] = [],
        start = performance.now();
      const finish = (r: Omit<BaselineResult, 'step' | 'phase' | 'label'>) => {
        clearTimeout(timer);
        window.removeEventListener(STUDIO_PRESENTED_EVENT, onPresented);
        window.removeEventListener(STUDIO_TIMING_EVENT, onTiming);
        window.removeEventListener(STUDIO_RENDER_ERROR_EVENT, onError);
        resolve({ step: index, phase: step.phase, label, ...r });
      };
      const onTiming = (e: Event) => timings.push((e as CustomEvent<Timing>).detail);
      const onPresented = (e: Event) => {
        const d = (e as CustomEvent<{ selection: StudioSelection; previewMs?: number; width: number }>).detail;
        if (!selectionEqual(d.selection, target)) return;
        const settled = timings.filter(t => t.quality === 'settled' && t.prepareMs !== undefined).at(-1) ??
          timings.filter(t => t.quality === 'settled').at(-1);
        finish({
          outcome: 'ok',
          ms: Math.round(performance.now() - start),
          previewMs: d.previewMs === undefined ? undefined : Math.round(d.previewMs),
          width: d.width,
          prepareMs: settled?.prepareMs === undefined ? undefined : Math.round(settled.prepareMs),
          renderMs: settled?.renderMs === undefined ? undefined : Math.round(settled.renderMs),
          mode: settled?.mode,
          cacheHit: settled?.cacheHit,
        });
      };
      const onError = (e: Event) =>
        finish({ outcome: 'error', ms: Math.round(performance.now() - start), note: (e as CustomEvent<{ message: string }>).detail.message });
      const timer = setTimeout(
        () => finish({ outcome: 'timeout', ms: STEP_TIMEOUT_MS, note: 'No sharp frame within 60 s (worker hang?)' }),
        STEP_TIMEOUT_MS,
      );
      window.addEventListener(STUDIO_PRESENTED_EVENT, onPresented);
      window.addEventListener(STUDIO_TIMING_EVENT, onTiming);
      window.addEventListener(STUDIO_RENDER_ERROR_EVENT, onError);
      mark(`baseline ${index + 1} ${label}`);
      action.current(act);
    });
  };
  const run = async (from: Stored) => {
    stop.current = false;
    setRunning(true);
    let s: Stored = { ...from, status: 'running', environment: environment() };
    commit(s);
    let phase = '';
    for (let i = s.next; i < s.steps.length; i++) {
      if (stop.current) break;
      const step = s.steps[i];
      if (step.phase !== phase) mark(`baseline phase ${(phase = step.phase)}`);
      // Persist "running at step i" before acting, so a reload names the step.
      s = { ...s, next: i };
      write(s);
      const result = await runStep(step, i);
      s = { ...s, next: i + 1, results: [...s.results, result] };
      commit(s);
      await new Promise(r => setTimeout(r, GAP_MS));
    }
    s = { ...s, status: stop.current ? 'interrupted' : 'done' };
    commit(s);
    mark('baseline done');
    setRunning(false);
  };
  const reset = () => {
    stop.current = true;
    commit({
      version: 1,
      status: 'idle',
      startScene: selection.current.sceneId,
      steps: buildBaselineSteps(catalog, selection.current.sceneId),
      next: 0,
      results: [],
      environment: environment(),
      pageLoads: state.pageLoads.slice(-1),
      offline: [],
    });
  };
  // Timed offline save: the pack download as the presenter would start it.
  const lastProgress = useRef(offline.progress);
  useEffect(() => {
    if (offline.progress) lastProgress.current = offline.progress;
  }, [offline.progress]);
  useEffect(() => {
    if (saveStart.current === null || offline.state === 'saving') return;
    const ms = Math.round(performance.now() - saveStart.current);
    saveStart.current = null;
    setState(s => {
      const next = {
        ...s,
        offline: [
          ...s.offline,
          {
            at: new Date().toISOString(),
            ms,
            outcome: offline.state === 'ready' || offline.ready ? 'ready' : offline.state,
            files: lastProgress.current?.done,
            bytes: lastProgress.current?.bytes,
            error: offline.error || undefined,
          },
        ],
      };
      write(next);
      return next;
    });
  }, [offline.state, offline.ready, offline.error]);
  const report = JSON.stringify(
    { ...state, steps: undefined, summary: summarizeBaseline(state.results) },
    null,
    1,
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied('Copied');
    } catch {
      setCopied('Select the text below and copy it');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Studio baseline', text: report });
    } catch {
      /* cancelled */
    }
  };
  const done = state.results.filter(r => r.phase !== 'reload').length;
  return (
    <div className="studio-baseline" data-status={state.status}>
      <button type="button" className="studio-baseline-toggle" onClick={() => setOpen(v => !v)}>
        Baseline · {state.status} · {done}/{state.steps.length} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="studio-baseline-body">
          <div className="studio-baseline-actions">
            {!running && state.status !== 'done' && (
              <button type="button" onClick={() => void run(state)}>
                {state.next ? 'Resume' : 'Run baseline'}
              </button>
            )}
            {running && (
              <button type="button" onClick={() => (stop.current = true)}>
                Stop
              </button>
            )}
            {!running && (
              <button type="button" onClick={reset}>
                Reset
              </button>
            )}
            {!running && offline.ready && offline.state !== 'saving' && (
              <button type="button" onClick={offline.remove}>
                Remove offline pack
              </button>
            )}
            {!running && (offline.state === 'online' || offline.state === 'error') && (
              <button
                type="button"
                onClick={() => {
                  saveStart.current = performance.now();
                  offline.save();
                }}
              >
                Timed offline save
              </button>
            )}
          </div>
          <p>
            Offline: {offline.state}
            {offline.progress ? ` ${offline.progress.done}/${offline.progress.total}` : ''}
            {state.offline.length ? ` · last ${state.offline.at(-1)!.outcome} in ${(state.offline.at(-1)!.ms / 1000).toFixed(1)} s` : ''}
          </p>
          <table>
            <thead>
              <tr>
                <th>Phase</th>
                <th>n</th>
                <th>fail</th>
                <th>median</th>
                <th>max</th>
              </tr>
            </thead>
            <tbody>
              {summarizeBaseline(state.results).map(p => (
                <tr key={p.phase}>
                  <td>{p.phase}</td>
                  <td>{p.steps}</td>
                  <td>{p.failed}</td>
                  <td>{p.medianMs ?? '–'}</td>
                  <td>{p.maxMs ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="studio-baseline-actions">
            <button type="button" onClick={() => void copy()}>
              Copy results
            </button>
            {'share' in navigator && (
              <button type="button" onClick={() => void share()}>
                Share results
              </button>
            )}
            {copied && <span>{copied}</span>}
          </div>
          <textarea readOnly value={report} rows={6} aria-label="Baseline results (JSON)" />
        </div>
      )}
    </div>
  );
}
