// File Area (NewsReader-style lifecycle)
// States: libs -> dirs -> files
// Input:
//   Arrow keys : navigate
//   ENTER      : open / info
//   ESC/BACK   : back (or exit at libs)
//   T/Space    : tag/untag file (FILES)
//   D          : download (FILES; tagged or current)
//   U          : upload (FILES; into current dir)

load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/shell/icon.js');
load('sbbsdefs.js');
load('file_size.js');

// ---------- Constructor & lifecycle ----------

function FileArea(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'file-area', parentFrame: opts.parentFrame, shell: opts.shell });

    // Frames (single surface like NewsReader)
    this.headerFrame = null;
    this.statusFrame = null;
    this.listFrame = null;

    // Grid/icon caches
    this.iconCells = [];          // [{icon,label,index,iconObj,labelText}]
    this._gridLayout = null;      // { type:'libs'|'dirs', cols, visibleRows, total, rows, cellWidth, cellHeight }
    this._hotspotMap = {};
    this._hotspotChars = null;
    this._iconExistCache = {};

    // Data / state
    this.state = 'libs';          // 'libs' | 'dirs' | 'files'
    this.selectedIndex = 0;
    this.scrollOffset = 0;

    this.libs = [];
    this.dirs = [];
    this.files = [];

    this.libIndex = -1;
    this.dirCode = null;

    this.tagged = {};             // filename -> true
    this.statusMessage = '';
    this.statusMessageTs = 0;
    this.id = "filearea";
    // Theming (compatible with attr.ini overrides)
    if (typeof this.registerColors === 'function') {
        this.registerColors({
            LIST_ACTIVE: { BG: BG_MAGENTA, FG: YELLOW },
            LIST_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY },
            HEADER_ATTR: { BG: BG_MAGENTA, FG: WHITE },
            STATUS_ATTR: { BG: BG_BLACK, FG: LIGHTGRAY },
            TEXT_HOTKEY: { FG: YELLOW },
            TEXT_NORMAL: { FG: LIGHTGRAY },
            TEXT_BOLD: { FG: LIGHTMAGENTA }
        });
    }

    this._resetState(); // ensure clean
}
extend(FileArea, Subprogram);

// Mirrors NewsReader.reset pattern
FileArea.prototype._resetState = function () {
    this._destroyIconCells();
    this._releaseHotspots();
    this.iconCells = [];
    this._gridLayout = null;
    this._hotspotMap = {};
    this._hotspotChars = null;
    this._iconExistCache = {};

    this.state = 'libs';
    this.selectedIndex = 0;
    this.scrollOffset = 0;

    this.libs = [];
    this.dirs = [];
    this.files = [];

    this.libIndex = -1;
    this.dirCode = null;

    this.tagged = {};
    this.statusMessage = '';
    this.statusMessageTs = 0;
};

FileArea.prototype.enter = function (done) {
    this._resetState();
    // Preload libraries once on entry
    this._loadLibraries();
    Subprogram.prototype.enter.call(this, done);
};

// ---------- Frames (single surface) ----------

FileArea.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;

    if (!this.headerFrame) {
        var ha = this.paletteAttr('HEADER_ATTR');
        this.headerFrame = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width, 1, ha, this.parentFrame);
        this.headerFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.headerFrame);
    }
    if (!this.listFrame) {
        var h = Math.max(1, this.parentFrame.height - 2);
        var la = this.paletteAttr('LIST_INACTIVE');
        this.listFrame = new Frame(this.parentFrame.x, this.parentFrame.y + 1, this.parentFrame.width, h, la, this.parentFrame);
        this.listFrame.open();
        this.listFrame.word_wrap = false;
        this.setBackgroundFrame(this.listFrame)
        if (typeof this.registerFrame === 'function') this.registerFrame(this.listFrame);
    }
    if (!this.statusFrame) {
        var sa = this.paletteAttr('STATUS_ATTR');
        this.statusFrame = new Frame(this.parentFrame.x, this.parentFrame.height, this.parentFrame.width, 1, sa, this.parentFrame);
        this.statusFrame.open();
        if (typeof this.registerFrame === 'function') this.registerFrame(this.statusFrame);
    }

};

