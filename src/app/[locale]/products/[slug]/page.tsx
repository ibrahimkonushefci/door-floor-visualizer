import { readFileSync } from 'node:fs';
import { notFound } from 'next/navigation';
import { loadSiteData } from '@/lib/data/load';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages, localize } from '@/lib/i18n/messages';
import { buildMetadata } from '@/lib/brand/metadata';
import { buildSpecRows, relatedProducts, toProductCard } from '@/lib/catalog/selectors';
import type { ImageManifest } from '@/lib/media/types';
import { ProductGallery } from '@/components/product/ProductGallery';
import { ProductSpecs } from '@/components/product/ProductSpecs';
import {
  ProductVariants,
  ProductInquiry,
  CatalogBackLink,
} from '@/components/product/ProductVariants';
import { RelatedProducts } from '@/components/product/RelatedProducts';
import { FavoriteButton } from '@/components/catalog/FavoriteButton';
export const dynamicParams = false;
export function generateStaticParams() {
  return loadSiteData()
    .products.products.filter(p => p.published)
    .map(p => ({ slug: p.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData();
  const product = data.products.products.find(p => p.published && p.slug === slug);
  if (!product) notFound();
  return buildMetadata(
    data.brand,
    locale,
    `/${locale}/products/${slug}/`,
    localize(product.name, locale),
    localize(product.summary, locale),
  );
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData();
  const product = data.products.products.find(p => p.published && p.slug === slug);
  if (!product) notFound();
  const m = getMessages(locale);
  const manifest: ImageManifest = JSON.parse(
    readFileSync('verification/image-manifest.json', 'utf8'),
  );
  const name = localize(product.name, locale),
    card = toProductCard(product, data, locale, manifest);
  const images = product.imageIds.map(id => ({
    ...manifest[id],
    alt: localize(data.products.images.find(i => i.id === id)!.alt, locale),
  }));
  return (
    <article className="product-detail" data-detail-id={product.id}>
      <CatalogBackLink locale={locale} label={m['error.back']} />
      <header className="product-heading">
        <div>
          <p className="eyebrow">{card.badge}</p>
          <h1>{name}</h1>
          <p className="product-sku">{product.sku}</p>
        </div>
        <div className="detail-favorite">
          <FavoriteButton productId={product.id} productName={name} />
        </div>
      </header>
      <ProductGallery images={images} productName={name}>
        <section className="product-info" aria-label={m['product.details']}>
          <p className="product-summary">{localize(product.summary, locale)}</p>
          {product.kind === 'door' ? (
            <ProductVariants
              product={product}
              finishes={data.materials.doorFinishes}
              locale={locale}
            />
          ) : (
            <ProductInquiry productId={product.id} />
          )}
          <p className="product-note">{m['product.colors']}</p>
          <ProductSpecs
            rows={buildSpecRows(product, data.materials, locale)}
            caption={m['product.specs']}
          />
        </section>
      </ProductGallery>
      <RelatedProducts
        products={relatedProducts(product, data).map(p => toProductCard(p, data, locale, manifest))}
        locale={locale}
        title={m['product.related']}
      />
    </article>
  );
}
