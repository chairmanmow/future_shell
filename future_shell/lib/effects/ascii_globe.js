"use strict";
// ascii_globe.js — spinning ASCII globe renderer + geo/pin helpers.
//
// Self-contained COPY of the globe engine from xtrn/ibbs-online/ibbs-online.js,
// vendored into future_shell so the private-msg subprogram can render the same
// globe as a background layer. AsciiGlobe(frame) is frame-agnostic: it renders
// into whatever Frame you hand it and never touches console dimensions.
//
// This is an intentional fork — do NOT edit ibbs-online.js to keep it in sync.
// Exports (via registerModuleExports / returned scope): AsciiGlobe,
// buildGlobePins, rebuildActiveMarkerColorMap.

require('sbbsdefs.js', 'LIGHTGRAY');
try { load('future_shell/lib/effects/ascii_globe_texture.js'); } catch (e) { }
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (e) { }
}

// ── globe constants ─────────────────────────────────────────────────
var GLOBE_TICK_MS = 140;
var GLOBE_MIN_W = 32;
var GLOBE_MIN_H = 12;
var GLOBE_HEIGHT_RATIO = 0.92;
var GLOBE_WIDTH_PER_HEIGHT = 2.0;
var GLOBE_CENTER_LAT_BIAS = 16; // positive tilts view northward (Europe-prominent)
var GLOBE_SIZE = 1.4; // ascii-globe upstream default size
var AUTO_REFRESH_MS = 15000;
var GLOBE_HYST_HI = 176;
var GLOBE_HYST_LO = 80;
var GLOBE_ASPECT = 2.0;
var GLOBE_BASE_SIZE = 1.4;
var INV_PI = 1 / Math.PI;

// ── geo + marker state ──────────────────────────────────────────────
var BBS_INDEX_BY_HOST = null;
var BBS_INDEX_BY_NAME = null;
var BBS_INDEX_BY_IP = null;
var GEO_LOC_CACHE = {};
var GEO_IP_CACHE = null;
var GEO_IP_AVAILABLE = false;
var GEO_IP_LOOKUPS_THIS_RUN = 0;
var GEO_IP_MISSES = {};
var GEO_IP_MAX_LOOKUPS_PER_RUN = 4;
var GEO_IP_CACHE_FILE = null;
var MARKER_FGS = [
    LIGHTRED, RED,
    LIGHTMAGENTA, MAGENTA,
    LIGHTCYAN, CYAN,
    WHITE, LIGHTGRAY,
    BLUE, LIGHTBLUE,
    DARKGRAY,
    YELLOW, BROWN,
    GREEN
];
var MARKER_CTRL = [
    '\x01h\x01r', '\x01r',
    '\x01h\x01m', '\x01m',
    '\x01h\x01c', '\x01c',
    '\x01h\x01w', '\x01w',
    '\x01b', '\x01h\x01b',
    '\x01h\x01k',
    '\x01h\x01y', '\x01y',
    '\x01g'
];
var ACTIVE_MARKER_COLOR_BY_LABEL = {};

// ── geo helpers + AsciiGlobe engine (ported verbatim) ───────────────
function normalizeHost(host) {
    host = String(host || '').trim().toLowerCase();
    if (!host.length) return '';
    host = host.replace(/^[a-z]+:\/\//, '');
    host = host.replace(/\/.*$/, '');
    if (host.charAt(0) === '[') {
        var close = host.indexOf(']');
        if (close > 0) host = host.substring(1, close);
    } else {
        var colons = (host.match(/\:/g) || []).length;
        if (colons === 1) host = host.replace(/\:\d+$/, '');
    }
    return host;
}

function hash32(str) {
    var h = 2166136261;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0);
}

function hashToLatLon(key) {
    var h1 = hash32(key);
    var h2 = hash32(key + '|lon');
    var lat = ((h1 % 14000) / 100) - 70;   // [-70, 70]
    var lon = ((h2 % 36000) / 100) - 180;  // [-180, 180]
    return { lat: lat, lon: lon };
}

