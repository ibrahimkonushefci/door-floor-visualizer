import type { ReactNode } from 'react';
import type { BrandConfig, Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { GlobalOfflineStatus } from '../offline/OfflineStatus';
import { OfflineProvider } from '../offline/OfflineProvider';
import { Header } from './Header';
import { MobileContactBar } from './MobileContactBar';
export interface AppShellProps {
  brand: BrandConfig;
  locale: Locale;
  messages: Messages;
  children: ReactNode;
  studioEnabled: boolean;
}
export function AppShell({ brand, locale, messages, children, studioEnabled }: AppShellProps) {
  return (
    <OfflineProvider enabled={brand.offline.enabled}>
      <Header brand={brand} locale={locale} messages={messages} studioEnabled={studioEnabled} />
      <main id="main-content" className="content">
        {children}
      </main>
      <GlobalOfflineStatus messages={messages} />
      <MobileContactBar locale={locale} messages={messages} />
    </OfflineProvider>
  );
}
