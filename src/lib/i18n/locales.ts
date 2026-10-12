import type { Locale } from '../data/types';
export const locales = ['sq', 'en', 'de'] as const;
export function isLocale(value: string): value is Locale {
  return locales.some(l => l === value);
}
export const allowedQueryKeys = [
  'category',
  'saved',
  'size',
  'finish',
  'v',
  'scene',
  'door',
  'floor',
  'frame',
  'skirting',
  'rot',
] as const;
export function allowedQuery(params: URLSearchParams): string {
  const output = new URLSearchParams();
  if (params.toString().length > 2048) return '';
  for (const key of allowedQueryKeys) {
    const v = params.get(key);
    if (v !== null) output.set(key, v);
  }
  const text = output.toString();
  return text ? '?' + text : '';
}
export function localeHref(pathname: string, params: URLSearchParams, locale: Locale): string {
  const suffix = pathname.replace(/^\/(sq|en|de)(?=\/|$)/, '');
  return `/${locale}${suffix === '/' ? '' : suffix}/`.replace(/\/+$/, '/') + allowedQuery(params);
}
