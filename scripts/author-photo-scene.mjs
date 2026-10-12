// Reproducible scene authoring for a REAL photograph (not generated imagery).
//
// Input: brand/assets/scenes/entry-photo/base.png — the frozen 1600×1200 plate,
// cropped (left 2133×1600 of a 2400×1600 download) and resized from:
//   Alex Tyson, "An empty room with white doors and wooden floors", Unsplash
//   https://unsplash.com/photos/an-empty-room-with-white-doors-and-wooden-floors-K2qofQMdr6w
//   Unsplash License (free commercial use, no attribution required).
// Re-create the plate with:  node scripts/author-photo-scene.mjs --from <downloaded.jpg>
//
// Geometry was measured from luminance profiles of the plate (edges are straight
// lines in perspective). Floor and wall planes use a calibrated pinhole camera:
// the main wall and the corridor wall are perpendicular, so their vanishing points
// on the horizon fix the focal length, and the 2000 mm leaf fixes camera height.
import sharp from 'sharp';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { solveHomography, projectPoint } from '../src/lib/studio/render/homography.ts';

const ID = 'entry-photo',
  DIR = `brand/assets/scenes/${ID}`,
  W = 1600,
  H = 1200;
const SOURCE = {
  url: 'https://unsplash.com/photos/an-empty-room-with-white-doors-and-wooden-floors-K2qofQMdr6w',
  author: 'Alex Tyson (Unsplash @alextyson195)',
  license:
    'Unsplash License: free to use commercially and non-commercially, no permission or attribution required. Real photograph (Nikon Z 6), not AI-generated.',
  crop: [0, 0, 2133, 1600],
  original: [2400, 1600],
};

await mkdir(DIR, { recursive: true });
const fromIndex = process.argv.indexOf('--from');
if (fromIndex > 0) {
  const [x, y, w, h] = SOURCE.crop;
  await sharp(process.argv[fromIndex + 1])
    .extract({ left: x, top: y, width: w, height: h })
    .resize(W, H, { kernel: 'lanczos3' })
    .png()
    .toFile(`${DIR}/base.png`);
}

// ---- Camera model --------------------------------------------------------
const horizon = 600,
  principal = [W / 2, H / 2],
  vpWall = [3046, horizon], // main door wall (measured from leaf top/bottom edges)
  vpCorridor = [462, horizon], // corridor wall base line
  focal = Math.sqrt(-((vpWall[0] - principal[0]) * (vpCorridor[0] - principal[0]))),
  // Leaf: bottom-left (335,994) on the floor, top-left (335,45), 2000 mm tall.
  cameraHeight = 2000 / (1 + (horizon - 45) / (994 - horizon));
