"use strict";

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_eLazy) { }
}
try { if (typeof Modal !== 'function') load('future_shell/lib/util/layout/modal.js'); } catch (_eModal) { }
try { load('frame.js'); } catch (_eFrame) { }

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN', 'BG_GREEN', 'BG_LIGHTGRAY', 'BG_MAGENTA', 'BG_RED', 'BG_BROWN',
    'BLACK', 'BLUE', 'GREEN', 'CYAN', 'RED', 'MAGENTA', 'BROWN', 'WHITE', 'LIGHTGRAY', 'DARKGRAY',
    'LIGHTBLUE', 'LIGHTGREEN', 'LIGHTCYAN', 'LIGHTRED', 'LIGHTMAGENTA', 'YELLOW',
    'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_HOME', 'KEY_END', 'KEY_PGUP', 'KEY_PGDN'
);

var DEFAULT_ATTR = (typeof LIGHTGRAY === 'number') ? (BG_BLACK | LIGHTGRAY) : 7;
var ANSI_FG_CODES = [30, 34, 32, 36, 31, 35, 33, 37];
var ANSI_BG_CODES = [40, 44, 42, 46, 41, 45, 43, 47];
var AVATAR_COLS = 10;
var AVATAR_ROWS = 6;
var RESOURCE_EDITOR_PROFILES = {
    generic: 'generic',
    avatar: 'avatar',
    gateway_icon: 'gateway_icon',
    bbs_screen: 'bbs_screen'
};

function trimText(value) {
    return String(value || '').replace(/^\s+|\s+$/g, '');
}

function ensureTrailingSlash(path) {
    path = String(path || '');
    if (!path.length) return '';
    var last = path.charAt(path.length - 1);
    if (last === '/' || last === '\\') return path;
    return path + '/';
}

function normalizePath(path) {
    var value = String(path || '');
    if (!value.length) return '';
    value = value.replace(/\\/g, '/');
    var prefix = '';
    if (/^[A-Za-z]:\//.test(value)) {
        prefix = value.substr(0, 3);
        value = value.substr(3);
    } else if (value.charAt(0) === '/') {
        prefix = '/';
        value = value.substr(1);
    }
    var parts = value.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part || part === '.') continue;
        if (part === '..') {
            if (out.length && out[out.length - 1] !== '..') out.pop();
            else if (!prefix) out.push(part);
            continue;
        }
        out.push(part);
    }
    return prefix + out.join('/');
}

function pathWithinRoot(path, root) {
    var normalizedPath = normalizePath(path);
    var normalizedRoot = normalizePath(root);
    if (!normalizedPath.length || !normalizedRoot.length) return false;
    var rooted = ensureTrailingSlash(normalizedRoot);
    if (normalizedPath === normalizedRoot) return true;
    return normalizedPath.indexOf(rooted) === 0;
}

function cp437Char(code) {
    if (typeof ascii === 'function') return ascii(code);
    return String.fromCharCode(code);
}

function cp437Code(ch) {
    if (typeof ascii === 'function') {
        try {
            var fromAscii = ascii(ch);
            if (typeof fromAscii === 'number' && !isNaN(fromAscii)) return fromAscii & 0xFF;
        } catch (_eAscii) { }
    }
    if (!ch || !ch.length) return 32;
    return ch.charCodeAt(0) & 0xFF;
}

function cgaToXterm(color) {
    var low = color & 7;
    if (low === 1) low = 4;
    else if (low === 4) low = 1;
    else if (low === 3) low = 6;
    else if (low === 6) low = 3;
    return (color & 8) | low;
}

function adler32(bytes) {
    var MOD = 65521;
    var s1 = 1;
    var s2 = 0;
    if (!bytes || !bytes.length) return 1;
    for (var i = 0; i < bytes.length; i++) {
        s1 = (s1 + (bytes[i] & 0xFF)) % MOD;
        s2 = (s2 + s1) % MOD;
    }
    return ((s2 << 16) | s1) >>> 0;
}

function zlibStoreCompress(bytes) {
    var src = bytes || [];
    var out = [0x78, 0x01]; // zlib header: deflate + fast strategy
    var pos = 0;
    while (pos < src.length) {
        var chunkLen = src.length - pos;
        if (chunkLen > 65535) chunkLen = 65535;
        var isFinal = (pos + chunkLen >= src.length) ? 1 : 0;
        out.push(isFinal); // BFINAL + BTYPE=stored
        out.push(chunkLen & 0xFF);
        out.push((chunkLen >> 8) & 0xFF);
        var nlen = (~chunkLen) & 0xFFFF;
        out.push(nlen & 0xFF);
        out.push((nlen >> 8) & 0xFF);
        for (var i = 0; i < chunkLen; i++) out.push(src[pos + i] & 0xFF);
        pos += chunkLen;
    }
    var sum = adler32(src);
    out.push((sum >> 24) & 0xFF);
    out.push((sum >> 16) & 0xFF);
    out.push((sum >> 8) & 0xFF);
    out.push(sum & 0xFF);
    return out;
}

function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
        var hex = (bytes[i] & 0xFF).toString(16);
        if (hex.length < 2) hex = '0' + hex;
        out += hex;
    }
    return out;
}

function ResourceEditor(opts) {
    opts = opts || {};
    Subprogram.call(this, {
        name: 'resource-editor',
        parentFrame: opts.parentFrame,
        shell: opts.shell,
        timer: opts.timer
    });
    this.id = 'resource-editor';
    this.themeNamespace = this.id;
    this.resourcePath = opts.resourcePath || opts.file || null;
    this.profileMeta = opts.profileMeta || {};
    this.profile = this._normalizeProfile(opts.profile || RESOURCE_EDITOR_PROFILES.generic);
    this._storagePaths = this._resolveStoragePaths();
    this._profiles = this._buildProfiles();
    if (!this._profiles[this.profile]) this.profile = RESOURCE_EDITOR_PROFILES.generic;
    this.profileConfig = this._profiles[this.profile] || this._profiles[RESOURCE_EDITOR_PROFILES.generic];

    this.headerFrame = null;
    this.canvasFrame = null;
    this.paletteFrame = null;
    this.glyphFrame = null;
    this.statusFrame = null;

    var preset = this.profileConfig && this.profileConfig.preset ? this.profileConfig.preset : { cols: 80, rows: 24 };
    var initialCols = parseInt((opts.cols || preset.cols || 80), 10);
    var initialRows = parseInt((opts.rows || preset.rows || 24), 10);
    if (isNaN(initialCols) || initialCols < 1) initialCols = 80;
    if (isNaN(initialRows) || initialRows < 1) initialRows = 24;
    this.docCols = initialCols;
    this.docRows = initialRows;
    this.cols = this.docCols;
    this.rows = this.docRows;
    this.canvas = [];
    this.cursor = { x: 0, y: 0 };
    this.viewOffset = { x: 0, y: 0 };
    this._dirty = false;
    this.inputMode = (opts.inputMode === 'keyboard') ? 'keyboard' : 'mouse';
    this.focus = 'canvas';
    this._hotspotHandlers = {};
    this._hotspotCounter = 0;
    this._hotspotBuffer = '';
    this._overwritePrompt = null;
    this._sizePrompt = null;
    this._avatarLib = null;

    var paletteSet = this._buildPalette();
    this.palette = paletteSet.entries;
    this._foregroundIndex = paletteSet.defaultFG;
    this._backgroundIndex = paletteSet.defaultBG;
    this.paletteIndex = this._foregroundIndex;
    this._applyBrushAttributes();
    this.glyphRows = this._buildGlyphRows();
    this.glyphSelection = { row: 0, col: 0 };
    this.currentGlyph = this.glyphRows[0][0];
    this._syncGlyphSelectionFromChar();

    this.registerColors({
        HEADER: { BG: BG_BLUE, FG: WHITE },
        STATUS: { BG: BG_BLACK, FG: LIGHTGREEN },
        STATUS_WARN: { BG: BG_BLACK, FG: YELLOW },
        STATUS_ERROR: { BG: BG_BLACK, FG: LIGHTRED },
        CANVAS_BG: { BG: BG_BLACK, FG: LIGHTGRAY },
        CURSOR: { BG: BG_CYAN, FG: BLACK },
        PALETTE_LABEL: { BG: BG_BLACK, FG: LIGHTGRAY },
        PALETTE_ACTIVE: { BG: BG_GREEN, FG: BLACK },
        PALETTE_BG_ACTIVE: { BG: BG_BLUE, FG: WHITE },
        PALETTE_CURSOR: { BG: BG_CYAN, FG: BLACK },
        GLYPH_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },
        GLYPH_ACTIVE: { BG: BG_GREEN, FG: BLACK },
        GLYPH_BRACKET_LIGHT: { BG: BG_BLACK, FG: LIGHTGRAY },
        GLYPH_BRACKET_DARK: { BG: BG_BLACK, FG: DARKGRAY },
        GLYPH_SELECTED_BRACKET: { BG: BG_BLACK, FG: YELLOW },
        GLYPH_SELECTED_CHAR: { BG: BG_BLACK, FG: WHITE }
    });
    this._paletteLayout = { cols: 1, rows: 1, cellWidth: 5 };
    this._initCanvas();
}
extend(ResourceEditor, Subprogram);

ResourceEditor.prototype._initCanvas = function () {
    this.canvas = [];
    for (var y = 0; y < this.docRows; y++) {
        var row = [];
        for (var x = 0; x < this.docCols; x++) {
            row.push({ ch: ' ', attr: this.brushAttr });
        }
        this.canvas.push(row);
    }
};

