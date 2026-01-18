/* ansi_core.js — drop-in with preCGAify + FS (default), optional Bayer dither,
"use strict";
   perceptual nearestCGA, BG bias for half-blocks, Unicode toggle, and a
   convenience pipelineHalfBlock().  Keeps your existing API/returns. */

var USE_UNICODE = false; // false => strict CP437 half-block '\xDF'; true => Unicode U+2580

// --- universal call helpers for unknown signatures (kept for compatibility) ---
function tryCalls(fn, calls) {
  for (var i = 0; i < calls.length; i++) {
    try { var out = calls[i](); if (out !== undefined && out !== null) return out; } catch (e) { }
  }
  throw "No compatible signature for " + (fn.name || "function");
}
function asImage(rgba, w, h) {
  return (rgba && typeof rgba === "object" && rgba.rgba && rgba.width && rgba.height)
    ? rgba
    : { rgba: rgba, width: w, height: h };
}
function normImage(img) {
  if (img && img.rgba && typeof img.width === "number" && typeof img.height === "number") return img;
  if (img && (img.constructor === Uint8Array || img.constructor === Array))
    throw "Returned raw RGBA without dimensions";
  return img;
}

// These wrappers are optional for callers who still rely on them:
function scaleAuto(img, cols) {
  var f = ANSICore.scaleNearestRGBA;
  return normImage(tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height, cols); },
    function () { return f(asImage(img.rgba, img.width, img.height), cols); }
  ]));
}
function ditherAuto(img) {
  var f = ANSICore.ditherCGA_FloydSteinberg;
  var out = tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height); },
    function () { return f(asImage(img.rgba, img.width, img.height)); }
  ]);
  if (out && out.rgba) return out;
  if (out && out.constructor === Uint8Array) return out;
  if (out && out.constructor === Array) return new Uint8Array(out);
  throw "Unexpected dither return";
}
function ansiAuto(img, opts) {
  var f = ANSICore.ansiHalfBlock;
  return tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height, opts); },
    function () { return f(asImage(img.rgba, img.width, img.height), opts); }
  ]);
}

