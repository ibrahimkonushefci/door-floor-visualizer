import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import '@/styles/index.css';
import { loadSiteData } from '@/lib/data/load';
import { isLocale, locales } from '@/lib/i18n/locales';
import { getMessages } from '@/lib/i18n/messages';
import { buildThemeVars } from '@/lib/brand/theme';
import { buildMetadata } from '@/lib/brand/metadata';
import { AppShell } from '@/components/shell/AppShell';
import { InquiryProvider } from '@/components/inquiry/InquiryProvider';
export const dynamicParams = false;
export function generateStaticParams() {
  return locales.map(locale => ({ locale }));
}
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return buildMetadata(loadSiteData().brand, locale, `/${locale}/`);
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const data = loadSiteData();
  const messages = getMessages(locale);
  const inquiryData = {
    brand: data.brand,
    products: data.products.products,
    materials: {
      doorFinishes: data.materials.doorFinishes,
      floorCollections: data.materials.floorCollections,
    },
    scenes: data.materials.scenes.map(({ id, name }) => ({ id, name })),
  };
  return (
    <html lang={locale}>
      <body style={buildThemeVars(data.brand)}>
        <InquiryProvider data={inquiryData} locale={locale} messages={messages}>
          <AppShell
            brand={data.brand}
            locale={locale}
            messages={messages}
            studioEnabled={data.materials.scenes.length > 0}
          >
            {children}
          </AppShell>
        </InquiryProvider>
      </body>
    </html>
  );
}
