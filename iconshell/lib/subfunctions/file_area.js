// File Area Browser Subprogram (grid-enhanced)
// Browses Libraries -> Directories -> Files using parentFrame supplied by IconShell.
// Keys:
//  Arrow keys : Move selection
//  ENTER      : Drill down (libs -> dirs -> files) / view info in files
//  G          : Go back (files->dirs->libs)
//  I          : File info popup (in files list)
//  Q / ESC    : Exit subprogram
//  T / Space  : Tag/untag file (mark with *)
//  D          : Download tagged/current file (implemented via external runner)
//  U          : Upload into current directory

load('iconshell/lib/subfunctions/subprogram.js');
load('iconshell/lib/shell/icon.js');
load('frame.js');
load('file_size.js');
load('sbbsdefs.js');

function FileArea(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'file-area', parentFrame: opts.parentFrame, shell: opts.shell });
    this.state = 'LIBS'; // LIBS | DIRS | FILES
    this.libs = [];
    this.dirs = [];
    this.files = [];
    this.libIndex = -1;
    this.dirCode = null;
    this.sel = 0;
    this.top = 0;
    this.tagged = {};
    this.header = null;
    this.list = null;
    this.footer = null;
    this.popup = null;
    this.popupContent = null;
    this.gridCells = [];
    this.gridMeta = null;
    this.statusMessage = '';
    this.statusTs = 0;
    this.iconMap = opts.iconMap || (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS ? ICSH_SETTINGS.fileAreaIcons : null);
    this._iconExistenceCache = {};
    this.hotspotMap = {};
}
extend(FileArea, Subprogram);

FileArea.prototype.enter = function (done) {
    bbs.sys_status |= SS_MOFF; // silence output
    this.loadLibraries();
    Subprogram.prototype.enter.call(this, done);
};

FileArea.prototype.setParentFrame = function (frame) {
    this.parentFrame = frame; return this;
};

FileArea.prototype.loadLibraries = function () {
    var libs = [];
    for (var i = 0; i < file_area.lib_list.length; i++) {
        var lib = file_area.lib_list[i];
        if (lib && typeof lib.index !== 'number') lib.index = i;
        libs.push(lib);
    }
    this.libs = libs;
    this.state = 'LIBS';
    this.libIndex = -1;
    this.dirCode = null;
    this.tagged = {};
    this._clearGridHotspots();
    this._resetSelection();
};

FileArea.prototype.loadDirectories = function (libIdx) {
    this.libIndex = libIdx;
    var lib = file_area.lib_list[libIdx];
    var dirs = [];
    if (lib && lib.dir_list) {
        for (var i = 0; i < lib.dir_list.length; i++) {
            var dir = lib.dir_list[i];
            if (dir) {
                if (typeof dir.lib_index !== 'number') dir.lib_index = libIdx;
                if (typeof dir.index !== 'number') dir.index = i;
            }
            dirs.push(dir);
        }
    }
    this.dirs = dirs;
    this.state = 'DIRS';
    this.dirCode = null;
    this.tagged = {};
    this._clearGridHotspots();
    this._resetSelection();
};

FileArea.prototype.loadFiles = function (dirCode) {
    this.dirCode = dirCode;
    var list = [];
    var fb = new FileBase(dirCode);
    try {
        if (fb.open()) {
            list = fb.get_list('', FileBase.DETAIL.NORM) || [];
        }
    } catch (err) {
        log('FileArea loadFiles error for ' + dirCode + ': ' + err);
    } finally {
        try { fb.close(); } catch (_) { }
    }
    for (var i = 0; i < list.length; i++) {
        var f = list[i];
        f.sizeStr = file_size_str(f.size);
        f.dateStr = system.datestr(f.added);
    }
    this.files = list;
    this.state = 'FILES';
    this.tagged = {};
    this._clearGridHotspots();
    this._resetSelection();
};

FileArea.prototype._resetSelection = function () {
    this.sel = 0;
    this.top = 0;
};