function clamp(n, min, max) {
    if (n < min) return min;
    if (n > max) return max;
    return n;
}

function cleanLocToken(tok) {
    tok = String(tok || '').toLowerCase();
    tok = tok.replace(/[\.\(\)\[\]]/g, ' ');
    tok = tok.replace(/\s+/g, ' ').trim();
    return tok;
}

function validLatLon(lat, lon) {
    return isFinite(lat) && isFinite(lon)
        && lat >= -90 && lat <= 90
        && lon >= -180 && lon <= 180;
}

function isPrivateIPv4(ip) {
    if (!isIPv4(ip)) return false;
    var p = ip.split('.');
    var a = parseInt(p[0], 10);
    var b = parseInt(p[1], 10);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

function loadGeoIpCache() {
    if (GEO_IP_CACHE !== null) return;
    GEO_IP_CACHE = {};
    try {
        GEO_IP_CACHE_FILE = system.data_dir + 'ibbs-online-geoip.json';
        var f = new File(GEO_IP_CACHE_FILE);
        if (!f.open('r')) return;
        var raw = f.read();
        f.close();
        if (!raw || !raw.length) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') GEO_IP_CACHE = parsed;
    } catch (_) { }
}

function saveGeoIpCache() {
    if (!GEO_IP_CACHE || !GEO_IP_CACHE_FILE) return;
    try {
        var f = new File(GEO_IP_CACHE_FILE);
        if (!f.open('w+')) return;
        f.write(JSON.stringify(GEO_IP_CACHE));
        f.close();
    } catch (_) { }
}

function initGeoIp() {
    if (GEO_IP_CACHE !== null) return;
    loadGeoIpCache();
    try {
        if (typeof js.global.get_geoip !== 'function') load(js.global, 'geoip.js');
        GEO_IP_AVAILABLE = (typeof js.global.get_geoip === 'function');
    } catch (_) {
        GEO_IP_AVAILABLE = false;
    }
}

function geoIpLatLon(hostOrIp, seedKey) {
    var key = normalizeHost(hostOrIp);
    if (!key.length) return null;
    initGeoIp();
    if (!GEO_IP_AVAILABLE || !GEO_IP_CACHE) return null;

    var cached = GEO_IP_CACHE[key];
    if (cached && validLatLon(Number(cached.lat), Number(cached.lon))) {
        return { lat: Number(cached.lat), lon: Number(cached.lon) };
    }
    if (GEO_IP_MISSES[key]) return null;
    if (GEO_IP_LOOKUPS_THIS_RUN >= GEO_IP_MAX_LOOKUPS_PER_RUN) return null;
    if (isPrivateIPv4(key)) {
        GEO_IP_MISSES[key] = true;
        return null;
    }

    GEO_IP_LOOKUPS_THIS_RUN++;
    try {
        var geo = js.global.get_geoip(key);
        if (!geo) {
            GEO_IP_MISSES[key] = true;
            return null;
        }
        var lat = Number(geo.latitude);
        var lon = Number(geo.longitude);
        if (!validLatLon(lat, lon)) {
            GEO_IP_MISSES[key] = true;
            return null;
        }
        // deterministic pin spread within the same city
        var h = hash32((seedKey || key) + '|geo-lat');
        var h2 = hash32((seedKey || key) + '|geo-lon');
        lat = clamp(lat + ((((h % 1000) / 1000) - 0.5) * 0.8), -75, 75);
        lon = clamp(lon + ((((h2 % 1000) / 1000) - 0.5) * 0.8), -180, 180);
        GEO_IP_CACHE[key] = { lat: +lat.toFixed(4), lon: +lon.toFixed(4) };
        saveGeoIpCache();
        return { lat: GEO_IP_CACHE[key].lat, lon: GEO_IP_CACHE[key].lon };
    } catch (_) {
        GEO_IP_MISSES[key] = true;
        return null;
    }
}

function isIPv4(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(String(host || ''));
}

function explicitLatLonFromText(location) {
    var s = String(location || '');
    var m = s.match(/(-?\d{1,2}(?:\.\d+)?)\s*[,\/]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) return null;
    var lat = parseFloat(m[1]);
    var lon = parseFloat(m[2]);
    if (!validLatLon(lat, lon)) return null;
    return { lat: lat, lon: lon };
}

var GEO_REGION_CENTERS = {
    // countries / broad regions
    'usa': [39.8, -98.6], 'united states': [39.8, -98.6], 'us': [39.8, -98.6],
    'canada': [56.1, -106.3], 'uk': [54.0, -2.0], 'united kingdom': [54.0, -2.0], 'scotland': [56.5, -4.0],
    'germany': [51.2, 10.5], 'deu': [51.2, 10.5],
    'italy': [42.8, 12.5], 'spain': [40.4, -3.7], 'argentina': [-38.4, -63.6],
    'brazil': [-14.2, -51.9], 'brasil': [-14.2, -51.9], 'australia': [-25.3, 133.8],
    'new zealand': [-41.2, 174.8], 'nz': [-41.2, 174.8], 'hungary': [47.2, 19.5],
    'netherlands': [52.2, 5.3], 'nl': [52.2, 5.3], 'belgium': [50.6, 4.7], 'be': [50.6, 4.7],
    'portugal': [39.4, -8.2], 'norway': [60.5, 8.5], 'philippines': [12.9, 121.8], 'barbados': [13.1, -59.6],
    // common state / province markers in sbbslist
    'al': [32.8, -86.8], 'ak': [64.2, -149.5], 'az': [34.0, -111.6], 'ar': [34.9, -92.4],
    'ca': [36.8, -119.4], 'co': [39.0, -105.5], 'de': [39.0, -75.5], 'fl': [27.8, -81.7],
    'ga': [32.7, -83.4], 'il': [40.0, -89.2], 'in': [39.9, -86.2], 'ky': [37.8, -85.8],
    'ma': [42.3, -71.8], 'md': [39.0, -76.7], 'mi': [44.3, -85.4], 'mn': [46.7, -94.6],
    'ms': [32.7, -89.7], 'nc': [35.5, -79.4], 'nj': [40.1, -74.7], 'nv': [39.3, -116.6],
    'ny': [42.9, -75.5], 'oh': [40.4, -82.8], 'ok': [35.6, -97.5], 'or': [44.0, -120.6],
    'pa': [41.2, -77.2], 'tn': [35.7, -86.7], 'tx': [31.0, -99.3], 'ut': [39.3, -111.7],
    'va': [37.5, -78.8], 'wa': [47.5, -120.5], 'wi': [44.6, -89.6], 'wv': [38.5, -80.6], 'wy': [43.0, -107.6],
    'alabama': [32.8, -86.8], 'alaska': [64.2, -149.5], 'arizona': [34.0, -111.6], 'arkansas': [34.9, -92.4],
    'california': [36.8, -119.4], 'calif': [36.8, -119.4], 'colorado': [39.0, -105.5], 'delaware': [39.0, -75.5],
    'florida': [27.8, -81.7], 'georgia': [32.7, -83.4], 'illinois': [40.0, -89.2], 'indiana': [39.9, -86.2],
    'massachusetts': [42.3, -71.8], 'maryland': [39.0, -76.7], 'michigan': [44.3, -85.4], 'minnesota': [46.7, -94.6],
    'mississippi': [32.7, -89.7], 'north carolina': [35.5, -79.4], 'new jersey': [40.1, -74.7], 'nevada': [39.3, -116.6],
    'new york': [42.9, -75.5], 'ohio': [40.4, -82.8], 'oklahoma': [35.6, -97.5], 'oregon': [44.0, -120.6],
    'pennsylvania': [41.2, -77.2], 'tennessee': [35.7, -86.7], 'texas': [31.0, -99.3], 'utah': [39.3, -111.7],
    'virginia': [37.5, -78.8], 'washington': [47.5, -120.5], 'wisconsin': [44.6, -89.6], 'west virginia': [38.5, -80.6],
    'nsw': [-31.3, 147.0], 'vic': [-37.0, 144.0], 'act': [-35.5, 149.0], 'western australia': [-26.0, 121.0],
    'bc': [53.7, -127.6], 'qc': [52.9, -71.9], 'quebec': [52.9, -71.9], 'alberta': [53.9, -115.0],
    'pr': [18.2, -66.4]
};

function getRegionCenter(token) {
    var t = cleanLocToken(token);
    if (GEO_REGION_CENTERS[t]) return { lat: GEO_REGION_CENTERS[t][0], lon: GEO_REGION_CENTERS[t][1] };
    return null;
}

function locToLatLon(location, seedKey) {
    var loc = String(location || '').trim();
    if (!loc.length) return null;
    var cacheKey = loc.toLowerCase() + '|' + String(seedKey || '').toLowerCase();
    if (GEO_LOC_CACHE[cacheKey]) return GEO_LOC_CACHE[cacheKey];

    var ll = explicitLatLonFromText(loc);
    if (ll) {
        GEO_LOC_CACHE[cacheKey] = ll;
        return ll;
    }

    var tokens = loc.split(/[,\/|]/);
    var base = null;
    for (var i = tokens.length - 1; i >= 0; i--) {
        base = getRegionCenter(tokens[i]);
        if (base) break;
    }
    if (!base) {
        var words = cleanLocToken(loc).split(' ');
        for (var w = words.length - 1; w >= 0; w--) {
            base = getRegionCenter(words[w]);
            if (base) break;
        }
    }
    if (!base) base = getRegionCenter(loc);
    if (!base) return null;

    // Deterministic jitter keeps systems in the same region separated.
    var h = hash32((seedKey || '') + '|' + loc);
    var h2 = hash32((seedKey || '') + '|lon|' + loc);
    var latJ = (((h % 1000) / 1000) - 0.5) * 3.0;
    var lonJ = (((h2 % 1000) / 1000) - 0.5) * 4.0;
    ll = {
        lat: clamp(base.lat + latJ, -75, 75),
        lon: clamp(base.lon + lonJ, -180, 180)
    };
    GEO_LOC_CACHE[cacheKey] = ll;
    return ll;
}

function buildBbsIndex() {
    if (BBS_INDEX_BY_HOST && BBS_INDEX_BY_NAME && BBS_INDEX_BY_IP) return;
    BBS_INDEX_BY_HOST = {};
    BBS_INDEX_BY_NAME = {};
    BBS_INDEX_BY_IP = {};
    try {
        var f = new File(system.data_dir + 'sbbslist.json');
        if (!f.open('r')) return;
        var raw = f.read();
        f.close();
        if (!raw || !raw.length) return;
        var list = JSON.parse(raw);
        if (!(list instanceof Array)) return;
        for (var i = 0; i < list.length; i++) {
            var b = list[i];
            if (!b || typeof b !== 'object') continue;
            if (b.name) BBS_INDEX_BY_NAME[String(b.name).toLowerCase()] = b;
            if (b.service && b.service.length) {
                for (var s = 0; s < b.service.length; s++) {
                    var svc = b.service[s];
                    if (!svc || !svc.address) continue;
                    var h = normalizeHost(svc.address);
                    if (!h.length) continue;
                    BBS_INDEX_BY_HOST[h] = b;
                    if (isIPv4(h)) BBS_INDEX_BY_IP[h] = b;
                }
            }
        }
    } catch (e) { }
}

function bbsEntryForUser(u) {
    buildBbsIndex();
    var ip = normalizeHost(u && u.ip);
    if (ip && BBS_INDEX_BY_IP && BBS_INDEX_BY_IP[ip]) return BBS_INDEX_BY_IP[ip];
    var host = normalizeHost(u && u.host);
    if (host && BBS_INDEX_BY_HOST && BBS_INDEX_BY_HOST[host]) return BBS_INDEX_BY_HOST[host];
    var name = (u && u.bbs) ? String(u.bbs).toLowerCase() : '';
    if (name && BBS_INDEX_BY_NAME && BBS_INDEX_BY_NAME[name]) return BBS_INDEX_BY_NAME[name];
    return null;
}

function markerCharFromLabel(label) {
    var s = String(label || '').trim();
    if (!s.length) return 'O';
    // Ignore a leading "The " so "The Quantum Wormhole" keys as "Q".
    var stripped = s.replace(/^the\b\s*/i, '');
    if (stripped.length) s = stripped;
    var m = s.match(/[A-Za-z0-9]/);
    if (!m) return 'O';
    return m[0].toUpperCase();
}

function markerLabelKey(label) {
    return String(label || '').toLowerCase();
}

function rebuildActiveMarkerColorMap(users) {
    var oldMap = ACTIVE_MARKER_COLOR_BY_LABEL || {};
    var nextMap = {};
    var labels = [];
    var seen = {};
    var i;
    var n;
    var c;
    var key;
    var idx;
    var paletteLen = MARKER_FGS.length;
    var counts = [];
    var pending = [];
    for (c = 0; c < paletteLen; c++) counts[c] = 0;

    for (i = 0; i < users.length; i++) {
        key = markerLabelKey(users[i] && users[i].bbs);
        if (!key.length || seen[key]) continue;
        seen[key] = true;
        labels.push(key);
    }
    labels.sort();

    // Keep prior assignments when possible to avoid color "jumping" on refresh.
    for (n = 0; n < labels.length; n++) {
        key = labels[n];
        idx = oldMap[key];
        if (idx !== undefined && idx >= 0 && idx < paletteLen && counts[idx] === 0) {
            nextMap[key] = idx;
            counts[idx]++;
        } else {
            pending.push(key);
        }
    }

    // Assign unused colors first; only reuse when palette is exhausted.
    for (n = 0; n < pending.length; n++) {
        key = pending[n];
        idx = -1;
        for (c = 0; c < paletteLen; c++) {
            if (counts[c] === 0) { idx = c; break; }
        }
        if (idx < 0) {
            var start = hash32(key) % paletteLen;
            idx = start;
            var bestCount = counts[idx];
            for (c = 1; c < paletteLen; c++) {
                var probe = (start + c) % paletteLen;
                if (counts[probe] < bestCount) {
                    idx = probe;
                    bestCount = counts[probe];
                }
            }
        }
        nextMap[key] = idx;
        counts[idx]++;
    }

    ACTIVE_MARKER_COLOR_BY_LABEL = nextMap;
}

function markerColorIndex(label) {
    var key = markerLabelKey(label);
    if (ACTIVE_MARKER_COLOR_BY_LABEL[key] !== undefined) return ACTIVE_MARKER_COLOR_BY_LABEL[key];
    return hash32(key) % MARKER_FGS.length;
}

function markerAttrFromLabel(label, local) {
    return BG_BLACK | MARKER_FGS[markerColorIndex(label)] | HIGH;
}

function markerCtrlColorFromLabel(label, local) {
    return MARKER_CTRL[markerColorIndex(label)];
}

function buildGlobePins(users) {
    var pins = [];
    var seen = {};
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var host = normalizeHost(u.host || u.ip || u.bbs || u.name);
        var uniq = normalizeHost(u.ip) || host;
        if (!uniq) continue;
        if (seen[uniq]) continue;
        seen[uniq] = true;
        var entry = bbsEntryForUser(u);
        var ll = null;
        var seed = host || u.bbs || u.name;
        if (u.location) ll = locToLatLon(u.location, seed);
        if (!ll && entry && entry.location) ll = locToLatLon(entry.location, seed);
        if (!ll) {
            var geoKey = normalizeHost(u.geoHint || u.ip || u.host);
            ll = geoIpLatLon(geoKey, seed);
        }
        if (!ll) {
            var hint = host;
            if (u.location) hint += '|' + u.location;
            else if (entry && entry.location) hint += '|' + entry.location;
            else if (u.bbs) hint += '|' + u.bbs;
            ll = hashToLatLon(hint);
        }
        var label = u.bbs || host;
        pins.push({
            lat: ll.lat,
            lon: ll.lon,
            local: !!u.local,
            label: label,
            marker: markerCharFromLabel(label)
        });
        if (pins.length >= 120) break;
    }
    return pins;
}

