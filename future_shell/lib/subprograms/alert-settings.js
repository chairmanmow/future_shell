"use strict";

// ===========================================================================
// AlertSettings - notification preferences UI
// ---------------------------------------------------------------------------
// A focused settings subprogram for notification toggles. It is a thin UI over
// the shared ShellPrefs store (obtained via shell._getShellPrefs()); the store
// owns persistence and the notification API consumed elsewhere in the shell.
// Split out of the former combined shell_prefs UI.
// ===========================================================================

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN', 'BG_GREEN', 'BG_RED',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'CYAN', 'GREEN', 'RED', 'BLACK',
    'LIGHTGREEN', 'LIGHTRED', 'LIGHTCYAN',
    'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_HOME', 'KEY_END'
);

// Notification states cycle in this order (matches the store's vocabulary).
var ALERT_STATE_CYCLE = ['on', 'snooze', 'off'];

function _alertTitleCase(str) {
    str = String(str || '').replace(/[_\-]+/g, ' ');
    return str.replace(/\w\S*/g, function (t) {
        return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase();
    });
}

function _alertPad(str, width) {
    var display = str.replace(/\x01./g, '');
    var need = width - display.length;
    if (need <= 0) return str;
    var spaces = '';
    while (need-- > 0) spaces += ' ';
    return str + spaces;
}

// Synchronet inkey() delivers arrows as control-char strings (key_defs.js):
// Up=\x1e Down=\x0a Left=\x1d Right=\x06. Match those literals directly rather
// than relying on KEY_* being in scope (they may not be / may be shadowed).
// Also accept raw ANSI sequences as a fallback.
function _alertIsUp(key)    { return key === '\x1e' || key === '\x1B[A' || key === '\x1BOA'; }
function _alertIsDown(key)  { return key === '\x0a' || key === '\x1B[B' || key === '\x1BOB'; }
function _alertIsLeft(key)  { return key === '\x1d' || key === '\x1B[D' || key === '\x1BOD'; }
function _alertIsRight(key) { return key === '\x06' || key === '\x1B[C' || key === '\x1BOC'; }
function _alertIsHome(key)  { return key === '\x02' || key === '\x1B[H' || key === '\x1BOH' || key === '\x1B[1~'; }
function _alertIsEnd(key)   { return key === '\x05' || key === '\x1B[F' || key === '\x1BOF' || key === '\x1B[4~'; }

function AlertSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'alert-settings', parentFrame: opts.parentFrame });
    this.id = 'alert-settings';
    this.themeNamespace = this.id;
    this.shell = opts.shell || null;

    this._frame = null;
    this._headerFrame = null;
    this._listFrame = null;
    this._statusFrame = null;

    this.store = null;
    this._rows = [];
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    this._statusText = '';

    this.registerColors({
        BG:           { BG: BG_BLACK, FG: LIGHTGRAY },
        TITLE:        { BG: BG_BLUE,  FG: WHITE },
        ROW_NORMAL:   { BG: BG_BLACK, FG: LIGHTGRAY },
        ROW_ACTIVE:   { BG: BG_CYAN,  FG: BLACK },
        SECTION:      { BG: BG_BLACK, FG: YELLOW },
        STATE_ON:     { BG: BG_BLACK, FG: LIGHTGREEN },
        STATE_SNOOZE: { BG: BG_BLACK, FG: YELLOW },
        STATE_OFF:    { BG: BG_BLACK, FG: LIGHTRED },
        STATUS:       { BG: BG_BLUE,  FG: WHITE }
    });
}

extend(AlertSettings, Subprogram);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

AlertSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.store = (this.shell && typeof this.shell._getShellPrefs === 'function') ? this.shell._getShellPrefs() : null;
    this._buildRows();
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    var first = this._findSelectable(0, 1);
    if (first !== -1) this._selectedIndex = first;
    this._statusText = ' \x01cUp/Down\x01w:move  \x01cEnter/Space\x01w:cycle  \x01cESC\x01w:close';
    this.draw();
};

