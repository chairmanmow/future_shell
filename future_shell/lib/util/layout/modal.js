// Migration tracker (completed): legacy bespoke overlays replaced with unified Modal.
//   - message_boards.js: read + transition notices now spinner Modals (legacy frames removed)
//   - users.js: user detail view now uses type:'custom' Modal (multi-frame layout removed)
//   - newsreader.js: loading overlay uses spinner Modal
// Extended types supported: 'spinner', 'progress', 'custom'.
// Hot reload support: ALWAYS redefine Modal when this file is load()'d.
// Previous guard removed to align with other libs. We close any existing modals to avoid stale prototype issues.
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
// Load canonical key constants (no defensive fallbacks; rely on environment correctness)
try { if (typeof KEY_LEFT === 'undefined') require('sbbsdefs.js', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_ENTER', 'KEY_UP', 'KEY_DOWN', 'KEY_PGUP', 'KEY_PGDN', 'KEY_HOME', 'KEY_END'); } catch (_r) { }

function resolveAttr(fallback) {
    if (typeof ICSH_ATTR === 'function') {
        try { return ICSH_ATTR('MODAL'); } catch (_) { }
    }
    if (typeof fallback === 'number') return fallback;
    return (WHITE & 0x0F) | (BG_DARKGRAY & 0x70);
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
    this.overlayEnabled = opts.overlay !== false;
    this.overlayAttr = (typeof opts.overlayAttr === 'number') ? opts.overlayAttr : ((BLACK & 0x0F) | (BG_BLACK & 0x70));
    this.overlayChar = (typeof opts.overlayChar === 'string' && opts.overlayChar.length) ? opts.overlayChar[0] : ' ';
    this.attr = (typeof opts.attr === 'number') ? opts.attr : resolveAttr();
    this.contentAttr = (typeof opts.contentAttr === 'number') ? opts.contentAttr : this.attr;
    this.titleAttr = (typeof opts.titleAttr === 'number') ? opts.titleAttr : ((WHITE & 0x0F) | (this.attr & 0x70));
    this.buttonAttr = (typeof opts.buttonAttr === 'number') ? opts.buttonAttr : this.attr;
    this.buttonFocusAttr = (typeof opts.buttonFocusAttr === 'number') ? opts.buttonFocusAttr : (((WHITE & 0x0F) | (BG_BLACK & 0x70)));
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
    if (this.type === 'spinner' || this.type === 'progress') this._initActivityType();
    Modal._register(this);
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
                { label: opts.okLabel || 'OK', value: 'submit', default: true },
                { label: opts.cancelLabel || 'Cancel', value: 'cancel', cancel: true }
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
    for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        if (!b || typeof b !== 'object') continue;
        var label = (typeof b.label === 'string' && b.label.length) ? b.label : ('Button' + (i + 1));
        var def = {
            label: label,
            value: (b.value !== undefined) ? b.value : label,
            default: !!b.default,
            cancel: !!b.cancel,
            onClick: (typeof b.onClick === 'function') ? b.onClick : null,
            hotKey: (typeof b.hotKey === 'string' && b.hotKey.length) ? b.hotKey.toUpperCase() : null,
            disabled: b.enabled === false ? true : false,
            attr: (typeof b.attr === 'number') ? b.attr : this.buttonAttr,
            focusAttr: (typeof b.focusAttr === 'number') ? b.focusAttr : this.buttonFocusAttr
        };
        if (def.hotKey === null && label.length) def.hotKey = label.charAt(0).toUpperCase();
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
            this.frame.drawBorder(this.attr, this.title ? { x: 3, y: 1, attr: this.titleAttr, text: ' ' + this.title + ' ' } : null);
            return;
        } catch (_) { }
    }
    if (this.title) {
        var cx = Math.max(2, Math.floor((this.width - this.title.length) / 2));
        this.frame.gotoxy(cx, 1);
        this.frame.attr = this.titleAttr;
        this.frame.putmsg(this.title.substr(0, this.width - 2));
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
        this._spinnerTimer = js.setInterval(function () {
            self._spinnerIdx = (self._spinnerIdx + 1) % seq.length;
            if (self._open) {
                self._renderSpinner(self.height - 4);
                self._cycleAll();
            }
        }, interval);
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
    var innerWidth = this.width - 4;
    var value = this._inputValue;
    var display = this._inputSecret ? Array(value.length + 1).join('*') : value;
    if (display.length > innerWidth - 2) {
        display = display.substr(display.length - (innerWidth - 2));
    }
    var padded = display;
    if (display.length < innerWidth - 2) padded += Array(innerWidth - display.length - 1).join(' ');
    this.frame.attr = this.contentAttr;
    this.frame.gotoxy(3, y);
    this.frame.putmsg('>' + padded + ' ');
};

Modal.prototype._buildButtons = function () {
    this._destroyButtons();
    if (!this._buttonDefs.length) return;
    var gap = 2;
    // Desired layout: dock buttons to bottom-right with 1 row padding above bottom border
    // Button height is 2; bottom border is last row; place top row of buttons at height-2
    var y = this.height - 2; // second-to-last row
    if (y < 2) y = 2;
    var totalWidth = 0;
    var widths = [];
    for (var i = 0; i < this._buttonDefs.length; i++) {
        var b = this._buttonDefs[i];
        var w = Math.max(6, b.label.length + 4);
        widths.push(w);
        totalWidth += w;
    }
    totalWidth += gap * (this._buttonDefs.length - 1);
    // Right alignment with 2 column padding (border at width). Border inside frame so keep >=2 and <= width-1
    var rightPad = 2; // space before right border
    var startX = this.width - rightPad - totalWidth + 1; // +1 because frame coords start at 1
    if (startX < 2) startX = 2; // fallback to left if not enough space
    for (var j = 0; j < this._buttonDefs.length; j++) {
        var def = this._buttonDefs[j];
        var btn = new Button({
            parentFrame: this.frame,
            x: startX,
            y: y,
            width: widths[j],
            label: def.label,
            attr: def.attr,
            focusAttr: def.focusAttr,
            disabledAttr: def.attr,
            enabled: !def.disabled,
            focused: false,
            onClick: this._makeButtonHandler(def)
        });
        this._buttons.push(btn);
        startX += widths[j] + gap;
    }
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
        var hotKey = this._buttonDefs[i] && this._buttonDefs[i].hotKey ? this._buttonDefs[i].hotKey : null;
        var cmd = hotKey || String.fromCharCode(1 + i); // fallback
        var r = absRect(btn.frame);
        // Buttons are visually 2 rows tall; register both rows.
        try { console.add_hotspot(cmd, true, r.x, r.x + r.w - 1, r.y); } catch (_) { }
        try { console.add_hotspot(cmd, true, r.x, r.x + r.w - 1, r.y + 1); } catch (_) { }
        if (!this._hotspotMap) this._hotspotMap = {}; // correct map init
        this._hotspotMap[cmd] = i;
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
        self._emit(def.value);
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
        if (this._cancelIndex !== -1) {
            this._focusIndex = this._cancelIndex; this._applyButtonFocus(); this._activateFocused();
        } else { this.close('cancel'); }
        return true;
    }
    if (typeof KEY_LEFT !== 'undefined' && key === KEY_LEFT) { this._focusPrevious(); return true; }
    if (typeof KEY_RIGHT !== 'undefined' && key === KEY_RIGHT) { this._focusNext(); return true; }
    if (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER) { this._activateFocused(); return true; }
    if (this.type === 'prompt' && key.length === 1) {
        if (key === '\b' || key === '\x08') { if (this._inputCursor > 0) { this._inputValue = this._inputValue.substr(0, this._inputCursor - 1) + this._inputValue.substr(this._inputCursor); this._inputCursor--; this._renderPromptInput(this.height - 4); this._cycleAll(); } return true; }
        if (key === '\x7f') { if (this._inputCursor < this._inputValue.length) { this._inputValue = this._inputValue.substr(0, this._inputCursor) + this._inputValue.substr(this._inputCursor + 1); this._renderPromptInput(this.height - 4); this._cycleAll(); } return true; }
        if (key === '\x01') { this._inputCursor = 0; return true; }
        if (key === '\x05') { this._inputCursor = this._inputValue.length; return true; }
        if (key >= ' ' && key <= '~') { this._inputValue = this._inputValue.substr(0, this._inputCursor) + key + this._inputValue.substr(this._inputCursor); this._inputCursor++; this._renderPromptInput(this.height - 4); this._cycleAll(); return true; }
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
};

Modal.getActive = function () {
    if (!Modal._activeList.length) return null;
    return Modal._activeList[Modal._activeList.length - 1];
};

Modal.handleGlobalKey = function (key) {
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
