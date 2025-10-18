// Migration tracker (completed): legacy bespoke overlays replaced with unified Modal.
//   - message_boards.js: read + transition notices now spinner Modals (legacy frames removed)
//   - users.js: user detail view now uses type:'custom' Modal (multi-frame layout removed)
//   - newsreader.js: loading overlay uses spinner Modal
// Extended types supported: 'spinner', 'progress', 'custom'.
// Hot reload support: ALWAYS redefine Modal when this file is load()'d.
// Previous guard removed to align with other libs. We close any existing modals to avoid stale prototype issues.
// Debug switched off by default; can be re-enabled at runtime if needed.
var ICSH_MODAL_DEBUG = true;
try { if (typeof log === 'function') log('[MODAL LOAD] redefining Modal v20251008-8'); } catch (_) { }
// Close lingering old-version modals safely
try {
    if (typeof Modal !== 'undefined' && Modal && Array.isArray(Modal._activeList)) {
        for (var __i = 0; __i < Modal._activeList.length; __i++) {
            var __m = Modal._activeList[__i];
            if (__m && typeof __m.close === 'function') {
                try { __m.close(); } catch (eCloseOld) { }
            }
        }
    }
} catch (_closeErr) { }
try { load('future_shell/lib/util/layout/button.js'); } catch (_btnErr) { }

