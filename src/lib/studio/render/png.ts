// Minimal PNG decoder for data layers that must not pass through a canvas:
// 16-bit world-position maps lose precision (and alpha would be premultiplied)
// if decoded by createImageBitmap. Non-interlaced greyscale, grey+alpha, RGB
// and RGBA at 8 or 16 bits. Inflation uses the platform DecompressionStream,
// available in browsers, workers and Node.
export interface DecodedPng {
  width: number;
  height: number;
  channels: number;
  depth: 8 | 16;
  data: Uint8Array | Uint16Array;
}
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
async function inflate(data: Uint8Array) {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  if (bytes.length < 8 || SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('PNG: bad signature');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8,
    width = 0,
    height = 0,
    depth = 0,
    color = -1;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset),
      type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)),
      body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      depth = body[8];
      color = body[9];
      if (body[12] !== 0) throw new Error('PNG: interlaced images are not supported');
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = CHANNELS[color];
  if (!width || !height || !channels || (depth !== 8 && depth !== 16))
    throw new Error(`PNG: unsupported format (colour ${color}, depth ${depth})`);
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((at, c) => (joined.set(c, at), at + c.length), 0);
  const raw = await inflate(joined),
    bpp = (channels * depth) / 8,
    stride = width * bpp;
  if (raw.length !== height * (stride + 1)) throw new Error('PNG: truncated image data');
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      src = y * (stride + 1) + 1,
      row = y * stride,
      prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0,
        b = y ? out[prev + x] : 0,
        c = x >= bpp && y ? out[prev + x - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c,
          pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`PNG: bad filter ${filter}`);
      out[row + x] = (raw[src + x] + predictor) & 255;
    }
  }
  if (depth === 8) return { width, height, channels, depth, data: out };
  const words = new Uint16Array(out.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = (out[i * 2] << 8) | out[i * 2 + 1];
  return { width, height, channels, depth, data: words };
}
