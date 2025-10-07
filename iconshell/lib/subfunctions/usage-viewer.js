load('iconshell/lib/subfunctions/subprogram.js');

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN', 'BG_GREEN', 'BG_MAGENTA', 'BG_BROWN', 'BG_LIGHTGRAY',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'CYAN', 'MAGENTA', 'GREEN', 'RED', 'BLACK',
    'KEY_UP', 'KEY_DOWN', 'KEY_PGUP', 'KEY_PGDN', 'KEY_HOME', 'KEY_END', 'KEY_LEFT', 'KEY_RIGHT'
);

try { if (typeof Icon !== 'function') load('iconshell/lib/shell/icon.js'); } catch (e) { }

if (typeof KEY_UP === 'undefined') var KEY_UP = 0x4800;
if (typeof KEY_DOWN === 'undefined') var KEY_DOWN = 0x5000;
if (typeof KEY_PGUP === 'undefined') var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined') var KEY_PGDN = 0x5100;
if (typeof KEY_HOME === 'undefined') var KEY_HOME = 0x4700;
if (typeof KEY_END === 'undefined') var KEY_END = 0x4F00;
if (typeof KEY_LEFT === 'undefined') var KEY_LEFT = 0x4B00;
if (typeof KEY_RIGHT === 'undefined') var KEY_RIGHT = 0x4D00;

var USAGE_VIEWER_VERSION = '20250108a';

function UsageViewer(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'usage-viewer', parentFrame: opts.parentFrame, shell: opts.shell, timer: opts.timer });
    this.dataFile = system.mods_dir + 'iconshell/data/external_usage.json';
    this.months = [];
    this.index = 0;
    this.top = 0;
    this.listFrame = null;
    this.detailFrame = null;
    this.message = '';
    this.focus = 'month';
    this.programIndex = 0;
    this.programTop = 0;
    this._programFrames = [];
    this._programHotspots = {};
    this._iconLookup = null;
    this._version = USAGE_VIEWER_VERSION;
    this._programCatalog = null;
}
extend(UsageViewer, Subprogram);
UsageViewer.VERSION = USAGE_VIEWER_VERSION;

UsageViewer.prototype.setParentFrame = function (frame) {
    this._ensureVersion(frame);
    this.parentFrame = frame;
    this._ownsParentFrame = !frame;
    this.listFrame = null;
    this.detailFrame = null;
    this._clearProgramResources();
};

UsageViewer.prototype.enter = function (done) {
    this._ensureVersion();
    this._loadData();
    Subprogram.prototype.enter.call(this, done);
};

UsageViewer.prototype._ensureVersion = function (frame) {
    if (this._version === USAGE_VIEWER_VERSION) return;
    try { this._clearProgramResources(); } catch (e1) { }
    if (this.listFrame) { try { this.listFrame.close(); } catch (e2) { } }
    if (this.detailFrame) { try { this.detailFrame.close(); } catch (e3) { } }
    this.listFrame = null;
    this.detailFrame = null;
    var opts = {
        parentFrame: (typeof frame !== 'undefined') ? frame : this.parentFrame,
        shell: this.shell,
        timer: this.timer
    };
    UsageViewer.call(this, opts);
    this._version = USAGE_VIEWER_VERSION;
};

UsageViewer.prototype._loadData = function () {
    this.months = [];
    this.index = 0;
    this.top = 0;
    this.message = '';
    this.focus = 'month';
    this.programIndex = 0;
    this.programTop = 0;
    this._clearProgramResources();
    var file = new File(this.dataFile);
    if (!file.exists) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    if (!file.open('r', true)) {
        this.message = 'Unable to open usage data file.';
        return;
    }
    var raw = file.readAll().join('\n');
    file.close();
    if (!raw.length) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    var data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        this.message = 'Usage data is corrupt.';
        return;
    }
    var keys = Object.keys(data || {});
    if (!keys.length) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    keys.sort();
    keys.reverse();
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var entry = data[key] || {};
        var totals = entry.totals || {};
        var programs = entry.programs || {};
        var programList = [];
        for (var pid in programs) {
            if (!programs.hasOwnProperty(pid)) continue;
            var p = programs[pid] || {};
            programList.push({
                id: pid,
                count: p.count || 0,
                seconds: p.seconds || 0,
                lastTimestamp: p.lastTimestamp || 0
            });
        }
        programList.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return (b.seconds || 0) - (a.seconds || 0);
        });
        this.months.push({
            month: key,
            count: totals.count || 0,
            seconds: totals.seconds || 0,
            programs: programList,
            users: entry.users || {},
            lastTimestamp: entry.lastTimestamp || 0
        });
    }
};