FileArea.prototype._cleanup = function () {
    // Be very defensive; make this safe to call twice.
    try { this._releaseHotspots(); } catch (_e) { }

    // Close child icon frames first (so listFrame isn’t the parent anymore).
    try { this._destroyIconCells(); } catch (_e) { }

    // Now close the top-level frames
    var frames = ['headerFrame', 'statusFrame', 'listFrame'];
    for (var i = 0; i < frames.length; i++) {
        var key = frames[i];
        var f = this[key];
        if (!f) continue;
        try { if (typeof f.close === 'function') f.close(); } catch (_eClose) { }
        if (this._myFrames) {
            try {
                var idx = this._myFrames.indexOf(f);
                if (idx !== -1) this._myFrames.splice(idx, 1);
            } catch (_eSplice) { }
        }
        this[key] = null;
    }

    // Reset in-memory state so any accidental late calls are harmless
    try { this._resetState(); } catch (_e) { }
    // IMPORTANT: do NOT call Subprogram.prototype.cleanup here.
    // Base class owns the lifecycle and will stop timers/IO as needed.
};

// ---------- Drawing ----------

FileArea.prototype.draw = function () {
    this._ensureFrames();
    if (!this.listFrame) return;

    this._refreshStatus();

    // Reset any stale icon cells when switching mode
    if (this.state !== 'libs' && this._gridLayout && this._gridLayout.type === 'libs') this._destroyIconCells();
    if (this.state !== 'dirs' && this._gridLayout && this._gridLayout.type === 'dirs') this._destroyIconCells();

    switch (this.state) {
        case 'libs': this._drawLibs(); break;
        case 'dirs': this._drawDirs(); break;
        case 'files': this._drawFiles(); break;
    }

    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (_e) { }
    }
};

FileArea.prototype._setHeader = function (text) {
    if (!this.headerFrame) return;
    var t = text || 'File Area';
    if (t.length > this.headerFrame.width) t = t.substr(0, this.headerFrame.width);
    this.headerFrame.clear(this.paletteAttr('HEADER_ATTR'));
    this.headerFrame.gotoxy(1, 1);
    this.headerFrame.center(t);
};

FileArea.prototype._setStatus = function (text) {
    this.statusMessage = text || '';
    this.statusMessageTs = Date.now();
    this._refreshStatus();
};

FileArea.prototype._refreshStatus = function () {
    if (!this.statusFrame) return;
    var t = this.statusMessage || '';
    if (t.length > this.statusFrame.width) t = t.substr(0, this.statusFrame.width);
    this.statusFrame.clear(this.paletteAttr('STATUS_ATTR'));
    this.statusFrame.gotoxy(1, 1);
    this.statusFrame.putmsg(t);
};

// ---------- Data loads (Synchronet JSOBJ wrappers) ----------

FileArea.prototype._loadLibraries = function () {
    var list = [];
    for (var i = 0; i < file_area.lib_list.length; i++) {
        var lib = file_area.lib_list[i];
        if (!lib) continue;
        if (typeof lib.index !== 'number') lib.index = i;
        list.push({ name: lib.name || lib.description || ('Library ' + (i + 1)), index: i, code: lib.code || '' });
    }
    this.libs = list;
    this.state = 'libs';
    this.selectedIndex = (this.libs.length ? 1 : 0); // skip Exit tile by default
    this.scrollOffset = 0;
};

FileArea.prototype._loadDirs = function (libIdx) {
    this.libIndex = libIdx;
    var lib = file_area.lib_list[libIdx];
    var list = [];
    if (lib && lib.dir_list) {
        for (var i = 0; i < lib.dir_list.length; i++) {
            var dir = lib.dir_list[i];
            if (!dir) continue;
            if (typeof dir.index !== 'number') dir.index = i;
            if (typeof dir.lib_index !== 'number') dir.lib_index = libIdx;
            list.push({ name: dir.name || dir.description || dir.code || ('Dir ' + (i + 1)), code: dir.code, index: i, lib_index: libIdx });
        }
    }
    this.dirs = list;
    this.state = 'dirs';
    this.selectedIndex = (this.dirs.length ? 1 : 0); // skip Back tile
    this.scrollOffset = 0;
};

