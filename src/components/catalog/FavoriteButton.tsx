'use client';
import type { Id } from '@/lib/data/types';
import { useFavorites } from '@/lib/favorites/useFavorites';
import { useInquiry } from '../inquiry/InquiryProvider';
import { Icon } from '../ui/Icon';
export function FavoriteButton({ productId, productName }: { productId: Id; productName: string }) {
  const { ids, ready, toggle } = useFavorites();
  const { messages: m } = useInquiry();
  const saved = ids.has(productId);
  return (
    <button
      className="favorite-button icon-button"
      disabled={!ready}
      aria-pressed={saved}
      aria-label={`${m[saved ? 'catalog.removeSaved' : 'catalog.addSaved']}: ${productName}`}
      onClick={() => toggle(productId)}
    >
      <Icon name="heart" />
    </button>
  );
}