UsageViewer.prototype.ensureFrames = function () {
    var host = this.hostFrame || this.parentFrame;
    if (!host) return;
    var width = host.width;
    var height = host.height;
    if (height < 2) height = 2;
    var minList = 3;
    var minDetail = 5;
    var listHeight = Math.max(minList, Math.floor(height * 0.30));
    if (height - listHeight < minDetail) listHeight = Math.max(minList, height - minDetail);
    if (listHeight > height - 1) listHeight = height - 1;
    if (listHeight < 1) listHeight = 1;
    var detailHeight = height - listHeight;
    if (detailHeight < minDetail) {
        detailHeight = Math.max(minDetail, height - minList);
        if (detailHeight >= height) detailHeight = Math.max(1, height - minList);
        listHeight = height - detailHeight;
        if (listHeight < 1) listHeight = 1;
    }
    var frameGap = 1;
    if (listHeight + detailHeight + frameGap > height) {
        var over = listHeight + detailHeight + frameGap - height;
        if (detailHeight - over >= minDetail) detailHeight -= over;
        else listHeight = Math.max(minList, listHeight - over);
    }
    var detailY = host.y + listHeight + frameGap;
    if (detailY + detailHeight - 1 > host.y + height - 1) {
        detailHeight = Math.max(1, (host.y + height) - detailY);
    }
    if (this.listFrame) {
        var needsListRebuild = this.listFrame.width !== width || this.listFrame.height !== listHeight
            || this.listFrame.x !== host.x || this.listFrame.y !== host.y;
        if (needsListRebuild) {
            try { this.listFrame.close(); } catch (eCloseList) { }
            this.listFrame = null;
        }
    }
    if (!this.listFrame) {
        this.listFrame = new Frame(host.x, host.y, width, listHeight, BG_BLACK | LIGHTGRAY, host);
        this.listFrame.open();
        this.registerFrame(this.listFrame);
    }
    if (this.detailFrame) {
        var needsDetailRebuild = this.detailFrame.width !== width || this.detailFrame.height !== detailHeight
            || this.detailFrame.x !== host.x || this.detailFrame.y !== detailY;
        if (needsDetailRebuild) {
            try { this.detailFrame.close(); } catch (eCloseDetail) { }
            this.detailFrame = null;
        }
    }
    if (!this.detailFrame) {
        this.detailFrame = new Frame(host.x, detailY, width, detailHeight, BG_BLACK | LIGHTGRAY, host);
        this.detailFrame.open();
        this.registerFrame(this.detailFrame);
    }
};

UsageViewer.prototype.draw = function () {
    this.ensureFrames();
    if (!this.listFrame) return;
    var lf = this.listFrame;
    lf.attr = BG_BLACK | LIGHTGRAY;
    lf.clear(BG_BLACK | LIGHTGRAY);
    lf.gotoxy(1, 1);
    if (this.message) {
        var msg = this.message;
        if (msg.length > lf.width) msg = msg.substr(0, lf.width);
        lf.putmsg('\x01h\x01c' + msg + '\x01n');
        lf.cycle();
        if (this.detailFrame) {
            this.detailFrame.clear();
            this.detailFrame.gotoxy(1, 1);
            this.detailFrame.putmsg('ESC=Exit');
            this.detailFrame.cycle();
        }
        return;
    }
    var visible = lf.height;
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + visible) this.top = Math.max(0, this.index - visible + 1);
    for (var row = 0; row < visible; row++) {
        var idx = this.top + row;
        if (idx >= this.months.length) break;
        var item = this.months[idx];
        var line = this._formatMonthLine(item);
        if (line.length > lf.width) line = line.substr(0, lf.width);
        if (idx === this.index) {
            if (this.focus === 'month') line = '\x01n\x01h\x01c> ' + line + '\x01n';
            else line = '> ' + line;
        } else line = '  ' + line;
        lf.putmsg(line + '\r\n');
    }
    lf.cycle();
    this._drawDetail();
};

