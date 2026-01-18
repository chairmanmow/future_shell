"use strict";

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
    var bgFg = this._resolveFg(this.backgroundColors && this.backgroundColors.length ? this.backgroundColors[0] : undefined, parentAttr);
    var bgBg = this._resolveBg(this.backgroundColors && this.backgroundColors.length > 1 ? this.backgroundColors[1] : undefined, parentAttr);
    var shadowFg = this._resolveFg(this.shadowColors && this.shadowColors.length ? this.shadowColors[0] : undefined, BLACK);
    var shadowBg = this._resolveBg(this.shadowColors && this.shadowColors.length > 1 ? this.shadowColors[1] : undefined, parentAttr);
    var backgroundAttr = (bgBg & 0x70) | (bgFg & 0x0F);
    var shadowHalfAttr = (bgBg & 0x70) | (shadowFg & 0x0F);
    var shadowSolidAttr = (shadowBg & 0x70) | (shadowFg & 0x0F);
    var cornerAttr = (shadowBg & 0x70) | (bgFg & 0x0F);
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
    var solidBlock = String.fromCharCode(219);
    this.frame.attr = cornerAttr;
    this.frame.gotoxy(this.width, 1);
    this.frame.putmsg(halfUpper);

    // Bottom row shadow trail
    var halfUpperShadow = String.fromCharCode(223);
    this.frame.attr = backgroundAttr;
    this.frame.gotoxy(1, 2);
    this.frame.putmsg(solidBlock);
    for (var x = 2; x < this.width + 1; x++) {
        this.frame.attr = shadowHalfAttr;
        this.frame.gotoxy(x, 2);
        this.frame.putmsg(halfUpperShadow);
    }

    this.frame.attr = baseAttr;
};

Button.prototype._resolveFg = function (value, fallbackAttr) {
    if (typeof value === 'number') return value & 0x0F;
    if (typeof fallbackAttr === 'number') return fallbackAttr & 0x0F;
    return 0;
};

Button.prototype._resolveBg = function (value, fallbackAttr) {
    if (typeof value === 'number') {
        if (value & 0x70) return value & 0x70;
        return (value << 4) & 0x70;
    }
    if (typeof fallbackAttr === 'number') return fallbackAttr & 0x70;
    return 0;
};

Button.prototype.destroy = function () {
    if (this.frame && this._ownsFrame) {
        try { this.frame.close(); } catch (_eClose) { }
    }
    this.frame = null;
    this.parentFrame = null;
    this.onClick = null;
};
