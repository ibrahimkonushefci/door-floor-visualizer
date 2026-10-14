// Public paths of the on-device floor segmentation runtime (scripts/prepare-photo-tool.ts).
// They are fetched only when a visitor opens the own-room photo tool, never by the
// catalog or the Studio rooms, and are not part of the offline pack.
export const SEGMENTATION_FILES = {
  model: '/models/segformer-b0-ade/model_quantized.onnx',
  modelLicense: '/models/segformer-b0-ade/LICENSE.txt',
  runtime: '/models/ort/ort.wasm.bundle.min.mjs',
  runtimeWasm: '/models/ort/ort-wasm-simd-threaded.wasm',
  runtimeLicense: '/models/ort/NOTICE.txt',
} as const;
/** A real room photograph (Unsplash) for trying the tool without a photo of one's own. */
export const PHOTO_SAMPLE = '/media/studio-photo/sample-room.jpg';
