import type { StudioSelection } from '../data/types';
import type { StudioAction, StudioCatalog } from './types';
import { compatibleDoor } from './compatibility';
import { sceneModelIds } from './door-models';
// The device baseline (Phase 4 prerequisite): a fixed sequence of the switches a
// sales rep makes, timed on the device itself. Steps are resolved against the
// live selection when they run, exactly as the panel would build the action.
export type BaselinePhase = 'first-open' | 'room-switch' | 'setup' | 'door-model' | 'floor' | 'rotation';
export type BaselineStep =
  | { phase: BaselinePhase; kind: 'scene'; value: string }
  | { phase: BaselinePhase; kind: 'model'; value: string }
  | { phase: BaselinePhase; kind: 'floor'; value: string }
  | { phase: BaselinePhase; kind: 'rotate'; value: 0 | 90 };
export const BASELINE_ROOM_SWITCHES = 20;
/** The room with door models and the largest editable floor share (the heaviest switches). */
export const BASELINE_DETAIL_SCENE = 'kitchen-render-01';
export function buildBaselineSteps(catalog: StudioCatalog, startSceneId: string): BaselineStep[] {
  const scenes = catalog.materials.scenes,
    ids = scenes.map(s => s.id),
    steps: BaselineStep[] = [];
  // First open of every other room (the page load opened the starting room).
  const start = Math.max(0, ids.indexOf(startSceneId)),
    order = [...ids.slice(start + 1), ...ids.slice(0, start)];
  for (const id of order) steps.push({ phase: 'first-open', kind: 'scene', value: id });
  // Room switches continue the cycle from the last opened room.
  const last = order.length ? order[order.length - 1] : startSceneId;
  for (let i = 1; i <= BASELINE_ROOM_SWITCHES; i++)
    steps.push({ phase: 'room-switch', kind: 'scene', value: ids[(ids.indexOf(last) + i) % ids.length] });
  const detail = scenes.find(s => s.id === BASELINE_DETAIL_SCENE && s.doorModels?.length) ??
    scenes.find(s => (s.doorModels?.length ?? 0) > 1) ??
    scenes[0];
  steps.push({ phase: 'setup', kind: 'scene', value: detail.id });
  const models = sceneModelIds(detail),
    first = detail.defaultSelection.doorModelId,
    rotated = [...models.slice(models.indexOf(first) + 1), ...models.slice(0, models.indexOf(first) + 1)];
  for (let round = 0; round < 2; round++)
    for (const id of rotated) steps.push({ phase: 'door-model', kind: 'model', value: id });
  const floors = detail.allowedFloorProductIds,
    current = detail.defaultSelection.floorProductId,
    floorOrder = [...floors.filter(id => id !== current), current];
  for (const id of floorOrder) steps.push({ phase: 'floor', kind: 'floor', value: id });
  if (floors.length) {
    const rotation = detail.defaultSelection.floorRotationDeg;
    steps.push({ phase: 'rotation', kind: 'rotate', value: rotation === 0 ? 90 : 0 });
    steps.push({ phase: 'rotation', kind: 'rotate', value: rotation });
  }
  return steps;
}
/** The action the Studio panel would dispatch for this step from `s`; null if it cannot apply. */
export function baselineAction(step: BaselineStep, s: StudioSelection, c: StudioCatalog): StudioAction | null {
  if (step.kind === 'scene') return { type: 'scene', sceneId: step.value };
  if (step.kind === 'floor') return { type: 'floor', productId: step.value };
  if (step.kind === 'rotate') return { type: 'rotate', degrees: step.value };
  const scene = c.materials.scenes.find(v => v.id === s.sceneId)!;
  const doors = c.products.filter(p => p.kind === 'door' && compatibleDoor(p, scene, c));
  const product =
    doors.find(p => p.kind === 'door' && p.modelIds.includes(step.value) && p.finishIds.includes(s.doorFinishId)) ??
    doors.find(p => p.kind === 'door' && p.modelIds.includes(step.value));
  if (product?.kind !== 'door') return null;
  const finishId = product.finishIds.includes(s.doorFinishId) ? s.doorFinishId : product.defaultFinishId;
  return { type: 'door', productId: product.id, finishId, modelId: step.value };
}
export interface BaselineResult {
  step: number;
  phase: BaselinePhase | 'page-load' | 'reload';
  label: string;
  /** Action to sharp (settled) frame on screen. */
  ms?: number;
  previewMs?: number;
  width?: number;
  prepareMs?: number;
  renderMs?: number;
  mode?: string;
  cacheHit?: boolean;
  outcome: 'ok' | 'timeout' | 'error' | 'skipped' | 'reload';
  note?: string;
}
const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;
export function summarizeBaseline(results: readonly BaselineResult[]) {
  const phases = [...new Set(results.map(r => r.phase))];
  return phases.map(phase => {
    const rows = results.filter(r => r.phase === phase),
      times = rows.flatMap(r => (r.outcome === 'ok' && r.ms !== undefined ? [r.ms] : [])).sort((a, b) => a - b);
    return {
      phase,
      steps: rows.length,
      ok: rows.filter(r => r.outcome === 'ok').length,
      failed: rows.filter(r => r.outcome !== 'ok').length,
      medianMs: percentile(times, 50),
      p90Ms: percentile(times, 90),
      maxMs: times.length ? times[times.length - 1] : null,
      mainThread: rows.filter(r => r.mode === 'main').length,
    };
  });
}
