'use client';
import type { ContactChannel, InquiryContext } from '@/lib/inquiry/types';
import { useInquiry } from './InquiryProvider';
export function InquiryButton({
  context,
  channel = 'whatsapp',
  label,
  variant = 'primary',
}: {
  context: InquiryContext;
  channel?: ContactChannel;
  label: string;
  variant?: 'primary' | 'secondary';
}) {
  const { open } = useInquiry();
  return (
    <button className={`btn btn-${variant}`} onClick={() => open(channel, context)}>
      {label}
    </button>
  );
}