ResourceEditor.prototype._normalizeProfile = function (profile) {
    var key = trimText(profile || RESOURCE_EDITOR_PROFILES.generic).toLowerCase();
    key = key.replace(/[^a-z0-9_]+/g, '_');
    if (!key.length) key = RESOURCE_EDITOR_PROFILES.generic;
    return key;
};

ResourceEditor.prototype._ensureDir = function (path) {
    if (!path) return false;
    if (file_isdir(path)) return true;
    try { mkdir(path); } catch (_e) { }
    return file_isdir(path);
};

ResourceEditor.prototype._resolveStoragePaths = function () {
    var modsBase = null;
    try {
        if (typeof system !== 'undefined' && system && system.mods_dir) modsBase = system.mods_dir;
    } catch (_eSys) { }
    if (!modsBase && typeof js !== 'undefined' && js && js.exec_dir) modsBase = js.exec_dir;
    if (!modsBase) modsBase = '.';
    modsBase = ensureTrailingSlash(modsBase);

    var shellDir = modsBase + 'future_shell/';
    var dataDir = shellDir + 'data/';
    var editorDir = dataDir + 'resource_editor/';
    var genericDir = editorDir + 'generic/';
    var avatarDir = editorDir + 'avatars/';
    var screensDir = editorDir + 'screens/';
    var assetsDir = shellDir + 'assets/';
    var gatewayAssetsDir = assetsDir + 'gateways/';
    var uploadsDir = null;
    try {
        if (typeof system !== 'undefined' && system && system.data_dir) {
            uploadsDir = ensureTrailingSlash(system.data_dir) + 'dirs/uploads/';
        }
    } catch (_eData) { }
    if (!uploadsDir) uploadsDir = './dirs/uploads/';

    this._ensureDir(shellDir);
    this._ensureDir(dataDir);
    this._ensureDir(editorDir);
    this._ensureDir(genericDir);
    this._ensureDir(avatarDir);
    this._ensureDir(screensDir);
    this._ensureDir(assetsDir);
    this._ensureDir(gatewayAssetsDir);
    this._ensureDir(uploadsDir);

    return {
        shellDir: shellDir,
        dataDir: dataDir,
        editorDir: editorDir,
        genericDir: genericDir,
        avatarDir: avatarDir,
        screensDir: screensDir,
        assetsDir: assetsDir,
        gatewayAssetsDir: gatewayAssetsDir,
        uploadsDir: uploadsDir
    };
};

ResourceEditor.prototype._buildProfiles = function () {
    var paths = this._storagePaths || this._resolveStoragePaths();
    var gatewayBase = '';
    if (this.profileMeta && this.profileMeta.gatewayId) {
        gatewayBase = String(this.profileMeta.gatewayId).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        gatewayBase = gatewayBase.replace(/^-+|-+$/g, '');
    }
    var gatewayId = gatewayBase;
    if (gatewayId.length) gatewayId += '.bin';

    return {
        generic: {
            key: RESOURCE_EDITOR_PROFILES.generic,
            label: 'Generic',
            roots: [paths.genericDir, paths.assetsDir, paths.uploadsDir],
            defaultRoot: paths.genericDir,
            allowExt: ['.ans', '.bin'],
            defaultExt: '.ans',
            defaultName: '',
            preset: { cols: 80, rows: 24 },
            overwrite: true
        },
        avatar: {
            key: RESOURCE_EDITOR_PROFILES.avatar,
            label: 'Avatar',
            roots: [paths.avatarDir],
            defaultRoot: paths.avatarDir,
            allowExt: ['.bin'],
            defaultExt: '.bin',
            defaultName: '',
            preset: { cols: AVATAR_COLS, rows: AVATAR_ROWS },
            overwrite: true
        },
        gateway_icon: {
            key: RESOURCE_EDITOR_PROFILES.gateway_icon,
            label: 'Gateway Icon',
            roots: [paths.gatewayAssetsDir],
            defaultRoot: paths.gatewayAssetsDir,
            allowExt: ['.ans', '.bin'],
            defaultExt: '.bin',
            defaultName: gatewayId,
            lockedBaseName: gatewayBase,
            preset: { cols: 12, rows: 6 },
            overwrite: true
        },
        bbs_screen: {
            key: RESOURCE_EDITOR_PROFILES.bbs_screen,
            label: 'BBS Screen',
            roots: [paths.screensDir],
            defaultRoot: paths.screensDir,
            allowExt: ['.ans', '.bin'],
            defaultExt: '.ans',
            defaultName: '',
            preset: { cols: 80, rows: 24 },
            overwrite: true
        }
    };
};

ResourceEditor.prototype._activeProfile = function () {
    if (!this._profiles) this._profiles = this._buildProfiles();
    if (!this.profile || !this._profiles[this.profile]) this.profile = RESOURCE_EDITOR_PROFILES.generic;
    this.profileConfig = this._profiles[this.profile] || this._profiles[RESOURCE_EDITOR_PROFILES.generic];
    return this.profileConfig;
};

ResourceEditor.prototype._isAllowedExt = function (ext) {
    ext = String(ext || '').toLowerCase();
    var profile = this._activeProfile();
    var list = (profile && profile.allowExt) ? profile.allowExt : ['.ans', '.bin'];
    for (var i = 0; i < list.length; i++) {
        if (ext === String(list[i]).toLowerCase()) return true;
    }
    return false;
};

ResourceEditor.prototype._isPathAllowed = function (path) {
    var profile = this._activeProfile();
    var roots = (profile && profile.roots) ? profile.roots : null;
    if (!roots || !roots.length) return true;
    for (var i = 0; i < roots.length; i++) {
        if (pathWithinRoot(path, roots[i])) return true;
    }
    return false;
};

ResourceEditor.prototype._isProfilePathAllowed = function (path, profile) {
    var active = profile || this._activeProfile();
    if (!active || active.key !== RESOURCE_EDITOR_PROFILES.gateway_icon) return true;
    var lockedBase = trimText(active.lockedBaseName || '');
    if (!lockedBase.length) return true;

    var normalized = normalizePath(path);
    var slash = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    var filename = (slash >= 0) ? normalized.substr(slash + 1) : normalized;
    var dot = filename.lastIndexOf('.');
    var base = (dot >= 0) ? filename.substr(0, dot) : filename;
    if (base.toLowerCase() === lockedBase.toLowerCase()) return true;

    this._updateStatus('Gateway icon profile locked to "' + lockedBase + '".', 'error');
    return false;
};

ResourceEditor.prototype._defaultPathInput = function () {
    var profile = this._activeProfile();
    if (!profile) return '';
    if (profile.defaultName && profile.defaultName.length) return profile.defaultName;
    return '';
};

ResourceEditor.prototype._profileRootsLabel = function () {
    var profile = this._activeProfile();
    if (!profile || !profile.roots || !profile.roots.length) return 'any path';
    var names = [];
    for (var i = 0; i < profile.roots.length; i++) {
        names.push(profile.roots[i]);
    }
    return names.join(', ');
};

ResourceEditor.prototype._getAvatarLib = function () {
    if (this._avatarLib && typeof this._avatarLib.read === 'function' && typeof this._avatarLib.update_localuser === 'function') {
        return this._avatarLib;
    }
    try {
        if (typeof bbs !== 'undefined') {
            if (!bbs.mods) bbs.mods = {};
            if (bbs.mods.avatar_lib && typeof bbs.mods.avatar_lib.read === 'function') {
                this._avatarLib = bbs.mods.avatar_lib;
                return this._avatarLib;
            }
        }
    } catch (_eShared) { }
    var candidates = ['avatar_lib.js', '../exec/load/avatar_lib.js', '../../exec/load/avatar_lib.js'];
    for (var i = 0; i < candidates.length; i++) {
        var lib = null;
        try {
            if (typeof lazyLoadModule === 'function') {
                lib = lazyLoadModule(candidates[i], { cacheKey: 'avatar_lib.resource_editor:' + i });
            } else {
                lib = load({}, candidates[i]);
            }
        } catch (_eLoad) {
            lib = null;
        }
        if (lib && typeof lib.read === 'function' && typeof lib.update_localuser === 'function') {
            this._avatarLib = lib;
            try {
                if (typeof bbs !== 'undefined') {
                    if (!bbs.mods) bbs.mods = {};
                    if (!bbs.mods.avatar_lib) bbs.mods.avatar_lib = lib;
                }
            } catch (_eCache) { }
            return lib;
        }
    }
    return null;
};

ResourceEditor.prototype._applyBinaryToCanvas = function (raw, cols, rows) {
    cols = parseInt(cols, 10);
    rows = parseInt(rows, 10);
    if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) return false;
    if (typeof raw !== 'string') raw = '';
    this.docCols = cols;
    this.docRows = rows;
    this._initCanvas();
    var idx = 0;
    for (var y = 0; y < this.docRows; y++) {
        for (var x = 0; x < this.docCols; x++) {
            var ch = ' ';
            var attr = this.brushAttr;
            if ((idx + 1) < raw.length) {
                ch = raw.charAt(idx++);
                var attrCode = raw.charCodeAt(idx++);
                if (typeof attrCode === 'number' && !isNaN(attrCode)) attr = attrCode & 0xFF;
            }
            this.canvas[y][x].ch = ch;
            this.canvas[y][x].attr = attr;
        }
    }
    this.cursor.x = 0;
    this.cursor.y = 0;
    this.viewOffset.x = 0;
    this.viewOffset.y = 0;
    this.focus = 'canvas';
    this._dirty = false;
    this._drawAll();
    return true;
};

