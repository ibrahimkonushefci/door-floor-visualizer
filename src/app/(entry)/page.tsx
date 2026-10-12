'use client';
import { useEffect } from 'react';
import { allowedQuery } from '@/lib/i18n/locales';
import { getMessages } from '@/lib/i18n/messages';
export default function EntryPage() {
  useEffect(() => {
    window.location.replace('/sq/' + allowedQuery(new URLSearchParams(window.location.search)));
  }, []);
  return (
    <main className="entry-page">
      <a href="/sq/">{getMessages('sq')['error.back']}</a>
    </main>
  );
}