const wallDir = (() => {
  const v = [vpWall[0] - principal[0], focal],
    n = Math.hypot(...v);
  return [v[0] / n, v[1] / n];
})();
// Floor pixel → millimetres in a frame aligned with the main wall (x along it).
function floorMm([u, v]) {
  const t = cameraHeight / ((v - horizon) / focal),
    X = ((u - principal[0]) / focal) * t,
    Z = t;
  return [X * wallDir[0] + Z * wallDir[1], -X * wallDir[1] + Z * wallDir[0]];
}
const distance = (a, b) => {
  const p = floorMm(a),
    q = floorMm(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
};

// ---- Measured geometry (plate pixels) ------------------------------------
const lineY = (x0, y0, slope) => x => y0 + slope * (x - x0);
const casingOuterTop = lineY(340, 10, 0.215),
  leafTop = lineY(340, 46, 0.205),
  leftSkirtTop = lineY(70, 1015, -0.1286),
  leftSkirtBottom = lineY(70, 1045, -0.138),
  rightSkirtTop = lineY(790, 917, -0.142),
  rightSkirtBottom = lineY(790, 940, -0.158),
  corridorSkirtTop = lineY(1100, 808, 0.322),
  corridorSkirtBottom = lineY(1100, 822, 0.348);
const P = (x, f) => [x, Math.round(f(x) * 10) / 10];
const leaf = [
  [335, 45],
  [750, 130],
  [750, 934],
  [335, 994],
];
const frameTop = [P(290, casingOuterTop), P(781, casingOuterTop), P(781, x => leafTop(x) - 3), P(290, x => leafTop(x) - 3)].map(
  ([x, y]) => [x, Math.max(0, y)],
);
const frameLeft = [P(290, x => leafTop(x) - 3), P(333, x => leafTop(x) - 3), [333, 1008], [290, 1015]],
  frameRight = [P(753, x => leafTop(x) - 3), P(781, x => leafTop(x) - 3), [781, 942], [753, 946]];
const skirts = [
  ['main-left', [P(59, leftSkirtTop), P(291, leftSkirtTop), P(291, leftSkirtBottom), P(59, leftSkirtBottom)]],
  ['main-right', [P(781, rightSkirtTop), P(933, rightSkirtTop), P(933, rightSkirtBottom), P(781, rightSkirtBottom)]],
  ['corridor', [P(933, corridorSkirtTop), P(1126, corridorSkirtTop), P(1126, corridorSkirtBottom), P(933, corridorSkirtBottom)]],
  ['corridor-end', [P(1318, corridorSkirtTop), P(1430, corridorSkirtTop), P(1430, corridorSkirtBottom), P(1318, corridorSkirtBottom)]],
];
// Floor boundary sits 2px inside the trim so antialiased edges overlap; the
// partition below gives trim priority, so no original pixels show through.
const floor = [
  [59, 1044],
  [291, 1012],
  [333, 1005],
  [753, 944],
  [781, 940],
  [933, 915],
  [933, 761],
  [1432, 934],
  [1480, 948],
  [1566, 1036],
  [1567, 1100],
  [1567, 1200],
  [59, 1200],
];
const floorQuad = [
  [333, 1006],
  [933, 918],
  [1567, 1200],
  [120, 1200],
];
// Silver hardware (hinges, handle, lock) stays photographic.
const hardware = [
  [322, 140, 340, 186],
  [322, 832, 340, 880],
  [684, 500, 750, 562],
];

// ---- Helpers --------------------------------------------------------------
const normalized = p => p.map(([x, y]) => [x / W, y / H]);
const rect = (w, h) => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
async function maskRaster(polygons) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/>${polygons
    .map(p => `<polygon points="${p.map(v => v.join(',')).join(' ')}" fill="white"/>`)
    .join('')}</svg>`;
  return sharp(Buffer.from(svg)).removeAlpha().ensureAlpha().raw().toBuffer();
}
async function saveMask(name, data) {
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${DIR}/${name}.png`);
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let i = 0; i < W * H; i++)
    if (data[i * 4]) {
      const x = i % W,
        y = Math.floor(i / W);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return {
    alpha: `/media/scenes/${ID}/${name}.png`,
    boundsPx: x1 < 0 ? [0, 0, W, H] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
  };
}
const srgbLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// ---- Plates ---------------------------------------------------------------
const base = await sharp(`${DIR}/base.png`).ensureAlpha().raw().toBuffer();
await sharp(`${DIR}/base.png`).resize(320, 240).png().toFile(`${DIR}/thumbnail.png`);
const luminance = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++)
  luminance[i] = Math.round(0.2126 * base[i * 4] + 0.7152 * base[i * 4 + 1] + 0.0722 * base[i * 4 + 2]);

const protect = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) protect[i * 4 + 3] = 255;
for (const [x0, y0, x1, y1] of hardware)
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * W + x,
        coverage = Math.round(Math.max(0, Math.min(1, (205 - luminance[i]) / 25)) * 255);
      protect[i * 4] = protect[i * 4 + 1] = protect[i * 4 + 2] = coverage;
    }
const protectedMask = await saveMask('protected-mask', protect);

// White paint carries no texture, so trim/leaf light is the photo's luminance.
// The real oak floor does: its plate is a mask-normalised low-pass of the
// luminance, keeping light falloff, window sheen and contact shadows but not
// the original planks.
async function floorLight(maskData) {
  const weight = Buffer.alloc(W * H),
    weighted = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) {
    weight[i] = maskData[i * 4];
    weighted[i] = Math.round((luminance[i] * maskData[i * 4]) / 255);
  }
  const blur = b =>
    sharp(b, { raw: { width: W, height: H, channels: 1 } })
      .blur(22)
      .extractChannel(0)
      .raw()
      .toBuffer();
  const [num, den] = await Promise.all([blur(weighted), blur(weight)]);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++)
    out[i] = maskData[i * 4] ? Math.min(255, Math.round((num[i] / Math.max(1, den[i])) * 255)) : 0;
  return out;
}