// ===============================================================
// ================  FACTORY  ====================================
// ===============================================================
function ANSICoreFactory() {
  // Classic CGA palette
  var CGA = [
    [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0],
    [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
    [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85],
    [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255]
  ];

  // Perceptual-ish nearest CGA with slight penalty for bright colors
  function nearestCGA(r, g, b) {
    var best = 0, dmin = 1e20;
    for (var i = 0; i < 16; i++) {
      var cr = CGA[i][0], cg = CGA[i][1], cb = CGA[i][2];
      var dr = r - cr, dg = g - cg, db = b - cb;
      var d = (0.60 * dr * dr) + (1.00 * dg * dg) + (0.40 * db * db);
      if (i >= 8) d *= 1.04; // nudge against bright unless clearly better
      if (d < dmin) { dmin = d; best = i; }
    }
    return best;
  }

  // Nearest-neighbor scaler (positional or object) -> {rgba,width,height}
  function scaleNearestRGBA(arg1, arg2, arg3, arg4) {
    var rgba, w, h, targetCols;
    if (arg1 && typeof arg1 === 'object' && arg1.rgba) {
      rgba = arg1.rgba; w = arg1.width | 0; h = arg1.height | 0; targetCols = arg2 | 0;
    } else {
      rgba = arg1; w = arg2 | 0; h = arg3 | 0; targetCols = arg4 | 0;
    }
    if (!rgba || !w || !h || !targetCols) throw "scaleNearestRGBA: invalid args";

    var th = Math.max(2, Math.ceil(h * (targetCols / w)));
    var out = new Uint8Array(targetCols * th * 4);
    for (var y = 0; y < th; y++) {
      var sy = Math.min(h - 1, Math.floor(y * h / th));
      for (var x = 0; x < targetCols; x++) {
        var sx = Math.min(w - 1, Math.floor(x * w / targetCols));
        var si = (sy * w + sx) * 4, di = (y * targetCols + x) * 4;
        out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
      }
    }
    return { rgba: out, width: targetCols, height: th, data: out }; // include legacy alias .data
  }

  // Pre-CGA prep (positional or object) -> Uint8Array
  function preCGAify(arg1, arg2, arg3, arg4) {
    var rgba, w, h, opts = (typeof arg4 === 'object' && arg4) || {};
    if (arg1 && typeof arg1 === 'object' && (arg1.rgba || arg1.data || arg1.rgb)) {
      rgba = (arg1.rgba || arg1.data || arg1.rgb); w = arg1.width | 0; h = arg1.height | 0;
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; }
    if (!rgba || !w || !h) throw "preCGAify: invalid args";

    var gamma = (opts.gamma != null) ? +opts.gamma : 1.15;
    var contrast = (opts.contrast != null) ? +opts.contrast : 1.05;
    var saturate = (opts.saturate != null) ? +opts.saturate : 0.95;
    var blur = (opts.blur != null) ? +opts.blur : 0.0;
    var poster = (opts.poster != null) ? (opts.poster | 0) : 6;

    var out = new Uint8Array(rgba.length);

    // 3x3 light blur (optional)
    if (blur > 0) {
      var a = 0.44198, b = 0.27901;
      // horizontal
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4, xm1 = ((x ? x - 1 : 0) + y * w) * 4, xp1 = ((x < w - 1 ? x + 1 : x) + y * w) * 4;
          for (var c = 0; c < 3; c++) out[i + c] = clamp8(b * rgba[xm1 + c] + a * rgba[i + c] + b * rgba[xp1 + c]);
          out[i + 3] = rgba[i + 3];
        }
      }
      // vertical (in-place)
      for (var yy = 0; yy < h; yy++) {
        for (var xx = 0; xx < w; xx++) {
          var k = (yy * w + xx) * 4, ym1 = (((yy ? yy - 1 : 0) * w) + xx) * 4, yp1 = (((yy < h - 1 ? yy + 1 : yy) * w) + xx) * 4;
          for (var c2 = 0; c2 < 3; c2++) out[k + c2] = clamp8(b * out[ym1 + c2] + a * out[k + c2] + b * out[yp1 + c2]);
        }
      }
    } else {
      for (var i0 = 0; i0 < rgba.length; i0++) out[i0] = rgba[i0];
    }

    // gamma/contrast/sat/posterize
    for (var i = 0; i < w * h; i++) {
      var j = i * 4, r = out[j] / 255, g = out[j + 1] / 255, b = out[j + 2] / 255, aA = out[j + 3];

      if (gamma !== 1.0) { r = Math.pow(r, 1 / gamma); g = Math.pow(g, 1 / gamma); b = Math.pow(b, 1 / gamma); }
      if (contrast !== 1.0) { r = (r - 0.5) * contrast + 0.5; g = (g - 0.5) * contrast + 0.5; b = (b - 0.5) * contrast + 0.5; }
      if (saturate !== 1.0) {
        var yv = 0.299 * r + 0.587 * g + 0.114 * b;
        r = yv + (r - yv) * saturate; g = yv + (g - yv) * saturate; b = yv + (b - yv) * saturate;
      }
      if (poster > 0) {
        var steps = (1 << poster) - 1;
        r = Math.round(r * steps) / steps; g = Math.round(g * steps) / steps; b = Math.round(b * steps) / steps;
      }

      out[j] = clamp8(r * 255); out[j + 1] = clamp8(g * 255); out[j + 2] = clamp8(b * 255); out[j + 3] = aA;
    }
    return out;

    function clamp8(v) { v |= 0; return v < 0 ? 0 : (v > 255 ? 255 : v); }
  }

  // FS dither (positional/object) -> Uint8Array
  function ditherCGA_FloydSteinberg(arg1, arg2, arg3) {
    var rgba, w, h;
    if (arg1 && typeof arg1 === 'object' && (arg1.rgb || arg1.rgba || arg1.data)) {
      rgba = (arg1.rgb || arg1.rgba || arg1.data); w = arg1.width | 0; h = arg1.height | 0;
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; }
    if (!rgba || !w || !h) throw "ditherCGA_FloydSteinberg: invalid args";

    var buf = new Float32Array(rgba.length);
    for (var i = 0; i < rgba.length; i++) buf[i] = rgba[i];

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i3 = (y * w + x) * 4;
        var r = buf[i3], g = buf[i3 + 1], b = buf[i3 + 2], a = buf[i3 + 3];
        if (a < 128) { buf[i3] = buf[i3 + 1] = buf[i3 + 2] = 0; buf[i3 + 3] = 255; continue; }
        var idx = nearestCGA(r, g, b), nr = CGA[idx][0], ng = CGA[idx][1], nb = CGA[idx][2];
        var er = r - nr, eg = g - ng, eb = b - nb;
        buf[i3] = nr; buf[i3 + 1] = ng; buf[i3 + 2] = nb; buf[i3 + 3] = 255;
        dist(x + 1, y, 7 / 16, er, eg, eb);
        dist(x - 1, y + 1, 3 / 16, er, eg, eb);
        dist(x, y + 1, 5 / 16, er, eg, eb);
        dist(x + 1, y + 1, 1 / 16, er, eg, eb);
      }
    }
    var out = new Uint8Array(rgba.length);
    for (var j = 0; j < out.length; j++) {
      var v = buf[j] | 0; out[j] = (v < 0 ? 0 : (v > 255 ? 255 : v));
    }
    return out;

    function dist(x, y, f, er, eg, eb) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      var j = (y * w + x) * 4;
      buf[j] += er * f; buf[j + 1] += eg * f; buf[j + 2] += eb * f;
    }
  }

  // Ordered dither (Bayer 4x4) -> Uint8Array
  function ditherCGA_Bayer4(arg1, arg2, arg3) {
    var rgba, w, h;
    if (arg1 && typeof arg1 === 'object' && (arg1.rgba || arg1.data || arg1.rgb)) {
      rgba = (arg1.rgba || arg1.data || arg1.rgb); w = arg1.width | 0; h = arg1.height | 0;
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; }
    if (!rgba || !w || !h) throw "ditherCGA_Bayer4: invalid args";

    var M = [
      0, 8, 2, 10,
      12, 4, 14, 6,
      3, 11, 1, 9,
      15, 7, 13, 5
    ];
    var out = new Uint8Array(rgba.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var j = (y * w + x) * 4, a = rgba[j + 3];
        if (a < 128) { out[j] = out[j + 1] = out[j + 2] = 0; out[j + 3] = 255; continue; }
        var r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
        var t = (M[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 16; // ±8
        var idx = nearestCGA(clamp8(r + t), clamp8(g + t), clamp8(b + t));
        var c = CGA[idx]; out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2]; out[j + 3] = 255;
      }
    }
    return out;

    function clamp8(v) { v |= 0; return v < 0 ? 0 : (v > 255 ? 255 : v); }
  }

  // Half-block composer with BG bias and per-call Unicode override
  function ansiHalfBlock(arg1, arg2, arg3, arg4) {
    var rgba, w, h, opts = (typeof arg4 === 'object' && arg4) || {};
    if (arg1 && typeof arg1 === 'object' && arg1.rgba) {
      rgba = arg1.rgba; w = arg1.width | 0; h = arg1.height | 0;
      if (arg1.opts && typeof arg1.opts === 'object') opts = arg1.opts;
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; }
    if (!rgba || !w || !h) throw "ansiHalfBlock: invalid args";

    var cols = w, rows = ((h + 1) / 2) | 0;
    var withNewlines = !!opts.withNewlines;
    var useUnicode = (typeof opts.unicode === "boolean") ? opts.unicode : USE_UNICODE;
    var out = "", curFG = -1, curBG = -1;

    function sgr(fg, bg) {
      bg &= 7;
      if (fg === curFG && bg === curBG) return;
      if (fg >= 8) out += format("\x1b[0;1;3%dm\x1b[4%dm", fg - 8, bg);
      else out += format("\x1b[0;3%dm\x1b[4%dm", fg, bg);
      curFG = fg; curBG = bg;
    }

    for (var row = 0; row < rows; row++) {
      var yTop = row * 2, yBot = yTop + 1;
      for (var x = 0; x < cols; x++) {
        var iTop = (yTop * w + x) * 4;
        var fg = nearestCGA(rgba[iTop], rgba[iTop + 1], rgba[iTop + 2]);
        var bg = 0;

        if (yBot < h) {
          var iBot = (yBot * w + x) * 4;
          bg = nearestCGA(rgba[iBot], rgba[iBot + 1], rgba[iBot + 2]);
          if (bg >= 8) {
            // prefer dim background unless bright truly fits better
            var dim = bg - 8;
            var br = Math.abs(rgba[iBot] - CGA[bg][0]) + Math.abs(rgba[iBot + 1] - CGA[bg][1]) + Math.abs(rgba[iBot + 2] - CGA[bg][2]);
            var dr = Math.abs(rgba[iBot] - CGA[dim][0]) + Math.abs(rgba[iBot + 1] - CGA[dim][1]) + Math.abs(rgba[iBot + 2] - CGA[dim][2]);
            if (dr <= br) bg = dim;
          }
        }

        sgr(fg, bg);
        out += (useUnicode ? "\u2580" : "\xDF"); // upper half block
      }
      if (withNewlines) { out += "\x1b[0m\r\n"; curFG = curBG = -1; }
    }
    out += "\x1b[0m";
    return { bytes: out, text: out, cols: cols, rows: rows };
  }

  // SAUCE writer + text saver (unchanged)
  function writeSAUCE(path, title, author, group, cols, rows, fileSize) {
    function pad(s, n) { s = (s || "").substr(0, n); while (s.length < n) s += "\x00"; return s; }
    function le16(v) { return String.fromCharCode(v & 255, (v >> 8) & 255); }
    function le32(v) { return String.fromCharCode(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255); }
    function rep(ch, n) { var s = ""; while (n--) s += ch; return s; }
    var f = new File(path); if (!f.open("ab")) throw "open for SAUCE failed: " + path;
    f.write("\x1A");
    var rec = "SAUCE00" + pad(title, 35) + pad(author, 20) + pad(group, 20) +
      strftime("%Y%m%d", time()) + le32(fileSize) + "\x01\x01" +
      le16(cols) + le16(rows) + le16(0) + le16(0) + le32(768) + "\x00\x00" + rep("\x00", 22);
    f.write(rec); f.close();
  }
  function saveText(path, s) { var f = new File(path); if (!f.open("wb")) throw "write failed: " + path; f.write(s); f.close(); }

  // Convenience pipeline (photos/gradients default): scale -> preCGAify -> FS (or Bayer) -> ANSI
  function pipelineHalfBlock(arg1, arg2, arg3, arg4, arg5) {
    var rgba, w, h, cols, opts;
    if (arg1 && typeof arg1 === 'object' && arg1.rgba) { rgba = arg1.rgba; w = arg1.width | 0; h = arg1.height | 0; cols = arg2 | 0; opts = arg3 || {}; }
    else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; cols = arg4 | 0; opts = arg5 || {}; }
    if (!rgba || !w || !h || !cols) throw "pipelineHalfBlock: invalid args";

    var scaled = scaleNearestRGBA(rgba, w, h, cols);
    var pre = preCGAify(scaled.rgba, scaled.width, scaled.height, {
      gamma: (opts.gamma != null) ? +opts.gamma : 1.15,
      contrast: (opts.contrast != null) ? +opts.contrast : 1.05,
      saturate: (opts.saturate != null) ? +opts.saturate : 0.95,
      blur: (opts.blur != null) ? +opts.blur : 0.0,
      poster: (opts.poster != null) ? opts.poster | 0 : 6
    });

    var useBayer = (opts.dither && String(opts.dither).toLowerCase() === "bayer");
    var d = useBayer ? ditherCGA_Bayer4(pre, scaled.width, scaled.height)
      : ditherCGA_FloydSteinberg(pre, scaled.width, scaled.height);

    return ansiHalfBlock(d, scaled.width, scaled.height, {
      withNewlines: !!opts.withNewlines,
      unicode: (typeof opts.unicode === "boolean") ? opts.unicode : undefined
    });
  }

  // Solid (no dither): direct map to nearest CGA
  function quantizeCGA_NoDither(arg1, arg2, arg3) {
    var rgba, w, h;
    if (arg1 && typeof arg1 === 'object' && (arg1.rgba || arg1.data || arg1.rgb)) {
      rgba = (arg1.rgba || arg1.data || arg1.rgb); w = arg1.width | 0; h = arg1.height | 0;
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; }
    if (!rgba || !w || !h) throw "quantizeCGA_NoDither: invalid args";
    var out = new Uint8Array(rgba.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var a = rgba[i + 3];
        if (a < 128) { out[i] = out[i + 1] = out[i + 2] = 0; out[i + 3] = 255; continue; }
        var idx = nearestCGA(rgba[i], rgba[i + 1], rgba[i + 2]);
        var c = CGA[idx];
        out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
      }
    }
    return out;
  }

  // Local variance mask (3x3) -> Uint8 (0..255); low = flat areas
  function _localVarianceMask(rgba, w, h) {
    var mask = new Uint8Array(w * h);
    function lum(i) { return (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114); }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var sum = 0, sum2 = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx; if (xx < 0 || xx >= w) continue;
            var j = (yy * w + xx) * 4; var L = lum(j);
            sum += L; sum2 += L * L; cnt++;
          }
        }
        var mean = sum / cnt; var varv = (sum2 / cnt) - mean * mean; // 0..~65025
        // normalize roughly to 0..255
        var v = varv / 256; if (v > 255) v = 255;
        mask[y * w + x] = v | 0;
      }
    }
    return mask;
  }

  // Adaptive FS: clamp error & skip/attenuate on flat regions
  function ditherCGA_FSAdaptive(arg1, arg2, arg3, arg4) {
    // args: (rgba,w,h, opts?) or ({rgba,w,h}, opts?)
    var rgba, w, h, opts;
    if (arg1 && typeof arg1 === 'object' && (arg1.rgba || arg1.data || arg1.rgb)) {
      rgba = (arg1.rgba || arg1.data || arg1.rgb); w = arg1.width | 0; h = arg1.height | 0; opts = arg2 || {};
    } else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; opts = arg4 || {}; }
    if (!rgba || !w || !h) throw "ditherCGA_FSAdaptive: invalid args";

    var flatThresh = (opts.flatThresh != null) ? (opts.flatThresh | 0) : 18;   // 0..255: <= this => treat as flat
    var strength = (opts.strength != null) ? +opts.strength : 0.8;        // 0..1: scale error in detailed zones
    var clampErr = (opts.clampErr != null) ? +opts.clampErr : 12;         // clamp per-channel propagated error
    var serpentine = (opts.serpentine === undefined) ? true : !!opts.serpentine;

    var mask = _localVarianceMask(rgba, w, h);
    var buf = new Float32Array(rgba.length);
    for (var i0 = 0; i0 < rgba.length; i0++) buf[i0] = rgba[i0];

    for (var y = 0; y < h; y++) {
      var xStart = serpentine && (y & 1) ? (w - 1) : 0;
      var xEnd = serpentine && (y & 1) ? -1 : w;
      var step = serpentine && (y & 1) ? -1 : 1;
      for (var x = xStart; x != xEnd; x += step) {
        var i = (y * w + x) * 4;
        var a = buf[i + 3]; if (a < 128) { buf[i] = buf[i + 1] = buf[i + 2] = 0; buf[i + 3] = 255; continue; }

        var isFlat = mask[y * w + x] <= flatThresh;
        if (isFlat) {
          // No dither in flat zones: snap to nearest CGA directly
          var idx0 = nearestCGA(buf[i], buf[i + 1], buf[i + 2]); var c0 = CGA[idx0];
          buf[i] = c0[0]; buf[i + 1] = c0[1]; buf[i + 2] = c0[2]; buf[i + 3] = 255;
          continue;
        }

        // Do FS with limited/attenuated error
        var idx = nearestCGA(buf[i], buf[i + 1], buf[i + 2]); var c = CGA[idx];
        var er = buf[i] - c[0], eg = buf[i + 1] - c[1], eb = buf[i + 2] - c[2];
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;

        // scale & clamp error
        er = Math.max(-clampErr, Math.min(clampErr, er * strength));
        eg = Math.max(-clampErr, Math.min(clampErr, eg * strength));
        eb = Math.max(-clampErr, Math.min(clampErr, eb * strength));

        function spread(xx, yy, f) {
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) return;
          var k = (yy * w + xx) * 4;
          buf[k] += er * f; buf[k + 1] += eg * f; buf[k + 2] += eb * f;
        }

        if (!serpentine || !(y & 1)) {
          // left-to-right
          spread(x + 1, y, 7 / 16);
          spread(x - 1, y + 1, 3 / 16);
          spread(x, y + 1, 5 / 16);
          spread(x + 1, y + 1, 1 / 16);
        } else {
          // right-to-left
          spread(x - 1, y, 7 / 16);
          spread(x + 1, y + 1, 3 / 16);
          spread(x, y + 1, 5 / 16);
          spread(x - 1, y + 1, 1 / 16);
        }
      }
    }

    var out = new Uint8Array(rgba.length);
    for (var j = 0; j < out.length; j++) {
      var v = buf[j] | 0; out[j] = (v < 0 ? 0 : (v > 255 ? 255 : v));
    }
    return out;
  }

  // Adaptive pipeline: scale -> preCGAify -> adaptive FS -> ANSI
  function pipelineHalfBlockAdaptive(arg1, arg2, arg3, arg4, arg5) {
    // (rgba,w,h, targetCols, opts) OR ({rgba,width,height}, targetCols, opts)
    var rgba, w, h, cols, opts;
    if (arg1 && typeof arg1 === 'object' && arg1.rgba) { rgba = arg1.rgba; w = arg1.width | 0; h = arg1.height | 0; cols = arg2 | 0; opts = arg3 || {}; }
    else { rgba = arg1; w = arg2 | 0; h = arg3 | 0; cols = arg4 | 0; opts = arg5 || {}; }
    if (!rgba || !w || !h || !cols) throw "pipelineHalfBlockAdaptive: invalid args";

    var scaled = scaleNearestRGBA(rgba, w, h, cols);
    var pre = preCGAify(scaled.rgba, scaled.width, scaled.height, {
      gamma: (opts.gamma != null) ? +opts.gamma : 1.15,
      contrast: (opts.contrast != null) ? +opts.contrast : 1.05,
      saturate: (opts.saturate != null) ? +opts.saturate : 0.95,
      blur: (opts.blur != null) ? +opts.blur : 0.0,
      poster: (opts.poster != null) ? opts.poster | 0 : 6
    });
    var d = ditherCGA_FSAdaptive(pre, scaled.width, scaled.height, {
      flatThresh: (opts.flatThresh != null) ? opts.flatThresh | 0 : 18,
      strength: (opts.strength != null) ? +opts.strength : 0.8,
      clampErr: (opts.clampErr != null) ? +opts.clampErr : 12,
      serpentine: (opts.serpentine !== undefined) ? !!opts.serpentine : true
    });
    return ansiHalfBlock(d, scaled.width, scaled.height, {
      withNewlines: !!opts.withNewlines,
      unicode: (typeof opts.unicode === "boolean") ? opts.unicode : undefined
    });
  }
  // Export a stable, namespaced API
  return {
    // core steps
    scaleNearestRGBA: scaleNearestRGBA,
    preCGAify: preCGAify,
    ditherCGA_FloydSteinberg: ditherCGA_FloydSteinberg,
    ditherCGA_Bayer4: ditherCGA_Bayer4,
    ansiHalfBlock: ansiHalfBlock,
    quantizeCGA_NoDither: quantizeCGA_NoDither,
    ditherCGA_FSAdaptive: ditherCGA_FSAdaptive,
    pipelineHalfBlockAdaptive: pipelineHalfBlockAdaptive,
    // convenience
    pipelineHalfBlock: pipelineHalfBlock,

    // I/O
    writeSAUCE: writeSAUCE,
    saveText: saveText
  };
}

// Provide a global for the legacy wrappers to reference
var ANSICore = ANSICoreFactory();