FileArea.prototype.ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.header) {
        this.header = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width, 1, ICSH_ATTR('FILE_HEADER'), this.parentFrame); this.header.open();
    }
    if (!this.footer) {
        this.footer = new Frame(this.parentFrame.x, this.parentFrame.y + this.parentFrame.height - 1, this.parentFrame.width, 1, ICSH_ATTR('FILE_FOOTER'), this.parentFrame); this.footer.open();
    }
    if (!this.list) {
        var h = this.parentFrame.height - 2;
        if (h < 1) h = 1;
        this.list = new Frame(this.parentFrame.x, this.parentFrame.y + 1, this.parentFrame.width, h, ICSH_ATTR('FILE_LIST'), this.parentFrame); this.list.open();
        this.setBackgroundFrame(this.list);
    }
};

FileArea.prototype.currentItems = function () {
    if (this.state === 'LIBS') return this._libsWithExit();
    if (this.state === 'DIRS') return this._dirsWithBack();
    if (this.state === 'FILES') return this.files;
    return [];
};

FileArea.prototype._libsWithExit = function () {
    var list = this.libs ? this.libs.slice() : [];
    list.unshift({ __action: 'exit', label: 'Exit', iconFile: 'exit' });
    return list;
};

FileArea.prototype._dirsWithBack = function () {
    var list = this.dirs ? this.dirs.slice() : [];
    list.unshift({ __action: 'back', label: 'Back', iconFile: 'back' });
    return list;
};

FileArea.prototype._selectedLibrary = function () {
    if (this.state !== 'LIBS') return null;
    var idx = this.sel - 1; // account for exit tile
    if (idx < 0 || !this.libs || idx >= this.libs.length) return null;
    return this.libs[idx];
};

FileArea.prototype._selectedDirectory = function () {
    if (this.state !== 'DIRS') return null;
    var idx = this.sel - 1; // account for back tile
    if (idx < 0 || !this.dirs || idx >= this.dirs.length) return null;
    return this.dirs[idx];
};

FileArea.prototype.setIconMap = function (map) {
    this.iconMap = map || null;
    this._iconExistenceCache = {};
};

FileArea.prototype._normalizeSelection = function () {
    var items = this.currentItems();
    if (!items.length) { this.sel = 0; this.top = 0; return; }
    if (this.sel >= items.length) this.sel = items.length - 1;
    if (this.sel < 0) this.sel = 0;
};

FileArea.prototype.draw = function () {
    this.ensureFrames();
    if (!this.list) return;
    this._normalizeSelection();
    this._drawHeader();
    this._drawFooter();
    if (this.state === 'FILES') {
        this._clearGridCells();
        this._clearGridHotspots();
        this._drawFileList();
    } else {
        this._drawGrid();
    }
    if (this.popup) this.drawPopup();
    this.parentFrame.cycle();
};

FileArea.prototype._drawHeader = function () {
    if (!this.header) return;
    this.header.clear();
    var text = '';
    if (this.state === 'LIBS') {
        var currentLib = this._selectedLibrary();
        if (currentLib) {
            var desc = currentLib.description || currentLib.name || 'Library';
            var count = currentLib.dir_list ? currentLib.dir_list.length : 0;
            text = desc;
            if (count) text += ' | ' + count + ' dirs';
        } else {
            text = 'Libraries';
        }
    } else if (this.state === 'DIRS') {
        var lib = (this.libIndex > -1 && file_area.lib_list[this.libIndex]) ? file_area.lib_list[this.libIndex] : null;
        var libName = lib ? (lib.name || lib.description || '') : '';
        var currentDir = this._selectedDirectory();
        var dirLabel = currentDir ? (currentDir.description || currentDir.name || currentDir.code || '') : '';
        var dirObj = currentDir && currentDir.code ? file_area.dir[currentDir.code] : null;
        var segs = [];
        if (libName) segs.push(libName);
        if (dirLabel) segs.push(dirLabel);
        text = segs.join(' > ');
        if (dirObj && dirObj.path) text += ' | ' + dirObj.path;
    } else if (this.state === 'FILES') {
        var activeLib = (this.libIndex > -1 && file_area.lib_list[this.libIndex]) ? file_area.lib_list[this.libIndex] : null;
        var dirInfo = this.dirCode ? file_area.dir[this.dirCode] : null;
        var parts = [];
        if (activeLib) {
            parts.push(activeLib.name || activeLib.description || 'Library');
        }
        if (dirInfo) {
            parts.push(dirInfo.description || dirInfo.name || this.dirCode);
        } else if (this.dirCode) {
            parts.push(this.dirCode);
        }
        text = parts.join(' > ');
        if (dirInfo && dirInfo.path) text += ' | ' + dirInfo.path;
    }
    if (!text) text = 'File Area';
    if (text.length > this.header.width) text = text.substr(0, this.header.width);
    this.header.putmsg(text);
};