const defs = [
  [
    'floor',
    'floor',
    floor,
    // Origin at the first corner: the camera's foot point projects to infinity.
    floorQuad.map(floorMm).map(([x, z], _, all) => [x - all[0][0], z - all[0][1]]),
    floorQuad,
  ],
  ['leaf', 'door-leaf', leaf, rect(Math.round(distance([335, 994], [750, 934])), 2000), leaf],
  ['frame-left', 'frame', frameLeft, rect(90, 2070), frameLeft],
  ['frame-right', 'frame', frameRight, rect(90, 2070), frameRight],
  ['frame-top', 'frame', frameTop, rect(Math.round(distance([290, 1015], [781, 942])), 90), frameTop],
  ...skirts.map(([name, poly]) => [
    `skirting-${name}`,
    'skirting',
    poly,
    rect(Math.round(distance(poly[3], poly[2])), 70),
    poly,
  ]),
];
const surfaces = [],
  neutralPatches = [],
  references = [];
for (const [id, role, poly, world, image] of defs) {
  const raster = await maskRaster([poly]),
    m = await saveMask(`${id}-mask`, raster),
    light = role === 'floor' ? await floorLight(raster) : luminance,
    plate = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = raster[i * 4] ? light[i] : 0;
    plate[i * 4] = plate[i * 4 + 1] = plate[i * 4 + 2] = v;
    plate[i * 4 + 3] = 255;
  }
  await sharp(plate, { raw: { width: W, height: H, channels: 4 } }).png().toFile(`${DIR}/${id}-diffuse.png`);
  // Neutral patch: 3×3 at the mask pixel nearest the image-quad centroid.
  let cx = Math.floor(image.reduce((n, p) => n + p[0], 0) / 4),
    cy = Math.floor(image.reduce((n, p) => n + p[1], 0) / 4);
  if (!raster[(cy * W + cx) * 4]) {
    const [bx, by, bw, bh] = m.boundsPx;
    cx = bx + Math.floor(bw / 2);
    cy = by + Math.floor(bh / 2);
  }
  const values = [];
  for (let y = cy - 1; y < cy + 2; y++)
    for (let x = cx - 1; x < cx + 2; x++) values.push(srgbLinear(plate[(y * W + x) * 4] / 255));
  values.sort((a, b) => a - b);
  const baseline = values[4];
  const homography = solveHomography(world, normalized(image)),
    start = world[0],
    end = [start[0] + (world[1][0] - start[0]) * 0.4, start[1] + (world[1][1] - start[1]) * 0.4];
  const calibration = {
    method: 'authored-reference',
    note:
      role === 'floor'
        ? 'Floor plane from a calibrated pinhole camera (perpendicular-wall vanishing points, 2000 mm leaf). See AUTHORING.md.'
        : 'Plane fitted to measured edges of the real photograph; dimensions from the camera model. See AUTHORING.md.',
    referenceLengthMm: Math.round(Math.hypot(end[0] - start[0], end[1] - start[1]) * 10) / 10,
    referenceImageSegment01: [projectPoint(homography, start), projectPoint(homography, end)],
    referenceWorldSegmentMm: [start, end],
  };
  surfaces.push({
    id,
    role,
    mask: m,
    lighting: {
      diffuse: `/media/scenes/${ID}/${id}-diffuse.png`,
      baselineLinear: baseline,
      shadeMin: 0.18,
      shadeMax: 1.65,
      specular: null,
      specularIncludedInDiffuse: false,
    },
    mapping: { worldQuadMm: world, imageQuad01: normalized(image), calibration },
    uvRotationDeg: role === 'door-leaf' || (role === 'frame' && id !== 'frame-top') ? 90 : 0,
  });
  neutralPatches.push({
    surfaceId: id,
    polygon01: normalized([
      [cx - 1, cy - 1],
      [cx + 2, cy - 1],
      [cx + 2, cy + 2],
      [cx - 1, cy + 2],
    ]),
    medianLinear: baseline,
    measurementNote: 'Median linear grayscale luminance at the nine pixel centers in the recorded neutral patch.',
  });
  references.push({
    label: `${id} measured edge`,
    planeSurfaceId: id,
    lengthMm: calibration.referenceLengthMm,
    imageSegment01: calibration.referenceImageSegment01,
    provenance: 'Measured from the real photograph with the calibrated camera model.',
  });
}
// Partition antialiased shared edges, trim before floor; coverage never exceeds one.
const owned = new Uint16Array(W * H);
for (const surface of [...surfaces].reverse()) {
  const name = `${surface.id}-mask`,
    pixels = await sharp(`${DIR}/${name}.png`).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < owned.length; i++) {
    const c = Math.min(pixels[i * 4], 255 - owned[i]);
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = c;
    owned[i] += c;
  }
  surface.mask = await saveMask(name, pixels);
}

