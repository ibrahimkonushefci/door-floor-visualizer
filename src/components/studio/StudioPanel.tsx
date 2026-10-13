'use client';
import { useId, useState } from 'react';
import type { Locale, StudioSelection, TrimMode } from '@/lib/data/types';
import type { StudioAction, StudioCatalog } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { Swatch } from '../ui/Swatch';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Icon } from '../ui/Icon';
import { DoorModelIcon } from './DoorModelIcon';
import { compatibleDoor } from '@/lib/studio/compatibility';
import { sceneModelIds, sceneForModel } from '@/lib/studio/door-models';
import type { DoorProduct } from '@/lib/data/types';
type Surface = 'door' | 'floor';
export function StudioPanel({
  catalog,
  locale,
  messages: m,
  requested,
  canRequest,
  onAction,
  onUnavailable,
  onRequest,
}: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
  requested: StudioSelection;
  canRequest: boolean;
  onAction: (action: StudioAction) => void;
  onUnavailable: (text: string) => void;
  onRequest: () => void;
}) {
  const [surface, setSurface] = useState<Surface>('door');
  const tabsId = useId();
  const { scenes, doorFinishes, floorCollections, doorModels } = catalog.materials;
  const scene = scenes.find(s => s.id === requested.sceneId)!,
    finish = doorFinishes.find(f => f.id === requested.doorFinishId)!,
    model = doorModels.find(d => d.id === requested.doorModelId),
    floorProduct = catalog.products.find(p => p.id === requested.floorProductId)!;
  const doors = catalog.products.filter(
    (p): p is DoorProduct => p.kind === 'door' && compatibleDoor(p, scene, catalog),
  );
  // Prefer the current door line, then lines in the current model, then any door allowed here.
  const pick = (ok: (p: DoorProduct) => boolean) =>
    doors.find(p => p.id === requested.doorProductId && ok(p)) ||
    doors.find(p => p.modelIds.includes(requested.doorModelId) && ok(p)) ||
    doors.find(ok);
  const finishes = doorFinishes
    .filter(f => f.kind === 'opaque' || doors.some(p => p.finishIds.includes(f.id)))
    .map(f => ({ finish: f, productId: pick(p => p.finishIds.includes(f.id))?.id }));
  const shownModels = sceneModelIds(scene);
  const models = doorModels
    .filter(d => shownModels.includes(d.id))
    .map(d => {
      const product =
        pick(p => p.modelIds.includes(d.id) && p.finishIds.includes(requested.doorFinishId)) ||
        pick(p => p.modelIds.includes(d.id));
      return {
        model: d,
        productId: product?.id,
        finishId: product?.finishIds.includes(requested.doorFinishId) ? requested.doorFinishId : product?.defaultFinishId,
      };
    });
  const concealed = sceneForModel(scene, requested.doorModelId).frameType === 'concealed-aluminium';
  const floors = catalog.products.flatMap(p => {
    if (p.kind !== 'floor') return [];
    const collection = floorCollections.find(c => c.id === p.collectionId)!;
    return [{ product: p, collection, available: scene.allowedFloorProductIds.includes(p.id) }];
  });
  const modes = (allowed: readonly TrimMode[]) =>
    allowed.map(mode => ({ value: mode, label: m[`studio.mode.${mode}`] }));
  const frameModes =
    finish.kind === 'glass' ? (['black'] as const) : sceneForModel(scene, requested.doorModelId).allowedFrameModes;
  const tab = (value: Surface) => ({
    role: 'tab' as const,
    id: `${tabsId}-${value}`,
    'aria-selected': surface === value,
    'aria-controls': `${tabsId}-${value}-panel`,
    tabIndex: surface === value ? 0 : -1,
    onClick: () => setSurface(value),
  });
  return (
    <aside className="studio-panel" aria-label={m['nav.studio']}>
      <div className="studio-panel-scroll">
        <header className="studio-summary">
          <p className="eyebrow">{m['studio.yourCombination']}</p>
          <dl>
            <div>
              <dt>{m['studio.door']}</dt>
              <dd>
                {model && models.length > 1 ? `${localize(model.name, locale)} · ` : ''}
                {localize(finish.name, locale)}
              </dd>
            </div>
            <div>
              <dt>{m['studio.floor']}</dt>
              <dd>{localize(floorProduct.name, locale)}</dd>
            </div>
          </dl>
        </header>
        {scenes.length > 1 && (
          <section className="studio-section studio-rooms-section" aria-labelledby={`${tabsId}-room`}>
            <h2 className="eyebrow" id={`${tabsId}-room`}>
              {m['studio.room']}
            </h2>
            <div className="studio-rooms">
              {scenes.map(s => (
                <button
                  type="button"
                  key={s.id}
                  className="studio-room"
                  aria-pressed={s.id === scene.id}
                  onClick={() => s.id !== scene.id && onAction({ type: 'scene', sceneId: s.id })}
                >
                  <picture>
                    <img src={s.fallback} alt="" width={960} height={720} loading="lazy" decoding="async" />
                  </picture>
                  <span>{localize(s.name, locale)}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        <div
          className="studio-tabs"
          role="tablist"
          aria-label={m['studio.surface']}
          onKeyDown={e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const next = surface === 'door' ? 'floor' : 'door';
            setSurface(next);
            document.getElementById(`${tabsId}-${next}`)?.focus();
          }}
        >
          <button type="button" {...tab('door')}>
            {m['studio.door']}
          </button>
          <button type="button" {...tab('floor')}>
            {m['studio.floor']}
          </button>
        </div>
        {surface === 'door' ? (
          <div role="tabpanel" id={`${tabsId}-door-panel`} aria-labelledby={`${tabsId}-door`} className="studio-tabpanel">
            {models.length > 1 && (
              <section className="studio-section" aria-labelledby={`${tabsId}-model`}>
                <h2 className="eyebrow" id={`${tabsId}-model`}>
                  {m['studio.model']}
                </h2>
                <div className="door-models">
                  {models.map(({ model: d, productId, finishId }) => (
                    <button
                      type="button"
                      key={d.id}
                      className="door-model"
                      aria-pressed={d.id === requested.doorModelId}
                      aria-disabled={!productId || undefined}
                      title={localize(d.description, locale)}
                      onClick={() =>
                        productId && finishId
                          ? onAction({ type: 'door', productId, finishId, modelId: d.id })
                          : onUnavailable(m['studio.incompatible'])
                      }
                    >
                      <DoorModelIcon icon={d.icon} />
                      <span>{localize(d.name, locale)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="studio-section" aria-label={m['studio.finish']}>
              <div className="swatch-grid">
                {finishes.map(({ finish: f, productId }) => (
                  <Swatch
                    key={f.id}
                    label={localize(f.name, locale)}
                    color={f.swatchColorSrgb}
                    texture={f.kind === 'opaque' && f.appearance.kind === 'texture' ? f.appearance.texture : undefined}
                    selected={f.id === requested.doorFinishId}
                    unavailable={!productId}
                    onSelect={() =>
                      productId
                        ? onAction({ type: 'door', productId, finishId: f.id })
                        : onUnavailable(m['studio.incompatible'])
                    }
                  />
                ))}
              </div>
            </section>
            <TrimSetting
              label={m['inquiry.frame']}
              allowed={frameModes}
              value={requested.frameMode}
              fixedLabel={
                finish.kind === 'glass'
                  ? m['studio.blackProfile']
                  : concealed
                    ? m['studio.concealedFrame']
                    : undefined
              }
              options={modes(frameModes)}
              onChange={mode => onAction({ type: 'frame', mode })}
            />
          </div>
        ) : (
          <div role="tabpanel" id={`${tabsId}-floor-panel`} aria-labelledby={`${tabsId}-floor`} className="studio-tabpanel">
            <section className="studio-section" aria-label={m['studio.flooring']}>
              <div className="swatch-grid is-tiles">
                {floors.map(({ product, collection, available }) => (
                  <Swatch
                    key={product.id}
                    shape="tile"
                    label={localize(product.name, locale)}
                    color={collection.swatchColorSrgb}
                    texture={collection.atlas.image}
                    selected={product.id === requested.floorProductId}
                    unavailable={!available}
                    onSelect={() =>
                      available
                        ? onAction({ type: 'floor', productId: product.id })
                        : onUnavailable(m['studio.incompatible'])
                    }
                  />
                ))}
              </div>
            </section>
            <section className="studio-section">
              <h2 className="eyebrow">{m['studio.direction']}</h2>
              <SegmentedControl
                label={m['studio.direction']}
                value={requested.floorRotationDeg}
                options={[
                  { value: 90, label: m['studio.lengthwise'], icon: 'planks-lengthwise' },
                  { value: 0, label: m['studio.crosswise'], icon: 'planks-crosswise' },
                ]}
                onChange={degrees => onAction({ type: 'rotate', degrees })}
              />
            </section>
            <TrimSetting
              label={m['inquiry.skirting']}
              allowed={scene.allowedSkirtingModes}
              value={requested.skirtingMode}
              options={modes(scene.allowedSkirtingModes)}
              onChange={mode => onAction({ type: 'skirting', mode })}
            />
          </div>
        )}
        <p className="studio-disclaimer">{m['studio.disclaimer']}</p>
      </div>
      <div className="studio-panel-footer">
        <button type="button" className="btn btn-primary btn-block studio-cta" disabled={!canRequest} onClick={onRequest}>
          <Icon name="whatsapp" size={18} />
          {m['studio.inquiry']}
        </button>
      </div>
    </aside>
  );
}
function TrimSetting({
  label,
  allowed,
  value,
  options,
  fixedLabel,
  onChange,
}: {
  label: string;
  allowed: readonly TrimMode[];
  value: TrimMode;
  options: { value: TrimMode; label: string }[];
  fixedLabel?: string;
  onChange: (mode: TrimMode) => void;
}) {
  return (
    <section className="studio-section">
      <h2 className="eyebrow">{label}</h2>
      {allowed.length > 1 ? (
        <SegmentedControl label={label} value={value} options={options} onChange={onChange} />
      ) : (
        <p className="studio-fixed">{fixedLabel || options[0]?.label}</p>
      )}
    </section>
  );
}
