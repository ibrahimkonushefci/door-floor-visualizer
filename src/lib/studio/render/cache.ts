export function createByteLru<T>(maxBytes: number, dispose: (value: T) => void) {
  const map = new Map<string, { value: T; size: number }>();
  let total = 0;
  return {
    get(key: string) {
      const entry = map.get(key);
      if (entry) {
        map.delete(key);
        map.set(key, entry);
      }
      return entry?.value;
    },
    set(key: string, value: T, size: number) {
      const old = map.get(key);
      if (old) {
        total -= old.size;
        dispose(old.value);
        map.delete(key);
      }
      if (size > maxBytes) {
        dispose(value);
        return;
      }
      map.set(key, { value, size });
      total += size;
      while (total > maxBytes) {
        const [k, e] = map.entries().next().value!;
        map.delete(k);
        total -= e.size;
        dispose(e.value);
      }
    },
    clear() {
      for (const e of map.values()) dispose(e.value);
      map.clear();
      total = 0;
    },
    bytes: () => total,
  };
}