FileArea.prototype._loadFiles = function (dirCode) {
    this.dirCode = dirCode;
    var fb = new FileBase(dirCode);
    var list = [];
    try {
        if (fb.open()) {
            var raw = fb.get_list('', FileBase.DETAIL.NORM) || [];
            for (var i = 0; i < raw.length; i++) {
                var f = raw[i];
                list.push({
                    name: f.name,
                    size: f.size,
                    sizeStr: file_size_str(f.size),
                    dateStr: system.datestr(f.added),
                    desc: f.desc || ''
                });
            }
        }
    } catch (e) {
        // ignore; list remains empty
    } finally {
        try { fb.close(); } catch (_e) { }
    }
    this.files = list;
    this.state = 'files';
    this.selectedIndex = (this.files.length ? 0 : -1);
    this.scrollOffset = 0;
};

// ---------- Icon / grid helpers (from NewsReader style) ----------

FileArea.prototype._getIconMetrics = function () {
    var w = 12, h = 6;
    if (typeof ICSH_CONSTANTS === 'object' && ICSH_CONSTANTS) {
        if (typeof ICSH_CONSTANTS.ICON_W === 'number') w = ICSH_CONSTANTS.ICON_W;
        if (typeof ICSH_CONSTANTS.ICON_H === 'number') h = ICSH_CONSTANTS.ICON_H;
    }
    return { width: Math.max(1, w), height: Math.max(1, h) };
};

FileArea.prototype._destroyIconCells = function () {
    var cells = this.iconCells || [];
    for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (!c) continue;
        if (c.icon) { try { c.icon.close(); } catch (_e1) { } }
        if (c.label) { try { c.label.close(); } catch (_e2) { } }
        if (this._myFrames) {
            if (c.icon) { var ai = this._myFrames.indexOf(c.icon); if (ai !== -1) this._myFrames.splice(ai, 1); }
            if (c.label) { var al = this._myFrames.indexOf(c.label); if (al !== -1) this._myFrames.splice(al, 1); }
        }
    }
    this.iconCells = [];
    this._gridLayout = null;
    this._releaseHotspots();
};

FileArea.prototype._iconExists = function (name) {
    if (!name) return false;
    if (this._iconExistCache.hasOwnProperty(name)) return this._iconExistCache[name];
    var baseDir = (system && system.mods_dir) ? system.mods_dir : (js && js.exec_dir ? js.exec_dir : '');
    if (baseDir && baseDir.charAt(baseDir.length - 1) !== '/' && baseDir.charAt(baseDir.length - 1) !== '\\') baseDir += '/';
    var base = baseDir + 'future_shell/assets/' + name;
    var ok = false;
    try {
        ok = file_exists(base + '.bin') || file_exists(base + '.ans');
    } catch (_e) { }
    this._iconExistCache[name] = ok;
    return ok;
};

// Icon names you likely already have in your theme pack:
FileArea.prototype._iconForLib = function (lib) {
    var code = (lib && lib.code) ? String(lib.code).toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
    if (code && this._iconExists('filearea_lib_' + code)) return 'filearea_lib_' + code;
    if (this._iconExists('apps_folder')) return 'apps_folder';
    return ''; // blank ok; Icon falls back to label
};
FileArea.prototype._iconForDir = function (dir) {
    var code = (dir && dir.code) ? String(dir.code).toLowerCase().replace(/[^a-z0-9]+/g, '_') : '';
    if (code && this._iconExists('filearea_dir_' + code)) return 'filearea_dir_' + code;
    if (this._iconExists('folder')) return 'folder';
    return '';
};

FileArea.prototype._renderIconLabel = function (frame, text, isSelected) {
    var attr = isSelected ? this.paletteAttr('LIST_ACTIVE') : this.paletteAttr('LIST_INACTIVE');
    try { frame.clear(attr); frame.home(); } catch (_e) { }
    var width = frame.width || 0;
    if (width <= 0) return;
    var label = text || '';
    if (label.length > width) label = label.substr(0, width);
    var padLeft = Math.max(0, Math.floor((width - label.length) / 2));
    var padRight = Math.max(0, width - padLeft - label.length);
    if (padLeft) frame.putmsg(new Array(padLeft + 1).join(' '));
    if (label) frame.putmsg(label);
    if (padRight) frame.putmsg(new Array(padRight + 1).join(' '));
};