ResourceEditor.prototype._loadOwnAvatar = function () {
    if (typeof user === 'undefined' || !user || !user.number) {
        this._updateStatus('Avatar load unavailable for this session.', 'error');
        return false;
    }
    var lib = this._getAvatarLib();
    if (!lib) {
        this._updateStatus('avatar_lib.js unavailable; cannot load avatar.', 'error');
        return false;
    }
    var avatar = null;
    try {
        avatar = lib.read(user.number, user.alias, null, user.number);
    } catch (_eRead) {
        avatar = null;
    }
    if (!avatar || avatar.disabled || !avatar.data) {
        this._applyBinaryToCanvas('', AVATAR_COLS, AVATAR_ROWS);
        this.resourcePath = null;
        this._updateStatus('No saved avatar found. Editing blank ' + AVATAR_COLS + 'x' + AVATAR_ROWS + '.', 'warn');
        return false;
    }
    var raw = '';
    try { raw = base64_decode(avatar.data); } catch (_eDecode) { raw = ''; }
    this._applyBinaryToCanvas(raw, AVATAR_COLS, AVATAR_ROWS);
    this.resourcePath = null;
    this._updateStatus('Loaded your avatar. Press Ctrl+S to save changes.');
    return true;
};

ResourceEditor.prototype._saveAvatar = function () {
    if (typeof user === 'undefined' || !user || !user.number) {
        this._updateStatus('Avatar save unavailable for this session.', 'error');
        return false;
    }
    if (this.docCols !== AVATAR_COLS || this.docRows !== AVATAR_ROWS) {
        this._updateStatus('Avatar must be ' + AVATAR_COLS + 'x' + AVATAR_ROWS + '. Use Ctrl+R and choose avatar.', 'error');
        return false;
    }
    var lib = this._getAvatarLib();
    if (!lib) {
        this._updateStatus('avatar_lib.js unavailable; cannot save avatar.', 'error');
        return false;
    }
    var raw = '';
    for (var y = 0; y < AVATAR_ROWS; y++) {
        for (var x = 0; x < AVATAR_COLS; x++) {
            var cell = (this.canvas[y] && this.canvas[y][x]) ? this.canvas[y][x] : null;
            var ch = cell && cell.ch ? cell.ch : ' ';
            var attr = (cell && typeof cell.attr === 'number') ? (cell.attr & 0xFF) : (this.brushAttr & 0xFF);
            raw += cp437Char(cp437Code(ch));
            raw += cp437Char(attr);
        }
    }
    var data = '';
    try { data = base64_encode(raw); } catch (_eEncode) { data = ''; }
    if (!data) {
        this._updateStatus('Unable to encode avatar data.', 'error');
        return false;
    }
    var ok = false;
    try { ok = lib.update_localuser(user.number, data) === true; } catch (_eWrite) { ok = false; }
    if (!ok) {
        this._updateStatus('Avatar save failed.', 'error');
        return false;
    }
    this._dirty = false;
    this.resourcePath = null;
    this._drawHeader();
    this._updateStatus('Avatar saved.');
    return true;
};

ResourceEditor.prototype._buildBitmapMessage = function () {
    var width = this.docCols;
    var height = this.docRows;
    if (width < 1 || height < 1) {
        this._updateStatus('Canvas is empty.', 'error');
        return null;
    }
    if (height > 255) {
        this._updateStatus('Chat bitmap max height is 255 rows.', 'error');
        return null;
    }
    var total = width * height;
    if (total > 20000) {
        this._updateStatus('Canvas too large for chat publish (max 20,000 cells).', 'error');
        return null;
    }

    var packed = new Uint8Array(1 + (total * 3));
    packed[0] = height & 0xFF;
    var fgBase = 1;
    var bgBase = fgBase + total;
    var chBase = bgBase + total;
    var idx = 0;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var cell = (this.canvas[y] && this.canvas[y][x]) ? this.canvas[y][x] : null;
            var attr = (cell && typeof cell.attr === 'number') ? (cell.attr & 0xFF) : (this.brushAttr & 0xFF);
            var ch = cell && cell.ch ? cell.ch : ' ';
            packed[fgBase + idx] = cgaToXterm(attr & 0x0F) & 0xFF;
            packed[bgBase + idx] = cgaToXterm((attr >> 4) & 0x0F) & 0xFF;
            packed[chBase + idx] = cp437Code(ch) & 0xFF;
            idx++;
        }
    }

    var compressed = zlibStoreCompress(packed);
    var hex = bytesToHex(compressed);
    var fromName = 'Anonymous';
    try {
        if (typeof user !== 'undefined' && user && user.alias) fromName = String(user.alias);
    } catch (_eAlias) { }
    fromName = fromName.replace(/[|\[\]]+/g, '').substr(0, 64);
    if (!fromName.length) fromName = 'Anonymous';
    return '[BITMAP|' + width + '|' + height + '|' + fromName + '|' + hex + ']';
};

ResourceEditor.prototype._publishToChat = function () {
    if (!this.shell || !this.shell.jsonchat || !this.shell.jsonchat.client) {
        this._updateStatus('Chat backend unavailable.', 'error');
        return false;
    }
    var client = this.shell.jsonchat.client;
    if (typeof client.write !== 'function' || typeof client.push !== 'function') {
        this._updateStatus('Chat publish is not supported by this client.', 'error');
        return false;
    }
    var payload = this._buildBitmapMessage();
    if (!payload) return false;

    var channel = 'main';
    var chat = this.shell.chat || null;
    if (chat && typeof chat.currentChannel === 'string' && chat.currentChannel.length && chat.currentChannel.charAt(0) !== '@') {
        channel = chat.currentChannel;
    }
    if (this.shell.jsonchat.channels && !this.shell.jsonchat.channels[String(channel).toUpperCase()]) {
        channel = 'main';
    }

    var ownAvatar = null;
    if (chat && typeof chat._getOwnAvatarData === 'function') {
        try { ownAvatar = chat._getOwnAvatarData(); } catch (_eAvatar) { ownAvatar = null; }
    }
    var nick = (typeof user !== 'undefined' && user && user.alias)
        ? { name: user.alias, host: system.name, ip: user.ip_address, qwkid: system.qwk_id, avatar: ownAvatar }
        : { name: 'You', host: (system && system.name) ? system.name : '', qwkid: (system && system.qwk_id) ? system.qwk_id : '', avatar: ownAvatar };
    var message = {
        nick: nick,
        str: payload,
        time: (new Date()).getTime()
    };

    try {
        client.write('chat', 'channels.' + channel + '.messages', message, 2);
        client.push('chat', 'channels.' + channel + '.history', message, 2);
        var chan = (this.shell.jsonchat.channels && channel) ? this.shell.jsonchat.channels[String(channel).toUpperCase()] : null;
        if (chan && chan.messages && typeof chan.messages.push === 'function') chan.messages.push(message);
        this._updateStatus('Published bitmap to #' + channel + ' (' + this.docCols + 'x' + this.docRows + ').');
        return true;
    } catch (e) {
        this._updateStatus('Chat publish failed: ' + e, 'error');
        return false;
    }
};

ResourceEditor.prototype._clampViewOffset = function () {
    if (!this.viewOffset) this.viewOffset = { x: 0, y: 0 };
    var maxX = Math.max(0, this.docCols - this.cols);
    var maxY = Math.max(0, this.docRows - this.rows);
    if (this.viewOffset.x < 0) this.viewOffset.x = 0;
    if (this.viewOffset.y < 0) this.viewOffset.y = 0;
    if (this.viewOffset.x > maxX) this.viewOffset.x = maxX;
    if (this.viewOffset.y > maxY) this.viewOffset.y = maxY;
};

ResourceEditor.prototype._ensureCursorVisible = function () {
    var oldX = this.viewOffset ? this.viewOffset.x : 0;
    var oldY = this.viewOffset ? this.viewOffset.y : 0;
    this._clampViewOffset();
    if (this.cursor.x < this.viewOffset.x) this.viewOffset.x = this.cursor.x;
    if (this.cursor.y < this.viewOffset.y) this.viewOffset.y = this.cursor.y;
    if (this.cursor.x >= this.viewOffset.x + this.cols) this.viewOffset.x = this.cursor.x - this.cols + 1;
    if (this.cursor.y >= this.viewOffset.y + this.rows) this.viewOffset.y = this.cursor.y - this.rows + 1;
    this._clampViewOffset();
    return oldX !== this.viewOffset.x || oldY !== this.viewOffset.y;
};

ResourceEditor.prototype._resizeDocument = function (cols, rows, messagePrefix) {
    cols = parseInt(cols, 10);
    rows = parseInt(rows, 10);
    if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) {
        this._updateStatus('Invalid canvas size.', 'error');
        return false;
    }
    if (cols > 500 || rows > 500) {
        this._updateStatus('Canvas size too large (max 500x500).', 'error');
        return false;
    }
    var old = this.canvas || [];
    var next = [];
    for (var y = 0; y < rows; y++) {
        var row = [];
        for (var x = 0; x < cols; x++) {
            var cell = (old[y] && old[y][x]) ? old[y][x] : null;
            if (!cell) row.push({ ch: ' ', attr: this.brushAttr });
            else row.push({ ch: cell.ch || ' ', attr: (typeof cell.attr === 'number') ? cell.attr : this.brushAttr });
        }
        next.push(row);
    }
    this.canvas = next;
    this.docCols = cols;
    this.docRows = rows;
    if (this.cursor.x >= this.docCols) this.cursor.x = this.docCols - 1;
    if (this.cursor.y >= this.docRows) this.cursor.y = this.docRows - 1;
    if (this.cursor.x < 0) this.cursor.x = 0;
    if (this.cursor.y < 0) this.cursor.y = 0;
    this._ensureCursorVisible();
    this._dirty = true;
    this._drawAll();
    var prefix = messagePrefix ? (messagePrefix + ' ') : '';
    this._updateStatus(prefix + 'Canvas size set to ' + this.docCols + 'x' + this.docRows + '.');
    return true;
};