FileArea.prototype._drawFooter = function () {
    if (!this.footer) return;
    this.footer.clear();
    var help;
    if (this.state === 'FILES') help = 'ENTER=info  G=back  T=tag  D=download  U=upload  Q=quit';
    else help = 'ENTER=open  G=back  Arrow keys navigate  Q=quit';
    var msg = help;
    if (this.statusMessage) {
        msg += ' | ' + this.statusMessage;
        if (Date.now() - this.statusTs > 7000) this.statusMessage = '';
    }
    this.footer.putmsg(msg.substr(0, this.footer.width));
};

FileArea.prototype._drawGrid = function () {
    var items = this.currentItems();
    this._clearGridCells();
    this._clearGridHotspots();
    this.list.clear();
    this.gridMeta = this._computeGridMeta();
    var meta = this.gridMeta;
    if (!meta) return;
    var capacity = meta.cols * meta.rowsVisible;
    if (items.length === 0) {
        this.list.gotoxy(1, meta.originY);
        this.list.putmsg('[No entries]');
        return;
    }
    this._ensureSelectionVisible();
    var start = Math.floor(this.top / meta.cols) * meta.cols;
    var maxRow = Math.max(0, Math.ceil(items.length / meta.cols) - meta.rowsVisible);
    var maxStart = maxRow * meta.cols;
    if (start > maxStart) start = maxStart;
    if (start < 0) start = 0;
    this.top = start;
    var count = Math.min(capacity, items.length - start);
    for (var i = 0; i < count; i++) {
        var absIndex = start + i;
        var cell = this._renderGridItem(i, items[absIndex], absIndex);
        if (cell) this.gridCells.push(cell);
    }
    this._paintGridSelection();
    this._registerGridHotspots();
};

FileArea.prototype._computeGridMeta = function () {
    if (!this.list) return null;
    var iconW = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_W : 12;
    var iconH = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_H : 6;
    var labelH = 1;
    var cellW = iconW + 4;
    var cellH = iconH + labelH + 1;
    var originX = 2;
    var originY = 2;
    var usableWidth = Math.max(1, this.list.width - (originX - 1));
    var cols = Math.max(1, Math.floor(usableWidth / cellW));
    var usableHeight = Math.max(1, this.list.height - (originY - 1));
    var rowsVisible = Math.max(1, Math.floor(usableHeight / cellH));
    var contentHeight = originY + rowsVisible * cellH - 1;
    if (contentHeight > this.list.height) contentHeight = this.list.height;
    return {
        iconW: iconW,
        iconH: iconH,
        labelH: labelH,
        cellW: cellW,
        cellH: cellH,
        cols: cols,
        rowsVisible: rowsVisible,
        originX: originX,
        originY: originY,
        contentHeight: contentHeight
    };
};

FileArea.prototype._clearGridCells = function () {
    for (var i = 0; i < this.gridCells.length; i++) {
        var cell = this.gridCells[i];
        try { if (cell.icon) cell.icon.close(); } catch (e) { }
        try { if (cell.label) cell.label.close(); } catch (e) { }
    }
    this.gridCells = [];
};

