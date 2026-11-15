// Minimal PNG tEXt chunk writer/reader.
// sharp 0.35 reads PNG comments but cannot write them, so tEXt chunks are
// inserted directly per the PNG spec (keyword, NUL, latin1 text, CRC32).

import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, body])), 0);
  return Buffer.concat([length, typeBuffer, body, crc]);
}

function iTextChunk(keyword, text) {
  const body = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]), // NUL
    Buffer.from([0, 0, 0]), // compression flag 0, compression method 0, lang NUL
    Buffer.from([0]), // translated keyword NUL
    Buffer.from(text, 'utf8'),
  ]);
  return chunk('iTXt', body);
}

export function addTextChunks(pngBuffer, entries) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const valid = signature.every((byte, i) => pngBuffer[i] === byte);
  if (!valid) {
    throw new Error('not a PNG buffer');
  }
  const textChunks = entries.map(([keyword, text]) => {
    const value = String(text);
    // tEXt only holds latin1; non-latin1 text goes into an iTXt (UTF-8) chunk.
    const isLatin1 = Buffer.from(value, 'latin1').toString('latin1') === value;
    if (isLatin1) {
      const body = Buffer.concat([
        Buffer.from(keyword, 'latin1'),
        Buffer.from([0]),
        Buffer.from(value, 'latin1'),
      ]);
      return chunk('tEXt', body);
    }
    return iTextChunk(keyword, value);
  });
  // Ancillary chunks must follow the IHDR chunk.
  return Buffer.concat([
    pngBuffer.subarray(0, 8),
    pngBuffer.subarray(8, 33),
    ...textChunks,
    pngBuffer.subarray(33),
  ]);
}

export function readTextChunks(pngBuffer) {
  const result = {};
  let offset = 8;
  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'tEXt') {
      const body = pngBuffer.subarray(offset + 8, offset + 8 + length);
      const nul = body.indexOf(0);
      const keyword = body.toString('latin1', 0, nul);
      result[keyword] = body.toString('latin1', nul + 1);
    } else if (type === 'iTXt') {
      const body = pngBuffer.subarray(offset + 8, offset + 8 + length);
      const nul = body.indexOf(0);
      const keyword = body.toString('latin1', 0, nul);
      // keyword NUL, compressionFlag(1), compressionMethod(1), lang NUL,
      // translatedKeyword NUL, then UTF-8 text.
      let cursor = nul + 1;
      const compressionFlag = body[cursor];
      cursor += 2; // flag + method
      cursor = body.indexOf(0, cursor) + 1; // skip language tag
      cursor = body.indexOf(0, cursor) + 1; // skip translated keyword
      let textBody = body.subarray(cursor);
      if (compressionFlag === 1) {
        textBody = Buffer.from(zlib.inflateSync(textBody));
      }
      result[keyword] = textBody.toString('utf8');
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return result;
}
