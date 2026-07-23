// Private Message / Inter-BBS Instant Message Subprogram
// Uses sbbsimsg_lib.js for cross-BBS user discovery and MSP messaging.
// Views: INBOX (unread telegrams), USERS (lightbar active user list), COMPOSE.
"use strict";
function _repeat(ch, n) { var s = ""; for (var i = 0; i < n; i++) s += ch; return s; }

load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/subprograms/subprogram_hotspots.js');
try { load('future_shell/lib/effects/eye_candy.js'); } catch (_) { /* dissolve optional */ }
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
require('sbbsdefs.js', 'SS_USERON');
require('text.js', 'TelegramFmt');

// Spinning-globe backdrop for the USERS view (self-contained copy under
// future_shell; see lib/effects/ascii_globe.js). Optional — the view degrades
// gracefully to a plain background if the module or its texture is unavailable.
var GlobeMod = null;
try { GlobeMod = load({}, 'future_shell/lib/effects/ascii_globe.js'); } catch (_globeErr) { GlobeMod = null; }

function PrivateMsg(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'private-msg', parentFrame: opts.parentFrame, shell: opts.shell });
    this.id = 'private-msg';
    this.themeNamespace = this.id;
    this.view = 'INBOX';
    this.inputStr = '';
    this.lines = [];
    this.maxLines = 5;
    this.userList = [];
    this.cursorIdx = 0;
    this.scrollTop = 0;
    this.toDest = '';
    this.toLabel = '';
    this.sendResult = '';
    this.lib = null;
    this.userprops = null;
    this._lastPoll = 0;
    this._pollInterval = 30;
    this._pendingRequests = 0;
    this.inboxText = '';
    this.outputFrame = null;
    this.inputFrame = null;
    this.globeFrame = null;
    this._globe = null;
    this._lastGlobeTick = 0;
    this.GLOBE_TICK_MS = 140;
    this._gridCols = 1;
    this._gridRows = 1;
    this._gridPageSize = 1;
    this._hotspotMap = {};
    this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'private-msg', layerName: 'private-msg', priority: 65 });
    this.registerColors({
        HEADER:  { BG: BG_BLACK, FG: LIGHTCYAN },
        NORMAL:  { BG: BG_BLACK, FG: LIGHTGRAY },
        BOLD:    { BG: BG_BLACK, FG: WHITE },
        HILITE:  { BG: BG_CYAN,  FG: BLACK },
        DIM:     { BG: BG_BLACK, FG: DARKGRAY },
        ACCENT:  { BG: BG_BLACK, FG: YELLOW },
        INPUT:   { BG: BG_BLUE,  FG: WHITE },
        SUCCESS: { BG: BG_BLACK, FG: LIGHTGREEN },
        ERROR:   { BG: BG_BLACK, FG: LIGHTRED },
        SYSTEM:  { BG: BG_BLACK, FG: CYAN }
    });
}

extend(PrivateMsg, Subprogram);

// ── Grid layout constants ──────────────────────────────────────────
PrivateMsg.CELL_W   = 18;
PrivateMsg.CELL_PAD = 1;
PrivateMsg.SLOT_W   = 20;  // CELL_W + 2*PAD
PrivateMsg.AVA_W    = 10;
PrivateMsg.AVA_H    = 6;
PrivateMsg.CELL_H   = 10; // username + bbs + 6 avatar + separator + activity

PrivateMsg.prototype._centerText = function (s, w) {
    if (typeof s !== 'string') s = '';
    if (s.length > w) s = s.substr(0, w - 1) + '\xfa';
    var left = Math.floor((w - s.length) / 2);
    var right = w - s.length - left;
    var out = '';
    for (var i = 0; i < left; i++) out += ' ';
    out += s;
    for (var i = 0; i < right; i++) out += ' ';
    return out;
};

PrivateMsg.prototype._dissolveTile = function (idx) {
    if (typeof dissolve !== 'function') return;
    if (!this.outputFrame) return;
    var cols = this._gridCols || 1;
    var pageSize = this._gridPageSize || cols;
    var page = Math.floor(idx / pageSize);
    var startIdx = page * pageSize;
    var localIdx = idx - startIdx;
    var col = localIdx % cols;
    var row = Math.floor(localIdx / cols);
    var SW = PrivateMsg.SLOT_W;
    var CH = PrivateMsg.CELL_H;
    var headerRows = 2;
    var tx = 1 + col * SW;
    var ty = 1 + headerRows + row * CH;
    var tw = SW;
    var th = CH;
    var tileFrame = null;
    try {
        tileFrame = new Frame(tx, ty, tw, th, BG_BLACK | LIGHTGRAY, this.outputFrame);
        // Copy current tile content from outputFrame into tileFrame
        for (var y = 0; y < th; y++) {
            for (var x = 0; x < tw; x++) {
                var srcX = tx - 1 + x;
                var srcY = ty - 1 + y;
                var d = this.outputFrame.getData(srcX, srcY);
                var ch = (d && typeof d.ch !== 'undefined') ? d.ch : ' ';
                var attr = (d && typeof d.attr === 'number') ? d.attr : (BG_BLACK | LIGHTGRAY);
                tileFrame.setData(x, y, ch, attr);
            }
        }
        tileFrame.open();
        this.parentFrame.cycle();
        try {
            dissolve(tileFrame, (typeof BLACK !== 'undefined' ? BLACK : 0), 3);
        } catch (_eDissolve) { }
    } catch (_e) {
    } finally {
        if (tileFrame) {
            try { tileFrame.close(); } catch (_) { }
            try { tileFrame.delete(); } catch (_) { }
        }
        this._flushFrames(true);
    }
};

