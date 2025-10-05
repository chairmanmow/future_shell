// --- universal call helpers for unknown signatures ---
function tryCalls(fn, calls) {
  for (var i = 0; i < calls.length; i++) {
    try { var out = calls[i](); if (out !== undefined && out !== null) return out; } catch (e) { /* try next */ }
  }
  throw "No compatible signature for " + (fn.name || "function");
}
function asImage(rgba, w, h) {
  return (rgba && typeof rgba === "object" && rgba.rgba && rgba.width && rgba.height)
    ? rgba
    : { rgba: rgba, width: w, height: h };
}
function normImage(img) {
  // normalize any return into {rgba,width,height}
  if (img && img.rgba && typeof img.width === "number" && typeof img.height === "number") return img;
  // some versions just return a Uint8Array and expect you to keep width/height
  if (img && (img.constructor === Uint8Array || img.constructor === Array)) {
    // caller MUST pass width/height explicitly in this case
    throw "Returned raw RGBA without dimensions";
  }
  return img;
}

// Scale wrapper: tries (rgba,w,h,cols) then ({rgba,w,h},cols)
function scaleAuto(img, cols) {
  var f = ANSICore.scaleNearestRGBA;
  return normImage(tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height, cols); },    // positional
    function () { return f(asImage(img.rgba, img.width, img.height), cols); } // object
  ]));
}

// Dither wrapper: tries (rgba,w,h) then ({rgba,w,h})
function ditherAuto(img) {
  var f = ANSICore.ditherCGA_FloydSteinberg;
  var out = tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height); },
    function () { return f(asImage(img.rgba, img.width, img.height)); }
  ]);
  // Many cores return Uint8Array here; normalize
  if (out && out.rgba) return out;               // already {rgba,...}
  if (out && out.constructor === Uint8Array) return out; // raw bytes OK
  if (out && out.constructor === Array) return new Uint8Array(out);
  throw "Unexpected dither return";
}

// ANSI wrapper: tries (rgba,w,h,opts) then ({rgba,w,h},opts)
function ansiAuto(img, opts) {
  var f = ANSICore.ansiHalfBlock;
  return tryCalls(f, [
    function () { return f(img.rgba, img.width, img.height, opts); },
    function () { return f(asImage(img.rgba, img.width, img.height), opts); }
  ]);
}
// ansi_core.js — exports a single factory function: ANSICoreFactory()

function ANSICoreFactory() {
  // CGA palette (module-private)
  var CGA = [
    [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0], [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
    [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255]
  ];

  function nearestCGA(r, g, b) { var best = 0, dmin = 1e20; for (var i = 0; i < 16; i++) { var dr = r - CGA[i][0], dg = g - CGA[i][1], db = b - CGA[i][2], d = dr * dr + dg * dg + db * db; if (d < dmin) { dmin = d; best = i; } } return best; }

  function scaleNearestRGBA(arg1, arg2, arg3, arg4) {
    // Accept either object or positional
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
    return { rgba: out, width: targetCols, height: th };
  }

  function ditherCGA_FloydSteinberg(arg1, arg2, arg3) {
    // Accept object or positional; ALWAYS return Uint8Array
    var rgba, w, h;
    if (arg1 && typeof arg1 === 'object' && (arg1.rgb || arg1.rgba || arg1.data)) {
      rgba = (arg1.rgb || arg1.rgba || arg1.data);
      w = arg1.width | 0; h = arg1.height | 0;
    } else {
      rgba = arg1; w = arg2 | 0; h = arg3 | 0;
    }
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

  function ansiHalfBlock(arg1, arg2, arg3, arg4) {
    // Accept object or positional; ALWAYS return {bytes, text, cols, rows}
    var rgba, w, h, opts = (typeof arg4 === 'object' && arg4) || {};
    if (arg1 && typeof arg1 === 'object' && arg1.rgba) {
      rgba = arg1.rgba; w = arg1.width | 0; h = arg1.height | 0;
      if (arg1.opts && typeof arg1.opts === 'object') opts = arg1.opts;
    } else {
      rgba = arg1; w = arg2 | 0; h = arg3 | 0;
    }
    if (!rgba || !w || !h) throw "ansiHalfBlock: invalid args";

    var cols = w;
    var rows = ((h + 1) / 2) | 0;
    var withNewlines = !!opts.withNewlines;   // optional behavior (default false)
    var out = "";
    var curFG = -1, curBG = -1;

    function sgr(fg, bg) {
      bg &= 7; // bg is 0..7
      if (fg === curFG && bg === curBG) return;
      if (fg >= 8) out += format("\x1b[0;1;3%dm\x1b[4%dm", fg - 8, bg);
      else out += format("\x1b[0;3%dm\x1b[4%dm", fg, bg);
      curFG = fg; curBG = bg;
    }

    for (var row = 0; row < rows; row++) {
      var yTop = row * 2;
      var yBot = yTop + 1;
      for (var x = 0; x < cols; x++) {
        var iTop = (yTop * w + x) * 4;
        var fg = nearestCGA(rgba[iTop], rgba[iTop + 1], rgba[iTop + 2]);
        var bg = 0;
        if (yBot < h) {
          var iBot = (yBot * w + x) * 4;
          bg = nearestCGA(rgba[iBot], rgba[iBot + 1], rgba[iBot + 2]);
        }
        if (bg >= 8) bg -= 8;   // ensure bg in 0..7
        sgr(fg, bg);
        out += "\u2580";        // upper half block
      }
      if (withNewlines) { out += "\x1b[0m\r\n"; curFG = curBG = -1; }
    }
    out += "\x1b[0m";

    return {
      bytes: out,      // new
      text: out,      // legacy alias
      cols: cols,
      rows: rows
    };
  }

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

  // return a namespaced API (no globals leaked beyond this symbol)
  return {
    scaleNearestRGBA: scaleNearestRGBA,
    ditherCGA_FloydSteinberg: ditherCGA_FloydSteinberg,
    ansiHalfBlock: ansiHalfBlock,
    writeSAUCE: writeSAUCE,
    saveText: saveText
  };
}

