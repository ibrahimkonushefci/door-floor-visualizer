import type {
  Id,
  StudioSelection,
  BrandConfig,
  Product,
  MaterialsConfig,
  LocalizedText,
} from '../data/types';
export type InquiryContext =
  | { kind: 'catalog'; productIds: readonly Id[] }
  | { kind: 'product'; productId: Id; sizeId?: Id; finishId?: Id }
  | { kind: 'studio'; selection: StudioSelection };
export interface InquiryData {
  brand: BrandConfig;
  products: readonly Product[];
  materials: Pick<MaterialsConfig, 'doorFinishes' | 'floorCollections'>;
  scenes: readonly { id: Id; name: LocalizedText }[];
}
export type ContactChannel = 'phone' | 'whatsapp' | 'viber';
export type ContactAction =
  | { kind: 'preview'; title: string; message: string; copyText: string }
  | { kind: 'external'; href: string; fullMessage: string; copyRequired: boolean };