PrivateMsg.prototype._getAvatarRows = function (u) {
    if (!this._avatarLib) return null;
    try {
        var usernum = u.local ? u.userNum : 0;
        var netaddr = u.local ? undefined : u.host;
        var bbsid = u.bbs || undefined;
        var obj = this._avatarLib.read(usernum, u.name, netaddr, bbsid);
        if (!this._avatarLib.is_enabled(obj)) return null;
        var graphic = new Graphic(PrivateMsg.AVA_W, PrivateMsg.AVA_H);
        graphic.BIN = base64_decode(obj.data);
        graphic.attr_mask = ~graphic.defs.BLINK;
        var msg = graphic.MSG;
        var raw = msg.split('\r\n');
        var rows = [];
        var pad = Math.floor((PrivateMsg.CELL_W - PrivateMsg.AVA_W) / 2);
        var spc = '';
        for (var p = 0; p < pad; p++) spc += ' ';
        for (var i = 0; i < PrivateMsg.AVA_H && i < raw.length; i++) {
            var line = raw[i].replace(/\x01[Nn]\s*$/, '');
            rows.push(spc + line + '\x01n' + spc);
        }
        while (rows.length < PrivateMsg.AVA_H) rows.push(this._centerText('', PrivateMsg.CELL_W));
        return rows;
    } catch (e) { return null; }
};

PrivateMsg.prototype.enter = function (done) {
    if (!(bbs.sys_status & SS_USERON)) { this.exit(); return; }
    Subprogram.prototype.enter.call(this, done);
    try {
        this.lib = load({}, 'sbbsimsg_lib.js');
        this.lib.read_sys_list();
        this.userprops = load({}, 'userprops.js');
        try { this._avatarLib = load({}, 'avatar_lib.js'); load('graphic.js'); } catch (_avE) { this._avatarLib = null; }
    } catch (e) {
        log(LOG_ERR, 'private-msg: failed to load sbbsimsg_lib: ' + e);
    }
    this._refreshInbox();
    if (this.inboxText.length > 0) {
        this.view = 'INBOX';
    } else {
        this.view = 'USERS';
        this._requestUsers();
    }
    this.draw();
};

PrivateMsg.prototype.cleanup = function () {
    if (this.hotspots) { try { this.hotspots.clear(); } catch (_) { } }
    try { if (this.outputFrame) this.outputFrame.close(); } catch (e) { }
    try { if (this.inputFrame) this.inputFrame.close(); } catch (e) { }
    try { if (this.globeFrame) this.globeFrame.close(); } catch (e) { }
    this.outputFrame = this.inputFrame = null;
    this.globeFrame = this._globe = null;
    if (this.lib && this.lib.sock) {
        try { this.lib.sock.close(); } catch (e) { }
    }
    Subprogram.prototype.cleanup.call(this);
};

// Animation tick — the shell calls this every ~50ms while we're the active
// subprogram (and never while the screensaver is up, so the globe auto-pauses).
// Only spin in the USERS view; throttle to GLOBE_TICK_MS. tick() cycles the
// globe frame itself and never reorders the stack.
PrivateMsg.prototype.cycle = function () {
    if (!this.running || this.view !== 'USERS' || !this._globe || !this.globeFrame) return;
    var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : (time() * 1000);
    if (now - this._lastGlobeTick < this.GLOBE_TICK_MS) return;
    this._lastGlobeTick = now;
    try { this._globe.tick(); } catch (_) { }
};

PrivateMsg.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    // Input line belongs on the very last screen row. The shell's "view" frame
    // stops short of the bottom, so derive the extent from the top-level frame
    // instead of parentFrame.height.
    var rootFrame = this.parentFrame;
    while (rootFrame.parent) rootFrame = rootFrame.parent;
    var lastY = rootFrame.y + Math.max(2, rootFrame.height) - 1;
    var outH = Math.max(1, lastY - 1);
    // Globe backdrop: opened BEFORE outputFrame so it composites BELOW it. The
    // transparent outputFrame lets it show through the gutters between tiles in
    // the USERS view. Sized to the output region (never the console). A resize
    // closes+nulls these frames (subprogram _releaseFrameRefs); re-running here
    // recreates the globe and re-binds the engine, keeping it resize-safe.
    if (!this.globeFrame && GlobeMod && GlobeMod.AsciiGlobe) {
        try {
            var gw = Math.max(8, Math.min(this.parentFrame.width, outH * 2));
            var gh = Math.max(6, outH - 2);
            var gx = Math.max(1, Math.floor((this.parentFrame.width - gw) / 2) + 1);
            var gy = Math.max(1, Math.floor((outH - gh) / 2) + 1);
            this.globeFrame = new Frame(gx, gy, gw, gh, BG_BLACK | BLACK, this.parentFrame);
            this.globeFrame.transparent = true;
            this.globeFrame.open();
            this._globe = new GlobeMod.AsciiGlobe(this.globeFrame);
        } catch (_gfe) {
            this.globeFrame = null;
            this._globe = null;
        }
    }
    if (!this.outputFrame) {
        var attr = this.paletteAttr('NORMAL', BG_BLACK | LIGHTGRAY);
        this.outputFrame = new Frame(1, 1, this.parentFrame.width, outH, attr, this.parentFrame);
        this.outputFrame.open();
    }
    if (!this.inputFrame) {
        var iattr = this.paletteAttr('INPUT', BG_BLUE | WHITE);
        this.inputFrame = new Frame(1, lastY, this.parentFrame.width, 1, iattr, this.parentFrame);
        this.inputFrame.open();
    }
};

