import { notFound } from 'next/navigation';
import { loadSiteData } from '@/lib/data/load';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages, localize } from '@/lib/i18n/messages';
import { buildMetadata } from '@/lib/brand/metadata';
import { revisionStudioAssets } from '@/lib/studio/revisions';
import { PhotoStudioLoader } from '@/components/studio/photo/PhotoStudioLoader';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return buildMetadata(loadSiteData().brand, locale, `/${locale}/studio/photo/`, getMessages(locale)['photo.title']);
}
export default async function PhotoStudioPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData(),
    messages = getMessages(locale);
  return (
    <div className="studio-page photo-page">
      <h1 className="visually-hidden">{messages['photo.title']}</h1>
      <PhotoStudioLoader
        locale={locale}
        messages={messages}
        brand={{
          name: data.brand.companyName,
          logo: data.brand.logo.src,
          notice: data.brand.demoMode ? localize(data.brand.demoNotice, locale) : null,
        }}
        catalog={{
          products: data.products.products,
          materials: revisionStudioAssets(data.materials),
        }}
      />
    </div>
  );
}
