// gif_loader.js — resilient first-frame GIF decoder for Synchronet JS
"use strict";
// Export: GIFLoaderFactory() -> { decode(bytes), looksGIF(bytes), inspect(bytes) }
// Notes: decodes FIRST IMAGE DESCRIPTOR only; composes onto logical screen;
// handles transparency, interlace, local/global palettes.

function GIFLoaderFactory() {
    var DEBUG = false;
    function dbg() { if (!DEBUG) return; var s = "[gif] " + Array.prototype.slice.call(arguments).join(" "); try { log(s) } catch (e) { try { print(s) } catch (_) { } } }

    function looksGIF(s) {
        return s && s.length >= 6 && (s.substr(0, 6) === "GIF87a" || s.substr(0, 6) === "GIF89a");
    }
    function inspect(bytes) {
        var p = 0;
        function u8() { return bytes.charCodeAt(p++) & 255; }
        function u16() { var a = u8(), b = u8(); return a | (b << 8); }
        if (!looksGIF(bytes)) throw "Not a GIF";
        p = 6;
        var w = u16(), h = u16();
        return { width: w, height: h };
    }

    function decode(bytes) {
        var p = 0, len = bytes.length;
        function r(n) { var s = bytes.substr(p, n); p += n; return s; }
        function u8() { if (p >= len) throw "GIF truncated"; return bytes.charCodeAt(p++) & 255; }
        function u16() { var a = u8(), b = u8(); return a | (b << 8); }

        // header
        var sig = r(6);
        if (sig !== "GIF87a" && sig !== "GIF89a") throw "not GIF: " + sig;

        // logical screen
        var sw = u16(), sh = u16();
        var packed = u8();
        var gctFlag = (packed & 0x80) ? 1 : 0;
        var colorRes = ((packed >> 4) & 0x07) + 1; // not used
        var sortFlag = (packed & 0x08) ? 1 : 0;    // not used
        var gctSize = 1 << (((packed & 0x07) + 1) >>> 0);
        var bgIndex = u8();
        var aspect = u8(); // rarely used
        dbg("screen", sw + "x" + sh, "gct=" + gctFlag, "gctSize=" + gctSize, "bg=" + bgIndex);

        // global palette
        var gct = null;
        if (gctFlag) gct = readCT(gctSize);

        // canvas (logical screen)
        var canvas = new Uint8Array(sw * sh * 4);
        // fill with background color (if GCT present)
        if (gct && gct[bgIndex]) {
            var bc = gct[bgIndex];
            for (var i = 0; i < canvas.length; i += 4) { canvas[i] = bc[0]; canvas[i + 1] = bc[1]; canvas[i + 2] = bc[2]; canvas[i + 3] = 255; }
        } else {
            for (var i2 = 0; i2 < canvas.length; i2 += 4) { canvas[i2] = 0; canvas[i2 + 1] = 0; canvas[i2 + 2] = 0; canvas[i2 + 3] = 255; }
        }

        // state
        var gce = { transpIndex: -1, delay: 0, disposal: 0 };

        // parse blocks until first image is decoded
        var gotImage = false, rgba = null, iw = 0, ih = 0, ix = 0, iy = 0;
        while (p < len) {
            var b = u8();
            if (b === 0x3B) { // trailer
                break;
            }
            else if (b === 0x21) { // extension
                var lab = u8();
                if (lab === 0xF9) { // GCE
                    var sz = u8(); // should be 4
                    var gp = u8();
                    gce.disposal = (gp >> 2) & 0x7;
                    gce.transpIndex = (gp & 0x1) ? u8() /*delay low*/ : (u16(), -1);
                    if ((gp & 0x1) === 0) { // no transparency bit: rewind read of delay
                        var dly = gce.transpIndex; // actually low byte of delay
                        var dhi = u8();
                        gce.delay = dly | (dhi << 8);
                        var tidx = u8(); // transp index
                        gce.transpIndex = -1; // truly no transparency
                    } else {
                        // transparency set; read delay properly
                        var delayLow = u8(), delayHigh = u8();
                        gce.delay = delayLow | (delayHigh << 8);
                        var tIndex = u8(); // already read as 'transpIndex' above
                        // fix: gp & 1 means transp index present in this byte
                        gce.transpIndex = tIndex;
                    }
                    var term = u8(); // block terminator
                }
                else {
                    skipSubs(); // comment, application, plaintext → skip for first frame
                }
            }
            else if (b === 0x2C) { // image descriptor
                ix = u16(); iy = u16(); iw = u16(); ih = u16();
                var ip = u8();
                var lctFlag = (ip & 0x80) ? 1 : 0;
                var inter = (ip & 0x40) ? 1 : 0;
                var lctSize = 1 << ((ip & 0x07) + 1);
                var lct = lctFlag ? readCT(lctSize) : null;

                var minCodeSize = u8();
                var data = readSubs();

                // LZW decode to color indices
                var idxs = lzwDecode(data, minCodeSize, iw * ih);

                // choose palette
                var pal = lct || gct;
                if (!pal) throw "no palette";

                // index->rgba for the subimage
                var subRGBA = idxToRGBA(idxs, pal, gce.transpIndex);

                // handle interlace
                if (inter) subRGBA = deinterlaceRGBA(subRGBA, iw, ih);

                // composite subimage into canvas at (ix,iy)
                blit(subRGBA, iw, ih, canvas, sw, sh, ix, iy, gce.transpIndex);

                rgba = canvas; // for our first-frame export
                gotImage = true;
                break; // first frame only
            }
            else {
                throw "unknown block: 0x" + b.toString(16);
            }
        }

        if (!gotImage) throw "no image";
        return { rgba: rgba, width: sw, height: sh };

        /* -------- helpers -------- */

        function readCT(n) {
            var t = new Array(n);
            for (var i = 0; i < n; i++) t[i] = [u8(), u8(), u8(), 255];
            return t;
        }
        function readSubs() {
            var out = "", size;
            while ((size = u8()) !== 0) out += r(size);
            return out;
        }
        function skipSubs() {
            var size;
            while ((size = u8()) !== 0) p += size;
        }
        function lzwDecode(strData, minCodeSize, expect) {
            var dpos = 0;
            function d8() { return strData.charCodeAt(dpos++) & 255; }
            var clear = 1 << minCodeSize, end = clear + 1;
            var codeSize = minCodeSize + 1;
            var dict = [], maxCode;
            function reset() {
                dict = [];
                for (var i = 0; i < clear; i++) dict[i] = [i];
                dict[clear] = []; dict[end] = null;
                codeSize = minCodeSize + 1;
                maxCode = 1 << codeSize;
            }
            reset();
            var out = [], prev = null, bitBuf = 0, bitCnt = 0;
            function readCode() {
                while (bitCnt < codeSize) { bitBuf |= d8() << bitCnt; bitCnt += 8; }
                var c = bitBuf & ((1 << codeSize) - 1);
                bitBuf >>= codeSize; bitCnt -= codeSize;
                return c;
            }
            while (true) {
                if (dpos >= strData.length) break;
                var code = readCode();
                if (code === clear) { reset(); prev = null; continue; }
                if (code === end) break;
                var entry;
                if (code < dict.length) entry = dict[code].slice(0);
                else if (code === dict.length && prev) { entry = prev.slice(0); entry.push(prev[0]); }
                else break;
                for (var i = 0; i < entry.length; i++) out.push(entry[i]);
                if (prev) {
                    var ne = prev.slice(0); ne.push(entry[0]); dict.push(ne);
                    if (dict.length === maxCode && codeSize < 12) { codeSize++; maxCode = 1 << codeSize; }
                }
                prev = entry;
                if (expect && out.length >= expect) break;
            }
            return out;
        }
        function idxToRGBA(idxs, pal, transp) {
            var out = new Uint8Array(idxs.length * 4);
            for (var i = 0; i < idxs.length; i++) {
                var idx = idxs[i];
                var c = pal[idx] || [0, 0, 0, 255];
                var a = (idx === transp) ? 0 : 255;
                var o = i * 4;
                out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = a;
            }
            return out;
        }
        function deinterlaceRGBA(src, w, h) {
            var dst = new Uint8Array(src.length);
            var offsets = [0, 4, 2, 1], steps = [8, 8, 4, 2], srcRow = 0;
            for (var pass = 0; pass < 4; pass++) {
                for (var y = offsets[pass]; y < h; y += steps[pass]) {
                    var si = srcRow * w * 4;
                    var di = y * w * 4;
                    for (var x = 0; x < w * 4; x++) dst[di + x] = src[si + x];
                    srcRow++;
                }
            }
            return dst;
        }
        function blit(src, sw_, sh_, dst, dw, dh, dx, dy, transpIdx) {
            for (var y = 0; y < sh_; y++) {
                var sy = y, dy2 = dy + y; if (dy2 < 0 || dy2 >= dh) continue;
                for (var x = 0; x < sw_; x++) {
                    var sx = x, dx2 = dx + x; if (dx2 < 0 || dx2 >= dw) continue;
                    var si = (sy * sw_ + sx) * 4, di = (dy2 * dw + dx2) * 4;
                    var a = src[si + 3];
                    if (a === 0) continue; // transparent pixel
                    dst[di] = src[si];
                    dst[di + 1] = src[si + 1];
                    dst[di + 2] = src[si + 2];
                    dst[di + 3] = 255;
                }
            }
        }
    }

    return { decode: decode, looksGIF: looksGIF, inspect: inspect };
}