'use client';
import dynamic from 'next/dynamic';
import type { StudioCatalog } from '@/lib/studio/types';
import type { Locale } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { ExportBrand } from '@/lib/studio/export-image';
// Browser-only: canvases, workers and file input. The server renders an empty frame.
const Client = dynamic(() => import('./PhotoStudio'), {
  ssr: false,
  loading: () => <section className="photo-studio" aria-busy="true" />,
});
export function PhotoStudioLoader(props: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
  brand: ExportBrand;
}) {
  return <Client {...props} />;
}
