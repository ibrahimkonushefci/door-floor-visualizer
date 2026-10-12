'use client';
import { useSyncExternalStore } from 'react';
import { catalogReturnQuery, subscribeCatalogQuery } from '@/lib/catalog/query';
import type { Locale } from '@/lib/data/types';
import type { ProductCardData } from '@/lib/media/types';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { FavoriteButton } from './FavoriteButton';
export function ProductCard({
  product,
  locale,
  eager,
  priority = false,
}: {
  product: ProductCardData;
  locale: Locale;
  eager: boolean;
  priority?: boolean;
}) {
  const search = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.search,
    () => '',
  );
  const href = `/${locale}/products/${product.slug}/${catalogReturnQuery(new URLSearchParams(search))}`;
  return (
    <article className="product-card" data-product-id={product.id}>
      <div className="card-image">
        <a className="card-photo-link" href={href} tabIndex={-1} aria-hidden="true">
          <ResponsiveImage
            image={product.image}
            sizes="(min-width:1200px) 300px, (min-width:768px) 33vw, 50vw"
            eager={eager}
            priority={priority}
            fit={
              product.image.role === 'product' && product.image.height > product.image.width
                ? 'contain'
                : 'cover'
            }
          />
        </a>
        <span className="card-badge">{product.badge}</span>
        <FavoriteButton productId={product.id} productName={product.name} />
      </div>
      <h2 className="card-title">
        <a href={href}>{product.name}</a>
      </h2>
      <p className="card-meta">
        {product.spec}
        {product.origin && <> · {product.origin}</>}
      </p>
    </article>
  );
}
