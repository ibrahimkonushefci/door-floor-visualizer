'use client';
import type { Messages } from '@/lib/i18n/messages';
import { useOffline } from './OfflineProvider';
// A quiet notice, only when it matters to whoever is holding the device.
export function OfflineNotice({ messages: m }: { messages: Messages }) {
  const o = useOffline();
  if (o.state !== 'offline' && o.state !== 'update-available') return null;
  return (
    <aside className="offline-notice" role="status">
      <span>{m[`offline.${o.state}`]}</span>
      {o.state === 'update-available' && (
        <button type="button" onClick={o.update}>
          {m['offline.update']}
        </button>
      )}
    </aside>
  );
}