ResourceEditor.prototype._parseCanvasSizeInput = function (raw) {
    var text = trimText(raw).toLowerCase();
    if (!text.length) return null;
    if (text === 'avatar' || text === 'av') return { cols: AVATAR_COLS, rows: AVATAR_ROWS, label: 'Avatar preset' };
    if (text === 'icon' || text === 'gateway' || text === 'gateway_icon') return { cols: 12, rows: 6, label: 'Icon preset' };
    if (text === 'bbs' || text === 'screen' || text === 'bbs_screen') return { cols: 80, rows: 24, label: 'BBS preset' };
    var match = text.match(/^(\d+)\s*[x,]\s*(\d+)$/i);
    if (!match) return null;
    return { cols: parseInt(match[1], 10), rows: parseInt(match[2], 10), label: '' };
};

ResourceEditor.prototype._promptCanvasSize = function () {
    var self = this;
    var def = this.docCols + 'x' + this.docRows;
    this._sizePrompt = new Modal({
        parentFrame: this.parentFrame,
        title: 'Canvas Size',
        type: 'prompt',
        message: 'Enter WxH or preset: avatar, icon, bbs',
        defaultValue: def,
        okLabel: 'Apply',
        cancelLabel: 'Cancel',
        onSubmit: function (value) {
            self._sizePrompt = null;
            var parsed = self._parseCanvasSizeInput(value);
            if (!parsed) {
                self._updateStatus('Invalid size. Use WxH, avatar, icon, or bbs.', 'error');
                return;
            }
            self._resizeDocument(parsed.cols, parsed.rows, parsed.label);
        },
        onCancel: function () {
            self._sizePrompt = null;
            self._updateStatus('Canvas size unchanged.', 'warn');
        },
        onClose: function () {
            self._sizePrompt = null;
            self._redrawAfterModalClose();
        }
    });
};

ResourceEditor.prototype._redrawAfterModalClose = function () {
    if (!this.running) return;
    this._ensureFrames();
    this._drawAll();
};

ResourceEditor.prototype._buildGlyphRows = function () {
    var rows = [];
    var codeRows = [
        [219, 178, 177, 176, 220, 223, 221, 222, 254, 249, 250],
        [218, 196, 191, 179, 192, 217, 195, 180, 193, 194, 197],
        [201, 205, 187, 186, 200, 188, 204, 185, 202, 203, 206],
        [207, 208, 209, 210, 211, 212, 213, 214, 215, 216],
        [240, 241, 242, 243, 244, 245, 246, 247, 248, 251]
    ];
    for (var i = 0; i < codeRows.length; i++) {
        var rowCodes = codeRows[i];
        var out = [];
        for (var j = 0; j < rowCodes.length; j++) out.push(cp437Char(rowCodes[j]));
        rows.push(out);
    }
    rows.push('0123456789'.split(''));
    rows.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
    rows.push('abcdefghijklmnopqrstuvwxyz'.split(''));
    return rows;
};

ResourceEditor.prototype._buildPalette = function () {
    var data = [];
    var fgDefault = 0;
    var fgColors = [
        { label: 'BLK', color: BLACK },
        { label: 'BLU', color: BLUE },
        { label: 'GRN', color: GREEN },
        { label: 'CYN', color: CYAN },
        { label: 'RED', color: RED },
        { label: 'MAG', color: MAGENTA },
        { label: 'BRN', color: BROWN },
        { label: 'LGY', color: LIGHTGRAY },
        { label: 'DKG', color: DARKGRAY },
        { label: 'LBL', color: LIGHTBLUE },
        { label: 'LGN', color: LIGHTGREEN },
        { label: 'LCY', color: LIGHTCYAN },
        { label: 'LRD', color: LIGHTRED },
        { label: 'LMG', color: LIGHTMAGENTA },
        { label: 'YLW', color: YELLOW },
        { label: 'WHT', color: WHITE }
    ];
    for (var i = 0; i < fgColors.length; i++) {
        if (fgColors[i].label === 'LGY') fgDefault = data.length;
        data.push({ label: fgColors[i].label, attr: BG_BLACK | fgColors[i].color, kind: 'fg', displayAttr: BG_BLACK | fgColors[i].color });
    }
    var bgCombos = [
        { label: 'BgK', bg: BG_BLACK },
        { label: 'BgB', bg: BG_BLUE },
        { label: 'BgG', bg: BG_GREEN },
        { label: 'BgC', bg: BG_CYAN },
        { label: 'BgR', bg: BG_RED },
        { label: 'BgM', bg: BG_MAGENTA },
        { label: 'BgN', bg: BG_BROWN },
        { label: 'BgL', bg: BG_LIGHTGRAY }
    ];
    var bgDefault = -1;
    for (var j = 0; j < bgCombos.length; j++) {
        if (bgDefault === -1) bgDefault = data.length;
        data.push({ label: bgCombos[j].label, attr: bgCombos[j].bg | WHITE, kind: 'bg', displayAttr: bgCombos[j].bg | WHITE });
    }
    if (bgDefault === -1) bgDefault = data.length - 1;
    return { entries: data, defaultFG: fgDefault, defaultBG: bgDefault };
};

ResourceEditor.prototype._applyBrushAttributes = function () {
    if (!this.palette || !this.palette.length) {
        this.brushAttr = BG_BLACK | LIGHTGRAY;
        return;
    }
    if (this._foregroundIndex < 0 || this._foregroundIndex >= this.palette.length || this.palette[this._foregroundIndex].kind !== 'fg') {
        for (var i = 0; i < this.palette.length; i++) {
            if (this.palette[i].kind === 'fg') { this._foregroundIndex = i; break; }
        }
        if (this._foregroundIndex < 0 || this._foregroundIndex >= this.palette.length) this._foregroundIndex = 0;
    }
    if (this._backgroundIndex < 0 || this._backgroundIndex >= this.palette.length || this.palette[this._backgroundIndex].kind !== 'bg') {
        for (var j = 0; j < this.palette.length; j++) {
            if (this.palette[j].kind === 'bg') { this._backgroundIndex = j; break; }
        }
        if (this._backgroundIndex < 0 || this._backgroundIndex >= this.palette.length) this._backgroundIndex = this._foregroundIndex;
    }
    var fgEntry = this.palette[this._foregroundIndex] || { attr: BG_BLACK | LIGHTGRAY };
    var bgEntry = this.palette[this._backgroundIndex] || { attr: BG_BLACK | BLACK };
    var fg = fgEntry.attr & 0x0F;
    var bg = bgEntry.attr & 0x70;
    var blink = bgEntry.attr & 0x80;
    this.brushAttr = bg | fg | blink;
};

ResourceEditor.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.focus = 'canvas';
    this._activeProfile();
    this._ensureFrames();
    this._clearHotspots();
    this._drawAll();
    if (this.resourcePath) this._loadResource(this.resourcePath);
    else if (this.profile === RESOURCE_EDITOR_PROFILES.avatar) this._loadOwnAvatar();
    else this._updateStatus('New canvas (' + this.profileConfig.label + '). Click to paint, Ctrl+R size, Ctrl+Y publish, Ctrl+T keyboard mode.');
};

