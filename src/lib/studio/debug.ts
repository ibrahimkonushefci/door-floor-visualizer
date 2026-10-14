// Render timings and selection snapshots are written to the DOM only for
// diagnostics: add ?debug=1 to a Studio URL (read once, before the URL is rewritten).
export function readStudioDebug(search: string) {
  return new URLSearchParams(search).get('debug') === '1';
}
// ?debug=1&baseline=1 adds the device baseline runner (StudioBaseline): a scripted
// sequence of room, door-model and floor switches timed on the device itself.
export function readStudioBaseline(search: string) {
  const params = new URLSearchParams(search);
  return params.get('debug') === '1' && params.get('baseline') === '1';
}
/** Debug-only events (never dispatched without ?debug=1). */
export const STUDIO_PRESENTED_EVENT = 'pd:studio-presented';
export const STUDIO_TIMING_EVENT = 'pd:studio-timing';
export const STUDIO_RENDER_ERROR_EVENT = 'pd:studio-render-error';
