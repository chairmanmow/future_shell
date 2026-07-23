"use strict";

// ===========================================================================
// NewsreaderSettings - News reader display preferences
// ---------------------------------------------------------------------------
// Thin UI over the shared ShellPrefs store (shell._getShellPrefs()). Currently
// exposes the image colour mode used by the Feed: 24-bit truecolor half-block
// (default) vs legacy 16-colour ANSI. Mirrors the screensaver-settings pattern.
// ===========================================================================

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'BLACK', 'LIGHTGREEN'
);

// Synchronet inkey() arrow control chars (match literally, KEY_* may be absent).
function _nsIsUp(key)    { return key === '\x1e' || key === '\x1B[A' || key === '\x1BOA'; }
function _nsIsDown(key)  { return key === '\x0a' || key === '\x1B[B' || key === '\x1BOB'; }
function _nsIsLeft(key)  { return key === '\x1d' || key === '\x1B[D' || key === '\x1BOD'; }
function _nsIsRight(key) { return key === '\x06' || key === '\x1B[C' || key === '\x1BOC'; }

function _nsPad(str, width) {
    var display = str.replace(/\x01./g, '');
    var need = width - display.length;
    if (need <= 0) return str;
    var spaces = '';
    while (need-- > 0) spaces += ' ';
    return str + spaces;
}

function NewsreaderSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'newsreader-settings', parentFrame: opts.parentFrame });
    this.id = 'newsreader-settings';
    this.themeNamespace = this.id;
    this.shell = opts.shell || null;

    this._frame = null;
    this._headerFrame = null;
    this._listFrame = null;
    this._statusFrame = null;

    this.store = null;
    this._rows = [];
    this._selectedIndex = 0;
    this._statusText = '';

    this.registerColors({
        BG:         { BG: BG_BLACK, FG: LIGHTGRAY },
        TITLE:      { BG: BG_BLUE,  FG: WHITE },
        ROW_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },
        ROW_ACTIVE: { BG: BG_CYAN,  FG: BLACK },
        SECTION:    { BG: BG_BLACK, FG: YELLOW },
        VALUE:      { BG: BG_BLACK, FG: LIGHTGREEN },
        STATUS:     { BG: BG_BLUE,  FG: WHITE }
    });
}

extend(NewsreaderSettings, Subprogram);

NewsreaderSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.store = (this.shell && typeof this.shell._getShellPrefs === 'function') ? this.shell._getShellPrefs() : null;
    this._buildRows();
    this._selectedIndex = this._findSelectable(0, 1);
    if (this._selectedIndex < 0) this._selectedIndex = 0;
    this._statusText = ' \x01cUp/Down\x01w:move  \x01cLeft/Right/Space\x01w:change  \x01cESC\x01w:close';
    this.draw();
};

NewsreaderSettings.prototype.exit = function () {
    if (this._statusFrame) { this._statusFrame.delete(); this._statusFrame = null; }
    if (this._listFrame) { this._listFrame.delete(); this._listFrame = null; }
    if (this._headerFrame) { this._headerFrame.delete(); this._headerFrame = null; }
    if (this._frame) { this._frame.delete(); this._frame = null; }
    Subprogram.prototype.exit.call(this);
};

NewsreaderSettings.prototype._colorMode = function () {
    if (this.store && typeof this.store.getNewsreaderColorMode === 'function') return this.store.getNewsreaderColorMode();
    return 'truecolor';
};

NewsreaderSettings.prototype._buildRows = function () {
    var rows = [];
    rows.push({ type: 'section', label: 'News Images', selectable: false });
    if (!this.store) {
        rows.push({ type: 'message', label: 'Preferences unavailable.', selectable: false });
    } else {
        rows.push({ type: 'choice', key: 'colorMode', label: 'Image Colour', value: this._colorMode(), selectable: true });
    }
    this._rows = rows;
};

NewsreaderSettings.prototype._ensureFrames = function () {
    if (!this.parentFrame || this._frame) return;
    var rf = this.parentFrame;
    while (rf.parent) rf = rf.parent;
    var originX = rf.x, topY = rf.y, width = rf.width;
    var totalH = Math.max(3, rf.height);
    var bgAttr = this.paletteAttr('BG');
    this._frame = new Frame(originX, topY, width, totalH, bgAttr, this.parentFrame);
    this._frame.open();
    this._headerFrame = new Frame(originX, topY, width, 1, this.paletteAttr('TITLE'), this._frame);
    this._headerFrame.open();
    this._listFrame = new Frame(originX, topY + 1, width, Math.max(1, totalH - 2), bgAttr, this._frame);
    this._listFrame.open();
    this._statusFrame = new Frame(originX, topY + totalH - 1, width, 1, this.paletteAttr('STATUS'), this._frame);
    this._statusFrame.open();
};

NewsreaderSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._headerFrame.clear(this.paletteAttr('TITLE'));
    this._headerFrame.gotoxy(1, 1);
    this._headerFrame.center(' News Reader Settings ');
    this._renderList();
    this._renderStatus();
    this._frame.cycle();
};

NewsreaderSettings.prototype._valueStr = function (row) {
    if (row.type === 'choice' && row.key === 'colorMode') {
        return (row.value === 'truecolor') ? 'Truecolor' : (row.value === 'sixel') ? 'Sixel' : '16-color';
    }
    return '';
};

NewsreaderSettings.prototype._renderList = function () {
    if (!this._listFrame) return;
    var f = this._listFrame;
    f.clear(this.paletteAttr('BG'));
    var w = f.width;
    for (var line = 0; line < f.height && line < this._rows.length; line++) {
        var row = this._rows[line];
        f.gotoxy(1, line + 1);
        if (row.type === 'section') {
            f.attr = this.paletteAttr('SECTION');
            f.putmsg(_nsPad('\x01h ' + row.label + ' ', w) + '\x01n');
            continue;
        }
        if (row.type === 'message') {
            f.attr = this.paletteAttr('ROW_NORMAL');
            f.putmsg(_nsPad(' ' + row.label, w));
            continue;
        }
        var isSel = (line === this._selectedIndex);
        var rowAttr = isSel ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
        var valueStr = this._valueStr(row);
        var label = ' ' + (isSel ? '\x01h' : '') + row.label + '\x01n';
        var labelLen = (' ' + row.label).length;
        var gap = Math.max(1, w - labelLen - valueStr.length - 1);
        var gapStr = ''; while (gap-- > 0) gapStr += ' ';
        f.attr = rowAttr; f.putmsg(label);
        f.attr = rowAttr; f.putmsg(gapStr + valueStr + ' \x01n');
    }
};

NewsreaderSettings.prototype._renderStatus = function () {
    if (!this._statusFrame) return;
    this._statusFrame.clear(this.paletteAttr('STATUS'));
    this._statusFrame.gotoxy(1, 1);
    this._statusFrame.putmsg(this._statusText || '');
};

NewsreaderSettings.prototype._redraw = function () {
    this._renderList();
    this._renderStatus();
    if (this._frame) this._frame.cycle();
};

NewsreaderSettings.prototype._findSelectable = function (startIdx, direction) {
    var rows = this._rows;
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

NewsreaderSettings.prototype._move = function (direction) {
    var next = this._findSelectable(this._selectedIndex + direction, direction);
    if (next !== -1) this._selectedIndex = next;
    this._redraw();
};

NewsreaderSettings.prototype._toggleColorMode = function (row, dir) {
    if (!this.store || typeof this.store.setNewsreaderColorMode !== 'function') return;
    var order = ['16', 'truecolor', 'sixel'];
    var labels = { '16': '16-color', 'truecolor': 'Truecolor', 'sixel': 'Sixel' };
    var idx = order.indexOf(row.value);
    if (idx < 0) idx = 0;
    idx = (idx + (dir < 0 ? -1 : 1) + order.length) % order.length;
    var next = order[idx];
    this.store.setNewsreaderColorMode(next);
    row.value = next;
    this._statusText = ' Image Colour: ' + labels[next];
    this._redraw();
};

NewsreaderSettings.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;
    if (key === '\x1B' || key === 'q' || key === 'Q' || key === '\b' || key === '\x7f') { this.exit(); return true; }
    if (_nsIsUp(key)) { this._move(-1); return true; }
    if (_nsIsDown(key)) { this._move(1); return true; }
    var row = this._rows[this._selectedIndex];
    if (!row) return false;
    if (_nsIsLeft(key)) {
        if (row.type === 'choice' && row.key === 'colorMode') this._toggleColorMode(row, -1);
        return true;
    }
    if (_nsIsRight(key) || key === ' ' || key === '\r') {
        if (row.type === 'choice' && row.key === 'colorMode') this._toggleColorMode(row, 1);
        return true;
    }
    return false;
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ NewsreaderSettings: NewsreaderSettings });
}