var BLACK = (typeof BLACK === 'number') ? BLACK : 0;
var WHITE = (typeof WHITE === 'number') ? WHITE : 7;
var LIGHTGRAY = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
var BG_BLACK = (typeof BG_BLACK === 'number') ? BG_BLACK : (BLACK << 4);
var BG_DARKGRAY = (typeof BG_DARKGRAY === 'number') ? BG_DARKGRAY : ((LIGHTGRAY & 0x07) << 4);
try { if (typeof KEY_LEFT === 'undefined') require('sbbsdefs.js', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_UP', 'KEY_DOWN', 'KEY_PGUP', 'KEY_PGDN', 'KEY_HOME', 'KEY_END', 'KEY_DEL', 'KEY_BACKSPACE'); } catch (_r) { }

var ModalThemeRegistry = (function () {
    if (typeof ThemeRegistry !== 'undefined') return ThemeRegistry;
    try {
        var paletteModule = load('future_shell/lib/theme/palette.js');
        if (paletteModule && paletteModule.ThemeRegistry) return paletteModule.ThemeRegistry;
    } catch (_) { }
    return null;
})();

var MODAL_THEME_BASE = 'modal';
var MODAL_THEME_TYPES = ['alert', 'confirm', 'prompt', 'progress', 'spinner', 'custom'];
var modalPaletteRegistered = false;

function makeAttr(bg, fg) {
    return ((bg & 0x07) << 4) | (fg & 0x0F);
}

var DEFAULT_MODAL_ATTR = makeAttr(BLACK, LIGHTGRAY);
var DEFAULT_OVERLAY_ATTR = makeAttr(BLACK, BLACK);

function ensureModalPalette() {
    if (modalPaletteRegistered || !ModalThemeRegistry) return;
    var baseFrame = DEFAULT_MODAL_ATTR;
    var defaults = {
        FRAME: baseFrame,
        CONTENT: baseFrame,
        TITLE: makeAttr(BLACK, WHITE),
        BUTTON: baseFrame,
        BUTTON_FOCUS: makeAttr(BLACK, WHITE),
        BUTTON_DISABLED: baseFrame,
        OVERLAY: DEFAULT_OVERLAY_ATTR
    };
    for (var i = 0; i < MODAL_THEME_TYPES.length; i++) {
        var typeKey = MODAL_THEME_TYPES[i].toUpperCase();
        defaults[typeKey + '.FRAME'] = baseFrame;
        defaults[typeKey + '.CONTENT'] = baseFrame;
        defaults[typeKey + '.TITLE'] = defaults.TITLE;
        defaults[typeKey + '.BUTTON'] = defaults.BUTTON;
        defaults[typeKey + '.BUTTON_FOCUS'] = defaults.BUTTON_FOCUS;
        defaults[typeKey + '.BUTTON_DISABLED'] = defaults.BUTTON_DISABLED;
        defaults[typeKey + '.OVERLAY'] = defaults.OVERLAY;
    }
    try { ModalThemeRegistry.registerPalette(MODAL_THEME_BASE, defaults); } catch (_) { }
    modalPaletteRegistered = true;
}

function pickThemeAttr(modalType, role, explicit, fallback) {
    if (typeof explicit === 'number') return explicit;
    var key = (role || '').toUpperCase();
    if (!key || !ModalThemeRegistry) return fallback;
    if (modalType) {
        var typed = ModalThemeRegistry.get(MODAL_THEME_BASE, modalType.toUpperCase() + '.' + key, null);
        var typedAttr = coerceAttr(typed, null);
        if (typedAttr !== null) return typedAttr;
    }
    var base = ModalThemeRegistry.get(MODAL_THEME_BASE, key, null);
    var baseAttr = coerceAttr(base, null);
    if (baseAttr !== null) return baseAttr;
    return fallback;
}

function coerceAttr(entry, fallback) {
    if (typeof entry === 'number') return entry;
    if (!entry || typeof entry !== 'object') return (typeof fallback === 'number') ? fallback : null;
    var hasBg = Object.prototype.hasOwnProperty.call(entry, 'BG');
    var hasFg = Object.prototype.hasOwnProperty.call(entry, 'FG') || Object.prototype.hasOwnProperty.call(entry, 'COLOR');
    if (!hasBg && !hasFg) return (typeof fallback === 'number') ? fallback : null;
    var bg = entry.BG || 0;
    var fg = entry.FG || entry.COLOR || 0;
    return (bg | fg);
}

function clamp(num, min, max) {
    if (num < min) return min;
    if (num > max) return max;
    return num;
}

function Modal(opts) {
    if (!(this instanceof Modal)) return new Modal(opts);
    opts = opts || {};
    this.options = opts;
    this.type = (opts.type || 'alert').toLowerCase();
    this.title = opts.title || '';
    this.message = opts.message || '';
    // Extended type flags (spinner/progress/custom)
    this._spinnerIdx = 0;
    this._spinnerTimer = null;
    this._progress = (typeof opts.progress === 'number') ? opts.progress : null; // 0..1
    this._progressWidth = (typeof opts.progressWidth === 'number') ? opts.progressWidth : 20;
    this._customRenderer = (typeof opts.render === 'function') ? opts.render : null; // render(frame, modal)
    ensureModalPalette();
    this.overlayEnabled = opts.overlay !== false;
    this.overlayChar = (typeof opts.overlayChar === 'string' && opts.overlayChar.length) ? opts.overlayChar[0] : ' ';
    var frameFallback = DEFAULT_MODAL_ATTR;
    this.attr = pickThemeAttr(this.type, 'FRAME', opts.attr, frameFallback);
    this.contentAttr = pickThemeAttr(this.type, 'CONTENT', opts.contentAttr, this.attr);
    this.titleAttr = pickThemeAttr(this.type, 'TITLE', opts.titleAttr, ((WHITE & 0x0F) | (this.attr & 0x70)));
    this.promptEchoAttr = pickThemeAttr(this.type, 'ECHO', opts.echoAttr, makeAttr((this.contentAttr >> 4) & 0x07, WHITE));
    this.buttonAttr = pickThemeAttr(this.type, 'BUTTON', opts.buttonAttr, this.attr);
    this.buttonFocusAttr = pickThemeAttr(this.type, 'BUTTON_FOCUS', opts.buttonFocusAttr, makeAttr(BLACK, WHITE));
    this.buttonDisabledAttr = pickThemeAttr(this.type, 'BUTTON_DISABLED', opts.buttonDisabledAttr, this.buttonAttr);
    this.buttonMaskAttr = pickThemeAttr(this.type, 'BUTTON_MASK', opts.buttonMaskAttr, makeAttr(BLACK, BLACK));
    this.buttonShadowAttr = pickThemeAttr(this.type, 'BUTTON_SHADOW', opts.buttonShadowAttr, makeAttr(BLACK, BLACK));
    this.cancelButtonAttr = pickThemeAttr(this.type, 'CANCEL_BUTTON', opts.cancelButtonAttr, makeAttr(RED, WHITE));
    this.cancelButtonFocusAttr = pickThemeAttr(this.type, 'CANCEL_BUTTON_FOCUS', opts.cancelButtonFocusAttr, this.cancelButtonAttr);
    this.cancelButtonDisabledAttr = pickThemeAttr(this.type, 'CANCEL_BUTTON_DISABLED', opts.cancelButtonDisabledAttr, this.buttonDisabledAttr);
    this.cancelButtonShadowAttr = pickThemeAttr(this.type, 'CANCEL_BUTTON_SHADOW', opts.cancelButtonShadowAttr, makeAttr(BLUE, BLUE));
    this.overlayAttr = pickThemeAttr(this.type, 'OVERLAY', opts.overlayAttr, DEFAULT_OVERLAY_ATTR);
    this.parentFrame = opts.parentFrame || null;
    this._ownsParent = false;
    this._buttons = [];
    this._buttonDefs = [];
    this._hotkeyMap = {};
    this._focusIndex = -1;
    this._defaultIndex = -1;
    this._cancelIndex = -1;
    this._inputValue = (typeof opts.defaultValue === 'string') ? opts.defaultValue : '';
    this._inputCursor = this._inputValue.length;
    this._inputSecret = !!opts.secret;
    this._inputScroll = 0;
    this._result = undefined;
    this._open = false;
    this._closed = false;
    this._autoCloseTimer = null;
    this._resizeHandler = null;
    this.frame = null;
    // Optional custom key handler (returns true if consumed)
    this.keyHandler = (typeof opts.keyHandler === 'function') ? opts.keyHandler : (typeof opts.onKey === 'function' ? opts.onKey : null);
    this.overlay = null;
    // Passive by default: only capture keys if explicitly requested or if type implies interaction.
    var interactiveType = (this.type === 'prompt' || this.type === 'confirm' || (Array.isArray(opts.buttons) && opts.buttons.length));
    this.captureKeys = (typeof opts.captureKeys === 'boolean') ? opts.captureKeys : interactiveType;

    this._ensureParent();
    this._recomputeGeometry();
    this._buildStructure();
    if (ICSH_MODAL_DEBUG) {
        try {
            if (ModalThemeRegistry) {
                var paletteDump = ModalThemeRegistry.get(MODAL_THEME_BASE);
            }
            var msg = '[MODAL THEME] type=' + this.type
                + ' frame=0x' + (this.attr & 0xFF).toString(16)
                + ' content=0x' + (this.contentAttr & 0xFF).toString(16)
                + ' title=0x' + (this.titleAttr & 0xFF).toString(16)
                + ' button=0x' + (this.buttonAttr & 0xFF).toString(16)
                + ' focus=0x' + (this.buttonFocusAttr & 0xFF).toString(16)
                + ' disabled=0x' + (this.buttonDisabledAttr & 0xFF).toString(16)
                + ' mask=0x' + (this.buttonMaskAttr & 0xFF).toString(16)
                + ' shadow=0x' + (this.buttonShadowAttr & 0xFF).toString(16)
                + ' cancel=0x' + (this.cancelButtonAttr & 0xFF).toString(16)
                + ' cancelFocus=0x' + (this.cancelButtonFocusAttr & 0xFF).toString(16)
                + ' cancelShadow=0x' + (this.cancelButtonShadowAttr & 0xFF).toString(16)
                + ' echo=0x' + (this.promptEchoAttr & 0xFF).toString(16)
                + ' overlay=0x' + (this.overlayAttr & 0xFF).toString(16);
            //log(msg);
        } catch (_) { }
    }
    if (this.type === 'spinner' || this.type === 'progress') this._initActivityType();
    Modal._register(this);
    // Notify external shell (if present) for explicit tracking instead of blind global polling
    try {
        var sh = (typeof global !== 'undefined' && global.__ICSH_ACTIVE_SHELL__) ? global.__ICSH_ACTIVE_SHELL__ : (typeof globalThis !== 'undefined' ? globalThis.__ICSH_ACTIVE_SHELL__ : null);
        if (sh && typeof sh._modalRegistered === 'function') sh._modalRegistered(this);
    } catch (_) { }
    if (opts.autoOpen !== false) this.open();
}

Modal.prototype._ensureParent = function () {
    if (this.parentFrame && typeof this.parentFrame.open === 'function') return;
    this.parentFrame = new Frame(1, 1, console.screen_columns, console.screen_rows, this.attr);
    this.parentFrame.open();
    this._ownsParent = true;
};

Modal.prototype._recomputeGeometry = function () {
    var opts = this.options;
    if (!this.parentFrame || typeof this.parentFrame.width !== 'number' || this.parentFrame.width < 5) {
        // Fallback to full screen safe parent if current invalid
        try { if (ICSH_MODAL_DEBUG) log('[MODAL GEO] invalid parent, using fullscreen fallback'); } catch (_) { }
        this.parentFrame = new Frame(1, 1, console.screen_columns, console.screen_rows, this.attr);
        try { this.parentFrame.open(); } catch (_) { }
        this._ownsParent = true;
    }
    var baseWidth = typeof opts.width === 'number' ? opts.width : this._autoWidth();
    var baseHeight = typeof opts.height === 'number' ? opts.height : this._autoHeight(baseWidth);
    var limitW = Math.max(20, this.parentFrame.width - 2);
    var limitH = Math.max(6, this.parentFrame.height - 2);
    if (baseWidth > limitW) baseWidth = limitW;
    if (baseHeight > limitH) baseHeight = limitH;
    this.width = clamp(baseWidth, 20, limitW);
    this.height = clamp(baseHeight, 6, limitH);
    var coords = Modal.centerRect(this.parentFrame, this.width, this.height);
    // Safety: ensure x,y within parent bounds
    if (coords.x < this.parentFrame.x) coords.x = this.parentFrame.x;
    if (coords.y < this.parentFrame.y) coords.y = this.parentFrame.y;
    var maxX = this.parentFrame.x + this.parentFrame.width - this.width;
    var maxY = this.parentFrame.y + this.parentFrame.height - this.height;
    if (coords.x > maxX) coords.x = Math.max(this.parentFrame.x, maxX);
    if (coords.y > maxY) coords.y = Math.max(this.parentFrame.y, maxY);
    this.x = coords.x;
    this.y = coords.y;
    try { if (ICSH_MODAL_DEBUG) log('[MODAL GEO] parent ' + this.parentFrame.x + ',' + this.parentFrame.y + ' ' + this.parentFrame.width + 'x' + this.parentFrame.height + ' -> modal ' + this.x + ',' + this.y + ' ' + this.width + 'x' + this.height); } catch (_) { }
};

Modal.prototype._autoWidth = function () {
    var inner = this._contentLines(60);
    var maxLine = 0;
    for (var i = 0; i < inner.length; i++) if (inner[i].length > maxLine) maxLine = inner[i].length;
    maxLine = Math.max(maxLine, this.title.length);
    if (this.type === 'prompt') maxLine = Math.max(maxLine, this._inputValue.length + 2);
    var buttonWidth = this._buttonConfig().minWidth;
    maxLine = Math.max(maxLine, buttonWidth);
    return clamp(maxLine + 6, 30, this.parentFrame.width - 2);
};

Modal.prototype._autoHeight = function (width) {
    var lines = this._contentLines(Math.max(10, width - 6));
    var lineCount = lines.length;
    if (this.type === 'prompt') lineCount += 2; // input field and spacer
    var buttonRows = 3; // space + button height
    var titleRows = this.title ? 2 : 1;
    return clamp(titleRows + lineCount + buttonRows + 2, 8, this.parentFrame.height - 2);
};

Modal.prototype._contentLines = function (maxWidth) {
    maxWidth = Math.max(10, maxWidth || 60);
    var text = this.message || '';
    if (this.type === 'spinner') {
        // spinner shows message on one line only; spinner char added in _renderBody
        if (!text.length) text = 'Working...';
    }
    if (this.type === 'progress') {
        if (!text.length) text = 'Working...';
    }
    if (!text.length) return [''];
    var lines = [];
    var raw = ('' + text).split(/\r?\n/);
    for (var i = 0; i < raw.length; i++) {
        lines = lines.concat(this._wrapLine(raw[i], maxWidth));
    }
    if (!lines.length) lines.push('');
    return lines;
};

Modal.prototype._wrapLine = function (line, maxWidth) {
    if (!line || !line.length) return [''];
    if (line.length <= maxWidth) return [line];
    var out = [];
    var words = line.split(/\s+/);
    var current = '';
    for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (!w.length) continue;
        if (!current.length) {
            if (w.length > maxWidth) {
                out.push(w.substr(0, maxWidth));
                words.splice(i + 1, 0, w.substr(maxWidth));
                continue;
            }
            current = w;
            continue;
        }
        if ((current.length + 1 + w.length) <= maxWidth) {
            current += ' ' + w;
        } else {
            out.push(current);
            if (w.length > maxWidth) {
                out.push(w.substr(0, maxWidth));
                words.splice(i + 1, 0, w.substr(maxWidth));
                current = '';
            } else {
                current = w;
            }
        }
    }
    if (current.length) out.push(current);
    return out.length ? out : [''];
};

Modal.prototype._buttonConfig = function () {
    var opts = this.options;
    if (Array.isArray(opts.buttons) && opts.buttons.length) {
        return this._normalizeButtons(opts.buttons);
    }
    switch (this.type) {
        case 'confirm':
            return this._normalizeButtons([
                { label: opts.okLabel || 'Yes', value: true, default: true },
                { label: opts.cancelLabel || 'No', value: false, cancel: true }
            ]);
        case 'prompt':
            return this._normalizeButtons([
                { label: opts.cancelLabel || 'Cancel', value: 'cancel', cancel: true },
                { label: opts.okLabel || 'OK', value: 'submit', default: true }
            ]);
        case 'custom':
            return this._normalizeButtons([]);
        case 'alert':
        default:
            return this._normalizeButtons([
                { label: opts.okLabel || 'OK', value: true, default: true }
            ]);
    }
};

Modal.prototype._normalizeButtons = function (buttons) {
    var defs = [];
    var minWidth = 0;
    var allowDefaultHotKeys = !(this.type === 'prompt' || this.options.disableButtonHotKeys === true);
    for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b || typeof b !== 'object') continue;
        var label = (typeof b.label === 'string' && b.label.length) ? b.label : ('Button' + (i + 1));
        var isCancel = !!b && !!b.cancel;
        var def = {
            label: label,
            value: (b.value !== undefined) ? b.value : label,
            default: !!b.default,
            cancel: !!b.cancel,
            onClick: (typeof b.onClick === 'function') ? b.onClick : null,
            hotKey: (typeof b.hotKey === 'string' && b.hotKey.length) ? b.hotKey.toUpperCase() : null,
            disabled: b.enabled === false ? true : false,
            attr: (typeof b.attr === 'number') ? b.attr : (isCancel ? this.cancelButtonAttr : this.buttonAttr),
            focusAttr: (typeof b.focusAttr === 'number') ? b.focusAttr : (isCancel ? this.cancelButtonFocusAttr : this.buttonFocusAttr),
            disabledAttr: (typeof b.disabledAttr === 'number') ? b.disabledAttr : (isCancel ? this.cancelButtonDisabledAttr : this.buttonDisabledAttr)
        };
        if (def.hotKey === null) {
            if (allowDefaultHotKeys && label.length) def.hotKey = label.charAt(0).toUpperCase();
        }
        defs.push(def);
        var w = Math.max(6, label.length + 4);
        if (w > minWidth) minWidth = w;
        if (def.default && this._defaultIndex === -1) this._defaultIndex = defs.length - 1;
        if (def.cancel && this._cancelIndex === -1) this._cancelIndex = defs.length - 1;
        if (def.hotKey) this._hotkeyMap[def.hotKey] = defs.length - 1;
    }
    if (defs.length && this._defaultIndex === -1) this._defaultIndex = 0;
    if (defs.length && this._cancelIndex === -1) this._cancelIndex = defs.length - 1;
    return { defs: defs, minWidth: minWidth };
};

