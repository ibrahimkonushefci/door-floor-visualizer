'use client';
import { useState, type ReactNode } from 'react';
import type { Id, Locale } from '@/lib/data/types';
import type { HomeProduct } from '@/lib/catalog/home';
import type { Messages } from '@/lib/i18n/messages';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { Icon } from '../ui/Icon';
import { FavoriteButton } from './FavoriteButton';
import { useProductHref } from './useProductHref';

function ChapterHead({
  id,
  numeral,
  eyebrow,
  title,
  lead,
  action,
}: {
  id: string;
  numeral: string;
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  action?: ReactNode;
}) {
  return (
    <header className="chapter-head">
      <span className="chapter-numeral" aria-hidden="true">
        {numeral}
      </span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id} className="chapter-title">
          {title}
        </h2>
        {lead && <p className="chapter-lead">{lead}</p>}
      </div>
      {action}
    </header>
  );
}

function StudioLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="chapter-link" href={href}>
      <span className="live-dot is-small" aria-hidden="true" />
      {children}
    </a>
  );
}

// Door photos are wide shots with the door off-centre; these crops keep the door
// in a tall panel. Doors without an entry fall back to the photo's focal point.
const DOOR_CROP: Record<Id, number> = {
  'dera-bardhe': 42,
  'dera-lis': 45,
  'dera-xham': 7,
  'dera-kashmir': 30,
  'dera-antracit': 9,
};

