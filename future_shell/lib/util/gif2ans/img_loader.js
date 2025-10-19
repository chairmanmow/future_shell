// img_loader.js — unified bitmap→ANSI (native gif2ans with JS fallback) + SAUCE + ImageMagick presets + verbose logs
// Usage:
//   convertImageToANSI(pathOrUrl, columns, /*contiguous_ignored*/ false, /*outputPath*/ null, {
//     debug: true,
//     preferNative: true,
//     // Preprocessors (choose one or none):
//     preprocess: 'cga' | 'cga_comic' | undefined,
//     cgaDither: 'floyd' | 'ordered',     // used by 'cga' (default 'floyd')
//     // Tunables for 'cga_comic' (defaults shown):
//     preSigmoidal: "8x50%",
//     preSaturation: 145,
//     preDither: "o2x2",
//     prePosterize: 16,
//     preHeightScale: 200,                 // percent; 200 ~ double height for -r
//     returnObject: false                  // if true, returns {ansi, cols, rows, source}
//   })

function here() {
    var dir = js.exec_dir || '';
    if (dir && dir.charAt(dir.length - 1) !== '/' && dir.charAt(dir.length - 1) !== '\\') dir += '/';
    return dir;
}

/* ========================= Utilities ========================= */

function _log(on, msg) { if (true) try { log(msg); } catch (e) { } } // always-on per your current style

function shellQuote(s) {
    return "'" + String(s).replace(/'/g, "'\"'\"'") + "'";
}
function readWholeFile(path) {
    var f = new File(path);
    if (!f.open('rb')) throw 'open failed: ' + path;
    var chunks = [], s;
    for (; ;) { s = f.raw_read(65536); if (!s || !s.length) break; chunks.push(s); }
    f.close();
    return chunks.join('');
}
function writeWholeFile(path, bytes) {
    var f = new File(path);
    if (!f.open('wb')) throw 'open failed: ' + path;
    f.raw_write(bytes);
    f.close();
}
function rmIfExists(path) {
    try { var f = new File(path); if (f.exists) f.remove(); } catch (e) { }
}
function fileExists(path) {
    try { var f = new File(path); return f.exists; } catch (e) { return false; }
}
function tmpPath(prefix, ext) {
    var base = (system.temp_dir || '/tmp/') + prefix + '_' + (+new Date()) + '_' + (Math.random() * 1e9 | 0);
    return base + (ext || '');
}
function isHttpUrl(s) {
    return /^https?:\/\//i.test(s || '');
}

/* ========================= SAUCE helpers ========================= */

var _SauceLib;
function ensureSauceLib() {
    if (_SauceLib !== undefined) return _SauceLib;
    try { _SauceLib = load({}, 'sauce_lib.js'); return _SauceLib; }
    catch (e) { }
    try { _SauceLib = load('sauce_lib.js'); return _SauceLib; }
    catch (e2) { }
    _SauceLib = null;
    return _SauceLib;
}

function readSauceInfo(path) {
    var lib = ensureSauceLib();
    if (!lib || typeof lib.read !== 'function' || !path) return null;
    try { return lib.read(path); } catch (e) { return null; }
}

function stripSauce(bytes) {
    if (!bytes) return bytes;
    var text = String(bytes);
    if (text.length < 128) return text;
    var searchWindow = text.slice(-768);
    var marker = searchWindow.lastIndexOf("SAUCE00");
    if (marker < 0) return text.replace(/\x1a+$/g, '');
    var sauceStart = text.length - searchWindow.length + marker;
    if (text.length - sauceStart < 128) return text.replace(/\x1a+$/g, '');
    var cutIdx = sauceStart;
    var commentCount = text.charCodeAt(sauceStart + 104);
    if (!isNaN(commentCount) && commentCount > 0) {
        var commentBytes = 5 + (commentCount * 64);
        var commentStart = cutIdx - commentBytes;
        if (commentStart >= 0 && text.substr(commentStart, 5) === "COMNT") cutIdx = commentStart;
    }
    if (cutIdx > 0 && text.charCodeAt(cutIdx - 1) === 0x1a) cutIdx--;
    var trimmed = text.substring(0, cutIdx);
    return trimmed.replace(/\x1a+$/g, '');
}