Modal.prototype._buildStructure = function () {
    var cfg = this._buttonConfig();
    this._buttonDefs = cfg.defs;
    var overlayParent = this.parentFrame;
    if (this.overlayEnabled) {
        this.overlay = new Frame(overlayParent.x, overlayParent.y, overlayParent.width, overlayParent.height, this.overlayAttr, overlayParent.parent || undefined);
        this.overlay.open();
        this.overlay.transparent = false;
        try {
            this.overlay.attr = this.overlayAttr;
            this.overlay.clear(this.overlayAttr);
            if (this.overlayChar !== ' ') {
                for (var y = 1; y <= this.overlay.height; y++) {
                    this.overlay.gotoxy(1, y);
                    this.overlay.putmsg(Array(this.overlay.width + 1).join(this.overlayChar));
                }
            }
            this.overlay.cycle();
        } catch (_) { }
        this.overlay.transparent = false;
    }
    this.frame = new Frame(this.x, this.y, this.width, this.height, this.attr, overlayParent);
    this.frame.open();
    this.frame.transparent = false;
    this._renderChrome();
    this._renderBody();
    this._buildButtons();
    this._attachResizeHandler();
};

Modal.prototype._renderChrome = function () {
    try {
        this.frame.clear(this.attr);
    } catch (_) { }
    if (typeof this.frame.drawBorder === 'function') {
        try {
            var borderTitle = null;
            if (this.title) {
                var titleText = ' ' + this.title + ' ';
                var centeredX = Math.max(2, Math.floor((this.width - titleText.length) / 2) + 1);
                borderTitle = { x: centeredX, y: 1, attr: this.titleAttr, text: titleText };
            }
            this.frame.drawBorder(this.attr, borderTitle);
            return;
        } catch (_) { }
    }
    if (this.title) {
        var titleTextFallback = this.title;
        if (titleTextFallback.length > this.width - 2) titleTextFallback = titleTextFallback.substr(0, this.width - 2);
        var cx = Math.max(2, Math.floor((this.width - titleTextFallback.length) / 2));
        this.frame.gotoxy(cx, 1);
        this.frame.attr = this.titleAttr;
        this.frame.putmsg(titleTextFallback);
    }
};

Modal.prototype._renderBody = function () {
    var innerWidth = this.width - 2;
    var lines = this._contentLines(innerWidth);
    var y = this.title ? 2 : 2;
    var maxY = this.height - 4;
    this.frame.attr = this.contentAttr;
    for (var i = 0; i < lines.length && y <= maxY; i++, y++) {
        var line = lines[i];
        if (line.length > innerWidth) line = line.substr(0, innerWidth);
        var pad = Math.max(0, Math.floor((innerWidth - line.length) / 2));
        this.frame.gotoxy(2, y);
        if (pad > 0) this.frame.putmsg(Array(pad + 1).join(' '));
        this.frame.putmsg(line);
        var trailing = innerWidth - pad - line.length;
        if (trailing > 0) this.frame.putmsg(Array(trailing + 1).join(' '));
    }
    while (y <= maxY) {
        this.frame.gotoxy(2, y);
        this.frame.putmsg(Array(innerWidth + 1).join(' '));
        y++;
    }
    if (this.type === 'prompt') this._renderPromptInput(Math.min(maxY + 1, this.height - 4));
    if (this.type === 'spinner') this._renderSpinner(Math.min(maxY, this.height - 4));
    if (this.type === 'progress') this._renderProgress(Math.min(maxY, this.height - 4));
    if (this.type === 'custom' && this._customRenderer) {
        try { this._customRenderer(this.frame, this); } catch (_) { }
    }
};