PrivateMsg.prototype._flushFrames = function (forceInvalidate) {
    forceInvalidate = !!forceInvalidate;
    // Keep the stack order globe < output < input. Top the globe first (USERS
    // view only) so the grid and input bar always composite above it; the globe
    // tick() never calls .top(), so animation can't reorder the stack.
    if (this.view === 'USERS' && this.globeFrame) {
        try { this.globeFrame.top(); } catch (_) { }
    }
    if (this.outputFrame) {
        try { this.outputFrame.top(); } catch (_) { }
        try {
            if (forceInvalidate && typeof this.outputFrame.invalidate === 'function') this.outputFrame.invalidate();
            else if (typeof this.outputFrame.refresh === 'function') this.outputFrame.refresh();
        } catch (_) { }
    }
    if (this.inputFrame) {
        try { this.inputFrame.top(); } catch (_) { }
        try {
            if (forceInvalidate && typeof this.inputFrame.invalidate === 'function') this.inputFrame.invalidate();
            else if (typeof this.inputFrame.refresh === 'function') this.inputFrame.refresh();
        } catch (_) { }
    }
    try {
        if (this.parentFrame && typeof this.parentFrame.cycle === 'function') this.parentFrame.cycle();
        else if (this.outputFrame && typeof this.outputFrame.cycle === 'function') this.outputFrame.cycle();
    } catch (_) { }
};

PrivateMsg.prototype.draw = function () {
    this._ensureFrames();
    if (!this.outputFrame) return;
    var o = this.outputFrame;
    // Only the USERS view reveals the globe; make the output frame transparent
    // there so unwritten cells fall through to the globe, opaque elsewhere so
    // INBOX/COMPOSE/DEST keep their solid black backdrop.
    o.transparent = (this.view === 'USERS' && !!this.globeFrame);
    o.clear(); o.gotoxy(1, 1);
    // Clear hotspots when not in USERS view
    if (this.view !== 'USERS') {
        this._hotspotMap = {};
        if (this.hotspots) this.hotspots.clear();
    }
    switch (this.view) {
        case 'INBOX':        this._drawInbox(o);      break;
        case 'USERS':        this._drawUsers(o);      break;
        case 'COMPOSE':      this._drawCompose(o);    break;
        case 'COMPOSE_DEST': this._drawDestPrompt(o); break;
    }
    this._drawInputBar();
    this._flushFrames(false);
};

PrivateMsg.prototype._drawInbox = function (o) {
    var hdr = this.colorCode('HEADER');
    var norm = this.colorCode('NORMAL');
    var dim = this.colorCode('DIM');
    o.putmsg(hdr + ' Inbox' + norm + dim + '  (telegrams & inter-BBS messages)\x01n\r\n');
    o.putmsg(dim + _repeat('\xc4', Math.min(this.outputFrame.width - 1, 76)) + '\x01n\r\n');
    if (!this.inboxText) {
        o.putmsg(norm + ' No unread messages.\r\n');
    } else {
        var lines = this.inboxText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        var maxRows = this.outputFrame.height - 3;
        for (var i = 0; i < lines.length && i < maxRows; i++) {
            o.putmsg(norm + ' ' + lines[i] + '\x01n\r\n');
        }
        if (lines.length > maxRows) {
            o.putmsg(dim + ' ... (' + (lines.length - maxRows) + ' more lines)\x01n\r\n');
        }
    }
};

// Frame-local 1-based X of a tile's inner content column.
PrivateMsg.prototype._cellInnerX = function (col) {
    return col * PrivateMsg.SLOT_W + PrivateMsg.CELL_PAD + 1;
};

// Draw one tile text row. Non-selected cells write ONLY the visible glyph run
// (gutters stay unwritten -> transparent -> the globe shows through). Selected
// cells fill the full cell width so the highlight reads as a solid block.
PrivateMsg.prototype._drawCell = function (o, col, y, color, text, fill) {
    var CW = PrivateMsg.CELL_W;
    text = (typeof text === 'string') ? text : '';
    if (text.length > CW) text = text.substr(0, CW - 1) + '\xfa';
    var ix = this._cellInnerX(col);
    if (fill) {
        var left = Math.floor((CW - text.length) / 2);
        var s = '';
        for (var i = 0; i < left; i++) s += ' ';
        s += text;
        while (s.length < CW) s += ' ';
        o.gotoxy(ix, y);
        o.putmsg(color + s + '\x01n');
    } else {
        o.gotoxy(ix + Math.floor((CW - text.length) / 2), y);
        o.putmsg(color + text + '\x01n');
    }
};