ResourceEditor.prototype._ensureFrames = function () {
    var host = this.hostFrame || this.parentFrame;
    if (!host) return;

    var headerHeight = 1;
    var statusHeight = 1;
    var paletteCellWidth = 5;
    var paletteCols = Math.max(1, Math.floor(host.width / paletteCellWidth));
    if (paletteCols > this.palette.length) paletteCols = this.palette.length;
    var paletteRowCount = Math.max(1, Math.ceil(this.palette.length / Math.max(1, paletteCols)));
    var paletteHeight = paletteRowCount * 2;
    var glyphHeight = Math.min(this.glyphRows.length, 8);
    if (glyphHeight < 1) glyphHeight = 1;

    var availableHeight = host.height - (headerHeight + paletteHeight + glyphHeight + statusHeight);
    if (availableHeight < 6) {
        var deficit = 6 - availableHeight;
        var reducibleGlyph = Math.min(deficit, Math.max(0, glyphHeight - 2));
        glyphHeight -= reducibleGlyph;
        availableHeight += reducibleGlyph;
        if (availableHeight < 6) {
            var neededCols = Math.min(this.palette.length, paletteCols + 1);
            while (availableHeight < 6 && neededCols <= this.palette.length) {
                paletteCols = neededCols;
                paletteRowCount = Math.max(1, Math.ceil(this.palette.length / Math.max(1, paletteCols)));
                paletteHeight = paletteRowCount * 2;
                availableHeight = host.height - (headerHeight + paletteHeight + glyphHeight + statusHeight);
                neededCols++;
            }
        }
    }
    if (availableHeight < 3) availableHeight = 3;
    if (paletteCols > this.palette.length) paletteCols = Math.max(1, this.palette.length);
    paletteRowCount = Math.max(1, Math.ceil(this.palette.length / Math.max(1, paletteCols)));
    paletteHeight = paletteRowCount * 2;
    availableHeight = host.height - (headerHeight + paletteHeight + glyphHeight + statusHeight);
    if (availableHeight < 3) availableHeight = 3;
    this.rows = availableHeight;
    this.cols = host.width;
    this._paletteLayout = {
        cols: paletteCols || 1,
        rows: paletteRowCount,
        cellWidth: Math.max(3, Math.floor(host.width / Math.max(1, paletteCols)))
    };

    if (!this.headerFrame) {
        this.headerFrame = new Frame(1, 1, host.width, headerHeight, this.paletteAttr('HEADER'), host);
        this.headerFrame.open();
        this.registerFrame(this.headerFrame);
    } else {
        this.headerFrame.resize(host.width, headerHeight);
        this.headerFrame.move(1, 1);
    }

    if (!this.canvasFrame) {
        this.canvasFrame = new Frame(1, headerHeight + 1, host.width, availableHeight, this.paletteAttr('CANVAS_BG'), host);
        this.canvasFrame.open();
        this.canvasFrame.checkbounds = false;
        this.registerFrame(this.canvasFrame);
    } else {
        this.canvasFrame.resize(host.width, availableHeight);
        this.canvasFrame.move(1, headerHeight + 1);
    }

    var paletteTop = headerHeight + availableHeight + 1;
    if (!this.paletteFrame) {
        this.paletteFrame = new Frame(1, paletteTop, host.width, paletteHeight, this.paletteAttr('CANVAS_BG'), host);
        this.paletteFrame.open();
        this.registerFrame(this.paletteFrame);
    } else {
        this.paletteFrame.resize(host.width, paletteHeight);
        this.paletteFrame.move(1, paletteTop);
    }
    var glyphTop = paletteTop + paletteHeight;
    if (!this.glyphFrame) {
        this.glyphFrame = new Frame(1, glyphTop, host.width, glyphHeight, this.paletteAttr('CANVAS_BG'), host);
        this.glyphFrame.open();
        this.registerFrame(this.glyphFrame);
    } else {
        this.glyphFrame.resize(host.width, glyphHeight);
        this.glyphFrame.move(1, glyphTop);
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(1, host.height, host.width, statusHeight, this.paletteAttr('STATUS'), host);
        this.statusFrame.open();
        this.registerFrame(this.statusFrame);
    } else {
        this.statusFrame.resize(host.width, statusHeight);
        this.statusFrame.move(1, host.height);
    }

    if (this.canvas.length !== this.docRows || (this.canvas[0] && this.canvas[0].length !== this.docCols)) {
        this._initCanvas();
    }
    if (this.cursor.x >= this.docCols) this.cursor.x = Math.max(0, this.docCols - 1);
    if (this.cursor.y >= this.docRows) this.cursor.y = Math.max(0, this.docRows - 1);
    if (this.cursor.x < 0) this.cursor.x = 0;
    if (this.cursor.y < 0) this.cursor.y = 0;
    this._ensureCursorVisible();
};

ResourceEditor.prototype._drawAll = function () {
    this._drawHeader();
    this._drawCanvas();
    this._drawPalette();
    this._drawGlyphs();
    this._updateStatus();
};

ResourceEditor.prototype._drawHeader = function () {
    if (!this.headerFrame) return;
    try {
        var profile = this._activeProfile();
        this.headerFrame.clear(this.paletteAttr('HEADER'));
        this.headerFrame.gotoxy(1, 1);
        var title = 'Resource Editor [' + (profile && profile.label ? profile.label : 'Generic') + '] ' + this.docCols + 'x' + this.docRows;
        if (this.resourcePath) title += ' - ' + file_getname(this.resourcePath);
        this.headerFrame.putmsg(title.substr(0, this.headerFrame.width));
        this.headerFrame.cycle();
    } catch (_e) { }
};

ResourceEditor.prototype._highlightAttr = function (attr) {
    if (typeof attr !== 'number') return attr;
    return attr | 0x80;
};

ResourceEditor.prototype._drawCanvas = function () {
    if (!this.canvasFrame) return;
    this._clearHotspots();
    for (var y = 0; y < this.rows; y++) {
        for (var x = 0; x < this.cols; x++) {
            var docX = x + this.viewOffset.x;
            var docY = y + this.viewOffset.y;
            this.canvasFrame.gotoxy(x + 1, y + 1);
            var cell = (docY >= 0 && docY < this.docRows && docX >= 0 && docX < this.docCols && this.canvas[docY] && this.canvas[docY][docX])
                ? this.canvas[docY][docX]
                : { ch: ' ', attr: this.brushAttr };
            var attr = (typeof cell.attr === 'number') ? cell.attr : this.brushAttr;
            var drawAttr = (this.cursor.x === docX && this.cursor.y === docY) ? this._highlightAttr(attr) : attr;
            this.canvasFrame.attr = drawAttr;
            this.canvasFrame.putmsg(cell.ch || ' ');
            if (this.inputMode === 'mouse' && docX < this.docCols && docY < this.docRows) {
                this._registerHotspot(this.canvasFrame.x + x, this.canvasFrame.x + x, this.canvasFrame.y + y, this.canvasFrame.y + y, this._makeCellHandler(docX, docY));
            }
        }
    }
    try { this.canvasFrame.cycle(); } catch (_eCycle) { }
};

ResourceEditor.prototype._drawCanvasCell = function (x, y) {
    if (!this.canvasFrame) return;
    if (x < 0 || y < 0 || y >= this.docRows || x >= this.docCols) return;
    var vx = x - this.viewOffset.x;
    var vy = y - this.viewOffset.y;
    if (vx < 0 || vy < 0 || vx >= this.cols || vy >= this.rows) return;
    this.canvasFrame.gotoxy(vx + 1, vy + 1);
    var row = this.canvas[y] || [];
    var cell = row[x] || { ch: ' ', attr: this.brushAttr };
    var attr = (typeof cell.attr === 'number') ? cell.attr : this.brushAttr;
    var drawAttr = (this.cursor.x === x && this.cursor.y === y) ? this._highlightAttr(attr) : attr;
    this.canvasFrame.attr = drawAttr;
    this.canvasFrame.putmsg(cell.ch || ' ');
    try { this.canvasFrame.cycle(); } catch (_eCycle) { }
};

ResourceEditor.prototype._drawPalette = function () {
    if (!this.paletteFrame) return;
    try { this.paletteFrame.clear(this.paletteAttr('CANVAS_BG')); } catch (_eClear) { }
    var entries = this.palette;
    if (!entries || !entries.length) return;
    var minCellWidth = 3;
    var maxCols = Math.max(1, Math.floor(this.paletteFrame.width / minCellWidth));
    var cols = Math.min(maxCols, entries.length);
    if (cols < 1) cols = 1;
    var rows = Math.max(1, Math.ceil(entries.length / cols));
    var baseWidth = Math.max(minCellWidth, Math.floor(this.paletteFrame.width / cols));
    while (baseWidth * cols > this.paletteFrame.width && baseWidth > minCellWidth) baseWidth--;
    var remainder = Math.max(0, this.paletteFrame.width - (baseWidth * cols));
    var colWidths = [];
    var colStarts = [];
    var offset = 1;
    for (var c = 0; c < cols; c++) {
        var w = baseWidth + (c < remainder ? 1 : 0);
        colWidths.push(w);
        colStarts.push(offset);
        offset += w;
    }
    var cellHeight = 2;
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var col = i % cols;
        var row = Math.floor(i / cols);
        var width = colWidths[col];
        var startX = colStarts[col];
        var startY = row * cellHeight + 1;
        if (startY + cellHeight - 1 > this.paletteFrame.height) break;
        if (startX > this.paletteFrame.width) continue;
        var drawWidth = Math.min(width, this.paletteFrame.width - startX + 1);
        if (drawWidth <= 0) continue;
        var isFG = (i === this._foregroundIndex);
        var isBG = (i === this._backgroundIndex);
        var isCursor = (this.focus === 'palette' && i === this.paletteIndex);
        var labelAttr;
        if (isCursor) labelAttr = this.paletteAttr('PALETTE_CURSOR');
        else if (isFG) labelAttr = this.paletteAttr('PALETTE_ACTIVE');
        else if (isBG) labelAttr = this.paletteAttr('PALETTE_BG_ACTIVE');
        else labelAttr = this.paletteAttr('PALETTE_LABEL');

        var blockAttr = entry.displayAttr || entry.attr;
        var blockChar = (entry.kind === 'bg') ? ' ' : cp437Char(219);
        this.paletteFrame.gotoxy(startX, startY);
        if (drawWidth >= 3) {
            this.paletteFrame.attr = labelAttr;
            this.paletteFrame.putmsg('[');
            var fillWidth = drawWidth - 2;
            if (fillWidth > 0) {
                this.paletteFrame.attr = blockAttr;
                this.paletteFrame.putmsg(new Array(fillWidth + 1).join(blockChar));
            }
            this.paletteFrame.attr = labelAttr;
            this.paletteFrame.putmsg(']');
        } else {
            this.paletteFrame.attr = blockAttr;
            this.paletteFrame.putmsg(new Array(drawWidth + 1).join(blockChar).substr(0, drawWidth));
        }
        this.paletteFrame.gotoxy(startX, startY + 1);
        var label = (entry.label || '').substr(0, drawWidth);
        while (label.length < drawWidth) label += ' ';
        this.paletteFrame.attr = labelAttr;
        this.paletteFrame.putmsg(label);
        if (this.inputMode === 'mouse') {
            var minX = this.paletteFrame.x + startX - 1;
            var maxX = Math.min(this.paletteFrame.x + this.paletteFrame.width - 1, minX + drawWidth - 1);
            var minY = this.paletteFrame.y + startY - 1;
            var maxY = Math.min(this.paletteFrame.y + this.paletteFrame.height - 1, minY + cellHeight - 1);
            this._registerHotspot(minX, maxX, minY, maxY, this._makePaletteHandler(i));
        }
    }
    this._paletteLayout = { cols: cols, rows: rows, cellWidth: baseWidth };
    try { this.paletteFrame.cycle(); } catch (_eCycle) { }
};