Modal.prototype._initActivityType = function () {
    var self = this;
    if (this.type === 'spinner') {
        var seq = this.options.spinnerFrames || ['|', '/', '-', '\\'];
        var interval = this.options.spinnerInterval || 120;
        // this._spinnerTimer = js.setInterval(function () {
        //     self._spinnerIdx = (self._spinnerIdx + 1) % seq.length;
        //     if (self._open) {
        //         self._renderSpinner(self.height - 4);
        //         self._cycleAll();
        //     }
        // }, interval);
    }
};

Modal.prototype._renderSpinner = function (y) {
    if (!this.frame) return;
    var seq = this.options.spinnerFrames || ['|', '/', '-', '\\'];
    var ch = seq[this._spinnerIdx % seq.length];
    var innerWidth = this.width - 2;
    var line = '[' + ch + ']';
    var pad = Math.max(0, Math.floor((innerWidth - line.length) / 2));
    this.frame.gotoxy(2, y);
    this.frame.putmsg(Array(pad + 1).join(' ') + line + Array(innerWidth - pad - line.length + 1).join(' '));
};

Modal.prototype._renderProgress = function (y) {
    if (!this.frame) return;
    var w = Math.max(5, Math.min(this._progressWidth, this.width - 6));
    var p = this._progress; if (p === null || p < 0) p = 0; if (p > 1) p = 1;
    var filled = Math.round(w * p);
    var bar = '[' + Array(filled + 1).join('#') + Array(w - filled + 1).join('-') + ']';
    var innerWidth = this.width - 2;
    var pad = Math.max(0, Math.floor((innerWidth - bar.length) / 2));
    this.frame.gotoxy(2, y);
    this.frame.putmsg(Array(pad + 1).join(' ') + bar + Array(innerWidth - pad - bar.length + 1).join(' '));
};

Modal.prototype.setProgress = function (value) {
    if (this.type !== 'progress') return;
    if (typeof value !== 'number') return;
    this._progress = value;
    this._renderProgress(this.height - 4);
    this._cycleAll();
};

Modal.prototype.setMessage = function (msg) {
    this.message = msg || '';
    this._renderBody();
    this._cycleAll();
};

Modal.prototype._renderPromptInput = function (y) {
    if (!this.frame) return;
    var innerWidth = this.width - 4;
    if (innerWidth < 3) innerWidth = 3;
    var visibleWidth = this._promptVisibleWidth();
    this._ensurePromptCursorVisible();
    var value = this._inputValue || '';
    var display = this._inputSecret ? Array(value.length + 1).join('*') : value;
    var slice = display.substr(this._inputScroll, visibleWidth);
    var echoAttr = (typeof this.promptEchoAttr === 'number') ? this.promptEchoAttr : makeAttr((this.contentAttr >> 4) & 0x07, WHITE);
    var filler = visibleWidth - slice.length;
    if (filler < 0) filler = 0;
    this.frame.attr = this.contentAttr;
    this.frame.gotoxy(3, y);
    this.frame.putmsg('>');
    if (slice.length) {
        this.frame.attr = echoAttr;
        this.frame.putmsg(slice);
    }
    if (filler > 0) {
        this.frame.attr = this.contentAttr;
        this.frame.putmsg(Array(filler + 1).join(' '));
    }
    this.frame.attr = this.contentAttr;
    this.frame.putmsg(' ');
};

Modal.prototype._promptVisibleWidth = function () {
    var innerWidth = this.width - 4;
    if (innerWidth < 3) innerWidth = 3;
    return Math.max(1, innerWidth - 2);
};

Modal.prototype._ensurePromptCursorVisible = function () {
    if (this.type !== 'prompt') return;
    if (typeof this._inputCursor !== 'number') this._inputCursor = 0;
    if (typeof this._inputScroll !== 'number') this._inputScroll = 0;
    if (this._inputCursor < 0) this._inputCursor = 0;
    var len = this._inputValue.length;
    if (this._inputCursor > len) this._inputCursor = len;
    var visible = this._promptVisibleWidth();
    if (this._inputScroll < 0) this._inputScroll = 0;
    var maxScroll = Math.max(0, len - visible);
    if (this._inputScroll > maxScroll) this._inputScroll = maxScroll;
    if (this._inputCursor < this._inputScroll) this._inputScroll = this._inputCursor;
    if (this._inputCursor > this._inputScroll + visible) this._inputScroll = this._inputCursor - visible;
    if (this._inputScroll < 0) this._inputScroll = 0;
    if (this._inputScroll > maxScroll) this._inputScroll = maxScroll;
};

Modal.prototype._refreshPromptInput = function () {
    if (this.type !== 'prompt' || !this.frame) return;
    this._renderPromptInput(this.height - 4);
    this._cycleAll();
};

Modal.prototype._setPromptCursor = function (pos) {
    if (this.type !== 'prompt') return;
    var target = (typeof pos === 'number') ? pos : this._inputCursor;
    this._inputCursor = clamp(target, 0, this._inputValue.length);
    this._refreshPromptInput();
};

Modal.prototype._movePromptCursor = function (delta) {
    if (this.type !== 'prompt') return;
    var target = this._inputCursor + (typeof delta === 'number' ? delta : 0);
    this._setPromptCursor(target);
};

Modal.prototype._insertPromptChar = function (ch) {
    if (this.type !== 'prompt' || typeof ch !== 'string' || !ch.length) return;
    var before = this._inputValue.substr(0, this._inputCursor);
    var after = this._inputValue.substr(this._inputCursor);
    this._inputValue = before + ch + after;
    this._setPromptCursor(this._inputCursor + ch.length);
};

Modal.prototype._backspacePromptChar = function () {
    if (this.type !== 'prompt' || this._inputCursor <= 0) return;
    var newPos = this._inputCursor - 1;
    this._inputValue = this._inputValue.substr(0, newPos) + this._inputValue.substr(this._inputCursor);
    this._setPromptCursor(newPos);
};

Modal.prototype._deletePromptChar = function () {
    if (this.type !== 'prompt' || this._inputCursor >= this._inputValue.length) return;
    this._inputValue = this._inputValue.substr(0, this._inputCursor) + this._inputValue.substr(this._inputCursor + 1);
    this._setPromptCursor(this._inputCursor);
};

