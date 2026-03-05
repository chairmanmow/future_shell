// ticker_settings.js — RSS Ticker settings subprogram
// Configure: random order, use newsreader favorites, feed list, add/remove/search feeds
"use strict";

load("sbbsdefs.js");
load("future_shell/lib/subprograms/subprogram.js");

// ---------------------------------------------------------------------------
// Persistence helpers — per-user JSON in future_shell/data/ticker/
// ---------------------------------------------------------------------------

function _tsEnsureDir(path) {
    if (!path) return false;
    if (file_isdir(path)) return true;
    try { mkdir(path); return file_isdir(path); } catch (_) {}
    return false;
}

function _tsTrailingSlash(p) {
    if (!p) return '';
    var c = p.charAt(p.length - 1);
    return (c === '/' || c === '\\') ? p : p + '/';
}

function _tsResolveDataDir() {
    var base = '';
    try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) {}
    if (!base && typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (!base) base = '.';
    base = _tsTrailingSlash(base) + 'future_shell/data/';
    _tsEnsureDir(base);
    var dir = base + 'ticker/';
    _tsEnsureDir(dir);
    return dir;
}

function _tsUserKey() {
    if (typeof user === 'object' && user) {
        if (typeof user.number === 'number' && user.number > 0) return 'user' + user.number;
        if (user.alias) return 'alias_' + String(user.alias).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
    return 'guest';
}

function _tsPrefsPath() {
    return _tsResolveDataDir() + 'prefs_' + _tsUserKey() + '.json';
}

function _tsLoadPrefs() {
    var path = _tsPrefsPath();
    var f = new File(path);
    if (!f.exists) return null;
    if (!f.open('r')) return null;
    var text = '';
    try { text = f.readAll().join('\n'); } catch (_) { text = ''; }
    f.close();
    if (!text) return null;
    try { var obj = JSON.parse(text); return (obj && typeof obj === 'object') ? obj : null; }
    catch (_) { return null; }
}

function _tsSavePrefs(prefs) {
    var path = _tsPrefsPath();
    var f = new File(path);
    if (!f.open('w')) return false;
    try { f.write(JSON.stringify(prefs, null, 2)); } catch (_) {}
    f.close();
    return true;
}

function _tsDefaultPrefs() {
    return {
        random_order: false,
        use_favorites: false,
        feeds: []        // Array of { key, label, url }
    };
}

// ---------------------------------------------------------------------------
// Parse all feeds from newsreader.ini
// ---------------------------------------------------------------------------

function _tsReadIniFile(path) {
    if (!path) return null;
    var f = new File(path);
    if (!f.exists) return null;
    if (!f.open('r')) return null;
    var r;
    try { r = f.readAll().join('\n'); } catch (_) { r = null; }
    f.close();
    return r;
}

function _tsParseIni(raw) {
    var data = {};
    var cur = null;
    var lines = raw.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].trim();
        if (!ln || ln.charAt(0) === ';' || ln.charAt(0) === '#') continue;
        var mSec = ln.match(/^\[(.+?)\]$/);
        if (mSec) { cur = mSec[1]; data[cur] = data[cur] || {}; continue; }
        if (!cur) continue;
        var eq = ln.indexOf('=');
        if (eq === -1) continue;
        data[cur][ln.substring(0, eq).trim()] = ln.substring(eq + 1).trim();
    }
    return data;
}

function _tsParseAllFeeds() {
    var feeds = [];
    try {
        var path = null;
        if (typeof ICSH_resolveConfigPath === 'function') {
            try { path = ICSH_resolveConfigPath('newsreader.ini'); } catch (_) {}
        }
        if (!path) {
            var base = '';
            try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) {}
            if (!base) base = '.';
            path = _tsTrailingSlash(base) + 'future_shell/config/newsreader.ini';
        }
        var raw = _tsReadIniFile(path);
        if (!raw) return feeds;
        var data = _tsParseIni(raw);

        for (var sec in data) {
            if (!Object.prototype.hasOwnProperty.call(data, sec)) continue;
            if (sec.toLowerCase().indexOf('feed.') !== 0) continue;
            var s = data[sec];
            var url = s.url || s.URL;
            if (!url) continue;
            var key = sec.substring(5); // strip 'Feed.'
            var label = s.label || s.name || key.replace(/_/g, ' ');
            var category = s.category || 'Misc';
            var enabled = s.enabled;
            if (typeof enabled === 'string' && enabled.toLowerCase() === 'false') continue;
            feeds.push({ key: key, label: label, url: url, category: category });
        }
    } catch (e) {
        try { log('[TickerSettings] Error parsing feeds: ' + e); } catch (_) {}
    }
    return feeds;
}