function AsciiGlobe(frame) {
    this.frame = frame;
    this.angle = 0;
    this.centerLonDeg = -95; // "American-centric" initial view
    this.centerLatDeg = GLOBE_CENTER_LAT_BIAS;
    this.spinStep = 0.055;
    this.size = GLOBE_SIZE;
    this.pins = [];
    this.waterChar = '-';
    this.landChar = '#';
    this.waterAttrLo = BG_BLACK | BLUE;
    this.landAttrHi = BG_BLACK | GREEN;
    this.texW = 0;
    this.texH = 0;
    this.texMask = null;
    this.prevLand = null;
    this.prevW = 0;
    this.prevH = 0;

    var tex = null;
    try {
        if (typeof getAsciiGlobeTextureData === 'function') tex = getAsciiGlobeTextureData();
    } catch (_) { }
    if (tex && tex.width > 0 && tex.height > 0 && tex.mask && tex.mask.length) {
        this.texW = tex.width;
        this.texH = tex.height;
        this.texMask = tex.mask;
    }
}

AsciiGlobe.prototype.setPins = function (pins) {
    this.pins = (pins && pins.length) ? pins.slice(0) : [];
};

AsciiGlobe.prototype.setSize = function (size) {
    size = Number(size);
    if (!isFinite(size)) return;
    if (size < 0.6) size = 0.6;
    if (size > 2.4) size = 2.4;
    this.size = size;
};

