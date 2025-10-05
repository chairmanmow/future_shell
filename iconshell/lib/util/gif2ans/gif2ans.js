// gif2ans.js — minimal runner calling ansi_core *positionally*

load("http.js");

function here() { return js.exec_dir; }

load(here() + "gif_loader.js");
load(here() + "ansi_core.js"); // must export ANSICoreFactory()

// instantiate the core (your style)
if (typeof ANSICoreFactory !== 'function') throw "ANSICoreFactory() not found";
var ANSICore = ANSICoreFactory();
var GIF = GIFLoaderFactory();

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


function GIF2ANS(optsOrArgv) {
    var opts = (optsOrArgv && optsOrArgv.splice) ? __parseArgv(optsOrArgv) : (optsOrArgv || {});
    var INPUT = opts.in || "https://www.w3.org/People/mimasa/test/imgformat/img/w3c_home.gif";
    var OUTPUT = opts.out || "/sbbs/work/out.ans";
    var WIDTH = opts.w ? parseInt(opts.w, 10) : 80;
    var CONTIG = /^t(rue)?$/i.test(String(opts.contiguous || "true"));
    var DEBUG = /^t(rue)?$/i.test(String(opts.debug || "true"));
    function logx() { if (!DEBUG) return; var s = "[gif2ans] " + Array.prototype.slice.call(arguments).join(" "); try { log(s) } catch (e) { try { print(s) } catch (_) { } } }

    var bytes = __fetchBytes(INPUT);
    if (!(__GIF.looksGIF ? __GIF.looksGIF(bytes) : (bytes.substr(0, 3) === "GIF"))) throw "Not a GIF";
    var g = __GIF.decode(bytes);
    logx("gif", g.width + "x" + g.height);

    var scaled = __CORE.scaleNearestRGBA(g.rgba, g.width, g.height, WIDTH); // -> {rgba,w,h}
    var dRGBA = __CORE.ditherCGA_FloydSteinberg(scaled.rgba, scaled.width, scaled.height);
    if (dRGBA && dRGBA.rgba) dRGBA = dRGBA.rgba;
    if (!(dRGBA && dRGBA.constructor === Uint8Array)) dRGBA = scaled.rgba;

    var ansi = __CORE.ansiHalfBlock(dRGBA, scaled.width, scaled.height, { withNewlines: false, contiguous: CONTIG });
    if (OUTPUT) {
        __CORE.saveText(OUTPUT, ansi.bytes);
        __CORE.writeSAUCE(OUTPUT, "gif2ans", "syncjs", "gif2ans", ansi.cols, ansi.rows, ansi.bytes.length);
        logx("wrote", OUTPUT, "cols=" + ansi.cols, "rows=" + ansi.rows);
        return { path: OUTPUT, cols: ansi.cols, rows: ansi.rows };
    } else {
        // return ANSI text directly (inline render mode)
        return { ansi: ansi.bytes, cols: ansi.cols, rows: ansi.rows };
    }
}