FileArea.prototype._gridItemData = function (item) {
    if (!item) return { label: '', iconFile: null };
    if (item.__action === 'exit' || item.__action === 'back') {
        var lbl = item.label || (item.__action === 'exit' ? 'Exit' : 'Back');
        var icon = item.iconFile || (item.__action === 'exit' ? 'exit' : 'back');
        return { label: lbl, iconFile: icon };
    }
    if (this.state === 'LIBS') {
        return {
            label: item.name || item.description || 'Library',
            iconFile: this._resolveLibraryIcon(item)
        };
    }
    if (this.state === 'DIRS') {
        var label = item.name || item.code || 'Directory';
        return {
            label: label,
            iconFile: this._resolveDirectoryIcon(item)
        };
    }
    return { label: item.name || '' };
};

FileArea.prototype._renderGridItem = function (relIndex, item, absIndex) {
    var meta = this.gridMeta;
    if (!meta) return null;
    var col = relIndex % meta.cols;
    var row = Math.floor(relIndex / meta.cols);
    var x = meta.originX + col * meta.cellW;
    var y = meta.originY + row * meta.cellH;
    if (y + meta.iconH - 1 > meta.contentHeight) return null;
    var iconFrame = new Frame(x, y, meta.iconW, meta.iconH, ICSH_ATTR('FILE_LIST'), this.list);
    iconFrame.transparent = true;
    var labelFrame = new Frame(x, y + meta.iconH, meta.iconW, meta.labelH, ICSH_ATTR('FRAME_STANDARD'), this.list);
    labelFrame.transparent = false;
    var data = this._gridItemData(item);
    var iconObj = new Icon(iconFrame, labelFrame, data);
    iconObj.render();
    return { icon: iconFrame, label: labelFrame, iconObj: iconObj, labelText: data.label || '', absIndex: absIndex, item: item };
};

FileArea.prototype._paintGridSelection = function () {
    if (!this.gridCells.length) return;
    for (var i = 0; i < this.gridCells.length; i++) {
        var cell = this.gridCells[i];
        var selected = (cell.absIndex === this.sel);
        this._applyGridCellHighlight(cell, selected);
    }
};

FileArea.prototype._clearGridHotspots = function () {
    this.hotspotMap = {};
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
};

