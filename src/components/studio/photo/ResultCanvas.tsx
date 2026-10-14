'use client';
import { useEffect, useRef, useState } from 'react';
import type { RoomScene, StudioSelection } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import type { PreparedScene, RenderController } from '@/lib/studio/types';
import type { PixelBuffer } from '@/lib/studio/render/sampling';
import { IconButton } from '../../ui/IconButton';
import { drawPixels, PhotoFrame } from './PhotoFrame';

export function ResultCanvas({
  photo,
  controller,
  selection,
  scene,
  bind,
  messages: m,
  onError,
  onBusy,
}: {
  photo: PixelBuffer;
  controller: RenderController;
  selection: StudioSelection;
  scene: { definition: RoomScene; prepared: PreparedScene };
  bind: (scene: { definition: RoomScene; prepared: PreparedScene }) => void;
  messages: Messages;
  onError: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [settledKey, setSettledKey] = useState<string | null>(null),
    [drawn, setDrawn] = useState(false),
    [original, setOriginal] = useState(false);
  const key = `${scene.definition.assetRevision}|${JSON.stringify(selection)}`,
    busy = settledKey !== key;
  useEffect(() => onBusy(busy), [busy, onBusy]);
  useEffect(() => {
    let live = true;
    bind(scene);
    controller
      .render({ selection, width: photo.width, height: photo.height, quality: 'settled', rendererVersion: 2 })
      .then(({ pixels }) => {
        if (!live || !canvas.current) return;
        drawPixels(canvas.current, pixels);
        setDrawn(true);
        setSettledKey(key);
      })
      .catch(e => {
        if (!live || (e instanceof DOMException && e.name === 'AbortError')) return;
        setSettledKey(key);
        onError();
      });
    return () => {
      live = false;
    };
  }, [controller, scene, bind, selection, photo, key, onError]);
  return (
    <PhotoFrame photo={photo} className="photo-result">
      <canvas
        ref={canvas}
        className={`photo-layer photo-rendered${drawn && !original ? ' is-shown' : ''}`}
        role="img"
        aria-label={m['photo.title']}
      />
      <div className="photo-stage-tools">
        <IconButton icon="compare" label={m['photo.compare']} pressed={original} onClick={() => setOriginal(o => !o)} />
      </div>
      {original && <span className="studio-compare-label photo-original-label">{m['photo.original']}</span>}
      {busy && <span className="studio-progress" aria-hidden="true" />}
    </PhotoFrame>
  );
}