UsageViewer.prototype._formatMonthLine = function (item) {
    var dur = this._formatDuration(item.seconds);
    var progCount = item.programs ? item.programs.length : 0;
    return format('%s  Launches: %5u  Time: %s  Programs: %u', item.month, item.count, dur, progCount);
};

UsageViewer.prototype._drawDetail = function () {
    if (!this.detailFrame) return;
    var df = this.detailFrame;
    df.attr = BG_BLACK | LIGHTGRAY;
    df.clear(BG_BLACK | LIGHTGRAY);
    df.gotoxy(1, 1);
    this._clearProgramResources();
    if (!this.months.length) {
        df.putmsg('ESC=Exit');
        df.cycle();
        return;
    }
    var current = this.months[this.index];
    var header = format('Month %s  Launches %u  Time %s  [v%s]', current.month, current.count, this._formatDuration(current.seconds), this._version || '?');
    if (header.length > df.width) header = header.substr(0, df.width);
    df.putmsg('\x01n\x01h' + header + '\x01n\r\n');
    df.putmsg('\r\n');
    this._drawProgramBlocks(df, current);
    var hasPrograms = (current.programs || []).length > 0;
    var instructions;
    if (this.focus === 'program') instructions = 'ESC=Exit  LEFT=Months  Up/Down=Programs  1-9=Select  R=Reload';
    else instructions = hasPrograms ? 'ESC=Exit  RIGHT=Programs  Up/Down=Months  R=Reload'
        : 'ESC=Exit  Up/Down=Months  R=Reload';
    if (instructions.length > df.width) instructions = instructions.substr(0, df.width);
    df.gotoxy(1, df.height);
    df.putmsg(instructions);
    df.cycle();
};

UsageViewer.prototype._formatDuration = function (seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    var hrs = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var secs = Math.floor(seconds % 60);
    return format('%02d:%02d:%02d', hrs, mins, secs);
};