FileArea.prototype._registerGridHotspots = function () {
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    if (typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
    this.hotspotMap = {};
    var keyOrder = '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var reserved = { 'G': true };
    var keyIdx = 0;
    for (var i = 0; i < this.gridCells.length && keyIdx < keyOrder.length; i++) {
        var cell = this.gridCells[i];
        if (!cell || !cell.icon || !cell.item) continue;
        var cmd = null;
        while (keyIdx < keyOrder.length) {
            var candidate = keyOrder.charAt(keyIdx++);
            if (!reserved[candidate]) { cmd = candidate; break; }
        }
        if (!cmd) break;
        this.hotspotMap[cmd] = cell.absIndex;
        var minX = cell.icon.x;
        var maxX = minX + cell.icon.width - 1;
        var startY = cell.icon.y;
        var endY = cell.icon.y + cell.icon.height - 1;
        if (cell.label) {
            var labelBottom = cell.label.y + cell.label.height - 1;
            if (labelBottom > endY) endY = labelBottom;
        }
        for (var y = startY; y <= endY; y++) {
            try { console.add_hotspot(cmd, false, minX, maxX, y); } catch (e) { }
        }
    }
};

FileArea.prototype._applyGridCellHighlight = function (cell, selected) {
    if (!cell || !cell.label) return;
    var label = cell.label;
    var width = label.width || 0;
    label.attr = selected ? ICSH_ATTR('FILE_LIST_ACTIVE') : ICSH_ATTR('FILE_LIST_INACTIVE');
    label.gotoxy(1, 1);
    var blank = new Array(width + 1).join(' ');
    label.putmsg(blank);
    var text = cell.labelText || '';
    if (text.length > width) text = text.substr(0, width);
    var start = Math.max(0, Math.floor((width - text.length) / 2));
    label.gotoxy(start + 1, 1);
    label.putmsg(text);
};

FileArea.prototype._drawFileList = function () {
    if (!this.list) return;
    this.list.clear();
    var items = this.files;
    var visible = this.list.height;
    if (!items.length) {
        this.list.gotoxy(1, 1);
        this.list.putmsg('[No files in this directory]');
        return;
    }
    this._ensureSelectionVisible();
    var nameWidth = Math.max(18, Math.min(30, this.list.width - 34));
    var sizeWidth = 9;
    var dateWidth = 12;
    var descWidth = Math.max(0, this.list.width - (nameWidth + sizeWidth + dateWidth + 5));
    for (var row = 0; row < visible; row++) {
        var idx = this.top + row;
        if (idx >= items.length) break;
        var it = items[idx];
        var tag = this.tagged[it.name] ? '*' : ' ';
        var name = it.name || '';
        if (name.length > nameWidth) name = name.substr(0, nameWidth);
        var sizeStr = (it.sizeStr || '').toString();
        var dateStr = (it.dateStr || '').toString();
        if (sizeStr.length > sizeWidth) sizeStr = sizeStr.substr(0, sizeWidth);
        if (dateStr.length > dateWidth) dateStr = dateStr.substr(0, dateWidth);
        var desc = it.desc || '';
        if (desc.length > descWidth) desc = desc.substr(0, descWidth);
        var line = format('%c %-' + nameWidth + 's %' + sizeWidth + 's %-' + dateWidth + 's %s', tag, name, sizeStr, dateStr, desc);
        if (idx === this.sel) {
            this.list.attr = ICSH_ATTR('FILE_LIST_ACTIVE');
            this.list.gotoxy(1, row + 1); this.list.putmsg(line.substr(0, this.list.width));
            this.list.attr = ICSH_ATTR('FILE_LIST_INACTIVE');
        } else {
            this.list.gotoxy(1, row + 1); this.list.putmsg(line.substr(0, this.list.width));
        }
    }
};

FileArea.prototype._ensureSelectionVisible = function () {
    var items = this.currentItems();
    if (this.state === 'FILES') {
        var visible = this.list ? this.list.height : 1;
        if (this.sel < this.top) this.top = this.sel;
        if (this.sel >= this.top + visible) this.top = this.sel - visible + 1;
        if (this.top < 0) this.top = 0;
        var maxTop = Math.max(0, items.length - visible);
        if (this.top > maxTop) this.top = maxTop;
        return;
    }
    if (!this.gridMeta) this.gridMeta = this._computeGridMeta();
    var meta = this.gridMeta;
    if (!meta) return;
    var cols = meta.cols;
    var rowsVisible = meta.rowsVisible;
    var selRow = Math.floor(this.sel / cols);
    var firstRow = Math.floor(this.top / cols);
    if (selRow < firstRow) this.top = selRow * cols;
    else if (selRow >= firstRow + rowsVisible) this.top = (selRow - rowsVisible + 1) * cols;
    if (this.top < 0) this.top = 0;
    var itemsLen = items.length;
    var maxRow = Math.max(0, Math.ceil(itemsLen / cols) - rowsVisible);
    var maxTop = maxRow * cols;
    if (this.top > maxTop) this.top = maxTop;
};

FileArea.prototype._navigateGrid = function (dx, dy) {
    if (this.state === 'FILES') return;
    if (!this.gridMeta) this.gridMeta = this._computeGridMeta();
    var meta = this.gridMeta;
    if (!meta) return;
    var cols = meta.cols;
    var items = this.currentItems();
    if (!items.length) return;
    var target = this.sel + (dx || 0) + (dy || 0) * cols;
    if (target < 0) target = 0;
    if (target >= items.length) target = items.length - 1;
    var prevTop = this.top;
    this.sel = target;
    this._ensureSelectionVisible();
    if (this.top !== prevTop) {
        this.draw();
    } else {
        this._paintGridSelection();
        this._drawHeader();
        if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
            try { this.parentFrame.cycle(); } catch (e) { }
        }
    }
};

