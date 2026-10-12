'use client';
import { useSyncExternalStore } from 'react';
import { catalogReturnQuery, subscribeCatalogQuery } from '@/lib/catalog/query';
import type { Locale } from '@/lib/data/types';
import type { ProductCardData } from '@/lib/media/types';
import { getMessages } from '@/lib/i18n/messages';
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
  const m = getMessages(locale);
  const search = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.search,
    () => '',
  );
  const href = `/${locale}/products/${product.slug}/${catalogReturnQuery(new URLSearchParams(search))}`;
  return (
    <article className="product-card" data-product-id={product.id}>
      <div className="card-image">
        <a className="card-photo-link" href={href} aria-label={product.name}>
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
      <div className="card-meta">
        <h2>
          <a href={href}>{product.name}</a>
        </h2>
        <p className="card-spec">{product.spec}</p>
        <p
          className="card-origin"
          title={`${m['catalog.originDemo']}: ${product.origin || '—'} · ${m['catalog.illustrative']}`}
        >
          {product.origin && <span>{product.origin} · </span>}
          {product.demo && <span>{m['demo.badge']}</span>}
        </p>
      </div>
    </article>
  );
}