Modal.prototype._buildButtons = function () {
    this._destroyButtons();
    if (!this._buttonDefs.length) return;
    // Desired layout: dock buttons to bottom-right with 1 row padding above bottom border
    // Button height is 2; bottom border is last row; place top row of buttons at height-2
    var y = this.height - 2; // second-to-last row
    if (y < 2) y = 2;
    var buttonPalette = this._resolveButtonPalette();
    for (var j = 0; j < this._buttonDefs.length; j++) {
        var def = this._buttonDefs[j];
        var isCancel = !!def.cancel;
        var baseAttr = (typeof def.attr === 'number') ? def.attr : (isCancel ? this.cancelButtonAttr : buttonPalette.attr);
        var focusAttr = (typeof def.focusAttr === 'number') ? def.focusAttr : (isCancel ? this.cancelButtonFocusAttr : buttonPalette.focusAttr);
        var disabledAttr = (typeof def.disabledAttr === 'number') ? def.disabledAttr : (isCancel ? this.cancelButtonDisabledAttr : buttonPalette.disabledAttr);
        // Mask/shadow: cancel button can override shadow color; mask shared
        var maskAttr = (typeof this.buttonMaskAttr === 'number') ? this.buttonMaskAttr : baseAttr;
        // Background colors derived from mask/base (legacy approach) so we don't override intended label fg/bg.
        var backgroundColors = this._deriveButtonColors(maskAttr, baseAttr);
        // Unified shadow: reuse cancel shadow (if defined) for all buttons so both have visible shadow, else fall back to generic or base.
        var shadowAttr = (typeof this.cancelButtonShadowAttr === 'number') ? this.cancelButtonShadowAttr
            : (typeof this.buttonShadowAttr === 'number') ? this.buttonShadowAttr : baseAttr;
        // Shadow colors passed directly; Button will extract nibs. Second entry uses maskAttr background to produce trail.
        var shadowColors = [shadowAttr, maskAttr];
        var width = Math.max(6, (def.label || '').length + 4);
        var btn = new Button({
            parentFrame: this.frame,
            x: 2,
            y: y,
            width: width,
            label: def.label,
            attr: baseAttr,
            focusAttr: focusAttr,
            disabledAttr: disabledAttr,
            backgroundColors: backgroundColors,
            shadowColors: shadowColors,
            enabled: !def.disabled,
            focused: false,
            onClick: this._makeButtonHandler(def)
        });
        btn._layoutWidth = width;
        this._buttons.push(btn);
    }
    this._layoutButtons();
    this._focusIndex = this._resolveInitialFocus();
    this._applyButtonFocus();
    this._registerButtonHotspots();
};

Modal.prototype._registerButtonHotspots = function () {
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    // Do not wipe existing hotspots blindly; modals considered top layer: clear first.
    try { if (typeof console.clear_hotspots === 'function') console.clear_hotspots(); } catch (_) { }
    function absRect(f) {
        // Convert a nested frame's local x/y into absolute screen coordinates (1-based).
        var x = f.x, y = f.y, p = f.parent;
        while (p) { x += (p.x - 1); y += (p.y - 1); p = p.parent; }
        return { x: x, y: y, w: f.width, h: f.height };
    }
    for (var i = 0; i < this._buttons.length; i++) {
        var btn = this._buttons[i];
        if (!btn || !btn.frame) continue;
        var def = this._buttonDefs[i] || {};
        var commands = [];
        if (def.hotKey) commands.push(def.hotKey);
        if (def.default) {
            commands.push('\r');
            commands.push('\n');
        }
        if (def.cancel) {
            commands.push('\x1B');
        }
        if (!commands.length) commands.push(String.fromCharCode(1 + i));
        var stored = btn._absHotspot;
        var r = stored ? { x: stored.x, y: stored.y, w: stored.w, h: stored.h } : absRect(btn.frame);
        var startY = Math.max(1, r.y - 1);
        var secondY = startY + 1;
        if (!this._hotspotMap) this._hotspotMap = {};
        var added = {};
        for (var c = 0; c < commands.length; c++) {
            var raw = commands[c];
            if (raw === null || raw === undefined) continue;
            var cmd = (typeof raw === 'string') ? raw : String(raw);
            if (!cmd || !cmd.length) continue;
            if (added[cmd]) continue;
            added[cmd] = true;
            try { console.add_hotspot(cmd, false, r.x, r.x + r.w - 1, startY); } catch (_) { }
            try { console.add_hotspot(cmd, false, r.x, r.x + r.w - 1, secondY); } catch (_) { }
            this._hotspotMap[cmd] = i;
        }
    }
};

Modal.prototype._resolveButtonPalette = function () {
    var baseAttr = (typeof this.buttonAttr === 'number') ? this.buttonAttr : this.attr;
    var focusAttr = (typeof this.buttonFocusAttr === 'number') ? this.buttonFocusAttr : baseAttr;
    var disabledAttr = (typeof this.buttonDisabledAttr === 'number') ? this.buttonDisabledAttr : baseAttr;
    return {
        attr: baseAttr,
        focusAttr: focusAttr,
        disabledAttr: disabledAttr
    };
};

Modal.prototype._deriveButtonColors = function (attr, fallbackAttr) {
    var base = (typeof attr === 'number') ? attr : fallbackAttr;
    if (typeof base !== 'number') base = fallbackAttr;
    if (typeof base !== 'number') base = makeAttr(BLACK, BLACK);
    return [base, base];
};

Modal.prototype._deriveButtonShadow = function (attr, fallbackAttr) {
    var base = (typeof attr === 'number') ? attr : fallbackAttr;
    if (typeof base !== 'number') base = makeAttr(BLACK, BLACK);
    return [base, base];
};

Modal.prototype._layoutButtons = function () {
    if (!this._buttons || !this._buttons.length) return;
    if (!this.frame) return;
    var gap = 2;
    var rightPad = 2;
    var yLocal = this.frame.height - 2;
    if (yLocal < 2) yLocal = 2;
    var totalWidth = 0;
    for (var i = 0; i < this._buttons.length; i++) {
        var frame = this._buttons[i] && this._buttons[i].frame;
        if (frame && frame.width > 0) totalWidth += frame.width;
        else totalWidth += Math.max(6, (this._buttonDefs[i].label || '').length + 4);
    }
    totalWidth += gap * (this._buttons.length - 1);
    var startLocalX = this.frame.width - rightPad - totalWidth + 1;
    if (startLocalX < 2) startLocalX = 2;
    var cursor = startLocalX;
    for (var j = 0; j < this._buttons.length; j++) {
        var btn = this._buttons[j];
        if (!btn || !btn.frame) continue;
        var btnFrame = btn.frame;
        var width = btn._layoutWidth || btnFrame.width || Math.max(6, (this._buttonDefs[j].label || '').length + 4);
        var absX = this.frame.x + cursor - 1;
        var absY = this.frame.y + yLocal - 1;
        if (typeof btnFrame.moveTo === 'function') {
            try { btnFrame.moveTo(absX, absY); } catch (_) { }
        } else {
            btnFrame.x = cursor;
            btnFrame.y = yLocal;
        }
        btn._absHotspot = { x: absX, y: absY, w: width, h: btnFrame.height || 2 };
        if (typeof btnFrame.top === 'function') {
            try { btnFrame.top(); } catch (_) { }
        }
        cursor += width + gap;
    }
};

Modal.prototype._makeButtonHandler = function (def) {
    var self = this;
    return function () {
        if (typeof def.onClick === 'function') {
            try {
                var maybe = def.onClick.call(self, def.value, self);
                if (maybe === false) return;
            } catch (_) { }
        }
        if (self.type === 'prompt') {
            self._emit('submit');
        } else {
            self._emit(def.value);
        }
    };
};

Modal.prototype._resolveInitialFocus = function () {
    if (this._buttonDefs.length === 0) return -1;
    if (this.options.initialFocus === 'input' && this.type === 'prompt') return -1;
    if (typeof this.options.initialFocus === 'number') {
        var idx = clamp(this.options.initialFocus, 0, this._buttonDefs.length - 1);
        if (!this._buttonDefs[idx].disabled) return idx;
    }
    if (this._defaultIndex !== -1 && !this._buttonDefs[this._defaultIndex].disabled) return this._defaultIndex;
    for (var i = 0; i < this._buttonDefs.length; i++) if (!this._buttonDefs[i].disabled) return i;
    return -1;
};

Modal.prototype._applyButtonFocus = function () {
    for (var i = 0; i < this._buttons.length; i++) {
        this._buttons[i].setFocused(i === this._focusIndex);
    }
};

Modal.prototype._triggerButtonByRole = function (role) {
    var index = -1;
    if (role === 'default') index = this._defaultIndex;
    else if (role === 'cancel') index = this._cancelIndex;
    if (index < 0 || index >= this._buttons.length) return false;
    this._focusIndex = index;
    this._applyButtonFocus();
    if (this._buttons[index] && typeof this._buttons[index].press === 'function') {
        this._buttons[index].press();
        return true;
    }
    return false;
};

