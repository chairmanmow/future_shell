"use strict";

// ===========================================================================
// ChatSettings - MRC chat appearance UI
// ---------------------------------------------------------------------------
// A focused settings subprogram for MRC chat appearance: bracket characters,
// bracket/name/message colors. Thin UI over the shared ShellPrefs store
// (shell._getShellPrefs()); the store owns persistence and the MRC color API
// (getMrcMsgColor/Bg, getMrcAlias) consumed by the chat/MRC subsystems.
// Split out of the former combined shell_prefs UI.
// ===========================================================================

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'CYAN', 'BLACK',
    'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_HOME', 'KEY_END'
);

// Color name tables (mirrors the originals in shell_prefs.js).
var CS_FG_NAMES = [
    'Black', 'Blue', 'Green', 'Cyan', 'Red', 'Magenta', 'Brown', 'Gray',
    'Dark Gray', 'Light Blue', 'Light Green', 'Light Cyan', 'Light Red', 'Light Magenta', 'Yellow', 'White'
];
var CS_BG_NAMES = ['Black', 'Blue', 'Green', 'Cyan', 'Red', 'Magenta', 'Brown', 'Gray'];
var CS_ALL_FG = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
var CS_ALL_BG = [0, 1, 2, 3, 4, 5, 6, 7];
// Message foreground excludes black(0)/blue(1) - illegible on a black field.
var CS_MSG_FG = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
var CS_BRACKET_PRESETS = ['<', '>', '[', ']', '(', ')', '{', '}', '|', ':', '*', '!', '~', '-'];

function _csPad(str, width) {
    var display = str.replace(/\x01./g, '');
    var need = width - display.length;
    if (need <= 0) return str;
    var spaces = '';
    while (need-- > 0) spaces += ' ';
    return str + spaces;
}
function _csColorAttr(fg, bg) {
    return (fg & 0x0F) | ((bg & 0x07) << 4);
}
// Synchronet inkey() delivers arrows as control-char strings (key_defs.js):
// Up=\x1e Down=\x0a Left=\x1d Right=\x06. Match those literals directly rather
// than relying on KEY_* being in scope. Raw ANSI sequences accepted as fallback.
function _csIsUp(key)    { return key === '\x1e' || key === '\x1B[A' || key === '\x1BOA'; }
function _csIsDown(key)  { return key === '\x0a' || key === '\x1B[B' || key === '\x1BOB'; }
function _csIsLeft(key)  { return key === '\x1d' || key === '\x1B[D' || key === '\x1BOD'; }
function _csIsRight(key) { return key === '\x06' || key === '\x1B[C' || key === '\x1BOC'; }
function _csIsHome(key)  { return key === '\x02' || key === '\x1B[H' || key === '\x1BOH' || key === '\x1B[1~'; }
function _csIsEnd(key)   { return key === '\x05' || key === '\x1B[F' || key === '\x1BOF' || key === '\x1B[4~'; }

function ChatSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'chat-settings', parentFrame: opts.parentFrame });
    this.id = 'chat-settings';
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
        BG:         { BG: BG_BLACK, FG: LIGHTGRAY },
        TITLE:      { BG: BG_BLUE,  FG: WHITE },
        ROW_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },
        ROW_ACTIVE: { BG: BG_CYAN,  FG: BLACK },
        SECTION:    { BG: BG_BLACK, FG: YELLOW },
        STATUS:     { BG: BG_BLUE,  FG: WHITE }
    });
}

extend(ChatSettings, Subprogram);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

ChatSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.store = (this.shell && typeof this.shell._getShellPrefs === 'function') ? this.shell._getShellPrefs() : null;
    this._buildRows();
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    var first = this._findSelectable(0, 1);
    if (first !== -1) this._selectedIndex = first;
    this._statusText = ' \x01cUp/Down\x01w:move  \x01cLeft/Right\x01w:change  \x01cESC\x01w:close';
    this.draw();
};

