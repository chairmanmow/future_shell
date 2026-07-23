/* sixel.js — small helper for rendering images as DEC SIXEL graphics on
 * capable terminals (SyncTERM >= cterm 1.189, etc.).
 *
 * Detection piggybacks on cterm_lib.js's supports_sixel(); conversion shells
 * out to libsixel's img2sixel. Returns the raw sixel escape sequence as a
 * string so the caller can console.write() it at an absolute cursor position.
 *
 * IMPORTANT (frame gotcha): sixel paints at the terminal's real cursor and the
 * Synchronet Frame system has no idea it happened. Callers must blit AFTER the
 * final frame cycle() and leave the covered cells blank, or the next cycle
 * repaints over the image. See newsreader.js _renderHeroSixel / draw().
 *
 * Usage:
 *   var Sixel = load('future_shell/lib/util/sixel.js');
 *   if (Sixel.supported()) { var s = Sixel.fileToSixel(path, widthPx); ... }
 */

(function () {
    'use strict';

    var _img2sixel;   // undefined=unprobed, null=none, string=path
    function img2sixelBin() {
        if (_img2sixel !== undefined) return _img2sixel;
        _img2sixel = null;
        var cands = ['/usr/bin/img2sixel', '/usr/local/bin/img2sixel'];
        for (var i = 0; i < cands.length; i++) { if (file_exists(cands[i])) { _img2sixel = cands[i]; return _img2sixel; } }
        try {
            var p = system.popen ? system.popen('command -v img2sixel 2>/dev/null') : '';
            p = (typeof p === 'string') ? p : (p && p.length ? p[0] : '');
            if (p) { p = p.replace(/[\r\n]+/g, '').replace(/^\s+|\s+$/g, ''); if (p && file_exists(p)) _img2sixel = p; }
        } catch (e) {}
        return _img2sixel;
    }

    function termSupports() {
        // cterm_lib exposes supports_sixel(); load it if not already present.
        try {
            if (typeof supports_sixel !== 'function') load('cterm_lib.js');
            if (typeof supports_sixel === 'function') return !!supports_sixel();
        } catch (e) {}
        return false;
    }

    // True only when BOTH the terminal and the local encoder are available.
    function supported() {
        return !!(termSupports() && img2sixelBin());
    }

    function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

    function tmpPath(ext) {
        var dir = system.temp_dir || '/tmp/';
        return dir + 'sx_' + (+new Date()) + '_' + (Math.random() * 1e9 | 0) + (ext || '');
    }

    /* Convert a local image file to a sixel escape string scaled to widthPx
     * pixels (aspect preserved). Returns the sixel string, or null on failure.
     * opts.timeout_s bounds the encoder (default 10). */
    function fileToSixel(path, widthPx, opts) {
        return encode(path, '-w ' + Math.max(16, widthPx | 0), opts);
    }

    // Low-level: run img2sixel with the given size flag(s); return sixel string.
    function encode(path, sizeFlags, opts) {
        opts = opts || {};
        var bin = img2sixelBin();
        if (!bin || !path || !file_exists(path)) return null;
        var out = tmpPath('.six');
        try {
            var cmd = '/usr/bin/timeout ' + (opts.timeout_s || 10) + ' ' + shellQuote(bin)
                + ' ' + sizeFlags
                + (opts.colors ? (' -p ' + (opts.colors | 0)) : '')
                + ' ' + shellQuote(path)
                + ' >' + shellQuote(out) + ' 2>/dev/null';
            system.exec(cmd);
            var f = new File(out);
            if (!f.open('rb')) return null;
            var data = f.read();
            f.close();
            if (!data || !data.length) return null;
            if (data.indexOf('\x1bP') === -1) return null;   // not a sixel payload
            return data;
        } catch (e) {
            try { log(LOG_WARNING, 'sixel: encode error: ' + e); } catch (_) {}
            return null;
        } finally {
            try { if (file_exists(out)) file_remove(out); } catch (_) {}
        }
    }

    // Pull the encoded pixel size out of the sixel raster header:
    //   ESC P <params> q " Pan ; Pad ; Ph ; Pv
    function parseDims(data) {
        if (!data) return null;
        var m = String(data).substr(0, 64).match(/"(\d+);(\d+);(\d+);(\d+)/);
        if (!m) return null;
        return { w: parseInt(m[3], 10), h: parseInt(m[4], 10) };
    }

    // Encode to FIT inside maxWpx x maxHpx, preserving aspect. Returns
    // { data, w, h } (w/h are the real encoded pixel dimensions) or null.
    function fileToSixelFit(path, maxWpx, maxHpx, opts) {
        maxWpx = Math.max(16, maxWpx | 0);
        maxHpx = Math.max(16, maxHpx | 0);
        var data = encode(path, '-w ' + maxWpx, opts);   // width-bound, aspect kept
        if (!data) return null;
        var dims = parseDims(data);
        if (dims && dims.h > maxHpx) {
            // Too tall for the box — re-bound by height instead (now narrower).
            var data2 = encode(path, '-h ' + maxHpx, opts);
            if (data2) {
                var d2 = parseDims(data2);
                data = data2;
                dims = d2 || { w: maxWpx, h: maxHpx };
            }
        }
        return { data: data, w: dims ? dims.w : maxWpx, h: dims ? dims.h : maxHpx };
    }

    return {
        supported: supported,
        termSupports: termSupports,
        encoderAvailable: function () { return !!img2sixelBin(); },
        fileToSixel: fileToSixel,
        fileToSixelFit: fileToSixelFit,
        parseDims: parseDims
    };

})();
