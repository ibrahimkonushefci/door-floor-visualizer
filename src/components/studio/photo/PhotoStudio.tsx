'use client';
// Own-room photo tool: photo → floor area (AI first guess + brush touch-up) →
// perspective (four corners + plank-scale preview) → result (any floor, rendered
// by the Studio's kernel). Everything runs on this device.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Locale, Quad } from '@/lib/data/types';
import type { StudioCatalog } from '@/lib/studio/types';
import { localize, type Messages } from '@/lib/i18n/messages';
import type { ExportBrand, ExportStage } from '@/lib/studio/export-image';
import { exportFileName, labelledJpeg } from '@/lib/studio/export-image';
import { createRenderController } from '@/lib/studio/render-controller';
import { loadPhoto, PhotoError, type LoadedPhoto } from '@/lib/studio/photo/intake';
import { createOnDeviceSegmenter } from '@/lib/studio/photo/segmenter';
import { createMaskHistory, maskShare, type MaskHistory } from '@/lib/studio/photo/mask-edit';
import { DEFAULT_CAMERA_HEIGHT_MM, defaultFocalPx, floorPlane, guessQuad } from '@/lib/studio/photo/perspective';
import { photoLightingPlate } from '@/lib/studio/photo/lighting';
import {
  photoCatalog,
  photoFloorIds,
  photoSceneDefinition,
  photoSelection,
  preparePhotoScene,
  PHOTO_ROOM_NAME,
} from '@/lib/studio/photo/scene';
import { PHOTO_SAMPLE } from '@/lib/studio/photo/model-files';
import type { PreparedScene } from '@/lib/studio/types';
import type { RoomScene } from '@/lib/data/types';
type PhotoScene = { definition: RoomScene; prepared: PreparedScene };
import { useInquiry } from '../../inquiry/InquiryProvider';
import { Toast, useToast } from '../../ui/Toast';
import { ExportDialog } from '../StudioDialogs';
import { PhotoIntake } from './PhotoIntake';
import { MaskCanvas } from './MaskCanvas';
import { PerspectiveCanvas } from './PerspectiveCanvas';
import { ResultCanvas } from './ResultCanvas';
import { PhotoPanel } from './PhotoPanel';

let revisions = 0;
/** Every new photo scene (mask, corners, light) gets a fresh cache key. */
const nextRevision = () => ++revisions;

export type PhotoStep = 'photo' | 'mask' | 'perspective' | 'result';
export type AiState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number }
  | { status: 'running' }
  | { status: 'done' }
  | { status: 'empty' }
  | { status: 'failed' };
export interface BrushSettings {
  mode: 'paint' | 'erase';
  /** Diameter in CSS pixels on screen. */
  size: number;
  snap: boolean;
}