FileArea.prototype.handleKey = function (k) {
    if (!k) return;
    if (this.popup) { this.closePopup(); this.draw(); return; }
    switch (k) {
        case '\x1B': case 'Q': case 'q': this.exit(); return;
    }
    if (this.state !== 'FILES' && this.hotspotMap) {
        var key = (typeof k === 'string' && k.length === 1) ? k.toUpperCase() : null;
        if (key && key !== 'G' && this.hotspotMap.hasOwnProperty(key)) {
            this.sel = this.hotspotMap[key];
            this._ensureSelectionVisible();
            this.openSelection();
            return;
        }
    }
    if (this.state !== 'FILES') {
        switch (k) {
            case KEY_UP: this._navigateGrid(0, -1); return;
            case KEY_DOWN: this._navigateGrid(0, 1); return;
            case KEY_LEFT: this._navigateGrid(-1, 0); return;
            case KEY_RIGHT: this._navigateGrid(1, 0); return;
            case KEY_PGUP: this._navigateGrid(0, -(this.gridMeta ? this.gridMeta.rowsVisible : 1)); return;
            case KEY_PGDN: this._navigateGrid(0, (this.gridMeta ? this.gridMeta.rowsVisible : 1)); return;
        }
    }
    switch (k) {
        case KEY_UP: this.sel--; this.draw(); return;
        case KEY_DOWN: this.sel++; this.draw(); return;
        case KEY_PGUP: this.sel -= (this.list ? this.list.height : 5); this.draw(); return;
        case KEY_PGDN: this.sel += (this.list ? this.list.height : 5); this.draw(); return;
        case 'G': case 'g': this.goBack(); return;
        case '\r': case '\n': this.openSelection(); return;
        case 'I': case 'i': if (this.state === 'FILES') this.showInfo(); return;
        case 'T': case 't': case ' ': if (this.state === 'FILES') this.toggleTag(); return;
        case 'D': case 'd': if (this.state === 'FILES') this.downloadTagged(); return;
        case 'U': case 'u': if (this.state === 'FILES') this.uploadFiles(); return;
    }
};

FileArea.prototype.openSelection = function () {
    var items = this.currentItems();
    if (!items.length) return;
    var it = items[this.sel];
    if (this.state === 'LIBS') {
        if (it && it.__action === 'exit') {
            this.exit();
            return;
        }
        this.loadDirectories(it.index);
    }
    else if (this.state === 'DIRS') {
        if (it && it.__action === 'back') {
            this.goBack();
            return;
        }
        this.loadFiles(it.code);
    }
    else if (this.state === 'FILES') {
        this.showInfo();
        return;
    }
    this._setStatus('');
    if (this.running !== false) this.draw();
};

FileArea.prototype.goBack = function () {
    if (this.state === 'FILES') { this.loadDirectories(this.libIndex); this.draw(); return; }
    if (this.state === 'DIRS') { this.loadLibraries(); this.draw(); return; }
};

FileArea.prototype.toggleTag = function () {
    var items = this.files; if (!items.length) return;
    var f = items[this.sel];
    if (this.tagged[f.name]) delete this.tagged[f.name]; else this.tagged[f.name] = true;
    var count = 0; for (var k in this.tagged) if (this.tagged.hasOwnProperty(k)) count++;
    this._setStatus(count ? (count + ' file' + (count > 1 ? 's' : '') + ' tagged') : '');
    this.draw();
};

FileArea.prototype.showInfo = function () {
    var items = this.files; if (!items.length) return;
    var f = items[this.sel];
    var w = Math.min(this.parentFrame.width - 6, 60), h = 8;
    var x = this.parentFrame.x + Math.floor((this.parentFrame.width - w) / 2);
    var y = this.parentFrame.y + Math.floor((this.parentFrame.height - h) / 2);
    this.popup = new Frame(x, y, w, h, ICSH_ATTR('FILE_POPUP'), this.parentFrame); this.popup.open();
    this.popup.drawBorder = Frame.prototype.drawBorder;
    this.popupContent = new Frame(x + 1, y + 1, w - 2, h - 2, ICSH_ATTR('FILE_POPUP_CONTENT'), this.parentFrame); this.popupContent.open();
    var lines = [
        'Name: ' + f.name,
        'Size: ' + f.sizeStr,
        'Date: ' + f.dateStr,
        'Desc: ' + (f.desc || '')
    ];
    for (var i = 0; i < lines.length && i < h - 2; i++) { this.popupContent.gotoxy(1, i + 1); this.popupContent.putmsg(lines[i].substr(0, w - 2)); }
    this.popupContent.gotoxy(1, h - 2); this.popupContent.putmsg('[Any key to close]');
    this.parentFrame.cycle();
};