Modal.prototype._destroyButtons = function () {
    while (this._buttons.length) {
        var btn = this._buttons.pop();
        try { btn.destroy(); } catch (_) { }
    }
};

Modal.prototype._attachResizeHandler = function () {
    var self = this;
    if (!this.parentFrame || typeof system === 'undefined' || !system) return;
    this._resizeHandler = function () { self._handleResize(); };
    if (typeof global !== 'undefined') {
        if (!global.__ICSH_MODAL_RESIZE__) global.__ICSH_MODAL_RESIZE__ = [];
        global.__ICSH_MODAL_RESIZE__.push({ modal: this, handler: this._resizeHandler });
    }
};

Modal.prototype._handleResize = function () {
    if (!this._open) return;
    this._recomputeGeometry();
    if (this.overlay) {
        try {
            this.overlay.moveTo(this.parentFrame.x, this.parentFrame.y);
            this.overlay.resize(this.parentFrame.width, this.parentFrame.height);
            this.overlay.clear(this.overlayAttr);
        } catch (_) { }
    }
    if (this.frame) {
        try { this.frame.moveTo(this.x, this.y); } catch (_) { }
        try { this.frame.resize(this.width, this.height); } catch (_) { }
    }
    this._renderChrome();
    this._renderBody();
    this._buildButtons();
    try { if (this.frame) this.frame.cycle(); } catch (_) { }
};

Modal.prototype.open = function () {
    if (this._open) return this;
    // Apply non-stacking just-in-time so constructor initialization of other modals finishes safely.
    if (!this.options.stack && typeof Modal !== 'undefined' && Array.isArray(Modal._activeList)) {
        for (var i = Modal._activeList.length - 1; i >= 0; i--) {
            var existing = Modal._activeList[i];
            if (existing === this) continue; // skip self
            if (existing && existing._open && typeof existing.close === 'function') {
                try { existing.close(); } catch (_) { }
            }
        }
    }
    this._open = true;
    if (this.options.timeout && this.options.timeout > 0) {
        var self = this;
        this._timeoutAt = Date.now ? (Date.now() + this.options.timeout) : (new Date().getTime() + this.options.timeout);
        var setTO = (typeof js !== 'undefined' && js && typeof js.setTimeout === 'function') ? js.setTimeout : (typeof setTimeout === 'function' ? setTimeout : null);
        if (setTO) {
            try {
                this._autoCloseTimer = setTO(function () { self._emit(true); }, this.options.timeout);
            } catch (_stoErr) { /* fall back to cycle-based */ }
        }
        // If no native timeout scheduled, we rely on cycle polling in _cycleAll
    }
    this.focusInput();
    this._cycleAll();
    return this;
};

Modal.prototype.focusInput = function () {
    if (this.options.initialFocus === 'input' && this.type === 'prompt') {
        this._focusIndex = -1;
        this._applyButtonFocus();
    }
};

Modal.prototype._cycleAll = function () {
    if (this.overlay) try { this.overlay.cycle(); } catch (_) { }
    if (this.frame) try { this.frame.cycle(); } catch (_) { }
    for (var i = 0; i < this._buttons.length; i++) {
        if (this._buttons[i] && this._buttons[i].frame) try { this._buttons[i].frame.cycle(); } catch (_) { }
    }
    // Fallback auto-dismiss: if timeout requested but no timer fired yet and deadline passed, emit now.
    if (this._open && this._timeoutAt && !this._autoCloseTimer) {
        var now = Date.now ? Date.now() : (new Date().getTime());
        if (now >= this._timeoutAt) {
            try { this._emit(true); } catch (_) { }
        }
    }
};

Modal.prototype.handleKey = function (key) {
    if (!this._open) return false;
    if (!key) return false;
    if (!this.captureKeys) return false; // passive modal: do not consume
    // 1. Custom key handler gets first chance (so custom modals own Enter, etc.)
    if (this.keyHandler) {
        try { if (this.keyHandler(key, this) === true) return true; } catch (_) { }
    }
    var isPrompt = (this.type === 'prompt');
    var inputFocused = (isPrompt && this._focusIndex === -1);
    var isBackspaceKey = (key === '\b' || key === '\x08' || (typeof KEY_BACKSPACE !== 'undefined' && key === KEY_BACKSPACE));
    var isDeleteKey = (key === '\x7f' || (typeof KEY_DEL !== 'undefined' && key === KEY_DEL));
    if (isPrompt) {
        if (isBackspaceKey) {
            if (!inputFocused) {
                this._focusIndex = -1;
                this._applyButtonFocus();
                inputFocused = true;
            }
            this._backspacePromptChar();
            return true;
        }
        if (isDeleteKey) {
            if (!inputFocused) {
                this._focusIndex = -1;
                this._applyButtonFocus();
                inputFocused = true;
            }
            this._deletePromptChar();
            return true;
        }
        if (key === '\x01') {
            if (!inputFocused) {
                this._focusIndex = -1;
                this._applyButtonFocus();
            }
            this._setPromptCursor(0);
            return true;
        }
        if (key === '\x05') {
            if (!inputFocused) {
                this._focusIndex = -1;
                this._applyButtonFocus();
            }
            this._setPromptCursor(this._inputValue.length);
            return true;
        }
    }
    if (isPrompt && key.length === 1 && key >= ' ' && key <= '~') {
        if (!inputFocused) {
            this._focusIndex = -1;
            this._applyButtonFocus();
            inputFocused = true;
        }
        this._insertPromptChar(key);
        return true;
    }
    // 2. Built-in hotkeys/buttons
    if (key.length === 1) {
        var upper = key.toUpperCase();
        if (this._hotkeyMap.hasOwnProperty(upper)) {
            this._focusIndex = this._hotkeyMap[upper];
            this._applyButtonFocus();
            this._activateFocused();
            return true;
        }
    }
    if (key === '\t') { this._focusNext(); return true; }
    if (key === '\x1b') {
        if (this._triggerButtonByRole('cancel')) return true;
        this.close('cancel');
        return true;
    }
    if (typeof KEY_LEFT !== 'undefined' && key === KEY_LEFT) {
        if (isPrompt && this._focusIndex === -1) { this._movePromptCursor(-1); return true; }
        this._focusPrevious();
        return true;
    }
    if (typeof KEY_RIGHT !== 'undefined' && key === KEY_RIGHT) {
        if (isPrompt && this._focusIndex === -1) { this._movePromptCursor(1); return true; }
        this._focusNext();
        return true;
    }
    if (typeof KEY_HOME !== 'undefined' && key === KEY_HOME) {
        if (isPrompt && this._focusIndex === -1) { this._setPromptCursor(0); return true; }
    }
    if (typeof KEY_END !== 'undefined' && key === KEY_END) {
        if (isPrompt && this._focusIndex === -1) { this._setPromptCursor(this._inputValue.length); return true; }
    }
    if (key === '\r' || key === '\n') {
        if (this._triggerButtonByRole('default')) return true;
        this._activateFocused();
        return true;
    }
    if (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER) {
        if (this._triggerButtonByRole('default')) { return true; }
        this._activateFocused();
        return true;
    }
    return false;
};

Modal.prototype._focusNext = function () {
    if (!this._buttonDefs.length) return;
    var start = this._focusIndex;
    for (var i = 0; i < this._buttonDefs.length; i++) {
        start = (start + 1) % this._buttonDefs.length;
        if (!this._buttonDefs[start].disabled) {
            this._focusIndex = start;
            this._applyButtonFocus();
            this._cycleAll();
            return;
        }
    }
};

Modal.prototype._focusPrevious = function () {
    if (!this._buttonDefs.length) return;
    var start = this._focusIndex;
    for (var i = 0; i < this._buttonDefs.length; i++) {
        start = (start - 1 + this._buttonDefs.length) % this._buttonDefs.length;
        if (!this._buttonDefs[start].disabled) {
            this._focusIndex = start;
            this._applyButtonFocus();
            this._cycleAll();
            return;
        }
    }
};

