"use strict";

// Fallback for color constants if not globally defined
var _BLACK = (typeof BLACK !== 'undefined') ? BLACK : 0;

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
    
    // Render "pressed" state - button appears pushed in (no shadow, shifted label)
    this.renderPressed();
    
    if (typeof this.frame.cycle === 'function') {
        try { this.frame.cycle(); } catch (_eFlashCycle) { }
    }
    
    // Brief visual pause then restore normal state
    // In terminal we can't easily delay, so just render back
    this.render();
};

Button.prototype.renderPressed = function () {
    if (!this.frame) return;
    var baseAttr = this.enabled ? (this.focused ? this.focusAttr : this.attr) : this.disabledAttr;
    var parentAttr = this.parentFrame ? this.parentFrame.attr : baseAttr;

    // Extract colors
    var buttonBg = baseAttr & 0x70;
    var shadowFg = this._resolveFg(this.shadowColors && this.shadowColors.length ? this.shadowColors[0] : undefined, _BLACK);
    
    var blendColor;
    if (this.shadowColors && this.shadowColors.length > 1 && typeof this.shadowColors[1] === 'number') {
        var sc1 = this.shadowColors[1];
        if (sc1 & 0x70) {
            blendColor = (sc1 >> 4) & 0x07;
        } else {
            blendColor = sc1 & 0x0F;
        }
    } else {
        blendColor = (parentAttr >> 4) & 0x07;
    }
    var blendBg = (blendColor << 4) & 0x70;

    var label = this.label || '';
    if (this.icon) label = this.icon + ' ' + label;
    var availableTop = Math.max(1, this.width - 1);
    if (label.length > availableTop) label = label.substr(0, availableTop);

    try { this.frame.clear(blendBg | blendColor); } catch (_eClr) { }

    // Row 1: Solid blend color (button "pushed down" into surface)
    this.frame.attr = blendBg | blendColor;
    this.frame.gotoxy(1, 1);
    for (var i = 0; i < this.width; i++) this.frame.putmsg(' ');

    // Row 2: Button face shifted down (pressed effect)
    // Label shifts down and right by 1 to simulate depth
    var padding = Math.max(0, this.width - label.length - 1);
    var padLeft = Math.floor(padding / 2) + 1; // +1 shift right
    var padRight = padding - Math.floor(padding / 2);
    
    this.frame.attr = baseAttr;
    this.frame.gotoxy(1, 2);
    if (padLeft > 0) this.frame.putmsg(new Array(padLeft + 1).join(' '));
    if (label.length) this.frame.putmsg(label);
    var written = padLeft + label.length;
    if (written < this.width) this.frame.putmsg(new Array(this.width - written + 1).join(' '));
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

    // Extract button face colors from attr (primary display)
    var buttonFg = baseAttr & 0x0F;
    var buttonBg = baseAttr & 0x70;

    // Shadow foreground color (the dark shade for 3D effect)
    // shadowColors[0] = shadow color (e.g., BLACK/DARKGRAY)
    var shadowFg = this._resolveFg(this.shadowColors && this.shadowColors.length ? this.shadowColors[0] : undefined, _BLACK);

    // Blend color - the background color where the button sits (e.g., parent's BG)
    // shadowColors[1] = blend background color
    // Extract as a foreground value since we use it in half-blocks
    var blendColor;
    if (this.shadowColors && this.shadowColors.length > 1 && typeof this.shadowColors[1] === 'number') {
        // If it's a BG value (has bits in 0x70), convert to 0-7 range
        // If it's already a FG value (0-15), use directly
        var sc1 = this.shadowColors[1];
        if (sc1 & 0x70) {
            blendColor = (sc1 >> 4) & 0x07;
        } else {
            blendColor = sc1 & 0x0F;
        }
    } else {
        // Fall back to parent background as blend
        blendColor = (parentAttr >> 4) & 0x07;
    }
    var blendBg = (blendColor << 4) & 0x70;

    // Convert button background to foreground value for half-block chars
    var buttonBgAsFg = (buttonBg >> 4) & 0x07;

    // Half-block characters for blending
    var halfUpper = String.fromCharCode(223); // ▀ - FG on top, BG on bottom
    var halfLower = String.fromCharCode(220); // ▄ - FG on bottom, BG on top

    var label = this.label || '';
    if (this.icon) label = this.icon + ' ' + label;
    var availableTop = Math.max(1, this.width - 1);
    if (label.length > availableTop) label = label.substr(0, availableTop);
    var padding = Math.max(0, availableTop - label.length);
    var padLeft = Math.floor(padding / 2);
    var padRight = padding - padLeft;

    // Don't clear with baseAttr - draw each cell explicitly to avoid background bleed

    // Row 1: Button face with centered label
    this.frame.attr = baseAttr;
    this.frame.gotoxy(1, 1);
    if (padLeft > 0) this.frame.putmsg(new Array(padLeft + 1).join(' '));
    if (label.length) this.frame.putmsg(label);
    if (padRight > 0) this.frame.putmsg(new Array(padRight + 1).join(' '));
    var written = padLeft + label.length + padRight;
    if (written < availableTop) this.frame.putmsg(new Array(availableTop - written + 1).join(' '));

    // Row 1, right edge: Blend on top, shadow on bottom (shadow falls down-right)
    // ▄ = FG on bottom, BG on top → attr = blendBg | shadowFg
    var cornerAttr = blendBg | shadowFg;
    this.frame.attr = cornerAttr;
    this.frame.gotoxy(this.width, 1);
    this.frame.putmsg(halfLower);

    // Row 2, column 1: Full block showing blend color
    // Full block shows FG only. Set BG to non-zero to avoid attr=0 when blend is BLACK
    var fullBlock = String.fromCharCode(219); // █
    this.frame.attr = 0x10 | (blendColor & 0x0F); // BG_BLUE | blendColor (BG hidden by full block)
    this.frame.gotoxy(1, 2);
    this.frame.putmsg(fullBlock);

    // Row 2, columns 2+: Shadow on top blending into blend bg
    // ▀ = FG on top, BG on bottom → attr = blendBg | shadowFg
    var shadowTrailAttr = blendBg | shadowFg;
    for (var x = 2; x <= this.width; x++) {
        this.frame.attr = shadowTrailAttr;
        this.frame.gotoxy(x, 2);
        this.frame.putmsg(halfUpper);
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
