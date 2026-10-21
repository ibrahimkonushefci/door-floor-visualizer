'use client';
import { useEffect, useRef, useState } from 'react';
import type { HomeProduct, HomeStudio } from '@/lib/catalog/home';
import type { Messages } from '@/lib/i18n/messages';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { Icon } from '../ui/Icon';
const CYCLE_MS = 3200;
/** The closing invitation: how the Studio works, beside a small working-looking Studio. */
export function StudioFinale({
  studio,
  floors,
  messages: m,
}: {
  studio: HomeStudio;
  floors: readonly HomeProduct[];
  messages: Messages;
}) {
  const root = useRef<HTMLElement>(null);
  const [room, setRoom] = useState(0),
    [active, setActive] = useState(false);
  const { rooms, counts } = studio;
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {
      threshold: 0.25,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || rooms.length < 2) return;
    const timer = setTimeout(() => setRoom(r => (r + 1) % rooms.length), CYCLE_MS);
    return () => clearTimeout(timer);
  }, [active, room, rooms.length]);
  const fan = [rooms[1], rooms[2], rooms[rooms.length - 1]].filter(Boolean);
  const steps = [
    [m['home.step1'], `${counts.rooms} ${m['home.step1Body']}`],
    [m['home.step2'], `${counts.doorModels} ${m['home.models']} · ${counts.finishes} ${m['home.colours']}`],
    [m['home.step3'], `${counts.floors} ${m['home.statFloors']}, ${m['home.step3Body']}`],
    [m['home.step4'], m['home.step4Body']],
  ];
  return (
    <section className="home-finale" ref={root} aria-labelledby="home-finale-title">
      <div className="home-finale-inner">
        <div className="home-finale-copy">
          <p className="eyebrow home-live">
            <span className="live-dot" aria-hidden="true" />
            {m['nav.studio']}
          </p>
          <h2 id="home-finale-title" className="home-finale-title">
            {m['home.finaleTitle']} <em>{m['home.finaleAccent']}</em>
          </h2>
          <p className="home-finale-lead">{m['studio.inviteBody']}</p>
          <ol className="home-steps">
            {steps.map(([title, body], i) => (
              <li key={title}>
                <span className="home-step-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <strong>{title}</strong>
                  <span>{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="home-finale-actions">
            <a className="btn home-finale-cta" href={studio.href}>
              {m['studio.inviteAction']}
              <Icon name="arrow-right" size={18} />
            </a>
            <a className="btn home-finale-ghost" href={studio.photoHref}>
              <Icon name="camera" size={16} />
              {m['home.withPhoto']}
            </a>
          </div>
        </div>
        <a className="home-finale-stage" href={studio.href} tabIndex={-1} aria-hidden="true">
          {fan.map((r, i) => (
            <picture key={r.name} className={`finale-fan finale-fan-${i + 1}`}>
              <img src={r.image} alt="" width={960} height={720} loading="lazy" decoding="async" />
            </picture>
          ))}
          <span className="finale-window">
            <span className="finale-room">
              {rooms.map((r, i) => (
                <picture key={r.name} className={i === room ? 'is-on' : undefined}>
                  <img src={r.image} alt="" width={960} height={720} loading="lazy" decoding="async" />
                </picture>
              ))}
            </span>
            <span className="finale-panel">
              <span className="finale-panel-label">
                {m['studio.room']} · {rooms[room].name}
              </span>
              <span className="finale-mini-rooms">
                {rooms.slice(0, 6).map((r, i) => (
                  <picture key={r.name} className={i === room ? 'is-on' : undefined}>
                    <img src={r.image} alt="" width={960} height={720} loading="lazy" decoding="async" />
                  </picture>
                ))}
              </span>
              <span className="finale-mini-tabs">
                <span>{m['studio.door']}</span>
                <span>{m['studio.floor']}</span>
              </span>
              <span className="finale-mini-swatches">
                {floors.slice(0, 8).map(f => (
                  <span key={f.id}>
                    <ResponsiveImage image={{ ...(f.detail ?? f.image), alt: '' }} sizes="24px" />
                  </span>
                ))}
              </span>
              <span className="finale-mini-cta">{m['studio.inquiry']}</span>
            </span>
          </span>
          <span className="finale-chip">
            <span className="live-dot is-small" />
            {rooms[room].name}
          </span>
        </a>
      </div>
    </section>
  );
}
