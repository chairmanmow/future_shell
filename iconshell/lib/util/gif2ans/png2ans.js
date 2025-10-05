function here() { return js.exec_dir; }
try { load(here() + "http.js"); } catch (e) { load("/sbbs/exec/http.js"); }
try { load(here() + "gif_loader.js"); } catch (e) { load("/sbbs/exec/gif_loader.js"); }
try { load(here() + "ansi_core.js"); } catch (e) { load("/sbbs/exec/ansi_core.js"); }

var __GIF = (typeof GIFLoaderFactory === 'function') ? GIFLoaderFactory() : GIF; // use factory or global
var __CORE = (typeof ANSICoreFactory === 'function') ? ANSICoreFactory() : ANSICore;

function __parseArgv(argv) {
    var o = {};
    for (var i = 0; i < argv.length; i++) {
        var a = String(argv[i]); var k = a.split("=", 1)[0]; var v = a.substr(k.length + 1);
        if (v === "") continue; o[k] = v;
    }
    return o;
}

function __fetchBytes(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        var http = new HTTPRequest(); http.follow_redirects = 5;
        var body = http.Get(pathOrUrl);
        if (http.response_code !== 200 || !body) throw "HTTP " + http.response_code + " for " + pathOrUrl;
        return body;
    }
    var f = new File(pathOrUrl); if (!f.open("rb")) throw "open failed: " + pathOrUrl;
    var s = f.read(); f.close(); return s;
}
function PNG2ANS(optsOrArgv) {
    var opts = (optsOrArgv && optsOrArgv.splice) ? __parseArgv(optsOrArgv) : (optsOrArgv || {});
    var INPUT = opts.in || "https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.gif";
    var OUTPUT = opts.out || "/sbbs/work/out.ans";
    var WIDTH = opts.w ? parseInt(opts.w, 10) : 80;
    var CONTIG = /^t(rue)?$/i.test(String(opts.contiguous || "true"));
    var DEBUG = /^t(rue)?$/i.test(String(opts.debug || "true"));
    function logx() { if (!DEBUG) return; var s = "[gif2ans] " + Array.prototype.slice.call(arguments).join(" "); try { log(s) } catch (e) { try { print(s) } catch (_) { } } }
}
(function () {
    var INPUT = "https://www.rtings.com/images/gradient.png";   // or your big PNG
    var OUTPUT = "/sbbs/work/test_png.ans";
    var WIDTH = 80;
    var CONTIG = true;
    var DEBUG = true;

    function here() { return js.exec_dir; }
    function log() { if (DEBUG) writeln("[png2ans] " + format.apply(null, arguments)); }

    // network helper (optional if using URLs)
    try { load("http.js"); } catch (e) { try { load("/sbbs/exec/load/http.js"); } catch (e2) { } }

    // load from the same directory this runner was loaded from
    load(here() + "ansi_core.js");
    load(here() + "png_loader.js");

    // instantiate the core (no globals needed)
    var ANSICore = ANSICoreFactory();

    // ---- fetch PNG ----
    var bytes;
    if (/^https?:\/\//i.test(INPUT)) {
        var req = new HTTPRequest(); req.user_agent = "png2ans/1.0"; req.follow_redirects = 5; req.recv_timeout = 90;
        bytes = req.Get(INPUT); if (req.response_code !== 200) { alert("HTTP " + req.response_code); exit(1); }
    } else {
        var f = new File(INPUT); if (!f.open("rb")) { alert("open " + INPUT); exit(1); }
        bytes = f.read(); f.close();
    }

    // ---- decode + pipeline ----
    var img = PNGLoader.decode(bytes);
    log("png %dx%d", img.width, img.height);

    // 1) scale -> {rgba,width,height}
    var scaled = ANSICore.scaleNearestRGBA(img.rgba, img.width, img.height, WIDTH);

    // 2) dither -> Uint8Array  (positional)
    var dRGBA = ANSICore.ditherCGA_FloydSteinberg(scaled.rgba, scaled.width, scaled.height);
    // in case your core returns {rgba:...} (back-compat), normalize:
    if (dRGBA && dRGBA.rgba) dRGBA = dRGBA.rgba;
    if (!(dRGBA && dRGBA.constructor === Uint8Array)) dRGBA = scaled.rgba; // safety fallback

    // 3) compose -> {bytes,cols,rows}
    var ansi = ANSICore.ansiHalfBlock(dRGBA, scaled.width, scaled.height, { withNewlines: false });

    // save + SAUCE
    ANSICore.saveText(OUTPUT, ansi.bytes);
    ANSICore.writeSAUCE(OUTPUT, "png2ans", "syncjs", "png2ans", ansi.cols, ansi.rows, ansi.bytes.length);

    writeln(format("OK: %s (%dx%d cells)", OUTPUT, ansi.cols, ansi.rows));
})();