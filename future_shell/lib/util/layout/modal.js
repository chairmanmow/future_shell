// Migration tracker (completed): legacy bespoke overlays replaced with unified Modal.
//   - message_boards.js: read + transition notices now spinner Modals (legacy frames removed)
//   - users.js: user detail view now uses type:'custom' Modal (multi-frame layout removed)
//   - newsreader.js: loading overlay uses spinner Modal
// Extended types supported: 'spinner', 'progress', 'custom'.
global.ICSH_DEBUG_FRAMES = true;
(function () {
    load('future_shell/lib/util/layout/button.js');
    // Debug instrumentation: enable global.ICSH_DEBUG_FRAMES = true to log modal geometry & layout decisions
    function dbg(msg) {
        try {
            if (typeof global !== 'undefined' && global.ICSH_DEBUG_FRAMES) log('[MODALDBG] ' + msg);
        } catch (_) { }
    }

    var BLACK = (typeof BLACK === 'number') ? BLACK : 0;
    var WHITE = (typeof WHITE === 'number') ? WHITE : 7;
    var LIGHTGRAY = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
    var BG_BLACK = (typeof BG_BLACK === 'number') ? BG_BLACK : (BLACK << 4);
    var BG_DARKGRAY = (typeof BG_DARKGRAY === 'number') ? BG_DARKGRAY : ((LIGHTGRAY & 0x07) << 4);
    var KEY_LEFT_CODE = (typeof KEY_LEFT !== 'undefined') ? KEY_LEFT : null;
    var KEY_RIGHT_CODE = (typeof KEY_RIGHT !== 'undefined') ? KEY_RIGHT : null;

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
        this.overlay = null;

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
        var baseWidth = typeof opts.width === 'number' ? opts.width : this._autoWidth();
        var baseHeight = typeof opts.height === 'number' ? opts.height : this._autoHeight(baseWidth);
        // Compute max allowable width/height inside parent. If parent very small, relax minimums.
        var limitW = Math.max(4, this.parentFrame.width - 2); // ensure at least 4 cols
        var limitH = Math.max(3, this.parentFrame.height - 2); // ensure at least 3 rows
        // Dynamic minimums: don't exceed limit if limit is smaller than canonical minimums (20x6)
        var minW = Math.min(20, limitW);
        var minH = Math.min(6, limitH);
        if (minW < 4) minW = limitW; // extreme tiny parent
        if (minH < 3) minH = limitH;
        // Clamp requested geometry
        this.width = clamp(baseWidth, minW, limitW);
        this.height = clamp(baseHeight, minH, limitH);
        // If still somehow exceeding parent (parent shrank), hard cap
        if (this.width > this.parentFrame.width - 0) this.width = Math.max(1, this.parentFrame.width);
        if (this.height > this.parentFrame.height - 0) this.height = Math.max(1, this.parentFrame.height);
        var coords = Modal.centerRect(this.parentFrame, this.width, this.height);
        // Guard against 0/negative coordinates (Synchronet frames are 1-based)
        this.x = Math.max(1, coords.x);
        this.y = Math.max(1, coords.y);
        dbg('recomputeGeometry parent=' + this.parentFrame.width + 'x' + this.parentFrame.height + ' modal=' + this.width + 'x' + this.height + ' at ' + this.x + ',' + this.y);
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
        if (innerWidth <= 0 || this.height < 4) { dbg('skip body render (too small) w=' + this.width + ' h=' + this.height); return; }
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
        var y = this.height - 2;
        var totalWidth = 0;
        var widths = [];
        for (var i = 0; i < this._buttonDefs.length; i++) {
            var b = this._buttonDefs[i];
            var w = Math.max(6, b.label.length + 4);
            widths.push(w);
            totalWidth += w;
        }
        totalWidth += gap * (this._buttonDefs.length - 1);
        var startX = Math.max(2, Math.floor((this.width - totalWidth) / 2) + 1);
        // Clamp if buttons overflow available inner width
        var innerAvail = this.width - 2;
        if (totalWidth > innerAvail && this._buttonDefs.length) {
            var usable = Math.max(4, innerAvail - gap * (this._buttonDefs.length - 1));
            var per = Math.max(4, Math.floor(usable / this._buttonDefs.length));
            for (var a = 0; a < widths.length; a++) widths[a] = per;
            totalWidth = per * this._buttonDefs.length + gap * (this._buttonDefs.length - 1);
            startX = Math.max(2, Math.floor((this.width - totalWidth) / 2) + 1);
            dbg('adjust buttons per=' + per + ' totalWidth=' + totalWidth + ' frameWidth=' + this.width);
        }
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
        this._open = true;
        if (this.options.timeout && this.options.timeout > 0) {
            var self = this;
            this._autoCloseTimer = setTimeout(function () { self._emit(true); }, this.options.timeout);
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
    };

    Modal.prototype.handleKey = function (key) {
        if (!this._open) return false;
        if (!key) return false;
        if (key.length === 1) {
            var upper = key.toUpperCase();
            if (this._hotkeyMap.hasOwnProperty(upper)) {
                this._focusIndex = this._hotkeyMap[upper];
                this._applyButtonFocus();
                this._activateFocused();
                return true;
            }
        }
        if (key === '\t') {
            this._focusNext();
            return true;
        }
        if (key === '\x1b') {
            if (this._cancelIndex !== -1) {
                this._focusIndex = this._cancelIndex;
                this._applyButtonFocus();
                this._activateFocused();
            } else {
                this.close('cancel');
            }
            return true;
        }
        if (key === '\x00K' || (KEY_LEFT_CODE && key === KEY_LEFT_CODE)) {
            this._focusPrevious();
            return true;
        }
        if (key === '\x00M' || (KEY_RIGHT_CODE && key === KEY_RIGHT_CODE)) {
            this._focusNext();
            return true;
        }
        if (key === '\r' || key === '\n') {
            this._activateFocused();
            return true;
        }
        if (this.type === 'prompt' && key.length === 1) {
            if (key === '\b' || key === '\x08') {
                if (this._inputCursor > 0) {
                    this._inputValue = this._inputValue.substr(0, this._inputCursor - 1) + this._inputValue.substr(this._inputCursor);
                    this._inputCursor--;
                    this._renderPromptInput(this.height - 4);
                    this._cycleAll();
                }
                return true;
            }
            if (key === '\x7f') {
                if (this._inputCursor < this._inputValue.length) {
                    this._inputValue = this._inputValue.substr(0, this._inputCursor) + this._inputValue.substr(this._inputCursor + 1);
                    this._renderPromptInput(this.height - 4);
                    this._cycleAll();
                }
                return true;
            }
            if (key === '\x01') { this._inputCursor = 0; return true; }
            if (key === '\x05') { this._inputCursor = this._inputValue.length; return true; }
            if (key >= ' ' && key <= '~') {
                this._inputValue = this._inputValue.substr(0, this._inputCursor) + key + this._inputValue.substr(this._inputCursor);
                this._inputCursor++;
                this._renderPromptInput(this.height - 4);
                this._cycleAll();
                return true;
            }
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

    if (typeof module !== 'undefined') module.exports = Modal;
    if (typeof this !== 'undefined') this.Modal = Modal;
})();
