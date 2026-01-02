load('sbbsdefs.js');
load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/shell/icon.js');
if (typeof JSONdb === 'undefined') {
    try { load('json-db.js'); } catch (_) { }
}
if (typeof Modal !== 'function') {
    try { load('future_shell/lib/util/layout/modal.js'); } catch (_) { }
}
if (typeof SubprogramHotspotHelper !== 'function') {
    try { load('future_shell/lib/subprograms/subprogram_hotspots.js'); } catch (_) { }
}
try { load('future_shell/lib/util/debug.js'); } catch (_) { }

var TELNET_DB_SCOPE = 'ICSH_TELNET_GATEWAYS';
var TELNET_DB_FILE = 'telnet_gateways.json';

function TelnetGateway(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'telnet-gateway', parentFrame: opts.parentFrame, shell: opts.shell });
    this.headerFrame = null;
    this.gridFrame = null;
    this.statusFrame = null;
    this.iconCells = [];
    this.displayGateways = [];
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.filterMode = 'all'; // all | dynamic
    this.gateways = [];
    this.filteredGateways = [];
    this.json = null;
    this._gridLayout = null;
    this._sessionDismissals = {};
    this._sessionReviewed = {};
    this._reviewPrompt = null;
    this._deletePrompt = null;
    this._paths = null;
    this._db = null;
    this._activeModal = null;
    this.hotspots = (typeof SubprogramHotspotHelper === 'function') ? new SubprogramHotspotHelper({ shell: this.shell, owner: this.id, layerName: 'telnet-gateway' }) : null;
    this._hotspotMap = {};
    this._hotspotChars = null;
    this.id = 'telnet-gateway';
    this.userId = (typeof user !== 'undefined' && user && typeof user.number === 'number') ? user.number : 0;
    if (typeof this.registerColors === 'function') {
        this.registerColors({
            HEADER: { BG: BG_BLUE, FG: WHITE },
            STATUS: { BG: BG_BLACK, FG: LIGHTGRAY },
            ICON_BORDER_ACTIVE: { BG: BG_CYAN, FG: WHITE },
            ICON_BORDER_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY },
            TEXT_BOLD: { FG: WHITE },
            LABEL_ACTIVE: { BG: BG_CYAN, FG: BLACK },
            LABEL_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY }
        });
    }
}
extend(TelnetGateway, Subprogram);

TelnetGateway.prototype.enter = function (done) {
    this._loadGateways();
    Subprogram.prototype.enter.call(this, done);
};

TelnetGateway.prototype.exit = function () {
    this._destroyIconCells();
    this._closeActiveModal();
    if (this.hotspots && typeof this.hotspots.dispose === 'function') {
        try { this.hotspots.dispose(); } catch (_) { }
    }
    Subprogram.prototype.exit.call(this);
};

TelnetGateway.prototype._cleanup = function () {
    this._destroyIconCells();
    this._closeActiveModal();
    if (this.hotspots && typeof this.hotspots.dispose === 'function') {
        try { this.hotspots.dispose(); } catch (_) { }
    }
    try { if (this.headerFrame) this.headerFrame.close(); } catch (_) { }
    try { if (this.gridFrame) this.gridFrame.close(); } catch (_) { }
    try { if (this.statusFrame) this.statusFrame.close(); } catch (_) { }
    this.headerFrame = null;
    this.gridFrame = null;
    this.statusFrame = null;
};

TelnetGateway.prototype._ensureDir = function (path) {
    if (!path) return;
    if (file_isdir(path)) return;
    try { mkdir(path); } catch (_) { }
};

TelnetGateway.prototype._resolvePaths = function () {
    if (this._paths) return this._paths;
    var base = null;
    try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) { }
    if (!base && typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (!base) base = '.';
    if (base.slice(-1) !== '/' && base.slice(-1) !== '\\') base += '/';
    var shellDir = base + 'future_shell/';
    var dataDir = shellDir + 'data/';
    var gatewayDir = dataDir + 'gateways/';
    this._ensureDir(shellDir);
    this._ensureDir(dataDir);
    this._ensureDir(gatewayDir);
    this._paths = { shellDir: shellDir, dataDir: dataDir, gatewayDir: gatewayDir, dbFile: gatewayDir + TELNET_DB_FILE };
    return this._paths;
};

