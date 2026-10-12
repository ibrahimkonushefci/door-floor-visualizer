import { readFileSync } from 'node:fs';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages } from '@/lib/i18n/messages';
import { loadSiteData } from '@/lib/data/load';
import { categoryForProduct, selectProducts, toProductCard } from '@/lib/catalog/selectors';
import type { ImageManifest } from '@/lib/media/types';
import { CatalogClient } from '@/components/catalog/CatalogClient';
export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData();
  const images: ImageManifest = JSON.parse(
    readFileSync('verification/image-manifest.json', 'utf8'),
  );
  const products = selectProducts(
    data.products.products,
    data.materials,
    { category: 'all', savedOnly: false },
    new Set(),
  ).map(product => ({
    ...toProductCard(product, data, locale, images),
    category: categoryForProduct(product, data.materials),
  }));
  return <CatalogClient products={products} locale={locale} messages={getMessages(locale)} />;
}
