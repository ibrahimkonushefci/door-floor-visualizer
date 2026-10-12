import { describe, it, expect } from 'vitest';
import {
  createFavoritesStore,
  favoritesKey,
  readFavorites,
  toggleFavorite,
} from '../src/lib/favorites/store';
const known = new Set(['a', 'b']);
const key = favoritesKey('demo');
describe('favorites', () => {
  it('sorts, deduplicates and removes unknown IDs', () =>
    expect([...readFavorites({ getItem: () => '["b","a","b",3,"missing"]' }, key, known)]).toEqual([
      'a',
      'b',
    ]));
  it.each(['{bad', 'null', '{}', '"a"', 'x'.repeat(20001)])('ignores corrupt storage %s', raw =>
    expect(readFavorites({ getItem: () => raw }, key, known).size).toBe(0),
  );
  it('stays usable when storage is denied', () => {
    const store = createFavoritesStore(key, known);
    store.hydrate({
      getItem() {
        throw Error('denied');
      },
      setItem() {
        throw Error('quota');
      },
    });
    store.toggle('a');
    expect([...store.getSnapshot().ids]).toEqual(['a']);
    store.toggle('unknown');
    expect(store.getSnapshot().ids.size).toBe(1);
  });
  it('has stable empty SSR snapshot, hydrates and persists', () => {
    let raw = '["b"]';
    const store = createFavoritesStore(key, known);
    expect(store.getServerSnapshot().ready).toBe(false);
    store.hydrate({
      getItem: () => raw,
      setItem: (_, value) => {
        raw = value;
      },
    });
    store.toggle('a');
    expect(raw).toBe('["a","b"]');
    store.toggle('b');
    expect(raw).toBe('["a"]');
    expect(store.getServerSnapshot().ids.size).toBe(0);
  });
  it('refreshes cross-tab data and notifies subscribers', () => {
    let raw = '[]';
    const store = createFavoritesStore(key, known);
    let events = 0;
    store.subscribe(() => events++);
    store.hydrate({
      getItem: () => raw,
      setItem: (_, value) => {
        raw = value;
      },
    });
    raw = '["b"]';
    store.refresh();
    expect([...store.getSnapshot().ids]).toEqual(['b']);
    expect(events).toBe(2);
  });
  it('isolates brands and limits collections to 200', () => {
    expect(favoritesKey('one')).not.toBe(favoritesKey('two'));
    const ids = new Set(Array.from({ length: 200 }, (_, i) => String(i)));
    expect(toggleFavorite(ids, 'extra').size).toBe(200);
    expect(toggleFavorite(ids, '1').size).toBe(199);
  });
});
