// Server/build only: client islands receive only serializable inquiry data.
import brand from '../../../brand/brand.json';
import products from '../../../brand/products.json';
import materials from '../../../brand/materials.json';
import { validateSiteData } from './validate';
import type { SiteData } from './types';
export const IMPLEMENTATION_PHASE: 1 | 2 | 3 | 4 | 5 = 5;
export function loadSiteData(phase: 1 | 2 | 3 | 4 | 5 = IMPLEMENTATION_PHASE): SiteData {
  return validateSiteData({ brand, products, materials }, phase);
}
