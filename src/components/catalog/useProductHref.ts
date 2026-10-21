'use client';
import { useSyncExternalStore } from 'react';
import { catalogReturnQuery, subscribeCatalogQuery } from '@/lib/catalog/query';
import type { Locale } from '@/lib/data/types';
/** Product links carry the current filter so the product page can lead back to it. */
export function useProductHref(locale: Locale) {
  const search = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.search,
    () => '',
  );
  const query = catalogReturnQuery(new URLSearchParams(search));
  return (slug: string) => `/${locale}/products/${slug}/${query}`;
}