FileArea.prototype._ensureHotspotChars = function () {
    if (this._hotspotChars && this._hotspotChars.length) return this._hotspotChars;
    var chars = [], used = {};
    function add(s) { for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (!used[ch]) { used[ch] = true; chars.push(ch); } } }
    add('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{};:,./?');
    this._hotspotChars = chars; return chars;
};

FileArea.prototype._releaseHotspots = function () {
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_e) { }
    }
    this._hotspotMap = {};
};

FileArea.prototype._registerGridHotspots = function (cells) {
    this._releaseHotspots();
    if (!cells || !cells.length) return;
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    var chars = this._ensureHotspotChars();
    var baseX = this.listFrame ? this.listFrame.x : 1;
    var baseY = this.listFrame ? this.listFrame.y : 1;
    var max = Math.min(chars.length, cells.length);
    for (var i = 0; i < max; i++) {
        var cell = cells[i]; if (!cell || !cell.icon) continue;
        var cmd = chars[i];
        var minX = baseX + cell.icon.x - 1;
        var maxX = minX + cell.icon.width - 1;
        var minY = baseY + cell.icon.y - 1;
        var maxY = minY + cell.icon.height;
        if (cell.label) {
            var ly = baseY + cell.label.y - 1;
            var ly2 = ly + cell.label.height - 1;
            if (ly < minY) minY = ly;
            if (ly2 > maxY) maxY = ly2;
        }
        for (var y = minY; y <= maxY; y++) {
            try { console.add_hotspot(cmd, false, minX, maxX, y); } catch (_e) { }
        }
        this._hotspotMap[cmd] = cell.index;
    }
};

FileArea.prototype._registerListHotspots = function (rows) {
    this._releaseHotspots();
    if (!rows || !rows.length || !this.listFrame) return;
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    var chars = this._ensureHotspotChars();
    var baseX = this.listFrame.x, baseY = this.listFrame.y, width = this.listFrame.width;
    var max = Math.min(chars.length, rows.length);
    for (var i = 0; i < max; i++) {
        var row = rows[i]; if (!row || typeof row.index !== 'number') continue;
        var cmd = chars[i];
        var absY = baseY + row.y - 1;
        try { console.add_hotspot(cmd, false, baseX, baseX + width - 1, absY); } catch (_e) { }
        this._hotspotMap[cmd] = row.index;
    }
};

// ---------- Grid renderers (LIBS / DIRS) ----------