// Read newsreader favorites for current user (array of URLs)
function _tsReadNewsreaderFavorites() {
    var urls = [];
    try {
        var base = '';
        try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) {}
        if (!base) base = '.';
        var dir = _tsTrailingSlash(base) + 'future_shell/data/newsreader/';
        var key = _tsUserKey();
        var path = dir + 'favorites_' + key + '.json';
        var f = new File(path);
        if (!f.exists) return urls;
        if (!f.open('r')) return urls;
        var text = '';
        try { text = f.readAll().join('\n'); } catch (_) { text = ''; }
        f.close();
        if (!text) return urls;
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.feeds)) return parsed.feeds;
    } catch (_) {}
    return urls;
}

// ---------------------------------------------------------------------------
// TickerSettings subprogram
// ---------------------------------------------------------------------------

function TickerSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'ticker-settings', parentFrame: opts.parentFrame });
    this.id = 'ticker-settings';
    this.themeNamespace = this.id;
    this.shell = opts.shell || null;

    this._frame = null;
    this._headerFrame = null;
    this._listFrame = null;
    this._statusFrame = null;

    // User prefs
    this._prefs = null;
    this._dirty = false;

    // All available feeds from newsreader.ini (loaded lazily)
    this._allFeeds = null;

    // UI state
    this._mode = 'main';       // 'main' | 'search'
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    this._rows = [];

    // Search state
    this._searchText = '';
    this._searchResults = [];
    this._searchSelectedIndex = 0;
    this._searchScrollOffset = 0;

    this.registerColors({
        BG:          { BG: BG_BLACK,  FG: LIGHTGRAY },
        TITLE:       { BG: BG_BLUE,   FG: WHITE },
        ROW_NORMAL:  { BG: BG_BLACK,  FG: LIGHTGRAY },
        ROW_ACTIVE:  { BG: BG_CYAN,   FG: BLACK },
        TOGGLE_ON:   { BG: BG_BLACK,  FG: LIGHTGREEN },
        TOGGLE_OFF:  { BG: BG_BLACK,  FG: LIGHTRED },
        SECTION:     { BG: BG_BLACK,  FG: YELLOW },
        STATUS:      { BG: BG_BLUE,   FG: WHITE },
        SEARCH_INPUT:{ BG: BG_BLACK,  FG: WHITE }
    });
}

extend(TickerSettings, Subprogram);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

TickerSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this._loadPrefs();
    this._buildMainRows();
    this._mode = 'main';
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    // Place cursor on first selectable row
    if (this._rows[0] && this._rows[0].selectable === false) {
        var next = this._findSelectable(0, 1, this._rows);
        if (next !== -1) this._selectedIndex = next;
    }
    this.draw();
};

TickerSettings.prototype.exit = function () {
    if (this._dirty) this._savePrefs();
    if (this._statusFrame) { this._statusFrame.delete(); this._statusFrame = null; }
    if (this._listFrame) { this._listFrame.delete(); this._listFrame = null; }
    if (this._headerFrame) { this._headerFrame.delete(); this._headerFrame = null; }
    if (this._frame) { this._frame.delete(); this._frame = null; }
    Subprogram.prototype.exit.call(this);
};

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

TickerSettings.prototype._loadPrefs = function () {
    var saved = _tsLoadPrefs();
    if (saved) {
        this._prefs = saved;
        if (!Array.isArray(this._prefs.feeds)) this._prefs.feeds = [];
    } else {
        this._prefs = _tsDefaultPrefs();
        this._seedFromGlobalConfig();
    }
};

TickerSettings.prototype._seedFromGlobalConfig = function () {
    try {
        if (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS && ICSH_SETTINGS.ticker) {
            var cfg = ICSH_SETTINGS.ticker;
            if (cfg.random_order !== undefined) this._prefs.random_order = !!cfg.random_order;
            if (cfg.use_favorites !== undefined) this._prefs.use_favorites = !!cfg.use_favorites;
            if (cfg.feedKeys && cfg.feedKeys.length) {
                var allFeeds = this._getAllFeeds();
                var lookup = {};
                for (var i = 0; i < allFeeds.length; i++) {
                    lookup[allFeeds[i].key.toLowerCase()] = allFeeds[i];
                }
                for (var fi = 0; fi < cfg.feedKeys.length; fi++) {
                    var key = cfg.feedKeys[fi].toLowerCase();
                    if (lookup[key]) {
                        var fd = lookup[key];
                        this._prefs.feeds.push({ key: fd.key, label: fd.label, url: fd.url });
                    }
                }
            }
        }
    } catch (_) {}
};

