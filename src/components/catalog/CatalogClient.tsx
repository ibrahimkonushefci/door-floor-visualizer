'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { ProductCardDataWithCategory } from '@/lib/media/types';
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
import { EmptyState } from '../ui/EmptyState';
const readSearch = () => window.location.search;
const serverSearch = () => '';
export function CatalogClient({
  products,
  locale,
  messages: m,
}: {
  products: readonly ProductCardDataWithCategory[];
  locale: Locale;
  messages: Messages;
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
  return (
    <section aria-labelledby="catalog-title">
      <CategoryPills
        value={query.category}
        onChange={category => updateCatalogQuery({ ...query, category })}
        messages={m}
      />
      <div className="catalog-label">
        <h1 id="catalog-title">{m['catalog.title']}</h1>
        <span className="catalog-count" aria-live="polite">
          {waiting ? '…' : filtered.length}{' '}
          {m[filtered.length === 1 ? 'catalog.countSingular' : 'catalog.count']}
        </span>
        <span className="catalog-attribution">{m['catalog.illustrative']}</span>
      </div>
      {waiting ? (
        <p role="status" className="catalog-pending">
          {m['common.loading']}
        </p>
      ) : filtered.length ? (
        <ProductGrid products={filtered} locale={locale} />
      ) : (
        <EmptyState
          title={query.savedOnly && ids.size === 0 ? m['catalog.noSaved'] : m['catalog.noResults']}
          actionLabel={m['common.clear']}
          onAction={() => updateCatalogQuery({ category: 'all', savedOnly: false })}
        />
      )}
    </section>
  );
}
