import { z } from 'zod';
import type { BrandConfig, ProductsConfig, MaterialsConfig, SceneCalibration } from './types';
export const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const positive = z.number().finite().positive();
const fraction = z.number().finite().min(0).max(1);
export const localizedTextSchema = z.strictObject({
  sq: z.string().trim().min(1),
  en: z.string().optional(),
  de: z.string().optional(),
});
export const hexSchema = z
  .templateLiteral(['#', z.string()])
  .refine(v => /^#[0-9a-f]{6}$/i.test(v), 'Expected six-digit hex color');
export const assetPathSchema = z
  .string()
  .refine(
    v => /^\/(media|brand)\/[a-zA-Z0-9/_\.\-]+(?:\?rev=[a-f0-9]+)?$/.test(v) && !v.includes('..'),
    'Expected local asset path without traversal',
  );
const vec = z.tuple([z.number().finite(), z.number().finite()]);
const vec01 = z.tuple([fraction, fraction]);
const quad = z.tuple([vec, vec, vec, vec]);
const quad01 = z.tuple([vec, vec, vec, vec]);
const trimMode = z.enum(['door', 'floor', 'black']);
const phone = z
  .string()
  .transform(v => v.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+[0-9]{8,15}$/))
  .nullable();
export const brandSchema: z.ZodType<BrandConfig> = z.strictObject({
  schemaVersion: z.literal(1),
  id: idSchema,
  companyName: z.string().trim().min(1),
  shortName: z.string().trim().min(1).max(18),
  tagline: localizedTextSchema,
  logo: z.strictObject({
    src: assetPathSchema,
    width: positive,
    height: positive,
    alt: localizedTextSchema,
  }),
  favicon: assetPathSchema,
  colors: z.strictObject({ primary: hexSchema, accent: hexSchema, background: hexSchema }),
  contact: z.strictObject({ phone, whatsapp: phone, viber: phone }),
  siteUrl: z
    .url()
    .refine(v => {
      const u = new URL(v);
      return (
        u.protocol === 'https:' &&
        u.origin === v.replace(/\/$/, '') &&
        !u.username &&
        !u.password &&
        !['localhost', '127.0.0.1'].includes(u.hostname)
      );
    }, 'Expected public HTTPS origin')
    .nullable(),
  city: localizedTextSchema,
  locales: z.tuple([z.literal('sq'), z.literal('en'), z.literal('de')]),
  defaultLocale: z.literal('sq'),
  demoMode: z.boolean(),
  demoNotice: localizedTextSchema,
  catalogVersion: z.string().trim().min(1),
  offline: z.strictObject({ enabled: z.boolean(), maxStudioDownloadBytes: positive }),
});
const evidence = z
  .strictObject({
    status: z.enum(['demo', 'supplier-verified']),
    sourceUrl: z.url().nullable(),
    checkedAt: z.iso.date().nullable(),
    note: localizedTextSchema,
  })
  .refine(
    v => v.status === 'demo' || (v.sourceUrl !== null && v.checkedAt !== null),
    'Supplier evidence requires source and date',
  );