PrivateMsg.prototype._drawUsers = function (o) {
    var hdr = this.colorCode('HEADER');
    var norm = this.colorCode('NORMAL');
    var dim = this.colorCode('DIM');
    var W = this.outputFrame.width;
    var CW = PrivateMsg.CELL_W;
    var SW = PrivateMsg.SLOT_W;
    var AH = PrivateMsg.AVA_H;
    var CH = PrivateMsg.CELL_H;

    var cols = Math.max(1, Math.floor(W / SW));
    var availH = Math.max(1, this.outputFrame.height - 2); // minus header+divider
    var gridRows = Math.max(1, Math.floor(availH / CH));
    var pageSize = cols * gridRows;

    // Clamp cursor
    if (this.cursorIdx >= this.userList.length) this.cursorIdx = Math.max(0, this.userList.length - 1);
    if (this.cursorIdx < 0) this.cursorIdx = 0;

    // Page based on cursor position
    var page = Math.floor(this.cursorIdx / pageSize);
    var startIdx = page * pageSize;
    var totalPages = Math.max(1, Math.ceil(this.userList.length / pageSize));

    // Store grid meta for key navigation
    this._gridCols = cols;
    this._gridRows = gridRows;
    this._gridPageSize = pageSize;

    // Header
    var pgInfo = (totalPages > 1) ? '  pg ' + (page + 1) + '/' + totalPages : '';
    o.putmsg(hdr + ' Who\'s Online' + norm + dim + '  (' + this.userList.length + ' users)' + pgInfo + '\x01n\r\n');
    o.putmsg(dim + _repeat('\xc4', Math.min(W - 1, 76)) + '\x01n\r\n');

    // Reset hotspots for this draw pass
    this._hotspotMap = {};
    if (this.hotspots) this.hotspots.clear();
    var hotspotDefs = [];

    if (!this.userList.length) {
        o.putmsg(norm + ' Scanning for users...\r\n');
        o.putmsg(dim + ' (If none appear, no BBSes responded.)\x01n\r\n');
        return;
    }

    // Frame offsets for absolute hotspot coordinates
    var oX = this.outputFrame.x || 1;
    var oY = this.outputFrame.y || 1;
    var headerRows = 2; // header line + divider line

    for (var gr = 0; gr < gridRows; gr++) {
        var cells = [];
        for (var gc = 0; gc < cols; gc++) {
            var idx = startIdx + gr * cols + gc;
            if (idx < this.userList.length) cells.push({ u: this.userList[idx], idx: idx });
        }
        if (!cells.length) break;

        // Pre-fetch avatars
        var avatars = [];
        for (var gc = 0; gc < cells.length; gc++) avatars.push(this._getAvatarRows(cells[gc].u));

        // Frame-local 1-based row of this tile group's first line (after the
        // header line + divider). Each tile is CH rows tall.
        var tileTop = headerRows + gr * CH + 1;

        for (var gc = 0; gc < cells.length; gc++) {
            var sel = (cells[gc].idx === this.cursorIdx);
            var u = cells[gc].u;
            var y = tileTop;

            // Username
            this._drawCell(o, gc, y++, sel ? '\x01n\x016\x01h\x01w' : '\x01h\x01c', u.name, sel);
            // BBS name
            this._drawCell(o, gc, y++, sel ? '\x01n\x016\x01h\x01w' : '\x01h\x01g', u.bbs || '', sel);
            // Avatar rows — for users without one, leave the rows unwritten so
            // the globe shows through (just a centered "no avatar" hint).
            for (var ar = 0; ar < AH; ar++, y++) {
                if (avatars[gc]) {
                    o.gotoxy(this._cellInnerX(gc), y);
                    o.putmsg(avatars[gc][ar]);
                } else if (ar === 2) {
                    this._drawCell(o, gc, y, '\x01n\x01k\x01h', 'no avatar', false);
                }
            }
            // Separator
            this._drawCell(o, gc, y++, sel ? '\x01n\x016\x01h\x01c' : '\x01n\x01c',
                _repeat('\xc4', Math.min(CW - 2, 14)), sel);
            // Activity
            this._drawCell(o, gc, y, sel ? '\x01n\x016\x01h\x01y' : '\x01h\x01y', u.action || '', sel);

            // Hotspot rectangle for this tile (absolute coords, unchanged)
            var tileIndex = cells[gc].idx - startIdx; // page-relative index for hotspot key
            if (tileIndex < 36) {
                var cmd = (tileIndex < 10) ? String(tileIndex) : String.fromCharCode('A'.charCodeAt(0) + (tileIndex - 10));
                hotspotDefs.push({
                    key: cmd,
                    x: oX + gc * SW,                       // absolute X
                    y: oY + headerRows + gr * CH,          // absolute Y (top of tile)
                    width: Math.max(1, SW),
                    height: Math.max(1, CH),
                    swallow: false,
                    owner: 'private-msg:tile',
                    data: { index: cells[gc].idx }
                });
                this._hotspotMap[cmd] = cells[gc].idx;
            }
        }
    }

    // Feed the globe the same user set so its pins track who's online.
    if (this._globe && GlobeMod) {
        try {
            if (GlobeMod.rebuildActiveMarkerColorMap) GlobeMod.rebuildActiveMarkerColorMap(this.userList);
            this._globe.setPins(GlobeMod.buildGlobePins(this.userList));
        } catch (_pinErr) { }
    }

    // Activate hotspots
    if (this.hotspots && hotspotDefs.length) this.hotspots.set(hotspotDefs);
};

PrivateMsg.prototype._drawCompose = function (o) {
    var hdr = this.colorCode('HEADER');
    var norm = this.colorCode('NORMAL');
    var bold = this.colorCode('BOLD');
    var dim = this.colorCode('DIM');
    var acc = this.colorCode('ACCENT');
    var suc = this.colorCode('SUCCESS');
    var err = this.colorCode('ERROR');
    o.putmsg(hdr + ' Compose Message\x01n\r\n');
    o.putmsg(dim + _repeat('\xc4', Math.min(this.outputFrame.width - 1, 76)) + '\x01n\r\n');
    o.putmsg(norm + ' To: ' + acc + this.toLabel + '\x01n\r\n');
    o.putmsg(dim + ' (' + this.maxLines + ' lines max. Blank line sends.)\x01n\r\n');
    for (var i = 0; i < this.lines.length; i++) {
        o.putmsg(bold + ' ' + (i + 1) + '> ' + norm + this.lines[i] + '\x01n\r\n');
    }
    if (this.sendResult) {
        var rc = (this.sendResult === 'sent') ? suc : err;
        var msg = (this.sendResult === 'sent') ? ' Message sent successfully!' : ' Send failed: ' + this.sendResult;
        o.putmsg(rc + msg + '\x01n\r\n');
        o.putmsg(dim + ' Press any key to continue.\x01n\r\n');
    } else if (this.lines.length < this.maxLines) {
        o.putmsg(bold + ' ' + (this.lines.length + 1) + '> ' + norm + this.inputStr + '\x01n');
    } else {
        o.putmsg(dim + ' (Max lines reached. Press ENTER to send.)\x01n\r\n');
    }
};