UsageViewer.prototype.handleKey = function (key) {
    if (!key) return;
    switch (key) {
        case '\x1B':
        case 'Q':
        case 'q':
            this.exit();
            return;
        case 'R':
        case 'r':
            this._loadData();
            this.draw();
            return;
        case KEY_LEFT:
        case '\t':
            if (this.focus === 'program') {
                this.focus = 'month';
                this.draw();
            }
            return;
        case KEY_RIGHT:
            if (this.focus === 'month' && this.months.length && (this.months[this.index].programs || []).length) {
                this.focus = 'program';
                this.programIndex = 0;
                this.programTop = 0;
                this.draw();
            }
            return;
        case KEY_UP:
        case 'k':
        case 'K':
            if (this.focus === 'month') {
                if (this.index > 0) {
                    this.index--;
                    this.programIndex = 0;
                    this.programTop = 0;
                    this.draw();
                }
            } else {
                if (this.programIndex > 0) {
                    this.programIndex--;
                    this.draw();
                }
            }
            return;
        case KEY_DOWN:
        case 'j':
        case 'J':
            if (this.focus === 'month') {
                if (this.index < this.months.length - 1) {
                    this.index++;
                    this.programIndex = 0;
                    this.programTop = 0;
                    this.draw();
                }
            } else {
                var progs = (this.months[this.index] && this.months[this.index].programs) ? this.months[this.index].programs : [];
                if (this.programIndex < progs.length - 1) {
                    this.programIndex++;
                    this.draw();
                }
            }
            return;
        case KEY_PGUP:
            if (this.focus === 'month') {
                this.index = Math.max(0, this.index - (this.listFrame ? this.listFrame.height : 1));
                this.programIndex = 0;
                this.programTop = 0;
                this.draw();
            } else {
                this.programIndex = Math.max(0, this.programIndex - 5);
                this.draw();
            }
            return;
        case KEY_PGDN:
            if (this.focus === 'month') {
                this.index = Math.min(this.months.length - 1, this.index + (this.listFrame ? this.listFrame.height : 1));
                this.programIndex = 0;
                this.programTop = 0;
                this.draw();
            } else {
                var progs = (this.months[this.index] && this.months[this.index].programs) ? this.months[this.index].programs : [];
                this.programIndex = Math.min(progs.length - 1, this.programIndex + 5);
                this.draw();
            }
            return;
        case KEY_HOME:
            if (this.focus === 'month') {
                this.index = 0;
                this.programIndex = 0;
                this.programTop = 0;
                this.draw();
            } else {
                this.programIndex = 0;
                this.programTop = 0;
                this.draw();
            }
            return;
        case KEY_END:
            if (this.focus === 'month') {
                if (this.months.length) {
                    this.index = this.months.length - 1;
                    this.programIndex = 0;
                    this.programTop = 0;
                    this.draw();
                }
            } else {
                var progsEnd = (this.months[this.index] && this.months[this.index].programs) ? this.months[this.index].programs : [];
                if (progsEnd.length) {
                    this.programIndex = progsEnd.length - 1;
                    this.draw();
                }
            }
            return;
    }
    if (this.focus === 'program' && this._programHotspots && this._programHotspots[key] !== undefined) {
        this.programIndex = this._programHotspots[key];
        this.draw();
        return;
    }
};

UsageViewer.prototype.cleanup = function () {
    this._clearProgramResources();
    if (this.listFrame) { try { this.listFrame.close(); } catch (e) { } }
    if (this.detailFrame) { try { this.detailFrame.close(); } catch (e) { } }
    this.listFrame = this.detailFrame = null;
    Subprogram.prototype.cleanup.call(this);
};

UsageViewer.prototype._clearProgramResources = function () {
    if (this._programFrames && this._programFrames.length) {
        for (var i = 0; i < this._programFrames.length; i++) {
            try { this._programFrames[i].close(); } catch (e) { }
        }
    }
    this._programFrames = [];
    this._programHotspots = {};
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
};

UsageViewer.prototype._ensureIconLookup = function () {
    if (this._iconLookup) return;
    this._iconLookup = {};
    var dirBase = system.mods_dir + 'iconshell/assets/';
    var patterns = ['*.bin', '*.ans'];
    for (var p = 0; p < patterns.length; p++) {
        var list;
        try { list = directory(dirBase + patterns[p]) || []; } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) {
            var full = list[i];
            if (!full) continue;
            var name = full.substr(full.lastIndexOf('/') + 1);
            if (!name) continue;
            var base = name.replace(/\.(ans|bin)$/i, '');
            if (!base) continue;
            this._iconLookup[base.toUpperCase()] = base;
        }
    }
};

UsageViewer.prototype._lookupIconBase = function (programId) {
    var key = programId ? String(programId).toUpperCase() : '';
    if (!key) return null;
    if (typeof ICON_LOOKUP === 'object' && ICON_LOOKUP && ICON_LOOKUP[key]) return ICON_LOOKUP[key];
    this._ensureIconLookup();
    return this._iconLookup[key] || null;
};

UsageViewer.prototype._getIconPalette = function () {
    function filter(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (typeof list[i] === 'number') out.push(list[i]);
        }
        return out;
    }
    var bg = filter([BG_BLUE, BG_CYAN, BG_GREEN, BG_MAGENTA, BG_BROWN, BG_LIGHTGRAY, BG_BLACK]);
    var fg = filter([WHITE, LIGHTGRAY, YELLOW, CYAN, GREEN, MAGENTA, BLACK]);
    if (!bg.length) bg.push(BG_BLACK);
    if (!fg.length) fg.push(LIGHTGRAY);
    return { bg: bg, fg: fg };
};