TickerSettings.prototype._savePrefs = function () {
    _tsSavePrefs(this._prefs);
    this._dirty = false;
    this._notifyTicker();
};

TickerSettings.prototype._notifyTicker = function () {
    try {
        if (this.shell && this.shell._ticker && typeof this.shell._ticker.reloadPrefs === 'function') {
            this.shell._ticker.reloadPrefs();
        }
    } catch (_) {}
};

TickerSettings.prototype._getAllFeeds = function () {
    if (!this._allFeeds) this._allFeeds = _tsParseAllFeeds();
    return this._allFeeds;
};

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------

TickerSettings.prototype._buildMainRows = function () {
    var rows = [];

    // Section: Settings
    rows.push({ type: 'section', label: 'Settings', selectable: false });

    rows.push({
        type: 'toggle',
        key: 'random_order',
        label: 'Random headline order',
        value: !!this._prefs.random_order
    });

    rows.push({
        type: 'toggle',
        key: 'use_favorites',
        label: 'Use newsreader favorites',
        value: !!this._prefs.use_favorites
    });

    // Section: Feeds
    rows.push({ type: 'section', label: 'Feeds (' + this._prefs.feeds.length + ')', selectable: false });

    for (var i = 0; i < this._prefs.feeds.length; i++) {
        var fd = this._prefs.feeds[i];
        rows.push({
            type: 'feed',
            index: i,
            label: fd.label || fd.key,
            key: fd.key,
            url: fd.url
        });
    }

    // Action: add feed
    rows.push({ type: 'action', key: 'add', label: '[ + Add feed... ]' });

    this._rows = rows;
};

// ---------------------------------------------------------------------------
// Frame setup
// ---------------------------------------------------------------------------

TickerSettings.prototype._ensureFrames = function () {
    if (!this.parentFrame || this._frame) return;
    var bgAttr = this.paletteAttr('BG');
    var w = this.parentFrame.width;
    var h = this.parentFrame.height;

    this._frame = new Frame(
        this.parentFrame.x, this.parentFrame.y,
        w, h, bgAttr, this.parentFrame
    );
    this._frame.open();

    this._headerFrame = new Frame(
        this._frame.x, this._frame.y,
        w, 1, this.paletteAttr('TITLE'), this._frame
    );
    this._headerFrame.open();

    this._statusFrame = new Frame(
        this._frame.x, this._frame.y + h - 1,
        w, 1, this.paletteAttr('STATUS'), this._frame
    );
    this._statusFrame.open();

    this._listFrame = new Frame(
        this._frame.x, this._frame.y + 1,
        w, h - 2, bgAttr, this._frame
    );
    this._listFrame.open();
};

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

TickerSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._renderHeader();
    this._renderList();
    this._renderStatus();
    this._frame.cycle();
};

TickerSettings.prototype._renderHeader = function () {
    if (!this._headerFrame) return;
    this._headerFrame.clear();
    this._headerFrame.attr = this.paletteAttr('TITLE');
    var w = this._headerFrame.width;
    var pad = '';
    for (var i = 0; i < w; i++) pad += ' ';
    this._headerFrame.gotoxy(1, 1);
    this._headerFrame.putmsg(pad);
    this._headerFrame.gotoxy(1, 1);
    var title = (this._mode === 'search') ? ' Search Feeds ' : ' RSS Ticker Settings ';
    this._headerFrame.center(title);
};

