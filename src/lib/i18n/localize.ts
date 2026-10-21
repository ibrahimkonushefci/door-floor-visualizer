import type { Locale, LocalizedText } from '../data/types';
// Kept apart from the dictionaries so browser code can localize data without
// bundling every language's messages.
export function localize(value: LocalizedText, locale: Locale): string {
  return value[locale]?.trim() || value.sq.trim();
}
