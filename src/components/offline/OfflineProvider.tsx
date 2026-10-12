'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { registerOfflineWorker, requestStudioCache, workerRequest } from '@/lib/offline/register';
import type { OfflineState, OfflineProgress } from '@/lib/offline/messages';
interface OfflineContextValue {
  state: OfflineState;
  progress: OfflineProgress | null;
  error: string;
  save: () => void;
  cancel: () => void;
  remove: () => void;
  update: () => void;
  ready: boolean;
}
const Context = createContext<OfflineContextValue>({
  state: 'unsupported',
  progress: null,
  error: '',
  save: () => {},
  cancel: () => {},
  remove: () => {},
  update: () => {},
  ready: false,
});
export const useOffline = () => useContext(Context);
export function OfflineProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [state, setState] = useState<OfflineState>('unsupported'),
    [progress, setProgress] = useState<OfflineProgress | null>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null),
    controller = useRef<AbortController | null>(null),
    reload = useRef(false),
    waiting = useRef(false),
    readyRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const cleanup: Array<() => void> = [];
    const connection = () =>
      setState(
        waiting.current
          ? 'update-available'
          : navigator.onLine
            ? readyRef.current
              ? 'ready'
              : 'online'
            : 'offline',
      );
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    cleanup.push(() => {
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    });
    const onController = () => {
      if (reload.current) {
        reload.current = false;
        location.reload();
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onController);
      cleanup.push(() =>
        navigator.serviceWorker.removeEventListener('controllerchange', onController),
      );
    }
    void (async () => {
      try {
        const reg = await registerOfflineWorker();
        if (disposed || !reg) return;
        registration.current = reg;
        const active = await navigator.serviceWorker.ready;
        if (disposed) return;
        const available = () => {
          if (reg.waiting) {
            waiting.current = true;
            setState('update-available');
          }
        };
        available();
        const installing = () => {
          const worker = reg.installing;
          if (worker) {
            const changed = () => {
              if (worker.state === 'installed') available();
            };
            worker.addEventListener('statechange', changed);
            cleanup.push(() => worker.removeEventListener('statechange', changed));
          }
        };
        reg.addEventListener('updatefound', installing);
        cleanup.push(() => reg.removeEventListener('updatefound', installing));
        installing();
        const pageBuild = document
          .querySelector('meta[name="porta-build"]')
          ?.getAttribute('content');
        if (disposed) return;
        if (pageBuild)
          navigator.serviceWorker.controller?.postMessage({
            type: 'CLIENT_BUILD',
            buildId: pageBuild,
          });
        const status = await workerRequest(active, { type: 'STATUS' });
        if (disposed) return;
        readyRef.current = !!status.ready;
        setReady(!!status.ready);
        setState(
          waiting.current
            ? 'update-available'
            : navigator.onLine
              ? status.ready
                ? 'ready'
                : 'online'
              : 'offline',
        );
        const check = () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', check);
        cleanup.push(() => document.removeEventListener('visibilitychange', check));
        void reg.update().catch(() => {});
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : String(e));
          setState('error');
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup.forEach(fn => fn());
    };
    // Re-registering after status changes would race downloads and update handshakes.
  }, [enabled]);
  const save = useCallback(() => {
    const reg = registration.current;
    if (!reg || waiting.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setError('');
    setState('saving');
    void requestStudioCache(reg, setProgress, abort.signal)
      .then(() => {
        readyRef.current = true;
        setReady(true);
        setState(waiting.current ? 'update-available' : 'ready');
      })
      .catch(async e => {
        if (e.name === 'AbortError') {
          const status = await workerRequest(reg, { type: 'STATUS' });
          readyRef.current = !!status.ready;
          setReady(!!status.ready);
          setState(
            waiting.current
              ? 'update-available'
              : status.ready
                ? 'ready'
                : navigator.onLine
                  ? 'online'
                  : 'offline',
          );
        } else {
          setError(e.name === 'QuotaExceededError' ? 'QuotaExceededError' : e.message);
          setState('error');
        }
      })
      .finally(() => {
        controller.current = null;
        setProgress(null);
      });
  }, []);
  const remove = () => {
    const reg = registration.current;
    if (reg)
      void workerRequest(reg, { type: 'REMOVE_STUDIO' })
        .then(() => {
          readyRef.current = false;
          setReady(false);
          setError('');
          setState(waiting.current ? 'update-available' : navigator.onLine ? 'online' : 'offline');
        })
        .catch(e => {
          setError(e.message);
          setState('error');
        });
  };
  const update = () => {
    const worker = registration.current?.waiting;
    if (!worker) return;
    controller.current?.abort();
    reload.current = true;
    worker.postMessage({ type: 'ACTIVATE' });
  };
  return (
    <Context.Provider
      value={{
        state,
        progress,
        error,
        save,
        cancel: () => controller.current?.abort(),
        remove,
        update,
        ready,
      }}
    >
      {children}
    </Context.Provider>
  );
}