TelnetGateway.prototype._getDb = function () {
    if (this._db !== null) return this._db;
    var paths = this._resolvePaths();
    if (typeof JSONdb !== 'function' || !paths || !paths.dbFile) {
        this._db = null;
        return null;
    }
    try {
        this._db = new JSONdb(paths.dbFile, TELNET_DB_SCOPE);
        if (this._db && this._db.settings) this._db.settings.KEEP_READABLE = true;
    } catch (e) {
        try { dbug('telnet_gateway: JSONdb init failed ' + e); } catch (_) { }
        this._db = null;
    }
    return this._db;
};

TelnetGateway.prototype._modalParent = function () {
    return this.parentFrame || this.gridFrame || this.headerFrame || null;
};

TelnetGateway.prototype._closeActiveModal = function () {
    if (this._activeModal && typeof this._activeModal.close === 'function') {
        try { this._activeModal.close(); } catch (_) { }
    }
    this._activeModal = null;
};

TelnetGateway.prototype._dbRoot = function () {
    var db = this._getDb();
    if (!db) return null;
    if (!db.masterData || typeof db.masterData !== 'object') db.masterData = { data: {} };
    if (!db.masterData.data || typeof db.masterData.data !== 'object') db.masterData.data = {};
    if (!Array.isArray(db.masterData.data.gateways)) db.masterData.data.gateways = [];
    return db.masterData.data;
};

TelnetGateway.prototype._showError = function (message) {
    var parent = this._modalParent();
    if (typeof Modal !== 'function' || !parent) {
        this._renderStatus(message);
        return;
    }
    this._closeActiveModal();
    var self = this;
    this._activeModal = new Modal({
        parentFrame: parent,
        type: 'alert',
        title: 'Telnet Gateway',
        message: message,
        okLabel: 'Dismiss',
        captureKeys: true,
        onSubmit: function () {},
        onClose: function () { self._activeModal = null; self._renderStatus(); }
    });
};

TelnetGateway.prototype._loadGateways = function () {
    var list = [];
    var db = this._getDb();
    if (db) {
        try { db.load(); } catch (_) { }
        var root = this._dbRoot();
        if (root && Array.isArray(root.gateways)) list = root.gateways;
    }
    if (!list || !Array.isArray(list) || list.length === 0) {
        list = this._seedDefaults();
        this._saveGateways(list);
    }
    this.gateways = list;
    this._applyFilter(true);
};

TelnetGateway.prototype._saveGateways = function (data) {
    this.gateways = data || this.gateways;
    var db = this._getDb();
    if (!db) return;
    var root = this._dbRoot();
    if (!root) return;
    root.gateways = this.gateways;
    try { db.save(); } catch (e) { try { dbug('telnet gateway write failed: ' + e, 'telnet-gateway'); } catch (_) { } }
};

TelnetGateway.prototype._seedDefaults = function () {
    return [];
};

TelnetGateway.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.headerFrame) {
        this.headerFrame = new Frame(this.parentFrame.x, this.parentFrame.y, this.parentFrame.width, 1, this.paletteAttr('HEADER'), this.parentFrame);
        this.headerFrame.open();
        this.registerFrame(this.headerFrame);
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(this.parentFrame.x, this.parentFrame.y + this.parentFrame.height - 1, this.parentFrame.width, 1, this.paletteAttr('STATUS'), this.parentFrame);
        this.statusFrame.open();
        this.registerFrame(this.statusFrame);
    }
    if (!this.gridFrame) {
        var h = Math.max(1, this.parentFrame.height - 2);
        var gridAttr = (typeof ICSH_ATTR === 'function') ? ICSH_ATTR('FRAME_STANDARD') : (BG_BLACK | LIGHTGRAY);
        this.gridFrame = new Frame(this.parentFrame.x, this.parentFrame.y + 1, this.parentFrame.width, h, gridAttr, this.parentFrame);
        this.gridFrame.open();
        this.gridFrame.word_wrap = false;
        this.registerFrame(this.gridFrame);
    }
};

TelnetGateway.prototype.draw = function () {
    this._ensureFrames();
    this._renderHeader();
    this._renderGrid();
    this._renderStatus();
    this.parentFrame && this.parentFrame.cycle();
};