UsageViewer.prototype._hashString = function (str) {
    str = String(str || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    if (hash === 0) hash = 1;
    return Math.abs(hash);
};

UsageViewer.prototype._formatProgramName = function (programId) {
    if (!programId) return 'Unknown';
    var name = String(programId);
    var colon = name.lastIndexOf(':');
    if (colon !== -1) name = name.substr(colon + 1);
    name = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name.length) return 'Unknown';
    if (/^[A-Z0-9]+$/.test(name)) return name;
    var parts = name.split(' ');
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part.length) continue;
        parts[i] = part.charAt(0).toUpperCase() + part.substr(1);
    }
    return parts.join(' ');
};

UsageViewer.prototype._ensureProgramCatalog = function () {
    if (this._programCatalog) return;
    var catalog = {};
    try {
        if (system && system.xtrn_area && system.xtrn_area.length) {
            for (var s = 0; s < system.xtrn_area.length; s++) {
                var area = system.xtrn_area[s];
                if (!area || !area.prog_list) continue;
                for (var p = 0; p < area.prog_list.length; p++) {
                    var prog = area.prog_list[p];
                    if (!prog || !prog.code) continue;
                    var code = String(prog.code);
                    var label = prog.name ? String(prog.name) : code;
                    var lower = code.toLowerCase();
                    catalog[lower] = label;
                    catalog[code.replace(/\s+/g, '_').toLowerCase()] = label;
                }
            }
        }
        if (typeof xtrn_area !== 'undefined' && xtrn_area && xtrn_area.prog) {
            for (var key in xtrn_area.prog) {
                if (!xtrn_area.prog.hasOwnProperty(key)) continue;
                var progInfo = xtrn_area.prog[key];
                if (!progInfo) continue;
                var rawCode = progInfo.code ? String(progInfo.code) : String(key);
                var title = progInfo.name ? String(progInfo.name) : rawCode;
                var lk = rawCode.toLowerCase();
                catalog[lk] = title;
                catalog[rawCode.replace(/\s+/g, '_').toLowerCase()] = title;
            }
        }
    } catch (e) {
        // leave catalog as whatever we built so far
    }
    this._programCatalog = catalog;
};

UsageViewer.prototype._lookupProgramFriendlyName = function (programId) {
    if (!programId) return null;
    this._ensureProgramCatalog();
    var key = String(programId).toLowerCase();
    if (this._programCatalog && this._programCatalog[key]) return this._programCatalog[key];
    var underscored = key.replace(/\s+/g, '_');
    if (this._programCatalog && this._programCatalog[underscored]) return this._programCatalog[underscored];
    return null;
};

UsageViewer.prototype._resolveProgramDisplayInfo = function (prog) {
    prog = prog || {};
    var friendly = this._lookupProgramFriendlyName(prog.id);
    var info = {
        displayName: friendly || this._formatProgramName(prog.id),
        iconFile: null,
        iconBg: null,
        iconFg: null
    };
    var base = this._lookupIconBase(prog.id);
    if (base) {
        info.iconFile = base;
    } else {
        var palette = this._getIconPalette();
        var hash = this._hashString(prog.id || info.displayName);
        var bg = palette.bg.length ? palette.bg[hash % palette.bg.length] : BG_BLACK;
        var fg = palette.fg.length ? palette.fg[(hash >> 3) % palette.fg.length] : LIGHTGRAY;
        info.iconBg = bg;
        info.iconFg = fg;
    }
    return info;
};