FileArea.prototype._renderGrid = function (items, type) {
    this._destroyIconCells();
    if (!this.listFrame) return;

    // Inject synthetic tiles
    var tiles = items.slice(0);
    if (type === 'libs') tiles.unshift({ _type: 'exit', name: 'Exit', icon: 'exit' });
    if (type === 'dirs') tiles.unshift({ _type: 'back', name: 'Back', icon: 'back' });

    if (tiles.length === 0) {
        this.listFrame.clear(this.paletteAttr('LIST_INACTIVE'));
        this.listFrame.gotoxy(1, 1);
        this.listFrame.putmsg('No entries.');
        return;
    }
    if (this.selectedIndex >= tiles.length) this.selectedIndex = tiles.length - 1;
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (tiles.length > 1 && this.selectedIndex === 0 && tiles[0] && (tiles[0]._type === 'exit' || tiles[0]._type === 'back')) {
        this.selectedIndex = 0;
    }

    var metrics = this._getIconMetrics();
    var labelH = 1;
    var paddingTop = 2;
    var cellW = metrics.width + 4;
    var cellH = metrics.height + labelH + 2;
    var fw = this.listFrame.width, fh = this.listFrame.height;
    var usableH = Math.max(1, fh - paddingTop);
    var cols = Math.max(1, Math.floor(fw / cellW));
    var visibleRows = Math.max(1, Math.floor(usableH / cellH));
    var total = tiles.length;
    var rows = Math.max(1, Math.ceil(total / cols));

    // Scroll row math (NewsReader style)
    var curRow = Math.floor(this.selectedIndex / cols);
    var maxRowOffset = Math.max(0, rows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    if (curRow < this.scrollOffset) this.scrollOffset = curRow;
    if (curRow >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, curRow - visibleRows + 1);

    this.listFrame.clear(this.paletteAttr('LIST_INACTIVE'));

    var startRow = this.scrollOffset;
    var endRow = Math.min(rows, startRow + visibleRows);
    var cells = [];

    var bgVal = this.paletteAttr('LIST_INACTIVE') & 0x70;
    var fgVal = this.paletteAttr('LIST_INACTIVE') & 0x0F;

    for (var row = startRow; row < endRow; row++) {
        for (var col = 0; col < cols; col++) {
            var index = row * cols + col;
            if (index >= total) break;
            var item = tiles[index];
            var x = 1 + col * cellW;
            var y = 1 + paddingTop + (row - startRow) * cellH;
            if (y + metrics.height + labelH - 1 > fh) continue;

            var iconFrame = new Frame(x, y, metrics.width, metrics.height, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            var labelFrame = new Frame(x, y + metrics.height, metrics.width, labelH, this.paletteAttr('LIST_INACTIVE'), this.listFrame);
            iconFrame.open(); labelFrame.open();
            if (typeof this.registerFrame === 'function') { this.registerFrame(iconFrame); this.registerFrame(labelFrame); }

            var iconName = '';
            if (item._type === 'exit') iconName = 'back';
            else if (item._type === 'back') iconName = 'back';
            else if (type === 'libs') iconName = this._iconForLib(item);
            else if (type === 'dirs') iconName = this._iconForDir(item);

            var iconData = { iconFile: iconName, label: '', iconBg: bgVal, iconFg: fgVal };
            var iconObj = new Icon(iconFrame, labelFrame, iconData);
            try { iconObj.render(); } catch (_e) { }

            var label = item.name || (type === 'libs' ? 'Library' : 'Directory');
            this._renderIconLabel(labelFrame, label, index === this.selectedIndex);

            cells.push({ icon: iconFrame, label: labelFrame, index: index, iconObj: iconObj, labelText: label });
        }
    }

    this.iconCells = cells;
    this._gridLayout = { type: type, cols: cols, visibleRows: visibleRows, total: total, rows: rows, cellWidth: cellW, cellHeight: cellH };
    if (cells.length) this._registerGridHotspots(cells);
    else this._releaseHotspots();
    var line = this.colorize('TEXT_HOTKEY', 'ENTER') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'open ') +
        this.colorize('TEXT_HOTKEY', 'ESC') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'exit ') +
        this.colorize('TEXT_HOTKEY', 'Click') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'select ');
    // header & status
    if (type === 'libs') {
        this._setHeader('Libraries');

        this._setStatus(line);
    } else {
        var lib = (this.libIndex >= 0) ? file_area.lib_list[this.libIndex] : null;
        this._setHeader((lib ? (lib.name || lib.description || 'Library') : 'Library') + ' > Directories');
        this._setStatus(line);
    }
};

FileArea.prototype._drawLibs = function () { this._renderGrid(this.libs, 'libs'); };

FileArea.prototype._drawDirs = function () { this._renderGrid(this.dirs, 'dirs'); };

// ---------- FILES list renderer ----------

FileArea.prototype._drawFiles = function () {
    if (!this.listFrame) return;
    var items = this.files || [];
    var height = this.listFrame.height || 1;
    var la = this.paletteAttr('LIST_INACTIVE');
    this.listFrame.clear(la);

    // keep selected & scrolled visible
    if (items.length) {
        if (this.selectedIndex < 0) this.selectedIndex = 0;
        if (this.selectedIndex >= items.length) this.selectedIndex = items.length - 1;
        if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
        if (this.selectedIndex >= this.scrollOffset + height) this.scrollOffset = Math.max(0, this.selectedIndex - height + 1);
    } else {
        this.selectedIndex = -1;
        this.scrollOffset = 0;
    }

    var widths = this._computeFileListWidths();
    var rowHotspots = [];
    for (var row = 0; row < height; row++) {
        var idx = this.scrollOffset + row;
        if (idx >= items.length) break;
        var line = this._formatFileLine(idx, widths);
        if (line.length > this.listFrame.width) line = line.substr(0, this.listFrame.width);
        var attr = (idx === this.selectedIndex) ? this.paletteAttr('LIST_ACTIVE') : la;
        this.listFrame.attr = attr;
        this.listFrame.gotoxy(1, row + 1);
        this.listFrame.putmsg(line);
        rowHotspots.push({ index: idx, y: row + 1 });
    }
    this.listFrame.attr = la;
    this._registerListHotspots(rowHotspots);

    // header & status
    var lib = (this.libIndex >= 0) ? file_area.lib_list[this.libIndex] : null;
    var dir = this.dirCode ? file_area.dir[this.dirCode] : null;
    var title = [];
    if (lib) title.push(lib.name || lib.description || 'Library');
    if (dir) title.push(dir.description || dir.name || this.dirCode);
    this._setHeader(title.join(' > ') || 'Files');
    var statusLine = this.colorize('TEXT_HOTKEY', 'ENTER') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'info ') +
        this.colorize('TEXT_HOTKEY', 'T/Space') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'tag ') +
        this.colorize('TEXT_HOTKEY', 'D') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'download ') +
        this.colorize('TEXT_HOTKEY', 'U') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'upload ') +
        this.colorize('TEXT_HOTKEY', 'ESC') + this.colorize('TEXT_NORMAL', '=') + this.colorize('TEXT_BOLD', 'back');
    this._setStatus(statusLine);
};

