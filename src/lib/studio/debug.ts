// Render timings and selection snapshots are written to the DOM only for
// diagnostics: add ?debug=1 to a Studio URL (read once, before the URL is rewritten).
export function readStudioDebug(search: string) {
  return new URLSearchParams(search).get('debug') === '1';
}
