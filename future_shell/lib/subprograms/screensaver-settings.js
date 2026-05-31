"use strict";

// ===========================================================================
// ScreensaverSettings - screensaver preferences UI
// ---------------------------------------------------------------------------
// A focused settings subprogram for the screensaver: inactivity timeout,
// switch interval, random order, and per-saver enable/reorder. Thin UI over
// the shared ShellPrefs store (shell._getShellPrefs()); the store owns the
// data, enumeration of available savers, and persistence. Saving propagates
// to the live screensaver via shell.onShellPrefsSaved(). Split out of the
// former combined shell_prefs UI.
// ===========================================================================

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN', 'BG_GREEN',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'CYAN', 'GREEN', 'BLACK',
    'LIGHTGREEN', 'LIGHTRED', 'DARKGRAY',
    'KEY_UP', 'KEY_DOWN', 'KEY_LEFT', 'KEY_RIGHT', 'KEY_HOME', 'KEY_END'
);

var SS_TIMEOUT_STEP = 30;   // seconds per Left/Right adjustment
var SS_SWITCH_STEP = 15;

// Mirror the store's clamp semantics (the originals are module-private there).
function _ssClampTimeout(seconds) {
    var n = parseInt(seconds, 10);
    if (isNaN(n)) return 180;
    if (n <= 0) return -1;       // 0 or less = never
    if (n < 30) return 30;
    return n;
}
function _ssClampSwitch(seconds) {
    var n = parseInt(seconds, 10);
    if (isNaN(n) || n <= 0) return 30;
    if (n < 5) return 5;
    return n;
}

function _ssPad(str, width) {
    var display = str.replace(/\x01./g, '');
    var need = width - display.length;
    if (need <= 0) return str;
    var spaces = '';
    while (need-- > 0) spaces += ' ';
    return str + spaces;
}

// Synchronet inkey() delivers arrows as control-char strings (key_defs.js):
// Up=\x1e Down=\x0a Left=\x1d Right=\x06. Match those literals directly rather
// than relying on KEY_* being in scope. Raw ANSI sequences accepted as fallback.
function _ssIsUp(key)    { return key === '\x1e' || key === '\x1B[A' || key === '\x1BOA'; }
function _ssIsDown(key)  { return key === '\x0a' || key === '\x1B[B' || key === '\x1BOB'; }
function _ssIsLeft(key)  { return key === '\x1d' || key === '\x1B[D' || key === '\x1BOD'; }
function _ssIsRight(key) { return key === '\x06' || key === '\x1B[C' || key === '\x1BOC'; }
function _ssIsHome(key)  { return key === '\x02' || key === '\x1B[H' || key === '\x1BOH' || key === '\x1B[1~'; }
function _ssIsEnd(key)   { return key === '\x05' || key === '\x1B[F' || key === '\x1BOF' || key === '\x1B[4~'; }

function ScreensaverSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'screensaver-settings', parentFrame: opts.parentFrame });
    this.id = 'screensaver-settings';
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
        VALUE:        { BG: BG_BLACK, FG: LIGHTGREEN },
        SAVER_OFF:    { BG: BG_BLACK, FG: DARKGRAY },
        STATUS:       { BG: BG_BLUE,  FG: WHITE }
    });
}

extend(ScreensaverSettings, Subprogram);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

ScreensaverSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.store = (this.shell && typeof this.shell._getShellPrefs === 'function') ? this.shell._getShellPrefs() : null;
    if (this.store && typeof this.store._initializeScreensaverState === 'function') {
        try { this.store._initializeScreensaverState(); } catch (_e) { }
    }
    this._buildRows();
    this._selectedIndex = 0;
    this._scrollOffset = 0;
    var first = this._findSelectable(0, 1);
    if (first !== -1) this._selectedIndex = first;
    this._statusText = ' \x01cUp/Down\x01w:move  \x01cLeft/Right\x01w:adjust  \x01cSpace\x01w:toggle  \x01c[ ]\x01w:reorder  \x01cESC\x01w:close';
    this.draw();
};

