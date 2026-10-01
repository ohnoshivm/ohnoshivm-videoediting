// Minimal PNG writer (RGB8) + box downscale for raw RGBA frames coming from the page (GL order: bottom row first).
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
/** rgba: Buffer/Uint8Array of w*h*4. flipY: input is bottom-up (GL). Returns a PNG Buffer (RGB, 8 bit). */
export function encodePNG(rgba, w, h, { flipY = true, level = 6 } = {}) {
  const row = w * 3, raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) {
    const sy = flipY ? h - 1 - y : y, so = sy * w * 4, o = y * (row + 1);
    raw[o] = 0;
    for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = rgba[so + x * 4]; raw[o + 2 + x * 3] = rgba[so + x * 4 + 1]; raw[o + 3 + x * 3] = rgba[so + x * 4 + 2]; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}
/** Box-downscale an RGBA GL-order buffer to (dw,dh); returns top-down RGBA (already flipped) for compositing. */
export function downscaleTopDown(rgba, w, h, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4), sx = w / dw, sy = h / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) { const gy = h - 1 - yy; for (let xx = x0; xx < x1; xx++) { const o = (gy * w + xx) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n++; } }
      const o = (y * dw + x) * 4; out[o] = r / n + 0.5; out[o + 1] = g / n + 0.5; out[o + 2] = b / n + 0.5; out[o + 3] = 255;
    }
  }
  return out;
}
