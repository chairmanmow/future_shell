// avatar_png.js - a 10x6 BBS avatar (CP437 cells, .bin layout) as a PNG
// for a push notification's icon. Same look as the site's desktop chat
// notifications (webv4 js/chat.js avatarIcon): 8x16 VGA glyphs, the CGA
// palette graphics-converter.js uses, scaled 3x with hard pixels -> 240x288.
//
// Files land in the web root by content hash, so each avatar is drawn once
// and the browser fetches it like any image: iconFor(b64) -> './push-avatars/<hash>.png'.
//
// push_daemon.js reloads this module when the file changes, so drawing
// tweaks need no daemon restart.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const COLS = 10, ROWS = 6, FW = 8, FH = 16, SCALE = 3;
const OUT_DIR = '/sbbs/webv4_custom/root/push-avatars/';
const URL_DIR = './push-avatars/';
const FONT = fs.readFileSync(path.join(__dirname, 'cp437-8x16.bin'));   // 256 glyphs x 16 rows, 1 bit/pixel
const PALETTE = ['#000000', '#0000A8', '#00A800', '#00A8A8', '#A80000', '#A800A8', '#A85400', '#A8A8A8',
  '#545454', '#5454FC', '#54FC54', '#54FCFC', '#FC5454', '#FC54FC', '#FCFC54', '#FFFFFF']
  .map((h) => [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]);

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/* The avatar's cells -> PNG bytes, or null if the data isn't a 10x6 avatar. */
function render(bin) {
  if (!bin || bin.length < COLS * ROWS * 2) return null;
  const w = COLS * FW * SCALE, h = ROWS * FH * SCALE;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;   // filter: none
    const cy = Math.floor(y / SCALE / FH), gy = Math.floor(y / SCALE) % FH;
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / SCALE / FW), gx = Math.floor(x / SCALE) % FW;
      const at = (cy * COLS + cx) * 2;
      const ch = bin[at], attr = bin[at + 1];
      const on = (FONT[ch * FH + gy] >> (7 - gx)) & 1;
      const rgb = PALETTE[on ? attr & 15 : (attr >> 4) & 7];
      const p = row + 1 + x * 3;
      raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* base64 avatar -> icon URL for the push payload, or null. */
function iconFor(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  const bin = Buffer.from(b64, 'base64');
  const name = crypto.createHash('sha1').update(bin).digest('hex').substr(0, 20) + '.png';
  const file = OUT_DIR + name;
  if (!fs.existsSync(file)) {
    const png = render(bin);
    if (!png) return null;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmp = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, png, { mode: 0o644 });
    fs.chmodSync(tmp, 0o644);
    fs.renameSync(tmp, file);
  }
  return URL_DIR + name;
}

module.exports = { render, iconFor };
