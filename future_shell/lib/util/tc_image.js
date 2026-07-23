/* tc_image.js — truecolor (24-bit) half-block image renderer for cterm/SyncTERM.
 *
 * Uses ImageMagick to resize+letterbox an image to cols x (rows*2) pixels, then
 * emits one raw ANSI string per CHARACTER row built from the upper-half-block
 * glyph (CP437 0xDF = "▀"): the cell's foreground colours the top pixel and
 * the background colours the bottom pixel, so each cell shows two stacked pixels.
 *
 *   ESC[38;2;rT;gT;bT;48;2;rB;gB;bB m  \xDF   (per cell)
 *
 * Truecolor cannot live in a Synchronet Frame (frames are 16-colour attribute
 * cells), so the caller writes these rows RAW to the console (gotoxy per row),
 * the same way sixel is blitted — outside the frame buffer.
 *
 * Usage:
 *   var TC = load('future_shell/lib/util/tc_image.js');
 *   var img = TC.renderHalfBlock(path, cols, rows);   // {rows:[str,...], cols, rowCount} | null
 *   for (var i=0;i<img.rows.length;i++){ console.gotoxy(x, y+i); console.write(img.rows[i]); }
 */

(function () {
    'use strict';

    var _bin;
    function convertBin() {
        if (_bin !== undefined) return _bin;
        _bin = null;
        var cands = ['/sbbs/exec/convert', '/usr/bin/convert', '/usr/local/bin/convert'];
        for (var i = 0; i < cands.length; i++) { if (file_exists(cands[i])) { _bin = cands[i]; return _bin; } }
        try {
            var p = system.popen ? system.popen('command -v convert 2>/dev/null') : '';
            p = (typeof p === 'string') ? p : (p && p.length ? p[0] : '');
            if (p) { p = p.replace(/[\r\n]+/g, '').replace(/^\s+|\s+$/g, ''); if (p && file_exists(p)) _bin = p; }
        } catch (e) {}
        return _bin;
    }

    function available() { return !!convertBin(); }

    function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
    function tmpPath(ext) {
        var dir = system.temp_dir || '/tmp/';
        return dir + 'tc_' + (+new Date()) + '_' + (Math.random() * 1e9 | 0) + (ext || '');
    }

    // Resize+letterbox `path` into cols x (rows*2) pixels and return the raw RGB
    // byte string (length cols*rows*2*3), or null.
    function rgbBytes(path, pxW, pxH, opts) {
        var bin = convertBin();
        if (!bin) return null;
        var bg = (opts && opts.bg) || 'black';
        var out = tmpPath('.rgb');
        try {
            var cmd = '/usr/bin/timeout ' + ((opts && opts.timeout_s) || 12) + ' ' + q(bin)
                + ' ' + q(path)
                + ' -resize ' + pxW + 'x' + pxH
                + ' -background ' + bg + ' -gravity center -extent ' + pxW + 'x' + pxH
                + ' -depth 8 RGB:' + q(out)
                + ' 2>/dev/null';
            system.exec(cmd);
            var f = new File(out);
            if (!f.open('rb')) return null;
            var data = f.read();
            f.close();
            if (!data || data.length < pxW * pxH * 3) return null;
            return data;
        } catch (e) {
            try { log(LOG_WARNING, 'tc_image: convert error: ' + e); } catch (_) {}
            return null;
        } finally {
            try { if (file_exists(out)) file_remove(out); } catch (_) {}
        }
    }

    // Source pixel dimensions via ImageMagick, or null.
    function sourceDims(path) {
        try {
            var bin = convertBin();
            if (!bin || !system.popen) return null;
            var r = system.popen(q(bin) + ' ' + q(path) + ' -format "%w %h" info: 2>/dev/null');
            r = (typeof r === 'string') ? r : (r && r.length ? r.join(' ') : '');
            var m = String(r).match(/(\d+)\s+(\d+)/);
            if (!m) return null;
            return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
        } catch (e) { return null; }
    }

    function renderHalfBlock(path, cols, rows, opts) {
        cols = Math.max(1, cols | 0);
        rows = Math.max(1, rows | 0);
        if (!path || !file_exists(path)) return null;
        // Skip tracking pixels / 1x1 beacons (e.g. feedpress) — scaling a 1px
        // image up yields a solid-colour rectangle, not a photo.
        var dim = sourceDims(path);
        if (dim && (dim.w <= 2 || dim.h <= 2)) return null;
        var pxW = cols, pxH = rows * 2;
        var data = rgbBytes(path, pxW, pxH, opts);
        if (!data) return null;
        var HALF = '\xDF';        // CP437 upper half block
        var out = [];
        for (var r = 0; r < rows; r++) {
            var topRow = (r * 2) * cols;
            var botRow = (r * 2 + 1) * cols;
            var s = '';
            var pT = -1, pB = -1;   // last emitted top/bottom packed colour
            for (var c = 0; c < cols; c++) {
                var ti = (topRow + c) * 3, bi = (botRow + c) * 3;
                var tr = data.charCodeAt(ti), tg = data.charCodeAt(ti + 1), tb = data.charCodeAt(ti + 2);
                var br = data.charCodeAt(bi), bg = data.charCodeAt(bi + 1), bb = data.charCodeAt(bi + 2);
                var packT = (tr << 16) | (tg << 8) | tb;
                var packB = (br << 16) | (bg << 8) | bb;
                // Only re-emit the SGR when a colour actually changed (smaller payload).
                if (packT !== pT || packB !== pB) {
                    s += '\x1B[38;2;' + tr + ';' + tg + ';' + tb + ';48;2;' + br + ';' + bg + ';' + bb + 'm';
                    pT = packT; pB = packB;
                }
                s += HALF;
            }
            s += '\x1B[0m';
            out.push(s);
        }
        return { rows: out, cols: cols, rowCount: rows };
    }

    return {
        available: available,
        renderHalfBlock: renderHalfBlock
    };

})();
