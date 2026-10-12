'use client';
import type { OfflineState, OfflineProgress } from '@/lib/offline/messages';
import type { Messages } from '@/lib/i18n/messages';
import { useOffline } from './OfflineProvider';
import { OfflineStatus } from './OfflineStatus';
export function SaveStudioOffline({
  state,
  progress,
  onSave,
  onCancel,
  messages: m,
}: {
  state: OfflineState;
  progress: OfflineProgress | null;
  onSave: () => void;
  onCancel: () => void;
  messages: Messages;
}) {
  return (
    <>
      {state === 'saving' ? (
        <>
          <progress
            value={progress?.done || 0}
            max={progress?.total || 1}
            aria-label={m['offline.saving']}
          />
          <p>
            {progress?.done || 0} / {progress?.total || 0} ·{' '}
            {((progress?.bytes || 0) / 1048576).toFixed(1)} MiB
          </p>
          <button onClick={onCancel}>{m['offline.cancel']}</button>
        </>
      ) : (
        !['unsupported', 'ready', 'update-available', 'offline'].includes(state) && (
          <button onClick={onSave}>
            {m[state === 'error' ? 'offline.retry' : 'offline.save']}
          </button>
        )
      )}
    </>
  );
}
export function StudioOffline({ messages: m }: { messages: Messages }) {
  const o = useOffline();
  return (
    <aside
      className="offline-controls"
      aria-label={m['offline.label']}
      data-offline-state={o.state}
    >
      <OfflineStatus state={o.state} onUpdate={o.update} messages={m} />
      <SaveStudioOffline
        state={o.state}
        progress={o.progress}
        onSave={o.save}
        onCancel={o.cancel}
        messages={m}
      />
      {o.state === 'error' && (
        <p>{o.error === 'QuotaExceededError' ? m['offline.quota'] : m['offline.failure']}</p>
      )}
      {o.ready && o.state === 'offline' && <p>{m['offline.ready']}</p>}
      {(o.ready || o.state === 'error') && o.state !== 'saving' && (
        <button onClick={o.remove}>{m['offline.remove']}</button>
      )}
      <p className="product-note">{m['offline.note']}</p>
    </aside>
  );
}
