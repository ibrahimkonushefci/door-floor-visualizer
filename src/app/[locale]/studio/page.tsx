import { notFound } from 'next/navigation';
import { loadSiteData } from '@/lib/data/load';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages, localize } from '@/lib/i18n/messages';
import { buildMetadata } from '@/lib/brand/metadata';
import { revisionStudioAssets } from '@/lib/studio/revisions';
import { StudioLoader } from '@/components/studio/StudioLoader';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return buildMetadata(
    loadSiteData().brand,
    locale,
    `/${locale}/studio/`,
    getMessages(locale)['nav.studio'],
  );
}
export default async function StudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData(),
    messages = getMessages(locale);
  return (
    <div className="studio-page">
      <h1 className="visually-hidden">{messages['nav.studio']}</h1>
      <StudioLoader
        locale={locale}
        messages={messages}
        brand={{
          name: data.brand.companyName,
          logo: data.brand.logo.src,
          notice: data.brand.demoMode ? localize(data.brand.demoNotice, locale) : null,
          siteUrl: data.brand.siteUrl,
        }}
        catalog={{
          products: data.products.products,
          materials: revisionStudioAssets(data.materials),
        }}
      />
    </div>
  );
}
