export type Locale = 'sq' | 'en' | 'de';
export type LocalizedText = { sq: string; en?: string; de?: string };
export type Id = string; // /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export type HexColor = `#${string}`; // runtime: exactly six hexadecimal digits
export type LocalAssetPath = string; // /media/... or /brand/...; optional ?rev=<hex>; no traversal/remote URL
export type Vec2 = readonly [number, number];
export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export type RGB = readonly [number, number, number]; // linear RGB, unless name says Srgb
export type TrimMode = 'door' | 'floor' | 'black';
export type FrameType = 'standard-casing' | 'concealed-aluminium' | 'slim-aluminium';
export type FloorPattern = 'straight' | 'herringbone' | 'chevron';
export type ACClass = 'AC4' | 'AC5';
export type UsageClass = 32 | 33;
export type OriginCountry = 'DE' | 'SI' | 'TR' | 'CN' | 'AT' | 'CH' | 'XK';
export type CategoryId =
  'all' | 'interior-doors' | 'hidden-doors' | 'laminate' | 'parquet' | 'trim';

export interface BrandConfig {
  schemaVersion: 1;
  id: Id;
  companyName: string;
  shortName: string; // <= 18 characters for 320px header
  tagline: LocalizedText; // metadata/footer only, never hero
  logo: { src: LocalAssetPath; width: number; height: number; alt: LocalizedText };
  favicon: LocalAssetPath;
  colors: { primary: HexColor; accent: HexColor; background: HexColor };
  contact: { phone: string | null; whatsapp: string | null; viber: string | null };
  siteUrl: string | null; // null in local demo; HTTPS origin in live build
  city: LocalizedText;
  locales: readonly ['sq', 'en', 'de'];
  defaultLocale: 'sq';
  demoMode: boolean;
  demoNotice: LocalizedText;
  catalogVersion: string;
  offline: { enabled: boolean; maxStudioDownloadBytes: number };
}

export interface ImageRef {
  id: Id;
  source: string; // brand/assets/... build input; stripped from client
  alt: LocalizedText;
  focalPoint: Vec2; // normalized 0..1, card crop only
  role: 'room' | 'product' | 'detail';
}
export interface Evidence {
  status: 'demo' | 'supplier-verified';
  sourceUrl: string | null;
  checkedAt: string | null; // ISO date, mandatory for supplier-verified
  note: LocalizedText;
}
export interface ProductBase {
  id: Id;
  slug: Id;
  sku: string;
  name: LocalizedText;
  summary: LocalizedText; // <= 200 chars per locale; no invented sales claims
  originCountry: OriginCountry | null;
  manufacturer: string | null;
  imageIds: readonly Id[]; // resolves images[]; first is cover
  relatedProductIds: readonly Id[];
  evidence: Evidence;
  displayOrder: number;
  published: boolean;
}
export interface DoorSize {
  id: Id;
  leafWidthMm: 700 | 800 | 900;
  leafHeightMm: 2000;
  leafThicknessMm: number | null;
  roughOpeningWidthMm: number | null; // unknown unless supplier confirms
  roughOpeningHeightMm: number | null;
}
export interface DoorProduct extends ProductBase {
  kind: 'door';
  doorType: 'standard' | 'hidden' | 'glass';
  frameType: FrameType;
  construction: 'mdf' | 'solid-core' | 'solid-wood' | 'aluminium-glass';
  surface: 'melamine' | 'cpl' | 'paint' | 'glass';
  roomUses: readonly ('living' | 'bedroom' | 'bathroom')[]; // suitability is demo unless verified
  sizes: readonly DoorSize[];
  defaultSizeId: Id;
  finishIds: readonly Id[];
  defaultFinishId: Id;
  /** Leaf designs this door line is made in (materials.doorModels). */
  modelIds: readonly Id[];
  defaultModelId: Id;
  compatibleSceneIds: readonly Id[];
}
export interface FloorProduct extends ProductBase {
  kind: 'floor';
  collectionId: Id; // all floor engineering facts live in materials.json
  compatibleSceneIds: readonly Id[];
}
export interface TrimProduct extends ProductBase {
  kind: 'trim';
  trimType: 'architrave' | 'skirting';
  dimensionsMm: { length: number; height: number; depth: number };
  material: 'mdf' | 'wood' | 'aluminium';
  supportedModes: readonly TrimMode[];
}
export type Product = DoorProduct | FloorProduct | TrimProduct;
export interface ProductsConfig {
  schemaVersion: 1;
  images: readonly ImageRef[];
  products: readonly Product[];
}