FileArea.prototype._computeFileListWidths = function () {
    var w = this.listFrame ? this.listFrame.width : 80;
    var name = Math.max(18, Math.min(30, w - 34));
    var size = 9;
    var date = 12;
    var desc = Math.max(0, w - (name + size + date + 5));
    return { name: name, size: size, date: date, desc: desc };
};

FileArea.prototype._formatFileLine = function (idx, widths) {
    var f = this.files[idx];
    var tag = this.tagged[f.name] ? '*' : ' ';
    var name = f.name || '';
    if (name.length > widths.name) name = name.substr(0, widths.name);
    var sizeStr = (f.sizeStr || '').toString();
    if (sizeStr.length > widths.size) sizeStr = sizeStr.substr(0, widths.size);
    var dateStr = (f.dateStr || '').toString();
    if (dateStr.length > widths.date) dateStr = dateStr.substr(0, widths.date);
    var desc = f.desc || '';
    if (desc.length > widths.desc) desc = desc.substr(0, widths.desc);
    return format('%c %-' + widths.name + 's %' + widths.size + 's %-' + widths.date + 's %s', tag, name, sizeStr, dateStr, desc);
};

// ---------- Input handling ----------

FileArea.prototype.handleKey = function (key) {
    if (!key) return;

    // Hotspots first for grids and files list
    if (this._hotspotMap && this._hotspotMap[key] !== undefined) {
        var idx = this._hotspotMap[key];
        if (typeof idx === 'number') {
            this.selectedIndex = idx;
            if (this.state === 'libs') return this._activateLib();
            if (this.state === 'dirs') return this._activateDir();
            if (this.state === 'files') return this._openFileInfo();
        }
    }

    switch (this.state) {
        case 'libs':
            return this._handleGridNav(key, this.libs.length + 1 /* Exit tile */, this._activateLib.bind(this), this.exit.bind(this));
        case 'dirs':
            return this._handleGridNav(key, this.dirs.length + 1 /* Back tile */, this._activateDir.bind(this), this._backFromDirs.bind(this));
        case 'files':
            return this._handleFilesNav(key);
    }
};

