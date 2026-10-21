'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type {
  ContactAction,
  ContactChannel,
  InquiryContext,
  InquiryData,
} from '@/lib/inquiry/types';
import { buildInquiryMessage, buildInquiryUrl } from '@/lib/inquiry/message';
import { resolveContactAction } from '@/lib/inquiry/links';
import { FavoritesProvider } from '@/lib/favorites/useFavorites';
import { InquiryDialog } from './InquiryDialog';
interface ContextValue {
  context: InquiryContext;
  setContext: (context: InquiryContext) => void;
  open: (channel: ContactChannel, context?: InquiryContext) => void;
  data: InquiryData;
  locale: Locale;
  messages: Messages;
  channel: ContactChannel;
}
const Inquiry = createContext<ContextValue | null>(null);
export function useInquiry() {
  const value = useContext(Inquiry);
  if (!value) throw new Error('Missing InquiryProvider');
  return value;
}
export function InquiryProvider({
  data,
  locale,
  messages,
  children,
}: {
  data: InquiryData;
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const [channel, setChannel] = useState<ContactChannel>('whatsapp');
  const [context, setContext] = useState<InquiryContext>({ kind: 'catalog', productIds: [] });
  const [action, setAction] = useState<ContactAction | null>(null);
  function open(channel: ContactChannel, override?: InquiryContext) {
    setChannel(channel);
    const url = new URL(window.location.href);
    if (data.brand.siteUrl) {
      url.protocol = 'https:';
      url.host = new URL(data.brand.siteUrl).host;
    }
    const selected = override || context;
    const canonical = buildInquiryUrl(selected, data, locale, url.href);
    const message = buildInquiryMessage(selected, data, locale, canonical, messages);
    const result = resolveContactAction(channel, data.brand, message, canonical);
    if (result.kind === 'preview') setAction(result);
    else if (channel === 'viber') setAction(result);
    else window.open(result.href, '_blank', 'noopener,noreferrer');
  }
  return (
    <FavoritesProvider
      brandId={data.brand.id}
      validIds={data.products.filter(p => p.published).map(p => p.id)}
    >
      <Inquiry.Provider
        value={{ context, setContext, open, data, locale, messages, channel }}
      >
        {children}
        <InquiryDialog action={action} onClose={() => setAction(null)} />
      </Inquiry.Provider>
    </FavoritesProvider>
  );
}