export type SurfaceAppearance =
  | { kind: 'solid'; colorSrgb: HexColor }
  | {
      kind: 'texture';
      texture: LocalAssetPath;
      physicalSizeMm: Vec2;
      grainAxis: 'u' | 'v';
      fit: 'repeat' | 'stretch-leaf';
      fallbackColorSrgb: HexColor;
    };
export interface TrimAppearance {
  appearance: SurfaceAppearance; // texture without floor seams
  specularStrength: number; // 0..0.2; default .02
}
export interface OpaqueDoorFinish {
  id: Id;
  kind: 'opaque';
  name: LocalizedText;
  swatchColorSrgb: HexColor;
  appearance: SurfaceAppearance;
  sheen: 'matte' | 'satin';
  specularStrength: number; // 0..0.2
  trim: TrimAppearance;
}
export interface GlassDoorFinish {
  id: Id;
  kind: 'glass';
  name: LocalizedText;
  swatchColorSrgb: HexColor;
  variantKey: 'smoke-glass-black';
  trim: TrimAppearance;
}
export type DoorFinish = OpaqueDoorFinish | GlassDoorFinish;
/** A leaf design, chosen separately from the finish (flat, grooved, glass insert, filomuro …). */
export interface DoorModel {
  id: Id;
  name: LocalizedText;
  description: LocalizedText;
  frameType: FrameType; // concealed-aluminium = flush (filomuro), no casing
  icon: 'flat' | 'grooved' | 'glass-insert' | 'filomuro' | 'all-glass';
}
/** Where a floor décor's look and article data come from (brand-swappable). */
export interface SupplierDecor {
  supplier: Id; // tools/decors/<supplier>.json
  brand: string;
  code: string; // manufacturer décor number
  collection: string;
  structure: string;
  sourceUrl: string; // official product page
  checkedAt: string; // ISO date
  usage: 'private-pitch-only' | 'licensed'; // private pitch only until written permission
}

export interface FloorAtlas {
  image: LocalAssetPath; // seamless, orthographic, color/albedo only
  repeatSizeMm: Vec2; // actual world area of entire repeat, NOT one board
  repeatPixels: readonly [number, number];
  boardSizeMm: { length: number; width: number };
  pattern: FloorPattern;
  boardsPerRepeat: number; // authored atlas metadata; verified against artwork
  bevelWidthMm: number; // 0 for flat; no additional runtime seam overlay
  chevronCutAngleDeg: 45 | 60 | null; // non-null only for chevron
}
/** Individual board images for position-map floors (one per variant, stacked vertically). */
export interface PlankSheet {
  image: LocalAssetPath; // sRGB albedo; variant k occupies rows k*variantPx[1]..(k+1)*variantPx[1]
  variants: number;
  variantPx: readonly [number, number]; // one board: length x width in pixels
  pxPerMm: number; // native detail; boards are boardSizeMm at this density
}
export interface FloorCollectionBase {
  id: Id;
  name: LocalizedText;
  thicknessMm: number;
  bevel: '4v' | 'flat';
  atlas: FloorAtlas;
  planks?: PlankSheet;
  trim: TrimAppearance;
  swatchColorSrgb: HexColor;
  specularStrength: number; // 0..0.2; default .04 (per-product gloss)
  decor?: SupplierDecor;
}
export interface LaminateCollection extends FloorCollectionBase {
  kind: 'laminate';
  thicknessMm: 8 | 10 | 12;
  acClass: ACClass;
  usageClass: UsageClass;
  wearLayerMm?: never;
  woodSpecies?: never;
}
export interface ParquetCollection extends FloorCollectionBase {
  kind: 'parquet';
  construction: 'engineered' | 'solid';
  woodSpecies: LocalizedText;
  wearLayerMm: number | null;
  acClass?: never;
  usageClass?: never; // expand only with future documented product evidence
}
export type FloorCollection = LaminateCollection | ParquetCollection;

