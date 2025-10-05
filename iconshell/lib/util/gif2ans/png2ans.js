function PNG2ANS(optsOrArgv) {
    // --- tiny local helpers ---
    function parseArgv(argv) { var o = {}; for (var i = 0; i < (argv ? argv.length : 0); i++) { var a = String(argv[i]); var k = a.split("=", 1)[0]; var v = a.substr(k.length + 1); if (v !== "") o[k] = v; } return o; }
    function fetchBytes(pathOrUrl) {
        if (typeof HTTPRequest === "undefined") { try { load("http.js"); } catch (e) { try { load("/sbbs/exec/http.js"); } catch (_) { throw "http.js not found"; } } }
        if (/^https?:\/\//i.test(pathOrUrl)) { var http = new HTTPRequest(); http.follow_redirects = 5; var body = http.Get(pathOrUrl); if (http.response_code !== 200 || !body) throw "HTTP " + http.response_code + " for " + pathOrUrl; return body; }
        var f = new File(pathOrUrl); if (!f.open("rb")) throw "open failed: " + pathOrUrl; var s = f.read(); f.close(); return s;
    }
    function core() { return (typeof ANSICoreFactory === 'function') ? ANSICoreFactory() : (typeof ANSICore !== 'undefined' ? ANSICore : (function () { throw "ANSICore not found"; })()); }
    function png() {
        if (typeof PNGLoaderFactory === 'function') return PNGLoaderFactory();
        if (typeof PNGLoader !== 'undefined') return PNGLoader;
        try { load(js.exec_dir + "iconshell/lib/util/gif2ans/png_loader.js"); } catch (e) { try { load("/sbbs/exec/png_loader.js"); } catch (_) { throw "png_loader.js not found"; } }
        return (typeof PNGLoaderFactory === 'function') ? PNGLoaderFactory() : PNGLoader;
    }
    function logx() { if (!DEBUG) return; var s = "[png2ans] " + Array.prototype.slice.call(arguments).join(" "); try { log(s) } catch (e) { try { print(s) } catch (_) { } } }

    var opts = (optsOrArgv && optsOrArgv.splice) ? parseArgv(optsOrArgv) : (optsOrArgv || {});
    var INPUT = opts.in || "";
    var OUTPUT = opts.out || null;   // null/empty => return inline
    var WIDTH = opts.w ? parseInt(opts.w, 10) : 80;
    var CONTIG = /^t(rue)?$/i.test(String(opts.contiguous || "true"));
    var DEBUG = /^t(rue)?$/i.test(String(opts.debug || "false"));

    var CORE = core();
    var PNG = png();

    var bytes = fetchBytes(INPUT);
    var img = PNG.decode(bytes);                      // -> {rgba,width,height}
    logx("png", img.width + "x" + img.height);

    // pipeline (positional core API)
    var scaled = CORE.scaleNearestRGBA(img.rgba, img.width, img.height, WIDTH);     // {rgba,width,height}
    var dRGBA = CORE.ditherCGA_FloydSteinberg(scaled.rgba, scaled.width, scaled.height); // Uint8Array or {rgba:..}
    if (dRGBA && dRGBA.rgba) dRGBA = dRGBA.rgba;
    if (!(dRGBA && dRGBA.constructor === Uint8Array)) dRGBA = scaled.rgba;

    var ansi = CORE.ansiHalfBlock(dRGBA, scaled.width, scaled.height, { withNewlines: false, contiguous: CONTIG }); // {bytes,cols,rows}

    if (OUTPUT) {
        CORE.saveText(OUTPUT, ansi.bytes);
        CORE.writeSAUCE(OUTPUT, "png2ans", "syncjs", "png2ans", ansi.cols, ansi.rows, ansi.bytes.length);
        logx("wrote", OUTPUT, "cols=" + ansi.cols, "rows=" + ansi.rows);
        return { path: OUTPUT, cols: ansi.cols, rows: ansi.rows };
    } else {
        return { ansi: ansi.bytes, cols: ansi.cols, rows: ansi.rows };
    }
}

if (typeof this === 'object') this.PNG2ANS = PNG2ANS;