TelnetGateway.prototype._renderHeader = function () {
    if (!this.headerFrame) return;
    try { this.headerFrame.clear(this.paletteAttr('HEADER')); } catch (_) { }
    this.headerFrame.gotoxy(1, 1);
    var title = 'Telnet Gateways';
    var hint = 'Enter=connect  A=add  F=filter  R=review  ESC=exit  Back=tile';
    var spacer = this.headerFrame.width - (title.length + hint.length + 3);
    if (spacer < 1) spacer = 1;
    this.headerFrame.putmsg(this.colorize('TEXT_BOLD', title) + repeatChars(' ', spacer) + hint);
    this.headerFrame.cycle();
};

TelnetGateway.prototype._renderStatus = function (msg) {
    if (!this.statusFrame) return;
    try { this.statusFrame.clear(this.paletteAttr('STATUS')); } catch (_) { }
    var status = msg || '';
    var current = (this.displayGateways && this.displayGateways.length) ? this.displayGateways[this.selectedIndex] : null;
    if (!status) {
        if (current && current._type === 'back') status = 'Back';
        else if (current) {
            var score = current.bbs_score ? current.bbs_score.toFixed(1) : '-';
            var logons = current.logons || 0;
            var port = current.port || 23;
            status = current.name + ' (' + current.id + ') ' + current.telnet_address + ':' + port + '  score: ' + score + '  logons: ' + logons;
            if (current._fallbackIcon) status += '  (Add icon named ' + current.id + ')';
        } else {
            status = 'No gateways configured. Press A to add one.';
        }
        if (this.filterMode === 'dynamic') status += '  [filter: dynamic]';
    }
    this.statusFrame.gotoxy(1, 1);
    this.statusFrame.putmsg(status.substr(0, this.statusFrame.width));
    this.statusFrame.cycle();
};

TelnetGateway.prototype._renderGrid = function () {
    if (!this.gridFrame) return;
    if (!this.displayGateways || !this.displayGateways.length) this.displayGateways = this._buildDisplayList();
    var frame = this.gridFrame;
    var ICON_W = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS.ICON_W) ? ICSH_CONSTANTS.ICON_W : 12;
    var ICON_H = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS.ICON_H) ? ICSH_CONSTANTS.ICON_H : 6;
    var labelH = 1;
    var paddingTop = 2;
    var cellW = ICON_W + 4;
    var cellH = ICON_H + labelH + 2;
    var usableH = Math.max(1, frame.height - paddingTop);
    var cols = Math.max(1, Math.floor(frame.width / cellW));
    var visibleRows = Math.max(1, Math.floor(usableH / cellH));
    var total = this.displayGateways.length;
    var rows = Math.max(1, Math.ceil(total / cols));
    var needRebuild = false;
    if (!this._gridLayout || this._gridLayout.cols !== cols || this._gridLayout.rows !== visibleRows) needRebuild = true;
    if (!needRebuild && this.iconCells.length !== Math.min(total, cols * visibleRows)) needRebuild = true;
    if (!needRebuild && this._gridLayout && this._gridLayout.scrollOffset !== this.scrollOffset) needRebuild = true;
    if (this.selectedIndex >= total) this.selectedIndex = Math.max(0, total - 1);
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    var oldOffset = this.scrollOffset;
    var curRow = Math.floor(this.selectedIndex / cols);
    var maxRowOffset = Math.max(0, rows - visibleRows);
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    if (curRow < this.scrollOffset) this.scrollOffset = curRow;
    if (curRow >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, curRow - visibleRows + 1);
    if (!needRebuild && oldOffset !== this.scrollOffset) needRebuild = true;
    this._gridLayout = { cols: cols, visibleRows: visibleRows, rows: rows, cellW: cellW, cellH: cellH, scrollOffset: this.scrollOffset };
    try { frame.clear((typeof ICSH_ATTR === 'function') ? ICSH_ATTR('FRAME_STANDARD') : (BG_BLACK | LIGHTGRAY)); } catch (_) { }
    if (needRebuild) {
        this._destroyIconCells();
        var startRow = this.scrollOffset;
        var endRow = Math.min(rows, startRow + visibleRows);
        for (var row = startRow; row < endRow; row++) {
            for (var col = 0; col < cols; col++) {
                var i = row * cols + col;
                if (i >= total) break;
                var x = 2 + (col * cellW);
                var y = 1 + paddingTop + ((row - startRow) * cellH);
                if (y + ICON_H + labelH - 1 > frame.height) break;
                var gateway = this.displayGateways[i];
                var item = this._buildIconItem(gateway, i);
                var iconFrame = new Frame(x, y, ICON_W, ICON_H, BG_BLACK | LIGHTGRAY, frame);
                var labelFrame = new Frame(x, y + ICON_H, ICON_W, 1, BG_BLACK | LIGHTGRAY, frame);
                var borderFrame = new Frame(x - 1, y - 1, ICON_W + 2, ICON_H + labelH + 2, BG_BLACK | LIGHTGRAY, frame);
                borderFrame.transparent = true;
                borderFrame.open();
                iconFrame.open();
                labelFrame.open();
                this.registerFrame(iconFrame);
                this.registerFrame(labelFrame);
                this.registerFrame(borderFrame);
                var iconObj = new Icon(iconFrame, labelFrame, item);
                iconObj.render();
                this.iconCells.push({ icon: iconFrame, label: labelFrame, item: item, iconObj: iconObj, borderFrame: borderFrame, index: i });
            }
        }
    } else {
        for (var j = 0; j < this.iconCells.length; j++) {
            var cell = this.iconCells[j];
            cell.item = this._buildIconItem(this.displayGateways[j], j);
            cell.iconObj.data = cell.item;
            cell.iconObj.render();
        }
    }
    this._updateBorders();
    this._updateHotspots();
    frame.cycle();
};

