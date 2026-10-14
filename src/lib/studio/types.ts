import type {
  Mat3,
  MaterialsConfig,
  Product,
  RoomScene,
  SceneSurface,
  StudioSelection,
} from '../data/types';
import type { PixelBuffer, FloatTexture, ByteTexture } from './render/sampling';
export interface StudioCatalog {
  products: readonly Product[];
  materials: MaterialsConfig;
}
export interface StudioSnapshot {
  requested: StudioSelection;
  rendered: StudioSelection | null;
  status: 'idle' | 'loading' | 'rendering' | 'ready' | 'error';
  error: string | null;
}
export type StudioAction =
  | { type: 'restore'; selection: StudioSelection }
  | { type: 'scene'; sceneId: string }
  | { type: 'door'; productId: string; finishId: string; modelId?: string }
  | { type: 'floor'; productId: string }
  | { type: 'frame' | 'skirting'; mode: 'door' | 'floor' | 'black' }
  | { type: 'rotate'; degrees: 0 | 90 }
  | { type: 'reset' };
export interface PreparedSurface {
  definition: SceneSurface;
  inverse: Mat3;
  mask: Uint8Array;
  diffuse: Uint8Array;
  specular: PixelBuffer | null;
  bounds: readonly [number, number, number, number];
  /** Linear lighting level rendered at the material's true colour (defaults to the authored baseline). */
  baseline?: number;
  /** Floor world positions (16-bit, 2 channels: X, Y) for position-map scenes. */
  position?: PreparedPositionMap | null;
}
export interface PreparedPositionMap {
  data: Uint16Array;
  /** Scene-pixel bounds of the floor; samples are every stepPx pixels from its corner. */
  bounds: readonly [number, number, number, number];
  stepPx: number;
  samples: readonly [number, number];
  originMm: readonly [number, number];
  unitMm: number;
  /** Resolution the map was rendered at (the scene's full resolution). */
  sceneWidth: number;
  sceneHeight: number;
}
export interface PreparedScene {
  /** The scene as drawn with `modelId` (see door-models.ts sceneForModel). */
  scene: RoomScene;
  modelId?: string;
  base: PixelBuffer;
  surfaces: readonly PreparedSurface[];
  protectedMask: Uint8Array;
  foreground: PixelBuffer | null;
  inserts: ReadonlyMap<string, PixelBuffer>;
  insertMasks: ReadonlyMap<string, { replacement: Uint8Array; protected: Uint8Array }>;
  /** Uncovered gap between door leaf and frame, shaded as a shadow reveal. */
  reveal?: { mask: Uint8Array; bounds: readonly [number, number, number, number] } | null;
  /** 1 for full resolution, 0.5 for the lighter phone variant decoded from the same files. */
  scale?: number;
}
export interface PreparedMaterials {
  textures: ReadonlyMap<string, readonly FloatTexture[]>;
  /** Plank sheets (sRGB byte mips) for position-map floors. */
  sheets?: ReadonlyMap<string, readonly ByteTexture[]>;
  data: MaterialsConfig;
  products: readonly Product[];
}
export interface RenderJob {
  id: number;
  selection: StudioSelection;
  width: number;
  height: number;
  quality: 'preview' | 'settled';
  rendererVersion: 1 | 2;
  /** Scene variant: 1 = full resolution, 0.5 = lighter variant for small frames. */
  sceneScale?: 1 | 0.5;
}
export type WorkerRequest =
  | { type: 'prepare-scene'; scene: PreparedScene }
  | { type: 'prepare-materials'; materials: PreparedMaterials }
  | { type: 'render'; job: RenderJob }
  | { type: 'cancel'; latestId: number }
  | { type: 'dispose' };
export type WorkerResponse =
  | { type: 'prepared' }
  | {
      type: 'result';
      jobId: number;
      width: number;
      height: number;
      buffer: ArrayBuffer;
      selection: StudioSelection;
    }
  | { type: 'error'; jobId: number; message: string };
export type SurfaceRole = SceneSurface['role'];
export interface RenderController {
  render(
    job: Omit<RenderJob, 'id'>,
  ): Promise<{ jobId: number; pixels: PixelBuffer; selection: StudioSelection }>;
  /** The editable surface under a point (0–1 of the frame) of the prepared room, or null. */
  hitTest(sceneId: string, x: number, y: number): SurfaceRole | null;
  /** The room and variant currently prepared (null before the first frame). */
  prepared(): { sceneId: string; scale: 1 | 0.5 } | null;
  cancel(): void;
  dispose(): void;
}