PrivateMsg.prototype._drawDestPrompt = function (o) {
    var hdr = this.colorCode('HEADER');
    var norm = this.colorCode('NORMAL');
    var dim = this.colorCode('DIM');
    var acc = this.colorCode('ACCENT');
    o.putmsg(hdr + ' Send Telegram\x01n\r\n');
    o.putmsg(dim + _repeat('\xc4', Math.min(this.outputFrame.width - 1, 76)) + '\x01n\r\n');
    o.putmsg(norm + ' Destination (user@hostname):\r\n');
    o.putmsg(acc + ' > ' + this.inputStr + '\x01n\r\n');
    // Fuzzy match dropdown
    if (this.inputStr.length > 0 && this._filteredDest && this._filteredDest.length) {
        var maxShow = Math.min(this._filteredDest.length, this.outputFrame.height - 6);
        var hi = this.colorCode('HILITE');
        for (var i = 0; i < maxShow; i++) {
            var fd = this._filteredDest[i];
            var sel = (i === this._filteredIdx);
            if (sel) {
                o.putmsg('\x01n\x016\x01h\x01w   ' + fd.label + '\x01n\r\n');
            } else {
                o.putmsg('   \x01h\x01c' + fd.name + '\x01n\x01h\x01k@\x01h\x01g' + fd.bbs + '\x01n\r\n');
            }
        }
        if (this._filteredDest.length > maxShow) {
            o.putmsg(dim + '   ... ' + (this._filteredDest.length - maxShow) + ' more\x01n\r\n');
        }
    } else if (this.inputStr.length > 0) {
        o.putmsg(dim + '   (no matches)\x01n\r\n');
    } else {
        o.putmsg(dim + ' Start typing to search users. Blank to cancel.\x01n\r\n');
    }
};

PrivateMsg.prototype._drawInputBar = function () {
    if (!this.inputFrame) return;
    var f = this.inputFrame;
    var iattr = this.paletteAttr('INPUT', BG_BLUE | WHITE);
    f.clear(iattr); f.attr = iattr; f.gotoxy(1, 1);
    var prompt = '';
    switch (this.view) {
        case 'INBOX':
            prompt = ' I)nbox  U)sers  T)elegram  Q)uit';
            break;
        case 'USERS':
            prompt = ' \x18\x19\x1b\x1a)Navigate  ENTER)Message  T)ype dest  I)nbox  R)efresh  Q)uit';
            break;
        case 'COMPOSE':
            prompt = this.sendResult ? ' [Press any key]' : ' Composing to ' + this.toLabel + '  ESC)Cancel';
            break;
        case 'COMPOSE_DEST':
            prompt = ' Type user@host, ENTER to confirm, ESC to cancel';
            break;
    }
    if (prompt.length > f.width) prompt = prompt.substr(0, f.width);
    f.putmsg(prompt);
    f.cycle();
};

PrivateMsg.prototype.handleKey = function (k) {
    if (!k) return;
    // Handle doorway-mode control codes and ANSI escape sequences
    if (typeof k === 'string') {
        if (k.length === 1) {
            switch (k.charCodeAt(0)) {
                case 10: k = KEY_DOWN;  break; // LF  (doorway down)
                case 6:  k = KEY_RIGHT; break; // ^F  (doorway right)
                case 29: k = KEY_LEFT;  break; // GS  (doorway left)
                case 30: case 31: k = KEY_UP;   break; // RS / US (doorway up)
                case 1:  k = KEY_HOME; break;          // ^A (doorway Home)
                case 5:  k = KEY_END;  break;          // ^E (doorway End)
            }
        } else if (k.length >= 2 && k.charAt(0) === '\x1b') {
            var seq = k.substr(1);
            if (seq === '[A')       k = KEY_UP;
            else if (seq === '[B')  k = KEY_DOWN;
            else if (seq === '[C')  k = KEY_RIGHT;
            else if (seq === '[D')  k = KEY_LEFT;
            else if (seq === '[5~') k = KEY_PGUP;
            else if (seq === '[6~') k = KEY_PGDN;
            else if (seq === '[H')  k = KEY_HOME;
            else if (seq === '[F')  k = KEY_END;
            else if (seq === 'OA')  k = KEY_UP;
            else if (seq === 'OB')  k = KEY_DOWN;
            else if (seq === 'OC')  k = KEY_RIGHT;
            else if (seq === 'OD')  k = KEY_LEFT;
            else if (seq === 'OP')  k = KEY_HOME;
            else if (seq === 'OQ')  k = KEY_END;
        }
    }
    if (k === '\x1b') {
        if (this.view === 'COMPOSE' && !this.sendResult) {
            this.view = 'USERS'; this.inputStr = ''; this.lines = []; this._requestUsers();
            this.draw(); return;
        }
        if (this.view === 'COMPOSE_DEST') {
            this.view = 'USERS'; this.inputStr = ''; this._requestUsers();
            this.draw(); return;
        }
        this.exit(); return;
    }
    switch (this.view) {
        case 'INBOX':        this._handleInboxKey(k);   break;
        case 'USERS':        this._handleUsersKey(k);   break;
        case 'COMPOSE':      this._handleComposeKey(k); break;
        case 'COMPOSE_DEST': this._handleDestKey(k);    break;
    }
};

PrivateMsg.prototype._handleInboxKey = function (k) {
    var up = (typeof k === 'string' && k.length === 1) ? k.toUpperCase() : k;
    switch (up) {
        case 'U': this.view = 'USERS'; this._requestUsers(); this.draw(); return;
        case 'T': this._startTypedDest(); return;
        case 'Q': this.exit(); return;
        default:
            this._refreshInbox();
            if (!this.inboxText) { this.view = 'USERS'; this._requestUsers(); }
            this.draw(); return;
    }
};

