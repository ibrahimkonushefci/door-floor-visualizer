'use client';
import { useInquiry } from '@/components/inquiry/InquiryProvider';
// Reads the page's own messages from the layout's provider instead of importing
// the dictionaries, which would ship every language to every page.
export default function NotFound() {
  const { locale, messages: m } = useInquiry();
  return (
    <section className="empty-state">
      <h1>{m['error.title']}</h1>
      <a className="btn btn-secondary" href={`/${locale}/`}>
        {m['error.back']}
      </a>
    </section>
  );
}