const base = {
  id: idSchema,
  slug: idSchema,
  sku: z.string().trim().min(1),
  name: localizedTextSchema,
  summary: localizedTextSchema.refine(
    v => Object.values(v).every(s => s.length <= 200),
    'Summary max 200 characters',
  ),
  originCountry: z.enum(['DE', 'SI', 'TR', 'CN', 'AT', 'CH', 'XK']).nullable(),
  manufacturer: z.string().trim().min(1).nullable(),
  imageIds: z.array(idSchema),
  relatedProductIds: z.array(idSchema),
  evidence,
  displayOrder: z.number().int().nonnegative(),
  published: z.boolean(),
};
const size = z.strictObject({
  id: idSchema,
  leafWidthMm: z.union([z.literal(700), z.literal(800), z.literal(900)]),
  leafHeightMm: z.literal(2000),
  leafThicknessMm: positive.nullable(),
  roughOpeningWidthMm: positive.nullable(),
  roughOpeningHeightMm: positive.nullable(),
});
const door = z
  .strictObject({
    ...base,
    kind: z.literal('door'),
    doorType: z.enum(['standard', 'hidden', 'glass']),
    frameType: z.enum(['standard-casing', 'concealed-aluminium', 'slim-aluminium']),
    construction: z.enum(['mdf', 'solid-core', 'solid-wood', 'aluminium-glass']),
    surface: z.enum(['melamine', 'cpl', 'paint', 'glass']),
    roomUses: z.array(z.enum(['living', 'bedroom', 'bathroom'])),
    sizes: z.array(size).min(1),
    defaultSizeId: idSchema,
    finishIds: z.array(idSchema).min(1),
    defaultFinishId: idSchema,
    modelIds: z.array(idSchema).min(1),
    defaultModelId: idSchema,
    compatibleSceneIds: z.array(idSchema),
  })
  .superRefine((v, ctx) => {
    const frames = {
      standard: 'standard-casing',
      hidden: 'concealed-aluminium',
      glass: 'slim-aluminium',
    };
    if (
      v.frameType !== frames[v.doorType] ||
      (v.doorType === 'glass') !== (v.construction === 'aluminium-glass' && v.surface === 'glass')
    )
      ctx.addIssue({ code: 'custom', message: 'Contradictory door type/frame/construction' });
    if (
      !v.sizes.some(s => s.id === v.defaultSizeId) ||
      !v.finishIds.includes(v.defaultFinishId) ||
      !v.modelIds.includes(v.defaultModelId)
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid default variant' });
  });
const floor = z.strictObject({
  ...base,
  kind: z.literal('floor'),
  collectionId: idSchema,
  compatibleSceneIds: z.array(idSchema),
});
const trim = z.strictObject({
  ...base,
  kind: z.literal('trim'),
  trimType: z.enum(['architrave', 'skirting']),
  dimensionsMm: z.strictObject({ length: positive, height: positive, depth: positive }),
  material: z.enum(['mdf', 'wood', 'aluminium']),
  supportedModes: z.array(trimMode).min(1),
});
export const productsSchema: z.ZodType<ProductsConfig> = z.strictObject({
  schemaVersion: z.literal(1),
  images: z.array(
    z.strictObject({
      id: idSchema,
      source: z
        .string()
        .refine(
          v => /^brand\/assets\/[a-zA-Z0-9/_\.\-]+$/.test(v) && !v.includes('..'),
          'Invalid source path',
        ),
      alt: localizedTextSchema,
      focalPoint: vec01,
      role: z.enum(['room', 'product', 'detail']),
    }),
  ),
  products: z.array(z.discriminatedUnion('kind', [door, floor, trim])),
});
const appearance = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('solid'), colorSrgb: hexSchema }),
  z.strictObject({
    kind: z.literal('texture'),
    texture: assetPathSchema,
    physicalSizeMm: z.tuple([positive, positive]),
    grainAxis: z.enum(['u', 'v']),
    fit: z.enum(['repeat', 'stretch-leaf']),
    fallbackColorSrgb: hexSchema,
  }),
]);
const strength = z.number().finite().min(0).max(0.2);
const trimAppearance = z.strictObject({ appearance, specularStrength: strength });
const finish = z.discriminatedUnion('kind', [
  z.strictObject({
    id: idSchema,
    kind: z.literal('opaque'),
    name: localizedTextSchema,
    swatchColorSrgb: hexSchema,
    appearance,
    sheen: z.enum(['matte', 'satin']),
    specularStrength: strength,
    trim: trimAppearance,
  }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('glass'),
    name: localizedTextSchema,
    swatchColorSrgb: hexSchema,
    variantKey: z.literal('smoke-glass-black'),
    trim: trimAppearance,
  }),
]);
const doorModel = z.strictObject({
  id: idSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  frameType: z.enum(['standard-casing', 'concealed-aluminium', 'slim-aluminium']),
  icon: z.enum(['flat', 'grooved', 'glass-insert', 'filomuro', 'all-glass']),
});
const decor = z.strictObject({
  supplier: idSchema,
  brand: z.string().trim().min(1),
  code: z.string().trim().min(1),
  collection: z.string().trim().min(1),
  structure: z.string().trim().min(1),
  sourceUrl: z.url({ protocol: /^https$/ }),
  checkedAt: z.iso.date(),
  usage: z.enum(['private-pitch-only', 'licensed']),
});
const atlas = z
  .strictObject({
    image: assetPathSchema,
    repeatSizeMm: z.tuple([positive, positive]),
    repeatPixels: z.tuple([positive.int(), positive.int()]),
    boardSizeMm: z.strictObject({ length: positive, width: positive }),
    pattern: z.enum(['straight', 'herringbone', 'chevron']),
    boardsPerRepeat: positive.int(),
    bevelWidthMm: z.number().finite().nonnegative(),
    chevronCutAngleDeg: z.union([z.literal(45), z.literal(60)]).nullable(),
  })
  .superRefine((v, c) => {
    if ((v.pattern === 'chevron') !== (v.chevronCutAngleDeg !== null))
      c.addIssue({
        code: 'custom',
        message: 'Chevron requires cut angle; other patterns forbid it',
      });
    if (
      Math.abs(
        v.repeatPixels[0] / v.repeatPixels[1] / (v.repeatSizeMm[0] / v.repeatSizeMm[1]) - 1,
      ) > 0.005
    )
      c.addIssue({ code: 'custom', message: 'Atlas pixel/physical aspect mismatch' });
  });
