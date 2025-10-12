/* ansi_gradient.js — tiny helpers for 16/256/truecolor ANSI gradients.
   Works with Synchronet's JS (ancient SpiderMonkey). No dependencies. */

var Gradient = (function () {
    // ---- SGR builders ----
    function sgr() {
        var args = Array.prototype.slice.call(arguments);
        return "\x1b[" + args.join(";") + "m";
    }
    var RESET = sgr(0);

    // Map simple 16-color fg/bg (0–7 normal, 8–15 bright)
    var FG16 = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
    var BG16 = [40, 41, 42, 43, 44, 45, 46, 47];

    function fg16(idx) { return sgr(FG16[idx & 15]); }
    function bg16(idx) { return sgr(BG16[idx & 7]); }

    // 256-color fg/bg
    function fg256(i) { return "\x1b[38;5;" + (i | 0) + "m"; }
    function bg256(i) { return "\x1b[48;5;" + (i | 0) + "m"; }

    // truecolor fg/bg
    function fgRGB(r, g, b) { return "\x1b[38;2;" + (r | 0) + ";" + (g | 0) + ";" + (b | 0) + "m"; }
    function bgRGB(r, g, b) { return "\x1b[48;2;" + (r | 0) + ";" + (g | 0) + ";" + (b | 0) + "m"; }

    // Utility: clamp and lerp
    function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
    function lerp(a, b, t) { return a + (b - a) * t; }

    // Convert RGB→nearest 256-color cube/grayscale (simple, fast)
    function rgbTo256(r, g, b) {
        // Try color cube first
        function toCube(v) { return Math.round(clamp(v, 0, 255) / 255 * 5); } // 0..5
        var cr = toCube(r), cg = toCube(g), cb = toCube(b);
        var cube = 16 + 36 * cr + 6 * cg + cb;

        // Grayscale ramp 232..255
        var avg = (r + g + b) / 3;
        var grayIdx = Math.round((avg - 8) / 10); // roughly 0..23
        var gray = 232 + clamp(grayIdx, 0, 23);

        // Pick whichever is closer in Euclidean RGB (rough check)
        function idxToRGB256(i) {
            if (i >= 232) {
                var v = 8 + (i - 232) * 10; return [v, v, v];
            }
            var rr = Math.floor((i - 16) / 36); var gg = Math.floor(((i - 16) % 36) / 6); var bb = (i - 16) % 6;
            return [rr * 255 / 5, gg * 255 / 5, bb * 255 / 5];
        }
        function dist2(a, b) { var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return d0 * d0 + d1 * d1 + d2 * d2; }
        var dCube = dist2([r, g, b], idxToRGB256(cube));
        var dGray = dist2([r, g, b], idxToRGB256(gray));
        return (dGray < dCube) ? gray : cube;
    }

    // Optional: nearest 16-color for fallback
    var CGA16 = [
        [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0], [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
        [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255]
    ];
    function rgbTo16(r, g, b) {
        var best = 0, bd = 1e9, i, c, d, dr, dg, db;
        for (i = 0; i < 16; i++) {
            c = CGA16[i]; dr = r - c[0]; dg = g - c[1]; db = b - c[2];
            d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    // Predefined palettes (tweak to taste)
    var PRESETS = {
        "sunset": [[255, 94, 58], [255, 149, 5], [255, 210, 0]],
        "ocean": [[0, 64, 128], [0, 160, 192], [0, 224, 224]],
        "cyber": [[255, 0, 128], [64, 0, 255], [0, 255, 255]],
        "mono": [[30, 30, 30], [220, 220, 220]],
        "futureland": [[0, 255, 180], [0, 120, 255], [140, 0, 255]]
    };

    // Build a ramp of length N by interpolating a palette of ≥2 RGB stops
    function buildRamp(stops, n) {
        var ramp = [];
        if (n <= 1) { ramp.push(stops[0]); return ramp; }
        var segments = stops.length - 1;
        var stepsPerSeg = n / segments;
        var i, seg, t, a, b;
        for (i = 0; i < n; i++) {
            seg = Math.min(segments - 1, Math.floor(i / stepsPerSeg));
            t = (i - seg * stepsPerSeg) / stepsPerSeg;
            a = stops[seg]; b = stops[seg + 1];
            ramp.push([Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]);
        }
        return ramp;
    }

    // Core render: background color blocks (space char) or full-block glyphs
    function renderRamp(ramp, opts) {
        var mode = opts.mode || "256"; // "16" | "256" | "truecolor"
        var glyph = (opts.glyph === "full") ? "\u2588" : " "; // '█' or space
        var useBG = (glyph === " "); // If space, color via BG; if full, color via FG
        var s = "", lastCode = "";

        for (var i = 0; i < ramp.length; i++) {
            var c = ramp[i], code;
            if (mode === "truecolor") {
                code = useBG ? bgRGB(c[0], c[1], c[2]) : fgRGB(c[0], c[1], c[2]);
            } else if (mode === "256") {
                var idx256 = rgbTo256(c[0], c[1], c[2]);
                code = useBG ? bg256(idx256) : fg256(idx256);
            } else {
                var idx16 = rgbTo16(c[0], c[1], c[2]);
                code = useBG ? bg16(idx16 & 7) : fg16(idx16);
            }
            if (code !== lastCode) { s += code; lastCode = code; }
            s += glyph;
        }
        return s + RESET;
    }

    // Public: get(typeOrStops, width, direction, options)
    function get(type, width, direction /*'l' or 'r'*/, options) {
        options = options || {};
        var stops;

        if (typeof type === "string") {
            var preset = PRESETS[type];
            if (!preset) preset = PRESETS["mono"]; // fallback
            stops = preset;
        } else if (type && type.length >= 2) {
            // e.g., [[r,g,b],[r,g,b],...]
            stops = type;
        } else {
            // default
            stops = PRESETS["mono"];
        }

        var ramp = buildRamp(stops, width > 0 ? width : 1);
        if (direction === "r") ramp.reverse();

        return renderRamp(ramp, {
            mode: options.mode || "256",     // "16" | "256" | "truecolor"
            glyph: options.glyph || "space", // "space" (BG) or "full" (FG '█')
        });
    }

    // Sugar: CGA-only step gradient (no interpolation, hard bands)
    function getCGAstep(cgaIndices /*[0..15,...]*/, width, direction, options) {
        options = options || {};
        var glyph = (options.glyph === "full") ? "\u2588" : " ";
        var useBG = (glyph === " ");
        var s = "", last = "";
        if (direction === "r") cgaIndices = cgaIndices.slice().reverse();

        // Repeat the palette to fill width
        for (var i = 0; i < width; i++) {
            var idx = cgaIndices[i % cgaIndices.length] & 15;
            var code = useBG ? bg16(idx & 7) : fg16(idx);
            if (code !== last) { s += code; last = code; }
            s += glyph;
        }
        return s + RESET;
    }

    // Convenience: pad a string to width with gradient on the right/left/both
    function stringPad(text, width, where /*'right'|'left'|'both'*/, gradOpts) {
        var len = text.length;
        var needed = Math.max(0, width - len);
        if (needed === 0) return text;
        var half = Math.floor(needed / 2);
        var left = "", right = "";

        if (where === "left" || where === "both") {
            left = get(gradOpts.type || "mono", (where === "both") ? half : needed, gradOpts.dir || "l", gradOpts);
        }
        if (where === "right" || where === "both") {
            right = get(gradOpts.type || "mono", (where === "both") ? (needed - half) : needed, gradOpts.dir || "r", gradOpts);
        }
        if (where === "left") return left + text;
        if (where === "right") return text + right;
        return left + text + right;
    }

    return {
        RESET: RESET,
        get: get,            // (type|[[r,g,b],...], width, 'l'|'r', {mode,glyph})
        getCGAstep: getCGAstep, // (indices[], width, dir, {glyph})
        stringPad: stringPad,    // (text, width, 'right'|'left'|'both', {type,dir,mode,glyph})
    };
})();