export default function PhotoStudio({
  catalog,
  locale,
  messages: m,
  brand,
}: {
  catalog: StudioCatalog;
  locale: Locale;
  messages: Messages;
  brand: ExportBrand;
}) {
  const { toast, show, dismiss } = useToast();
  const { open } = useInquiry();
  const floorIds = useMemo(() => photoFloorIds(catalog), [catalog]);
  const [floorId, setFloorId] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get('floor');
    return asked && floorIds.includes(asked) ? asked : catalog.materials.scenes[0].defaultSelection.floorProductId;
  });
  const [step, setStep] = useState<PhotoStep>('photo');
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MaskHistory | null>(null);
  const [maskVersion, setMaskVersion] = useState(0);
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const [brush, setBrush] = useState<BrushSettings>({ mode: 'paint', size: 48, snap: true });
  const [quad, setQuad] = useState<Quad | null>(null);
  const [quadAuto, setQuadAuto] = useState(true);
  const [quadMask, setQuadMask] = useState(-1);
  const [plankScale, setPlankScale] = useState(1);
  const [rotation, setRotation] = useState<0 | 90>(0);
  const [light, setLight] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const bumpMask = useCallback(() => setMaskVersion(v => v + 1), []);

  // One segmenter and one render controller for the page's lifetime. The
  // controller reads the scene being shown through `bind` (set by ResultCanvas).
  const [engine] = useState(() => {
    let scene: PhotoScene | null = null,
      progress: (fraction: number) => void = () => {};
    return {
      bind: (s: PhotoScene) => {
        scene = s;
      },
      onProgress: (fn: (fraction: number) => void) => {
        progress = fn;
      },
      controller: createRenderController(
        photoCatalog(catalog, () => scene?.definition ?? null),
        { sceneLoader: async () => scene!.prepared },
      ),
      segmenter: createOnDeviceSegmenter({ onProgress: f => progress(f) }),
    };
  });
  const { controller, segmenter } = engine;
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const ownership = lifecycle.current,
      token = ++ownership.generation;
    return () => {
      controller.cancel();
      // Strict Mode remounts effects; only dispose on a real unmount.
      queueMicrotask(() => {
        if (ownership.generation === token) {
          controller.dispose();
          segmenter.dispose();
        }
      });
    };
  }, [controller, segmenter]);

  const detect = useCallback(
    async (target: LoadedPhoto, h: MaskHistory) => {
      engine.onProgress(progress => setAi({ status: 'loading', progress }));
      setAi({ status: 'loading', progress: 0 });
      try {
        await segmenter.warmUp();
        setAi({ status: 'running' });
        // Let the status paint before the main-thread pre-processing.
        await new Promise(r => setTimeout(r, 30));
        const mask = await segmenter.segment(target.pixels);
        h.replace(mask.data);
        bumpMask();
        setAi({ status: maskShare(mask) < 0.005 ? 'empty' : 'done' });
      } catch {
        setAi({ status: 'failed' });
      }
    },
    [engine, segmenter, bumpMask],
  );

  const accept = useCallback(
    (loaded: LoadedPhoto) => {
      const h = createMaskHistory({
        width: loaded.pixels.width,
        height: loaded.pixels.height,
        data: new Uint8Array(loaded.pixels.width * loaded.pixels.height),
      });
      setPhoto(loaded);
      setHistory(h);
      setQuad(null);
      setQuadAuto(true);
      setPlankScale(1);
      setLight(1);
      setStep('mask');
      void detect(loaded, h);
    },
    [detect],
  );
  const openFile = useCallback(
    async (file: Blob & { name?: string }) => {
      setError(null);
      setOpening(true);
      // Start the model download while the photo decodes.
      segmenter.warmUp().catch(() => {});
      try {
        accept(await loadPhoto(file));
      } catch (e) {
        const code = e instanceof PhotoError ? e.code : 'unreadable';
        setError(m[code === 'heic-unsupported' ? 'photo.error.heic' : code === 'too-small' ? 'photo.error.small' : 'photo.error.unreadable']);
      } finally {
        setOpening(false);
      }
    },
    [accept, m, segmenter],
  );
  const openSample = useCallback(async () => {
    try {
      const blob = await (await fetch(PHOTO_SAMPLE)).blob();
      await openFile(Object.assign(blob, { name: 'sample-room.jpg' }));
    } catch {
      setError(m['photo.error.unreadable']);
    }
  }, [openFile, m]);

  const focal = photo ? (photo.focalPx ?? defaultFocalPx(photo.pixels.width, photo.pixels.height)) : 1;
  const cameraHeight = DEFAULT_CAMERA_HEIGHT_MM / plankScale;

  // The corner guess follows the mask until the visitor moves a corner.
  const goPerspective = () => {
    if (!photo || !history) return;
    if (!quad || (quadAuto && quadMask !== maskVersion)) {
      setQuad(guessQuad(photo.pixels, history.mask, focal));
      setQuadMask(maskVersion);
    }
    setStep('perspective');
  };
  const resetCorners = () => {
    if (!photo || !history) return;
    setQuad(guessQuad(photo.pixels, history.mask, focal));
    setQuadMask(maskVersion);
    setQuadAuto(true);
    setPlankScale(1);
  };
  const plane = useMemo(
    () => (photo && quad ? floorPlane(quad, photo.pixels.width, photo.pixels.height, focal, cameraHeight) : null),
    [photo, quad, focal, cameraHeight],
  );
  // Lighting plate: only for the result (≈ 0.1–0.2 s for a 2048-px photo).
  const atResult = step === 'result';
  const plate = useMemo(
    () => (atResult && photo && history ? photoLightingPlate(photo.pixels, history.mask) : null),
    // maskVersion stands for the mask's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atResult, photo, history, maskVersion],
  );
  const photoScene = useMemo(() => {
    if (step !== 'result' || !photo || !history || !plate || !quad || !plane?.ok) return null;
    const input = { photo: photo.pixels, mask: history.mask, plate, quad, plane: plane.plane, light, revision: nextRevision() },
      definition = photoSceneDefinition(input, catalog, floorIds[0]);
    return { definition, prepared: preparePhotoScene(input, definition) };
  }, [step, photo, history, plate, quad, plane, light, catalog, floorIds]);
  const onRenderError = useCallback(() => show(m['studio.renderError']), [show, m]);
  const selection = useMemo(() => photoSelection(catalog, floorId, rotation), [catalog, floorId, rotation]);
  const floorProduct = catalog.products.find(p => p.id === floorId);
  const floorCollection =
    floorProduct?.kind === 'floor' ? catalog.materials.floorCollections.find(c => c.id === floorProduct.collectionId) : undefined;
  const roomName = localize(PHOTO_ROOM_NAME, locale);

  const runExport = useCallback(
    async (signal: AbortSignal, onProgress: (stage: ExportStage) => void) => {
      if (!photo) throw new Error('No photo');
      onProgress('render');
      const stop = () => controller.cancel();
      signal.addEventListener('abort', stop);
      try {
        const { pixels } = await controller.render({
          selection,
          width: photo.pixels.width,
          height: photo.pixels.height,
          quality: 'settled',
          rendererVersion: 2,
        });
        signal.throwIfAborted();
        onProgress('compose');
        const decor = floorCollection?.decor;
        const label = {
          room: roomName,
          rows: [
            [m['studio.floor'], `${floorProduct ? localize(floorProduct.name, locale) : ''}${decor ? ` · ${decor.code}` : ''}`],
            [m['studio.direction'], m[rotation === 0 ? 'studio.lengthwise' : 'studio.crosswise']],
          ] as [string, string][],
          notice: m['studio.disclaimer'],
        };
        return await labelledJpeg(pixels, label, brand, locale, () => onProgress('encode'));
      } finally {
        signal.removeEventListener('abort', stop);
      }
    },
    [photo, controller, selection, floorCollection, floorProduct, roomName, m, rotation, brand, locale],
  );

  const steps: PhotoStep[] = ['photo', 'mask', 'perspective', 'result'];
  const hasFloor = !!history && maskShare(history.mask) > 0.005;
  const reachable = (s: PhotoStep): boolean =>
    s === 'photo' ||
    (!!photo && (s === 'mask' || (hasFloor && (s === 'perspective' || (s === 'result' && !!quad && !!plane?.ok)))));
  const goTo = (s: PhotoStep) => {
    if (!reachable(s)) return;
    if (s === 'perspective') goPerspective();
    else setStep(s);
  };

  return (
    <section className={`photo-studio is-step-${step}`}>
      <div className="photo-stage-area">
        <div className="photo-stage">
          {step === 'photo' || !photo ? (
            <PhotoIntake messages={m} opening={opening} error={error} onFile={openFile} onSample={openSample} />
          ) : step === 'mask' && history ? (
            <MaskCanvas photo={photo.pixels} history={history} version={maskVersion} brush={brush} onEdit={bumpMask} busy={ai.status === 'loading' || ai.status === 'running'} />
          ) : step === 'perspective' && history && quad ? (
            <PerspectiveCanvas
              photo={photo.pixels}
              mask={history.mask}
              maskVersion={maskVersion}
              quad={quad}
              plane={plane?.ok ? plane.plane : null}
              board={floorCollection ? { lengthMm: floorCollection.atlas.boardSizeMm.length, widthMm: floorCollection.atlas.boardSizeMm.width } : null}
              rotation={rotation}
              messages={m}
              onQuad={q => {
                setQuad(q);
                setQuadAuto(false);
              }}
            />
          ) : step === 'result' && photoScene ? (
            <ResultCanvas
              photo={photo.pixels}
              controller={controller}
              selection={selection}
              scene={photoScene}
              bind={engine.bind}
              messages={m}
              onError={onRenderError}
              onBusy={setRendering}
            />
          ) : null}
        </div>
      </div>
      <PhotoPanel
        catalog={catalog}
        locale={locale}
        messages={m}
        step={step}
        steps={steps}
        reachable={reachable}
        onStep={goTo}
        ai={ai}
        hasPhoto={!!photo}
        history={history}
        maskVersion={maskVersion}
        brush={brush}
        onBrush={setBrush}
        onMaskChange={bumpMask}
        onDetect={() => photo && history && detect(photo, history)}
        onNewPhoto={() => setStep('photo')}
        onPerspective={goPerspective}
        planeOk={!!plane?.ok}
        plankScale={plankScale}
        onPlankScale={setPlankScale}
        onResetCorners={resetCorners}
        onResult={() => plane?.ok && setStep('result')}
        floorId={floorId}
        floorIds={floorIds}
        onFloor={setFloorId}
        rotation={rotation}
        onRotation={setRotation}
        light={light}
        onLight={setLight}
        settled={step === 'result' && !rendering}
        onDownload={() => setExporting(true)}
        onRequest={() => open('whatsapp', { kind: 'product', productId: floorId })}
      />
      {exporting && (
        <ExportDialog
          open
          onClose={() => setExporting(false)}
          run={runExport}
          fileName={exportFileName(brand.name, roomName)}
          messages={m}
        />
      )}
      <Toast message={toast} onDismiss={dismiss} />
    </section>
  );
}
