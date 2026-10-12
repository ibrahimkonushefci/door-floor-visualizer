'use client';
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { useFavorites } from '@/lib/favorites/useFavorites';
import { parseCatalogQuery, subscribeCatalogQuery, updateCatalogQuery } from '@/lib/catalog/query';
import { useInquiry } from '../inquiry/InquiryProvider';
import type { BrandConfig, Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { localize } from '@/lib/i18n/messages';
import { Icon } from '../ui/Icon';
import { InquiryButton } from '../inquiry/InquiryButton';
import { LanguageMenu } from './LanguageMenu';
import { DemoBadge } from './DemoBadge';
export function Header({
  brand,
  locale,
  messages,
  studioEnabled,
}: {
  brand: BrandConfig;
  locale: Locale;
  messages: Messages;
  studioEnabled: boolean;
}) {
  const { ids, ready } = useFavorites();
  const { context } = useInquiry();
  const isStudio = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.pathname.includes('/studio/'),
    () => false,
  );
  const search = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.search,
    () => '',
  );
  const query = parseCatalogQuery(new URLSearchParams(search));
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand-link" href={`/${locale}/`} aria-label={brand.companyName}>
          <Image
            src={brand.logo.src}
            width={brand.logo.width}
            height={brand.logo.height}
            alt=""
            className="brand-logo"
          />
          <span className="brand-name" title={localize(brand.logo.alt, locale)}>
            {brand.shortName}
          </span>
        </a>
        {brand.demoMode && <DemoBadge label={messages['demo.badge']} />}
        <div className="header-controls">
          {studioEnabled ? (
            <a className="studio-control" href={`/${locale}/studio/`}>
              {messages['nav.studio']}
            </a>
          ) : (
            <button
              className="studio-control"
              disabled
              aria-label={`${messages['nav.studio']} · ${messages['nav.unavailable']}`}
              title={messages['nav.unavailable']}
            >
              {messages['nav.studio']}
            </button>
          )}
          <LanguageMenu locale={locale} messages={messages} />
          {isStudio ? (
            <a
              className="icon-button saved-control"
              href={`/${locale}/?saved=1`}
              aria-label={`${messages['nav.saved']}: ${ids.size}`}
            >
              <Icon name="heart" />
              <span>{ids.size}</span>
            </a>
          ) : (
            <button
              className="icon-button saved-control"
              disabled={!ready}
              aria-pressed={query.savedOnly}
              aria-label={`${messages['nav.saved']}: ${ids.size}`}
              onClick={() => updateCatalogQuery({ ...query, savedOnly: !query.savedOnly })}
            >
              <Icon name="heart" />
              <span>{ids.size}</span>
            </button>
          )}
          <div className="desktop-contact">
            <InquiryButton context={context} label={messages['contact.quote']} />
          </div>
        </div>
      </div>
    </header>
  );
}
