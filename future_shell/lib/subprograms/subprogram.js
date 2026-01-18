"use strict";

load('sbbsdefs.js');
if (typeof lazyLoadModule !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (e) { }
}
if (typeof ThemeRegistry === 'undefined') {
    try {
        var _themeModule = load('future_shell/lib/theme/palette.js');
        if (_themeModule && _themeModule.ThemeRegistry) ThemeRegistry = _themeModule.ThemeRegistry;
    } catch (e) { }
}

var FG_CTRL_MAP = {};
FG_CTRL_MAP[BLACK & 0x0F] = '\x01k';
FG_CTRL_MAP[BLUE & 0x0F] = '\x01b';
FG_CTRL_MAP[GREEN & 0x0F] = '\x01g';
FG_CTRL_MAP[CYAN & 0x0F] = '\x01c';
FG_CTRL_MAP[RED & 0x0F] = '\x01r';
FG_CTRL_MAP[MAGENTA & 0x0F] = '\x01m';
FG_CTRL_MAP[BROWN & 0x0F] = '\x01y';
FG_CTRL_MAP[LIGHTGRAY & 0x0F] = '\x01w';
FG_CTRL_MAP[DARKGRAY & 0x0F] = '\x01h\x01k';
FG_CTRL_MAP[LIGHTBLUE & 0x0F] = '\x01h\x01b';
FG_CTRL_MAP[LIGHTGREEN & 0x0F] = '\x01h\x01g';
FG_CTRL_MAP[LIGHTCYAN & 0x0F] = '\x01h\x01c';
FG_CTRL_MAP[LIGHTRED & 0x0F] = '\x01h\x01r';
FG_CTRL_MAP[LIGHTMAGENTA & 0x0F] = '\x01h\x01m';
FG_CTRL_MAP[YELLOW & 0x0F] = '\x01h\x01y';
FG_CTRL_MAP[WHITE & 0x0F] = '\x01h\x01w';

function _colorCtrlFromEntry(entry) {
    if (entry === null || entry === undefined) return '';
    var fg = null;
    if (typeof entry === 'number') fg = entry & 0x0F;
    else if (typeof entry === 'object') {
        if (typeof entry.FG === 'number') fg = entry.FG & 0x0F;
        else if (typeof entry.COLOR === 'number') fg = entry.COLOR & 0x0F;
    }
    if (fg === null) return '';
    return FG_CTRL_MAP.hasOwnProperty(fg) ? FG_CTRL_MAP[fg] : '';
}

// Provide sensible defaults when sbbsdefs.js hasn't populated key constants yet.
if (typeof KEY_UP === 'undefined') var KEY_UP = 0x4800;
if (typeof KEY_DOWN === 'undefined') var KEY_DOWN = 0x5000;
if (typeof KEY_PGUP === 'undefined') var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined') var KEY_PGDN = 0x5100;
if (typeof KEY_PAGEUP === 'undefined') var KEY_PAGEUP = 0x4900;
if (typeof KEY_PAGEDN === 'undefined') var KEY_PAGEDN = 0x5100;
if (typeof KEY_HOME === 'undefined') var KEY_HOME = 0x4700;
if (typeof KEY_END === 'undefined') var KEY_END = 0x4F00;
if (typeof KEY_LEFT === 'undefined') var KEY_LEFT = 0x4B00;
if (typeof KEY_RIGHT === 'undefined') var KEY_RIGHT = 0x4D00;
if (typeof KEY_ENTER === 'undefined') var KEY_ENTER = '\r';
if (typeof KEY_TAB === 'undefined') var KEY_TAB = '\t';
function Subprogram(opts) {
    this.__bg_frame = null;
    opts = opts || {};
    this.name = opts.name || 'subprogram';
    this.parentFrame = opts.parentFrame || null;
    this._ownsParentFrame = !this.parentFrame;
    this.hostFrame = null;
    this.running = false;
    this._done = null;
    // Optional reference to the parent shell (IconShell) so subprograms can access shared services
    this.shell = opts.shell;
    this._myFrames = [];
    this.timer = opts.timer || (this.shell && this.shell.timer) || null;
    this.blockScreenSaver = false;
    this.id = opts.id || this.name || 'subprogram';
    this.themeNamespace = opts.themeNamespace || this.id;
    this._framesInitialized = false;
}

