'use client';
import type { ContactChannel, InquiryContext } from '@/lib/inquiry/types';
import { useInquiry } from './InquiryProvider';
export function InquiryButton({
  context,
  channel = 'whatsapp',
  label,
}: {
  context: InquiryContext;
  channel?: ContactChannel;
  label: string;
}) {
  const { open } = useInquiry();
  return (
    <button className="primary-button" onClick={() => open(channel, context)}>
      {label}
    </button>
  );
}