ResourceEditor.prototype._drawGlyphs = function () {
    if (!this.glyphFrame) return;
    try { this.glyphFrame.clear(this.paletteAttr('CANVAS_BG')); } catch (_eClear) { }
    var maxRows = Math.min(this.glyphRows.length, this.glyphFrame.height);
    for (var y = 0; y < maxRows; y++) {
        var row = this.glyphRows[y];
        if (!row) continue;
        var rowLength = row.length;
        if (!rowLength) continue;
        var baseWidth = Math.max(3, Math.floor(this.glyphFrame.width / rowLength));
        while (baseWidth * rowLength > this.glyphFrame.width && baseWidth > 3) baseWidth--;
        var remainder = Math.max(0, this.glyphFrame.width - baseWidth * rowLength);
        var offsetX = 1;
        for (var x = 0; x < rowLength; x++) {
            var width = baseWidth + (x < remainder ? 1 : 0);
            var available = this.glyphFrame.width - offsetX + 1;
            if (available <= 0) break;
            var drawWidth = Math.min(width, available);
            if (drawWidth < 3) drawWidth = Math.min(available, 3);
            if (drawWidth < 3) break;
            var ch = row[x];
            var isSelected = (this.glyphSelection.row === y && this.glyphSelection.col === x);
            var bracketAttr = (x % 2 === 0) ? this.paletteAttr('GLYPH_BRACKET_LIGHT') : this.paletteAttr('GLYPH_BRACKET_DARK');
            var charAttr = this.paletteAttr('GLYPH_NORMAL');
            if (isSelected) {
                bracketAttr = this.paletteAttr('GLYPH_SELECTED_BRACKET');
                charAttr = this.paletteAttr('GLYPH_SELECTED_CHAR');
            }
            this.glyphFrame.gotoxy(offsetX, y + 1);
            this.glyphFrame.attr = bracketAttr;
            this.glyphFrame.putmsg('[');
            var innerWidth = drawWidth - 2;
            if (innerWidth < 1) innerWidth = 1;
            var leftPad = Math.floor((innerWidth - 1) / 2);
            if (leftPad < 0) leftPad = 0;
            var rightPad = innerWidth - leftPad - 1;
            if (rightPad < 0) rightPad = 0;
            if (leftPad > 0) { this.glyphFrame.attr = charAttr; this.glyphFrame.putmsg(new Array(leftPad + 1).join(' ')); }
            this.glyphFrame.attr = charAttr; this.glyphFrame.putmsg(ch);
            if (rightPad > 0) { this.glyphFrame.attr = charAttr; this.glyphFrame.putmsg(new Array(rightPad + 1).join(' ')); }
            this.glyphFrame.attr = bracketAttr; this.glyphFrame.putmsg(']');
            var consumed = 2 + leftPad + rightPad + 1;
            if (consumed < drawWidth) {
                this.glyphFrame.attr = this.paletteAttr('CANVAS_BG');
                this.glyphFrame.putmsg(new Array(drawWidth - consumed + 1).join(' '));
            }
            if (this.inputMode === 'mouse') {
                var minX = this.glyphFrame.x + offsetX - 1;
                var maxX = Math.min(this.glyphFrame.x + this.glyphFrame.width - 1, minX + drawWidth - 1);
                var minY = this.glyphFrame.y + y;
                var maxY = minY;
                this._registerHotspot(minX, maxX, minY, maxY, this._makeGlyphHandler(y, x));
            }
            offsetX += drawWidth;
        }
    }
    try { this.glyphFrame.cycle(); } catch (_eCycle) { }
};

ResourceEditor.prototype._updateStatus = function (text, type) {
    if (!this.statusFrame) return;
    var attrKey = 'STATUS';
    if (type === 'warn') attrKey = 'STATUS_WARN';
    else if (type === 'error') attrKey = 'STATUS_ERROR';
    var attr = this.paletteAttr(attrKey);
    var glyphLabel = this.currentGlyph === ' ' ? 'space' : this.currentGlyph;
    var fgEntry = this.palette[this._foregroundIndex] || { label: '??' };
    var bgEntry = this.palette[this._backgroundIndex] || { label: '??' };
    var viewPos = (this.viewOffset.x + 1) + ',' + (this.viewOffset.y + 1);
    var base = 'Char: ' + glyphLabel +
        '  FG: ' + (fgEntry.label || '??') +
        '  BG: ' + (bgEntry.label || '??') +
        '  Size: ' + this.docCols + 'x' + this.docRows +
        '  View: ' + viewPos +
        '  Mode: ' + this.inputMode.toUpperCase() +
        '  [Ctrl+S save | Ctrl+O open | Ctrl+N clear | Ctrl+R size | Ctrl+Y publish | Ctrl+T toggle]';
    var message = text ? (text + '  ') : '';
    var line = (message + base).substr(0, this.statusFrame.width);
    try {
        this.statusFrame.clear(attr);
        this.statusFrame.gotoxy(1, 1);
        this.statusFrame.putmsg(line);
        this.statusFrame.cycle();
    } catch (_e) { }
};

ResourceEditor.prototype._makeCellHandler = function (x, y) {
    var self = this;
    return function () {
        self.cursor.x = x;
        self.cursor.y = y;
        self._paintAt(x, y, self.currentGlyph, self.brushAttr);
        self.focus = 'canvas';
        self._updateStatus();
    };
};

ResourceEditor.prototype._makePaletteHandler = function (index) {
    var self = this;
    return function () {
        self.focus = 'palette';
        self._selectPaletteIndex(index, { silent: false });
    };
};

ResourceEditor.prototype._selectPaletteIndex = function (index, opts) {
    if (!this.palette || !this.palette.length) return;
    if (index < 0) index = 0;
    if (index >= this.palette.length) index = this.palette.length - 1;
    this.paletteIndex = index;
    var entry = this.palette[index];
    if (!entry) return;
    if (entry.kind === 'fg') this._foregroundIndex = index;
    else if (entry.kind === 'bg') this._backgroundIndex = index;
    this._applyBrushAttributes();
    this._drawPalette();
    this._drawCanvasCell(this.cursor.x, this.cursor.y);
    if (opts && opts.silent) this._updateStatus();
    else {
        var kindLabel = entry.kind === 'bg' ? 'Background' : 'Foreground';
        this._updateStatus(kindLabel + ' set to ' + entry.label);
    }
};

ResourceEditor.prototype._makeGlyphHandler = function (row, col) {
    var self = this;
    return function () {
        self.focus = 'glyph';
        self._setGlyphSelection(row, col);
    };
};

ResourceEditor.prototype._paintAt = function (x, y, ch, attr) {
    if (x < 0 || y < 0 || y >= this.docRows || x >= this.docCols) return;
    if (!this.canvas[y]) this.canvas[y] = [];
    if (!this.canvas[y][x]) this.canvas[y][x] = { ch: ' ', attr: this.brushAttr };
    var cell = this.canvas[y][x];
    cell.ch = ch || ' ';
    cell.attr = (typeof attr === 'number') ? attr : this.brushAttr;
    this._dirty = true;
    this.focus = 'canvas';
    this._drawCanvasCell(x, y);
};

ResourceEditor.prototype._moveCursor = function (dx, dy) {
    var nx = this.cursor.x + dx;
    var ny = this.cursor.y + dy;
    if (nx < 0) nx = 0;
    if (ny < 0) ny = 0;
    if (ny >= this.docRows) ny = this.docRows - 1;
    if (nx >= this.docCols) nx = this.docCols - 1;
    var oldX = this.cursor.x;
    var oldY = this.cursor.y;
    if (nx === oldX && ny === oldY) return;
    this.cursor.x = nx;
    this.cursor.y = ny;
    this.focus = 'canvas';
    if (this._ensureCursorVisible()) this._drawCanvas();
    else {
        this._drawCanvasCell(oldX, oldY);
        this._drawCanvasCell(nx, ny);
    }
    this._updateStatus();
};

ResourceEditor.prototype._setGlyphSelection = function (row, col) {
    if (row < 0) row = 0;
    if (row >= this.glyphRows.length) row = this.glyphRows.length - 1;
    var rowData = this.glyphRows[row] || [];
    if (col < 0) col = 0;
    if (col >= rowData.length) col = rowData.length - 1;
    this.glyphSelection = { row: row, col: col };
    this.focus = 'glyph';
    if (rowData.length) this.currentGlyph = rowData[col];
    this._drawGlyphs();
    this._drawCanvasCell(this.cursor.x, this.cursor.y);
    this._updateStatus('Glyph set to "' + (this.currentGlyph === ' ' ? 'space' : this.currentGlyph) + '"');
};

ResourceEditor.prototype._syncGlyphSelectionFromChar = function () {
    var ch = this.currentGlyph;
    for (var y = 0; y < this.glyphRows.length; y++) {
        var row = this.glyphRows[y];
        if (!row) continue;
        for (var x = 0; x < row.length; x++) {
            if (row[x] === ch) {
                this.glyphSelection = { row: y, col: x };
                return;
            }
        }
    }
    this.glyphSelection = { row: 0, col: 0 };
    this.currentGlyph = this.glyphRows[0][0];
};

