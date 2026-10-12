import type { BrandConfig, Locale } from '@/lib/data/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { FooterContact } from './FooterContact';
export function Footer({
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
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <p className="footer-name">{brand.companyName}</p>
          <p>{localize(brand.tagline, locale)}</p>
          <p className="muted">{localize(brand.city, locale)}</p>
        </div>
        <nav className="footer-links" aria-label={m['footer.explore']}>
          <p className="eyebrow">{m['footer.explore']}</p>
          <a href={`/${locale}/`}>{m['catalog.title']}</a>
          {studioEnabled && <a href={`/${locale}/studio/`}>{m['nav.studio']}</a>}
          <a href={`/${locale}/?saved=1`}>{m['nav.saved']}</a>
        </nav>
        <div className="footer-links">
          <p className="eyebrow">{m['footer.contact']}</p>
          <FooterContact messages={m} />
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} {brand.companyName}
        </span>
        {brand.demoMode && <span>{m['footer.demo']}</span>}
      </div>
    </footer>
  );
}
