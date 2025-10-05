// img_loader.js — unified entry point

function here() { return js.exec_dir; }
js.global.__IMG_AS_LIBRARY__ = true; // prevent auto-run in the loaded files

load(here() + "gif2ans/gif2ans.js");
load(here() + "gif2ans/jpg2ans.js");
load(here() + "gif2ans/png2ans.js");

try { load(here() + "http.js"); } catch (e) { try { load("/sbbs/exec/http.js"); } catch (_) { } }

function fetchBytes(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
        var http = new HTTPRequest(); http.follow_redirects = 5;
        var body = http.Get(pathOrUrl);
        if (http.response_code !== 200 || !body) throw "HTTP " + http.response_code + " for " + pathOrUrl;
        return body;
    }
    var f = new File(pathOrUrl); if (!f.open("rb")) throw "open failed: " + pathOrUrl;
    var s = f.read(); f.close(); return s;
}

// quick magic sniff
function sniffType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    if (bytes.substr(0, 6) === "GIF87a" || bytes.substr(0, 6) === "GIF89a") return "gif";
    var c0 = bytes.charCodeAt(0) & 255, c1 = bytes.charCodeAt(1) & 255, c2 = bytes.charCodeAt(2) & 255;
    if (c0 === 0xFF && c1 === 0xD8 && c2 === 0xFF) return "jpg";
    if ((bytes.charCodeAt(0) & 255) === 0x89 && bytes.substr(1, 3) === "PNG") return "png";
    // (add webp later: "RIFF" + .... + "WEBP")
    return null;
}

// Public API
function convertImageToANSI(filePathOrUrl, width, contiguous, outputPath, debug) {
    var argsObj = {
        in: filePathOrUrl,
        out: outputPath || null,   // null = return bytes instead of write
        w: width || 80,
        contiguous: !!contiguous,
        debug: !!debug
    };

    var lower = (filePathOrUrl || "").toLowerCase();
    var converter, res;
    if (/\.(gif)(\?|#|$)/.test(lower)) converter = GIF2ANS;
    else if (/\.(jpe?g)(\?|#|$)/.test(lower)) converter = JPG2ANS;
    else if (/\.png(\?|#|$)/.test(lower)) converter = PNG2ANS;
    else {
        var bytes = fetchBytes(filePathOrUrl);
        var kind = sniffType(bytes);
        if (kind === "gif") converter = GIF2ANS;
        else if (kind === "jpg") converter = JPG2ANS;
        else if (kind === "png") converter = PNG2ANS;
        else throw new Error("Unsupported or unknown image type");
    }

    res = converter(argsObj);
    if (res && res.ansi) return res.ansi;  // inline mode returns text
    return res;
}


// Export the library API (global symbol)
this.convertImageToANSI = convertImageToANSI;