AlertSettings.prototype.exit = function () {
    if (this._statusFrame) { this._statusFrame.delete(); this._statusFrame = null; }
    if (this._listFrame) { this._listFrame.delete(); this._listFrame = null; }
    if (this._headerFrame) { this._headerFrame.delete(); this._headerFrame = null; }
    if (this._frame) { this._frame.delete(); this._frame = null; }
    Subprogram.prototype.exit.call(this);
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

AlertSettings.prototype._buildRows = function () {
    var rows = [];
    if (!this.store) {
        rows.push({ type: 'message', label: 'Preferences unavailable.', selectable: false });
        this._rows = rows;
        return;
    }
    rows.push({ type: 'section', label: 'Notifications', selectable: false });
    rows.push({
        type: 'global',
        key: 'global',
        label: 'All Notifications',
        state: this.store.getGlobalState(),
        selectable: true
    });
    rows.push({ type: 'section', label: 'Categories', selectable: false });
    var cats = this.store.listCategories();
    cats.sort();
    for (var i = 0; i < cats.length; i++) {
        rows.push({
            type: 'category',
            key: cats[i],
            label: _alertTitleCase(cats[i]),
            state: this.store.getCategoryState(cats[i]),
            selectable: true
        });
    }
    this._rows = rows;
};

// ---------------------------------------------------------------------------
// Frames - full-screen: header on row 1, status on the last row.
// The shell hands subprograms its "view" frame, so derive the real screen
// extent from the top-level frame instead of parentFrame.height.
// ---------------------------------------------------------------------------

AlertSettings.prototype._ensureFrames = function () {
    if (!this.parentFrame || this._frame) return;
    var rf = this.parentFrame;
    while (rf.parent) rf = rf.parent;
    var originX = rf.x;
    var topY = rf.y;
    var width = rf.width;
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

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

AlertSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._renderHeader();
    this._renderList();
    this._renderStatus();
    this._frame.cycle();
};

AlertSettings.prototype._renderHeader = function () {
    if (!this._headerFrame) return;
    this._headerFrame.clear(this.paletteAttr('TITLE'));
    this._headerFrame.gotoxy(1, 1);
    this._headerFrame.center(' Notification Settings ');
};

AlertSettings.prototype._stateLabel = function (state) {
    if (state === 'off') return { text: 'OFF', attr: this.paletteAttr('STATE_OFF') };
    if (state === 'snooze') return { text: 'SNOOZE', attr: this.paletteAttr('STATE_SNOOZE') };
    return { text: 'ON', attr: this.paletteAttr('STATE_ON') };
};

AlertSettings.prototype._renderList = function () {
    if (!this._listFrame) return;
    var f = this._listFrame;
    f.clear(this.paletteAttr('BG'));
    var h = f.height;
    var w = f.width;

    var selIdx = this._selectedIndex;
    if (selIdx < this._scrollOffset) this._scrollOffset = selIdx;
    if (selIdx >= this._scrollOffset + h) this._scrollOffset = selIdx - h + 1;
    if (this._scrollOffset < 0) this._scrollOffset = 0;

    for (var line = 0; line < h; line++) {
        var idx = this._scrollOffset + line;
        if (idx >= this._rows.length) break;
        var row = this._rows[idx];
        var isSelected = (idx === this._selectedIndex);
        f.gotoxy(1, line + 1);
        this._renderRow(row, isSelected, w);
    }
};

AlertSettings.prototype._renderRow = function (row, isSelected, w) {
    var f = this._listFrame;
    if (!row) return;
    if (row.type === 'section') {
        f.attr = this.paletteAttr('SECTION');
        f.putmsg(_alertPad('\x01h ' + row.label + ' ', w) + '\x01n');
        return;
    }
    if (row.type === 'message') {
        f.attr = this.paletteAttr('ROW_NORMAL');
        f.putmsg(_alertPad(' ' + row.label, w));
        return;
    }
    // global / category row: label + right-aligned state badge
    var rowAttr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
    var st = this._stateLabel(row.state);
    var labelStr = ' ' + (isSelected ? '\x01h' : '') + row.label + '\x01n';
    var labelLen = (' ' + row.label).length;
    var gap = Math.max(1, w - labelLen - st.text.length - 1);
    var gapStr = '';
    while (gap-- > 0) gapStr += ' ';
    f.attr = rowAttr;
    f.putmsg(labelStr);
    f.attr = rowAttr;
    f.putmsg(gapStr);
    // state badge keeps its own color even on the active row
    f.putmsg('\x01n' + this._attrToCtrlA(st.attr) + st.text + ' \x01n');
};

// Render a numeric foreground attribute as ctrl-A color codes so a badge keeps
// its color regardless of the surrounding row attribute.
AlertSettings.prototype._attrToCtrlA = function (attr) {
    var fg = attr & 0x0F;
    var out = '\x01n';
    if (fg & 0x08) out += '\x01h';
    var fgBase = fg & 0x07;
    out += ['\x01k', '\x01b', '\x01g', '\x01c', '\x01r', '\x01m', '\x01y', '\x01w'][fgBase];
    return out;
};

AlertSettings.prototype._renderStatus = function () {
    if (!this._statusFrame) return;
    this._statusFrame.clear(this.paletteAttr('STATUS'));
    this._statusFrame.gotoxy(1, 1);
    this._statusFrame.putmsg(this._statusText || '');
};

AlertSettings.prototype._redraw = function () {
    this._renderList();
    this._renderStatus();
    if (this._frame) this._frame.cycle();
};

// ---------------------------------------------------------------------------
// Navigation + actions
// ---------------------------------------------------------------------------

AlertSettings.prototype._findSelectable = function (startIdx, direction) {
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

AlertSettings.prototype._move = function (direction) {
    var next = this._findSelectable(this._selectedIndex + direction, direction);
    if (next !== -1) this._selectedIndex = next;
    this._redraw();
};

AlertSettings.prototype._cycleCurrent = function (delta) {
    var row = this._rows[this._selectedIndex];
    if (!row || !this.store) return;
    if (typeof delta !== 'number' || !delta) delta = 1;
    var pos = ALERT_STATE_CYCLE.indexOf(row.state);
    if (pos === -1) pos = 0;
    var len = ALERT_STATE_CYCLE.length;
    var next = ALERT_STATE_CYCLE[(pos + delta + len) % len];
    if (row.type === 'global') {
        this.store.setGlobalState(next);
        row.state = this.store.getGlobalState();
    } else if (row.type === 'category') {
        this.store.setCategoryState(row.key, next);
        row.state = this.store.getCategoryState(row.key);
    } else {
        return;
    }
    this.store.save();
    this._statusText = ' ' + row.label + ' -> ' + this._stateLabel(row.state).text;
    this._redraw();
};

AlertSettings.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;
    if (key === '\x1B' || key === 'q' || key === 'Q' || key === '\b' || key === '\x7f') {
        this.exit();
        return true;
    }
    if (_alertIsUp(key)) { this._move(-1); return true; }
    if (_alertIsDown(key)) { this._move(1); return true; }
    if (_alertIsHome(key)) {
        var first = this._findSelectable(0, 1);
        if (first !== -1) { this._selectedIndex = first; this._redraw(); }
        return true;
    }
    if (_alertIsEnd(key)) {
        var last = this._findSelectable(this._rows.length - 1, -1);
        if (last !== -1) { this._selectedIndex = last; this._redraw(); }
        return true;
    }
    // Left/Right (and Space/Enter) change the value on the selected row.
    // Up/Down only move the selection - never bind KEY_DOWN ('\n') here.
    if (_alertIsLeft(key)) { this._cycleCurrent(-1); return true; }
    if (_alertIsRight(key) || key === ' ' || key === '\r' || (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER)) {
        this._cycleCurrent(1);
        return true;
    }
    return false;
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ AlertSettings: AlertSettings });
}