function countAnsiRows(str) {
    if (!str) return 0;
    var clean = String(str).replace(/\r/g, '');
    if (!clean.length) return 0;
    return clean.split('\n').length;
}

/* ========================= Load JS converters ========================= */

js.global.__IMG_AS_LIBRARY__ = true; // prevent auto-run in the loaded files
load(here() + "future_shell/lib/util/gif2ans/gif2ans.js");  // GIF2ANS
load(here() + "future_shell/lib/util/gif2ans/jpg2ans.js");  // JPG2ANS
load(here() + "future_shell/lib/util/gif2ans/png2ans.js");  // PNG2ANS
js.global.__IMG_AS_LIBRARY__ = false;
try { load("http.js"); } catch (e) { try { load("/sbbs/exec/http.js"); } catch (_) { } }

/* ========================= Fetch + Sniff ========================= */

function fetchBytes(pathOrUrl) {
    if (isHttpUrl(pathOrUrl)) {
        var http = new HTTPRequest(); http.follow_redirects = 5;
        try {
            if (!http.request_headers) http.request_headers = {};
            http.request_headers['User-Agent'] = http.request_headers['User-Agent'] || 'Mozilla/5.0 (Synchronet NewsReader)';
            http.request_headers['Accept'] = http.request_headers['Accept'] || 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';
            http.request_headers['Referer'] = http.request_headers['Referer'] || pathOrUrl;
        } catch (e) { }
        var body = http.Get(pathOrUrl);
        if (http.response_code !== 200 || !body) throw "HTTP " + http.response_code + " for " + pathOrUrl;
        return body;
    }
    return readWholeFile(pathOrUrl);
}

function sniffType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    if (bytes.substr(0, 6) === "GIF87a" || bytes.substr(0, 6) === "GIF89a") return "gif";
    var c0 = bytes.charCodeAt(0) & 255, c1 = bytes.charCodeAt(1) & 255, c2 = bytes.charCodeAt(2) & 255;
    if (c0 === 0xFF && c1 === 0xD8 && c2 === 0xFF) return "jpg";
    if ((bytes.charCodeAt(0) & 255) === 0x89 && bytes.substr(1, 3) === "PNG") return "png";
    if (bytes.substr(0, 4) === "RIFF" && bytes.substr(8, 4) === "WEBP") return "webp";
    return null;
}

/* ======== ImageMagick detection + CGA + transcode + preset ======== */

var _MAGICK_BIN = null; // memoized

function haveMagick(debugFlag) {
    if (_MAGICK_BIN !== null) return !!_MAGICK_BIN;

    // Prefer real system paths first (no symlink surprises), then sbbs/exec shims, then PATH
    var candidates = [
        '/usr/bin/convert', '/usr/bin/convert-im6.q16', '/usr/bin/magick',
        '/usr/local/bin/convert', '/usr/local/bin/magick',
        '/sbbs/exec/convert', '/sbbs/exec/magick',
        'convert', 'magick'
    ];
    function resolve(cmd) {
        if (cmd.charAt(0) === '/') { var f = new File(cmd); return f.exists ? cmd : null; }
        var out = system.popen("command -v " + cmd + " 2>/dev/null") || [];
        if (out.length) return out[0];
        out = system.popen("which " + cmd + " 2>/dev/null") || [];
        return out.length ? out[0] : null;
    }
    for (var i = 0; i < candidates.length; i++) {
        var r = resolve(candidates[i]);
        if (!r) continue;
        var test = shellQuote(r) + " -version 2>&1";
        var lines = system.popen(test) || [];
        if (lines.length) { _MAGICK_BIN = r; break; }
    }
    if (!_MAGICK_BIN) {
        _MAGICK_BIN = '';
        if (debugFlag) _log(true, "[cga] no ImageMagick found");
    } else if (debugFlag) {
        _log(true, "[cga] using ImageMagick: " + _MAGICK_BIN);
    }
    return !!_MAGICK_BIN;
}

