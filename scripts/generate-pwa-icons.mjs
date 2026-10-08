/**
 * Gera os ícones do PWA (192 e 512, comuns e maskable) a partir de
 * public/spot-logo.png.
 *
 * Feito à mão com zlib em vez de uma dependência de imagem: é um script que
 * roda uma vez por troca de logo, e não vale puxar 30MB de binário para o
 * projeto por causa disso. O logo original é RGBA8 sem entrelaçamento.
 *
 * Uso: node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const SRC = 'public/spot-logo.png';
/** Fundo dos ícones: o creme da marca (o logo tem transparência). */
const BG = [250, 250, 247, 255];

function decodePng(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0) {
    throw new Error('Esperado PNG RGBA de 8 bits sem entrelaçamento.');
  }
  const parts = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') parts.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

function encodePng(width, height, data) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none": imagem pequena, não compensa otimizar
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Amostragem bilinear — suficiente e sem artefato visível nesta escala. */
function sample(src, fx, fy) {
  const x0 = Math.floor(fx); const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, src.width - 1); const y1 = Math.min(y0 + 1, src.height - 1);
  const dx = fx - x0; const dy = fy - y0;
  const px = (x, y, c) => src.data[(y * src.width + x) * 4 + c];
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = px(x0, y0, c) * (1 - dx) + px(x1, y0, c) * dx;
    const bot = px(x0, y1, c) * (1 - dx) + px(x1, y1, c) * dx;
    out[c] = top * (1 - dy) + bot * dy;
  }
  return out;
}

/**
 * `padding` é a margem em volta do logo, em fração do lado.
 * O ícone maskable precisa de margem maior: o Android recorta os cantos em
 * círculo, e um logo encostado na borda sai cortado.
 */
function render(src, size, padding) {
  const out = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) out.set(BG, i * 4);

  const box = Math.round(size * (1 - 2 * padding));
  const scale = Math.min(box / src.width, box / src.height);
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = sample(src, (x / w) * (src.width - 1), (y / h) * (src.height - 1));
      const i = ((y + oy) * size + (x + ox)) * 4;
      const alpha = a / 255;
      // Composição sobre o fundo: o logo tem transparência e um ícone de PWA
      // não pode ficar translúcido.
      out[i] = Math.round(r * alpha + BG[0] * (1 - alpha));
      out[i + 1] = Math.round(g * alpha + BG[1] * (1 - alpha));
      out[i + 2] = Math.round(b * alpha + BG[2] * (1 - alpha));
      out[i + 3] = 255;
    }
  }
  return encodePng(size, size, out);
}

const src = decodePng(fs.readFileSync(SRC));
const alvos = [
  ['public/icon-192.png', 192, 0.12],
  ['public/icon-512.png', 512, 0.12],
  ['public/icon-maskable-512.png', 512, 0.22],
  ['public/apple-touch-icon.png', 180, 0.12],
];
for (const [arquivo, size, padding] of alvos) {
  fs.writeFileSync(arquivo, render(src, size, padding));
  console.log(`${arquivo} — ${size}x${size}`);
}
