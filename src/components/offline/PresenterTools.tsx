'use client';
import { useEffect, useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { useOffline } from './OfflineProvider';
export const PRESENTER_EVENT = 'pd:presenter-open';
// Offline saving is a tool for the person presenting, not for customers: it
// lives in a sheet opened by pressing and holding the logo, or ?presenter=1.
export function PresenterTools({ messages: m }: { messages: Messages }) {
  const [open, setOpen] = useState(false);
  const o = useOffline();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(PRESENTER_EVENT, show);
    if (new URLSearchParams(window.location.search).get('presenter') === '1') show();
    return () => window.removeEventListener(PRESENTER_EVENT, show);
  }, []);
  const percent = o.progress?.total ? Math.round((o.progress.done / o.progress.total) * 100) : 0;
  return (
    <Dialog open={open} title={m['offline.label']} onClose={() => setOpen(false)}>
      <button
        className="dialog-close icon-btn icon-btn-plain"
        onClick={() => setOpen(false)}
        aria-label={m['common.close']}
      >
        <Icon name="close" />
      </button>
      <div className="presenter" data-offline-state={o.state}>
        <p className="presenter-status" role="status">
          {o.state === 'saving'
            ? `${m['offline.saving']} ${percent}%`
            : o.state === 'error'
              ? o.error === 'QuotaExceededError'
                ? m['offline.quota']
                : m['offline.failure']
              : o.ready && o.state !== 'update-available'
                ? m['offline.ready']
                : m[`offline.${o.state}`]}
        </p>
        {o.state === 'saving' && (
          <progress value={o.progress?.done || 0} max={o.progress?.total || 1} aria-label={m['offline.saving']} />
        )}
        <div className="dialog-actions">
          {o.state === 'saving' && (
            <button className="btn btn-secondary" onClick={o.cancel}>
              {m['offline.cancel']}
            </button>
          )}
          {o.state === 'update-available' && (
            <button className="btn btn-primary" onClick={o.update}>
              {m['offline.update']}
            </button>
          )}
          {(o.state === 'online' || o.state === 'error') && (
            <button className="btn btn-primary" onClick={o.save}>
              <Icon name="download" size={18} />
              {m[o.state === 'error' ? 'offline.retry' : 'offline.save']}
            </button>
          )}
          {o.ready && o.state !== 'saving' && (
            <button className="btn btn-secondary" onClick={o.remove}>
              {m['offline.remove']}
            </button>
          )}
        </div>
        <p className="presenter-note">{m['offline.note']}</p>
        <p className="presenter-note">{m['presenter.hint']}</p>
      </div>
    </Dialog>
  );
}