ChatSettings.prototype.exit = function () {
    if (this._statusFrame) { this._statusFrame.delete(); this._statusFrame = null; }
    if (this._listFrame) { this._listFrame.delete(); this._listFrame = null; }
    if (this._headerFrame) { this._headerFrame.delete(); this._headerFrame = null; }
    if (this._frame) { this._frame.delete(); this._frame = null; }
    Subprogram.prototype.exit.call(this);
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

ChatSettings.prototype._mrc = function () {
    if (this.store && this.store.preferences) {
        if (!this.store.preferences.mrc) this.store.preferences.mrc = {};
        return this.store.preferences.mrc;
    }
    return null;
};

ChatSettings.prototype._buildRows = function () {
    var rows = [];
    var mrc = this._mrc();
    if (!mrc) {
        rows.push({ type: 'message', label: 'Preferences unavailable.', selectable: false });
        this._rows = rows;
        return;
    }
    rows.push({ type: 'section', label: 'Brackets', selectable: false });
    rows.push({ type: 'char', key: 'bracket_open', label: 'Open Character', selectable: true });
    rows.push({ type: 'char', key: 'bracket_close', label: 'Close Character', selectable: true });
    rows.push({ type: 'color', key: 'bracket_fg', label: 'Bracket Foreground', list: CS_ALL_FG, isBg: false, selectable: true });
    rows.push({ type: 'color', key: 'bracket_bg', label: 'Bracket Background', list: CS_ALL_BG, isBg: true, selectable: true });
    rows.push({ type: 'section', label: 'Name', selectable: false });
    rows.push({ type: 'color', key: 'name_fg', label: 'Name Foreground', list: CS_ALL_FG, isBg: false, selectable: true });
    rows.push({ type: 'color', key: 'name_bg', label: 'Name Background', list: CS_ALL_BG, isBg: true, selectable: true });
    rows.push({ type: 'section', label: 'Message', selectable: false });
    rows.push({ type: 'color', key: 'msg_fg', label: 'Message Foreground', list: CS_MSG_FG, isBg: false, selectable: true });
    rows.push({ type: 'color', key: 'msg_bg', label: 'Message Background', list: CS_ALL_BG, isBg: true, selectable: true });
    rows.push({ type: 'section', label: 'Preview', selectable: false });
    rows.push({ type: 'preview', label: '', selectable: false });
    this._rows = rows;
};

// ---------------------------------------------------------------------------
// Frames - full-screen: header on row 1, status on the last row.
// ---------------------------------------------------------------------------

ChatSettings.prototype._ensureFrames = function () {
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

ChatSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._renderHeader();
    this._renderList();
    this._renderStatus();
    this._frame.cycle();
};

ChatSettings.prototype._renderHeader = function () {
    if (!this._headerFrame) return;
    this._headerFrame.clear(this.paletteAttr('TITLE'));
    this._headerFrame.gotoxy(1, 1);
    this._headerFrame.center(' Chat Settings ');
};

ChatSettings.prototype._renderList = function () {
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
        f.gotoxy(1, line + 1);
        this._renderRow(this._rows[idx], idx === this._selectedIndex, w);
    }
};

ChatSettings.prototype._renderRow = function (row, isSelected, w) {
    var f = this._listFrame;
    if (!row) return;
    var mrc = this._mrc();
    if (row.type === 'section') {
        f.attr = this.paletteAttr('SECTION');
        f.putmsg(_csPad('\x01h ' + row.label + ' ', w) + '\x01n');
        return;
    }
    if (row.type === 'message') {
        f.attr = this.paletteAttr('ROW_NORMAL');
        f.putmsg(_csPad(' ' + row.label, w));
        return;
    }
    if (row.type === 'preview') {
        this._renderPreviewRow(f, mrc, w);
        return;
    }
    var rowAttr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
    var label = ' ' + (isSelected ? '\x01h' : '') + row.label + '\x01n';
    var labelLen = (' ' + row.label).length;

    if (row.type === 'char') {
        var ch = mrc[row.key] || '?';
        var valueText = "'" + ch + "'";
        var gap = Math.max(1, w - labelLen - valueText.length - 1);
        var gapStr = ''; while (gap-- > 0) gapStr += ' ';
        f.attr = rowAttr;
        f.putmsg(label);
        f.attr = rowAttr;
        f.putmsg(gapStr + valueText + ' \x01n');
        return;
    }
    if (row.type === 'color') {
        var val = (typeof mrc[row.key] === 'number') ? mrc[row.key] : 0;
        var name = row.isBg ? (CS_BG_NAMES[val] || ('' + val)) : (CS_FG_NAMES[val] || ('' + val));
        // value text + a 2-char swatch + trailing space
        var reserved = name.length + 4; // space + swatch(2) + trailing space
        var gap2 = Math.max(1, w - labelLen - reserved);
        var gapStr2 = ''; while (gap2-- > 0) gapStr2 += ' ';
        f.attr = rowAttr;
        f.putmsg(label);
        f.attr = rowAttr;
        f.putmsg(gapStr2 + name + ' ');
        // swatch: for fg show colored blocks on black; for bg show two spaces in that bg
        if (row.isBg) {
            f.attr = _csColorAttr(7, val);
            f.putmsg('  ');
        } else {
            f.attr = _csColorAttr(val, 0);
            f.putmsg('\xDB\xDB');
        }
        f.attr = rowAttr;
        f.putmsg(' ');
        return;
    }
};