export interface SurfaceMask {
  alpha: LocalAssetPath; // grayscale PNG; read red channel as coverage, alpha=255
  boundsPx: readonly [number, number, number, number]; // x,y,width,height at source resolution
}
export interface LightingPlate {
  diffuse: LocalAssetPath; // cleaned grayscale sRGB illumination, opaque PNG
  baselineLinear: number; // median Y of author-marked neutral patch, > .02 (rendered: 1 / light scale)
  shadeMin: number; // 0.18 for photo plates; 0 for rendered plates (true contact shadows)
  shadeMax: number; // 1.65 for photo plates
  specular: LocalAssetPath | null; // opaque RGB image, black=no reflected contribution
  specularIncludedInDiffuse: false; // fail validation if reused twice
  specularScale?: number; // linear reflection = plate * specularScale * (specularStrength / 0.04)
  tint?: RGB; // linear light colour relative to the grayscale plate (rendered scenes)
}
/**
 * Floor world position from a 3D render (16-bit grey+alpha PNG: grey = X, alpha = Y).
 * Sample (i, j) is the centre of scene pixel (x + i*stepPx, y + j*stepPx); the
 * map has floor((w-1)/stepPx)+2 by floor((h-1)/stepPx)+2 samples.
 */
export interface PositionMap {
  image: LocalAssetPath;
  boundsPx: readonly [number, number, number, number]; // x,y,width,height at scene resolution
  originMm: Vec2; // world position of value 0
  unitMm: number; // millimetres per 16-bit step
  stepPx: number; // scene pixels between samples
}
export interface PlanarMapping {
  worldQuadMm: Quad; // ordered perimeter, non-self-intersecting, area > 0
  imageQuad01: Quad; // same corresponding points; normalized to photo bounds
  calibration: {
    method: 'measured-plane' | 'authored-reference';
    note: string;
    referenceLengthMm: number;
    referenceImageSegment01: readonly [Vec2, Vec2];
    referenceWorldSegmentMm: readonly [Vec2, Vec2];
  };
}
export interface SceneSurface {
  id: Id;
  role: 'floor' | 'door-leaf' | 'frame' | 'skirting';
  mask: SurfaceMask;
  lighting: LightingPlate;
  mapping: PlanarMapping;
  uvRotationDeg: 0 | 90; // grain on trim rail vs stile; floor rotation in state
  positionMap?: PositionMap; // floor only; replaces the homography for board lookup
}
/** Scenes rendered in Blender (tools/blender) rather than authored from a photograph. */
export interface SceneRender {
  source: 'blender';
  partitionedMasks: true; // masks + protected coverage sum to <= 1; protection is not subtracted
  toneShoulder: number; // highlight shoulder shared by base plate and runtime surfaces
}
export interface DoorInsert {
  variantKey: 'smoke-glass-black';
  rgba: LocalAssetPath; // aligned full-scene transparent PNG, prelit
  replacementMask: SurfaceMask; // covers complete opaque leaf/profile being replaced
  protectedMask: SurfaceMask; // variant-specific; permits replacing old handle/casing
  allowedFrameModes: readonly TrimMode[]; // ['black'] for this variant
  sourceNote: string;
}
export interface StudioSelection {
  version: 1;
  sceneId: Id;
  doorProductId: Id;
  doorModelId: Id;
  doorFinishId: Id;
  floorProductId: Id;
  frameMode: TrimMode;
  skirtingMode: TrimMode;
  floorRotationDeg: 0 | 90;
}
/**
 * A door model rendered into a scene. The scene's own layers are its default
 * model (patch null); every other model replaces pixels only inside regionPx.
 */