const planks = z.strictObject({
  image: assetPathSchema,
  variants: positive.int(),
  variantPx: z.tuple([positive.int(), positive.int()]),
  pxPerMm: positive,
});
const collectionBase = {
  id: idSchema,
  name: localizedTextSchema,
  thicknessMm: positive,
  bevel: z.enum(['4v', 'flat']),
  atlas,
  planks: planks.optional(),
  trim: trimAppearance,
  swatchColorSrgb: hexSchema,
  specularStrength: strength,
  decor: decor.optional(),
};
const collection = z.discriminatedUnion('kind', [
  z.strictObject({
    ...collectionBase,
    kind: z.literal('laminate'),
    thicknessMm: z.union([z.literal(8), z.literal(10), z.literal(12)]),
    acClass: z.enum(['AC4', 'AC5']),
    usageClass: z.union([z.literal(32), z.literal(33)]),
  }),
  z.strictObject({
    ...collectionBase,
    kind: z.literal('parquet'),
    construction: z.enum(['engineered', 'solid']),
    woodSpecies: localizedTextSchema,
    wearLayerMm: positive.nullable(),
  }),
]);
const mask = z.strictObject({
  alpha: assetPathSchema,
  boundsPx: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    positive.int(),
    positive.int(),
  ]),
});
const lighting = z
  .strictObject({
    diffuse: assetPathSchema,
    baselineLinear: z.number().finite().gt(0.02),
    shadeMin: z.number().finite().min(0),
    shadeMax: z.number().finite().positive().max(64),
    specular: assetPathSchema.nullable(),
    specularIncludedInDiffuse: z.literal(false),
    specularScale: positive.optional(),
    tint: z.tuple([positive, positive, positive]).optional(),
  })
  .refine(v => v.shadeMin < v.shadeMax, 'shadeMin must be below shadeMax');