TelnetGateway.prototype._buildIconItem = function (gateway, index) {
    if (gateway && gateway._type === 'back') {
        return { label: 'Back', iconFile: 'back', iconBg: BG_BLACK, iconFg: LIGHTGRAY, _gateway: null };
    }
    var label = gateway && gateway.name ? String(gateway.name) : ('Gateway ' + (index + 1));
    var base = gateway && gateway.id ? gateway.id : ('gateway-' + index);
    var iconInfo = this._iconFor(base);
    var scorePart = gateway && gateway.bbs_score ? (' ' + gateway.bbs_score.toFixed(1) + '★') : '';
    var logonPart = gateway && gateway.logons ? (' [' + gateway.logons + ']') : '';
    var labelText = (iconInfo.fallback && gateway && gateway.id) ? gateway.id : (label + scorePart + logonPart);
    if (gateway) gateway._fallbackIcon = iconInfo.fallback;
    return {
        label: labelText,
        iconFile: iconInfo.icon,
        iconBg: BG_BLACK,
        iconFg: LIGHTGRAY,
        _gateway: gateway,
        _fallbackIcon: iconInfo.fallback
    };
};

TelnetGateway.prototype._iconFor = function (id) {
    var fallback = 'netrunner';
    if (!id) return { icon: fallback, fallback: true };
    var safe = ('' + id).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    try {
        var basePath = system.mods_dir + 'future_shell/assets/';
        var gatewayPath = basePath + 'gateways/';
        var binPath = gatewayPath + safe + '.bin';
        var ansPath = gatewayPath + safe + '.ans';
        if (file_exists(binPath) || file_exists(ansPath)) return { icon: 'gateways/' + safe, fallback: false };
        binPath = basePath + safe + '.bin';
        ansPath = basePath + safe + '.ans';
        if (file_exists(binPath) || file_exists(ansPath)) return { icon: safe, fallback: false };
    } catch (_) { }
    return { icon: fallback, fallback: true };
};

TelnetGateway.prototype._destroyIconCells = function () {
    if (!this.iconCells) this.iconCells = [];
    for (var i = 0; i < this.iconCells.length; i++) {
        var c = this.iconCells[i];
        try { if (c.icon) c.icon.close(); } catch (_) { }
        try { if (c.label) c.label.close(); } catch (_) { }
        try { if (c.borderFrame) c.borderFrame.close(); } catch (_) { }
    }
    this.iconCells = [];
    this._releaseHotspots();
};

