function Button(opts) {
    opts = opts || {};
    this.parentFrame = opts.parentFrame || null;
    this.frame = opts.frame || null;
    this._ownsFrame = false;
    this.x = (typeof opts.x === 'number') ? opts.x : 1;
    this.y = (typeof opts.y === 'number') ? opts.y : 1;
    this.width = Math.max(4, (typeof opts.width === 'number') ? opts.width : (this.frame ? this.frame.width : 12));
    this.height = 2;
    this.label = opts.label || '';
    this.icon = opts.icon || '';
    this.attr = (typeof opts.attr === 'number') ? opts.attr : 0;
    this.focusAttr = (typeof opts.focusAttr === 'number') ? opts.focusAttr : this.attr;
    this.shadowAttr = (typeof opts.shadowAttr === 'number') ? opts.shadowAttr : this.attr;
    this.backgroundColors = Array.isArray(opts.backgroundColors) ? opts.backgroundColors.slice(0, 2) : null;
    this.shadowColors = Array.isArray(opts.shadowColors) ? opts.shadowColors.slice(0, 2) : null;
    this.disabledAttr = (typeof opts.disabledAttr === 'number') ? opts.disabledAttr : this.attr;
    this.onClick = (typeof opts.onClick === 'function') ? opts.onClick : null;
    this.enabled = opts.enabled !== false;
    this.focused = !!opts.focused;

    if (!this.frame) {
        if (!this.parentFrame) throw new Error('Button requires a frame or parent frame.');
        this.frame = new Frame(this.x, this.y, this.width, this.height, this.attr, this.parentFrame);
        this.frame.open();
        this._ownsFrame = true;
    } else {
        this.width = this.frame.width || this.width;
        this.height = this.frame.height || this.height;
    }

    this.render();
}

Button.prototype.setLabel = function (label) {
    this.label = label || '';
    this.render();
};

Button.prototype.setOnClick = function (fn) {
    this.onClick = (typeof fn === 'function') ? fn : null;
};

Button.prototype.setFocused = function (focused) {
    this.focused = !!focused;
    this.render();
};

Button.prototype.setEnabled = function (enabled) {
    this.enabled = !!enabled;
    this.render();
};

Button.prototype.press = function () {
    if (!this.enabled) return false;
    this.playClickEffect();
    if (typeof this.onClick === 'function') {
        try { this.onClick(); } catch (_eBtn) { }
    }
    return true;
};

Button.prototype.playClickEffect = function () {
    if (!this.frame) return;
    var baseAttr = this.enabled ? (this.focused ? this.focusAttr : this.attr) : this.disabledAttr;
    var flashAttr = this.focusAttr;
    if (typeof this.frame.clear === 'function') {
        try {
            this.frame.clear(flashAttr);
        } catch (_eFlashClr) { }
    }
    if (typeof this.frame.cycle === 'function') {
        try { this.frame.cycle(); } catch (_eFlashCycle) { }
    }
    this.render();
    if (this.frame) {
        this.frame.attr = baseAttr;
    }
};

Button.prototype.handleKey = function (key) {
    if (!this.enabled) return false;
    if (key === ' ' || key === '\r' || key === '\n') {
        return this.press();
    }
    return false;
};

Button.prototype.render = function () {
    if (!this.frame) return;
    var baseAttr = this.enabled ? (this.focused ? this.focusAttr : this.attr) : this.disabledAttr;
    var parentAttr = this.parentFrame ? this.parentFrame.attr : baseAttr;
    var parentFg = parentAttr & 0x0F;
    var parentBg = parentAttr & 0x70;
    var buttonBg = baseAttr & 0x70;
    var backgroundAttr = this._composeAttr(this.backgroundColors, parentAttr);
    var shadowFallback = (BLACK & 0x0F) | parentBg;
    var shadowAttr = this._composeAttr(this.shadowColors, shadowFallback);
    var label = this.label || '';
    if (this.icon) label = this.icon + ' ' + label;
    var availableTop = Math.max(1, this.width - 1);
    if (label.length > availableTop) label = label.substr(0, availableTop);
    var padding = Math.max(0, availableTop - label.length);
    var padLeft = Math.floor(padding / 2);
    var padRight = padding - padLeft;

    try { this.frame.clear(baseAttr); } catch (_eClr) { }

    // Top row with centered label
    this.frame.attr = baseAttr;
    this.frame.gotoxy(1, 1);
    if (padLeft > 0) this.frame.putmsg(new Array(padLeft + 1).join(' '));
    if (label.length) this.frame.putmsg(label);
    if (padRight > 0) this.frame.putmsg(new Array(padRight + 1).join(' '));
    var written = padLeft + label.length + padRight;
    if (written < availableTop) this.frame.putmsg(new Array(availableTop - written + 1).join(' '));

    // Shadow column on top row
    var halfUpper = String.fromCharCode(223);
    var halfLower = String.fromCharCode(220);
    var solidBlock = String.fromCharCode(219);
    var topCornerAttr = (BLACK | BG_RED);
    this.frame.attr = topCornerAttr;
    this.frame.gotoxy(this.width, 1);
    this.frame.putmsg(halfLower);

    // Bottom row shadow trail
    var halfUpperShadow = String.fromCharCode(223);
    this.frame.attr = backgroundAttr;
    this.frame.gotoxy(1, 2);
    this.frame.putmsg(solidBlock);
    for (var x = 2; x < this.width + 1; x++) {
        this.frame.attr = shadowAttr;
        this.frame.gotoxy(x, 2);
        this.frame.putmsg(halfUpperShadow);
    }
    this.frame.attr = baseAttr;
};

Button.prototype._composeAttr = function (pair, fallbackAttr) {
    var attr = (typeof fallbackAttr === 'number') ? (fallbackAttr & 0x7F) : 0;
    if (pair && pair.length) {
        if (typeof pair[0] === 'number') attr = (attr & 0xF0) | (pair[0] & 0x0F);
        if (pair.length > 1 && typeof pair[1] === 'number') attr = (attr & 0x0F) | (pair[1] & 0x70);
    }
    return attr;
};

Button.prototype.destroy = function () {
    if (this.frame && this._ownsFrame) {
        try { this.frame.close(); } catch (_eClose) { }
    }
    this.frame = null;
    this.parentFrame = null;
    this.onClick = null;
};