Subprogram.registerColors = function (namespace, defaults) {
    if (!namespace) {
        throw new Error('Subprogram.registerColors requires a namespace');
    }
    var base = defaults || {};
    if (typeof ThemeRegistry === 'undefined') return base;
    ThemeRegistry.registerPalette(namespace, base);
    return ThemeRegistry.get(namespace) || base;
};

Subprogram.getColors = function (namespace) {
    if (typeof ThemeRegistry === 'undefined') return {};
    if (!namespace) return {};
    return ThemeRegistry.get(namespace) || {};
};

Subprogram.prototype.resolveColor = function (namespace, key, fallback) {
    if (arguments.length === 1) {
        key = namespace;
        namespace = null;
        fallback = undefined;
    } else if (arguments.length === 2) {
        fallback = key;
        key = namespace;
        namespace = null;
    }
    var ns = namespace || this.themeNamespace || this.id;
    if (!ns || typeof ThemeRegistry === 'undefined') return fallback;
    return ThemeRegistry.get(ns, key, fallback);
};

Subprogram.prototype.colorPalette = function (namespace) {
    var ns = namespace;
    if (arguments.length === 0 || namespace === null) ns = this.themeNamespace || this.id;
    if (!ns || typeof ThemeRegistry === 'undefined') return {};
    return ThemeRegistry.get(ns) || {};
};

Subprogram.prototype.paletteAttr = function (namespace, key, fallback) {
    if (arguments.length === 1) {
        key = namespace;
        namespace = null;
        fallback = undefined;
    } else if (arguments.length === 2) {
        fallback = key;
        key = namespace;
        namespace = null;
    }
    var entry = this.resolveColor(namespace, key, null);
    if (!entry) return (typeof fallback === 'number') ? fallback : (fallback || 0);
    if (typeof entry === 'number') return entry;
    var bg = entry.BG || 0;
    var fg = entry.FG || entry.COLOR || 0;
    return bg | fg;
};

Subprogram.prototype.colorReset = function () {
    return '\x01n';
};

Subprogram.prototype.colorCode = function (key) {
    return _colorCtrlFromEntry(this.resolveColor(key));
};

Subprogram.prototype.colorCodeNamespace = function (namespace, key) {
    return _colorCtrlFromEntry(this.resolveColor(namespace, key, null));
};

Subprogram.prototype.colorCodeShared = function (key) {
    return _colorCtrlFromEntry(this.resolveColor('shared', key, null));
};

Subprogram.prototype.colorize = function (key, text, opts) {
    return this.colorizeNamespace(this.themeNamespace, key, text, opts);
};

Subprogram.prototype.colorizeNamespace = function (namespace, key, text, opts) {
    var prefix = this.colorCodeNamespace(namespace, key) || '';
    if (!prefix) return text;
    var reset = true;
    if (opts && opts.reset === false) reset = false;
    return prefix + text + (reset ? this.colorReset() : '');
};

Subprogram.prototype.colorizeShared = function (key, text, opts) {
    return this.colorizeNamespace('shared', key, text, opts);
};

Subprogram.prototype.registerColors = function (defaults, namespace) {
    var ns = namespace || this.themeNamespace || this.id;
    if (!ns) throw new Error('registerColors requires a namespace');
    this.themeNamespace = ns;
    return Subprogram.registerColors(ns, defaults || {});
};

Subprogram.prototype.enter = function (done) {
    this._done = (typeof done === 'function') ? done : function () { };
    this.running = true;
    if (!this.parentFrame) {
        this.parentFrame = new Frame(1, 1, console.screen_columns, console.screen_rows, ICSH_ATTR('FRAME_STANDARD'));
        this.parentFrame.open();
        this._ownsParentFrame = true;
    }
    this._ensureHostFrame();
    this.draw();
    if (this._myFrames.length === 0)
        this.registerDefaultFrames();
};