const bounds = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  positive.int(),
  positive.int(),
]);
const positionMap = z.strictObject({
  image: assetPathSchema,
  boundsPx: bounds,
  originMm: vec,
  unitMm: positive,
  stepPx: positive.int().max(16),
});
function convex(q: readonly (readonly number[])[]) {
  const signs = q.map((a, i) => {
    const b = q[(i + 1) % 4],
      c = q[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  return signs.every(v => v > 1e-10) || signs.every(v => v < -1e-10);
}
const mapping = z.strictObject({
  worldQuadMm: quad.refine(convex, 'Quad must be convex and nondegenerate'),
  imageQuad01: quad01.refine(convex, 'Quad must be convex and nondegenerate'),
  calibration: z.strictObject({
    method: z.enum(['measured-plane', 'authored-reference']),
    note: z.string().trim().min(1),
    referenceLengthMm: positive,
    referenceImageSegment01: z.tuple([vec01, vec01]),
    referenceWorldSegmentMm: z.tuple([vec, vec]),
  }),
});
export const selectionSchema = z.strictObject({
  version: z.literal(1),
  sceneId: idSchema,
  doorProductId: idSchema,
  doorModelId: idSchema,
  doorFinishId: idSchema,
  floorProductId: idSchema,
  frameMode: trimMode,
  skirtingMode: trimMode,
  floorRotationDeg: z.union([z.literal(0), z.literal(90)]),
});
const surface = z.strictObject({
  id: idSchema,
  role: z.enum(['floor', 'door-leaf', 'frame', 'skirting']),
  mask,
  lighting,
  mapping,
  uvRotationDeg: z.union([z.literal(0), z.literal(90)]),
  positionMap: positionMap.optional(),
});
const sceneDoorModel = z.strictObject({
  modelId: idSchema,
  frameType: z.enum(['standard-casing', 'concealed-aluminium']),
  patch: z
    .strictObject({
      regionPx: bounds,
      base: assetPathSchema,
      original: assetPathSchema.nullable(),
      layers: z.array(z.strictObject({ image: assetPathSchema, over: assetPathSchema.nullable() })),
      surfaces: z.array(surface),
      protectedMask: mask,
      allowedFrameModes: z.array(trimMode).min(1),
    })
    .nullable(),
});
const scene = z.strictObject({
  id: idSchema,
  name: localizedTextSchema,
  description: localizedTextSchema,
  width: positive.int(),
  height: positive.int(),
  base: assetPathSchema,
  original: assetPathSchema.optional(),
  render: z
    .strictObject({
      source: z.literal('blender'),
      partitionedMasks: z.literal(true),
      toneShoulder: z.number().finite().gt(0).lt(1),
    })
    .optional(),
  thumbnail: assetPathSchema,
  fallback: assetPathSchema,
  frameType: z.enum(['standard-casing', 'concealed-aluminium']),
  depictedDoorSizeMm: z.strictObject({
    width: z.union([z.literal(800), z.literal(900)]),
    height: z.literal(2000),
  }),
  surfaces: z.array(surface),
  protectedMask: mask,
  foreground: assetPathSchema.nullable(),
  doorInserts: z.array(
    z.strictObject({
      variantKey: z.literal('smoke-glass-black'),
      rgba: assetPathSchema,
      replacementMask: mask,
      protectedMask: mask,
      allowedFrameModes: z.array(trimMode).min(1),
      sourceNote: z.string().trim().min(1),
    }),
  ),
  doorModels: z.array(sceneDoorModel).min(1).optional(),
  allowedDoorProductIds: z.array(idSchema),
  allowedFloorProductIds: z.array(idSchema),
  allowedFrameModes: z.array(trimMode),
  allowedSkirtingModes: z.array(trimMode),
  defaultSelection: selectionSchema,
  assetRevision: z.string().trim().min(1),
});
export const materialsSchema: z.ZodType<MaterialsConfig> = z.strictObject({
  schemaVersion: z.literal(1),
  doorModels: z.array(doorModel).min(1),
  doorFinishes: z.array(finish),
  floorCollections: z.array(collection),
  scenes: z.array(scene),
});
const photoCalibration = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('photo').optional(),
  scene,
  sourceCrop: z.strictObject({
    originalWidth: positive,
    originalHeight: positive,
    cropPx: z.tuple([z.number().nonnegative(), z.number().nonnegative(), positive, positive]),
    outputWidth: z.literal(1600),
    outputHeight: z.literal(1200),
  }),
  neutralPatches: z.array(
    z.strictObject({
      surfaceId: idSchema,
      polygon01: z.array(vec01).min(3),
      medianLinear: positive,
      measurementNote: z.string().trim().min(1),
    }),
  ),
  references: z.array(
    z.strictObject({
      label: z.string().trim().min(1),
      planeSurfaceId: idSchema,
      lengthMm: positive,
      imageSegment01: z.tuple([vec01, vec01]),
      provenance: z.string().trim().min(1),
    }),
  ),
});
const renderedCalibration = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('rendered'),
  scene,
  renderManifest: z.string().regex(/^[a-z0-9-]+\.json$/),
});
export const calibrationSchema: z.ZodType<SceneCalibration> = z.union([
  renderedCalibration,
  photoCalibration,
]);