const loc = (sq, en, de) => ({ sq, en, de });
const scene = {
  id: ID,
  name: loc('Hyrja', 'Entrance hall', 'Diele'),
  description: loc('Fotografi e vërtetë', 'Real photograph', 'Echtes Foto'),
  width: W,
  height: H,
  base: `/media/scenes/${ID}/base.webp`,
  thumbnail: `/media/scenes/${ID}/thumbnail.webp`,
  fallback: `/media/scenes/${ID}/fallback.webp`,
  frameType: 'standard-casing',
  // Nearest catalogue size to the measured ~917 mm leaf.
  depictedDoorSizeMm: { width: 900, height: 2000 },
  surfaces,
  protectedMask,
  foreground: null,
  doorInserts: [],
  allowedDoorProductIds: ['dera-bardhe', 'dera-lis'],
  allowedFloorProductIds: ['lis-natyral-10', 'dushk-fshatar-8', 'peshk-natyral-12', 'arre-klasike-12', 'hirte-skandinave-8'],
  allowedFrameModes: ['door', 'floor', 'black'],
  allowedSkirtingModes: ['door', 'floor', 'black'],
  defaultSelection: {
    version: 1,
    sceneId: ID,
    doorProductId: 'dera-lis',
    doorFinishId: 'lis-natyral',
    floorProductId: 'arre-klasike-12',
    frameMode: 'door',
    skirtingMode: 'door',
    floorRotationDeg: 90,
  },
  assetRevision: 'pending',
};
await writeFile(
  `${DIR}/calibration.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      scene,
      sourceCrop: {
        originalWidth: SOURCE.original[0],
        originalHeight: SOURCE.original[1],
        cropPx: SOURCE.crop,
        outputWidth: W,
        outputHeight: H,
      },
      neutralPatches,
      references,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  `${DIR}/AUTHORING.md`,
  `# ${ID} — real photograph\n\nSource: ${SOURCE.author}, ${SOURCE.url}. ${SOURCE.license}\n\nDownloaded at 2400×1600 (JPEG, q92), cropped to ${SOURCE.crop.join(', ')} and resized to 1600×1200 (\`base.png\`, frozen). All other layers are derived by \`scripts/author-photo-scene.mjs\`.\n\nCamera model: horizon y=${horizon}, vanishing points ${vpWall.join(',')} (door wall) and ${vpCorridor.join(',')} (corridor wall), focal ${focal.toFixed(1)} px, camera height ${cameraHeight.toFixed(0)} mm from a 2000 mm leaf. Leaf width ${distance([335, 994], [750, 934]).toFixed(0)} mm.\n\nLighting: painted trim and leaf use the photograph's luminance; the oak floor uses a mask-normalised low-pass (σ 22 px) so the original planks do not print through new floors. The second door, the open door at left and the foreground jamb remain photographic.\n`,
);
const ledger = JSON.parse(await readFile('brand/asset-sources.json', 'utf8'));
for (const name of (await readdir(DIR)).filter(n => n.endsWith('.png'))) {
  const path = `${DIR}/${name}`;
  ledger.assets = ledger.assets.filter(a => a.localPath !== path);
  ledger.assets.push({
    id: path.replaceAll('/', '-').replace('.png', ''),
    localPath: path,
    sourceUrl: SOURCE.url,
    author: name === 'base.png' ? SOURCE.author : `${SOURCE.author}; derivative by scripts/author-photo-scene.mjs`,
    usageBasis: 'licensed',
    licenseNote: SOURCE.license,
    depictsProductId: null,
    isIllustrative: name !== 'base.png',
    sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
  });
}
await writeFile('brand/asset-sources.json', JSON.stringify(ledger, null, 2) + '\n');
console.log({
  focal: focal.toFixed(1),
  cameraHeightMm: cameraHeight.toFixed(0),
  leafWidthMm: distance([335, 994], [750, 934]).toFixed(0),
  floorQuadMm: surfaces[0].mapping.worldQuadMm.map(p => p.map(v => Math.round(v))),
});
