// img_loader.js — unified entry point

function here() {
    var dir = js.exec_dir || '';
    if (dir && dir.charAt(dir.length - 1) !== '/' && dir.charAt(dir.length - 1) !== '\\') dir += '/';
    return dir;
}
js.global.__IMG_AS_LIBRARY__ = true; // prevent auto-run in the loaded files

load(here() + "future_shell/lib/util/gif2ans/gif2ans.js");
log("GIF2ANS loaded" + !!GIF2ANS);
load(here() + "future_shell/lib/util/gif2ans/jpg2ans.js");
log("JPG2ANS loaded" + !!JPG2ANS);
load(here() + "future_shell/lib/util/gif2ans/png2ans.js");
log("PNG2ANS loaded" + !!PNG2ANS);
js.global.__IMG_AS_LIBRARY__ = false;
try { load("http.js"); } catch (e) { try { load("/sbbs/exec/http.js"); } catch (_) { } }

function fetchBytes(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
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
    var opts = {};
    var debugFlag = !!debug;
    if (debug && typeof debug === 'object') {
        opts = debug;
        debugFlag = !!opts.debug;
    }

    var argsObj = {
        in: filePathOrUrl,
        out: outputPath || null,   // null = return bytes instead of write
        w: width || 80,
        contiguous: !!contiguous,
        debug: debugFlag
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

    if (opts && opts.returnObject) {
        if (res && typeof res === 'object') {
            var ansiText = res.ansi || res.bytes || res.text || null;
            return {
                ansi: ansiText,
                cols: (typeof res.cols === 'number') ? res.cols : ((typeof res.width === 'number') ? res.width : argsObj.w),
                rows: (typeof res.rows === 'number') ? res.rows : ((typeof res.height === 'number') ? res.height : null),
                source: res
            };
        }
        if (typeof res === 'string') {
            return {
                ansi: res,
                cols: argsObj.w,
                rows: null,
                source: res
            };
        }
        return {
            ansi: null,
            cols: argsObj.w,
            rows: null,
            source: res
        };
    }

    if (res && res.ansi) return res.ansi;  // inline mode returns text
    return res;
}


// Export the library API (global symbol)
this.convertImageToANSI = convertImageToANSI;