FileArea.prototype._handleGridNav = function (key, lengthWithTile, onEnter, onBack) {
    var length = Math.max(0, (lengthWithTile | 0));
    if (length === 0) return;

    // Prefer layout from renderer, fall back to computed meta
    var layout = this._gridLayout || null;
    var meta = this.gridMeta || null;

    var cols = Math.max(1, (layout && layout.cols) || (meta && meta.cols) || 1);
    var visibleRows = Math.max(1, (layout && layout.visibleRows) || (meta && meta.rowsVisible) || 1);

    // Clamp current selection into range
    if (typeof this.selectedIndex !== 'number') this.selectedIndex = 0;
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.selectedIndex >= length) this.selectedIndex = length - 1;

    // Helpers
    function rowOf(i) { return Math.floor(i / cols); }
    function colOf(i) { return i % cols; }
    function maxRowOf(len) { return Math.floor((len - 1) / cols); }
    function clampToRowCol(row, col, len) {
        var lastRow = maxRowOf(len);
        if (row < 0) row = 0;
        if (row > lastRow) row = lastRow;
        var inRow = Math.min(cols, len - row * cols); // items in this row (ragged last row)
        if (inRow <= 0) { row = lastRow; inRow = Math.min(cols, len - row * cols); }
        if (col < 0) col = 0;
        if (col >= inRow) col = inRow - 1;
        return row * cols + col;
    }

    var idx = this.selectedIndex;
    var row = rowOf(idx);
    var col = colOf(idx);

    switch (key) {
        case KEY_UP:
        case "\u001e": // Ctrl-^ typically up
        case "\x1B[A": // ANSI up
            idx = clampToRowCol(row - 1, col, length);
            break;

        case KEY_DOWN:
        case "\u000a": // Ctrl-J sometimes mapped as down in your env
        case "\x1B[B": // ANSI down
            idx = clampToRowCol(row + 1, col, length);
            break;

        case KEY_LEFT:
        case "\u001d":
        case "\x1B[D": // ANSI left
            idx = Math.max(0, idx - 1);
            break;

        case KEY_RIGHT:
        case "\u0006":
        case "\x1B[C": // ANSI right
            idx = Math.min(length - 1, idx + 1);
            break;

        case KEY_PGUP: {
            var page = cols * visibleRows;
            var target = Math.max(0, idx - page);
            // maintain column if possible on the new row
            idx = clampToRowCol(rowOf(target), col, length);
            break;
        }

        case KEY_PGDN: {
            var pageDn = cols * visibleRows;
            var targetDn = Math.min(length - 1, idx + pageDn);
            idx = clampToRowCol(rowOf(targetDn), col, length);
            break;
        }

        case KEY_HOME:
            idx = 0;
            break;

        case KEY_END:
            idx = length - 1;
            break;

        case KEY_ENTER:
            if (typeof onEnter === 'function') onEnter();
            return;

        case '\x1B':    // ESC
        case '\b':      // BS
        case '\x08':    // BS (alternate)
        case '\x7F':    // DEL
            if (typeof onBack === 'function') onBack();
            else this.exit();
            return;

        default:
            return; // unhandled key
    }

    this.selectedIndex = idx;

    // Adjust scroll with a minimal grid object if renderer layout missing
    var adjustGrid = layout || { cols: cols, visibleRows: visibleRows };
    if (typeof this._adjustGridScroll === 'function') {
        this._adjustGridScroll(adjustGrid, length);
    }
    this.draw();
};

FileArea.prototype._adjustGridScroll = function (grid, length) {
    if (!grid) return;
    var cols = Math.max(1, grid.cols), vis = Math.max(1, grid.visibleRows);
    var rows = Math.max(1, Math.ceil(length / cols));
    var curRow = Math.floor(this.selectedIndex / cols);
    var maxRowOffset = Math.max(0, rows - vis);
    if (curRow < this.scrollOffset) this.scrollOffset = curRow;
    if (curRow >= this.scrollOffset + vis) this.scrollOffset = Math.max(0, curRow - vis + 1);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
};

FileArea.prototype._handleFilesNav = function (key) {
    var items = this.files || [];
    var h = this.listFrame ? Math.max(1, this.listFrame.height) : 1;

    switch (key) {
        // move
        case KEY_UP: case "\u001e": case "\x1B[A":
            if (!items.length) break;
            if (this.selectedIndex > 0) this.selectedIndex--;
            if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
            this.draw(); break;
        case KEY_DOWN: case "\u000a": case "\x1B[B":
            if (!items.length) break;
            if (this.selectedIndex < items.length - 1) this.selectedIndex++;
            if (this.selectedIndex >= this.scrollOffset + h) this.scrollOffset = Math.max(0, this.selectedIndex - h + 1);
            this.draw(); break;
        case KEY_PGUP:
            this.selectedIndex = Math.max(0, this.selectedIndex - h);
            this.scrollOffset = Math.max(0, this.scrollOffset - h);
            this.draw(); break;
        case KEY_PGDN:
            this.selectedIndex = Math.min(Math.max(0, items.length - 1), this.selectedIndex + h);
            if (this.selectedIndex >= this.scrollOffset + h) this.scrollOffset = Math.min(Math.max(0, items.length - h), this.scrollOffset + h);
            this.draw(); break;
        case KEY_HOME:
            this.selectedIndex = 0; this.scrollOffset = 0; this.draw(); break;
        case KEY_END:
            this.selectedIndex = Math.max(0, items.length - 1);
            this.scrollOffset = Math.max(0, items.length - h);
            this.draw(); break;

        // actions
        case KEY_ENTER:
            this._openFileInfo(); break;
        case 'T': case 't': case ' ':
            this._toggleTag(); break;
        case 'D': case 'd':
            this._download(); break;
        case 'U': case 'u':
            this._upload(); break;

        // back/exit
        case '\x1B': case '\b': case '\x08': case '\x7F':
            this._backFromFiles(); break;
    }
};

