'use client';
import type { Messages } from '@/lib/i18n/messages';
import { useInquiry } from '../inquiry/InquiryProvider';
export function FooterContact({ messages: m }: { messages: Messages }) {
  const { open } = useInquiry();
  return (
    <>
      <button type="button" onClick={() => open('phone')}>
        {m['contact.call']}
      </button>
      <button type="button" onClick={() => open('whatsapp')}>
        WhatsApp
      </button>
      <button type="button" onClick={() => open('viber')}>
        {m['contact.viber']}
      </button>
    </>
  );
}