PrivateMsg.prototype._handleUsersKey = function (k) {
    // Check hotspot map first (mouse clicks on tiles)
    if (typeof k === 'string' && this._hotspotMap && this._hotspotMap[k] !== undefined) {
        this.cursorIdx = this._hotspotMap[k];
        if (this.userList.length > 0 && this.cursorIdx < this.userList.length) {
            this.draw(); // redraw to show selection highlight
            this._dissolveTile(this.cursorIdx);
            var sel = this.userList[this.cursorIdx];
            this.toDest = sel.name + '@' + sel.host;
            this.toLabel = sel.name + ' @ ' + (sel.bbs || sel.host);
            this.view = 'COMPOSE'; this.inputStr = ''; this.lines = []; this.sendResult = '';
        }
        this.draw();
        return;
    }

    var up = (typeof k === 'string' && k.length === 1) ? k.toUpperCase() : k;
    var cols = this._gridCols || 1;
    var last = Math.max(0, this.userList.length - 1);

    switch (k) {
        case KEY_LEFT:
            if (this.cursorIdx > 0) this.cursorIdx--;
            this.draw(); return;
        case KEY_RIGHT:
            if (this.cursorIdx < last) this.cursorIdx++;
            this.draw(); return;
        case KEY_UP:
            if (this.cursorIdx - cols >= 0) this.cursorIdx -= cols;
            this.draw(); return;
        case KEY_DOWN:
            if (this.cursorIdx + cols <= last) this.cursorIdx += cols;
            else if (this.cursorIdx < last) this.cursorIdx = last;
            this.draw(); return;
        case KEY_HOME:
            this.cursorIdx = 0; this.draw(); return;
        case KEY_END:
            this.cursorIdx = Math.max(0, last); this.draw(); return;
        case KEY_PAGEUP: case KEY_PGUP:
            this.cursorIdx = Math.max(0, this.cursorIdx - (this._gridPageSize || cols));
            this.draw(); return;
        case KEY_PAGEDN: case KEY_PGDN:
            this.cursorIdx = Math.min(last, this.cursorIdx + (this._gridPageSize || cols));
            this.draw(); return;
    }
    switch (up) {
        case '\r':
            if (this.userList.length > 0) {
                this._dissolveTile(this.cursorIdx);
                var sel = this.userList[this.cursorIdx];
                this.toDest = sel.name + '@' + sel.host;
                this.toLabel = sel.name + ' @ ' + (sel.bbs || sel.host);
                this.view = 'COMPOSE'; this.inputStr = ''; this.lines = []; this.sendResult = '';
                this.draw();
            }
            return;
        case 'T': this._startTypedDest(); return;
        case 'I': this._refreshInbox(); this.view = 'INBOX'; this.draw(); return;
        case 'R': this._requestUsers(); this.draw(); return;
        case 'Q': this.exit(); return;
    }
};

PrivateMsg.prototype._handleComposeKey = function (k) {
    if (this.sendResult) {
        this.sendResult = ''; this.view = 'USERS'; this._requestUsers(); this.draw(); return;
    }
    switch (k) {
        case '\r':
            if (this.inputStr.length > 0) { this.lines.push(this.inputStr); this.inputStr = ''; }
            if (this.lines.length >= this.maxLines || (this.lines.length > 0 && this.inputStr.length === 0)) {
                if (this.lines.length > 0) { this._sendMessage(); return; }
            }
            this.draw(); return;
        case '\x08': case '\x7f':
            if (this.inputStr.length > 0) {
                this.inputStr = this.inputStr.substr(0, this.inputStr.length - 1);
                this.draw();
            }
            return;
        default:
            if (typeof k === 'string' && k.length === 1 && k >= ' ' && k <= '~') {
                if (this.lines.length < this.maxLines && this.inputStr.length < 76) {
                    this.inputStr += k; this.draw();
                }
            }
            return;
    }
};

PrivateMsg.prototype._handleDestKey = function (k) {
    switch (k) {
        case KEY_UP:
            if (this._filteredDest && this._filteredDest.length && this._filteredIdx > 0) {
                this._filteredIdx--;
                this.draw();
            }
            return;
        case KEY_DOWN:
            if (this._filteredDest && this._filteredDest.length && this._filteredIdx < this._filteredDest.length - 1) {
                this._filteredIdx++;
                this.draw();
            }
            return;
        case '\t':
            // Tab-complete: fill input from selected match
            if (this._filteredDest && this._filteredDest.length) {
                var sel = this._filteredDest[this._filteredIdx];
                this.inputStr = sel.dest;
                this._updateFilteredDest();
                this.draw();
            }
            return;
        case '\r':
            // If a filtered match is highlighted, use it
            if (this._filteredDest && this._filteredDest.length && this._filteredIdx >= 0) {
                var picked = this._filteredDest[this._filteredIdx];
                this.toDest = picked.dest;
                this.toLabel = picked.label;
                this.view = 'COMPOSE'; this.inputStr = ''; this.lines = []; this.sendResult = '';
                this.draw(); return;
            }
            var dest = this.inputStr.trim();
            if (!dest) { this.view = 'USERS'; this.inputStr = ''; this._requestUsers(); this.draw(); return; }
            if (this.lib && this.lib.dest_host(dest)) {
                this.toDest = dest; this.toLabel = dest;
                this.view = 'COMPOSE'; this.inputStr = ''; this.lines = []; this.sendResult = '';
                this.draw(); return;
            }
            // No @ sign — maybe just a username; try to find unique match
            this._updateFilteredDest();
            if (this._filteredDest && this._filteredDest.length === 1) {
                var only = this._filteredDest[0];
                this.toDest = only.dest; this.toLabel = only.label;
                this.view = 'COMPOSE'; this.inputStr = ''; this.lines = []; this.sendResult = '';
                this.draw(); return;
            }
            this.draw(); return;
        case '\x08': case '\x7f':
            if (this.inputStr.length > 0) {
                this.inputStr = this.inputStr.substr(0, this.inputStr.length - 1);
                this._updateFilteredDest();
                this.draw();
            }
            return;
        default:
            if (typeof k === 'string' && k.length === 1 && k >= ' ' && k <= '~') {
                if (this.inputStr.length < 64) {
                    this.inputStr += k;
                    this._updateFilteredDest();
                    this.draw();
                }
            }
            return;
    }
};