TelnetGateway.prototype._updateBorders = function () {
    var activeAttr = this.paletteAttr('ICON_BORDER_ACTIVE', BG_CYAN | WHITE);
    var inactiveAttr = this.paletteAttr('ICON_BORDER_INACTIVE', BG_BLACK | LIGHTGRAY);
    var labelActive = this.paletteAttr('LABEL_ACTIVE', BG_CYAN | BLACK);
    var labelInactive = this.paletteAttr('LABEL_INACTIVE', BG_BLACK | LIGHTGRAY);
    for (var i = 0; i < this.iconCells.length; i++) {
        var cell = this.iconCells[i];
        var isSelected = cell && typeof cell.index === 'number' ? (cell.index === this.selectedIndex) : (i === this.selectedIndex);
        var attr = isSelected ? activeAttr : inactiveAttr;
        if (cell.borderFrame) {
            try { cell.borderFrame.clear(attr); cell.borderFrame.cycle(); } catch (_) { }
        }
        if (cell.label) {
            try {
                cell.label.clear(isSelected ? labelActive : labelInactive);
                var text = cell.item && cell.item.label ? cell.item.label : '';
                if (text.length > cell.label.width) text = text.substr(0, cell.label.width);
                var start = Math.max(0, Math.floor((cell.label.width - text.length) / 2));
                cell.label.gotoxy(start + 1, 1);
                cell.label.putmsg(text);
                cell.label.cycle();
            } catch (_) { }
        }
    }
};

TelnetGateway.prototype._updateHotspots = function () {
    this._releaseHotspots();
    if (!this.hotspots || !this.iconCells || !this.iconCells.length || !this.gridFrame) return;
    var chars = this._ensureHotspotChars();
    var max = Math.min(chars.length, this.iconCells.length);
    var baseX = this.gridFrame.x;
    var baseY = this.gridFrame.y;
    var defs = [];
    for (var i = 0; i < max; i++) {
        var cell = this.iconCells[i];
        if (!cell || !cell.icon) continue;
        var cmd = chars[i];
        var minX = baseX + cell.icon.x - 1;
        var maxX = minX + cell.icon.width - 1;
        var minY = baseY + cell.icon.y - 1;
        var maxY = minY + cell.icon.height - 1;
        if (cell.label) {
            var ly = baseY + cell.label.y - 1;
            var ly2 = ly + cell.label.height - 1;
            if (ly < minY) minY = ly;
            if (ly2 > maxY) maxY = ly2;
        }
        defs.push({
            key: cmd,
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX + 1),
            height: Math.max(1, maxY - minY + 1),
            swallow: false,
            owner: 'telnet-gateway:grid'
        });
        this._hotspotMap[cmd] = cell.index;
    }
    try { this.hotspots.set(defs); } catch (_) { }
};

TelnetGateway.prototype._ensureHotspotChars = function () {
    if (this._hotspotChars && this._hotspotChars.length) return this._hotspotChars;
    var chars = [], used = {};
    function add(s) { for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (!used[ch]) { used[ch] = true; chars.push(ch); } } }
    add('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{};:,./?');
    this._hotspotChars = chars;
    return chars;
};

TelnetGateway.prototype._releaseHotspots = function () {
    if (this.hotspots) this.hotspots.clear();
    this._hotspotMap = {};
};

TelnetGateway.prototype.handleKey = function (k) {
    if (!k) return;
    if (this._activeModal) return;
    if (this._hotspotMap && this._hotspotMap[k] !== undefined) {
        var idx = this._hotspotMap[k];
        if (typeof idx === 'number') {
            this._setSelection(idx);
            this._openSelected();
        }
        return;
    }
    if (k === '\x1B') { this.exit(); return; }
    if (k === KEY_LEFT) { this._moveSelection(-1); return; }
    if (k === KEY_RIGHT) { this._moveSelection(1); return; }
    if (k === KEY_UP) { this._moveSelection(-(this._gridLayout ? this._gridLayout.cols : 1)); return; }
    if (k === KEY_DOWN) { this._moveSelection((this._gridLayout ? this._gridLayout.cols : 1)); return; }
    if (k === KEY_HOME) { this._moveSelection(-this.selectedIndex); return; }
    if (k === KEY_END) { this._moveSelection(this.displayGateways.length); return; }
    if (k === '\r' || k === '\n' || k === KEY_ENTER) { this._openSelected(); return; }
    var lower = (typeof k === 'string') ? k.toLowerCase() : k;
    if (lower === 'a') { this._addGatewayPrompt(); return; }
    if (lower === 'f') { this._toggleFilter(); return; }
    if (lower === 'r') { this._promptReview(this._selectedGateway(), true); return; }
    if (lower === 'd' && this._canDelete()) { this._startDeletePrompt(this._selectedGateway()); return; }
};