TickerSettings.prototype._renderList = function () {
    if (!this._listFrame) return;
    this._listFrame.clear();

    var rows = (this._mode === 'search') ? this._searchResults : this._rows;
    var selIdx = (this._mode === 'search') ? this._searchSelectedIndex : this._selectedIndex;
    var scrollOff = (this._mode === 'search') ? this._searchScrollOffset : this._scrollOffset;
    var h = this._listFrame.height;
    var w = this._listFrame.width;

    // Keep selection visible
    if (selIdx < scrollOff) scrollOff = selIdx;
    if (selIdx >= scrollOff + h) scrollOff = selIdx - h + 1;
    if (this._mode === 'search') this._searchScrollOffset = scrollOff;
    else this._scrollOffset = scrollOff;

    if (this._mode === 'search' && this._searchText.length > 0 && rows.length === 0) {
        this._listFrame.gotoxy(1, 1);
        this._listFrame.attr = this.paletteAttr('ROW_NORMAL');
        this._listFrame.putmsg(_tsPad(this._searchText.length < 2
            ? ' Type at least 2 characters...'
            : ' No matching feeds found.', w));
        return;
    }

    for (var r = 0; r < h; r++) {
        var idx = scrollOff + r;
        if (idx >= rows.length) break;
        var row = rows[idx];
        var isSelected = (idx === selIdx);
        this._listFrame.gotoxy(1, r + 1);
        this._renderRow(row, isSelected, w);
    }
};

TickerSettings.prototype._renderRow = function (row, isSelected, w) {
    if (!row) return;
    var f = this._listFrame;

    switch (row.type) {
        case 'section':
            f.attr = this.paletteAttr('SECTION');
            f.putmsg(_tsPad('\x01n\x01h\x01y\x0140 ' + row.label + ' ', w));
            break;

        case 'toggle':
            f.attr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
            var stateStr = row.value ? '\x01h\x01gON ' : '\x01h\x01rOFF';
            var stateClean = row.value ? 'ON ' : 'OFF';
            var labelStr = ' ' + row.label;
            var gap = Math.max(1, w - labelStr.length - stateClean.length - 1);
            var gapStr = '';
            while (gap-- > 0) gapStr += ' ';
            f.putmsg(labelStr + gapStr + stateStr + '\x01n');
            break;

        case 'feed':
            f.attr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
            var feedLine = ' ' + (isSelected ? '\x01h' : '') + row.label;
            f.putmsg(_tsPad(feedLine, w));
            break;

        case 'action':
            f.attr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
            var actLine = ' ' + (isSelected ? '\x01h' : '\x01c') + row.label;
            f.putmsg(_tsPad(actLine, w));
            break;

        case 'search_result':
            f.attr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
            var srLabel = row.label;
            var catTag = row.category ? '  [' + row.category + ']' : '';
            var maxLbl = w - catTag.length - 2;
            if (srLabel.length > maxLbl && maxLbl > 8) srLabel = srLabel.substring(0, maxLbl - 2) + '..';
            var srLine = ' ' + (row.already_added ? '\x01n\x01h\x01k' + srLabel + catTag + ' \x01n\x01h\x01k(added)' : (isSelected ? '\x01h' : '') + srLabel + (isSelected ? '\x01n\x01k\x016' : '\x01n\x01c') + catTag);
            f.putmsg(_tsPad(srLine, w));
            break;

        default:
            f.attr = this.paletteAttr('ROW_NORMAL');
            f.putmsg(_tsPad(' ' + (row.label || ''), w));
    }
};

TickerSettings.prototype._renderStatus = function () {
    if (!this._statusFrame) return;
    this._statusFrame.clear();
    this._statusFrame.attr = this.paletteAttr('STATUS');
    var w = this._statusFrame.width;
    var pad = '';
    for (var i = 0; i < w; i++) pad += ' ';
    this._statusFrame.gotoxy(1, 1);
    this._statusFrame.putmsg(pad);
    this._statusFrame.gotoxy(1, 1);

    var msg;
    if (this._mode === 'search') {
        var count = this._searchResults.length;
        msg = ' \x01h/' + this._searchText + '\x01n\x01h\x01k_\x01n\x01w  ';
        if (count > 0) msg += count + ' match' + (count !== 1 ? 'es' : '') + '  \x01cEnter\x01w:add  ';
        msg += '\x01cESC\x01w:back';
    } else {
        msg = ' \x01cSpace\x01w:toggle  \x01cA\x01w:add  \x01cDEL\x01w:remove  \x01c/\x01w:search  \x01cESC\x01w:close';
    }
    if (_tsStripCtrlA(msg).length > w) msg = msg.substring(0, w + 40); // rough truncate
    this._statusFrame.putmsg(msg);
};

// ---------------------------------------------------------------------------
// Key handling (uses _handleKey as required by Subprogram base class)
// ---------------------------------------------------------------------------

TickerSettings.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;
    if (this._mode === 'search') return this._handleSearchKey(key);
    return this._handleMainKey(key);
};

