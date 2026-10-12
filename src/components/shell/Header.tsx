'use client';
import Image from 'next/image';
import { useSyncExternalStore } from 'react';
import { useFavorites } from '@/lib/favorites/useFavorites';
import { parseCatalogQuery, subscribeCatalogQuery, updateCatalogQuery } from '@/lib/catalog/query';
import { useInquiry } from '../inquiry/InquiryProvider';
import type { BrandConfig, Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { Icon } from '../ui/Icon';
import { InquiryButton } from '../inquiry/InquiryButton';
import { LanguageMenu } from './LanguageMenu';
export function Header({
  brand,
  locale,
  messages: m,
  studioEnabled,
}: {
  brand: BrandConfig;
  locale: Locale;
  messages: Messages;
  studioEnabled: boolean;
}) {
  const { ids, ready } = useFavorites();
  const { context } = useInquiry();
  const path = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.pathname,
    () => '',
  );
  const search = useSyncExternalStore(
    subscribeCatalogQuery,
    () => window.location.search,
    () => '',
  );
  const isStudio = path.includes('/studio/'),
    isCatalog = path === `/${locale}/`,
    query = parseCatalogQuery(new URLSearchParams(search)),
    savedLabel = `${m['nav.saved']}: ${ids.size}`;
  const savedContent = (
    <>
      <Icon name="heart" />
      {ids.size > 0 && (
        <span className="saved-count" aria-hidden="true">
          {ids.size}
        </span>
      )}
    </>
  );
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
          <span className="brand-name">{brand.shortName}</span>
        </a>
        <nav className="header-nav" aria-label={m['catalog.title']}>
          <a
            className="nav-link nav-catalog"
            href={`/${locale}/`}
            aria-current={isCatalog ? 'page' : undefined}
          >
            {m['catalog.title']}
          </a>
          {studioEnabled && (
            <a
              className="nav-link"
              href={`/${locale}/studio/`}
              aria-current={isStudio ? 'page' : undefined}
            >
              <Icon name="studio" size={18} />
              <span>{m['nav.studio']}</span>
            </a>
          )}
        </nav>
        <div className="header-tools">
          <LanguageMenu locale={locale} messages={m} />
          {isCatalog ? (
            <button
              className="header-icon saved-control"
              disabled={!ready}
              aria-pressed={query.savedOnly}
              aria-label={savedLabel}
              onClick={() => updateCatalogQuery({ ...query, savedOnly: !query.savedOnly })}
            >
              {savedContent}
            </button>
          ) : (
            <a className="header-icon saved-control" href={`/${locale}/?saved=1`} aria-label={savedLabel}>
              {savedContent}
            </a>
          )}
          <div className="desktop-contact">
            <InquiryButton context={context} label={m['contact.quote']} />
          </div>
        </div>
      </div>
    </header>
  );
}