Modal.prototype._activateFocused = function () {
    if (this._focusIndex >= 0 && this._focusIndex < this._buttons.length) {
        this._buttons[this._focusIndex].press();
    } else if (this.type === 'prompt') {
        this._emit(this._inputValue);
    } else if (this._buttonDefs.length) {
        var def = this._buttonDefs[0];
        this._emit(def.value);
    } else {
        this.close();
    }
};

Modal.prototype._emit = function (value) {
    if (this.type === 'prompt' && value === 'submit') value = this._inputValue;
    if (value === 'cancel') value = null;
    this._result = value;
    if (typeof this.options.onSubmit === 'function' && value !== null) {
        try { this.options.onSubmit(value, this); } catch (_) { }
    }
    if (value === null && typeof this.options.onCancel === 'function') {
        try { this.options.onCancel(this); } catch (_) { }
    }
    this.close(value);
};

Modal.prototype.close = function (result) {
    if (this._closed) return;
    try { if (typeof ICSH_MODAL_DEBUG !== 'undefined' && ICSH_MODAL_DEBUG) log('[MODAL close] type=' + this.type + ' title=' + (this.options && this.options.title) + ' result=' + result); } catch (_) { }
    this._closed = true;
    this._open = false;
    if (this._autoCloseTimer) {
        clearTimeout(this._autoCloseTimer);
        this._autoCloseTimer = null;
    }
    if (this._spinnerTimer) { try { js.clearInterval(this._spinnerTimer); } catch (_) { } this._spinnerTimer = null; }
    this._destroyButtons();
    if (this.frame) {
        try { this.frame.close(); } catch (_) { }
        this.frame = null;
    }
    if (this.overlay) {
        try { this.overlay.close(); } catch (_) { }
        this.overlay = null;
    }
    if (this._ownsParent && this.parentFrame) {
        try { this.parentFrame.close(); } catch (_) { }
    } else {
        this.parentFrame.cycle();
    }
    Modal._unregister(this);
    if (typeof this.options.onClose === 'function') {
        try { this.options.onClose(result, this); } catch (_) { }
    }
};

// Alias for external components preferring dismiss() naming
Modal.prototype.dismiss = function (result) { return this.close(result); };

Modal.prototype.destroy = function () { this.close(); };

Modal.prototype.result = function () { return this._result; };

Modal.prototype.setMessage = function (msg) {
    this.message = msg || '';
    this._renderBody();
    this._cycleAll();
};

Modal.prototype.setTitle = function (title) {
    this.title = title || '';
    this._renderChrome();
    this._cycleAll();
};

Modal.prototype.getInputValue = function () { return this._inputValue; };

Modal.prototype.setInputValue = function (value) {
    if (typeof value !== 'string') value = '';
    this._inputValue = value;
    this._inputCursor = value.length;
    if (this.type === 'prompt') {
        this._renderPromptInput(this.height - 4);
        this._cycleAll();
    }
};

Modal.centerRect = function (parent, width, height) {
    var px = parent ? parent.x : 1;
    var py = parent ? parent.y : 1;
    var pw = parent ? parent.width : console.screen_columns;
    var ph = parent ? parent.height : console.screen_rows;
    return {
        x: px + Math.max(0, Math.floor((pw - width) / 2)),
        y: py + Math.max(0, Math.floor((ph - height) / 2))
    };
};

Modal._activeList = [];

Modal._register = function (modal) {
    Modal._activeList.push(modal);
};

Modal._unregister = function (modal) {
    for (var i = Modal._activeList.length - 1; i >= 0; i--) {
        if (Modal._activeList[i] === modal) {
            Modal._activeList.splice(i, 1);
            break;
        }
    }
    try {
        var sh = (typeof global !== 'undefined' && global.__ICSH_ACTIVE_SHELL__) ? global.__ICSH_ACTIVE_SHELL__ : (typeof globalThis !== 'undefined' ? globalThis.__ICSH_ACTIVE_SHELL__ : null);
        if (sh && typeof sh._modalUnregistered === 'function') sh._modalUnregistered(modal);
    } catch (_) { }
};

Modal.getActive = function () {
    if (!Modal._activeList.length) return null;
    return Modal._activeList[Modal._activeList.length - 1];
};

Modal.handleGlobalKey = function (key) {
    log('[MODAL handleGlobalKey] key=' + JSON.stringify(key));
    try { if (typeof ICSH_MODAL_DEBUG !== 'undefined' && ICSH_MODAL_DEBUG) log('[MODAL dispatch] key=' + JSON.stringify(key)); } catch (_) { }
    var active = Modal.getActive();
    if (!active) return false;
    return active.handleKey(key);
};

Modal.closeAll = function () {
    while (Modal._activeList.length) {
        var modal = Modal._activeList[Modal._activeList.length - 1];
        modal.close();
    }
};

// Close only the top-most modal (helper if selective dismissal needed)
Modal.closeTop = function () {
    if (!Modal._activeList.length) return;
    var m = Modal._activeList[Modal._activeList.length - 1];
    if (m) m.close();
};