ScreensaverSettings.prototype.exit = function () {
    if (this._statusFrame) { this._statusFrame.delete(); this._statusFrame = null; }
    if (this._listFrame) { this._listFrame.delete(); this._listFrame = null; }
    if (this._headerFrame) { this._headerFrame.delete(); this._headerFrame = null; }
    if (this._frame) { this._frame.delete(); this._frame = null; }
    Subprogram.prototype.exit.call(this);
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

ScreensaverSettings.prototype._cfg = function () {
    if (this.store && this.store.preferences && this.store.preferences.screensaver) {
        return this.store.preferences.screensaver;
    }
    return null;
};

ScreensaverSettings.prototype._buildRows = function () {
    var rows = [];
    var cfg = this._cfg();
    if (!cfg) {
        rows.push({ type: 'message', label: 'Preferences unavailable.', selectable: false });
        this._rows = rows;
        return;
    }
    rows.push({ type: 'section', label: 'Screensaver', selectable: false });
    rows.push({ type: 'number', key: 'timeout', label: 'Inactivity Timeout', value: cfg.timeoutSeconds, selectable: true });
    rows.push({ type: 'number', key: 'switch_interval', label: 'Switch Interval', value: cfg.switchIntervalSeconds, selectable: true });
    rows.push({ type: 'toggle', key: 'random_order', label: 'Random Order', value: !!cfg.randomOrder, selectable: true });
    rows.push({ type: 'section', label: 'Screensavers', selectable: false });
    var list = (this.store && this.store._saverList) ? this.store._saverList : [];
    for (var i = 0; i < list.length; i++) {
        var s = list[i];
        rows.push({
            type: 'saver',
            key: s.name,
            label: s.label,
            enabled: !!s.enabled,
            disabled: !!s.disabled,
            order: s.disabled ? null : s.index,
            selectable: !s.disabled
        });
    }
    this._rows = rows;
};

// ---------------------------------------------------------------------------
// Frames - full-screen: header on row 1, status on the last row.
// ---------------------------------------------------------------------------

ScreensaverSettings.prototype._ensureFrames = function () {
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

ScreensaverSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._renderHeader();
    this._renderList();
    this._renderStatus();
    this._frame.cycle();
};

ScreensaverSettings.prototype._renderHeader = function () {
    if (!this._headerFrame) return;
    this._headerFrame.clear(this.paletteAttr('TITLE'));
    this._headerFrame.gotoxy(1, 1);
    this._headerFrame.center(' Screensaver Settings ');
};

ScreensaverSettings.prototype._fmtTimeout = function (v) {
    return (v === -1) ? 'Never' : (v + ' sec');
};

ScreensaverSettings.prototype._renderList = function () {
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

ScreensaverSettings.prototype._renderRow = function (row, isSelected, w) {
    var f = this._listFrame;
    if (!row) return;
    if (row.type === 'section') {
        f.attr = this.paletteAttr('SECTION');
        f.putmsg(_ssPad('\x01h ' + row.label + ' ', w) + '\x01n');
        return;
    }
    if (row.type === 'message') {
        f.attr = this.paletteAttr('ROW_NORMAL');
        f.putmsg(_ssPad(' ' + row.label, w));
        return;
    }
    var rowAttr = isSelected ? this.paletteAttr('ROW_ACTIVE') : this.paletteAttr('ROW_NORMAL');
    var valueStr = '';
    if (row.type === 'number') valueStr = (row.key === 'timeout') ? this._fmtTimeout(row.value) : (row.value + ' sec');
    else if (row.type === 'toggle') valueStr = row.value ? 'ON' : 'OFF';
    else if (row.type === 'saver') valueStr = row.disabled ? '(unavailable)' : (row.enabled ? '[x]' : '[ ]');

    if (row.type === 'saver' && row.disabled) {
        f.attr = this.paletteAttr('SAVER_OFF');
        f.putmsg(_ssPad(' ' + row.label + '  ' + valueStr, w));
        return;
    }

    var label = ' ' + (isSelected ? '\x01h' : '') + row.label + '\x01n';
    var labelLen = (' ' + row.label).length;
    var gap = Math.max(1, w - labelLen - valueStr.length - 1);
    var gapStr = '';
    while (gap-- > 0) gapStr += ' ';
    f.attr = rowAttr;
    f.putmsg(label);
    f.attr = rowAttr;
    f.putmsg(gapStr + valueStr + ' \x01n');
};

ScreensaverSettings.prototype._renderStatus = function () {
    if (!this._statusFrame) return;
    this._statusFrame.clear(this.paletteAttr('STATUS'));
    this._statusFrame.gotoxy(1, 1);
    this._statusFrame.putmsg(this._statusText || '');
};

ScreensaverSettings.prototype._redraw = function () {
    this._renderList();
    this._renderStatus();
    if (this._frame) this._frame.cycle();
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

ScreensaverSettings.prototype._findSelectable = function (startIdx, direction) {
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

ScreensaverSettings.prototype._move = function (direction) {
    var next = this._findSelectable(this._selectedIndex + direction, direction);
    if (next !== -1) this._selectedIndex = next;
    this._redraw();
};

// Rebuild rows after a data change, keeping the cursor on the same row key.
ScreensaverSettings.prototype._rebuildKeepingFocus = function (key) {
    this._buildRows();
    if (key) {
        for (var i = 0; i < this._rows.length; i++) {
            if (this._rows[i].key === key) { this._selectedIndex = i; break; }
        }
    }
    if (this._selectedIndex >= this._rows.length) this._selectedIndex = this._rows.length - 1;
    this._redraw();
};

ScreensaverSettings.prototype._persist = function () {
    if (!this.store) return;
    this.store._touch();
    this.store.save();
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

ScreensaverSettings.prototype._adjustNumber = function (row, delta) {
    var cfg = this._cfg();
    if (!cfg) return;
    if (row.key === 'timeout') {
        var t = (cfg.timeoutSeconds === -1) ? 0 : cfg.timeoutSeconds;
        t += delta * SS_TIMEOUT_STEP;
        cfg.timeoutSeconds = _ssClampTimeout(t);
        this._statusText = ' Inactivity Timeout: ' + this._fmtTimeout(cfg.timeoutSeconds);
    } else if (row.key === 'switch_interval') {
        cfg.switchIntervalSeconds = _ssClampSwitch(cfg.switchIntervalSeconds + delta * SS_SWITCH_STEP);
        this._statusText = ' Switch Interval: ' + cfg.switchIntervalSeconds + ' sec';
    } else {
        return;
    }
    this._persist();
    this._rebuildKeepingFocus(row.key);
};

ScreensaverSettings.prototype._toggleRandom = function () {
    var cfg = this._cfg();
    if (!cfg) return;
    cfg.randomOrder = !cfg.randomOrder;
    this._statusText = ' Random Order ' + (cfg.randomOrder ? 'enabled' : 'disabled');
    this._persist();
    this._rebuildKeepingFocus('random_order');
};

ScreensaverSettings.prototype._toggleSaver = function (row) {
    var cfg = this._cfg();
    if (!cfg || !row || row.disabled) return;
    if (!cfg.enabled || typeof cfg.enabled !== 'object') cfg.enabled = {};
    var currentlyEnabled = cfg.enabled[row.key] !== false;
    if (currentlyEnabled) {
        // Keep at least one enabled.
        var enabledCount = 0;
        var list = this.store._saverList || [];
        for (var i = 0; i < list.length; i++) if (list[i].enabled) enabledCount++;
        if (enabledCount <= 1) {
            this._statusText = ' At least one screensaver must remain enabled.';
            this._redraw();
            return;
        }
        cfg.enabled[row.key] = false;
    } else {
        cfg.enabled[row.key] = true;
    }
    if (typeof this.store._reconcileScreensaverOrder === 'function') this.store._reconcileScreensaverOrder();
    this._statusText = ' ' + row.label + ' ' + (cfg.enabled[row.key] !== false ? 'enabled' : 'disabled');
    this._persist();
    this._rebuildKeepingFocus(row.key);
};

ScreensaverSettings.prototype._moveSaver = function (row, delta) {
    var cfg = this._cfg();
    if (!cfg || !row || row.disabled) return;
    if (cfg.randomOrder) {
        this._statusText = ' Disable Random Order to reorder screensavers.';
        this._redraw();
        return;
    }
    var order = cfg.order || [];
    var idx = order.indexOf(row.key);
    if (idx === -1) return;
    var newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) {
        this._statusText = delta < 0 ? ' Already at the top.' : ' Already at the bottom.';
        this._redraw();
        return;
    }
    order.splice(idx, 1);
    order.splice(newIdx, 0, row.key);
    if (typeof this.store._reconcileScreensaverOrder === 'function') this.store._reconcileScreensaverOrder();
    this._statusText = ' Moved ' + row.label + ' to position ' + (newIdx + 1);
    this._persist();
    this._rebuildKeepingFocus(row.key);
};

ScreensaverSettings.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;
    if (key === '\x1B' || key === 'q' || key === 'Q' || key === '\b' || key === '\x7f') {
        this.exit();
        return true;
    }
    if (_ssIsUp(key)) { this._move(-1); return true; }
    if (_ssIsDown(key)) { this._move(1); return true; }
    if (_ssIsHome(key)) {
        var f = this._findSelectable(0, 1);
        if (f !== -1) { this._selectedIndex = f; this._redraw(); }
        return true;
    }
    if (_ssIsEnd(key)) {
        var l = this._findSelectable(this._rows.length - 1, -1);
        if (l !== -1) { this._selectedIndex = l; this._redraw(); }
        return true;
    }

    var row = this._rows[this._selectedIndex];
    if (!row) return false;

    if (_ssIsLeft(key)) {
        if (row.type === 'number') this._adjustNumber(row, -1);
        else if (row.type === 'toggle') this._toggleRandom();
        return true;
    }
    if (_ssIsRight(key)) {
        if (row.type === 'number') this._adjustNumber(row, 1);
        else if (row.type === 'toggle') this._toggleRandom();
        return true;
    }
    if (key === '[') { if (row.type === 'saver') this._moveSaver(row, -1); return true; }
    if (key === ']') { if (row.type === 'saver') this._moveSaver(row, 1); return true; }

    // Space/Enter activate a discrete toggle. Numbers change via Left/Right.
    // Never bind KEY_DOWN ('\n') here - Up/Down only move the selection.
    if (key === ' ' || key === '\r' || (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER)) {
        if (row.type === 'toggle') this._toggleRandom();
        else if (row.type === 'saver') this._toggleSaver(row);
        return true;
    }
    return false;
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ ScreensaverSettings: ScreensaverSettings });
}
