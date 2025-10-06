// png_loader.js — Self-contained PNG loader + decoder for Synchronet/SpiderMonkey
// Exports: PNGLoader.decode(bytes) -> { rgba: Uint8Array, width, height }
//
// Supported:
//  - Color types: 6 (RGBA), 2 (RGB), 0 (Gray), 4 (Gray+Alpha), 3 (Indexed)
//  - Bit depth: 8 for 6/2/0/4; 1/2/4/8 for 3 (Indexed)
//  - Interlace: 0 (none)
//  - Filters: 0..4 (None/Sub/Up/Average/Paeth)
//  - zlib/DEFLATE: stored, fixed Huffman, dynamic Huffman (no preset dict)
//
// Not supported: interlace=1 (Adam7), ICC/gAMA/cHRM, 16-bit sample depth, etc.

(function (global) {
    // ===== Utilities =====
    function toU8(bytes) {
        if (typeof bytes === "string") {
            var a = new Uint8Array(bytes.length);
            for (var i = 0; i < bytes.length; i++) a[i] = bytes.charCodeAt(i) & 255;
            return a;
        }
        if (bytes instanceof Uint8Array) return bytes;
        // assume array-like
        var b = new Uint8Array(bytes.length);
        for (var j = 0; j < bytes.length; j++) b[j] = bytes[j] & 255;
        return b;
    }
    function be32(u8, o) { return ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0; }
    function be16(u8, o) { return ((u8[o] << 8) | u8[o + 1]) & 0xFFFF; }

    // ====== Inflate (zlib + DEFLATE) ======
    function Inflate(u8, off) {
        this.u8 = u8; this.p = off || 0; this.bitbuf = 0; this.bitcnt = 0;
    }
    Inflate.prototype.readU8 = function () { return this.u8[this.p++]; };
    Inflate.prototype.readBits = function (n) {
        var b = this.bitbuf, c = this.bitcnt;
        while (c < n) { b |= this.readU8() << c; c += 8; }
        var out = b & ((1 << n) - 1);
        this.bitbuf = b >>> n; this.bitcnt = c - n;
        return out;
    };
    Inflate.prototype.alignByte = function () { this.bitbuf = 0; this.bitcnt = 0; };

    function buildHuff(codeLengths) {
        var maxLen = 0, i;
        for (i = 0; i < codeLengths.length; i++) if (codeLengths[i] > maxLen) maxLen = codeLengths[i];
        var bl_count = new Array(maxLen + 1); for (i = 0; i <= maxLen; i++) bl_count[i] = 0;
        for (i = 0; i < codeLengths.length; i++) bl_count[codeLengths[i]]++;

        var code = 0, next_code = new Array(maxLen + 1); bl_count[0] = 0;
        for (i = 1; i <= maxLen; i++) { code = (code + bl_count[i - 1]) << 1; next_code[i] = code; }

        function revbits(x, n) { // reverse low n bits (DEFLATE is LSB-first)
            var r = 0;
            for (var k = 0; k < n; k++) { r = (r << 1) | (x & 1); x >>= 1; }
            return r;
        }

        var map = {}; // key: (reversed_code | (len<<16)) -> symbol
        for (var sym = 0; sym < codeLengths.length; sym++) {
            var len = codeLengths[sym];
            if (len !== 0) {
                var c = next_code[len]++;
                var key = (revbits(c, len) | (len << 16));
                map[key] = sym;
            }
        }
        return { maxBits: maxLen, map: map };
    }

    function readCode(h, inf) {
        var code = 0;
        for (var len = 1; len <= h.maxBits; len++) {
            code |= (inf.readBits(1) << (len - 1));
            var key = (code | (len << 16));
            if (h.map[key] !== undefined) return h.map[key];
        }
        throw "Huffman decode failed";
    }

    // Length codes (257..285)
    var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

    // Distance codes (0..29)
    var DST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25,
        33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
        1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    var DST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3,
        4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
        9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

    function fixedLitHuff() {
        var len = [];
        for (var i = 0; i <= 287; i++) len[i] = 0;
        for (i = 0; i <= 143; i++) len[i] = 8;
        for (i = 144; i <= 255; i++) len[i] = 9;
        for (i = 256; i <= 279; i++) len[i] = 7;
        for (i = 280; i <= 287; i++) len[i] = 8;
        return buildHuff(len);
    }
    function fixedDistHuff() {
        var len = [];
        for (var i = 0; i < 32; i++) len[i] = 5;
        return buildHuff(len);
    }

    function decodeDynamicTables(inf) {
        var HLIT = inf.readBits(5) + 257;
        var HDIST = inf.readBits(5) + 1;
        var HCLEN = inf.readBits(4) + 4;
        var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        var clen = new Array(19); for (var i = 0; i < 19; i++) clen[i] = 0;
        for (i = 0; i < HCLEN; i++) clen[order[i]] = inf.readBits(3);
        var chuff = buildHuff(clen);

        function readLens(n) {
            var out = []; var prev = 0;
            while (out.length < n) {
                var sym = readCode(chuff, inf);
                if (sym <= 15) { out.push(prev = sym); }
                else if (sym === 16) { var rpt = 3 + inf.readBits(2); for (var k = 0; k < rpt; k++) out.push(prev); }
                else if (sym === 17) { var rpt17 = 3 + inf.readBits(3); for (k = 0; k < rpt17; k++) out.push(0); prev = 0; }
                else if (sym === 18) { var rpt18 = 11 + inf.readBits(7); for (k = 0; k < rpt18; k++) out.push(0); prev = 0; }
                else throw "bad RLE in code lengths";
            }
            return out;
        }
        var litlen = readLens(HLIT);
        var dist = readLens(HDIST);
        return { lit: buildHuff(litlen), dist: buildHuff(dist) };
    }

    function inflateRaw(u8, start) {
        var inf = new Inflate(u8, start || 0);
        var out = [];
        var done = false;
        var litFix = fixedLitHuff(), distFix = fixedDistHuff();

        while (!done) {
            var BFINAL = inf.readBits(1);
            var BTYPE = inf.readBits(2);
            if (BTYPE === 0) {
                // stored
                inf.alignByte();
                var len = inf.readU8() | (inf.readU8() << 8);
                var nlen = inf.readU8() | (inf.readU8() << 8);
                if ((len ^ 0xFFFF) !== nlen) throw "stored block LEN/NLEN mismatch";
                for (var i = 0; i < len; i++) out.push(inf.readU8());
            } else {
                var lit, dist;
                if (BTYPE === 1) { lit = litFix; dist = distFix; }
                else if (BTYPE === 2) { var tbl = decodeDynamicTables(inf); lit = tbl.lit; dist = tbl.dist; }
                else throw "invalid BTYPE";

                for (; ;) {
                    var sym = readCode(lit, inf);
                    if (sym < 256) { out.push(sym); }      // literal
                    else if (sym === 256) { break; }       // end of block
                    else {
                        // length/dist pair
                        var lidx = sym - 257;
                        if (lidx < 0 || lidx >= LEN_BASE.length) throw "bad length symbol";
                        var length = LEN_BASE[lidx] + (LEN_EXTRA[lidx] ? inf.readBits(LEN_EXTRA[lidx]) : 0);
                        var dsym = readCode(dist, inf);
                        if (dsym < 0 || dsym >= 30) throw "bad distance symbol " + dsym;
                        var distance = DST_BASE[dsym] + (DST_EXTRA[dsym] ? inf.readBits(DST_EXTRA[dsym]) : 0);

                        var base = out.length - distance;
                        if (base < 0) throw "invalid distance";
                        for (var k = 0; k < length; k++) out.push(out[base + k]);
                    }
                }
            }
            if (BFINAL) done = true;
        }
        var u = new Uint8Array(out.length);
        for (var q = 0; q < out.length; q++) u[q] = out[q];
        return u;
    }

    function inflateZlib(u8, off) {
        var p = off || 0;
        var CMF = u8[p++], FLG = u8[p++];
        if ((CMF & 0x0F) !== 8) throw "zlib CM not deflate";
        // if (((CMF << 8) | FLG) % 31 !== 0) { /* tolerate */ }
        if (FLG & 0x20) { p += 4; } // preset dictionary: skip DICTID
        return inflateRaw(u8, p);
    }

    // ====== PNG filter reconstruct ======
    function paeth(a, b, c) { // a=left, b=up, c=up-left
        var p = a + b - c;
        var pa = p > a ? p - a : a - p;
        var pb = p > b ? p - b : b - p;
        var pc = p > c ? p - c : c - p;
        return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }

    // raw: concatenated rows each prefixed with filter byte
    // rowBytes: byte length of a single row AFTER filter byte
    // bppBytes: bytes-per-pixel (ceil(bitsPerPixel/8)) used for Sub/Paeth left ref
    function unfilterScanlines(raw, h, rowBytes, bppBytes) {
        var out = new Uint8Array(h * rowBytes);
        var rp = 0, op = 0;
        for (var y = 0; y < h; y++) {
            var f = raw[rp++]; // filter byte
            if (f === 0) {
                for (var i = 0; i < rowBytes; i++) out[op + i] = raw[rp + i];
            } else if (f === 1) { // Sub
                for (i = 0; i < rowBytes; i++) {
                    var left = (i >= bppBytes) ? out[op + i - bppBytes] : 0;
                    out[op + i] = (raw[rp + i] + left) & 255;
                }
            } else if (f === 2) { // Up
                for (i = 0; i < rowBytes; i++) {
                    var up = (y > 0) ? out[op - rowBytes + i] : 0;
                    out[op + i] = (raw[rp + i] + up) & 255;
                }
            } else if (f === 3) { // Average
                for (i = 0; i < rowBytes; i++) {
                    var l = (i >= bppBytes) ? out[op + i - bppBytes] : 0;
                    var u = (y > 0) ? out[op - rowBytes + i] : 0;
                    out[op + i] = (raw[rp + i] + ((l + u) >> 1)) & 255;
                }
            } else if (f === 4) { // Paeth
                for (i = 0; i < rowBytes; i++) {
                    var a = (i >= bppBytes) ? out[op + i - bppBytes] : 0;
                    var b = (y > 0) ? out[op - rowBytes + i] : 0;
                    var c = (i >= bppBytes && y > 0) ? out[op - rowBytes + i - bppBytes] : 0;
                    out[op + i] = (raw[rp + i] + paeth(a, b, c)) & 255;
                }
            } else {
                throw "Unsupported filter: " + f;
            }
            rp += rowBytes;
            op += rowBytes;
        }
        return out;
    }

    // ====== PNG decode ======
    function decodePNG(bytes) {
        var u8 = toU8(bytes);
        // signature
        if (!(u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47 &&
            u8[4] === 0x0D && u8[5] === 0x0A && u8[6] === 0x1A && u8[7] === 0x0A)) {
            throw "Not a PNG";
        }
        var p = 8;

        var width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
        var idat = []; var idatLen = 0;

        // palette + transparency (for indexed and optional color-key)
        var palette = null;     // Array of [r,g,b]
        var palAlpha = null;    // Uint8Array alpha per palette entry
        var trnsGray = null;    // for type 0 (grayscale) key
        var trnsRGB = null;     // for type 2 (truecolor) key [r,g,b]

        // parse chunks
        while (p < u8.length) {
            var len = be32(u8, p); p += 4;
            var type = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]); p += 4;

            if (type === "IHDR") {
                width = be32(u8, p); height = be32(u8, p + 4);
                bitDepth = u8[p + 8]; colorType = u8[p + 9];
                var comp = u8[p + 10], filter = u8[p + 11]; interlace = u8[p + 12];
                p += len + 4; // data + CRC
                if (interlace !== 0) throw "Interlaced PNG (Adam7) not supported";
                // We support 8-bit for non-indexed; 1/2/4/8 for indexed
                if (colorType === 3) {
                    if (!(bitDepth === 1 || bitDepth === 2 || bitDepth === 4 || bitDepth === 8))
                        throw "Indexed PNG unsupported bit depth: " + bitDepth;
                } else {
                    if (bitDepth !== 8) throw "Only 8-bit per sample supported (non-indexed)";
                }
                if (comp !== 0 || filter !== 0) throw "Unsupported PNG compression/filter method";
            }
            else if (type === "PLTE") {
                if (len % 3) throw "PLTE length invalid";
                var n = len / 3;
                palette = new Array(n);
                for (var i = 0; i < n; i++) {
                    var j = p + i * 3;
                    palette[i] = [u8[j], u8[j + 1], u8[j + 2]];
                }
                p += len + 4;
            }
            else if (type === "tRNS") {
                // Transparency
                if (colorType === 3) {
                    if (!palette) throw "tRNS before PLTE";
                    palAlpha = new Uint8Array(palette.length);
                    for (var z = 0; z < palAlpha.length; z++) palAlpha[z] = 255;
                    var m = Math.min(len, palAlpha.length);
                    for (var k = 0; k < m; k++) palAlpha[k] = u8[p + k];
                } else if (colorType === 0 && len >= 2) {
                    trnsGray = be16(u8, p);
                } else if (colorType === 2 && len >= 6) {
                    trnsRGB = [be16(u8, p), be16(u8, p + 2), be16(u8, p + 4)];
                }
                p += len + 4;
            }
            else if (type === "IDAT") {
                idat.push(u8.subarray(p, p + len)); idatLen += len;
                p += len + 4;
            }
            else if (type === "IEND") {
                p += len + 4;
                break;
            }
            else {
                // skip unknown/ancillary
                p += len + 4;
            }
        }

        // Concatenate IDAT
        var z = new Uint8Array(idatLen);
        var zpos = 0;
        for (var ii = 0; ii < idat.length; ii++) { z.set(idat[ii], zpos); zpos += idat[ii].length; }

        // zlib inflate -> scanline stream (with 1 filter byte per row)
        var decomp = inflateZlib(z, 0);

        // Samples per pixel (channels)
        var channels;
        if (colorType === 6) channels = 4;        // RGBA
        else if (colorType === 2) channels = 3;   // RGB
        else if (colorType === 0) channels = 1;   // Gray
        else if (colorType === 4) channels = 2;   // Gray+Alpha
        else if (colorType === 3) channels = 1;   // Indexed
        else throw "Unsupported color type: " + colorType;

        // per PNG spec
        var bitsPerPixel = bitDepth * channels;                              // bits per pixel (not per byte)
        var rowBytes = Math.ceil((bitsPerPixel * width) / 8);                // bytes per row (no filter)
        var bppBytes = Math.ceil((bitDepth * channels) / 8) || 1;            // bytes-per-pixel for filter (Sub/Paeth)
        var expected = (rowBytes + 1) * height;                              // +1 filter byte per row

        if (decomp.length < expected)
            throw "PNG inflate too short: have=" + decomp.length + " need=" + expected +
            " (w=" + width + " h=" + height + " ct=" + colorType + " bd=" + bitDepth + " ch=" + channels + ")";

        var raw = (decomp.length === expected) ? decomp : decomp.subarray(0, expected);
        var recon = unfilterScanlines(raw, height, rowBytes, bppBytes);      // length = rowBytes * height

        // Expand to RGBA
        var out = new Uint8Array(width * height * 4);

        if (colorType === 3) {
            if (!palette) throw "Indexed PNG missing PLTE";
            // unpack indices according to bit depth, map to RGBA via palette + palAlpha
            var pix = 0, ofs = 0;
            for (var y = 0; y < height; y++) {
                var iofs = ofs;
                if (bitDepth === 8) {
                    for (var x = 0; x < width; x++) {
                        var idx = recon[iofs++];
                        var pcol = palette[idx];
                        if (!pcol) { out[pix] = out[pix + 1] = out[pix + 2] = 0; out[pix + 3] = 0; pix += 4; continue; }
                        out[pix] = pcol[0];
                        out[pix + 1] = pcol[1];
                        out[pix + 2] = pcol[2];
                        out[pix + 3] = palAlpha ? palAlpha[idx] : 255;
                        pix += 4;
                    }
                } else if (bitDepth === 4) {
                    for (var x4 = 0; x4 < width; x4++) {
                        var byte = recon[iofs + (x4 >> 1)];
                        var idx = (x4 & 1) ? (byte & 0x0F) : (byte >> 4);
                        var pcol4 = palette[idx];
                        if (!pcol4) { out[pix] = out[pix + 1] = out[pix + 2] = 0; out[pix + 3] = 0; pix += 4; continue; }
                        out[pix] = pcol4[0];
                        out[pix + 1] = pcol4[1];
                        out[pix + 2] = pcol4[2];
                        out[pix + 3] = palAlpha ? palAlpha[idx] : 255;
                        pix += 4;
                    }
                    iofs += Math.ceil(width / 2);
                } else if (bitDepth === 2) {
                    var bits2 = 0, b2 = 0;
                    for (var x2 = 0; x2 < width; x2++) {
                        if (bits2 === 0) { b2 = recon[iofs++]; bits2 = 8; }
                        bits2 -= 2;
                        var idx2 = (b2 >> bits2) & 0x03;
                        var pcol2 = palette[idx2] || [0, 0, 0];
                        out[pix] = pcol2[0];
                        out[pix + 1] = pcol2[1];
                        out[pix + 2] = pcol2[2];
                        out[pix + 3] = palAlpha ? palAlpha[idx2] : 255;
                        pix += 4;
                    }
                } else { // bitDepth === 1
                    var bits1 = 0, b1 = 0;
                    for (var x1 = 0; x1 < width; x1++) {
                        if (bits1 === 0) { b1 = recon[iofs++]; bits1 = 8; }
                        bits1 -= 1;
                        var idx1 = (b1 >> bits1) & 0x01;
                        var pcol1 = palette[idx1] || [0, 0, 0];
                        out[pix] = pcol1[0];
                        out[pix + 1] = pcol1[1];
                        out[pix + 2] = pcol1[2];
                        out[pix + 3] = palAlpha ? palAlpha[idx1] : 255;
                        pix += 4;
                    }
                }
                ofs += rowBytes;
            }
        }
        else {
            // 8-bit per channel paths (non-indexed)
            var si = 0, di = 0;
            if (colorType === 6) {
                // RGBA
                for (var i6 = 0, total6 = width * height; i6 < total6; i6++) {
                    out[di++] = recon[si++]; // R
                    out[di++] = recon[si++]; // G
                    out[di++] = recon[si++]; // B
                    out[di++] = recon[si++]; // A
                }
            } else if (colorType === 2) {
                // RGB (+ optional tRNS color-key)
                var hasKey2 = (trnsRGB && trnsRGB.length === 3);
                for (var i2 = 0, total2 = width * height; i2 < total2; i2++) {
                    var r = recon[si++], g = recon[si++], b = recon[si++];
                    out[di++] = r; out[di++] = g; out[di++] = b;
                    if (hasKey2 && r === (trnsRGB[0] & 0xFF) && g === (trnsRGB[1] & 0xFF) && b === (trnsRGB[2] & 0xFF)) {
                        out[di++] = 0;
                    } else out[di++] = 255;
                }
            } else if (colorType === 0) {
                // Gray (+ optional tRNS gray-key)
                var key0 = (trnsGray != null) ? (trnsGray & 0xFF) : null;
                for (var i0 = 0, total0 = width * height; i0 < total0; i0++) {
                    var gy = recon[si++];
                    out[di++] = gy; out[di++] = gy; out[di++] = gy;
                    out[di++] = (key0 !== null && gy === key0) ? 0 : 255;
                }
            } else if (colorType === 4) {
                // Gray + Alpha
                for (var i4 = 0, total4 = width * height; i4 < total4; i4++) {
                    var gya = recon[si++], a4 = recon[si++];
                    out[di++] = gya; out[di++] = gya; out[di++] = gya; out[di++] = a4;
                }
            } else {
                throw "Unsupported non-indexed color type: " + colorType;
            }
        }

        return { rgba: out, width: width, height: height };
    }

    // Public API
    global.PNGLoader = {
        decode: decodePNG,
        looksPNG: function (b) {
            b = toU8(b);
            return b && b.length >= 8 &&
                b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
                b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A;
        }
    };

})(this);