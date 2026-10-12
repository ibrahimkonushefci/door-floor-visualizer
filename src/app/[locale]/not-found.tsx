'use client';
import { useParams } from 'next/navigation';
import { isLocale } from '@/lib/i18n/locales';
import { getMessages } from '@/lib/i18n/messages';
export default function NotFound() {
  const params = useParams();
  const locale =
    typeof params.locale === 'string' && isLocale(params.locale) ? params.locale : 'sq';
  const m = getMessages(locale);
  return (
    <section className="empty-state">
      <h1>{m['error.title']}</h1>
      <a className="btn btn-secondary" href={`/${locale}/`}>
        {m['error.back']}
      </a>
    </section>
  );
}