FileArea.prototype.drawPopup = function () { /* already rendered */ };

FileArea.prototype.closePopup = function () {
    try { if (this.popupContent) this.popupContent.close(); } catch (e) { }
    try { if (this.popup) this.popup.close(); } catch (e) { }
    this.popup = null; this.popupContent = null;
};

FileArea.prototype._setStatus = function (msg) {
    this.statusMessage = msg || '';
    this.statusTs = Date.now();
};

FileArea.prototype._sanitizeIconId = function (value) {
    if (value === undefined || value === null) return '';
    var s = String(value).toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, '_');
    s = s.replace(/^_+|_+$/g, '');
    return s;
};

FileArea.prototype._iconAssetExists = function (name) {
    if (!name) return false;
    if (this._iconExistenceCache && this._iconExistenceCache.hasOwnProperty(name)) return this._iconExistenceCache[name];
    var modsDir = (typeof system !== 'undefined' && system && system.mods_dir) ? system.mods_dir : '';
    var exists = false;
    if (modsDir) {
        var base = modsDir + 'iconshell/assets/' + name;
        try {
            exists = file_exists(base + '.bin') || file_exists(base + '.ans');
        } catch (err) { exists = false; }
    }
    this._iconExistenceCache[name] = exists;
    return exists;
};

FileArea.prototype._firstAvailableIcon = function (candidates, fallback) {
    if (!candidates || !candidates.length) return fallback || null;
    for (var i = 0; i < candidates.length; i++) {
        var name = candidates[i];
        if (!name) continue;
        if (this._iconAssetExists(name)) return name;
    }
    for (var j = 0; j < candidates.length; j++) {
        if (candidates[j]) return candidates[j];
    }
    return fallback || null;
};

FileArea.prototype._resolveLibraryIcon = function (lib) {
    var candidates = [];
    var map = this.iconMap || {};
    var code = lib && lib.code ? this._sanitizeIconId(lib.code) : '';
    if (code && map.libraries && map.libraries[code]) candidates.push(map.libraries[code]);
    if (code) candidates.push('filearea_lib_' + code);
    if (lib && typeof lib.index === 'number') candidates.push('filearea_lib_index_' + lib.index);
    if (lib && lib.name) candidates.push('filearea_lib_' + this._sanitizeIconId(lib.name));
    if (map.libraryDefault) candidates.push(map.libraryDefault);
    candidates.push('apps_folder');
    return this._firstAvailableIcon(candidates, 'apps_folder');
};

FileArea.prototype._resolveDirectoryIcon = function (dir) {
    var candidates = [];
    var map = this.iconMap || {};
    var dirCodeRaw = dir && dir.code ? dir.code : '';
    var dirCode = dirCodeRaw ? this._sanitizeIconId(dirCodeRaw) : '';
    var libCode = '';
    if (dir && typeof dir.lib_index === 'number' && file_area.lib_list && file_area.lib_list[dir.lib_index] && file_area.lib_list[dir.lib_index].code) {
        libCode = this._sanitizeIconId(file_area.lib_list[dir.lib_index].code);
    } else if (this.libIndex > -1 && file_area.lib_list && file_area.lib_list[this.libIndex] && file_area.lib_list[this.libIndex].code) {
        libCode = this._sanitizeIconId(file_area.lib_list[this.libIndex].code);
    }
    if (libCode && dirCode && map.libraryDirectories) {
        var comboKey = libCode + '::' + dirCode;
        if (map.libraryDirectories[comboKey]) candidates.push(map.libraryDirectories[comboKey]);
    }
    if (map.directories && dirCode && map.directories[dirCode]) candidates.push(map.directories[dirCode]);
    if (libCode && dirCode) candidates.push('filearea_dir_' + libCode + '_' + dirCode);
    if (dirCode) candidates.push('filearea_dir_' + dirCode);
    if (dir && dir.name) candidates.push('filearea_dir_' + this._sanitizeIconId(dir.name));
    if (dir && typeof dir.index === 'number') candidates.push('filearea_dir_index_' + dir.index);
    if (map.libraryDefaults && libCode && map.libraryDefaults[libCode]) candidates.push(map.libraryDefaults[libCode]);
    if (map.directoryDefault) candidates.push(map.directoryDefault);
    candidates.push('folder');
    return this._firstAvailableIcon(candidates, 'folder');
};