// Reusable chooser factory: options = {
//   items: [ { label, value } ... ] OR simple string[] (value=string)
//   initialIndex: number (default 0)
//   title: string
//   width/height: optional overrides
//   onChoose(value, item, modal)
//   onCancel(modal)
//   formatItem(item, isSelected) -> string (optional custom line render, no newlines)
// }
// Returns Modal instance (type custom) with internal key handling (Up/Down/Home/End/Page movement) and Enter commit.
Modal.createChooser = function (opts) {
    opts = opts || {};
    // Optional numeric hotspots configuration:
    // opts.hotspots = { enabled:true, immediate:false, selectOnly:false, maxDigits:9 }
    var hsCfg = (opts.hotspots && typeof opts.hotspots === 'object') ? opts.hotspots : null;
    if (hsCfg) {
        if (typeof hsCfg.enabled === 'undefined') hsCfg.enabled = true;
        if (typeof hsCfg.immediate === 'undefined') hsCfg.immediate = false;
        if (typeof hsCfg.selectOnly === 'undefined') hsCfg.selectOnly = false;
        if (typeof hsCfg.maxDigits !== 'number' || hsCfg.maxDigits < 1) hsCfg.maxDigits = 9;
        if (hsCfg.selectOnly) hsCfg.immediate = false; // selectOnly overrides immediate
    }
    var rawItems = Array.isArray(opts.items) ? opts.items.slice(0) : [];
    var items = [];
    for (var i = 0; i < rawItems.length; i++) {
        var it = rawItems[i];
        if (it == null) continue;
        if (typeof it === 'string') items.push({ label: it, value: it });
        else if (typeof it === 'object') {
            var lbl = (typeof it.label === 'string') ? it.label : ('' + (it.value != null ? it.value : i));
            var val = (it.value !== undefined) ? it.value : lbl;
            items.push({ label: lbl, value: val, data: it.data });
        }
    }
    if (!items.length) return null;
    var sel = Math.min(Math.max(0, opts.initialIndex || 0), items.length - 1);
    var pad = 6; // chrome + spacing
    var longest = 0;
    for (var j = 0; j < items.length; j++) if (items[j].label.length > longest) longest = items[j].label.length;
    var autoW = Math.min(console.screen_columns - 2, Math.max(30, longest + 8));
    var autoH = Math.min(console.screen_rows - 2, Math.max(8, Math.min(items.length + 4, 30)));
    var width = (typeof opts.width === 'number') ? opts.width : autoW;
    var height = (typeof opts.height === 'number') ? opts.height : autoH;
    var scroll = 0; // top index of visible window
    function visibleCount(modal) { return Math.max(1, modal.height - 4); }
    function clampSel() { if (sel < 0) sel = 0; if (sel >= items.length) sel = items.length - 1; }
    function ensureVisible(modal) {
        var vc = visibleCount(modal);
        if (sel < scroll) scroll = sel;
        else if (sel >= scroll + vc) scroll = sel - vc + 1;
        if (scroll < 0) scroll = 0;
    }
    function render(frame, modal) {
        try {
            var innerW = modal.width - 4;
            var vc = visibleCount(modal);
            ensureVisible(modal);
            // Clear area
            for (var y = 0; y < vc; y++) {
                frame.gotoxy(2, 2 + y);
                frame.putmsg(Array(innerW + 1).join(' '));
            }
            // We'll collect hotspot rows to register after drawing (avoid clearing mid-loop)
            var rowHotspots = [];
            for (var row = 0; row < vc; row++) {
                var idx = scroll + row;
                if (idx >= items.length) break;
                var it = items[idx];
                var selected = (idx === sel);
                // Build a fresh line each iteration (avoid any stale reuse)
                var renderLine = null;
                if (typeof opts.formatItem === 'function') {
                    try {
                        renderLine = opts.formatItem(it, selected);
                        if (renderLine != null) renderLine = '' + renderLine; // force string copy
                    } catch (e) {
                        try { log('Error in formatItem callback: ' + e); } catch (_) { }
                        renderLine = null;
                    }
                }
                if (renderLine == null || typeof renderLine !== 'string' || !renderLine.length) {
                    // Default formatting
                    var baseLabel = '' + it.label; // defensive copy
                    renderLine = baseLabel;
                }
                // Prepend selection marker AFTER formatting so custom formatter can ignore it
                if (selected) renderLine = '> ' + renderLine; else renderLine = '  ' + renderLine;
                // Trim to inner width
                if (renderLine.length > innerW) renderLine = renderLine.substr(0, innerW);
                frame.gotoxy(2, 2 + row);
                frame.putmsg((selected ? '\x01h\x01w' : '') + renderLine + '\x01n');
                if (row < 9) { // numeric hotspots limited to 1-9
                    rowHotspots.push({ row: row });
                }
            }
            // Scroll indicators (simple)
            if (scroll > 0) { frame.gotoxy(modal.width - 2, 1); frame.putmsg('\x01h\x01w^\x01n'); }
            if (scroll + vc < items.length) { frame.gotoxy(modal.width - 2, modal.height - 1); frame.putmsg('\x01h\x01wv\x01n'); }
            frame.cycle();
            // Register mouse hotspots for each visible row (absolute coords)
            if (typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
                try { if (typeof console.clear_hotspots === 'function') console.clear_hotspots(); } catch (_) { }
                for (var rh = 0; rh < rowHotspots.length; rh++) {
                    var rInfo = rowHotspots[rh];
                    var cmd = String.fromCharCode(49 + rInfo.row); // '1'..'9'
                    var minX = frame.x + 1; // inner content left
                    var maxX = frame.x + modal.width - 2; // inner content right
                    var absY = frame.y + (2 + rInfo.row) - 2; // shift up one row
                    try { console.add_hotspot(cmd, false, minX, maxX, absY); } catch (_) { }
                }
            }
        } catch (_) { }
    }
    var chooser = new Modal({
        type: 'custom',
        title: opts.title || 'Select',
        width: width,
        height: height,
        overlay: (opts.overlay !== false),
        captureKeys: true, // ensure chooser actively intercepts keys regardless of buttons
        render: function (frame, modal) { render(frame, modal); },
        keyHandler: function (k, m) {
            if (!k) return false;
            try {
                if (typeof ICSH_MODAL_DEBUG !== 'undefined' && ICSH_MODAL_DEBUG) {
                    var hexes = '';
                    if (typeof k === 'string') {
                        for (var iHex = 0; iHex < k.length; iHex++) {
                            var h = k.charCodeAt(iHex).toString(16);
                            if (h.length < 2) h = '0' + h;
                            hexes += (iHex ? ' ' : '') + h;
                        }
                    }
                    log('[CHOOSER key raw] len=' + (k && k.length ? k.length : 0) + ' hex=' + hexes + ' repr=' + JSON.stringify(k));
                }
            } catch (_) { }
            var vc = visibleCount(m);
            switch (k) {
                case '\x1B': // esc
                    if (typeof opts.onCancel === 'function') { try { opts.onCancel(m); } catch (_) { } }
                    m.close(null); return true;
                case (typeof KEY_ENTER !== 'undefined' ? KEY_ENTER : '__NO_ENTER__'):
                    var chosen = items[sel];
                    log("User selected item index " + sel + ": " + (chosen ? ('' + chosen.label) : '<null>'));
                    if (chosen && typeof opts.onChoose === 'function') {
                        try {
                            log("Attempting onChoose callback...");
                            opts.onChoose(chosen.value, chosen, m);
                        } catch (e) {
                            log("Error in onChoose callback: " + e);
                        }
                    } else {
                        log("No onChoose callback defined");
                    }
                    m.close(true); return true;
                case (typeof KEY_UP !== 'undefined' ? KEY_UP : '__none__'):
                    sel--; clampSel(); ensureVisible(m); render(m.frame, m); return true;
                case (typeof KEY_DOWN !== 'undefined' ? KEY_DOWN : '__none__'):
                    sel++; clampSel(); ensureVisible(m); render(m.frame, m); return true;
                case (typeof KEY_PGUP !== 'undefined' ? KEY_PGUP : '__none__'):
                    sel -= vc; clampSel(); ensureVisible(m); render(m.frame, m); return true;
                case (typeof KEY_PGDN !== 'undefined' ? KEY_PGDN : '__none__'):
                    sel += vc; clampSel(); ensureVisible(m); render(m.frame, m); return true;
                case (typeof KEY_HOME !== 'undefined' ? KEY_HOME : '__none__'):
                    sel = 0; ensureVisible(m); render(m.frame, m); return true;
                case (typeof KEY_END !== 'undefined' ? KEY_END : '__none__'):
                    sel = items.length - 1; ensureVisible(m); render(m.frame, m); return true;
                default:
                    // Hotspot digits 1-9
                    if (hsCfg && hsCfg.enabled && k.length === 1 && k >= '1' && k <= '9') {
                        var digit = k.charCodeAt(0) - 48; // '1'->1
                        if (digit >= 1 && digit <= hsCfg.maxDigits) {
                            var hIdx = digit - 1;
                            if (hIdx < items.length) {
                                sel = hIdx; clampSel(); ensureVisible(m); render(m.frame, m);
                                if (hsCfg.immediate && !hsCfg.selectOnly) {
                                    var direct = items[sel];
                                    if (direct && typeof opts.onChoose === 'function') {
                                        try { opts.onChoose(direct.value, direct, m); } catch (eH) { try { log('Error hotspot onChoose: ' + eH); } catch (_) { } }
                                    }
                                    m.close(true); return true;
                                }
                                return true; // selection consumed
                            }
                        }
                    }
                    if (k.length === 1 && k >= ' ' && k <= '~') {
                        var upper = k.toUpperCase();
                        for (var y = 0; y < items.length; y++) {
                            if (items[y].label && items[y].label.toUpperCase().charAt(0) === upper) { sel = y; break; }
                        }
                        ensureVisible(m); render(m.frame, m); return true;
                    }
                    return false;
            }
        },
        onClose: function () {
            if (typeof opts.onClose === 'function') { try { opts.onClose(chooser); } catch (_) { } }
        }
    });
    return chooser;
};

// Version metadata (retain _HOT_VERSION for backward compatibility)
Modal._HOT_VERSION = '20251008-12';
Modal.VERSION = Modal._HOT_VERSION;
if (typeof module !== 'undefined') module.exports = Modal;
if (typeof this !== 'undefined') this.Modal = Modal;
try { if (ICSH_MODAL_DEBUG) log('[MODAL LOAD] defined v' + Modal._HOT_VERSION); } catch (_) { }
