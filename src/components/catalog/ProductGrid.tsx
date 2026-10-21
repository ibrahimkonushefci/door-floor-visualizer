import type { Locale } from '@/lib/data/types';
import type { ProductCardData } from '@/lib/media/types';
import { ProductCard } from './ProductCard';
export function ProductGrid({
  products,
  locale,
}: {
  products: readonly ProductCardData[];
  locale: Locale;
}) {
  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          locale={locale}
          eager={index < 4}
          priority={index === 0}
        />
      ))}
    </div>
  );
}
