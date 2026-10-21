'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HomeProduct, HomeStudio } from '@/lib/catalog/home';
import type { Messages } from '@/lib/i18n/messages';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { Icon } from '../ui/Icon';
const CYCLE_MS = 2800;
// The hero is a small Studio: pick a floor and the room photo changes. It plays
// through the floors by itself while visible, until the visitor picks one.
export function HomeHero({
  floors,
  studio,
  messages: m,
}: {
  floors: readonly HomeProduct[];
  studio: HomeStudio;
  messages: Messages;
}) {
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0),
    [touched, setTouched] = useState(false),
    [active, setActive] = useState(false),
    // Rooms mount the first time they are needed, one ahead, so a crossfade never waits.
    [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const count = floors.length,
    current = floors[index],
    playing = active && !touched && count > 1;
  const show = (i: number) => {
    setIndex(i);
    setSeen(s => (s.has(i) && s.has((i + 1) % count) ? s : new Set([...s, i, (i + 1) % count])));
  };
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let inView = false;
    const update = () => setActive(inView && document.visibilityState === 'visible');
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % count;
      setIndex(next);
      setSeen(s => (s.has((next + 1) % count) ? s : new Set([...s, (next + 1) % count])));
    }, CYCLE_MS);
    return () => clearTimeout(timer);
  }, [playing, index, count]);
  const texture = (f: HomeProduct) => ({ ...(f.detail ?? f.image), alt: '' });
  return (
    <section className="home-hero" ref={root} aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="eyebrow home-live">
          <span className="live-dot" aria-hidden="true" />
          {m['home.heroEyebrow']}
        </p>
        <h1 id="home-title" className="home-hero-title">
          {m['home.heroTitle']} <em>{m['home.heroAccent']}</em>
        </h1>
        <div className="home-swatches" role="group" aria-label={m['home.floorChoices']}>
          {floors.map((f, i) => (
            <button
              type="button"
              key={f.id}
              className="home-swatch"
              aria-pressed={i === index}
              aria-label={f.name}
              title={f.name}
              onClick={() => {
                setTouched(true);
                show(i);
              }}
            >
              <span className="home-swatch-chip">
                <ResponsiveImage image={texture(f)} sizes="52px" eager />
              </span>
              {f.code && <span className="home-swatch-code">{f.code.replace(/^D/, '')}</span>}
            </button>
          ))}
        </div>
        <div className="home-track" aria-hidden="true">
          <span
            key={index}
            className={playing ? 'is-running' : touched ? 'is-done' : undefined}
            style={{ '--cycle': `${CYCLE_MS}ms` } as CSSProperties}
          />
        </div>
        <div aria-live={touched ? 'polite' : 'off'}>
          <p className="home-current">
            <span className="home-current-name">{current.name}</span>
            {current.code && <span className="home-code">{current.code}</span>}
          </p>
          <p className="home-current-meta">
            {current.spec}
            {current.origin && <> · {current.origin}</>}
          </p>
        </div>
        <div className="home-hero-actions">
          <a className="btn btn-primary home-cta" href={`${studio.href}?floor=${current.id}`}>
            {m['home.heroCta']}
            <Icon name="arrow-right" size={18} />
          </a>
          <a className="home-more" href={`${studio.photoHref}?floor=${current.id}`}>
            <Icon name="camera" size={16} />
            {m['photo.entry']}
          </a>
        </div>
        <dl className="home-stats">
          <div>
            <dt>{studio.counts.rooms}</dt>
            <dd>{m['home.statRooms']}</dd>
          </div>
          <div>
            <dt>{studio.counts.doors}</dt>
            <dd>{m['home.statDoors']}</dd>
          </div>
          <div>
            <dt>{studio.counts.floors}</dt>
            <dd>{m['home.statFloors']}</dd>
          </div>
        </dl>
      </div>
      <div className="home-room">
        <div className="home-room-frames">
          {floors.map((f, i) =>
            seen.has(i) ? (
              <div key={f.id} className={`home-room-frame${i === index ? ' is-on' : ''}`} aria-hidden={i !== index}>
                <ResponsiveImage
                  image={f.image}
                  sizes="(min-width: 1024px) 54vw, 100vw"
                  eager={i === 0}
                  priority={i === 0}
                />
              </div>
            ) : null,
          )}
        </div>
        <p className="home-room-tag">
          <span className="home-room-chip">
            <ResponsiveImage image={texture(current)} sizes="32px" eager />
          </span>
          <span>
            <span className="eyebrow">{m['home.onFloor']}</span>
            <span className="home-room-name">{current.name}</span>
          </span>
        </p>
      </div>
    </section>
  );
}