Subprogram.prototype.exit = function () {
    this.running = false;
    this.cleanup();
    if (this._done) this._done();
};

Subprogram.prototype.handleKey = function (key) {
    if (this._handleKey && typeof this._handleKey === 'function') {
        return this._handleKey(key);
    }
    if (key === '\x1B') this.exit();
};

Subprogram.prototype.draw = function () { };
Subprogram.prototype.refresh = function () { this.draw(); };
Subprogram.prototype.cleanup = function () {
    if (this._cleanup && typeof this._cleanup === 'function') {
        this._cleanup();
    }
    if (this.hostFrame) {
        var oldHost = this.hostFrame;
        try { oldHost.close(); } catch (e) { }
        var idx = this._myFrames.indexOf(oldHost);
        if (idx !== -1) this._myFrames.splice(idx, 1);
        this.hostFrame = null;
    }
    this.setBackgroundFrame(null);
    if (this.parentFrame) {
        if (this._ownsParentFrame) {
            try { this.parentFrame.close(); } catch (e) { }
            this.parentFrame = null;
        } else {
            try { this.parentFrame.cycle(); } catch (e) { }
        }
    }
    this.detachShellTimer();
    this._myFrames = [];
};

Subprogram.prototype._teardownHostFrame = function () {
    if (!this.hostFrame) return;
    try { this.hostFrame.close(); } catch (e) { }
    var idx = this._myFrames.indexOf(this.hostFrame);
    if (idx !== -1) this._myFrames.splice(idx, 1);
    this.hostFrame = null;
    this.setBackgroundFrame(null);
};

Subprogram.prototype._releaseFrameRefs = function () {
    for (var key in this) {
        if (!Object.prototype.hasOwnProperty.call(this, key)) continue;
        if (!this[key]) continue;
        if (key === 'parentFrame' || key === 'hostFrame' || key === '__bg_frame' || key === '_myFrames') continue;
        var val = this[key];
        if (val && typeof val === 'object') {
            var isFrameLike = (typeof val.close === 'function' && typeof val.open === 'function' && typeof val.gotoxy === 'function');
            if (isFrameLike) {
                try { val.close(); } catch (e) { }
                this[key] = null;
            }
        }
    }
};

Subprogram.prototype.onShellResize = function (dims) {
    this._releaseFrameRefs();
    this._teardownHostFrame();
    this._myFrames = [];
    if (typeof this.handleResize === 'function') {
        try { this.handleResize(dims); } catch (e) { }
    }
    this._ensureHostFrame();
    if (typeof this.afterResize === 'function') {
        try { this.afterResize(dims); } catch (e) { }
    }
    if (typeof this.refresh === 'function') {
        try { this.refresh(); } catch (e) { }
    } else if (typeof this.draw === 'function') {
        try { this.draw(); } catch (e) { }
    }
    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (e) { }
    }
};

Subprogram.prototype.registerFrame = function (frame) {
    this._myFrames.push(frame);
};

Subprogram.prototype.registerDefaultFrames = function () {
    if (this.outputFrame) this.registerFrame(this.outputFrame);
    if (this.inputFrame) this.registerFrame(this.inputFrame);
}

Subprogram.prototype.closeMyFrames = function () {
    this._myFrames.forEach(function (frame) {
        frame.close();
    });
    this.parentFrame.cycle();
};

Subprogram.prototype.bringFramesToTop = function () {
    log("BRINGING SUBPROGRAM FRAMES TO TOP", this._myFrames.length);
    if (this.refresh) this.refresh();
    this.draw();
    this._myFrames.forEach(function (frame) {
        frame.top();
    });
    // this.draw();
    this.parentFrame.cycle();
};

Subprogram.prototype.sendFramesToBottom = function () {
    this._myFrames.forEach(function (frame) {
        frame.bottom();
    });
    this.parentFrame.cycle();
};

Subprogram.prototype.pauseForReason = function (reason) {
    if (this.hotspots && typeof this.hotspots.deactivate === 'function') {
        try { this.hotspots.deactivate(); } catch (_) { }
    }
};

