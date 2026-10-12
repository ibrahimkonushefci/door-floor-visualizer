'use client';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { useInquiry } from '../inquiry/InquiryProvider';
import { Icon } from '../ui/Icon';
export function MobileContactBar({ locale, messages: m }: { locale: Locale; messages: Messages }) {
  const { open } = useInquiry();
  return (
    <nav className="mobile-contact-bar" aria-label={m['contact.quote']} lang={locale}>
      <button className="bar-side" aria-label={m['contact.call']} onClick={() => open('phone')}>
        <Icon name="phone" size={18} />
        <span>{m['contact.call']}</span>
      </button>
      <button
        className="btn btn-primary bar-primary"
        aria-label={`${m['contact.quote']} · WhatsApp`}
        onClick={() => open('whatsapp')}
      >
        <Icon name="whatsapp" size={18} />
        <span>{m['contact.quote']}</span>
      </button>
      <button className="bar-side" aria-label={m['contact.viber']} onClick={() => open('viber')}>
        <Icon name="viber" size={18} />
        <span>{m['contact.viber']}</span>
      </button>
    </nav>
  );
}
