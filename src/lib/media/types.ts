import type { CategoryId, Id, ImageRef, LocalAssetPath, Vec2 } from '../data/types';
export interface ImageVariant {
  src: LocalAssetPath;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}
export interface ResponsiveImageData {
  id: Id;
  alt: string;
  width: number;
  height: number;
  focalPoint: Vec2;
  role: ImageRef['role'];
  avif: readonly ImageVariant[];
  webp: readonly ImageVariant[];
  fallback: ImageVariant;
}
export type ImageManifest = Record<Id, Omit<ResponsiveImageData, 'alt'>>;
export interface ProductCardData {
  id: Id;
  slug: Id;
  name: string;
  badge: string;
  spec: string;
  origin: string | null;
  demo: boolean;
  image: ResponsiveImageData;
}
export type ProductCardDataWithCategory = ProductCardData & {
  category: Exclude<CategoryId, 'all'>;
};
export interface AssetSource {
  id: Id;
  localPath: string;
  sourceUrl: string | null;
  author: string;
  usageBasis: 'owned' | 'licensed' | 'generated' | 'private-pitch-only';
  licenseNote: string;
  depictsProductId: Id | null;
  isIllustrative: boolean;
  sha256: string;
}
export interface AssetManifest {
  schemaVersion: 1;
  images: readonly {
    id: Id;
    source: string;
    sourceSha256: string;
    width: number;
    height: number;
    derivatives: readonly ImageVariant[];
  }[];
}
