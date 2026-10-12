import type {
  Mat3,
  MaterialsConfig,
  Product,
  RoomScene,
  SceneSurface,
  StudioSelection,
} from '../data/types';
import type { PixelBuffer, FloatTexture } from './render/sampling';
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
  | { type: 'door'; productId: string; finishId: string }
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
}
export interface PreparedScene {
  scene: RoomScene;
  base: PixelBuffer;
  surfaces: readonly PreparedSurface[];
  protectedMask: Uint8Array;
  foreground: PixelBuffer | null;
  inserts: ReadonlyMap<string, PixelBuffer>;
  insertMasks: ReadonlyMap<string, { replacement: Uint8Array; protected: Uint8Array }>;
}
export interface PreparedMaterials {
  textures: ReadonlyMap<string, readonly FloatTexture[]>;
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
export interface RenderController {
  render(
    job: Omit<RenderJob, 'id'>,
  ): Promise<{ jobId: number; pixels: PixelBuffer; selection: StudioSelection }>;
  cancel(): void;
  dispose(): void;
}
