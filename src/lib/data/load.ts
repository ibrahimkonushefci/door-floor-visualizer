// Server/build only: client islands receive only serializable inquiry data.
import brand from '../../../brand/brand.json';
import products from '../../../brand/products.json';
import materials from '../../../brand/materials.json';
import { validateSiteData } from './validate';
import type { SiteData } from './types';
export function loadSiteData(): SiteData {
  return validateSiteData({ brand, products, materials });
}