TelnetGateway.prototype._moveSelection = function (delta) {
    if (!this.displayGateways.length) return;
    var max = this.displayGateways.length - 1;
    var next = this.selectedIndex + delta;
    if (next < 0) next = 0;
    if (next > max) next = max;
    if (next === this.selectedIndex) return;
    this.selectedIndex = next;
    if (this._ensureSelectionVisible()) { this.draw(); return; }
    this._updateBorders();
    this._renderStatus();
};

TelnetGateway.prototype._setSelection = function (idx) {
    if (!this.displayGateways.length) return;
    if (idx < 0) idx = 0;
    if (idx >= this.displayGateways.length) idx = this.displayGateways.length - 1;
    if (idx === this.selectedIndex) return;
    this.selectedIndex = idx;
    if (this._ensureSelectionVisible()) { this.draw(); return; }
    this._updateBorders();
    this._renderStatus();
};

TelnetGateway.prototype._ensureSelectionVisible = function () {
    if (!this._gridLayout) return false;
    var cols = Math.max(1, this._gridLayout.cols || 1);
    var visibleRows = Math.max(1, this._gridLayout.visibleRows || this._gridLayout.rows || 1);
    var total = this.displayGateways.length;
    var rows = Math.max(1, Math.ceil(total / cols));
    var row = Math.floor(this.selectedIndex / cols);
    var maxRowOffset = Math.max(0, rows - visibleRows);
    var oldOffset = this.scrollOffset;
    if (this.scrollOffset > maxRowOffset) this.scrollOffset = maxRowOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    if (row < this.scrollOffset) this.scrollOffset = row;
    if (row >= this.scrollOffset + visibleRows) this.scrollOffset = Math.max(0, row - visibleRows + 1);
    return this.scrollOffset !== oldOffset;
};

TelnetGateway.prototype._openSelected = function () {
    var gateway = this.displayGateways[this.selectedIndex];
    if (!gateway) return;
    if (gateway._type === 'back') { this.exit(); return; }
    this._launchGateway(gateway);
};

TelnetGateway.prototype._launchGateway = function (gateway) {
    var addr = gateway.telnet_address || '';
    var port = gateway.port || 23;
    var dest = addr.indexOf(':') !== -1 ? addr : addr + ':' + port;
    var ok = false;
    var errMsg = null;
    var runner = function () {
        try { ok = bbs.telnet_gate(dest) !== false; }
        catch (e) { errMsg = e; ok = false; }
    };
    if (this.shell && typeof this.shell.runExternal === 'function') {
        this.shell.runExternal(runner, { programId: 'telnet_gate', label: gateway.name || 'Telnet', icon: 'netrunner', trackUsage: false, broadcast: false });
    } else {
        try { console.clear(); } catch (_) { }
        runner();
    }
    if (!ok && errMsg) {
        try { dbug('telnet gate error: ' + errMsg, 'telnet-gateway'); } catch (_) { }
        this._showError('Telnet connect failed: ' + errMsg);
    }
    if (ok) {
        gateway.logons = (parseInt(gateway.logons, 10) || 0) + 1;
        this._promptReview(gateway, false);
        this._saveGateways(this.gateways);
    } else {
        this._showError('Unable to connect to ' + dest);
    }
    this._applyFilter(true);
    this.draw();
};

TelnetGateway.prototype._promptReview = function (gateway, force) {
    if (!gateway) return;
    if (this._sessionDismissals[gateway.id]) return;
    if (this._hasUserReview(gateway) && !force) return;
    if (gateway.review_blocklist && gateway.review_blocklist.indexOf(this.userId) !== -1 && !force) return;
    var parent = this._modalParent();
    if (typeof Modal !== 'function' || !parent) return;
    var self = this;
    this._closeActiveModal();
    this._activeModal = new Modal({
        parentFrame: parent,
        type: 'prompt',
        title: 'Rate ' + gateway.name,
        message: 'Score 1-5 (blank=skip)',
        okLabel: 'Next',
        cancelLabel: 'Skip',
        defaultValue: '',
        onSubmit: function (value) {
            self._activeModal = null;
            var score = parseInt((value || '').trim(), 10);
            if (isNaN(score) || score < 1 || score > 5) { self._renderStatus('Score 1-5 to review'); return; }
            self._promptReviewText(gateway, score);
        },
        onCancel: function () { self._activeModal = null; self._renderStatus(); },
        onClose: function () { self._activeModal = null; }
    });
};