PrivateMsg.prototype._startTypedDest = function () {
    this.toDest = ''; this.toLabel = '(type user@host below)';
    this.view = 'COMPOSE_DEST'; this.lines = []; this.sendResult = '';
    this.inputStr = '';
    this._filteredDest = [];
    this._filteredIdx = 0;
    if (this.userprops && this.lib) {
        try {
            var addrs = this.userprops.get(this.lib.props_sent, 'address', []);
            if (addrs.length) {
                this.inputStr = addrs[0];
                this._updateFilteredDest();
            }
        } catch (e) { }
    }
    this.draw();
};

PrivateMsg.prototype._updateFilteredDest = function () {
    this._filteredDest = [];
    this._filteredIdx = 0;
    if (!this.inputStr) return;
    var q = this.inputStr.toLowerCase();
    for (var i = 0; i < this.userList.length; i++) {
        var u = this.userList[i];
        var dest = u.name + '@' + u.host;
        var label = u.name + ' @ ' + (u.bbs || u.host);
        var haystack = (u.name + ' ' + (u.bbs || '') + ' ' + u.host + ' ' + dest).toLowerCase();
        if (haystack.indexOf(q) >= 0 || this._fuzzyMatch(q, haystack)) {
            this._filteredDest.push({ name: u.name, bbs: u.bbs || u.host, host: u.host, dest: dest, label: label });
        }
    }
};

PrivateMsg.prototype._fuzzyMatch = function (query, haystack) {
    var qi = 0;
    for (var hi = 0; hi < haystack.length && qi < query.length; hi++) {
        if (haystack.charAt(hi) === query.charAt(qi)) qi++;
    }
    return qi === query.length;
};

PrivateMsg.prototype._requestUsers = function () {
    if (!this.lib) return;
    var now = time();
    if (now - this._lastPoll < this._pollInterval && this.userList.length > 0) return;
    this._lastPoll = now;
    try { this._pendingRequests = this.lib.request_active_users(); } catch (e) {
        log(LOG_WARNING, 'private-msg: request_active_users error: ' + e);
    }
    this._pollResponses(2000);
    this._buildUserList();
};

PrivateMsg.prototype._pollResponses = function (timeoutMs) {
    if (!this.lib || !this.lib.sock) return;
    var begin = system.timer;
    var timeout = (timeoutMs || 2000) / 1000;
    while (system.timer - begin < timeout) {
        if (!this.lib.sock.poll(0.25)) continue;
        var message = this.lib.receive_active_users();
        if (message) { this.lib.parse_active_users(message); }
    }
};

// webv4 records each logged-in web user as an INI session file at
// data/user/<usernum>.web and treats it as live while the file mtime is inside
// the [web] inactivity window. We mirror that convention (same as the
// webv4_custom sidebar's nodelist.js) to surface our own web users here.
PrivateMsg.prototype._webConfig = function () {
    if (this._webCfg) return this._webCfg;
    var cfg = { inactivity: 900, guestNum: 0 };
    try {
        var f = new File(system.ctrl_dir + 'modopts.ini');
        if (f.open('r')) {
            var inact = f.iniGetValue('web', 'inactivity', 900);
            if (inact > 0) cfg.inactivity = inact;
            var guestAlias = f.iniGetValue('web', 'guest', 'Guest');
            f.close();
            if (guestAlias) { try { cfg.guestNum = system.matchuser(guestAlias) || 0; } catch (e) { } }
        }
    } catch (e) { }
    this._webCfg = cfg;
    return cfg;
};

PrivateMsg.prototype._readWebSession = function (usernum) {
    try {
        var f = new File(format('%suser/%04d.web', system.data_dir, usernum));
        if (!f.open('r')) return null;
        var o = f.iniGetObject();
        f.close();
        return o || null;
    } catch (e) { return null; }
};

// Scan webv4 sessions for live web users. `seen` is a map of userNums already
// listed (terminal nodes + self); fresh web-only users are added and recorded
// back into it.
PrivateMsg.prototype._fetchLocalWebUsers = function (seen) {
    var out = [];
    var cfg = this._webConfig();
    var files;
    try { files = directory(system.data_dir + 'user/*.web'); } catch (e) { return out; }
    if (!files || !files.length) return out;
    for (var i = 0; i < files.length; i++) {
        var path = files[i];
        var num = parseInt(file_getname(path), 10);
        if (!num || num < 1 || num > system.lastuser) continue;
        if (seen && seen[num]) continue;                          // already a node / self
        if (time() - file_date(path) >= cfg.inactivity) continue; // stale / logged out
        if (cfg.guestNum && num === cfg.guestNum) continue;       // hide shared guest account
        var usr;
        try { usr = new User(num); } catch (e) { continue; }
        if (!usr || !usr.alias) continue;
        if (usr.settings & (USER_DELETED | USER_INACTIVE)) continue;
        if (usr.settings & USER_QUIET) continue;                  // user opted out of the online list
        var sess = this._readWebSession(num) || {};
        var act = String(sess.action || sess.xtrn || '');
        out.push({
            name: usr.alias,
            host: system.inetaddr || system.host_name || 'localhost',
            bbs: system.name + ' (web)',
            action: act || 'browsing',
            age: '', sex: '', timeon: 0,
            local: true, web: true, userNum: num
        });
        if (seen) seen[num] = true;
    }
    return out;
};