function writeCgaPalettePPM(ppmPath) {
    var CGA = [
        [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
        [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
        [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
        [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]
    ];
    var f = new File(ppmPath);
    if (!f.open('wb')) throw "open failed: " + ppmPath;
    var i, txt = "P3\n16 1\n255\n";
    for (i = 0; i < CGA.length; i++) txt += CGA[i][0] + " " + CGA[i][1] + " " + CGA[i][2] + "\n";
    f.write(txt); f.close();
}

// Basic CGA remap (your earlier helper, kept)
function preprocessToCGA(inputPath, debugFlag, ditherMode) {
    if (!haveMagick(debugFlag)) return null; // no-op if not installed
    var ppm = tmpPath("cga_palette", ".ppm");
    var out = tmpPath("cga_quant", ".png");
    try {
        writeCgaPalettePPM(ppm);
        var ordered = (ditherMode === 'ordered');
        var magick = _MAGICK_BIN;
        var cmd = shellQuote(magick) + " " + shellQuote(inputPath)
            + " -colorspace sRGB "
            + (ordered ? "-ordered-dither o4x4 " : "-dither FloydSteinberg ")
            + "-remap " + shellQuote(ppm) + " "
            + "PNG24:" + shellQuote(out);
        _log(debugFlag, "[cga] remap invoke: " + cmd);
        var rc = system.exec(cmd + " 2>/dev/null");
        _log(debugFlag, "[cga] remap rc=" + rc);
        if (rc !== 0 || !fileExists(out)) {
            var err = system.popen(cmd + " 2>&1") || [];
            _log(debugFlag, "[cga] remap failed:\n" + err.join("\n"));
            rmIfExists(out); return null;
        }
        return out;
    } catch (e) {
        _log(debugFlag, "[cga] preprocess error: " + e);
        rmIfExists(out);
        return null;
    } finally {
        rmIfExists(ppm);
    }
}

// Your preferred "comic" preset with flexible controls for dithering & sizing.
// columns: target ANSI columns (C). If you want gif2ans to do sizing, set heightScale:100
// and/or skipWidthResize:true in tunables.
function preprocessCGAComic(inputPath, columns, debugFlag, tunables) {
    if (!haveMagick(debugFlag)) return null;

    tunables = tunables || {};
    var contrast = tunables.sigmoidal || "8x50%";            // e.g. "8x50%"
    var saturation = (typeof tunables.saturation === 'number') ? tunables.saturation : 145; // %
    var ditherRaw = (tunables.dither || "o2x2") + "";
    var noDither = ditherRaw.toLowerCase() === "none";
    var ditherMap = noDither ? null : ditherRaw;              // "o2x2" | "o3x3" | "o4x4" | "h4x4a" ...
    var posterize = (typeof tunables.posterize === 'number') ? tunables.posterize : 16;   // 16..32
    var heightScale = (typeof tunables.heightScale === 'number') ? tunables.heightScale : 200; // 200 = 2x
    var blurAmount = (typeof tunables.blur === 'number') ? tunables.blur : null;           // e.g. 0.25
    var skipWResize = !!tunables.skipWidthResize;               // true => don't force width=columns
    var skipHResize = !!tunables.skipHeightResize;              // true => don't apply heightScale
    var palettePath = tunables.palettePath || null;             // custom palette PPM path (optional)
    var colorsOnly = !!tunables.colorsOnly;                    // if true: -colors 16 -posterize 16 (skip -remap)

    // Build (or use) palette
    var ppm = null;
    if (!colorsOnly) {
        ppm = palettePath || tmpPath("cga_palette", ".ppm");
        if (!palettePath) writeCgaPalettePPM(ppm);
    }

    var out = tmpPath("cga_comic_prepped", ".png");
    var magick = _MAGICK_BIN;

    // Collect ops to keep spacing/shell quoting simple
    var ops = [];
    ops.push("-colorspace sRGB");

    // Sizing: width to columns (unless skipped), then height ~2x for -r (unless skipped)
    if (!skipWResize && columns) ops.push("-resize " + String(columns) + "x");
    if (!skipHResize && heightScale && heightScale !== 100) ops.push("-resize 100x" + String(heightScale) + "%");

    // Contrast/sat
    ops.push("-sigmoidal-contrast " + contrast);
    ops.push("-modulate 100," + String(saturation) + ",100");

    // Optional tiny pre-blur to calm speckle
    if (blurAmount && blurAmount > 0) ops.push("-blur 0x" + String(blurAmount));

    // Dither control
    if (noDither) ops.push("-dither None");
    else ops.push("-ordered-dither " + ditherMap);

    // Tone simplification
    ops.push("-posterize " + String(posterize));

    // Palette remap vs. free 16-color selection
    if (colorsOnly) {
        // Let IM choose the 16 best colors for contrast (non-CGA but often cleaner)
        ops.push("-colors 16");
        // keep -posterize 16 via `posterize` above; usually good in combo
    } else {
        ops.push("-remap " + shellQuote(ppm));
    }

    var cmd = shellQuote(magick) + " " + shellQuote(inputPath) + " " + ops.join(" ")
        + " PNG24:" + shellQuote(out);

    _log(debugFlag, "[pre-cga-comic] " + cmd);
    var rc = system.exec(cmd + " 2>/dev/null");
    _log(debugFlag, "[pre-cga-comic] rc=" + rc);

    // Cleanup palette if we created a temp one
    if (!palettePath && ppm) rmIfExists(ppm);

    if (rc !== 0 || !fileExists(out)) {
        var err = system.popen(cmd + " 2>&1") || [];
        _log(debugFlag, "[pre-cga-comic] failed:\n" + err.join("\n"));
        rmIfExists(out);
        return null;
    }
    return out;
}

// Transcode (e.g., WEBP -> PNG) if needed
function transcodeToPNG(inputPath, debugFlag) {
    if (!haveMagick(debugFlag)) return null;
    var out = tmpPath("transcode_png", ".png");
    var magick = _MAGICK_BIN;
    var cmd = shellQuote(magick) + " " + shellQuote(inputPath) + " PNG24:" + shellQuote(out);
    _log(debugFlag, "[xcode] " + cmd);
    var rc = system.exec(cmd + " 2>/dev/null");
    _log(debugFlag, "[xcode] rc=" + rc);
    if (rc !== 0 || !fileExists(out)) {
        var err = system.popen(cmd + " 2>&1") || [];
        _log(debugFlag, "[xcode] failed:\n" + err.join("\n"));
        rmIfExists(out); return null;
    }
    return out;
}

/* ========================= Native gif2ans detection ========================= */

var _NATIVE_GIF2ANS = null;

function _exists(p) { return p && p.charAt(0) === '/' ? fileExists(p) : true; }

function haveNativeGif2ans(debugFlag) {
    if (_NATIVE_GIF2ANS !== null) return !!_NATIVE_GIF2ANS;

    var candidates = [
        '/sbbs/exec/gif2ans',          // shim/symlink path if you created it
        '/usr/local/bin/gif2ans',
        '/usr/bin/gif2ans',
        'gif2ans'
    ];
    function resolveOnPath(cmd) {
        var out = system.popen("command -v " + cmd + " 2>/dev/null") || [];
        if (out.length) return out[0];
        out = system.popen("which " + cmd + " 2>/dev/null") || [];
        if (out.length) return out[0];
        return null;
    }

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i], resolved, testCmd, lines;
        if (c.indexOf('/') === 0) {
            if (!_exists(c)) { _log(debugFlag, "[1/discovery] not found: " + c); continue; }
            testCmd = shellQuote(c) + " -h 2>&1";
            lines = system.popen(testCmd) || [];
            if (lines && lines.length) {
                _NATIVE_GIF2ANS = c;
                _log(debugFlag, "[1/discovery] using native at: " + c);
                break;
            } else {
                _log(debugFlag, "[1/discovery] exists but no output from -h: " + c);
            }
        } else {
            resolved = resolveOnPath(c);
            if (resolved) {
                testCmd = shellQuote(resolved) + " -h 2>&1";
                lines = system.popen(testCmd) || [];
                if (lines && lines.length) {
                    _NATIVE_GIF2ANS = resolved;
                    _log(debugFlag, "[1/discovery] using native via PATH: " + resolved);
                    break;
                } else {
                    _log(debugFlag, "[1/discovery] PATH hit but -h produced no output: " + resolved);
                }
            } else {
                _log(debugFlag, "[1/discovery] not in PATH: " + c);
            }
        }
    }
    if (!_NATIVE_GIF2ANS) {
        _NATIVE_GIF2ANS = '';
        _log(debugFlag, "[1/discovery] native gif2ans NOT detected; will fall back when needed");
    }
    return !!_NATIVE_GIF2ANS;
}

/* ========================= Native invocation (positional args) ========================= */

function runNativeBitmapToAnsi(inputPath, width, debugFlag) {
    var bin = _NATIVE_GIF2ANS;
    if (!bin) throw new Error("native gif2ans not detected");

    var cols = (+width > 0) ? String(+width) : "80";
    var outTmp = tmpPath("gif2ans_native_out", ".ans"); // CLI output path

    // gif2ans -r -c <cols> <INPUT> <OUTPUT>
    var cmd = shellQuote(bin)
        + " -r -c " + cols + " "
        + shellQuote(inputPath) + " "
        + shellQuote(outTmp);

    _log(debugFlag, "[3/invoke] exec: " + cmd);

    var rc = system.exec(cmd + " 2>/dev/null");
    _log(debugFlag, "[3/exit] rc=" + rc);

    if (rc !== 0) {
        var errLines = system.popen(cmd + " 2>&1") || [];
        _log(debugFlag, "[3/error] stderr/combined:\n" + errLines.join("\n"));
        throw new Error("gif2ans exit code " + rc);
    }

    if (!fileExists(outTmp)) {
        _log(debugFlag, "[4/out-missing] expected output not found: " + outTmp);
        throw new Error("gif2ans reported success but output file missing");
    }

    var outBytes = readWholeFile(outTmp);
    _log(debugFlag, "[5/output read] bytes=" + (outBytes ? outBytes.length : 0) + " from " + outTmp);
    if (!outBytes || !outBytes.length) throw new Error("gif2ans wrote empty file");

    var sauceInfo = readSauceInfo(outTmp);
    return { tmpPath: outTmp, bytes: outBytes, sauce: sauceInfo };
}

/* ========================= Public API =========================
   convertImageToANSI(filePathOrUrl, width, contiguous_ignored, outputPath, debugOrOpts)
================================================================ */

function convertImageToANSI(filePathOrUrl, width, contiguous, outputPath, debug) {
    var opts = {};
    var debugFlag = true || !!debug; // keep always-on logs (your style)
    if (debug && typeof debug === 'object') {
        opts = debug;
        debugFlag = !!opts.debug; // allow {debug:false} to quiet if desired
    }
    var preferNative = (typeof opts.preferNative === 'boolean') ? opts.preferNative : true;

    var lower = (filePathOrUrl || "").toLowerCase();
    var extKind = null;
    if (/\.(gif)(\?|#|$)/.test(lower)) extKind = "gif";
    else if (/\.(jpe?g)(\?|#|$)/.test(lower)) extKind = "jpg";
    else if (/\.png(\?|#|$)/.test(lower)) extKind = "png";
    else if (/\.webp(\?|#|$)/.test(lower)) extKind = "webp";

    var sourceBytes = null, sniffKind = null, kind = extKind;

    // Stage input into a real file path
    var usedTmpIn = false, inPath = null, tmpIn = null;

    // IM temp artifacts
    var usedCgaTmp = false, cgaTmpPath = null;
    var usedXcodeTmp = false, xcodeTmpPath = null;

    try {
        if (isHttpUrl(filePathOrUrl)) {
            _log(debugFlag, "[2/input] fetching URL: " + filePathOrUrl);
            sourceBytes = fetchBytes(filePathOrUrl);
            sniffKind = sniffType(sourceBytes);
            if (!kind) kind = sniffKind;
            var ext = kind ? ('.' + kind) : '.img';
            tmpIn = tmpPath("gif2ans_in", ext);
            writeWholeFile(tmpIn, sourceBytes);
            inPath = tmpIn; usedTmpIn = true;
            _log(debugFlag, "[2/input] downloaded to: " + inPath + " (" + (sourceBytes ? sourceBytes.length : 0) + " bytes)");
        } else if (filePathOrUrl && fileExists(filePathOrUrl)) {
            inPath = filePathOrUrl;
            _log(debugFlag, "[2/input] local path detected: " + inPath);
            if (!kind) { try { sourceBytes = readWholeFile(inPath); sniffKind = sniffType(sourceBytes); kind = sniffKind; } catch (e) { } }
        } else {
            _log(debugFlag, "[2/input] treating as bytes or unreadable path; attempting fetch");
            sourceBytes = fetchBytes(filePathOrUrl);
            sniffKind = sniffType(sourceBytes); kind = sniffKind;
            tmpIn = tmpPath("gif2ans_in", kind ? ('.' + kind) : '.img');
            writeWholeFile(tmpIn, sourceBytes);
            inPath = tmpIn; usedTmpIn = true;
            _log(debugFlag, "[2/input] staged bytes to: " + inPath);
        }
    } catch (stageErr) {
        _log(debugFlag, "[2/input] staging error: " + stageErr);
    }

    // ===== Native path (GIF/JPG/PNG; WEBP via transcode) =====
    var nativeOK = false, nativeResult = null;
    if (preferNative && haveNativeGif2ans(debugFlag)) {
        try {
            // WEBP → PNG if needed
            if (kind === "webp") {
                xcodeTmpPath = transcodeToPNG(inPath, debugFlag);
                if (xcodeTmpPath) {
                    inPath = xcodeTmpPath; usedXcodeTmp = true; kind = "png";
                    _log(debugFlag, "[xcode] using PNG temp: " + inPath);
                } else {
                    _log(debugFlag, "[xcode] transcode failed or no ImageMagick; native may fail; will fallback if so");
                }
            }

            // Your preferred preset with auto sizing
            if (opts && opts.preprocess === 'cga_comic') {
                var tun = {
                    sigmoidal: opts.preSigmoidal || "8x50%",
                    saturation: (typeof opts.preSaturation === 'number') ? opts.preSaturation : 145,
                    dither: opts.preDither || "o2x2",
                    posterize: (typeof opts.prePosterize === 'number') ? opts.prePosterize : 16,
                    heightScale: (typeof opts.preHeightScale === 'number') ? opts.preHeightScale : 200
                };
                var preComic = preprocessCGAComic(inPath, width || 80, debugFlag, tun);
                if (preComic) {
                    _log(debugFlag, "[pre-cga-comic] using: " + preComic);
                    inPath = preComic; usedCgaTmp = true; cgaTmpPath = preComic;
                } else {
                    _log(debugFlag, "[pre-cga-comic] skipped/failed");
                }
            } else if (opts && opts.preprocess === 'cga') {
                // Basic CGA remap (kept for compatibility)
                var cgaPath = preprocessToCGA(inPath, debugFlag, opts.cgaDither || 'floyd');
                if (cgaPath) {
                    _log(debugFlag, "[cga] using CGA-remapped temp: " + cgaPath);
                    inPath = cgaPath; usedCgaTmp = true; cgaTmpPath = cgaPath;
                } else {
                    _log(debugFlag, "[cga] preprocess skipped (no ImageMagick or failure)");
                }
            }

            if (!kind || kind === "gif" || kind === "jpg" || kind === "png") {
                nativeResult = runNativeBitmapToAnsi(inPath, width || 80, debugFlag);

                // SAUCE & strip
                var nativeAnsi = nativeResult && nativeResult.bytes ? stripSauce(nativeResult.bytes) : '';
                var nativeCols = width || 80;
                var nativeRows = countAnsiRows(nativeAnsi);
                if (nativeResult && nativeResult.sauce) {
                    if (typeof nativeResult.sauce.tinfo1 === 'number' && nativeResult.sauce.tinfo1 > 0) nativeCols = nativeResult.sauce.tinfo1;
                    if (typeof nativeResult.sauce.tinfo2 === 'number' && nativeResult.sauce.tinfo2 > 0) nativeRows = nativeResult.sauce.tinfo2;
                }
                nativeOK = !!(nativeAnsi && nativeAnsi.length);
                _log(debugFlag, "[5/output read] nativeOK=" + nativeOK + " cols=" + nativeCols + " rows=" + nativeRows);

                // Immediate cleanup of preprocess temps
                if (usedCgaTmp && cgaTmpPath) { _log(debugFlag, "[cga] cleanup: " + cgaTmpPath); rmIfExists(cgaTmpPath); usedCgaTmp = false; cgaTmpPath = null; }
                if (usedXcodeTmp && xcodeTmpPath) { _log(debugFlag, "[xcode] cleanup: " + xcodeTmpPath); rmIfExists(xcodeTmpPath); usedXcodeTmp = false; xcodeTmpPath = null; }

                if (nativeOK) {
                    if (outputPath) {
                        writeWholeFile(outputPath, nativeAnsi);
                        _log(debugFlag, "[5/output write] wrote final to outputPath: " + outputPath);
                        rmIfExists(nativeResult.tmpPath);
                        if (usedTmpIn && inPath && inPath === tmpIn) { _log(debugFlag, "[cleanup] removing staged input: " + inPath); rmIfExists(inPath); }
                        return null;
                    }
                    rmIfExists(nativeResult.tmpPath);
                    if (usedTmpIn && inPath && inPath === tmpIn) { _log(debugFlag, "[cleanup] removing staged input: " + inPath); rmIfExists(inPath); }
                    if (opts && opts.returnObject) {
                        return { ansi: nativeAnsi, cols: nativeCols, rows: nativeRows, source: { native: true, sauce: nativeResult.sauce } };
                    }
                    return nativeAnsi;
                }
            } else {
                _log(debugFlag, "[native] kind not supported for native: " + kind);
            }
        } catch (nativeErr) {
            _log(debugFlag, "[3-5/native] error: " + nativeErr);
        } finally {
            if (nativeResult && nativeResult.tmpPath) rmIfExists(nativeResult.tmpPath);
            if (usedCgaTmp && cgaTmpPath) { rmIfExists(cgaTmpPath); usedCgaTmp = false; cgaTmpPath = null; }
            if (usedXcodeTmp && xcodeTmpPath) { rmIfExists(xcodeTmpPath); usedXcodeTmp = false; xcodeTmpPath = null; }
        }
    } else {
        _log(debugFlag, "[1/discovery] native not preferred or not detected; using fallback");
    }

    // ===== JS fallback =====
    var converter = null;
    if (kind === "gif") converter = GIF2ANS;
    else if (kind === "jpg") converter = JPG2ANS;
    else if (kind === "png") converter = PNG2ANS;
    else {
        try {
            if (!sourceBytes && inPath) sourceBytes = readWholeFile(inPath);
            if (!sourceBytes) sourceBytes = fetchBytes(filePathOrUrl);
            kind = sniffType(sourceBytes);
        } catch (e) { _log(debugFlag, "[fallback] unable to sniff: " + e); }
        if (kind === "gif") converter = GIF2ANS;
        else if (kind === "jpg") converter = JPG2ANS;
        else if (kind === "png") converter = PNG2ANS;
    }

    if (!converter) {
        if (usedTmpIn && inPath) rmIfExists(inPath);
        throw new Error("Unsupported or unknown image type for fallback");
    }

    _log(debugFlag, "[fallback] invoking JS converter for kind=" + kind + " width=" + (width || 80));

    var argsObj = {
        in: inPath || filePathOrUrl,
        out: outputPath || null,
        w: width || 80,
        contiguous: !!contiguous,  // carried for API compatibility
        debug: debugFlag
    };

    var res = converter(argsObj);

    if (usedTmpIn && inPath) { _log(debugFlag, "[cleanup] removing staged input: " + inPath); rmIfExists(inPath); }

    if (opts && opts.returnObject) {
        if (res && typeof res === 'object') {
            var ansiText = res.ansi || res.bytes || res.text || null;
            if (ansiText) ansiText = stripSauce(ansiText);
            return {
                ansi: ansiText,
                cols: (typeof res.cols === 'number') ? res.cols : ((typeof res.width === 'number') ? res.width : argsObj.w),
                rows: (typeof res.rows === 'number') ? res.rows : ((typeof res.height === 'number') ? res.height : countAnsiRows(ansiText)),
                source: res || { native: false }
            };
        }
        if (typeof res === 'string') {
            var stripped = stripSauce(res);
            return { ansi: stripped, cols: argsObj.w, rows: countAnsiRows(stripped), source: { native: false } };
        }
        return { ansi: null, cols: argsObj.w, rows: null, source: { native: false, raw: res } };
    }

    if (res && res.ansi) return stripSauce(res.ansi);
    if (typeof res === 'string') return stripSauce(res);
    return res;
}

/* ========================= Export ========================= */
this.convertImageToANSI = convertImageToANSI;