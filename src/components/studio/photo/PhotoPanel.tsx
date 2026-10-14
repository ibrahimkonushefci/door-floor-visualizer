'use client';
import type { Locale } from '@/lib/data/types';
import type { StudioCatalog } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import { maskShare, type MaskHistory } from '@/lib/studio/photo/mask-edit';
import { Icon } from '../../ui/Icon';
import { Swatch } from '../../ui/Swatch';
import { SegmentedControl } from '../../ui/SegmentedControl';
import type { AiState, BrushSettings, PhotoStep } from './PhotoStudio';

export function PhotoPanel(p: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
  step: PhotoStep;
  steps: PhotoStep[];
  reachable: (s: PhotoStep) => boolean;
  onStep: (s: PhotoStep) => void;
  ai: AiState;
  hasPhoto: boolean;
  history: MaskHistory | null;
  maskVersion: number;
  brush: BrushSettings;
  onBrush: (b: BrushSettings) => void;
  onMaskChange: () => void;
  onDetect: () => void;
  onNewPhoto: () => void;
  onPerspective: () => void;
  planeOk: boolean;
  plankScale: number;
  onPlankScale: (v: number) => void;
  onResetCorners: () => void;
  onResult: () => void;
  floorId: string;
  floorIds: string[];
  onFloor: (id: string) => void;
  rotation: 0 | 90;
  onRotation: (r: 0 | 90) => void;
  light: number;
  onLight: (v: number) => void;
  settled: boolean;
  onDownload: () => void;
  onRequest: () => void;
}) {
  const { messages: m, step, history } = p;
  const aiBusy = p.ai.status === 'loading' || p.ai.status === 'running';
  const hasFloor = !!history && maskShare(history.mask) > 0.005;
  const floors = p.floorIds.flatMap(id => {
    const product = p.catalog.products.find(x => x.id === id);
    if (product?.kind !== 'floor') return [];
    const collection = p.catalog.materials.floorCollections.find(c => c.id === product.collectionId)!;
    return [{ product, collection }];
  });
  const direction = (
    <section className="studio-section">
      <h2 className="eyebrow">{m['studio.direction']}</h2>
      <SegmentedControl
        label={m['studio.direction']}
        value={p.rotation}
        options={[
          { value: 0, label: m['studio.lengthwise'], icon: 'planks-lengthwise' },
          { value: 90, label: m['studio.crosswise'], icon: 'planks-crosswise' },
        ]}
        onChange={p.onRotation}
      />
    </section>
  );
  const aiMessage =
    p.ai.status === 'loading'
      ? `${m['photo.aiDownloading']} (${Math.round(p.ai.progress * 100)} %)…`
      : p.ai.status === 'running'
        ? m['photo.aiRunning']
        : p.ai.status === 'done'
          ? m['photo.aiDone']
          : p.ai.status === 'empty'
            ? m['photo.aiEmpty']
            : p.ai.status === 'failed'
              ? m['photo.aiFailed']
              : '';
  const edit = (fn: () => boolean | void) => {
    if (fn() !== false) p.onMaskChange();
  };
  return (
    <aside className="studio-panel photo-panel" aria-label={m['photo.title']}>
      <div className="studio-panel-scroll">
        <header className="studio-summary">
          <p className="eyebrow">{m['photo.title']}</p>
          <ol className="photo-steps" aria-label={m['photo.steps']}>
            {p.steps.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  aria-current={s === step ? 'step' : undefined}
                  disabled={!p.reachable(s)}
                  onClick={() => p.onStep(s)}
                >
                  <span className="photo-step-number">{i + 1}</span>
                  {m[`photo.step.${s}`]}
                </button>
              </li>
            ))}
          </ol>
        </header>

        {step === 'photo' && (
          <section className="studio-section">
            <h2 className="eyebrow">{m['photo.tipsTitle']}</h2>
            <ul className="photo-tips">
              <li>{m['photo.tip1']}</li>
              <li>{m['photo.tip2']}</li>
              <li>{m['photo.tip3']}</li>
            </ul>
            <p className="photo-note">{m['photo.privacy']}</p>
            <a className="photo-link" href={`/${p.locale}/studio/`}>
              <Icon name="arrow-left" size={16} />
              {m['photo.backToStudio']}
            </a>
          </section>
        )}

        {step === 'mask' && history && (
          <>
            <p className={`photo-status${p.ai.status === 'failed' || p.ai.status === 'empty' ? ' is-warning' : ''}`} role="status">
              {aiMessage}
            </p>
            <section className="studio-section" aria-label={m['photo.tools']}>
              <SegmentedControl
                label={m['photo.tools']}
                value={p.brush.mode}
                options={[
                  { value: 'paint', label: m['photo.brush'], icon: 'brush' },
                  { value: 'erase', label: m['photo.eraser'], icon: 'eraser' },
                ]}
                onChange={mode => p.onBrush({ ...p.brush, mode })}
              />
              <label className="photo-range">
                <span>{m['photo.brushSize']}</span>
                <input
                  type="range"
                  min={12}
                  max={140}
                  step={2}
                  value={p.brush.size}
                  onChange={e => p.onBrush({ ...p.brush, size: Number(e.target.value) })}
                />
              </label>
              <label className="photo-check">
                <input type="checkbox" checked={p.brush.snap} onChange={e => p.onBrush({ ...p.brush, snap: e.target.checked })} />
                <span>
                  {m['photo.snap']}
                  <small>{m['photo.snapHint']}</small>
                </span>
              </label>
              <div className="photo-buttons">
                <button type="button" className="btn btn-secondary" disabled={!history.canUndo() || aiBusy} onClick={() => edit(history.undo)}>
                  <Icon name="undo" size={18} />
                  {m['photo.undo']}
                </button>
                <button type="button" className="btn btn-secondary" disabled={!history.canRedo() || aiBusy} onClick={() => edit(history.redo)}>
                  <Icon name="redo" size={18} />
                  {m['photo.redo']}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!hasFloor || aiBusy}
                  onClick={() => edit(() => history.replace(new Uint8Array(history.mask.data.length)))}
                >
                  {m['photo.clear']}
                </button>
                <button type="button" className="btn btn-secondary" disabled={aiBusy} onClick={p.onDetect}>
                  {m['photo.aiAgain']}
                </button>
              </div>
            </section>
          </>
        )}

        {step === 'perspective' && (
          <>
            <p className="photo-status">{m['photo.perspectiveHint']}</p>
            {!p.planeOk && (
              <p className="photo-status is-warning" role="alert">
                {m['photo.horizonError']}
              </p>
            )}
            <section className="studio-section">
              <label className="photo-range">
                <span>{m['photo.plankSize']}</span>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.02}
                  value={p.plankScale}
                  onChange={e => p.onPlankScale(Number(e.target.value))}
                />
                <span className="photo-range-ends" aria-hidden="true">
                  <span>{m['photo.smaller']}</span>
                  <span>{m['photo.larger']}</span>
                </span>
              </label>
              <button type="button" className="btn btn-secondary" onClick={p.onResetCorners}>
                <Icon name="reset" size={18} />
                {m['photo.resetCorners']}
              </button>
            </section>
            {direction}
          </>
        )}

        {step === 'result' && (
          <>
            <section className="studio-section" aria-label={m['studio.flooring']}>
              <h2 className="eyebrow">{m['studio.flooring']}</h2>
              <div className="swatch-grid is-tiles">
                {floors.map(({ product, collection }) => (
                  <Swatch
                    key={product.id}
                    shape="tile"
                    label={localize(product.name, p.locale)}
                    color={collection.swatchColorSrgb}
                    texture={collection.atlas.image}
                    selected={product.id === p.floorId}
                    onSelect={() => p.onFloor(product.id)}
                  />
                ))}
              </div>
            </section>
            {direction}
            <section className="studio-section">
              <label className="photo-range">
                <span>{m['photo.light']}</span>
                <input type="range" min={0.7} max={1.3} step={0.02} value={p.light} onChange={e => p.onLight(Number(e.target.value))} />
              </label>
            </section>
            <div className="studio-actions photo-result-actions">
              <button type="button" className="studio-action" disabled={!p.settled} onClick={p.onDownload}>
                <Icon name="download" size={18} />
                {m['studio.download']}
              </button>
              <button type="button" className="studio-action" onClick={() => p.onStep('mask')}>
                <Icon name="brush" size={18} />
                {m['photo.editMask']}
              </button>
              <button type="button" className="studio-action" onClick={p.onPerspective}>
                <Icon name="grid" size={18} />
                {m['photo.editPerspective']}
              </button>
              <button type="button" className="studio-action" onClick={p.onNewPhoto}>
                <Icon name="camera" size={18} />
                {m['photo.newPhoto']}
              </button>
            </div>
            <p className="photo-disclaimer">
              {m['studio.disclaimer']} {m['photo.floorsOnly']} {m['photo.limits']}
            </p>
          </>
        )}
      </div>
      <div className="studio-panel-footer photo-panel-footer">
        {step === 'mask' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={p.onNewPhoto}>
              {m['photo.newPhoto']}
            </button>
            <button type="button" className="btn btn-primary" disabled={!hasFloor || aiBusy} onClick={p.onPerspective}>
              {hasFloor ? m['photo.next'] : m['photo.maskEmpty']}
              <Icon name="arrow-right" size={18} />
            </button>
          </>
        )}
        {step === 'perspective' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => p.onStep('mask')}>
              <Icon name="arrow-left" size={18} />
              {m['photo.back']}
            </button>
            <button type="button" className="btn btn-primary" disabled={!p.planeOk} onClick={p.onResult}>
              {m['photo.showResult']}
              <Icon name="arrow-right" size={18} />
            </button>
          </>
        )}
        {step === 'result' && (
          <button type="button" className="btn btn-primary btn-block studio-cta" onClick={p.onRequest}>
            <Icon name="whatsapp" size={18} />
            {m['photo.request']}
          </button>
        )}
      </div>
    </aside>
  );
}