AsciiGlobe.prototype._markerAttr = function (pin) {
    return markerAttrFromLabel(pin && pin.label, pin && pin.local);
};

AsciiGlobe.prototype._textureReady = function () {
    return !!(this.texMask && this.texW > 0 && this.texH > 0);
};

AsciiGlobe.prototype._ensurePrevLand = function (w, h) {
    if (this.prevLand && this.prevW === w && this.prevH === h) return;
    var size = w * h;
    if (typeof Uint8Array === 'function') this.prevLand = new Uint8Array(size);
    else {
        this.prevLand = new Array(size);
        for (var i = 0; i < size; i++) this.prevLand[i] = 0;
    }
    this.prevW = w;
    this.prevH = h;
};

AsciiGlobe.prototype._sampleMask = function (latRad, lonRad) {
    var uf = ((lonRad * INV_PI) * 0.5 + 0.5) * this.texW;
    var vf = (0.5 - latRad * INV_PI) * this.texH;

    var u0 = uf | 0;
    var v0 = vf | 0;
    var uFrac = uf - u0;
    var vFrac = vf - v0;

    var u1 = u0 + 1;
    if (u0 < 0) u0 += this.texW;
    else if (u0 >= this.texW) u0 -= this.texW;
    if (u1 < 0) u1 += this.texW;
    else if (u1 >= this.texW) u1 -= this.texW;

    var v1 = v0 + 1;
    if (v0 < 0) v0 = 0;
    else if (v0 >= this.texH) v0 = this.texH - 1;
    if (v1 < 0) v1 = 0;
    else if (v1 >= this.texH) v1 = this.texH - 1;

    var m00 = this.texMask[v0 * this.texW + u0];
    var m01 = this.texMask[v0 * this.texW + u1];
    var m10 = this.texMask[v1 * this.texW + u0];
    var m11 = this.texMask[v1 * this.texW + u1];

    var a = m00 + (m01 - m00) * uFrac;
    var b = m10 + (m11 - m10) * uFrac;
    return a + (b - a) * vFrac;
};