PrivateMsg.prototype._buildUserList = function () {
    this.userList = [];
    if (!this.lib || !this.lib.sys_list) return;
    for (var ip in this.lib.sys_list) {
        var sys = this.lib.sys_list[ip];
        if (!sys.users || !sys.users.length) continue;
        for (var u = 0; u < sys.users.length; u++) {
            var usr = sys.users[u];
            this.userList.push({
                name: usr.name || '?', host: sys.host, bbs: sys.name || sys.host,
                action: remoteAction(usr), age: usr.age || '', sex: usr.sex || '', timeon: usr.timeon || 0
            });
        }
    }
    // Track userNums already listed (terminal nodes) plus self, so a user who
    // is connected both ways — or the current user — isn't listed twice.
    var seen = {};
    if (typeof user !== 'undefined' && user.number) seen[user.number] = true;
    for (var n = 0; n < system.nodes; n++) {
        try {
            var node = system.get_node(n + 1);
            if (!node || node.status !== NODE_INUSE) continue;
            var uname = system.username(node.useron);
            if (!uname || node.useron === user.number) continue;
            seen[node.useron] = true;
            this.userList.push({
                name: uname, host: system.inetaddr || system.host_name || 'localhost',
                bbs: system.name + ' (local)', action: localAction(node),
                age: '', sex: '', timeon: 0, local: true, userNum: node.useron
            });
        } catch (e) { }
    }
    // Local web users (webv4 sessions; they hold no node). host=system.inetaddr
    // makes them messageable through the existing MSP telegram path unchanged.
    try {
        var webUsers = this._fetchLocalWebUsers(seen);
        for (var w = 0; w < webUsers.length; w++) this.userList.push(webUsers[w]);
    } catch (e) { }
    this.userList.sort(function (a, b) {
        if (a.local && !b.local) return -1;
        if (!a.local && b.local) return 1;
        var cmp = (a.bbs || '').toLowerCase().localeCompare((b.bbs || '').toLowerCase());
        if (cmp !== 0) return cmp;
        return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
};

PrivateMsg.prototype._sendMessage = function () {
    var msgText = this.lines.join('\r\n');
    var result;
    try {
        if (this.lib) {
            result = this.lib.send_msg(this.toDest, msgText, user.alias || user.name);
        } else {
            result = 'Inter-BBS library not loaded';
        }
    } catch (e) { result = String(e); }
    this.sendResult = (result === true) ? 'sent' : String(result || 'Unknown error');
    this.inputStr = ''; this.draw();
};

PrivateMsg.prototype._refreshInbox = function () {
    this.inboxText = '';
    try {
        var tg = system.get_telegram(user.number);
        if (tg && typeof tg === 'string' && tg.length > 0) this.inboxText = tg;
    } catch (e) { }
};

var NodeAction = {};
try {
    NodeAction[NODE_MAIN] = 'Main menu'; NodeAction[NODE_RMSG] = 'Reading msgs';
    NodeAction[NODE_RMAL] = 'Reading mail'; NodeAction[NODE_SMAL] = 'Sending mail';
    NodeAction[NODE_RTXT] = 'Reading text'; NodeAction[NODE_RSML] = 'Reading sent mail';
    NodeAction[NODE_PMSG] = 'Private msg'; NodeAction[NODE_TQWK] = 'Transferring QWK';
    NodeAction[NODE_PCHT] = 'In chat'; NodeAction[NODE_PAGE] = 'Paging node';
    NodeAction[NODE_DFLT] = 'Using defaults'; NodeAction[NODE_XTRN] = 'Running door';
    NodeAction[NODE_DLNG] = 'Downloading'; NodeAction[NODE_ULNG] = 'Uploading';
    NodeAction[NODE_BXFR] = 'Bidirectional xfer'; NodeAction[NODE_LFIL] = 'Listing files';
    NodeAction[NODE_LOGN] = 'Logging on'; NodeAction[NODE_LCHT] = 'In local chat';
    NodeAction[NODE_MCHT] = 'In multinode chat';
} catch (e) { }

// A node running an external program carries node.action == NODE_XTRN and a
// 1-based node.aux index into the external program list. Resolve it to the
// program's display name so the activity shows the actual door rather than a
// generic "Running door".
function doorNameFromAux(aux) {
    if (!aux) return '';
    try {
        for (var i in xtrn_area.prog)
            if (xtrn_area.prog[i].number == aux - 1) return xtrn_area.prog[i].name;
    } catch (e) { }
    return '';
}

function localAction(node) {
    if (node.action == NODE_XTRN && node.aux) {
        var name = doorNameFromAux(node.aux);
        if (name) return name;
    }
    return NodeAction[node.action] || '';
}

// Remote users arrive via the inter-BBS broadcast, which (for JSON-capable
// systems) carries a numeric 'naction' and an 'xtrn' program name alongside
// the verbose 'action' string ("running external program NAME"). Prefer the
// bare name; otherwise strip the redundant prefix so the name leads.
function remoteAction(usr) {
    if (usr && usr.xtrn && (usr.naction === NODE_XTRN || /running external program/i.test(usr.action || '')))
        return String(usr.xtrn);
    var a = String((usr && usr.action) || '');
    return a.replace(/^\s*running external program\s+#\d+\s*$/i, 'a door')
            .replace(/^\s*running external program\s+/i, '')
            .replace(/^\s*at external program menu\s*$/i, 'xtrn menu');
}

registerModuleExports({ PrivateMsg: PrivateMsg });
