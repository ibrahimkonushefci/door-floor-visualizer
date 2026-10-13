import type { CategoryId, Id, Locale, MaterialsConfig, Product, SiteData } from '../data/types';
import { localize, getMessages } from '../i18n/messages';
import { formatDoorSize, formatOrigin } from '../i18n/format';
import type { CatalogQuery } from './query';
import type { ImageManifest, ProductCardData } from '../media/types';
export function categoryForProduct(
  product: Product,
  materials: MaterialsConfig,
): Exclude<CategoryId, 'all'> {
  if (product.kind === 'trim') return 'trim';
  if (product.kind === 'door')
    return product.doorType === 'hidden' ? 'hidden-doors' : 'interior-doors';
  const collection = materials.floorCollections.find(c => c.id === product.collectionId);
  if (!collection) throw new Error(`Missing collection for ${product.id}`);
  return collection.kind;
}
export function selectProducts(
  products: readonly Product[],
  materials: MaterialsConfig,
  query: CatalogQuery,
  favoriteIds: ReadonlySet<Id>,
): readonly Product[] {
  return products
    .filter(
      p =>
        p.published &&
        (query.category === 'all' || categoryForProduct(p, materials) === query.category) &&
        (!query.savedOnly || favoriteIds.has(p.id)),
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
}
export function toProductCard(
  product: Product,
  data: SiteData,
  locale: Locale,
  images: ImageManifest,
): ProductCardData {
  const m = getMessages(locale);
  const imageId = product.imageIds[0];
  const definition = data.products.images.find(i => i.id === imageId);
  const image = images[imageId];
  if (!definition || !image)
    throw new Error(`Missing cover for ${product.id}; run pnpm assets:images`);
  let badge: string;
  let spec: string;
  if (product.kind === 'door') {
    badge = m[product.doorType === 'hidden' ? 'catalog.badgeHidden' : 'catalog.badgeDoor'];
    const size = product.sizes.find(s => s.id === product.defaultSizeId);
    if (!size) throw new Error('Invalid default size');
    spec = formatDoorSize(size, locale);
  } else if (product.kind === 'floor') {
    const c = data.materials.floorCollections.find(c => c.id === product.collectionId);
    if (!c) throw new Error('Invalid collection');
    badge = m[c.kind === 'laminate' ? 'catalog.badgeLaminate' : 'catalog.badgeParquet'];
    spec =
      c.kind === 'laminate'
        ? `${c.thicknessMm} mm · ${c.acClass} · ${c.bevel.toUpperCase()}`
        : `${c.thicknessMm} mm · ${localize(c.woodSpecies, locale)}`;
  } else {
    badge = m['catalog.badgeTrim'];
    spec = `${product.dimensionsMm.height} × ${product.dimensionsMm.depth} mm`;
  }
  return {
    id: product.id,
    slug: product.slug,
    name: localize(product.name, locale),
    badge,
    spec,
    origin: formatOrigin(product.originCountry, locale),
    demo: product.evidence.status === 'demo',
    image: { ...image, alt: localize(definition.alt, locale) },
  };
}
export function relatedProducts(product: Product, data: SiteData): readonly Product[] {
  const candidates = data.products.products.filter(p => p.published && p.id !== product.id);
  const category = categoryForProduct(product, data.materials);
  const rank = (p: Product) =>
    categoryForProduct(p, data.materials) === category ? 0 : p.kind === product.kind ? 1 : 2;
  const ordered = [
    ...product.relatedProductIds
      .map(id => candidates.find(p => p.id === id))
      .filter((p): p is Product => !!p),
    ...candidates.sort((a, b) => rank(a) - rank(b) || a.displayOrder - b.displayOrder),
  ];
  return ordered.filter((p, i) => ordered.findIndex(v => v.id === p.id) === i).slice(0, 4);
}
export function buildSpecRows(
  product: Product,
  materials: MaterialsConfig,
  locale: Locale,
): readonly { label: string; value: string }[] {
  const m = getMessages(locale);
  const rows: { label: string; value: string }[] = [];
  const add = (key: keyof typeof m, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim())
      rows.push({ label: m[key], value: String(value) });
  };
  add('spec.sku', product.sku);
  if (product.kind === 'door') {
    add('spec.type', m[`value.${product.doorType}`]);
    add('spec.frame', m[`value.${product.frameType}`]);
    add('spec.core', m[`value.${product.construction}`]);
    add('spec.surface', m[`value.${product.surface}`]);
    add(
      'spec.models',
      product.modelIds
        .map(id => materials.doorModels.find(d => d.id === id))
        .map(d => (d ? localize(d.name, locale) : null))
        .filter(Boolean)
        .join(' / '),
    );
    add('spec.leafSizes', product.sizes.map(s => formatDoorSize(s, locale)).join(' / '));
    const defaultSize = product.sizes.find(s => s.id === product.defaultSizeId)!;
    add(
      'spec.leafThickness',
      defaultSize.leafThicknessMm === null ? null : `${defaultSize.leafThicknessMm} mm`,
    );
    add(
      'spec.roughOpening',
      defaultSize.roughOpeningWidthMm === null || defaultSize.roughOpeningHeightMm === null
        ? null
        : `${defaultSize.roughOpeningWidthMm} × ${defaultSize.roughOpeningHeightMm} mm`,
    );
  } else if (product.kind === 'floor') {
    const c = materials.floorCollections.find(c => c.id === product.collectionId);
    if (!c) throw new Error('Missing spec collection');
    if (c.decor) add('spec.decor', `${c.decor.brand} ${c.decor.collection} · ${c.decor.code}`);
    add('spec.type', m[c.kind === 'laminate' ? 'catalog.badgeLaminate' : 'catalog.badgeParquet']);
    add('spec.thickness', `${c.thicknessMm} mm`);
    add('spec.boardSize', `${c.atlas.boardSizeMm.length} × ${c.atlas.boardSizeMm.width} mm`);
    if (c.kind === 'laminate') {
      add('spec.ac', c.acClass);
      add('spec.usage', c.usageClass);
    } else {
      add('spec.core', m[`value.${c.construction}`]);
      add('spec.wood', localize(c.woodSpecies, locale));
      add('spec.wear', c.wearLayerMm === null ? null : `${c.wearLayerMm} mm`);
    }
    add('spec.bevel', m[`value.${c.bevel}`]);
    add('spec.pattern', m[`value.${c.atlas.pattern}`]);
  } else {
    add(
      'spec.dimensions',
      `${product.dimensionsMm.length} × ${product.dimensionsMm.height} × ${product.dimensionsMm.depth} mm`,
    );
    add('spec.core', m[`value.${product.material}`]);
  }
  add('spec.origin', formatOrigin(product.originCountry, locale));
  return rows;
}
