import { readFileSync } from 'node:fs';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages, localize } from '@/lib/i18n/messages';
import { formatOrigin } from '@/lib/i18n/format';
import { revisionStudioAssets } from '@/lib/studio/revisions';
import { loadSiteData } from '@/lib/data/load';
import { categoryForProduct, selectProducts, toProductCard } from '@/lib/catalog/selectors';
import type { HomeProduct, HomeStudio } from '@/lib/catalog/home';
import type { ImageManifest } from '@/lib/media/types';
import { CatalogClient } from '@/components/catalog/CatalogClient';
export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData();
  const m = getMessages(locale);
  const images: ImageManifest = JSON.parse(
    readFileSync('verification/image-manifest.json', 'utf8'),
  );
  const published = selectProducts(
    data.products.products,
    data.materials,
    { category: 'all', savedOnly: false },
    new Set(),
  );
  const products: HomeProduct[] = published.map(product => {
    const detailId = product.imageIds[1];
    const detailDefinition = data.products.images.find(i => i.id === detailId);
    const facts: { label: string; value: string }[] = [];
    let code: string | null = null;
    if (product.kind === 'floor') {
      const c = data.materials.floorCollections.find(c => c.id === product.collectionId)!;
      code = c.decor?.code ?? null;
      facts.push({ label: m['spec.thickness'], value: `${c.thicknessMm} mm` });
      facts.push(
        c.kind === 'laminate'
          ? { label: m['spec.ac'], value: c.acClass }
          : { label: m['spec.wood'], value: localize(c.woodSpecies, locale) },
      );
      const origin = formatOrigin(product.originCountry, locale);
      if (origin) facts.push({ label: m['spec.origin'], value: origin });
    }
    return {
      ...toProductCard(product, data, locale, images),
      category: categoryForProduct(product, data.materials),
      detail:
        detailId && detailDefinition && images[detailId]
          ? { ...images[detailId], alt: localize(detailDefinition.alt, locale) }
          : null,
      code,
      facts,
    };
  });
  const scenes = revisionStudioAssets(data.materials).scenes;
  const studio: HomeStudio | null = scenes.length
    ? {
        href: `/${locale}/studio/`,
        photoHref: `/${locale}/studio/photo/`,
        rooms: scenes.map(s => ({ name: localize(s.name, locale), image: s.fallback })),
        counts: {
          rooms: scenes.length,
          doors: published.filter(p => p.kind === 'door').length,
          doorModels: data.materials.doorModels.length,
          finishes: data.materials.doorFinishes.length,
          floors: published.filter(p => p.kind === 'floor').length,
        },
      }
    : null;
  return (
    <CatalogClient
      products={products}
      locale={locale}
      messages={m}
      tagline={localize(data.brand.tagline, locale)}
      studio={studio}
    />
  );
}
