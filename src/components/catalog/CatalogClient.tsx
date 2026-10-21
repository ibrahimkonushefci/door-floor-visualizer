'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { HomeProduct, HomeStudio } from '@/lib/catalog/home';
import {
  mergeCatalogQuery,
  parseCatalogQuery,
  subscribeCatalogQuery,
  updateCatalogQuery,
} from '@/lib/catalog/query';
import { useFavorites } from '@/lib/favorites/useFavorites';
import { useInquiry } from '../inquiry/InquiryProvider';
import { CategoryPills } from './CategoryPills';
import { ProductGrid } from './ProductGrid';
import { HomeHero } from './HomeHero';
import { DETAILS_PHOTO, DoorWall, FinishingDetails, SampleBoard } from './HomeChapters';
import { StudioFinale } from './StudioFinale';
import { EmptyState } from '../ui/EmptyState';
const readSearch = () => window.location.search;
const serverSearch = () => '';
export function CatalogClient({
  products,
  locale,
  messages: m,
  tagline,
  studio,
}: {
  products: readonly HomeProduct[];
  locale: Locale;
  messages: Messages;
  tagline: string;
  studio: HomeStudio | null;
}) {
  const search = useSyncExternalStore(subscribeCatalogQuery, readSearch, serverSearch);
  const query = parseCatalogQuery(new URLSearchParams(search));
  const { ids, ready } = useFavorites();
  const { setContext } = useInquiry();
  useEffect(() => {
    const params = new URLSearchParams(search);
    const normalized = mergeCatalogQuery(params, parseCatalogQuery(params));
    if (normalized.toString() !== params.toString())
      updateCatalogQuery(parseCatalogQuery(params), 'replace');
  }, [search]);
  useEffect(() => {
    setContext({
      kind: 'catalog',
      productIds: [...ids].filter(id => products.some(p => p.id === id)).sort(),
    });
    return () => setContext({ kind: 'catalog', productIds: [] });
  }, [ids, products, setContext]);
  const waiting = query.savedOnly && !ready;
  const filtered = products.filter(
    p =>
      (query.category === 'all' || p.category === query.category) &&
      (!query.savedOnly || ids.has(p.id)),
  );
  const laminates = products.filter(p => p.category === 'laminate');
  const shown = (category: HomeProduct['category']) => filtered.filter(p => p.category === category);
  const doors = [...shown('interior-doors'), ...shown('hidden-doors')],
    floors = shown('laminate'),
    trims = shown('trim'),
    parquet = shown('parquet');
  return (
    <section className="catalog" aria-labelledby={studio && laminates.length ? 'home-title' : 'catalog-title'}>
      {studio && laminates.length ? (
        <HomeHero floors={laminates} studio={studio} messages={m} />
      ) : (
        <header className="catalog-intro">
          <h1 id="catalog-title">{m['catalog.title']}</h1>
          <p className="catalog-lead">{tagline}</p>
        </header>
      )}
      {/* The category bar stays pinned only while the catalog itself is on screen. */}
      <div className="home-catalog">
        <div className="home-bar">
          {studio && laminates.length > 0 && <p className="home-bar-title">{m['catalog.title']}</p>}
          <CategoryPills
            value={query.category}
            onChange={category => updateCatalogQuery({ ...query, category })}
            messages={m}
            count={
              <span className="catalog-count" aria-live="polite">
                {waiting ? '…' : filtered.length}{' '}
                {m[filtered.length === 1 ? 'catalog.countSingular' : 'catalog.count']}
              </span>
            }
          />
        </div>
        {waiting ? (
          <p role="status" className="catalog-pending">
            {m['common.loading']}
          </p>
        ) : !filtered.length ? (
          <EmptyState
            title={query.savedOnly && ids.size === 0 ? m['catalog.noSaved'] : m['catalog.noResults']}
            actionLabel={m['common.clear']}
            onAction={() => updateCatalogQuery({ category: 'all', savedOnly: false })}
          />
        ) : query.savedOnly ? (
          // Saved products: a plain grid, so a short list reads at a glance.
          <ProductGrid products={filtered} locale={locale} />
        ) : (
          <div className="home-chapters">
            {doors.length > 0 && (
              <DoorWall doors={doors} locale={locale} messages={m} studioHref={studio?.href ?? null} />
            )}
            {floors.length > 0 && (
              <SampleBoard floors={floors} locale={locale} messages={m} studioHref={studio?.href ?? null} />
            )}
            {trims.length + parquet.length > 0 && (
              <FinishingDetails
                trims={trims}
                parquet={parquet}
                photo={products.find(p => p.id === DETAILS_PHOTO) ?? null}
                locale={locale}
                messages={m}
              />
            )}
          </div>
        )}
      </div>
      {studio && !query.savedOnly && <StudioFinale studio={studio} floors={laminates} messages={m} />}
    </section>
  );
}