UsageViewer.prototype._renderProgramIcon = function (frame, info) {
    if (!frame || !info) return;
    var attr = ICSH_ATTR('FRAME_STANDARD');
    if (typeof info.iconBg === 'number' || typeof info.iconFg === 'number') {
        attr = (info.iconBg || 0) | (info.iconFg || 0);
    }
    var loaded = false;
    var width = frame.width || 0;
    var height = frame.height || 0;
    try { frame.open(); } catch (openErr) { }
    if (info.iconFile && width > 0 && height > 0) {
        var basePath = system.mods_dir + 'iconshell/assets/' + info.iconFile;
        var binPath = basePath + '.bin';
        var ansPath = basePath + '.ans';
        try {
            if (file_exists(binPath)) {
                frame.load(binPath, width, height);
                loaded = true;
            } else if (file_exists(ansPath)) {
                frame.load(ansPath, width, height);
                loaded = true;
            }
        } catch (e) {
            loaded = false;
        }
    }
    if (!loaded) {
        frame.clear(attr);
    } else {
        if (typeof frame.makeContentTransparent === 'function') {
            try { frame.makeContentTransparent(); } catch (e2) { frame.transparent = true; }
        } else {
            frame.transparent = true;
        }
    }
    try { frame.cycle(); } catch (e4) { }
};

UsageViewer.prototype._drawProgramBlocks = function (df, month) {
    this._clearProgramResources();
    var programs = month.programs || [];
    if (!programs.length) {
        this.programIndex = 0;
        this.programTop = 0;
        df.putmsg('  (No program data)\r\n');
        return;
    }
    this.programIndex = Math.min(this.programIndex, Math.max(0, programs.length - 1));
    var startRow = 4;
    var instructionRow = df.height - 1;
    var availableRows = instructionRow - startRow;
    if (availableRows <= 0) return;
    var blockHeight = 6;
    var spacer = 1;
    var step = blockHeight + spacer;
    var maxVisible = Math.max(1, Math.floor((availableRows + spacer) / step));
    if (this.programIndex < this.programTop) this.programTop = this.programIndex;
    while (this.programIndex >= this.programTop + maxVisible) this.programTop++;
    var hotspots = {};
    for (var vis = 0; vis < maxVisible; vis++) {
        var idx = this.programTop + vis;
        if (idx >= programs.length) break;
        var y = startRow + vis * step;
        if (y >= instructionRow) break;
        var blockHeightAdjusted = Math.min(blockHeight, instructionRow - y);
        if (blockHeightAdjusted <= 0) break;
        this._drawProgramBlock(df, y, blockHeightAdjusted, programs[idx], idx, hotspots, vis);
    }
    this._programHotspots = hotspots;
};

