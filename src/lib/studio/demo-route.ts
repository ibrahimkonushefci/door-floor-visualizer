import route from '../../../brand/demo-route.json';
import type { Locale, LocalizedText, StudioSelection } from '../data/types';
import type { StudioCatalog } from './types';
import { normalizeSelection } from './state';
import { serializeStudioQuery } from './query';
// The scripted sales demo (docs/pitch/DEMO_SCRIPT.md): fixed Studio
// combinations the presenter opens with one tap from the presenter tools.
// Brand data, so a rebrand replaces brand/demo-route.json with its own stops.
export interface DemoStop {
  id: string;
  label: LocalizedText;
  selection: StudioSelection;
}
export const DEMO_ROUTE = route.stops as DemoStop[];
// Not i18n's localize: that module bundles every message file into the shell.
export const demoStopLabel = (stop: DemoStop, locale: Locale) =>
  stop.label[locale]?.trim() || stop.label.sq;
export const demoStopHref = (locale: Locale, stop: DemoStop) =>
  `/${locale}/studio/?${serializeStudioQuery(stop.selection)}`;
const KEYS: (keyof StudioSelection)[] = [
  'version',
  'sceneId',
  'doorProductId',
  'doorModelId',
  'doorFinishId',
  'floorProductId',
  'frameMode',
  'skirtingMode',
  'floorRotationDeg',
];
// A stop the Studio would silently change (unknown room, product no longer in
// that room, finish the line lacks…) would show a different combination from
// the one the script describes, so every stop must normalise to itself.
export function checkDemoRoute(catalog: StudioCatalog, stops: DemoStop[] = DEMO_ROUTE) {
  const problems: string[] = [];
  if (!stops.length) problems.push('demo route: no stops');
  const ids = new Set<string>();
  for (const stop of stops) {
    if (ids.has(stop.id)) problems.push(`demo route: duplicate stop "${stop.id}"`);
    ids.add(stop.id);
    if (!stop.label.sq?.trim()) problems.push(`demo route: "${stop.id}" has no SQ label`);
    const { selection } = normalizeSelection(stop.selection, catalog);
    const changed = KEYS.filter(k => selection[k] !== stop.selection[k]);
    if (changed.length)
      problems.push(
        `demo route: "${stop.id}" is not a valid Studio combination (${changed
          .map(k => `${k}: ${String(stop.selection[k])} → ${String(selection[k])}`)
          .join(', ')})`,
      );
  }
  return problems;
}
