// Generates resources/icon.png (256x256) without any image dependency.
// Usage: npm run icon
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = Buffer.alloc(S * S * 4);

// signed distance to a rounded rectangle centered at (cx, cy)
function sdRoundRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
}
const cover = (d) => Math.min(Math.max(0.5 - d, 0), 1); // 1px anti-aliasing

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const bg = cover(sdRoundRect(x + 0.5, y + 0.5, 128, 128, 240, 240, 56));
    const t = (x + y) / (2 * S); // indigo -> fuchsia gradient
    let r = 99 + (217 - 99) * t, g = 102 + (70 - 102) * t, b = 241 + (239 - 241) * t;
    const pill = cover(sdRoundRect(x + 0.5, y + 0.5, 128, 128, 190, 74, 37));
    r *= 1 - pill; g *= 1 - pill; b *= 1 - pill;
    const dot = cover(Math.hypot(x + 0.5 - 188, y + 0.5 - 128) - 13); // green "live" dot
    r += (52 - r) * dot; g += (211 - g) * dot; b += (153 - b) * dot;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = bg * 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'resources', 'icon.png');
fs.writeFileSync(out, png);

// Also write a native Windows .ico (22-byte ICONDIR + ICONDIRENTRY + PNG payload)
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type = 1 (ICO)
icoHeader.writeUInt16LE(1, 4); // count = 1 image
icoHeader[6] = 0; // width 256 -> 0
icoHeader[7] = 0; // height 256 -> 0
icoHeader[8] = 0; // color palette
icoHeader[9] = 0; // reserved
icoHeader.writeUInt16LE(1, 10); // color planes
icoHeader.writeUInt16LE(32, 12); // bits per pixel
icoHeader.writeUInt32LE(png.length, 14); // image byte size
icoHeader.writeUInt32LE(22, 18); // offset
const icoOut = path.join(__dirname, '..', 'resources', 'icon.ico');
fs.writeFileSync(icoOut, Buffer.concat([icoHeader, png]));
console.log('wrote', out, 'and', icoOut);