TelnetGateway.prototype._hasUserReview = function (gateway) {
    if (!gateway || !gateway.bbs_reviews || !gateway.bbs_reviews.length) return false;
    for (var i = 0; i < gateway.bbs_reviews.length; i++) {
        if (gateway.bbs_reviews[i] && gateway.bbs_reviews[i].usernum === this.userId) return true;
    }
    return false;
};

TelnetGateway.prototype._promptReviewText = function (gateway, score) {
    var parent = this._modalParent();
    if (typeof Modal !== 'function' || !parent) return;
    var self = this;
    this._closeActiveModal();
    this._activeModal = new Modal({
        parentFrame: parent,
        type: 'prompt',
        title: 'Review ' + gateway.name,
        message: 'Short review (optional)',
        defaultValue: '',
        okLabel: 'Save',
        cancelLabel: 'Skip',
        onSubmit: function (value) {
            self._activeModal = null;
            self._saveReview(gateway, score, (value || '').trim());
        },
        onCancel: function () { self._activeModal = null; self._saveReview(gateway, score, ''); },
        onClose: function () { self._activeModal = null; }
    });
};

TelnetGateway.prototype._saveReview = function (gateway, score, text) {
    if (!gateway || !score) { this._renderStatus(); return; }
    if (!gateway.bbs_reviews) gateway.bbs_reviews = [];
    gateway.bbs_reviews.push({
        user: (typeof user !== 'undefined' && user && user.alias) ? user.alias : 'anonymous',
        usernum: this.userId,
        score: score,
        text: text || '',
        ts: time()
    });
    this._sessionReviewed[gateway.id + ':' + this.userId] = true;
    gateway.bbs_score = this._calculateScore(gateway.bbs_reviews);
    this._saveGateways(this.gateways);
    this._applyFilter(true);
    this._renderStatus();
};

TelnetGateway.prototype._calculateScore = function (reviews) {
    if (!reviews || !reviews.length) return 0;
    var total = 0;
    var count = 0;
    for (var i = 0; i < reviews.length; i++) {
        var s = parseInt(reviews[i].score, 10);
        if (isNaN(s)) continue;
        total += s;
        count++;
    }
    if (!count) return 0;
    return Math.max(0, Math.min(5, total / count));
};

TelnetGateway.prototype._toggleFilter = function () {
    this.filterMode = this.filterMode === 'all' ? 'dynamic' : 'all';
    this._applyFilter(true);
    this.selectedIndex = 0;
    this.draw();
};

TelnetGateway.prototype._applyFilter = function (preserveSelection) {
    var self = this;
    var keepId = preserveSelection && this._selectedGateway() ? this._selectedGateway().id : null;
    var filtered = this.gateways.filter(function (g) {
        if (!g || self._isHiddenForUser(g)) return false;
        if (self.filterMode !== 'dynamic') return true;
        var logons = parseInt(g.logons, 10) || 0;
        var score = parseFloat(g.bbs_score) || 0;
        var reviews = g.bbs_reviews && g.bbs_reviews.length ? g.bbs_reviews.length : 0;
        return (logons > 0) || (score >= 3) || (reviews > 0);
    });
    this.filteredGateways = filtered;
    this.displayGateways = this._buildDisplayList();
    if (keepId) {
        for (var i = 0; i < this.displayGateways.length; i++) {
            if (this.displayGateways[i].id === keepId) { this.selectedIndex = i; break; }
        }
    }
    if (this.selectedIndex >= this.displayGateways.length) this.selectedIndex = Math.max(0, this.displayGateways.length - 1);
    this._renderGrid();
    this._renderStatus();
};

TelnetGateway.prototype._isHiddenForUser = function (gateway) {
    if (!gateway) return false;
    if (gateway.review_blocklist && gateway.review_blocklist.indexOf(this.userId) !== -1) return true;
    return false;
};