// ---------- Activations / actions ----------

FileArea.prototype._activateLib = function () {
    // index 0 is Exit tile
    if (this.selectedIndex === 0) { this.exit(); return; }
    var idx = this.selectedIndex - 1;
    if (idx < 0 || idx >= this.libs.length) return;
    this._setStatus('Loading directories...');
    this._loadDirs(this.libs[idx].index);
    this.draw();
};

FileArea.prototype._activateDir = function () {
    // index 0 is Back tile
    if (this.selectedIndex === 0) { this._backFromDirs(); return; }
    var idx = this.selectedIndex - 1;
    if (idx < 0 || idx >= this.dirs.length) return;
    this._setStatus('Loading files...');
    this._loadFiles(this.dirs[idx].code);
    this.draw();
};

FileArea.prototype._openFileInfo = function () {
    var items = this.files || [];
    if (!items.length || this.selectedIndex < 0 || this.selectedIndex >= items.length) {
        this._setStatus('No file selected.');
        return;
    }
    var f = items[this.selectedIndex];
    this._setStatus('Name: ' + f.name + '  Size: ' + f.sizeStr + '  Date: ' + f.dateStr);
};

FileArea.prototype._toggleTag = function () {
    var items = this.files || [];
    if (!items.length || this.selectedIndex < 0 || this.selectedIndex >= items.length) return;
    var f = items[this.selectedIndex];
    if (this.tagged[f.name]) delete this.tagged[f.name];
    else this.tagged[f.name] = true;
    var count = 0; for (var k in this.tagged) if (this.tagged.hasOwnProperty(k)) count++;
    this._setStatus(count ? (count + ' file' + (count > 1 ? 's' : '') + ' tagged') : '');
    this.draw();
};

FileArea.prototype._download = function () {
    if (this.state !== 'files' || !this.dirCode) { this._setStatus('Open a directory first.'); return; }
    var items = this.files || [];
    if (!items.length) { this._setStatus('No files to download.'); return; }
    var chosen = [];
    for (var name in this.tagged) if (this.tagged[name]) chosen.push(name);
    if (!chosen.length && this.selectedIndex >= 0 && this.selectedIndex < items.length) chosen.push(items[this.selectedIndex].name);
    if (!chosen.length) { this._setStatus('No file selected.'); return; }

    var dirObj = file_area.dir[this.dirCode];
    if (!dirObj || !dirObj.path) { this._setStatus('Directory path unavailable.'); return; }
    var base = dirObj.path; if (base.charAt(base.length - 1) !== '/' && base.charAt(base.length - 1) !== '\\') base += '/';

    var failed = [];
    for (var i = 0; i < chosen.length; i++) {
        var full = base + chosen[i];
        try { var ok = bbs.send_file(full); if (ok === false) failed.push(chosen[i]); }
        catch (e) { failed.push(chosen[i]); }
    }
    if (failed.length) this._setStatus('Failed: ' + failed.join(', '));
    else { this._setStatus('Download complete' + (chosen.length > 1 ? (' (' + chosen.length + ')') : '')); this.tagged = {}; }
    this.draw();
};

FileArea.prototype._upload = function () {
    if (this.state !== 'files' || !this.dirCode) { this._setStatus('Open a directory first.'); return; }
    var ok = false;
    try { ok = !!bbs.upload_file(this.dirCode); } catch (e) { ok = false; }
    this._loadFiles(this.dirCode);
    this._setStatus(ok ? 'Upload complete' : 'Upload cancelled');
    this.draw();
};

// ---------- Back navigation ----------

FileArea.prototype._backFromFiles = function () {
    this._loadDirs(this.libIndex);
    this.draw();
};
FileArea.prototype._backFromDirs = function () {
    this._loadLibraries();
    this.draw();
};

// ---------- Registration ----------

registerModuleExports({ FileArea: FileArea });