/** 01 · 02 — every door side by side; the hovered one widens. */
export function DoorWall({
  doors,
  locale,
  messages: m,
  studioHref,
}: {
  doors: readonly HomeProduct[];
  locale: Locale;
  messages: Messages;
  studioHref: string | null;
}) {
  const productHref = useProductHref(locale);
  return (
    <section className="home-chapter" aria-labelledby="chapter-doors">
      <ChapterHead
        id="chapter-doors"
        numeral="01"
        eyebrow={`01 · 02 — ${m['category.interior-doors']} & ${m['category.hidden-doors']}`}
        title={
          <>
            {doors.length} {m['home.statDoors']}, <em>{m['home.doorsAccent']}</em>
          </>
        }
        action={studioHref && <StudioLink href={studioHref}>{m['home.doorsStudio']}</StudioLink>}
      />
      <div className="door-wall">
        {doors.map((d, i) => (
          <article key={d.id} className={`door-panel${i === 0 ? ' is-lead' : ''}`} data-product-id={d.id}>
            <a className="door-panel-photo" href={productHref(d.slug)} tabIndex={-1} aria-hidden="true">
              <ResponsiveImage
                image={d.image}
                sizes="(min-width: 1024px) 34vw, 70vw"
                position={`${DOOR_CROP[d.id] ?? d.image.focalPoint[0] * 100}% 50%`}
              />
            </a>
            <span className="card-badge door-panel-kind">{d.badge}</span>
            <FavoriteButton productId={d.id} productName={d.name} />
            <div className="door-panel-label">
              <h3 className="door-panel-name">
                <a href={productHref(d.slug)}>{d.name}</a>
              </h3>
              <div className="door-panel-more">
                <div>
                  <p className="card-meta">
                    {d.spec}
                    {d.origin && <> · {d.origin}</>}
                  </p>
                  {studioHref && (
                    <a className="door-panel-studio" href={`${studioHref}?door=${d.id}`}>
                      <span className="live-dot is-small" aria-hidden="true" />
                      {m['home.tryInStudio']}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** 03 — laminates hang as sample planks; the chosen one shows in a room beside them. */
export function SampleBoard({
  floors,
  locale,
  messages: m,
  studioHref,
}: {
  floors: readonly HomeProduct[];
  locale: Locale;
  messages: Messages;
  studioHref: string | null;
}) {
  const productHref = useProductHref(locale);
  const [selected, setSelected] = useState(0),
    // The first plank bobs until the visitor reaches for any sample.
    [touched, setTouched] = useState(false);
  const current = floors[Math.min(selected, floors.length - 1)];
  const pick = (i: number) => {
    setSelected(i);
    setTouched(true);
  };
  return (
    <section className="home-chapter" aria-labelledby="chapter-laminate">
      <ChapterHead
        id="chapter-laminate"
        numeral="03"
        eyebrow={`03 — ${m['category.laminate']} · ${floors.length} ${m[floors.length === 1 ? 'catalog.countSingular' : 'catalog.count']}`}
        title={
          <>
            {m['home.floorsTitle']} <em>{m['home.floorsAccent']}</em>
          </>
        }
        action={studioHref && <StudioLink href={studioHref}>{m['home.floorsStudio']}</StudioLink>}
      />
      <div className="sample-board">
        <div className={`sample-planks${touched ? ' is-touched' : ''}`}>
          {floors.map((f, i) => (
            <article key={f.id} className="sample-plank-card" data-product-id={f.id}>
              <button
                type="button"
                className="sample-plank"
                aria-pressed={f.id === current.id}
                aria-label={f.name}
                onClick={() => pick(i)}
                onMouseEnter={() => pick(i)}
              >
                <span className="sample-plank-face">
                  <ResponsiveImage image={f.detail ?? f.image} sizes="400px" />
                  <span className="sample-hole" aria-hidden="true" />
                </span>
                <span className="sample-plank-code">{f.code ?? f.name}</span>
              </button>
            </article>
          ))}
        </div>
        <div className="sample-inspector">
          <div className="sample-inspector-photo">
            <ResponsiveImage key={current.id} image={current.image} sizes="(min-width: 1024px) 40vw, 100vw" />
            <span className="card-badge sample-inspector-kind">{current.badge}</span>
            <FavoriteButton productId={current.id} productName={current.name} />
          </div>
          <div className="sample-inspector-head" aria-live="polite">
            <h3 className="sample-inspector-name">{current.name}</h3>
            {current.code && <span className="home-code">{current.code}</span>}
          </div>
          {current.facts.length > 0 && (
            <dl className="sample-facts">
              {current.facts.map(f => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="sample-actions">
            {studioHref && (
              <a className="btn btn-primary" href={`${studioHref}?floor=${current.id}`}>
                {m['home.tryInStudio']}
                <Icon name="arrow-right" size={16} />
              </a>
            )}
            <a className="btn btn-secondary" href={productHref(current.slug)}>
              {m['home.viewProduct']}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Where each finishing product appears in the casing photo (percent of width, height).
const DETAILS_PHOTO: Id = 'pervaze-mdf';
const DETAILS_SPOTS: Record<Id, [number, number]> = {
  'pervaze-mdf': [39.5, 42],
  'lajsne-mdf': [73, 84],
};
const FLOOR_SPOT: [number, number] = [50, 89];
const DETAILS_ROLE: Record<Id, 'home.partCasing' | 'home.partSkirting'> = {
  'pervaze-mdf': 'home.partCasing',
  'lajsne-mdf': 'home.partSkirting',
};

/** 04 · 05 — casing, skirting and parquet, pointed out in one real room photo. */
export function FinishingDetails({
  trims,
  parquet,
  photo,
  locale,
  messages: m,
}: {
  trims: readonly HomeProduct[];
  parquet: readonly HomeProduct[];
  photo: HomeProduct | null;
  locale: Locale;
  messages: Messages;
}) {
  const productHref = useProductHref(locale);
  const [active, setActive] = useState(0);
  const items = [
    ...trims.map(p => ({ product: p, spot: DETAILS_SPOTS[p.id], role: DETAILS_ROLE[p.id] ? m[DETAILS_ROLE[p.id]] : p.badge, floor: false })),
    ...parquet.map((p, i) => ({ product: p, spot: i === 0 ? FLOOR_SPOT : undefined, role: m['home.partFloor'], floor: true })),
  ];
  const current = items[Math.min(active, items.length - 1)];
  return (
    <section className="home-chapter" aria-labelledby="chapter-details">
      <ChapterHead
        id="chapter-details"
        numeral="04"
        eyebrow={`04 · 05 — ${m['category.parquet']}, ${m['category.trim']} · ${items.length} ${m[items.length === 1 ? 'catalog.countSingular' : 'catalog.count']}`}
        title={
          <>
            {m['home.detailsBefore']} <em>{m['home.detailsAccent']}</em> {m['home.detailsAfter']}
          </>
        }
        lead={photo ? m['home.detailsLead'] : undefined}
      />
      <div className={`details-layout${photo ? '' : ' is-list-only'}`}>
        {photo && (
          <div className="details-photo">
            <ResponsiveImage image={photo.image} sizes="(min-width: 1024px) 58vw, 100vw" />
            {items.map((it, i) =>
              it.spot ? (
                <button
                  type="button"
                  key={it.product.id}
                  className="details-spot"
                  style={{ left: `${it.spot[0]}%`, top: `${it.spot[1]}%` }}
                  aria-pressed={i === active}
                  aria-label={`${it.role}: ${it.product.name}`}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                >
                  {i + 1}
                </button>
              ) : null,
            )}
            {current?.spot && (
              <span
                className="details-callout"
                style={{ left: `${current.spot[0]}%`, top: `${current.spot[1]}%` }}
                aria-hidden="true"
              >
                <span className="details-callout-role">{current.role}</span>
                <span className="details-callout-name">{current.product.name}</span>
              </span>
            )}
          </div>
        )}
        <ol className="details-list">
          {items.map((it, i) => (
            <li
              key={it.product.id}
              className={`details-item${i === active ? ' is-active' : ''}`}
              data-product-id={it.product.id}
            >
              <span className="details-num" aria-hidden="true">
                {i + 1}
              </span>
              <span className="details-thumb">
                <ResponsiveImage image={it.product.detail ?? it.product.image} sizes="80px" />
              </span>
              <div className="details-text">
                <p className="eyebrow">{it.role}</p>
                <h3 className="details-name">
                  <a
                    href={productHref(it.product.slug)}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                  >
                    {it.product.name}
                  </a>
                </h3>
                <p className="card-meta">
                  {it.product.spec}
                  {it.floor && <> — {m['home.partFloorAlt']}</>}
                </p>
              </div>
              <FavoriteButton productId={it.product.id} productName={it.product.name} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export { DETAILS_PHOTO };