TelnetGateway.prototype._buildDisplayList = function () {
    var list = [{ _type: 'back', id: '__back', name: 'Back', icon: 'back' }];
    for (var i = 0; i < this.filteredGateways.length; i++) list.push(this.filteredGateways[i]);
    return list;
};

TelnetGateway.prototype._selectedGateway = function () {
    if (!this.displayGateways || !this.displayGateways.length) return null;
    var item = this.displayGateways[this.selectedIndex];
    if (!item || item._type === 'back') return null;
    return item;
};

TelnetGateway.prototype._startDeletePrompt = function (gateway) {
    if (!gateway) return;
    var self = this;
    var parent = this._modalParent();
    if (typeof Modal !== 'function' || !parent) return;
    this._closeActiveModal();
    this._activeModal = new Modal({
        parentFrame: parent,
        type: 'confirm',
        title: 'Delete Gateway',
        message: 'Delete ' + gateway.name + '?',
        okLabel: 'Delete',
        cancelLabel: 'Cancel',
        onSubmit: function () {
            self._activeModal = null;
            var gid = gateway.id;
            self.gateways = self.gateways.filter(function (g) { return g && g.id !== gid; });
            self._saveGateways(self.gateways);
            self._applyFilter(false);
            self.selectedIndex = Math.min(self.selectedIndex, Math.max(0, self.displayGateways.length - 1));
            self.draw();
        },
        onCancel: function () { self._activeModal = null; self._renderStatus(); },
        onClose: function () { self._activeModal = null; }
    });
};

TelnetGateway.prototype._canDelete = function () {
    return (typeof user !== 'undefined' && user && (user.is_sysop || user.is_sysop === true));
};

TelnetGateway.prototype._addGatewayPrompt = function () {
    var self = this;
    var parent = this._modalParent();
    if (typeof Modal !== 'function' || !parent) return;
    this._closeActiveModal();
    var fields = [
        { key: 'name', label: 'BBS Name', required: true, def: '' },
        { key: 'telnet_address', label: 'Telnet address', required: true, def: 'bbs.example.com' },
        { key: 'port', label: 'Port', required: false, def: '23' },
        { key: 'description', label: 'Description', required: false, def: '' },
        { key: 'sysop', label: 'Sysop', required: false, def: '' },
        { key: 'location', label: 'Location', required: false, def: '' }
    ];
    var data = {};
    function next(idx) {
        if (idx >= fields.length) {
            var port = parseInt(data.port, 10);
            if (isNaN(port) || port <= 0 || port > 65535) port = 23;
            var id = self._slug(data.name || data.telnet_address || 'gateway');
            if (self.gateways.some(function (g) { return g && g.id === id; })) {
                id = id + '-' + (self.gateways.length + 1);
            }
            var record = {
                id: id,
                name: data.name || id,
                telnet_address: data.telnet_address || '',
                port: port,
                description: data.description || '',
                sysop: data.sysop || '',
                location: data.location || '',
                logons: 0,
                bbs_score: 0,
                bbs_reviews: []
            };
            self.gateways.push(record);
            self._saveGateways(self.gateways);
            self._applyFilter(true);
            self.draw();
            return;
        }
        var field = fields[idx];
        self._closeActiveModal();
        self._activeModal = new Modal({
            parentFrame: parent,
            type: 'prompt',
            title: 'Add Gateway',
            message: field.label,
            defaultValue: data[field.key] || field.def || '',
            okLabel: (idx === fields.length - 1) ? 'Save' : 'Next',
            cancelLabel: 'Cancel',
            onSubmit: function (value) {
                self._activeModal = null;
                var v = (value || '').trim();
                if (!v && field.required) { self._renderStatus('Value required'); next(idx); return; }
                data[field.key] = v;
                next(idx + 1);
            },
            onCancel: function () { self._activeModal = null; self._renderStatus('Add cancelled'); },
            onClose: function () { self._activeModal = null; }
        });
    }
    next(0);
};

TelnetGateway.prototype._slug = function (text) {
    if (!text) return 'gateway';
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'gateway';
};

function repeatChars(ch, count) {
    return (count > 0) ? new Array(count + 1).join(ch) : '';
}

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ TelnetGateway: TelnetGateway });
}