Subprogram.prototype.resumeForReason = function (reason) {
    this.restoreHotspots();
};

Subprogram.prototype.restoreHotspots = function () {
    if (this.hotspots && typeof this.hotspots.activate === 'function') {
        try { this.hotspots.activate(); } catch (_) { }
        return true;
    }
    return false;
};

Subprogram.prototype.setParentFrame = function (f) {
    this.parentFrame = f;
    this._ownsParentFrame = !this.parentFrame;
    return this;
};

Subprogram.prototype.attachShellTimer = function (timer) {
    this.timer = timer || null;
};

Subprogram.prototype.detachShellTimer = function () {
    this.timer = null;
};

Subprogram.prototype.setBackgroundFrame = function (frame) {
    this.__bg_frame = frame;
    return frame;
};

Subprogram.prototype.backgroundFrame = function () {
    return this.__bg_frame || false;
};

Subprogram.prototype._ensureHostFrame = function () {
    if (this.hostFrame && this.hostFrame.is_open) return this.hostFrame;
    if (!this.parentFrame) return null;
    var pf = this.parentFrame;
    var width = Math.max(1, pf.width || console.screen_columns || 80);
    var height = Math.max(1, pf.height || console.screen_rows || 24);
    var attr;
    if (typeof pf.attr === 'number') attr = pf.attr;
    else if (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.VIEW && typeof ICSH_VALS.VIEW.BG === 'number' && typeof ICSH_VALS.VIEW.FG === 'number') attr = (ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG);
    else if (typeof BG_BLACK !== 'undefined' && typeof LIGHTGRAY !== 'undefined') attr = BG_BLACK | LIGHTGRAY;
    else attr = 0;
    try {
        this.hostFrame = new Frame(1, 1, width, height, attr, pf);
        this.hostFrame.open();
        this.hostFrame.cycle();
        this.setBackgroundFrame(this.hostFrame);
        if (this._myFrames.indexOf(this.hostFrame) === -1) this._myFrames.push(this.hostFrame);
        try {
            log((this.name || 'subprogram') + ' _ensureHostFrame created', JSON.stringify({
                width: this.hostFrame.width,
                height: this.hostFrame.height,
                attr: this.hostFrame.attr
            }));
        } catch (_logCreatedErr) { }
    } catch (e) {
        log('Subprogram ' + (this.name || 'unknown') + ' failed to create hostFrame: ' + e);
        this.hostFrame = null;
    }
    log("CREATED HOST FRAME BOARD" + this.id);
    return this.hostFrame;
};

Subprogram.prototype._generateHotkeyLine = function (hotkeys) {
    var text = '';
    var self = this;
    hotkeys.forEach(function (key) {
        var hint = self.colorize('TEXT_HOTKEY', key.val) +
            self.colorize('TEXT_NORMAL', '=') +
            self.colorize('TEXT_BOLD', key.action);
        if (text.length) text += '  ';
        text += hint;
    });
    return text;
}

// Unified toast helper available to every subprogram.
// Usage: this._showToast({ message:'Hello', timeout:5000, position:'bottom-right' })
Subprogram.prototype._showToast = function (opts) {
    log("Subprogram._showToast called with " + JSON.stringify(opts));
    opts = opts || {};
    try {
        if (this.shell && typeof this.shell.showToast === 'function') {
            // Ensure parentFrame defaults to shell root if not provided
            if (!opts.parentFrame && this.shell.root) opts.parentFrame = this.shell.root;
            mswait(500);
            log("waiting half a second to show toast");
            return this.shell.showToast(opts);
        }
        // Fallback: console output if no shell toast system
        if (opts.message && typeof console !== 'undefined' && console.putmsg) {
            console.putmsg('\r\n' + opts.message + '\r\n');
        }
    } catch (e) { /* swallow */ }
    return null;
};

function extend(Sub, Super) {
    Sub.prototype = Object.create(Super.prototype);
    Sub.prototype.constructor = Sub;
}
