import { describe, it, expect } from 'vitest';
import { loadSiteData } from '../src/lib/data/load';
import { reduceSelection } from '../src/lib/studio/state';
import { selectionEqual } from '../src/lib/studio/compatibility';
import {
  BASELINE_ROOM_SWITCHES,
  baselineAction,
  buildBaselineSteps,
  summarizeBaseline,
} from '../src/lib/studio/baseline';
const data = loadSiteData(),
  catalog = { products: data.products.products, materials: data.materials },
  scenes = catalog.materials.scenes;
describe('device baseline sequence', () => {
  const start = scenes[0].defaultSelection,
    steps = buildBaselineSteps(catalog, start.sceneId);
  it('opens every other room once, then makes the room switches', () => {
    const first = steps.filter(s => s.phase === 'first-open').map(s => s.value);
    expect(new Set([start.sceneId, ...first]).size).toBe(scenes.length);
    expect(steps.filter(s => s.phase === 'room-switch')).toHaveLength(BASELINE_ROOM_SWITCHES);
  });
  it('every step changes what is shown, as the panel would', () => {
    let s = start;
    const changed: string[] = [];
    for (const step of steps) {
      const action = baselineAction(step, s, catalog);
      expect(action, `${step.kind} ${step.value}`).not.toBeNull();
      const next = reduceSelection(s, action!, catalog);
      if (!selectionEqual(next, s)) changed.push(step.phase);
      s = next;
    }
    // Every room and floor step changes the frame; door-model steps too, except
    // where a model already shown is requested again.
    expect(changed.filter(p => p === 'room-switch')).toHaveLength(BASELINE_ROOM_SWITCHES);
    expect(changed.filter(p => p === 'door-model').length).toBeGreaterThanOrEqual(6);
    expect(changed.filter(p => p === 'floor').length).toBeGreaterThanOrEqual(7);
    expect(changed.filter(p => p === 'rotation')).toHaveLength(2);
    // The door-model steps really change the door model.
    const models = new Set<string>();
    let t = start;
    for (const step of steps) {
      t = reduceSelection(t, baselineAction(step, t, catalog)!, catalog);
      if (step.phase === 'door-model') models.add(t.doorModelId);
    }
    expect(models.size).toBe(4);
  });
  it('summarises per phase without counting failures as times', () => {
    const summary = summarizeBaseline([
      { step: 0, phase: 'floor', label: 'a', ms: 100, outcome: 'ok' },
      { step: 1, phase: 'floor', label: 'b', ms: 300, outcome: 'ok', mode: 'main' },
      { step: 2, phase: 'floor', label: 'c', ms: 60000, outcome: 'timeout' },
    ]);
    expect(summary).toEqual([
      { phase: 'floor', steps: 3, ok: 2, failed: 1, medianMs: 100, p90Ms: 300, maxMs: 300, mainThread: 1 },
    ]);
  });
});
