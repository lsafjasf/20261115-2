// Browser PNG export built on the pure-JS rasterizer and an uncompressed
// deflate writer, so no Node built-in or third-party library is required.
import { rasterizeToBuffer } from './raster-core.js';

export function rasterizePngBlob(cmds, width, height, scale = 2) {
  const { buffer, width: W, height: H } = rasterizeToBuffer(cmds, width, height, scale);
  const chunks = [];

  const u32 = (value) => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value);
    return out;
  };
  const crcTable = buildCrcTable();
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const typeBytes = new TextEncoder().encode(type);
    const body = new Uint8Array(typeBytes.length + data.length);
    body.set(typeBytes, 0);
    body.set(data, typeBytes.length);
    chunks.push(u32(data.length), body, u32(crc32(body)));
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, W);
  ihdrView.setUint32(4, H);
  ihdr[8] = 8;
  ihdr[9] = 6;
  chunk('IHDR', ihdr);

  const stride = W * 4;
  const raw = new Uint8Array((stride + 1) * H);
  for (let y = 0; y < H; y += 1) {
    raw.set(buffer.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  chunk('IDAT', storeDeflate(raw));
  chunk('IEND', new Uint8Array(0));

  return new Blob(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks],
    { type: 'image/png' }
  );
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

// Uncompressed deflate stored blocks inside a zlib wrapper.
function storeDeflate(data) {
  const parts = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  while (offset < data.length) {
    const slice = data.subarray(offset, offset + 65535);
    const header = new Uint8Array(5);
    const isLast = offset + slice.length >= data.length;
    header[0] = isLast ? 1 : 0;
    new DataView(header.buffer).setUint16(1, slice.length, true);
    new DataView(header.buffer).setUint16(3, 0xffff ^ slice.length, true);
    parts.push(header, slice);
    offset += slice.length;
  }
  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  parts.push(checksum);
  return concat(parts);
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