FileArea.prototype.downloadTagged = function () {
    if (this.state !== 'FILES' || !this.dirCode) {
        this._setStatus('Select a directory first');
        this.draw();
        return;
    }
    var items = this.files || [];
    if (!items.length) {
        this._setStatus('No files to download');
        this.draw();
        return;
    }
    var targets = [];
    for (var name in this.tagged) {
        if (!this.tagged.hasOwnProperty(name)) continue;
        for (var i = 0; i < items.length; i++) {
            if (items[i].name === name) { targets.push(items[i]); break; }
        }
    }
    if (!targets.length) targets.push(items[this.sel]);
    if (!targets.length) {
        this._setStatus('No files selected');
        this.draw();
        return;
    }
    var dirObj = file_area.dir[this.dirCode];
    if (!dirObj || !dirObj.path) {
        this._setStatus('Directory path unavailable');
        this.draw();
        return;
    }
    var basePath = dirObj.path;
    if (basePath && basePath.charAt(basePath.length - 1) !== '/' && basePath.charAt(basePath.length - 1) !== '\\') basePath += '/';
    var failed = [];
    this._runExternal(function () {
        for (var i = 0; i < targets.length; i++) {
            var f = targets[i];
            var fullPath = basePath + f.name;
            try {
                var ok = bbs.send_file(fullPath);
                if (ok === false) failed.push(f.name);
            } catch (err) {
                log('FileArea download error for ' + fullPath + ': ' + err);
                failed.push(f.name);
            }
        }
    }, { programId: 'file-area:download' });
    if (failed.length) {
        this._setStatus('Failed: ' + failed.join(', '));
    } else {
        this._setStatus('Download complete' + (targets.length > 1 ? ' (' + targets.length + ')' : ''));
        this.tagged = {};
    }
    this.draw();
};

FileArea.prototype.uploadFiles = function () {
    if (this.state !== 'FILES' || !this.dirCode) {
        this._setStatus('Select a directory first');
        this.draw();
        return;
    }
    var dirCode = this.dirCode;
    var success = false;
    this._runExternal(function () {
        try {
            success = !!bbs.upload_file(dirCode);
        } catch (err) {
            log('FileArea upload error for ' + dirCode + ': ' + err);
            success = false;
        }
    }, { programId: 'file-area:upload' });
    this.loadFiles(dirCode);
    if (success) this._setStatus('Upload complete');
    else this._setStatus('Upload cancelled');
    this.draw();
};

FileArea.prototype._runExternal = function (fn, opts) {
    opts = opts || {};
    if (this.shell && typeof this.shell.runExternal === 'function') {
        this.shell.runExternal(fn, opts);
    } else {
        try { fn(); } catch (e) { log('FileArea external error: ' + e); }
    }
};

FileArea.prototype.cleanup = function () {
    this.closePopup();
    this._clearGridCells();
    this._clearGridHotspots();
    try { if (this.list) this.list.close(); } catch (e) { }
    try { if (this.header) this.header.close(); } catch (e) { }
    try { if (this.footer) this.footer.close(); } catch (e) { }
    this.list = this.header = this.footer = null;
    Subprogram.prototype.cleanup.call(this);
};
