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
  return (
    <div className="product-variants">
      <label htmlFor="leaf-size">
        {m['inquiry.size']}
        <select
          id="leaf-size"
          value={sizeId}
          onChange={e => updateProductQuery(product, { sizeId: e.target.value, finishId })}
        >
          {product.sizes.map(s => (
            <option key={s.id} value={s.id}>
              {formatDoorSize(s, locale)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="door-finish">
        {m['inquiry.finish']}
        <select
          id="door-finish"
          value={finishId}
          onChange={e => updateProductQuery(product, { sizeId, finishId: e.target.value })}
        >
          {finishes
            .filter(f => product.finishIds.includes(f.id))
            .map(f => (
              <option key={f.id} value={f.id}>
                {localize(f.name, locale)}
              </option>
            ))}
        </select>
      </label>
      <p className="product-note">
        {m['product.photoFinish']}{' '}
        {localize(finishes.find(f => f.id === product.defaultFinishId)!.name, locale)}.
      </p>
      <InquiryButton
        context={{ kind: 'product', productId: product.id, sizeId, finishId }}
        label={m['contact.quote']}
      />
      <ProductStudioLink productId={product.id} finishId={finishId} />
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
    <>
      <InquiryButton context={{ kind: 'product', productId }} label={m['contact.quote']} />
      <ProductStudioLink productId={productId} />
    </>
  );
}
export function CatalogBackLink({ locale, label }: { locale: Locale; label: string }) {
  const search = useSyncExternalStore(subscribeCatalogQuery, readSearch, serverSearch);
  return (
    <a
      className="catalog-back"
      href={`/${locale}/${catalogReturnQuery(new URLSearchParams(search))}`}
    >
      ← {label}
    </a>
  );
}

function ProductStudioLink({ productId, finishId }: { productId: Id; finishId?: Id }) {
  const { data, locale, messages: m } = useInquiry();
  const p = data.products.find(p => p.id === productId)!;
  if (p.kind === 'trim') return null;
  const scene = data.scenes.find(s => p.compatibleSceneIds.includes(s.id));
  if (!scene) return null;
  const query = new URLSearchParams({ v: '1', scene: scene.id });
  if (p.kind === 'door') {
    query.set('door', p.id);
    query.set('finish', finishId || p.defaultFinishId);
  } else query.set('floor', p.id);
  return (
    <>
      <a className="plain-button" href={`/${locale}/studio/?${query}`}>
        {m['studio.open']}
      </a>
      {p.kind === 'door' && <p className="product-note">{m['studio.sizeRepresentative']}</p>}
    </>
  );
}