TickerSettings.prototype._handleMainKey = function (key) {
    var str = (typeof key === 'string') ? key : null;

    // ESC / Q: exit
    if (str === '\x1B' || str === 'q' || str === 'Q') {
        this.exit();
        return true;
    }

    // Navigation
    if (_tsIsUp(key, str)) { this._moveMain(-1); return true; }
    if (_tsIsDown(key, str)) { this._moveMain(1); return true; }
    if (_tsIsHome(key, str)) {
        this._selectedIndex = 0;
        var n = this._findSelectable(0, 1, this._rows);
        if (n !== -1) this._selectedIndex = n;
        this._redraw();
        return true;
    }
    if (_tsIsEnd(key, str)) {
        this._selectedIndex = this._rows.length - 1;
        var n2 = this._findSelectable(this._rows.length - 1, -1, this._rows);
        if (n2 !== -1) this._selectedIndex = n2;
        this._redraw();
        return true;
    }

    // Space / Enter: toggle or activate
    if (str === ' ' || str === '\r' || (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER)) {
        return this._activateMainRow();
    }

    // DEL: remove feed
    if (str === '\x1B[3~' || (typeof KEY_DEL !== 'undefined' && key === KEY_DEL)) {
        return this._removeFeedAtSelection();
    }

    // A or /: search to add
    if (str === 'a' || str === 'A' || str === '/') {
        this._enterSearch();
        return true;
    }

    return false;
};

// ---------------------------------------------------------------------------
// Main list navigation
// ---------------------------------------------------------------------------

TickerSettings.prototype._moveMain = function (direction) {
    var rows = this._rows;
    if (!rows || !rows.length) return;
    var next = this._findSelectable(this._selectedIndex + direction, direction, rows);
    if (next !== -1) this._selectedIndex = next;
    this._redraw();
};

TickerSettings.prototype._findSelectable = function (startIdx, direction, rows) {
    if (!rows || !rows.length) return -1;
    var d = direction >= 0 ? 1 : -1;
    var idx = startIdx;
    for (var attempts = 0; attempts < rows.length; attempts++) {
        if (idx < 0 || idx >= rows.length) return -1;
        if (rows[idx].selectable !== false) return idx;
        idx += d;
    }
    return -1;
};

TickerSettings.prototype._redraw = function () {
    this._renderList();
    this._renderStatus();
    if (this._frame) this._frame.cycle();
};

// ---------------------------------------------------------------------------
// Main actions
// ---------------------------------------------------------------------------

TickerSettings.prototype._activateMainRow = function () {
    var row = this._rows[this._selectedIndex];
    if (!row) return false;

    if (row.type === 'toggle') {
        row.value = !row.value;
        this._prefs[row.key] = row.value;
        this._dirty = true;
        this._savePrefs();
        this._redraw();
        return true;
    }

    if (row.type === 'action' && row.key === 'add') {
        this._enterSearch();
        return true;
    }

    return false;
};

TickerSettings.prototype._removeFeedAtSelection = function () {
    var row = this._rows[this._selectedIndex];
    if (!row || row.type !== 'feed') return false;

    var fi = row.index;
    if (fi >= 0 && fi < this._prefs.feeds.length) {
        this._prefs.feeds.splice(fi, 1);
        this._dirty = true;
        this._savePrefs();
        this._buildMainRows();
        if (this._selectedIndex >= this._rows.length) this._selectedIndex = this._rows.length - 1;
        if (this._selectedIndex < 0) this._selectedIndex = 0;
        if (this._rows[this._selectedIndex] && this._rows[this._selectedIndex].selectable === false) {
            var next = this._findSelectable(this._selectedIndex, 1, this._rows);
            if (next === -1) next = this._findSelectable(this._selectedIndex, -1, this._rows);
            if (next !== -1) this._selectedIndex = next;
        }
        this._redraw();
    }
    return true;
};

// ---------------------------------------------------------------------------
// Search mode
// ---------------------------------------------------------------------------

TickerSettings.prototype._enterSearch = function () {
    this._mode = 'search';
    this._searchText = '';
    this._searchResults = [];
    this._searchSelectedIndex = 0;
    this._searchScrollOffset = 0;
    this._renderHeader();
    this._redraw();
};

TickerSettings.prototype._exitSearch = function () {
    this._mode = 'main';
    this._searchText = '';
    this._searchResults = [];
    this._buildMainRows();
    this._renderHeader();
    this._redraw();
};

