// Reproducible scene authoring for a REAL photograph (not generated imagery).
//
// Input: brand/assets/scenes/<id>/base.png — the frozen 1600×1200 plate, made
// once from the downloaded photograph (crop + resize recorded in SOURCE):
//   node scripts/author-photo-scene.mjs --from <downloaded.jpg>
// Every other layer (masks, light plates, calibration, provenance) is derived
// here and can be regenerated with:  node scripts/author-photo-scene.mjs
//
// Geometry was measured from luminance edge profiles of the plate; edges are
// straight lines in perspective. Planes come from a calibrated pinhole camera:
// the two walls are perpendicular, so their vanishing points on the horizon
// fix the focal length, and the 2000 mm leaf fixes the camera height.
import sharp from 'sharp';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { solveHomography, projectPoint } from '../src/lib/studio/render/homography.ts';

const ID = 'bedroom-photo',
  DIR = `brand/assets/scenes/${ID}`,
  W = 1600,
  H = 1200;
const SOURCE = {
  url: 'https://unsplash.com/photos/an-empty-room-with-white-walls-and-wood-floors-FwqIB7oCyJ0',
  author: 'Alex Tyson (Unsplash @alextyson195)',
  license:
    'Unsplash License: free to use commercially and non-commercially, no permission or attribution required. Real photograph (Canon EOS Rebel SL3), not AI-generated.',
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

// ---- Measured geometry (plate pixels) ------------------------------------
const lineY = (x0, y0, slope) => x => y0 + slope * (x - x0);
const leafTop = lineY(700, 294, 0.247), // gap line above the leaf
  floorLine = lineY(700, 909, -0.313), // leaf bottom / floor junction
  leftSkirtTop = lineY(300, 989, -0.287),
  leftSkirtBottom = lineY(300, 1047, -0.326),
  rightSkirtTop = lineY(920, 834, 0.304),
  rightSkirtBottom = lineY(920, 872, 0.346);
const P = (x, f) => [x, Math.round(f(x) * 10) / 10];
const leaf = [P(686, leafTop), P(857, leafTop), P(857, x => floorLine(x) - 1), P(686, x => floorLine(x) - 1)];
const casingTop = x => leafTop(x) - 35,
  casingInner = x => leafTop(x) - 3;
const frameTop = [P(657, casingTop), P(878, casingTop), P(878, casingInner), P(657, casingInner)],
  frameLeft = [P(657, casingInner), P(684, casingInner), [684, 916], [657, 926]],
  frameRight = [P(863, casingInner), P(878, casingInner), [878, 856], [863, 861]];
const skirts = [
  ['left', [P(0, x => leftSkirtTop(x) - 2), P(657, x => leftSkirtTop(x) - 2), P(657, leftSkirtBottom), P(0, leftSkirtBottom)]],
  ['right', [P(878, x => rightSkirtTop(x) - 2), P(1600, x => rightSkirtTop(x) - 2), P(1600, rightSkirtBottom), P(878, rightSkirtBottom)]],
];
// Floor boundary sits 2px inside the trim so antialiased edges overlap; the
// partition below gives trim priority, so no original pixels show through.
const floor = [
  P(0, x => leftSkirtBottom(x) - 2),
  P(657, x => leftSkirtBottom(x) - 2),
  P(686, x => floorLine(x) + 1),
  P(857, x => floorLine(x) + 1),
  P(878, x => rightSkirtBottom(x) - 2),
  P(1600, x => rightSkirtBottom(x) - 2),
  [1600, 1200],
  [0, 1200],
];
const floorQuad = [leaf[3], P(878, rightSkirtBottom), [1600, 1200], [0, 1200]];
// Silver hardware (three hinges, lever handle) stays photographic.
const hardware = [
  [852, 368, 869, 406],
  [852, 573, 869, 611],
  [852, 776, 869, 814],
  [688, 610, 744, 658],
];

// ---- Camera model --------------------------------------------------------
// Door-wall lines (leaf top/bottom, skirting) meet at ~(1795,564); the right
// wall's skirting lines meet at ~(15,560). The principal point sits on the horizon.
const horizon = 562,
  principal = [W / 2, horizon],
  vpWall = [1795, horizon],
  vpOther = [15, horizon],
  focal = Math.sqrt(-((vpWall[0] - principal[0]) * (vpOther[0] - principal[0]))),
  cameraHeight = 2000 / (1 + (horizon - leaf[0][1]) / (leaf[3][1] - horizon));
const wallDir = (() => {
  const v = [vpWall[0] - principal[0], focal],
    n = Math.hypot(...v);
  return [v[0] / n, v[1] / n];
})();
// Floor pixel → millimetres in a frame aligned with the door wall (x along it).
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
const leafWidthMm = distance(leaf[3], leaf[2]);

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
        // Only metal (well below the ~195-205 white paint) stays photographic.
        coverage = Math.round(Math.max(0, Math.min(1, (178 - luminance[i]) / 22)) * 255);
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
  ['leaf', 'door-leaf', leaf, rect(Math.round(leafWidthMm), 2000), leaf],
  ['frame-left', 'frame', frameLeft, rect(90, 2070), frameLeft],
  ['frame-right', 'frame', frameRight, rect(90, 2070), frameRight],
  ['frame-top', 'frame', frameTop, rect(Math.round(leafWidthMm + 180), 90), frameTop],
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
  name: loc('Dhoma e gjumit', 'Bedroom', 'Schlafzimmer'),
  description: loc('Fotografi e vërtetë', 'Real photograph', 'Echtes Foto'),
  width: W,
  height: H,
  base: `/media/scenes/${ID}/base.webp`,
  thumbnail: `/media/scenes/${ID}/thumbnail.webp`,
  fallback: `/media/scenes/${ID}/fallback.webp`,
  frameType: 'standard-casing',
  // Nearest catalogue size to the measured leaf.
  depictedDoorSizeMm: { width: 800, height: 2000 },
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
    doorFinishId: 'arre-erret',
    floorProductId: 'lis-natyral-10',
    frameMode: 'door',
    skirtingMode: 'door',
    floorRotationDeg: 0,
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
  `# ${ID} — real photograph\n\nSource: ${SOURCE.author}, ${SOURCE.url}. ${SOURCE.license}\n\nDownloaded at 2400×1600 (JPEG, q92), cropped to ${SOURCE.crop.join(', ')} and resized to 1600×1200 (\`base.png\`, frozen). All other layers are derived by \`scripts/author-photo-scene.mjs\`.\n\nCamera model: horizon y=${horizon}, vanishing points ${vpWall.join(',')} (door wall) and ${vpOther.join(',')} (right wall), focal ${focal.toFixed(1)} px, camera height ${cameraHeight.toFixed(0)} mm from a 2000 mm leaf. Leaf width ${leafWidthMm.toFixed(0)} mm.\n\nLighting: painted trim and leaf use the photograph's luminance; the oak floor uses a mask-normalised low-pass (σ 22 px) so the original planks do not print through new floors. Wall outlets, the light switch and the door hardware remain photographic.\n`,
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
  leafWidthMm: leafWidthMm.toFixed(0),
  floorQuadMm: surfaces[0].mapping.worldQuadMm.map(p => p.map(v => Math.round(v))),
});