ChatSettings.prototype._renderPreviewRow = function (f, mrc, w) {
    // Cursor is already at column 1 of this row (set by _renderList); the list
    // frame was cleared, so just print a leading space then colored segments.
    f.attr = this.paletteAttr('BG');
    f.putmsg(' ');
    // segments: open bracket, name, close bracket, ': message'
    var alias = (this.store && this.store.userAlias) ? this.store.userAlias : 'guest';
    var brAttr = _csColorAttr(mrc.bracket_fg || 0, mrc.bracket_bg || 0);
    var nmAttr = _csColorAttr(mrc.name_fg || 0, mrc.name_bg || 0);
    var msgAttr = _csColorAttr(mrc.msg_fg || 7, mrc.msg_bg || 0);
    f.attr = brAttr; f.putmsg(mrc.bracket_open || '<');
    f.attr = nmAttr; f.putmsg(alias);
    f.attr = brAttr; f.putmsg(mrc.bracket_close || '>');
    f.attr = this.paletteAttr('BG'); f.putmsg(' ');
    f.attr = msgAttr; f.putmsg('hello there');
    f.attr = this.paletteAttr('BG');
};

ChatSettings.prototype._renderStatus = function () {
    if (!this._statusFrame) return;
    this._statusFrame.clear(this.paletteAttr('STATUS'));
    this._statusFrame.gotoxy(1, 1);
    this._statusFrame.putmsg(this._statusText || '');
};

ChatSettings.prototype._redraw = function () {
    this._renderList();
    this._renderStatus();
    if (this._frame) this._frame.cycle();
};

// ---------------------------------------------------------------------------
// Navigation + actions
// ---------------------------------------------------------------------------

ChatSettings.prototype._findSelectable = function (startIdx, direction) {
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

ChatSettings.prototype._move = function (direction) {
    var next = this._findSelectable(this._selectedIndex + direction, direction);
    if (next !== -1) this._selectedIndex = next;
    this._redraw();
};

ChatSettings.prototype._persist = function () {
    if (!this.store) return;
    this.store._touch();
    this.store.save();
};

ChatSettings.prototype._cycleColor = function (row, delta) {
    var mrc = this._mrc();
    if (!mrc) return;
    var list = row.list || CS_ALL_FG;
    var cur = (typeof mrc[row.key] === 'number') ? mrc[row.key] : list[0];
    var pos = list.indexOf(cur);
    if (pos === -1) pos = 0;
    pos = (pos + delta + list.length) % list.length;
    mrc[row.key] = list[pos];
    var name = row.isBg ? CS_BG_NAMES[list[pos]] : CS_FG_NAMES[list[pos]];
    this._statusText = ' ' + row.label + ': ' + name;
    this._persist();
    this._redraw();
};

ChatSettings.prototype._cycleChar = function (row, delta) {
    var mrc = this._mrc();
    if (!mrc) return;
    var cur = mrc[row.key] || CS_BRACKET_PRESETS[0];
    var pos = CS_BRACKET_PRESETS.indexOf(cur);
    if (pos === -1) pos = 0;
    pos = (pos + delta + CS_BRACKET_PRESETS.length) % CS_BRACKET_PRESETS.length;
    mrc[row.key] = CS_BRACKET_PRESETS[pos];
    this._statusText = ' ' + row.label + ": '" + mrc[row.key] + "'";
    this._persist();
    this._redraw();
};

ChatSettings.prototype._setChar = function (row, ch) {
    var mrc = this._mrc();
    if (!mrc) return;
    mrc[row.key] = ch;
    this._statusText = ' ' + row.label + ": '" + ch + "'";
    this._persist();
    this._redraw();
};

ChatSettings.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;
    if (key === '\x1B' || key === '\b' || key === '\x7f') {
        this.exit();
        return true;
    }
    if (_csIsUp(key)) { this._move(-1); return true; }
    if (_csIsDown(key)) { this._move(1); return true; }
    if (_csIsHome(key)) {
        var fi = this._findSelectable(0, 1);
        if (fi !== -1) { this._selectedIndex = fi; this._redraw(); }
        return true;
    }
    if (_csIsEnd(key)) {
        var li = this._findSelectable(this._rows.length - 1, -1);
        if (li !== -1) { this._selectedIndex = li; this._redraw(); }
        return true;
    }

    var row = this._rows[this._selectedIndex];
    if (!row) return false;

    // Left/Right change the value on the selected lightbar row. Up/Down only
    // move the selection (handled above) - never bind KEY_DOWN ('\n') here.
    if (_csIsLeft(key)) {
        if (row.type === 'color') this._cycleColor(row, -1);
        else if (row.type === 'char') this._cycleChar(row, -1);
        return true;
    }
    if (_csIsRight(key)) {
        if (row.type === 'color') this._cycleColor(row, 1);
        else if (row.type === 'char') this._cycleChar(row, 1);
        return true;
    }
    // On a bracket-character row, a single printable key sets it directly.
    if (row.type === 'char' && typeof key === 'string' && key.length === 1) {
        var code = key.charCodeAt(0);
        if (code >= 33 && code <= 126) { this._setChar(row, key); return true; }
    }
    return false;
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ ChatSettings: ChatSettings });
}
