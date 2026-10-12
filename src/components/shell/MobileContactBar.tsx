'use client';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { useInquiry } from '../inquiry/InquiryProvider';
import { Icon } from '../ui/Icon';
export function MobileContactBar({ locale, messages }: { locale: Locale; messages: Messages }) {
  const { open } = useInquiry();
  return (
    <nav className="mobile-contact-bar" aria-label={messages['contact.quote']} lang={locale}>
      <button
        className="bar-side"
        aria-label={messages['contact.call']}
        onClick={() => open('phone')}
      >
        <Icon name="phone" />
        <span>{messages['contact.call']}</span>
      </button>
      <button
        className="primary-button"
        aria-label={`${messages['contact.quote']} · WhatsApp`}
        onClick={() => open('whatsapp')}
      >
        <Icon name="whatsapp" />
        <span>{messages['contact.quote']}</span>
      </button>
      <button
        className="bar-side"
        aria-label={messages['contact.viber']}
        onClick={() => open('viber')}
      >
        <Icon name="viber" />
        <span>{messages['contact.viber']}</span>
      </button>
    </nav>
  );
}
