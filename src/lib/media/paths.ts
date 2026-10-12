import type { LocalAssetPath } from '../data/types';
export function withAssetRevision(path: LocalAssetPath, sha256: string): LocalAssetPath {
  if (
    !/^\/(media|brand)\//.test(path) ||
    path.includes('\\') ||
    path.includes('#') ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    throw new Error('Invalid local asset or revision');
  const [pathname, query = ''] = path.split('?');
  const decoded = decodeURIComponent(pathname);
  if (
    decoded.split('/').some(segment => segment === '..' || segment === '.') ||
    decoded.includes('%') ||
    decoded.includes('\0') ||
    decoded.includes('\\')
  )
    throw new Error('Unsafe asset path');
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => key !== 'rev')) throw new Error('Unknown asset query key');
  params.set('rev', sha256);
  return `${pathname}?${params}`;
}
export function derivativeWidths(sourceWidth: number): readonly number[] {
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0) throw new Error('Invalid source width');
  return [
    ...new Set(
      [320, 640, 960, 1600].map(width => Math.min(width, sourceWidth)).concat(sourceWidth),
    ),
  ].sort((a, b) => a - b);
}
