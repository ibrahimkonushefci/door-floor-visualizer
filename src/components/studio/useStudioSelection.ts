'use client';
import { useEffect, useState } from 'react';
import type { StudioSelection } from '@/lib/data/types';
import type { StudioAction, StudioCatalog } from '@/lib/studio/types';
import type { Messages } from '@/lib/i18n/messages';
import { QUERY_CHANGE_EVENT } from '@/lib/catalog/query';
import { parseStudioQuery, serializeStudioQuery } from '@/lib/studio/query';
import { isGlass, reduceSelection } from '@/lib/studio/state';
const readQuery = (catalog: StudioCatalog) =>
  parseStudioQuery(new URLSearchParams(window.location.search), catalog);
const announceQuery = () => window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));
// The URL is the source of truth for shared links: room changes push history,
// material changes replace it (debounced), and Back/Forward restore selections.
export function useStudioSelection(
  catalog: StudioCatalog,
  messages: Messages,
  notify: (text: string) => void,
) {
  const [initial] = useState(() => readQuery(catalog));
  const [requested, setRequested] = useState<StudioSelection>(initial.selection);
  useEffect(() => {
    if (initial.warnings.length) notify(messages['studio.normalized']);
  }, [initial, messages, notify]);
  useEffect(() => {
    const restore = () => {
      const parsed = readQuery(catalog);
      setRequested(parsed.selection);
      if (parsed.warnings.length) notify(messages['studio.normalized']);
    };
    window.addEventListener('popstate', restore);
    const timer = setTimeout(() => {
      history.replaceState(null, '', `?${serializeStudioQuery(requested)}`);
      announceQuery();
    }, 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', restore);
    };
  }, [catalog, messages, notify, requested]);
  const update = (action: StudioAction) => {
    const next = reduceSelection(requested, action, catalog);
    setRequested(next);
    if (action.type === 'scene') {
      history.pushState(null, '', `?${serializeStudioQuery(next)}`);
      announceQuery();
      if (next.doorProductId !== requested.doorProductId) notify(messages['studio.normalized']);
    }
    if (action.type === 'door' && isGlass(action.finishId, catalog) && !isGlass(requested.doorFinishId, catalog))
      notify(messages['studio.glassFrame']);
  };
  return { requested, update };
}
