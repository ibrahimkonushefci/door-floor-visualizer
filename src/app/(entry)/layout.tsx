import type { ReactNode } from 'react';
import '../globals.css';
import { loadSiteData } from '@/lib/data/load';
import { buildMetadata } from '@/lib/brand/metadata';
import { buildThemeVars } from '@/lib/brand/theme';
export const metadata = buildMetadata(loadSiteData().brand, 'sq', '/');
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sq">
      <body style={buildThemeVars(loadSiteData().brand)}>{children}</body>
    </html>
  );
}