TickerSettings.prototype._handleSearchKey = function (key) {
    var str = (typeof key === 'string') ? key : null;

    // ESC: exit search
    if (str === '\x1B') {
        this._exitSearch();
        return true;
    }

    // Navigate results
    if (_tsIsUp(key, str)) { this._moveSearch(-1); return true; }
    if (_tsIsDown(key, str)) { this._moveSearch(1); return true; }

    // Enter: add selected
    if (str === '\r' || (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER)) {
        this._addSearchSelection();
        return true;
    }

    // Backspace
    if (str === '\x08' || str === '\x7F') {
        if (this._searchText.length > 0) {
            this._searchText = this._searchText.substring(0, this._searchText.length - 1);
            this._performSearch();
        } else {
            this._exitSearch();
        }
        return true;
    }

    // Printable character
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && str.charCodeAt(0) < 127) {
        this._searchText += str;
        this._performSearch();
        return true;
    }

    return false;
};

TickerSettings.prototype._performSearch = function () {
    var query = this._searchText.toLowerCase();
    this._searchResults = [];
    this._searchSelectedIndex = 0;
    this._searchScrollOffset = 0;

    if (query.length < 2) {
        this._redraw();
        return;
    }

    var allFeeds = this._getAllFeeds();
    // Build set of already-added feed URLs
    var addedUrls = {};
    for (var i = 0; i < this._prefs.feeds.length; i++) {
        addedUrls[this._prefs.feeds[i].url] = true;
    }

    var results = [];
    for (var fi = 0; fi < allFeeds.length; fi++) {
        var fd = allFeeds[fi];
        var labelLow = fd.label.toLowerCase();
        var keyLow = fd.key.toLowerCase();
        var catLow = fd.category.toLowerCase();
        if (labelLow.indexOf(query) !== -1 || keyLow.indexOf(query) !== -1 || catLow.indexOf(query) !== -1) {
            results.push({
                type: 'search_result',
                key: fd.key,
                label: fd.label,
                url: fd.url,
                category: fd.category,
                already_added: !!addedUrls[fd.url]
            });
        }
        if (results.length >= 200) break;
    }

    this._searchResults = results;
    this._redraw();
};

TickerSettings.prototype._moveSearch = function (direction) {
    var rows = this._searchResults;
    if (!rows || !rows.length) return;
    var next = this._searchSelectedIndex + direction;
    if (next < 0) next = 0;
    if (next >= rows.length) next = rows.length - 1;
    this._searchSelectedIndex = next;
    this._renderList();
    if (this._frame) this._frame.cycle();
};

TickerSettings.prototype._addSearchSelection = function () {
    var row = this._searchResults[this._searchSelectedIndex];
    if (!row) { this._exitSearch(); return; }

    if (row.already_added) {
        // Already there — just go back
        this._exitSearch();
        return;
    }

    this._prefs.feeds.push({ key: row.key, label: row.label, url: row.url });
    this._dirty = true;
    this._savePrefs();
    row.already_added = true;

    this._exitSearch();
    // Position on newly added feed
    var lastFeedRow = -1;
    for (var i = 0; i < this._rows.length; i++) {
        if (this._rows[i].type === 'feed') lastFeedRow = i;
    }
    if (lastFeedRow !== -1) this._selectedIndex = lastFeedRow;
    this._redraw();
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function _tsPad(str, width) {
    var display = _tsStripCtrlA(str);
    var need = width - display.length;
    if (need <= 0) return str;
    var spaces = '';
    while (need-- > 0) spaces += ' ';
    return str + spaces;
}

function _tsStripCtrlA(str) {
    if (!str) return '';
    return str.replace(/\x01./g, '');
}

function _tsIsUp(key, str) {
    if (typeof KEY_UP !== 'undefined' && key === KEY_UP) return true;
    return (str === '\x1B[A' || str === '\x1BOA');
}

function _tsIsDown(key, str) {
    if (typeof KEY_DOWN !== 'undefined' && key === KEY_DOWN) return true;
    return (str === '\x1B[B' || str === '\x1BOB');
}

function _tsIsHome(key, str) {
    if (typeof KEY_HOME !== 'undefined' && key === KEY_HOME) return true;
    return (str === '\x1B[H' || str === '\x1BOH');
}

function _tsIsEnd(key, str) {
    if (typeof KEY_END !== 'undefined' && key === KEY_END) return true;
    return (str === '\x1B[F' || str === '\x1BOF');
}