ResourceEditor.prototype._moveGlyphSelection = function (dx, dy) {
    var maxRows = this.glyphRows.length;
    if (this.glyphFrame && this.glyphFrame.height) {
        maxRows = Math.min(maxRows, this.glyphFrame.height);
    }
    var row = this.glyphSelection.row + dy;
    if (row < 0) row = 0;
    if (row >= maxRows) row = maxRows - 1;
    var rowData = this.glyphRows[row] || [];
    if (!rowData.length) return;
    var col = this.glyphSelection.col + dx;
    if (col < 0) col = 0;
    if (col >= rowData.length) col = rowData.length - 1;
    this._setGlyphSelection(row, col);
};

ResourceEditor.prototype._toggleInputMode = function () {
    this.inputMode = (this.inputMode === 'mouse') ? 'keyboard' : 'mouse';
    this.focus = 'canvas';
    if (this.inputMode === 'keyboard') this._clearHotspots();
    this._drawAll();
    var note = (this.inputMode === 'mouse')
        ? 'Mouse mode: click canvas/palette/glyphs.'
        : 'Keyboard mode: hotspots disabled.';
    this._updateStatus(note);
};

ResourceEditor.prototype._movePaletteSelection = function (dx, dy) {
    if (!this.palette || !this.palette.length) return;
    var layout = this._paletteLayout || { cols: this.palette.length };
    var cols = Math.max(1, layout.cols || this.palette.length);
    var rows = Math.max(1, Math.ceil(this.palette.length / cols));
    var index = this.paletteIndex;
    if (index < 0) index = 0;
    var col = index % cols;
    var row = Math.floor(index / cols);
    col += dx;
    row += dy;
    if (col < 0) col = 0;
    if (col >= cols) col = cols - 1;
    if (row < 0) row = 0;
    if (row >= rows) row = rows - 1;
    var newIndex = row * cols + col;
    if (newIndex >= this.palette.length) newIndex = this.palette.length - 1;
    while (newIndex >= this.palette.length && col > 0) {
        col -= 1;
        newIndex = row * cols + col;
    }
    if (newIndex < 0) newIndex = 0;
    this.focus = 'palette';
    this._selectPaletteIndex(newIndex, { silent: true });
};

ResourceEditor.prototype._handleKey = function (key) {
    if (!key && key !== 0) return;
    if (this.inputMode === 'mouse' && this._processHotspotKey(key)) return;
    if (this.focus === 'glyph') {
        switch (key) {
            case KEY_UP: this._moveGlyphSelection(0, -1); return;
            case KEY_DOWN: this._moveGlyphSelection(0, 1); return;
            case KEY_LEFT: this._moveGlyphSelection(-1, 0); return;
            case KEY_RIGHT: this._moveGlyphSelection(1, 0); return;
            case '\x0D':
            case ' ':
                this.focus = 'canvas';
                this._updateStatus();
                return;
        }
    }
    if (this.focus === 'palette') {
        switch (key) {
            case KEY_LEFT: this._movePaletteSelection(-1, 0); return;
            case KEY_RIGHT: this._movePaletteSelection(1, 0); return;
            case KEY_UP: this._movePaletteSelection(0, -1); return;
            case KEY_DOWN: this._movePaletteSelection(0, 1); return;
            case '\x0D':
            case ' ':
                this.focus = 'canvas';
                this._updateStatus();
                return;
        }
    }
    switch (key) {
        case KEY_UP: this._moveCursor(0, -1); return;
        case KEY_DOWN: this._moveCursor(0, 1); return;
        case KEY_LEFT: this._moveCursor(-1, 0); return;
        case KEY_RIGHT: this._moveCursor(1, 0); return;
        case KEY_HOME: this.cursor.x = 0; this.focus = 'canvas'; this._ensureCursorVisible(); this._drawCanvas(); this._updateStatus(); return;
        case KEY_END: this.cursor.x = Math.max(0, this.docCols - 1); this.focus = 'canvas'; this._ensureCursorVisible(); this._drawCanvas(); this._updateStatus(); return;
        case KEY_PGUP: this.cursor.y = 0; this.focus = 'canvas'; this._ensureCursorVisible(); this._drawCanvas(); this._updateStatus(); return;
        case KEY_PGDN: this.cursor.y = Math.max(0, this.docRows - 1); this.focus = 'canvas'; this._ensureCursorVisible(); this._drawCanvas(); this._updateStatus(); return;
        case '\x0E': // Ctrl+N
            this._initCanvas();
            this.cursor.x = 0;
            this.cursor.y = 0;
            this.viewOffset.x = 0;
            this.viewOffset.y = 0;
            this.focus = 'canvas';
            this._drawAll();
            this._updateStatus('Canvas cleared.');
            this._dirty = false;
            this.resourcePath = null;
            return;
        case '\x12': // Ctrl+R canvas size / preset
            this._promptCanvasSize();
            return;
        case '\x19': // Ctrl+Y publish bitmap to chat
            this._publishToChat();
            return;
        case '\x13': // Ctrl+S
            this._saveResource();
            return;
        case '\x0F': // Ctrl+O
            this._loadResourcePrompt();
            return;
        case '\x14': // Ctrl+T toggle input mode
            this._toggleInputMode();
            return;
        case '\x1B': // ESC
            this.exit();
            return;
    }
    if (typeof key === 'string' && key.length === 1) {
        if (this.inputMode === 'mouse') return;
        if (key >= ' ' && key <= '~') {
            this.currentGlyph = key;
            this._syncGlyphSelectionFromChar();
            this._drawGlyphs();
            this._paintAt(this.cursor.x, this.cursor.y, key, this.brushAttr);
            this._moveCursor(1, 0);
            this._updateStatus();
        } else if (key === '\b') {
            this._paintAt(this.cursor.x, this.cursor.y, ' ', this.brushAttr);
            this._moveCursor(-1, 0);
            this._updateStatus();
        }
    }
};

ResourceEditor.prototype._saveResource = function () {
    var self = this;
    var profile = this._activeProfile();
    if (profile && profile.key === RESOURCE_EDITOR_PROFILES.avatar) {
        this._saveAvatar();
        return;
    }
    if (this.resourcePath) {
        this._writeResource(this.resourcePath);
        return;
    }
    this._savePrompt = new Modal({
        parentFrame: this.parentFrame,
        title: 'Save Resource',
        type: 'prompt',
        message: 'Save ' + (profile && profile.label ? profile.label : 'resource') + ' as (' + (profile.allowExt || ['.ans', '.bin']).join(', ') + ')',
        defaultValue: self._defaultPathInput(),
        okLabel: 'Save',
        cancelLabel: 'Cancel',
        onSubmit: function (value) {
            self._savePrompt = null;
            if (!value) { self._updateStatus('Save cancelled.', 'warn'); return; }
            var path = self._resolvePath(value, 'save');
            if (!path) return;
            self._writeResource(path);
        },
        onCancel: function () {
            self._savePrompt = null;
            self._updateStatus('Save cancelled.', 'warn');
        },
        onClose: function () {
            self._savePrompt = null;
            self._redrawAfterModalClose();
        }
    });
};

ResourceEditor.prototype._writeResource = function (path, opts) {
    opts = opts || {};
    if (!path) return;
    path = this._resolvePath(path, 'save');
    if (!path) return;
    if (file_exists(path) && !opts.overwrite) {
        var self = this;
        this._confirmOverwrite(path, function () {
            self._writeResource(path, { overwrite: true });
        });
        return;
    }
    var ext = file_getext(path).toLowerCase();
    var success = false;
    if (!this._isAllowedExt(ext)) {
        this._updateStatus('Unsupported file extension "' + ext + '" for this profile.', 'error');
        return;
    }
    if (ext === '.bin') success = this._writeBin(path);
    else success = this._writeAnsi(path);
    if (success) {
        this.resourcePath = path;
        this._dirty = false;
        this._drawHeader();
        this._updateStatus('Saved ' + file_getname(path));
    }
};

ResourceEditor.prototype._confirmOverwrite = function (path, onOverwrite) {
    if (!path) return;
    if (this._overwritePrompt && this._overwritePrompt.close) {
        try { this._overwritePrompt.close(); } catch (_eClosePrompt) { }
    }
    var self = this;
    this._overwritePrompt = new Modal({
        parentFrame: this.parentFrame,
        title: 'Overwrite Resource',
        type: 'confirm',
        message: 'Overwrite existing file "' + file_getname(path) + '"?',
        okLabel: 'Overwrite',
        cancelLabel: 'Cancel',
        onSubmit: function () {
            self._overwritePrompt = null;
            if (typeof onOverwrite === 'function') onOverwrite();
        },
        onCancel: function () {
            self._overwritePrompt = null;
            self._updateStatus('Save cancelled.', 'warn');
        },
        onClose: function () {
            self._overwritePrompt = null;
            self._redrawAfterModalClose();
        }
    });
};

ResourceEditor.prototype._writeBin = function (path) {
    var file = new File(path);
    if (!file.open('wb')) {
        this._updateStatus('Unable to write ' + path, 'error');
        return false;
    }
    for (var y = 0; y < this.canvas.length; y++) {
        var row = this.canvas[y];
        for (var x = 0; x < row.length; x++) {
            var cell = row[x];
            file.write(cell.ch || ' ');
            file.writeBin(((typeof cell.attr === 'number') ? cell.attr : this.brushAttr) & 0xFF, 1);
        }
    }
    file.close();
    return true;
};

