export type Locale = 'sq' | 'en' | 'de';
export type LocalizedText = { sq: string; en?: string; de?: string };
export type Id = string;                       // /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export type HexColor = `#${string}`;           // runtime: exactly six hexadecimal digits
export type LocalAssetPath = string;           // /media/... or /brand/...; optional ?rev=<hex>; no traversal/remote URL
export type Vec2 = readonly [number, number];
export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];
export type Mat3 = readonly [number,number,number,number,number,number,number,number,number];
export type RGB = readonly [number, number, number]; // linear RGB, unless name says Srgb
export type TrimMode = 'door' | 'floor' | 'black';
export type FrameType = 'standard-casing' | 'concealed-aluminium' | 'slim-aluminium';
export type FloorPattern = 'straight' | 'herringbone' | 'chevron';
export type ACClass = 'AC4' | 'AC5';
export type UsageClass = 32 | 33;
export type OriginCountry = 'DE' | 'SI' | 'TR' | 'CN' | 'AT' | 'CH' | 'XK';
export type CategoryId = 'all' | 'interior-doors' | 'hidden-doors' | 'laminate' | 'parquet' | 'trim';

export interface BrandConfig {
  schemaVersion: 1;
  id: Id;
  companyName: string;
  shortName: string;                          // <= 18 characters for 320px header
  tagline: LocalizedText;                    // metadata/footer only, never hero
  logo: { src: LocalAssetPath; width: number; height: number; alt: LocalizedText };
  favicon: LocalAssetPath;
  colors: { primary: HexColor; accent: HexColor; background: HexColor };
  contact: { phone: string | null; whatsapp: string | null; viber: string | null };
  siteUrl: string | null;                    // null in local demo; HTTPS origin in live build
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
  source: string;                            // brand/assets/... build input; stripped from client
  alt: LocalizedText;
  focalPoint: Vec2;                          // normalized 0..1, card crop only
  role: 'room' | 'product' | 'detail';
}
export interface Evidence {
  status: 'demo' | 'supplier-verified';
  sourceUrl: string | null;
  checkedAt: string | null;                  // ISO date, mandatory for supplier-verified
  note: LocalizedText;
}
export interface ProductBase {
  id: Id;
  slug: Id;
  sku: string;
  name: LocalizedText;
  summary: LocalizedText;                    // <= 200 chars per locale; no invented sales claims
  originCountry: OriginCountry | null;
  manufacturer: string | null;
  imageIds: readonly Id[];                   // resolves images[]; first is cover
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
  roughOpeningWidthMm: number | null;        // unknown unless supplier confirms
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
  compatibleSceneIds: readonly Id[];
}
export interface FloorProduct extends ProductBase {
  kind: 'floor';
  collectionId: Id;                           // all floor engineering facts live in materials.json
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
  | { kind: 'texture'; texture: LocalAssetPath; physicalSizeMm: Vec2;
      grainAxis: 'u' | 'v'; fit: 'repeat' | 'stretch-leaf'; fallbackColorSrgb: HexColor };
export interface TrimAppearance {
  appearance: SurfaceAppearance;              // texture without floor seams
  specularStrength: number;                    // 0..0.2; default .02
}
export interface OpaqueDoorFinish {
  id: Id;
  kind: 'opaque';
  name: LocalizedText;
  swatchColorSrgb: HexColor;
  appearance: SurfaceAppearance;
  sheen: 'matte' | 'satin';
  specularStrength: number;                    // 0..0.2
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

export interface FloorAtlas {
  image: LocalAssetPath;                       // seamless, orthographic, color/albedo only
  repeatSizeMm: Vec2;                          // actual world area of entire repeat, NOT one board
  repeatPixels: readonly [number, number];
  boardSizeMm: { length: number; width: number };
  pattern: FloorPattern;
  boardsPerRepeat: number;                     // authored atlas metadata; verified against artwork
  bevelWidthMm: number;                        // 0 for flat; no additional runtime seam overlay
  chevronCutAngleDeg: 45 | 60 | null;           // non-null only for chevron
}
export interface FloorCollectionBase {
  id: Id;
  name: LocalizedText;
  thicknessMm: number;
  bevel: '4v' | 'flat';
  atlas: FloorAtlas;
  trim: TrimAppearance;
  swatchColorSrgb: HexColor;
  specularStrength: number;                    // 0..0.2; default .04
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
  usageClass?: never;                         // expand only with future documented product evidence
}
export type FloorCollection = LaminateCollection | ParquetCollection;

export interface SurfaceMask {
  alpha: LocalAssetPath;                      // grayscale PNG; read red channel as coverage, alpha=255
  boundsPx: readonly [number, number, number, number]; // x,y,width,height at source resolution
}
export interface LightingPlate {
  diffuse: LocalAssetPath;                    // cleaned grayscale sRGB illumination, opaque PNG
  baselineLinear: number;                     // median Y of author-marked neutral patch, > .02
  shadeMin: 0.18;
  shadeMax: 1.65;
  specular: LocalAssetPath | null;             // opaque RGB image, black=no reflected contribution
  specularIncludedInDiffuse: false;           // fail validation if reused twice
}
export interface PlanarMapping {
  worldQuadMm: Quad;                         // ordered perimeter, non-self-intersecting, area > 0
  imageQuad01: Quad;                         // same corresponding points; normalized to photo bounds
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
  uvRotationDeg: 0 | 90;                      // grain on trim rail vs stile; floor rotation in state
}
export interface DoorInsert {
  variantKey: 'smoke-glass-black';
  rgba: LocalAssetPath;                       // aligned full-scene transparent PNG, prelit
  replacementMask: SurfaceMask;              // covers complete opaque leaf/profile being replaced
  protectedMask: SurfaceMask;                // variant-specific; permits replacing old handle/casing
  allowedFrameModes: readonly TrimMode[];     // ['black'] for this variant
  sourceNote: string;
}
export interface StudioSelection {
  version: 1;
  sceneId: Id;
  doorProductId: Id;
  doorFinishId: Id;
  floorProductId: Id;
  frameMode: TrimMode;
  skirtingMode: TrimMode;
  floorRotationDeg: 0 | 90;
}
export interface RoomScene {
  id: Id;
  name: LocalizedText;
  description: LocalizedText;
  width: number;                             // canonical 1600
  height: number;                            // canonical 1200
  base: LocalAssetPath;                      // immutable room photo
  thumbnail: LocalAssetPath;
  fallback: LocalAssetPath;                  // pre-rendered DEFAULT selection, not an arbitrary room
  frameType: 'standard-casing' | 'concealed-aluminium';
  depictedDoorSizeMm: { width: 800 | 900; height: 2000 };
  surfaces: readonly SceneSurface[];
  protectedMask: SurfaceMask;                // hardware/furniture/walls that must remain unchanged
  foreground: LocalAssetPath | null;         // transparent details if not already preserved by masks
  doorInserts: readonly DoorInsert[];
  allowedDoorProductIds: readonly Id[];
  allowedFloorProductIds: readonly Id[];
  allowedFrameModes: readonly TrimMode[];
  allowedSkirtingModes: readonly TrimMode[];
  defaultSelection: StudioSelection;
  assetRevision: string;                      // changes whenever pixels/calibration change
}
export interface MaterialsConfig {
  schemaVersion: 1;
  doorFinishes: readonly DoorFinish[];
  floorCollections: readonly FloorCollection[];
  scenes: readonly RoomScene[];
}
export interface SiteData { brand: BrandConfig; products: ProductsConfig; materials: MaterialsConfig }
export interface SceneCalibration {
  schemaVersion: 1;
  scene: RoomScene;
  sourceCrop: { originalWidth:number; originalHeight:number;
    cropPx:readonly [number,number,number,number]; outputWidth:1600; outputHeight:1200 };
  neutralPatches: readonly {surfaceId:Id; polygon01:readonly Vec2[];
    medianLinear:number; measurementNote:string}[];
  references: readonly {label:string; planeSurfaceId:Id; lengthMm:number;
    imageSegment01:readonly [Vec2,Vec2]; provenance:string}[];
}