export interface SceneDoorModel {
  modelId: Id;
  frameType: 'standard-casing' | 'concealed-aluminium';
  patch: DoorModelPatch | null;
}
export interface DoorModelPatch {
  regionPx: readonly [number, number, number, number];
  base: LocalAssetPath; // region-sized crop
  original: LocalAssetPath | null; // region-sized crop
  /** Region-sized crops; each is pasted over `over` (a full-size scene layer) or over zeros. */
  layers: readonly { image: LocalAssetPath; over: LocalAssetPath | null }[];
  surfaces: readonly SceneSurface[]; // the model's complete surface list
  protectedMask: SurfaceMask;
  allowedFrameModes: readonly TrimMode[];
}
// Room-type filter in the Studio room picker.
export const ROOM_TYPES = ['living', 'kitchen', 'bedroom', 'hallway', 'kids', 'bathroom'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
export interface RoomScene {
  id: Id;
  name: LocalizedText;
  description: LocalizedText;
  roomType?: RoomType; // rendered rooms; retired photo fixtures have none
  width: number; // canonical 1600 (photo) or 2400 (rendered)
  height: number; // canonical 1200 (photo) or 1800 (rendered)
  base: LocalAssetPath; // immutable room photo
  original?: LocalAssetPath; // shown by compare-with-original when the base is not presentable
  render?: SceneRender;
  thumbnail: LocalAssetPath;
  fallback: LocalAssetPath; // pre-rendered DEFAULT selection, not an arbitrary room
  frameType: 'standard-casing' | 'concealed-aluminium';
  depictedDoorSizeMm: { width: 800 | 900; height: 2000 };
  surfaces: readonly SceneSurface[];
  protectedMask: SurfaceMask; // hardware/furniture/walls that must remain unchanged
  foreground: LocalAssetPath | null; // transparent details if not already preserved by masks
  doorInserts: readonly DoorInsert[];
  doorModels?: readonly SceneDoorModel[]; // rendered scenes; first entry is the default model
  allowedDoorProductIds: readonly Id[];
  allowedFloorProductIds: readonly Id[];
  allowedFrameModes: readonly TrimMode[];
  allowedSkirtingModes: readonly TrimMode[];
  defaultSelection: StudioSelection;
  assetRevision: string; // changes whenever pixels/calibration change
}
export interface MaterialsConfig {
  schemaVersion: 1;
  doorModels: readonly DoorModel[];
  doorFinishes: readonly DoorFinish[];
  floorCollections: readonly FloorCollection[];
  scenes: readonly RoomScene[];
}
export interface SiteData {
  brand: BrandConfig;
  products: ProductsConfig;
  materials: MaterialsConfig;
}
export type SceneCalibration = PhotoSceneCalibration | RenderedSceneCalibration;
export interface RenderedSceneCalibration {
  schemaVersion: 1;
  kind: 'rendered';
  scene: RoomScene;
  renderManifest: string; // file name next to calibration.json
}
export interface PhotoSceneCalibration {
  schemaVersion: 1;
  kind?: 'photo';
  scene: RoomScene;
  sourceCrop: {
    originalWidth: number;
    originalHeight: number;
    cropPx: readonly [number, number, number, number];
    outputWidth: 1600;
    outputHeight: 1200;
  };
  neutralPatches: readonly {
    surfaceId: Id;
    polygon01: readonly Vec2[];
    medianLinear: number;
    measurementNote: string;
  }[];
  references: readonly {
    label: string;
    planeSurfaceId: Id;
    lengthMm: number;
    imageSegment01: readonly [Vec2, Vec2];
    provenance: string;
  }[];
}
