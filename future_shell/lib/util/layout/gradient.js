/* ansi_gradient.js — 16-color gradient helpers for Synchronet BBS
   Adds: full/space/half/shade/mix render modes (CP437 only)
   by Futureland 2025
*/

var Gradient = (function () {
    var RESET = "\x01n";

    // Foreground / Background Ctrl-A lookups
    var FG_CTRL = {
        0: "\x01k", 1: "\x01b", 2: "\x01g", 3: "\x01c",
        4: "\x01r", 5: "\x01m", 6: "\x01y", 7: "\x01w",
        8: "\x01h\x01k", 9: "\x01h\x01b", 10: "\x01h\x01g", 11: "\x01h\x01c",
        12: "\x01h\x01r", 13: "\x01h\x01m", 14: "\x01h\x01y", 15: "\x01h\x01w"
    };
    var BG_CTRL = {
        0: "\x010", 1: "\x011", 2: "\x012", 3: "\x013",
        4: "\x014", 5: "\x015", 6: "\x016", 7: "\x017"
    };

    // CP437 glyphs
    var GLYPH_FULL = "\xDB"; // █
    var GLYPH_HALF = "\xDF"; // ▀
    var GLYPH_SPACE = " ";
    var SHADE_LIGHT = "\xB0"; // ░
    var SHADE_MED = "\xB1"; // ▒
    var SHADE_DARK = "\xB2"; // ▓

    // Coverage map for shade blending (mix mode)
    var SHADE_TABLE = [
        { glyph: SHADE_LIGHT, alpha: 0.25 },
        { glyph: SHADE_MED, alpha: 0.50 },
        { glyph: SHADE_DARK, alpha: 0.75 },
        { glyph: GLYPH_FULL, alpha: 1.00 }
    ];

    var PRESETS = {
        // --- your originals ---
        sunset: [[255, 94, 58], [255, 149, 5], [255, 210, 0]],
        ocean: [[0, 64, 128], [0, 160, 192], [0, 224, 224]],
        cyber: [[255, 0, 128], [64, 0, 255], [0, 255, 255]],
        mono: [[30, 30, 30], [220, 220, 220]],
        futureland: [[0, 255, 180], [0, 120, 255], [140, 0, 255]],

        // --- warm / sky ---
        sunrise: [[255, 102, 0], [255, 153, 51], [255, 221, 128]],
        dusk: [[64, 0, 128], [128, 0, 96], [255, 128, 64]],
        twilight: [[20, 30, 60], [90, 60, 120], [255, 160, 90]],
        ember: [[64, 0, 0], [192, 32, 0], [255, 160, 40]],
        fire: [[255, 0, 0], [255, 128, 0], [255, 255, 0]],
        lava: [[80, 0, 0], [220, 32, 0], [255, 96, 0], [255, 200, 80]],

        // --- cool / aurora / ice ---
        aurora: [[0, 255, 128], [0, 180, 255], [120, 0, 255]],
        glacier: [[200, 240, 255], [140, 200, 255], [60, 120, 200]],
        ice: [[220, 240, 255], [180, 220, 255], [140, 200, 255]],
        deep_sea: [[0, 20, 40], [0, 90, 140], [0, 160, 200]],
        teal_wave: [[0, 120, 120], [0, 180, 160], [0, 220, 200]],

        // --- greens / nature ---
        forest: [[10, 40, 10], [20, 100, 40], [80, 160, 80]],
        jungle: [[0, 80, 20], [40, 140, 40], [140, 220, 100]],
        spring: [[120, 200, 120], [170, 230, 150], [220, 255, 200]],
        moss: [[40, 60, 20], [80, 120, 40], [140, 180, 80]],

        // --- earth / sand / autumn ---
        desert: [[210, 170, 100], [230, 190, 120], [250, 210, 150]],
        sandstorm: [[180, 140, 80], [210, 170, 100], [240, 200, 120]],
        canyon: [[120, 60, 30], [180, 90, 50], [220, 140, 100]],
        autumn: [[170, 60, 20], [220, 120, 40], [240, 200, 80]],

        // --- pastels / candy ---
        pastel_dreams: [[255, 200, 220], [200, 220, 255], [200, 255, 230]],
        cotton_candy: [[255, 160, 200], [200, 180, 255], [160, 220, 255]],
        sakura: [[255, 182, 193], [255, 214, 220], [255, 240, 245]],
        watermelon: [[30, 150, 80], [180, 40, 60], [250, 180, 190]],
        mint: [[180, 255, 220], [130, 230, 200], [90, 200, 180]],
        lavender: [[160, 120, 200], [190, 150, 230], [220, 190, 255]],

        // --- neon / synthwave / vapor ---
        vaporwave: [[255, 128, 192], [128, 128, 255], [128, 255, 255]],
        synthwave: [[255, 64, 160], [255, 120, 64], [255, 240, 96]],
        neon: [[0, 255, 64], [64, 0, 255], [255, 0, 255]],
        nightclub: [[0, 0, 0], [160, 0, 160], [255, 0, 96]],

        // --- metals ---
        silver: [[170, 170, 170], [210, 210, 210], [240, 240, 240]],
        steel: [[100, 110, 120], [150, 160, 170], [200, 210, 220]],
        gold: [[170, 120, 20], [220, 170, 40], [255, 220, 80]],
        copper: [[140, 80, 40], [180, 110, 60], [220, 150, 80]],
        bronze: [[110, 80, 40], [150, 110, 60], [190, 150, 80]],

        // --- primaries / brights ---
        primary: [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
        candy: [[255, 64, 64], [255, 128, 64], [255, 64, 200]],
        citrus: [[255, 160, 0], [255, 220, 0], [180, 255, 40]],
        berry: [[120, 0, 140], [200, 40, 160], [255, 120, 200]],
        sky: [[120, 180, 255], [80, 140, 255], [40, 100, 220]],

        // --- darks / noir ---
        noir: [[0, 0, 0], [60, 60, 60], [140, 140, 140]],
        midnight: [[0, 0, 20], [20, 20, 60], [60, 80, 120]],
        space: [[0, 0, 0], [10, 10, 30], [40, 40, 100]],

        // --- fun / thematic ---
        matrix: [[0, 0, 0], [0, 255, 70], [200, 255, 200]],
        magma: [[30, 0, 0], [200, 30, 0], [255, 180, 60]],
        glacier_sun: [[80, 140, 200], [160, 210, 255], [255, 230, 160]],
        peachy: [[255, 150, 130], [255, 190, 150], [255, 220, 180]],
        grape: [[70, 20, 120], [140, 60, 200], [200, 140, 255]],
        mango: [[255, 140, 0], [255, 190, 60], [255, 230, 140]],
        blueberry: [[40, 80, 180], [80, 130, 230], [150, 190, 255]],

        // --- rainbow (multi-stop) ---
        rainbow: [[255, 0, 0], [255, 128, 0], [255, 255, 0],
        [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255]],
        // --- atmospheric ---
        aurora_borealis: [
            [0, 0, 0],
            [10, 40, 30],
            [0, 150, 80],
            [0, 255, 120],
            [120, 80, 255],
            [200, 180, 255]
        ],

        desert_sunset: [
            [80, 30, 10],
            [160, 60, 10],
            [255, 120, 40],
            [255, 190, 100],
            [255, 230, 160]
        ],

        inferno: [
            [30, 0, 0],
            [180, 0, 0],
            [255, 80, 0],
            [255, 180, 0],
            [255, 240, 180]
        ],

        horizon: [
            [0, 0, 120],
            [0, 60, 180],
            [0, 120, 220],
            [100, 200, 255],
            [255, 230, 160],
            [255, 150, 80]
        ],

        thunderstorm: [
            [0, 0, 30],
            [10, 10, 60],
            [50, 80, 100],
            [180, 220, 255],
            [80, 100, 140],
            [0, 0, 30]
        ],

        // --- vaporwave / neon ---
        miami_nights: [
            [40, 0, 80],
            [140, 0, 160],
            [255, 0, 120],
            [255, 100, 0],
            [255, 240, 100]
        ],

        synthwave_5: [
            [40, 0, 60],
            [160, 0, 100],
            [255, 0, 120],
            [255, 120, 40],
            [255, 240, 80]
        ],

        laser_grid: [
            [0, 0, 0],
            [60, 0, 120],
            [255, 0, 255],
            [255, 64, 128],
            [255, 180, 80],
            [255, 255, 255]
        ],

        // --- elemental / fantasy ---
        magma_flow: [
            [20, 0, 0],
            [120, 0, 0],
            [255, 60, 0],
            [255, 160, 0],
            [255, 220, 80]
        ],

        frost_fire: [
            [0, 0, 180],
            [0, 180, 255],
            [255, 255, 255],
            [255, 160, 0],
            [255, 40, 0]
        ],

        mystic: [
            [20, 0, 40],
            [80, 0, 120],
            [150, 0, 255],
            [0, 120, 255],
            [0, 255, 180],
            [255, 255, 200]
        ],

        galaxy: [
            [10, 0, 30],
            [40, 0, 80],
            [80, 0, 120],
            [160, 0, 200],
            [60, 120, 255],
            [200, 200, 255]
        ],

        plasma: [
            [60, 0, 180],
            [120, 0, 255],
            [255, 0, 255],
            [255, 120, 0],
            [255, 255, 0],
            [255, 255, 255]
        ],

        rainbow_long: [
            [255, 0, 0],
            [255, 128, 0],
            [255, 255, 0],
            [0, 255, 0],
            [0, 255, 255],
            [0, 0, 255],
            [255, 0, 255],
            [255, 255, 255]
        ],

        // --- nature / earth ---
        forest_canopy: [
            [20, 40, 10],
            [40, 80, 20],
            [60, 120, 40],
            [100, 160, 60],
            [160, 200, 100]
        ],

        ocean_depths: [
            [0, 0, 20],
            [0, 40, 60],
            [0, 100, 120],
            [0, 160, 180],
            [0, 220, 220]
        ],

        autumn_forest: [
            [80, 20, 0],
            [160, 60, 0],
            [220, 120, 0],
            [255, 200, 0],
            [255, 240, 180]
        ],

        // --- metallic sheens ---
        chrome: [
            [60, 60, 60],
            [140, 140, 140],
            [220, 220, 220],
            [120, 120, 120],
            [80, 80, 80]
        ],

        gold_sheen: [
            [80, 50, 0],
            [150, 100, 20],
            [230, 180, 50],
            [255, 220, 120],
            [230, 180, 50],
            [150, 100, 20]
        ],

        copper_sheen: [
            [70, 40, 20],
            [130, 70, 30],
            [190, 110, 50],
            [230, 160, 90],
            [190, 110, 50]
        ],

        // --- exotic / fun ---
        vapor_rainbow: [
            [255, 128, 192],
            [128, 128, 255],
            [128, 255, 255],
            [128, 255, 128],
            [255, 255, 128],
            [255, 180, 255]
        ],

        candystripe: [
            [255, 80, 120],
            [255, 120, 160],
            [255, 160, 200],
            [255, 200, 240],
            [255, 160, 200],
            [255, 120, 160],
            [255, 80, 120]
        ],

        tron_grid: [
            [0, 0, 0],
            [0, 80, 120],
            [0, 200, 255],
            [80, 255, 255],
            [200, 255, 255]
        ],

        // --- grayscale studies ---
        grayscale_5: [
            [0, 0, 0],
            [64, 64, 64],
            [128, 128, 128],
            [192, 192, 192],
            [255, 255, 255]
        ],
        grayscale_7: [
            [0, 0, 0],
            [42, 42, 42],
            [84, 84, 84],
            [126, 126, 126],
            [168, 168, 168],
            [210, 210, 210],
            [255, 255, 255]
        ]
    };

    // CGA16 palette
    var CGA16 = [
        [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0],
        [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
        [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85],
        [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255]
    ];

    // helpers
    function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function fgCode(i) { return FG_CTRL[i & 15] || ""; }
    function bgCode(i) { return BG_CTRL[i & 7] || ""; }

    function rgbTo16(r, g, b) {
        var best = 0, bd = 1e9;
        for (var i = 0; i < 16; i++) {
            var c = CGA16[i], dr = r - c[0], dg = g - c[1], db = b - c[2];
            var d = dr * dr + dg * dg + db * db;
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    function buildRamp(stops, n) {
        var ramp = [];
        if (n <= 1) { ramp.push(stops[0]); return ramp; }
        var segs = stops.length - 1, step = n / segs;
        for (var i = 0; i < n; i++) {
            var s = Math.min(segs - 1, Math.floor(i / step));
            var t = (i - s * step) / step;
            var a = stops[s], b = stops[s + 1];
            ramp.push([
                Math.round(lerp(a[0], b[0], t)),
                Math.round(lerp(a[1], b[1], t)),
                Math.round(lerp(a[2], b[2], t))
            ]);
        }
        return ramp;
    }

    function resolveStops(t) {
        // if type is null, get a random preset
        if (typeof t === "string") return PRESETS[t] || PRESETS.mono;
        if (t && t.length >= 2) return t;
        return PRESETS.mono;
    }

    // --- normal full/space render ---
    function renderRamp(ramp, opts) {
        opts = opts || {};
        var g = opts.glyph || "full";
        if (g === "shade") return renderShade(ramp, opts);
        if (g === "half") return renderHalf(ramp, opts);
        if (g === "mix") return renderMix(ramp, opts);

        var useBG = (g === "space");
        var glyph = useBG ? GLYPH_SPACE : (g === "full" ? GLYPH_FULL : g);
        var out = "", last = "";
        for (var i = 0; i < ramp.length; i++) {
            var c = ramp[i], idx = rgbTo16(c[0], c[1], c[2]) & 15;
            var code = useBG ? bgCode(idx & 7) : fgCode(idx);
            if (code !== last) { out += code; last = code; }
            out += glyph;
        }
        if (opts.reset === false) return out;
        return out + RESET;
    }

    // --- half-block FG/BG blend ---
    function renderHalf(ramp, opts) {
        var out = "", lastFG = "", lastBG = "";
        for (var i = 0; i < ramp.length; i += 2) {
            var top = ramp[i], bot = ramp[i + 1] || ramp[i];
            var fgIdx = rgbTo16(top[0], top[1], top[2]) & 15;
            var bgIdx = rgbTo16(bot[0], bot[1], bot[2]) & 7;
            var bg = bgCode(bgIdx); if (bg !== lastBG) { out += bg; lastBG = bg; }
            var fg = fgCode(fgIdx); if (fg !== lastFG) { out += fg; lastFG = fg; }
            out += GLYPH_HALF;
        }
        if (opts.reset === false) return out;
        return out + RESET;
    }

    // --- simple shade luminance renderer ---
    function renderShade(ramp, opts) {
        var bgIdx = (opts.hasOwnProperty("bgIndex")) ? (opts.bgIndex & 7) : 0;
        var fgOverride = (opts.hasOwnProperty("fgIndex")) ? (opts.fgIndex & 15) : null;
        var out = "", bg = bgCode(bgIdx); if (bg) out += bg;
        var lastFG = "";
        for (var i = 0; i < ramp.length; i++) {
            var c = ramp[i];
            var L = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
            var glyph = (L < 0.25) ? SHADE_LIGHT : (L < 0.5) ? SHADE_MED : (L < 0.75) ? SHADE_DARK : GLYPH_FULL;
            var fgIdx = (fgOverride !== null) ? fgOverride : (rgbTo16(c[0], c[1], c[2]) & 15);
            var fg = fgCode(fgIdx);
            if (fg !== lastFG) { out += fg; lastFG = fg; }
            out += glyph;
        }
        if (opts.reset === false) return out;
        return out + RESET;
    }

    // ===== multicolor 512-step blender =====
    var BG_RGB = (function () { var a = []; for (var i = 0; i < 8; i++)a[i] = CGA16[i]; return a; })();
    var FG_RGB = CGA16;
    function blendRGB(bg, fg, a) {
        return [
            (1 - a) * bg[0] + a * fg[0],
            (1 - a) * bg[1] + a * fg[1],
            (1 - a) * bg[2] + a * fg[2]
        ];
    }

    function bestMixFor(target) {
        var tr = target[0], tg = target[1], tb = target[2];
        var bestBG = 0, bestFG = 15, bestShade = SHADE_TABLE[3], bestErr = 1e9;
        for (var bi = 0; bi < 8; bi++) {
            var bg = BG_RGB[bi];
            for (var fi = 0; fi < 16; fi++) {
                var fg = FG_RGB[fi];
                for (var si = 0; si < 4; si++) {
                    var sh = SHADE_TABLE[si];
                    var m = blendRGB(bg, fg, sh.alpha);
                    var dr = m[0] - tr, dg = m[1] - tg, db = m[2] - tb;
                    var e = dr * dr + dg * dg + db * db;
                    if (e < bestErr) { bestErr = e; bestBG = bi; bestFG = fi; bestShade = sh; }
                }
            }
        }
        return { bgIdx: bestBG, fgIdx: bestFG, glyph: bestShade.glyph };
    }

    function renderMix(ramp, opts) {
        var out = "", lastBG = -1, lastFG = -1;
        for (var i = 0; i < ramp.length; i++) {
            var c = ramp[i];
            var p = bestMixFor(c);
            if (p.bgIdx !== lastBG) { out += bgCode(p.bgIdx); lastBG = p.bgIdx; }
            if (p.fgIdx !== lastFG) { out += fgCode(p.fgIdx); lastFG = p.fgIdx; }
            out += p.glyph;
        }
        if (opts.reset === false) return out;
        return out + RESET;
    }

    // ===== public APIs =====
    function get(type, width, dir, opts) {
        opts = opts || {};
        var stops = resolveStops(type);
        var n = width > 0 ? width : 1;
        var ramp = buildRamp(stops, n);
        if (dir === "r") ramp.reverse();
        return renderRamp(ramp, opts);
    }

    function getHalf(type, width, dir, opts) {
        opts = opts || {};
        var stops = resolveStops(type);
        var ramp = buildRamp(stops, Math.max(1, width * 2));
        if (dir === "r") ramp.reverse();
        return renderHalf(ramp, opts);
    }

    function getMix(type, width, dir, opts) {
        opts = opts || {};
        var stops = resolveStops(type);
        var ramp = buildRamp(stops, width > 0 ? width : 1);
        if (dir === "r") ramp.reverse();
        return renderMix(ramp, opts);
    }

    function getCGAstep(indices, width, dir, opts) {
        opts = opts || {};
        indices = indices || [0];
        if (dir === "r") indices = indices.slice().reverse();
        var useBG = (opts.glyph === "space");
        var glyph = useBG ? GLYPH_SPACE : (opts.glyph && opts.glyph !== "full" ? opts.glyph : GLYPH_FULL);
        var out = "", last = "";
        for (var i = 0; i < width; i++) {
            var idx = indices[i % indices.length] & 15;
            var code = useBG ? bgCode(idx & 7) : fgCode(idx);
            if (code !== last) { out += code; last = code; }
            out += glyph;
        }
        if (opts.reset === false) return out;
        return out + RESET;
    }

    function stringPad(text, width, where, gradOpts) {
        gradOpts = gradOpts || {};
        var len = text.length;
        var needed = Math.max(0, width - len);
        if (needed === 0) return text;
        var half = Math.floor(needed / 2), left = "", right = "";
        var base = { type: gradOpts.type || "mono", glyph: gradOpts.glyph || "full", reset: false };
        if (base.type === 'random') {
            base.type = Object.keys(PRESETS)[Math.floor(Math.random() * Object.keys(PRESETS).length)];
        }
        var leftDir = gradOpts.dirLeft || gradOpts.dir || "l";
        var rightDir = gradOpts.dirRight || gradOpts.dir ? gradOpts.dir : "r";
        if (!gradOpts.dirRight && gradOpts.dir === "l") rightDir = "r";
        if (!gradOpts.dirLeft && gradOpts.dir === "r") leftDir = "r";
        if (where === "left" || where === "both")
            left = get(base.type, (where === "both") ? half : needed, leftDir, base);
        if (where === "right" || where === "both")
            right = get(base.type, (where === "both") ? (needed - half) : needed, rightDir, base);
        var res = (where === "left") ? left + text : (where === "right") ? text + right : left + text + right;
        if (gradOpts.reset === false) return res;
        return res + RESET;
    }

    return {
        RESET: RESET,
        get: get,
        getHalf: getHalf,
        getMix: getMix,
        getCGAstep: getCGAstep,
        stringPad: stringPad
    };
})();
