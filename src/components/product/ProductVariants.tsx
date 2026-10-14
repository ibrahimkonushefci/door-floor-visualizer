'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { DoorProduct, DoorFinish, Id, Locale } from '@/lib/data/types';
import {
  catalogReturnQuery,
  mergeProductQuery,
  parseProductQuery,
  subscribeCatalogQuery,
  updateProductQuery,
} from '@/lib/catalog/query';
import { formatDoorSize } from '@/lib/i18n/format';
import { getMessages, localize } from '@/lib/i18n/messages';
import { useInquiry } from '../inquiry/InquiryProvider';
import { InquiryButton } from '../inquiry/InquiryButton';
import { Swatch } from '../ui/Swatch';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Icon } from '../ui/Icon';
const readSearch = () => window.location.search;
const serverSearch = () => '';
export function ProductVariants({
  product,
  finishes,
  locale,
  onChange,
}: {
  product: DoorProduct;
  finishes: readonly DoorFinish[];
  locale: Locale;
  onChange?: (value: { sizeId: Id; finishId: Id }) => void;
}) {
  const m = getMessages(locale);
  const search = useSyncExternalStore(subscribeCatalogQuery, readSearch, serverSearch);
  const selected = parseProductQuery(new URLSearchParams(search), product);
  const { setContext } = useInquiry();
  const { sizeId, finishId } = selected;
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (mergeProductQuery(params, product, { sizeId, finishId }).toString() !== params.toString())
      updateProductQuery(product, { sizeId, finishId }, 'replace');
  }, [search, product, sizeId, finishId]);
  useEffect(() => {
    setContext({ kind: 'product', productId: product.id, sizeId, finishId });
    onChange?.({ sizeId, finishId });
    return () => setContext({ kind: 'catalog', productIds: [] });
  }, [product.id, sizeId, finishId, setContext, onChange]);
  const available = finishes.filter(f => product.finishIds.includes(f.id)),
    finish = available.find(f => f.id === finishId)!,
    defaultFinish = finishes.find(f => f.id === product.defaultFinishId)!;
  return (
    <div className="product-variants">
      <div className="variant" data-variant="finish">
        <p className="variant-label">
          <span className="eyebrow">{m['inquiry.finish']}</span>
          <span className="variant-value">{localize(finish.name, locale)}</span>
        </p>
        <div className="variant-swatches" role="group" aria-label={m['inquiry.finish']}>
          {available.map(f => (
            <Swatch
              key={f.id}
              label={localize(f.name, locale)}
              color={f.swatchColorSrgb}
              texture={
                f.kind === 'opaque' && f.appearance.kind === 'texture'
                  ? f.appearance.texture
                  : undefined
              }
              selected={f.id === finishId}
              onSelect={() => updateProductQuery(product, { sizeId, finishId: f.id })}
            />
          ))}
        </div>
        {finishId !== defaultFinish.id && (
          <p className="product-note">
            {m['product.photoFinish']}: {localize(defaultFinish.name, locale)}.
          </p>
        )}
      </div>
      <div className="variant" data-variant="size">
        <p className="variant-label">
          <span className="eyebrow">{m['inquiry.size']}</span>
        </p>
        <SegmentedControl
          label={m['inquiry.size']}
          value={sizeId}
          options={product.sizes.map(s => ({ value: s.id, label: formatDoorSize(s, locale) }))}
          onChange={id => updateProductQuery(product, { sizeId: id, finishId })}
        />
      </div>
      <div className="product-actions">
        <InquiryButton
          context={{ kind: 'product', productId: product.id, sizeId, finishId }}
          label={m['contact.quote']}
        />
        <ProductStudioLink productId={product.id} finishId={finishId} />
      </div>
    </div>
  );
}
export function ProductInquiry({ productId }: { productId: Id }) {
  const { setContext, messages: m } = useInquiry();
  useEffect(() => {
    setContext({ kind: 'product', productId });
    return () => setContext({ kind: 'catalog', productIds: [] });
  }, [productId, setContext]);
  return (
    <div className="product-actions">
      <InquiryButton context={{ kind: 'product', productId }} label={m['contact.quote']} />
      <ProductStudioLink productId={productId} />
    </div>
  );
}
export function CatalogBackLink({ locale, label }: { locale: Locale; label: string }) {
  const search = useSyncExternalStore(subscribeCatalogQuery, readSearch, serverSearch);
  return (
    <a
      className="catalog-back"
      href={`/${locale}/${catalogReturnQuery(new URLSearchParams(search))}`}
    >
      <Icon name="arrow-left" size={16} />
      {label}
    </a>
  );
}

function ProductStudioLink({ productId, finishId }: { productId: Id; finishId?: Id }) {
  const { data, locale, messages: m } = useInquiry();
  const p = data.products.find(p => p.id === productId)!;
  if (p.kind === 'trim') return null;
  // Doors open in the first room whose own door model the line has (flush doors
  // in the filomuro hall), floors in the first compatible room.
  const rooms = data.scenes.filter(s => p.compatibleSceneIds.includes(s.id)),
    scene =
      (p.kind === 'door' && rooms.find(s => s.defaultModelId && p.modelIds.includes(s.defaultModelId))) ||
      rooms[0];
  if (!scene) return null;
  const query = new URLSearchParams({ v: '1', scene: scene.id });
  if (p.kind === 'door') {
    query.set('door', p.id);
    query.set('finish', finishId || p.defaultFinishId);
  } else query.set('floor', p.id);
  return (
    <a className="btn btn-secondary" href={`/${locale}/studio/?${query}`}>
      <Icon name="studio" size={18} />
      {m['studio.open']}
    </a>
  );
}
