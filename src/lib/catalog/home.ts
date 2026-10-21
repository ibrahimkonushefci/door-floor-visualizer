import type { CategoryId, Id, MaterialsConfig, Product } from '../data/types';
import type { ImageManifest, ProductCardDataWithCategory, ResponsiveImageData } from '../media/types';
import { categoryForProduct } from './selectors';

type Category = Exclude<CategoryId, 'all'>;

/** The homepage reads as chapters: doors, laminate, then the finishing details. */
export const HOME_SECTION_ORDER: readonly Category[] = [
  'interior-doors',
  'hidden-doors',
  'laminate',
  'trim',
  'parquet',
];

export interface HomeProduct extends ProductCardDataWithCategory {
  /** The second photograph: a texture, close-up or detail of the same product. */
  detail: ResponsiveImageData | null;
  /** Manufacturer decor code shown on floor samples (e.g. D4955). */
  code: string | null;
  facts: readonly { label: string; value: string }[];
}

export interface HomeStudio {
  href: string;
  photoHref: string;
  rooms: readonly { name: string; image: string }[];
  counts: { rooms: number; doors: number; doorModels: number; finishes: number; floors: number };
}

/** Stable chapter order; products keep their display order inside a chapter. */
export function homeOrder<T extends { category: Category }>(items: readonly T[]): T[] {
  const rank = (c: Category) => HOME_SECTION_ORDER.indexOf(c);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.category) - rank(b.item.category) || a.index - b.index)
    .map(e => e.item);
}

/** The images the homepage hero shows first: one room render and every floor swatch. */
export function heroImages(
  products: readonly Product[],
  materials: MaterialsConfig,
  images: ImageManifest,
): { room: Id | null; textures: Id[] } {
  const floors = products
    .filter(p => p.published && categoryForProduct(p, materials) === 'laminate')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  return {
    room: floors[0]?.imageIds[0] ?? null,
    textures: floors.map(p => p.imageIds[1] ?? p.imageIds[0]).filter(id => !!images[id]),
  };
}
