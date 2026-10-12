import { Fragment } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { ProductCardData } from '@/lib/media/types';
import { Icon } from '../ui/Icon';
import { ProductCard } from './ProductCard';
export interface StudioInvite {
  href: string;
  image: string;
}
const INVITE_AFTER = 6;
export function ProductGrid({
  products,
  locale,
  invite,
}: {
  products: readonly ProductCardData[];
  locale: Locale;
  invite?: StudioInvite & { messages: Messages };
}) {
  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <Fragment key={product.id}>
          <ProductCard product={product} locale={locale} eager={index < 4} priority={index === 0} />
          {invite && index === Math.min(INVITE_AFTER, products.length) - 1 && (
            <a className="studio-invite" href={invite.href}>
              <span className="studio-invite-text">
                <span className="eyebrow">{invite.messages['nav.studio']}</span>
                <span className="studio-invite-title">{invite.messages['studio.inviteTitle']}</span>
                <span className="studio-invite-body">{invite.messages['studio.inviteBody']}</span>
                <span className="studio-invite-action">
                  {invite.messages['studio.inviteAction']}
                  <Icon name="arrow-right" size={18} />
                </span>
              </span>
              <picture className="studio-invite-image">
                <img src={invite.image} alt="" width={960} height={720} loading="lazy" decoding="async" />
              </picture>
            </a>
          )}
        </Fragment>
      ))}
    </div>
  );
}