UsageViewer.prototype._drawProgramBlock = function (df, baseY, height, prog, index, hotspots, vis) {
    var highlight = (this.focus === 'program' && index === this.programIndex);
    var baseAttr = BG_BLACK | LIGHTGRAY;
    var highlightAttr = BG_BLACK | WHITE;
    var attr = highlight ? highlightAttr : baseAttr;
    var width = df.width;
    if (width <= 0 || height <= 0) return;

    var blockFrame = new Frame(1, baseY, width, height, attr, df);
    blockFrame.transparent = false;
    try { blockFrame.open(); } catch (e) { }
    blockFrame.clear(attr);
    this._programFrames.push(blockFrame);

    var display = this._resolveProgramDisplayInfo(prog);
    var iconWidth = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS && ICSH_CONSTANTS.ICON_W) ? ICSH_CONSTANTS.ICON_W : 12;
    var iconHeight = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS && ICSH_CONSTANTS.ICON_H) ? ICSH_CONSTANTS.ICON_H : 6;
    iconHeight = Math.min(iconHeight, height);
    var leftPad = 1;
    var gap = 2;
    var availableForIcon = Math.max(0, width - leftPad - gap - 1);
    var showIcon = iconWidth > 0 && iconHeight > 0 && availableForIcon >= iconWidth;
    var iconFrame = null;
    var textStart = gap + 1;
    var iconError = null;
    if (showIcon) {
        var iconX = blockFrame.x + leftPad;
        var iconY = blockFrame.y;
        try {
            iconFrame = new Frame(iconX, iconY, iconWidth, iconHeight, attr, df);
            iconFrame.transparent = true;
            this._programFrames.push(iconFrame);
            this._renderProgramIcon(iconFrame, display);
            textStart = leftPad + iconWidth + gap + 1;
        } catch (iconEx) {
            iconError = iconEx;
            iconFrame = null;
            textStart = gap + 1;
        }
    }
    if (textStart > width) textStart = Math.max(2, width - 10);
    var textWidth = Math.max(0, width - textStart + 1);

    var lines = [];
    var rankStr = '\x01h\x01y#' + (index + 1) + '\x01n';
    var nameStr = '\x01h\x01c' + display.displayName + '\x01n';
    lines.push(rankStr + ' ' + nameStr);
    lines.push('\x01gTime Played:\x01n  \x01h\x01g' + this._formatDuration(prog.seconds) + '\x01n');
    lines.push('Launches:     ' + prog.count);
    lines.push('\x01rLast Played:\x01n  \x01h\x01r' + this._formatTimestamp(prog.lastTimestamp) + '\x01n');
    lines.push('\x01mTop Players:\x01n  \x01h\x01m' + this._getTopPlayersString(prog.id) + '\x01n');
    lines.push('');
    for (var row = 0; row < height && row < lines.length; row++) {
        var line = lines[row] || '';
        if (row === 0 && iconError) line += ' [icon error]';
        if (textWidth > 0) {
            blockFrame.attr = attr;
            blockFrame.gotoxy(textStart, row + 1);
            var padded = this._padColoredLine(line, textWidth);
            blockFrame.putmsg(padded);
        }
    }
    try { blockFrame.cycle(); } catch (cycleErr) { }

    if (vis < 9 && typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
        var hotKey = String(vis + 49);
        hotspots[hotKey] = index;
        var minX = df.x;
        var maxX = df.x + width - 1;
        var startY = df.y + baseY - 1;
        for (var y = 0; y < height; y++) {
            try { console.add_hotspot(hotKey, false, minX, maxX, startY + y); } catch (e2) { }
        }
    }
};

UsageViewer.prototype._padColoredLine = function (str, width) {
    if (!str) str = '';
    if (width <= 0) return '';
    var out = '';
    var visible = 0;
    for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '\x01') {
            if (i + 1 < str.length) {
                out += ch + str.charAt(i + 1);
                i++;
            }
            continue;
        }
        if (visible >= width) break;
        out += ch;
        visible++;
    }
    if (visible < width) {
        out += Array(width - visible + 1).join(' ');
    }
    if (out.indexOf('\x01n') === -1) out += '\x01n';
    return out;
};

UsageViewer.prototype._getTopPlayersString = function (programId) {
    var month = this.months[this.index] || {};
    var players = this._getTopPlayers(month, programId);
    if (!players || !players.length) return 'None';
    var joined = players.join(', ');
    var maxLen = this.detailFrame ? this.detailFrame.width - 5 : 40;
    if (joined.length > maxLen) joined = joined.substr(0, maxLen);
    return joined;
};

UsageViewer.prototype._formatTimestamp = function (ts) {
    if (!ts) return 'Never';
    var seconds = Math.floor(ts / 1000);
    try {
        return strftime('%Y-%m-%d %H:%M', seconds);
    } catch (e) {
        var d = new Date(ts);
        return d.toISOString().replace('T', ' ').substr(0, 16);
    }
};

UsageViewer.prototype._getTopPlayers = function (month, programId) {
    var users = month.users || {};
    var ranking = [];
    for (var key in users) {
        if (!users.hasOwnProperty(key)) continue;
        var info = users[key];
        if (!info || !info.programs || !info.programs[programId]) continue;
        var stats = info.programs[programId];
        ranking.push({
            key: key,
            alias: info.alias || key,
            seconds: stats.seconds || 0,
            count: stats.count || 0
        });
    }
    ranking.sort(function (a, b) {
        if (b.seconds !== a.seconds) return b.seconds - a.seconds;
        return b.count - a.count;
    });
    return ranking.slice(0, 3).map(function (entry) {
        return entry.alias + ' (' + entry.count + ')';
    });
};

this.UsageViewer = UsageViewer;
