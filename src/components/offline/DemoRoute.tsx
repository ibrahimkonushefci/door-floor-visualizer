'use client';
import type { MouseEvent } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { DEMO_ROUTE, demoStopHref, demoStopLabel } from '@/lib/studio/demo-route';
// The scripted demo's stops (brand/demo-route.json, docs/pitch/DEMO_SCRIPT.md).
// Loaded only when the presenter sheet opens, so customers never download it.
export default function DemoRoute({
  messages: m,
  locale,
  onOpen,
}: {
  messages: Messages;
  locale: Locale;
  onOpen: () => void;
}) {
  // On the Studio page a stop switches the selection in place (the Studio
  // restores selections on popstate), so a prepared room is not reloaded.
  const openStop = (e: MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname.replace(/\/?$/, '/') !== `/${locale}/studio/`) return;
    e.preventDefault();
    history.pushState(null, '', e.currentTarget.href);
    window.dispatchEvent(new PopStateEvent('popstate'));
    onOpen();
  };
  if (!DEMO_ROUTE.length) return null;
  return (
    <section className="presenter-route" aria-labelledby="presenter-route-title">
      <h3 id="presenter-route-title">{m['presenter.demo']}</h3>
      <p className="presenter-note">{m['presenter.demoHint']}</p>
      <ol>
        {DEMO_ROUTE.map(stop => (
          <li key={stop.id}>
            <a href={demoStopHref(locale, stop)} onClick={openStop} data-demo-stop={stop.id}>
              {demoStopLabel(stop, locale)}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
