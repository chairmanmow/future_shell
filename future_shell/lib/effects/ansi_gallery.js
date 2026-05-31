"use strict";

if (typeof load === "function") {
    try { load("graphic.js"); } catch (_) { }
}

(function () {
    "use strict";

    var Sauce = null;
    try { Sauce = load({}, "sauce_lib.js"); } catch (_) { }

    var DEFAULT_SETTINGS_PATH = "/sbbs/xtrn/ansiview/settings.ini";
    var DEFAULT_HIDE = [".", "ansiview.ini", "ANSIVIEW.INI"];
    var DEFAULT_EXTS = [".ans", ".asc", ".bin"];
    var DEFAULT_SCROLL_INTERVAL_MS = 260;   // ~2400bps feel
    var DEFAULT_HOLD_MS = 1400;
    var DEFAULT_RESCAN_MS = 600000;
    var DEFAULT_MAX_FILES = 12000;

    // Single shared cache to avoid repeated heavy scans while also avoiding cache growth.
    var SHARED_POOL = {
        key: "",
        scanned_at: 0,
        files: []
    };

    function nowMs() { return Date.now ? Date.now() : (time() * 1000); }
    function toInt(v, fallback) {
        var n = parseInt(v, 10);
        return isNaN(n) ? fallback : n;
    }
    function clampMin(v, min) { return v < min ? min : v; }
    function trim(v) { return String(v === undefined || v === null ? "" : v).replace(/^\s+|\s+$/g, ""); }
    function lower(v) { return String(v || "").toLowerCase(); }
    function ensureSlash(path) {
        path = String(path || "").replace(/[\\\/]+$/, "");
        return path.length ? path + "/" : "";
    }
    function stripTrail(path) {
        return String(path || "").replace(/[\\\/]+$/, "");
    }
    function readText(path) {
        var f = new File(path);
        if (!f.open("r")) return "";
        var txt = f.read();
        f.close();
        return txt || "";
    }
    function safeDirectory(pattern) {
        try { return directory(pattern) || []; } catch (_) { return []; }
    }
    function safeIsDir(path) {
        try { return file_isdir(path); } catch (_) { return false; }
    }
    function safeGetName(path) {
        try { return file_getname(path); } catch (_) { return ""; }
    }
    function safeGetExt(path) {
        try { return lower(file_getext(path) || ""); } catch (_) { return ""; }
    }
    function hasAny(obj) {
        for (var k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
        }
        return false;
    }

    function wildcardToRegex(pattern) {
        var p = String(pattern || "");
        p = p.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        p = p.replace(/\*/g, ".*").replace(/\?/g, ".");
        return new RegExp("^" + p + "$", "i");
    }

    function matchesPattern(name, pattern) {
        name = lower(name);
        pattern = lower(pattern);
        if (!pattern.length) return false;
        if (name === pattern) return true;
        try {
            if (typeof wildmatch === "function") return !!wildmatch(false, name, pattern);
        } catch (_) { }
        try { return wildcardToRegex(pattern).test(name); } catch (_) { }
        return false;
    }

    function parseHideList(raw) {
        if (!raw) return [];
        return String(raw).split(",").map(function (entry) { return trim(entry); }).filter(function (entry) { return entry.length > 0; });
    }

    function parseSettings(settingsPath) {
        var text = readText(settingsPath);
        if (!text.length) return [];

        var lines = text.replace(/\r/g, "").split("\n");
        var sections = [];
        var current = null;

        for (var i = 0; i < lines.length; i++) {
            var line = trim(lines[i]);
            if (!line.length) continue;
            if (line.charAt(0) === ";" || line.charAt(0) === "#") continue;

            var sec = line.match(/^\[(.+)\]$/);
            if (sec) {
                current = { name: trim(sec[1]) };
                sections.push(current);
                continue;
            }

            var eq = line.indexOf("=");
            if (eq < 0 || !current) continue;
            var key = trim(line.substr(0, eq));
            var val = trim(line.substr(eq + 1));
            if (!key.length) continue;
            current[key] = val;
        }

        var galleries = [];
        for (var s = 0; s < sections.length; s++) {
            var g = sections[s];
            if (!g.path) continue;
            if (g.module && lower(g.module) !== "local.js") continue;
            var p = stripTrail(g.path);
            if (!p.length || !safeIsDir(p)) continue;
            galleries.push({
                path: p,
                hide: parseHideList(g.hide || "")
            });
        }
        return galleries;
    }

    function buildExtLookup(exts) {
        var map = {};
        for (var i = 0; i < exts.length; i++) {
            var ext = lower(trim(exts[i] || ""));
            if (!ext.length) continue;
            if (ext.charAt(0) !== ".") ext = "." + ext;
            map[ext] = true;
        }
        if (!hasAny(map)) {
            map[".ans"] = true;
            map[".asc"] = true;
            map[".bin"] = true;
        }
        return map;
    }

    function shouldHide(name, hidePatterns) {
        if (!name || !hidePatterns || !hidePatterns.length) return false;
        for (var i = 0; i < hidePatterns.length; i++) {
            if (matchesPattern(name, hidePatterns[i])) return true;
        }
        return false;
    }

    function scanRoot(rootPath, hidePatterns, extLookup, out, maxFiles, seenFiles) {
        var stack = [stripTrail(rootPath)];
        var seenDirs = {};
        while (stack.length && out.length < maxFiles) {
            var cur = stack.pop();
            var dirKey = lower(cur);
            if (seenDirs[dirKey]) continue;
            seenDirs[dirKey] = true;
            var entries = safeDirectory(ensureSlash(cur) + "*");
            for (var i = 0; i < entries.length && out.length < maxFiles; i++) {
                var entry = String(entries[i] || "");
                var entryName = safeGetName(stripTrail(entry));
                if (!entryName.length || shouldHide(entryName, hidePatterns)) continue;
                if (safeIsDir(entry)) {
                    stack.push(stripTrail(entry));
                    continue;
                }
                var ext = safeGetExt(entryName);
                if (!extLookup[ext]) continue;
                var fileKey = lower(entry);
                if (seenFiles[fileKey]) continue;
                seenFiles[fileKey] = true;
                out.push(entry);
            }
        }
    }

    function buildFilePool(settingsPath, extraRoots, maxFiles, exts) {
        var out = [];
        var galleries = parseSettings(settingsPath);
        var extLookup = buildExtLookup(exts);
        var rootHide = DEFAULT_HIDE.slice(0);
        var seenFiles = {};
        var i;

        for (i = 0; i < galleries.length && out.length < maxFiles; i++) {
            var g = galleries[i];
            var hide = rootHide.concat(g.hide || []);
            scanRoot(g.path, hide, extLookup, out, maxFiles, seenFiles);
        }

        // Optional fallback roots from animationOptions.
        if (extraRoots && extraRoots.length) {
            for (i = 0; i < extraRoots.length && out.length < maxFiles; i++) {
                var root = stripTrail(extraRoots[i]);
                if (!root.length || !safeIsDir(root)) continue;
                scanRoot(root, rootHide, extLookup, out, maxFiles, seenFiles);
            }
        }

        return out;
    }

    function parseRootList(raw) {
        if (!raw) return [];
        if (raw instanceof Array) return raw.map(function (v) { return trim(v); }).filter(Boolean);
        return String(raw).split(",").map(function (v) { return trim(v); }).filter(Boolean);
    }

    function AnsiGallery() {
        this.f = null;
        this.opts = {};
        this.scrollIntervalMs = DEFAULT_SCROLL_INTERVAL_MS;
        this.holdMs = DEFAULT_HOLD_MS;
        this.rescanMs = DEFAULT_RESCAN_MS;
        this.maxFiles = DEFAULT_MAX_FILES;
        this.settingsPath = DEFAULT_SETTINGS_PATH;
        this.exts = DEFAULT_EXTS.slice(0);
        this.extraRoots = [];
        this.centerHoriz = true;
        this.bgAttr = (typeof BG_BLACK !== "undefined" && typeof LIGHTGRAY !== "undefined")
            ? (BG_BLACK | LIGHTGRAY)
            : 7;

        this._pool = [];
        this._poolUpdatedAt = 0;
        this._lastPath = "";
        this._graphic = null;
        this._top = 0;
        this._maxTop = 0;
        this._contentHeight = 0;
        this._lastStepAt = 0;
        this._holdUntil = 0;
        this.singleArtPass = false;
        this._passComplete = false;
        this._artCompleteSignal = false;
    }

    AnsiGallery.prototype.init = function (frame, opts) {
        this.f = frame;
        this.opts = opts || {};

        this.scrollIntervalMs = clampMin(toInt(this.opts.scroll_interval_ms, DEFAULT_SCROLL_INTERVAL_MS), 60);
        this.holdMs = clampMin(toInt(this.opts.hold_ms, DEFAULT_HOLD_MS), 200);
        this.rescanMs = clampMin(toInt(this.opts.rescan_ms, DEFAULT_RESCAN_MS), 1000);
        this.maxFiles = clampMin(toInt(this.opts.max_files, DEFAULT_MAX_FILES), 50);
        this.settingsPath = trim(this.opts.settings_path || DEFAULT_SETTINGS_PATH) || DEFAULT_SETTINGS_PATH;
        this.exts = parseRootList(this.opts.extensions);
        if (!this.exts.length) this.exts = DEFAULT_EXTS.slice(0);
        this.extraRoots = parseRootList(this.opts.paths || this.opts.roots || "");
        this.singleArtPass = !!(this.opts.single_art_pass || this.opts.interstitial_mode);
        if (this.opts.center_horiz !== undefined) this.centerHoriz = !!this.opts.center_horiz;
        if (this.opts.bg_attr !== undefined) this.bgAttr = toInt(this.opts.bg_attr, this.bgAttr);
        this._passComplete = false;
        this._artCompleteSignal = false;

        this._refreshPool(true);
        if (!this._loadNextArt()) this._drawStatus("No ANSI files");
    };

    AnsiGallery.prototype._cacheKey = function () {
        return [
            this.settingsPath,
            this.maxFiles,
            this.exts.join(","),
            this.extraRoots.join(",")
        ].join("|");
    };

    AnsiGallery.prototype._refreshPool = function (force) {
        var now = nowMs();
        var key = this._cacheKey();
        if (!force && SHARED_POOL.key === key && (now - SHARED_POOL.scanned_at) < this.rescanMs) {
            this._pool = SHARED_POOL.files;
            this._poolUpdatedAt = SHARED_POOL.scanned_at;
            return;
        }

        var files = buildFilePool(this.settingsPath, this.extraRoots, this.maxFiles, this.exts);
        SHARED_POOL.key = key;
        SHARED_POOL.scanned_at = now;
        SHARED_POOL.files = files;

        this._pool = files;
        this._poolUpdatedAt = now;
    };

    AnsiGallery.prototype._pickPath = function () {
        if (!this._pool || !this._pool.length) return "";
        if (this._pool.length === 1) return this._pool[0];
        var pick = this._pool[Math.floor(Math.random() * this._pool.length)];
        var tries = 0;
        while (pick === this._lastPath && tries < 8) {
            pick = this._pool[Math.floor(Math.random() * this._pool.length)];
            tries++;
        }
        return pick;
    };

    AnsiGallery.prototype._loadGraphicForPath = function (path) {
        if (!path || typeof Graphic !== "function") return null;
        var ext = safeGetExt(path);
        var sauce = null;
        var width;
        var height;
        var g;

        if (Sauce && (ext === ".ans" || ext === ".bin")) {
            try { sauce = Sauce.read(path); } catch (_) { sauce = null; }
        }

        if (ext === ".bin") {
            if (!sauce || !sauce.cols || !sauce.rows) return null;
            width = clampMin(toInt(sauce.cols, 0), 1);
            height = clampMin(toInt(sauce.rows, 0), 1);
            g = new Graphic(width, height);
            if (!g.load(path)) return null;
            this._stripBellChars(g);
            return g;
        }

        if (ext === ".ans") {
            width = (sauce && sauce.cols) ? clampMin(toInt(sauce.cols, 80), 1) : 80;
            height = (sauce && sauce.rows) ? clampMin(toInt(sauce.rows, 24), 1) : Math.max(64, (this.f && this.f.height) ? this.f.height : 24);
            g = new Graphic(width, height);
            g.auto_extend = true;
            g.autowrap = true;
            if (!g.load(path)) return null;
            this._stripBellChars(g);
            return g;
        }

        if (ext === ".asc") {
            width = Math.max(40, (this.f && this.f.width) ? this.f.width : 80);
            height = Math.max(64, (this.f && this.f.height) ? this.f.height : 24);
            g = new Graphic(width, height);
            g.auto_extend = true;
            g.autowrap = true;
            if (!g.load(path)) return null;
            this._stripBellChars(g);
            return g;
        }

        return null;
    };

    AnsiGallery.prototype._stripBellChars = function (g) {
        if (!g || !g.data || !g.width || !g.height) return;
        for (var y = 0; y < g.height; y++) {
            for (var x = 0; x < g.width; x++) {
                var cell = g.data[x][y];
                if (!cell || !cell.ch || !cell.ch.length) continue;
                if (cell.ch.charCodeAt(0) === 7) cell.ch = " ";
            }
        }
    };

    AnsiGallery.prototype._findContentHeight = function (g) {
        if (!g || !g.data || !g.width || !g.height) return 1;
        var defaultAttr = (typeof g.attribute === "number") ? g.attribute : 7;
        var y, x, cell;
        for (y = g.height - 1; y >= 0; y--) {
            for (x = 0; x < g.width; x++) {
                cell = g.data[x][y];
                if (!cell) continue;
                if (cell.ch !== " " || cell.attr !== defaultAttr) return y + 1;
            }
        }
        return 1;
    };

    AnsiGallery.prototype._loadNextArt = function () {
        if (!this.f || (typeof this.f.is_open !== "undefined" && !this.f.is_open)) return false;
        var now = nowMs();
        if ((now - this._poolUpdatedAt) >= this.rescanMs) this._refreshPool(false);
        if (!this._pool || !this._pool.length) return false;

        var attempts = this._pool.length;
        while (attempts-- > 0) {
            var path = this._pickPath();
            if (!path) break;
            var g = this._loadGraphicForPath(path);
            if (!g) {
                // Remove non-renderable entries from this run's pool to avoid repeated failures.
                var idx = this._pool.indexOf(path);
                if (idx >= 0) this._pool.splice(idx, 1);
                continue;
            }

            this._graphic = g;
            this._lastPath = path;
            this._top = 0;
            this._contentHeight = this._findContentHeight(g);
            this._maxTop = Math.max(0, this._contentHeight - this.f.height);
            this._lastStepAt = now;
            this._holdUntil = this._maxTop <= 0 ? (now + this.holdMs) : 0;
            this._passComplete = false;
            this._artCompleteSignal = false;
            this._render();
            return true;
        }
        return false;
    };

    AnsiGallery.prototype._render = function () {
        var frame = this.f;
        var g = this._graphic;
        if (!frame || !g) return;
        if (typeof frame.is_open !== "undefined" && !frame.is_open) return;

        var fw = frame.width | 0;
        var fh = frame.height | 0;
        if (fw <= 0 || fh <= 0) return;

        var xOffset = 0;
        if (this.centerHoriz && g.width < fw) xOffset = Math.floor((fw - g.width) / 2);

        var y, x;
        var srcY, srcX;
        var cell, ch, attr;
        for (y = 0; y < fh; y++) {
            srcY = this._top + y;
            for (x = 0; x < fw; x++) {
                srcX = x - xOffset;
                if (srcX >= 0 && srcX < g.width && srcY >= 0 && srcY < g.height) {
                    cell = g.data[srcX][srcY];
                    ch = cell ? cell.ch : " ";
                    attr = (cell && typeof cell.attr === "number") ? cell.attr : this.bgAttr;
                } else {
                    ch = " ";
                    attr = this.bgAttr;
                }
                frame.setData(x, y, ch, attr, false);
            }
        }
        try { frame.cycle(); } catch (_) { }
    };

    AnsiGallery.prototype._drawStatus = function (msg) {
        if (!this.f || (typeof this.f.is_open !== "undefined" && !this.f.is_open)) return;
        try { this.f.clear(); } catch (_) { }
        var text = String(msg || "");
        if (text.length) {
            var x = Math.max(1, Math.floor((this.f.width - text.length) / 2) + 1);
            var y = Math.max(1, Math.floor(this.f.height / 2));
            try {
                this.f.gotoxy(x, y);
                this.f.putmsg(text, this.bgAttr);
            } catch (_) { }
        }
        try { this.f.cycle(); } catch (_) { }
    };

    AnsiGallery.prototype._completeCurrentArt = function () {
        this._passComplete = true;
        this._artCompleteSignal = true;
    };

    AnsiGallery.prototype.consumeArtComplete = function () {
        var done = !!this._artCompleteSignal;
        this._artCompleteSignal = false;
        return done;
    };

    AnsiGallery.prototype.isPassComplete = function () {
        return !!this._passComplete;
    };

    AnsiGallery.prototype.tick = function () {
        if (!this.f || (typeof this.f.is_open !== "undefined" && !this.f.is_open)) return;
        if (this.singleArtPass && this._passComplete) return;

        if (!this._graphic) {
            if (!this._loadNextArt()) this._drawStatus("No ANSI files");
            return;
        }

        var now = nowMs();
        if (this._maxTop <= 0) {
            if (now >= this._holdUntil) {
                if (this.singleArtPass) {
                    this._completeCurrentArt();
                    return;
                }
                if (!this._loadNextArt()) {
                    this._graphic = null;
                    this._drawStatus("No ANSI files");
                }
            }
            return;
        }

        if (this._top < this._maxTop) {
            if ((now - this._lastStepAt) < this.scrollIntervalMs) return;
            this._lastStepAt = now;
            this._top++;
            this._render();
            if (this._top >= this._maxTop) this._holdUntil = now + this.holdMs;
            return;
        }

        if (!this._holdUntil) this._holdUntil = now + this.holdMs;
        if (now < this._holdUntil) return;

        if (this.singleArtPass) {
            this._completeCurrentArt();
            return;
        }

        if (!this._loadNextArt()) {
            this._graphic = null;
            this._drawStatus("No ANSI files");
        }
    };

    AnsiGallery.prototype.dispose = function () {
        this._graphic = null;
        this._pool = [];
        this._passComplete = false;
        this._artCompleteSignal = false;
        if (this.f && (typeof this.f.is_open === "undefined" || this.f.is_open)) {
            try { this.f.clear(); } catch (_) { }
            try { this.f.cycle(); } catch (_) { }
        }
        this.f = null;
    };

    var _global = (typeof globalThis !== "undefined")
        ? globalThis
        : ((typeof js !== "undefined" && js && js.global) ? js.global : undefined);
    if (_global) _global.AnsiGallery = AnsiGallery;
})();