AsciiGlobe.prototype.tick = function () {
    var f = this.frame;
    if (!f || (typeof f.is_open !== 'undefined' && !f.is_open)) return;
    if (!this._textureReady()) return;
    var w = f.width | 0;
    var h = f.height | 0;
    if (w < 8 || h < 6) return;
    this._ensurePrevLand(w, h);

    var cx = (w - 1) / 2;
    var cy = (h - 1) / 2;
    var sizeScale = this.size / GLOBE_BASE_SIZE;
    var rx = Math.max(1, ((w - 2) * 0.5) * sizeScale);
    var ry = Math.max(1, (h - 2) * sizeScale);
    var invRx = 1 / rx;
    var invRy = 1 / ry;
    var ang = this.angle + (this.centerLonDeg * Math.PI / 180);
    var latAng = this.centerLatDeg * Math.PI / 180;
    var ca = Math.cos(ang);
    var sa = Math.sin(ang);
    var cl = Math.cos(latAng);
    var sl = Math.sin(latAng);

    f.clear();
    for (var y = 0; y < h; y++) {
        var sy = (cy - y) * invRy * GLOBE_ASPECT;
        var sy2 = sy * sy;
        if (sy2 > 1) continue;
        for (var x = 0; x < w; x++) {
            var sx = (x - cx) * invRx;
            var rr = sx * sx + sy2;
            if (rr > 1) continue;
            var sz = Math.sqrt(1 - rr);

            var tx = sx;
            var ty = sy * cl + sz * sl;
            var tz = -sy * sl + sz * cl;

            var wx = tx * ca - tz * sa;
            var wy = ty;
            var wz = tx * sa + tz * ca;

            if (wy < -1) wy = -1;
            else if (wy > 1) wy = 1;

            var latRad = Math.asin(wy);
            var lonRad = Math.atan2(-wz, wx);
            var interp = this._sampleMask(latRad, lonRad);

            var idx = y * w + x;
            var prev = this.prevLand[idx] ? 1 : 0;
            var threshold = prev ? GLOBE_HYST_LO : GLOBE_HYST_HI;
            var isLand = interp >= threshold;
            this.prevLand[idx] = isLand ? 1 : 0;

            f.setData(x, y, isLand ? this.landChar : this.waterChar, isLand ? this.landAttrHi : this.waterAttrLo, false);
        }
    }

    for (var i = 0; i < this.pins.length; i++) {
        var pin = this.pins[i];
        var latRad = (pin.lat * Math.PI) / 180;
        var lonRad = (pin.lon * Math.PI) / 180;
        var cLat = Math.cos(latRad);
        var wxp = cLat * Math.cos(lonRad);
        var wyp = Math.sin(latRad);
        var wzp = -cLat * Math.sin(lonRad);

        var txp = wxp * ca + wzp * sa;
        var typ = wyp;
        var tzp = -wxp * sa + wzp * ca;
        var sxp = txp;
        var syp = typ * cl - tzp * sl;
        var szp = typ * sl + tzp * cl;
        if (szp <= 0.02) continue;

        var px = Math.round(cx + sxp * rx);
        var py = Math.round(cy - (syp / GLOBE_ASPECT) * ry);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        var mch = markerCharFromLabel(pin && pin.marker);
        f.setData(px, py, mch, this._markerAttr(pin), false);
    }
    try { f.cycle(); } catch (_) { }
    this.angle += this.spinStep;
    if (this.angle >= Math.PI * 2) this.angle -= Math.PI * 2;
};

// ── exports ─────────────────────────────────────────────────────────
registerModuleExports({
    AsciiGlobe: AsciiGlobe,
    buildGlobePins: buildGlobePins,
    rebuildActiveMarkerColorMap: rebuildActiveMarkerColorMap
});

this;