ResourceEditor.prototype._writeAnsi = function (path) {
    var file = new File(path);
    if (!file.open('wb')) {
        this._updateStatus('Unable to write ' + path, 'error');
        return false;
    }
    for (var y = 0; y < this.canvas.length; y++) {
        var row = this.canvas[y];
        var line = '';
        var prevAttr = null;
        for (var x = 0; x < row.length; x++) {
            var cell = row[x];
            var attr = (typeof cell.attr === 'number') ? cell.attr : this.brushAttr;
            if (prevAttr === null || attr !== prevAttr) line += this._ansiForAttr(attr);
            line += cell.ch || ' ';
            prevAttr = attr;
        }
        line += '\x1b[0m';
        file.write(line + '\r\n');
    }
    file.close();
    return true;
};

ResourceEditor.prototype._ansiForAttr = function (attr) {
    var parts = ['0'];
    var fgIndex = attr & 0x07;
    var bright = (attr & 0x08) !== 0;
    var bgIndex = (attr >> 4) & 0x07;
    var blink = (attr & 0x80) !== 0;
    if (bright) parts.push('1');
    if (blink) parts.push('5');
    parts.push(String(ANSI_FG_CODES[fgIndex] || 37));
    parts.push(String(ANSI_BG_CODES[bgIndex] || 40));
    return '\x1b[' + parts.join(';') + 'm';
};

ResourceEditor.prototype._loadResourcePrompt = function () {
    var self = this;
    var profile = this._activeProfile();
    if (profile && profile.key === RESOURCE_EDITOR_PROFILES.avatar) {
        this._loadOwnAvatar();
        return;
    }
    this._loadPrompt = new Modal({
        parentFrame: this.parentFrame,
        title: 'Open Resource',
        type: 'prompt',
        message: 'Open ' + (profile && profile.label ? profile.label : 'resource') + ' (' + (profile.allowExt || ['.ans', '.bin']).join(', ') + ')',
        defaultValue: this.resourcePath || self._defaultPathInput(),
        okLabel: 'Open',
        cancelLabel: 'Cancel',
        onSubmit: function (value) {
            self._loadPrompt = null;
            if (!value) { self._updateStatus('Open cancelled.', 'warn'); return; }
            var path = self._resolvePath(value, 'open');
            if (!path) return;
            self._loadResource(path);
        },
        onCancel: function () {
            self._loadPrompt = null;
            self._updateStatus('Open cancelled.', 'warn');
        },
        onClose: function () {
            self._loadPrompt = null;
            self._redrawAfterModalClose();
        }
    });
};

ResourceEditor.prototype._loadResource = function (path) {
    if (!path) return;
    path = this._resolvePath(path, 'open');
    if (!path) return;
    if (!file_exists(path)) {
        this._updateStatus('File not found: ' + path, 'error');
        return;
    }
    var ext = file_getext(path).toLowerCase();
    if (!this._isAllowedExt(ext)) {
        this._updateStatus('Unsupported file extension "' + ext + '" for this profile.', 'error');
        return;
    }
    var success = false;
    if (ext === '.bin') success = this._loadBin(path);
    else success = this._loadAnsi(path);
    if (success) {
        this.resourcePath = path;
        this._dirty = false;
        this.cursor.x = 0;
        this.cursor.y = 0;
        this.viewOffset.x = 0;
        this.viewOffset.y = 0;
        this.focus = 'canvas';
        this._drawAll();
        this._updateStatus('Loaded ' + file_getname(path));
    }
};

ResourceEditor.prototype._loadBin = function (path) {
    var file = new File(path);
    if (!file.open('rb')) {
        this._updateStatus('Unable to open ' + path, 'error');
        return false;
    }
    var raw = file.read(file.length);
    file.close();
    if (!raw) raw = '';
    var idx = 0;
    for (var y = 0; y < this.docRows; y++) {
        for (var x = 0; x < this.docCols; x++) {
            if (idx + 1 >= raw.length) {
                this.canvas[y][x].ch = ' ';
                this.canvas[y][x].attr = this.brushAttr;
            } else {
                var ch = raw.charAt(idx++);
                var attrCode = raw.charCodeAt(idx++);
                if (typeof attrCode !== 'number' || isNaN(attrCode)) attrCode = this.brushAttr;
                this.canvas[y][x].ch = ch;
                this.canvas[y][x].attr = attrCode;
            }
        }
    }
    return true;
};

ResourceEditor.prototype._loadAnsi = function (path) {
    if (typeof Frame !== 'function') {
        this._updateStatus('frame.js missing; cannot load ANSI', 'error');
        return false;
    }
    var scratch = new Frame(1, 1, this.docCols, this.docRows, DEFAULT_ATTR, this.canvasFrame);
    scratch.checkbounds = false;
    scratch.v_scroll = false;
    scratch.h_scroll = false;
    var ok = true;
    try { ok = scratch.load(path, this.docCols, this.docRows); } catch (_e) { ok = false; }
    if (!ok) {
        try { scratch.delete(); } catch (_eDel) { }
        this._updateStatus('Unable to load ANSI.', 'error');
        return false;
    }
    var height = Math.min(this.docRows, scratch.data_height || this.docRows);
    var width = Math.min(this.docCols, scratch.data_width || this.docCols);
    for (var y = 0; y < this.docRows; y++) {
        for (var x = 0; x < this.docCols; x++) {
            if (y < height && x < width) {
                var cell = scratch.getData(x, y) || {};
                this.canvas[y][x].ch = (typeof cell.ch === 'string' && cell.ch.length) ? cell.ch : ' ';
                this.canvas[y][x].attr = (typeof cell.attr === 'number') ? cell.attr : this.brushAttr;
            } else {
                this.canvas[y][x].ch = ' ';
                this.canvas[y][x].attr = this.brushAttr;
            }
        }
    }
    try { scratch.delete(); } catch (_eDel2) { }
    return true;
};

ResourceEditor.prototype._resolvePath = function (input, mode) {
    if (!input) return null;
    var profile = this._activeProfile();
    var trimmed = trimText(input);
    if (!trimmed.length) return null;
    var candidate = '';
    var isAbsolute = (trimmed.indexOf(':') !== -1 || trimmed.charAt(0) === '/' || trimmed.charAt(0) === '\\');
    if (isAbsolute) {
        candidate = normalizePath(trimmed);
    } else {
        var base = profile && profile.defaultRoot ? profile.defaultRoot : './';
        candidate = normalizePath(ensureTrailingSlash(base) + trimmed);
    }

    var ext = String(file_getext(candidate) || '').toLowerCase();
    if (!ext.length && mode === 'save') {
        var defaultExt = (profile && profile.defaultExt) ? profile.defaultExt : '.ans';
        candidate += defaultExt;
        ext = defaultExt;
    }
    if (!ext.length) {
        this._updateStatus('File extension required for this profile.', 'error');
        return null;
    }
    if (!this._isAllowedExt(ext)) {
        this._updateStatus('Extension "' + ext + '" is not allowed for ' + (profile && profile.label ? profile.label : 'this profile') + '.', 'error');
        return null;
    }
    if (!this._isPathAllowed(candidate)) {
        this._updateStatus('Path not allowed for this profile. Allowed roots: ' + this._profileRootsLabel(), 'error');
        return null;
    }
    if (!this._isProfilePathAllowed(candidate, profile)) return null;
    return candidate;
};

ResourceEditor.prototype._clearHotspots = function () {
    this._hotspotHandlers = {};
    this._hotspotCounter = 0;
    this._hotspotBuffer = '';
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_e) { }
    }
};

ResourceEditor.prototype._registerHotspot = function (minX, maxX, minY, maxY, handler) {
    if (this.inputMode !== 'mouse') return;
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    if (minX > maxX || minY > maxY) return;
    var token = this._nextHotspotToken();
    this._hotspotHandlers[token] = handler;
    for (var y = minY; y <= maxY; y++) {
        try { console.add_hotspot(token, false, minX, maxX, y); } catch (_e) { }
    }
};

ResourceEditor.prototype._nextHotspotToken = function () {
    var token = '~' + this._hotspotCounter.toString(36) + '~';
    this._hotspotCounter += 1;
    return token;
};

ResourceEditor.prototype._processHotspotKey = function (key) {
    if (!key || this.inputMode !== 'mouse') return false;
    this._hotspotBuffer += key;
    if (this._hotspotBuffer.length > 16) this._hotspotBuffer = this._hotspotBuffer.substr(this._hotspotBuffer.length - 16);
    for (var token in this._hotspotHandlers) {
        if (this._hotspotHandlers.hasOwnProperty(token) && this._hotspotBuffer.indexOf(token) !== -1) {
            var handler = this._hotspotHandlers[token];
            this._hotspotBuffer = '';
            if (typeof handler === 'function') handler();
            return true;
        }
    }
    return false;
};

ResourceEditor.prototype._cleanup = function () {
    this._clearHotspots();
    if (this._savePrompt && this._savePrompt.close) {
        try { this._savePrompt.close(); } catch (_eSP) { }
        this._savePrompt = null;
    }
    if (this._loadPrompt && this._loadPrompt.close) {
        try { this._loadPrompt.close(); } catch (_eLP) { }
        this._loadPrompt = null;
    }
    if (this._overwritePrompt && this._overwritePrompt.close) {
        try { this._overwritePrompt.close(); } catch (_eOW) { }
        this._overwritePrompt = null;
    }
    if (this._sizePrompt && this._sizePrompt.close) {
        try { this._sizePrompt.close(); } catch (_eSZ) { }
        this._sizePrompt = null;
    }
    this.headerFrame = null;
    this.canvasFrame = null;
    this.paletteFrame = null;
    this.glyphFrame = null;
    this.statusFrame = null;
};

registerModuleExports({ ResourceEditor: ResourceEditor });
