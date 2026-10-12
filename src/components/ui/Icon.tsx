export type IconName =
  | 'phone'
  | 'whatsapp'
  | 'viber'
  | 'heart'
  | 'studio'
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'copy'
  | 'reset'
  | 'compare'
  | 'expand'
  | 'download'
  | 'check'
  | 'arrow-left'
  | 'arrow-right'
  | 'grid'
  | 'planks-lengthwise'
  | 'planks-crosswise';
const paths: Record<IconName, string> = {
  phone: 'M6 3H3v4c0 8 6 14 14 14h4v-5l-5-2-2 3c-3-1-6-4-7-7l3-2-2-5Z',
  whatsapp: 'M21 11.5a9 9 0 0 1-13 8L3 21l1.5-5A9 9 0 1 1 21 11.5ZM8 7c0 5 3 8 8 9',
  viber:
    'M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7c0 5 3 8 8 9M13 6c3 0 5 2 5 5',
  heart: 'M12 20.5 3.8 12.4a4.9 4.9 0 0 1 8.2-5.3 4.9 4.9 0 0 1 8.2 5.3Z',
  studio: 'M5 21V3h11v18M2.5 21h19M12.5 12.5h1M19 9v12',
  close: 'm6 6 12 12M6 18 18 6',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-right': 'm9 6 6 6-6 6',
  copy: 'M8 8h12v13H8ZM4 16H3V3h13v1',
  reset: 'M4 4v6h6M5.1 15a8 8 0 1 0 1.8-8.3L4 10',
  compare: 'M12 2v20M4 5h16v14H4Z',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  download: 'M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4',
  check: 'm4 12 5 5L20 6',
  'arrow-left': 'M20 12H4m6-6-6 6 6 6',
  'arrow-right': 'M4 12h16m-6-6 6 6-6 6',
  grid: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z',
  'planks-lengthwise': 'M4 3h16v18H4ZM9.3 3v18M14.7 3v18M4 10h5.3M9.3 15h5.4M14.7 7h5.3',
  'planks-crosswise': 'M3 4h18v16H3ZM3 9.3h18M3 14.7h18M10 4v5.3M15 9.3v5.4M7 14.7V20',
};
export function Icon({
  name,
  size = 20,
  decorative = true,
}: {
  name: IconName;
  size?: number;
  decorative?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
    >
      <path d={paths[name]} />
    </svg>
  );
}
