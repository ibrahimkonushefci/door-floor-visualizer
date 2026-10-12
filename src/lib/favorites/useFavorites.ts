'use client';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Id } from '../data/types';
import { createFavoritesStore, favoritesKey } from './store';
const FavoritesContext = createContext<ReturnType<typeof createFavoritesStore> | null>(null);
export function FavoritesProvider({
  brandId,
  validIds,
  children,
}: {
  brandId: Id;
  validIds: readonly Id[];
  children: ReactNode;
}) {
  const [store] = useState(() => createFavoritesStore(favoritesKey(brandId), new Set(validIds)));
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      /* Denied storage uses memory. */
    }
    store.hydrate(storage);
    const onStorage = (event: StorageEvent) => {
      if (event.key === favoritesKey(brandId) || event.key === null) store.refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [store, brandId]);
  return createElement(FavoritesContext.Provider, { value: store }, children);
}
export function useFavorites(): { ids: ReadonlySet<Id>; ready: boolean; toggle: (id: Id) => void } {
  const store = useContext(FavoritesContext);
  if (!store) throw new Error('Missing FavoritesProvider');
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { ...snapshot, toggle: store.toggle };
}
