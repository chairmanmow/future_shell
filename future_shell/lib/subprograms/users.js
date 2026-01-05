load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/subprograms/subprogram_hotspots.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
try { load('future_shell/lib/shell/icon.js'); } catch (_) { }
require('nodedefs.js', 'NODE_INUSE', 'NODE_QUIET');

function Users(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'user-list', parentFrame: opts.parentFrame, shell: opts.shell });
    this.shell = opts.shell || this.shell;
    this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'users', layerName: 'users', priority: 65 });
    // Robust avatar library resolution (paths can shift due to shell/module loader changes)
    this._avatarLib = (function () {
        var tried = [];
        // Reuse shared instance if message boards or other modules already loaded it
        try {
            if (typeof bbs !== 'undefined') {
                if (!bbs.mods) bbs.mods = {};
                if (bbs.mods.avatar_lib) {
                    try { log('Users avatar lib reusing shared instance from bbs.mods.avatar_lib'); } catch (_) { }
                    return bbs.mods.avatar_lib;
                }
            }
        } catch (_re) { }
        function _try(path, cacheKey) {
            tried.push(path);
            try {
                var lib = null;
                if (typeof lazyLoadModule === 'function') lib = lazyLoadModule(path, { cacheKey: cacheKey || path });
                else {
                    // Fallback: direct load() expecting it to return module exports object with read()
                    lib = load(path);
                }
                if (lib && (typeof lib.read === 'function' || typeof lib.get === 'function')) return lib;
                return null;
            } catch (e) {
                try { log('Users avatar lib miss at ' + path + ': ' + e); } catch (_) { }
                return null;
            }
        }
        var baseMods = (typeof system !== 'undefined' && system && system.mods_dir) ? system.mods_dir : '';
        if (baseMods && baseMods.charAt(baseMods.length - 1) !== '/' && baseMods.charAt(baseMods.length - 1) !== '\\') baseMods += '/';
        var candidates = [
            'avatar_lib.js',                           // plain name (exec/load search path like message boards)
            '../exec/load/avatar_lib.js',                // relative up from mods/future_shell/lib/subprograms
            baseMods + 'avatar_lib.js',                  // direct in mods root
            baseMods + 'exec/load/avatar_lib.js',        // mods/exec/load
            baseMods + 'future_shell/exec/load/avatar_lib.js' // namespaced future_shell exec/load
        ];
        for (var i = 0; i < candidates.length; i++) {
            var lib = _try(candidates[i], 'avatar_lib:' + i);
            if (lib) {
                try { log('Users avatar lib loaded from ' + candidates[i]); } catch (_) { }
                // Cache on bbs.mods for other subprograms to reuse & avoid duplicate loads/class mismatch
                try { if (typeof bbs !== 'undefined') { if (!bbs.mods) bbs.mods = {}; if (!bbs.mods.avatar_lib) bbs.mods.avatar_lib = lib; } } catch (_cacheE) { }
                return lib;
            }
        }
        try { log('Users avatar lib unavailable after attempts: ' + tried.join(', ')); } catch (_) { }
        return null;
    })();
    this._avatarsEnabled = !!this._avatarLib;
    this.users = [];
    this.sortMode = null;
    this.whichUsers = 'all' // 'all', 'online'
    this.onlineUsers = 1;
    // Added initialization to avoid NaN page calculations on first draw
    this.page = 0;
    this.selectedIndex = 0;
    // Avatar sizing + cache
    this.showAvatars = true;
    this.avatarWidth = 10;
    this.avatarHeight = 6;
    this._avatarCache = {}; // usernum -> array lines
    this._tileIconFrames = [];
    this._tileAvatarFrames = [];
    this._tileFrameMap = [];
    this._currentTiles = [];
    this.registerColors({
        ICON: { BG: BG_BLACK, FG: LIGHTGRAY },
        LIST: { BG: BG_BLACK, FG: WHITE },
        LABEL_MUTED: { FG: LIGHTMAGENTA },
        TEXT_TIME: { FG: LIGHTCYAN },
        TEXT_RECENT: { FG: LIGHTRED },
        TEXT_TOP: { FG: LIGHTMAGENTA },
        TEXT_TOTAL: { FG: LIGHTBLUE },
        HEADER_FRAME: { BG: BG_LIGHTGRAY, FG: BLACK },
        MAIN_FRAME: { BG: BG_BLACK, FG: LIGHTGRAY },
        FOOTER_FRAME: { BG: BG_BLACK, FG: WHITE },
        LIGHTBAR: { BG: BG_CYAN, FG: WHITE },
        TEXT_HOTKEY: { FG: YELLOW },
        TEXT_NORMAL: { FG: WHITE },
        TEXT_BOLD: { FG: LIGHTCYAN },
        MODAL_BUTTON: { BG: BG_MAGENTA, FG: WHITE },
        MODAL_BUTTON_FOCUS: { BG: BG_MAGENTA, FG: WHITE },
        MODAL_BUTTON_DISABLED: { BG: BG_BLUE, FG: LIGHTGRAY },
        MODAL_BUTTON_MASK: { BG: BG_BLUE, FG: BLUE },
        MODAL_BUTTON_SHADOW: { BG: BG_BLACK, FG: BLACK },
    });
    // Planned UI additions:
    // - Grid tile layout (reusing logic style from WhoOnline but simplified for both all + online modes)
    // - Pagination when user count exceeds visible tile capacity (PgUp/PgDn)
    // - Mode toggle key (O): all <-> online
    // - Sort keys: N (alias), L (last on)
    // - Modal detail view (ENTER) showing extended fields, avatar if available
    // - Hotspot mapping (0-9, then A-Z) for first 36 visible tiles
    // - Future: search/filter (F), jump to letter, lazy loading for very large user bases
    // Internal state to be added:
    //   this.page = 0; this.pageSize dynamic from frame; this.filteredUsers cache
}
extend(Users, Subprogram);

Users.prototype.updateAllUsers = function () {
    var users = this.getUsers();
    var online = this.getOnlineUsers();
    this.users = this._hydrateOnlineUsers(users, online);
    // Debug: log users count and online status
    try {
        var onlineCount = this.users.filter(function(u) { return u.online !== -1; }).length;
        dbug('Users updated: ' + this.users.length + ' total, ' + onlineCount + ' online', 'users');
    } catch (e) { }
};

Users.prototype.updateOnlineStatus = function () {
    // Lightweight update: just refresh online status for existing users
    // without rebuilding the full user list
    var online = this.getOnlineUsers();
    var changed = [];

    for (var i = 0; i < this.users.length; i++) {
        var u = this.users[i];
        var oldOnline = u.online;
        var foundOnline = false;

        for (var j = 0; j < online.length; j++) {
            if (u.number === online[j].number) {
                u.online = online[j].node || 1;
                foundOnline = true;
                break;
            }
        }

        if (!foundOnline) {
            u.online = -1;
        }

        // Track which users changed status
        if (oldOnline !== u.online) {
            changed.push(i);
        }
    }

    return changed;
};

Users.prototype.refreshUserList = function () {
    // Full refresh (used on explicit re-entry)
    this.updateAllUsers();
    this.draw();
};

Users.prototype.getUsers = function () {
    var users = [];
    var total = system.lastuser;
    for (var i = 1; i <= total; i++) {
        var u = new User(i);  // Create fresh User object for each user number
        if (u.settings & (USER_DELETED | USER_INACTIVE)) continue;
        var userRecord = {
            number: u.number,
            alias: u.alias,
            location: u.location,
            note: u.note,
            connection: u.connection,
            laston: u.stats.laston_date,
            netmail: u.netmail,
            avatar: null, // lazy
            online: -1
        };
        users.push(userRecord);
    }
    // Debug: log how many users we loaded
    try {
        dbug('getUsers loaded ' + users.length + ' valid users (out of ' + total + ' total)', 'users');
    } catch (e) { }
    return users;
};

Users.prototype.getOnlineUsers = function () {
    var collected = [];
    // NODE_INUSE = user actively on the BBS
    // NODE_QUIET = sysop on BBS but don't show them to regular users
    // Any other status means the node is not actively in use

    for (var n = 1; n <= system.nodes; n++) {
        var node = system.node_list[n - 1];

        if (!node) continue;

        // Only consider nodes that are actively in use (NODE_INUSE or NODE_QUIET)
        if (node.status !== NODE_INUSE && node.status !== NODE_QUIET) continue;

        // Check for valid user number
        if (typeof node.useron !== 'number' || node.useron <= 0) continue;

        var u = new User(node.useron);
        collected.push({ node: n, alias: u.alias, number: u.number });
    }
    this.onlineUsers = collected.length;
    // Debug: log which users are actually online
    try {
        var aliases = collected.map(function(u) { return u.alias + ' (node ' + u.node + ')'; });
        dbug('Online users detected: ' + (aliases.length ? aliases.join(', ') : 'none'), 'users');
    } catch (e) { }
    return collected;
}

Users.prototype._hydrateOnlineUsers = function (users, online) {
    var markedOnline = [];
    var markedOffline = [];
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var foundOnline = false;
        for (var j = 0; j < online.length; j++) {
            if (u.number === online[j].number) {
                // Use node number (or 1) to mark online; previous code assigned undefined (online[j].online) causing miss
                u.online = online[j].node || 1;
                foundOnline = true;
                markedOnline.push(u.alias);
                break;
            }
        }
        // Ensure users not in online list are marked offline
        if (!foundOnline) {
            u.online = -1;
            markedOffline.push(u.alias);
        }
    }
    // Debug: log hydration results
    try {
        dbug('Hydration - marked online: ' + (markedOnline.length ? markedOnline.join(', ') : 'none'), 'users');
        if (markedOffline.length > 0 && markedOffline.length < 50) { // only log if not too many
            dbug('Hydration - marked offline: ' + markedOffline.join(', '), 'users');
        }
    } catch (e) { }
    return users;
};

Users.prototype._toggleWhichUsers = function () {
    if (this.whichUsers === 'all') this.whichUsers = 'online';
    else this.whichUsers = 'all';
}

Users.prototype.enter = function (done) {
    // Reset state on entry to ensure fresh view (important for singleton reuse)
    this.whichUsers = 'all';
    this.sortMode = null;
    this.page = 0;
    this.selectedIndex = 0;
    this._avatarCache = {}; // Clear avatar cache
    this._lastUserListUpdate = 0; // Reset polling timer
    this.updateAllUsers();
    Subprogram.prototype.enter.call(this, done);
    // this.draw();
};

Users.prototype.cycle = function () {
    // Only poll if we're still running (not suspended by another subprogram)
    if (!this.running) return;

    // Poll the online status every ~5 seconds to keep current while viewing
    var now = Date.now();
    var pollInterval = 5000; // 5 seconds

    if (!this._lastUserListUpdate) {
        this._lastUserListUpdate = now;
    }

    if (now - this._lastUserListUpdate >= pollInterval) {
        try {
            // Update just the online status (lightweight)
            var changed = this.updateOnlineStatus();

            // Only redraw if there were actual changes
            if (changed.length > 0) {
                this.draw();
            }
            this._lastUserListUpdate = now;
        } catch (e) {
            try { dbug('Users cycle error: ' + e, 'users'); } catch (_) { }
        }
    }
};

Users.prototype._filterUsers = function () {
    if (this.whichUsers === 'online') return this.users.filter(function (u) { return u.online !== -1; });
    return this.users;
};

Users.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.headerFrame) {
        this.headerFrame = new Frame(1, 1, this.parentFrame.width, 1, this.paletteAttr('HEADER_FRAME'), this.parentFrame); this.headerFrame.open();
        this.registerFrame(this.headerFrame);
    }
    if (!this.listFrame) {
        var h = Math.max(1, this.parentFrame.height - 2);
        this.listFrame = new Frame(1, 2, this.parentFrame.width, h, this.paletteAttr('MAIN_FRAME'), this.parentFrame); this.listFrame.open();
        this.registerFrame(this.listFrame);
        this.listFrame.bottom();
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, this.paletteAttr('FOOTER_FRAME'), this.parentFrame); this.statusFrame.open();
        this.registerFrame(this.statusFrame);
    }
};

Users.prototype._recomputeLayout = function () {
    if (!this.listFrame) { this.pageSize = 0; return; }
    var topMargin = 1;   // gap below header frame
    var bottomMargin = 1; // gap above status frame
    var rowGap = 1;      // single blank row between tile rows
    var headerHeight = 1;
    var bodyHeight = Math.max(this.showAvatars ? this.avatarHeight : 1, 6); // 6 rows covers avatar or icon cells
    var footerHeight = 1;
    var innerTop = 0;
    var innerBottom = 0;
    var contentHeight = headerHeight + bodyHeight + footerHeight;
    var avatarSpan = this.avatarWidth + 2;
    var tileW = Math.max(avatarSpan, 12);
    var horizontalGap = 1;

    var cols = Math.max(1, Math.floor((this.listFrame.width + horizontalGap) / (tileW + horizontalGap)));
    var usedWidth = cols * (tileW + horizontalGap) - horizontalGap;
    var extraWidth = this.listFrame.width - usedWidth;
    var offsetX = Math.max(0, Math.floor(extraWidth / 2));
    var usableHeight = Math.max(0, this.listFrame.height - topMargin - bottomMargin);
    var stepHeight = contentHeight + rowGap;
    var rows = Math.max(1, Math.floor((usableHeight + rowGap) / (stepHeight || 1)));
    var slots = cols * rows;

    this._tileMeta = {
        tileHeight: contentHeight,
        stepHeight: stepHeight,
        tileW: tileW,
        gap: horizontalGap,
        cols: cols,
        rows: rows,
        slots: slots,
        avatarSpan: avatarSpan,
        topMargin: topMargin,
        bottomMargin: bottomMargin,
        rowGap: rowGap,
        headerHeight: headerHeight,
        bodyHeight: bodyHeight,
        footerHeight: footerHeight,
        innerTop: innerTop,
        innerBottom: innerBottom,
        offsetX: offsetX
    };
    this.pageSize = Math.max(0, slots - 1);
};

Users.prototype._visibleUsers = function () {
    var list = this._filterUsers();
    if (this.sortMode === 'L') list.sort(function (a, b) { return b.laston - a.laston; });
    else if (this.sortMode === 'N') list.sort(function (a, b) { var A = a.alias.toLowerCase(), B = b.alias.toLowerCase(); if (A > B) return 1; if (A < B) return -1; return 0; });
    this._sortedFiltered = list;
    var perPage = Math.max(0, this.pageSize);
    if (!perPage) return [];
    var start = this.page * perPage;
    return list.slice(start, start + perPage);
};

Users.prototype._buildTiles = function (users) {
    var tiles = [];
    if (this.page === 0) tiles.push({ type: 'back' });
    for (var i = 0; i < users.length; i++) tiles.push({ type: 'user', user: users[i] });
    return tiles;
};

Users.prototype._getTileAtIndex = function (index) {
    if (!this._currentTiles || index < 0 || index >= this._currentTiles.length) return null;
    return this._currentTiles[index];
};

Users.prototype.draw = function () {
    this._ensureFrames();
    this._recomputeLayout();
    if (!this.listFrame) return;
    var lf = this.listFrame; lf.clear();
    this._destroyTileIcons();
    var users = this._visibleUsers();
    this._hotspotMap = {};
    if (this.hotspots) this.hotspots.clear();
    var tiles = this._buildTiles(users);
    var meta = this._tileMeta || { slots: tiles.length };
    var maxTiles = meta.slots || tiles.length;
    this._currentTiles = tiles.slice(0, maxTiles);
    if (this.selectedIndex >= this._currentTiles.length) this.selectedIndex = Math.max(this._currentTiles.length - 1, 0);
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    var hotspotDefs = [];
    for (var i = 0; i < this._currentTiles.length && i < maxTiles; i++) {
        this._drawTile(i, this._currentTiles[i], hotspotDefs);
    }
    if (this.hotspots) this.hotspots.set(hotspotDefs);
    this._drawStatus();
    try { lf.cycle(); } catch (e) { }
};

Users.prototype._drawTile = function (index, tile, hotspotDefs) {
    if (!tile) return;
    var meta = this._tileMeta; if (!meta) return;
    var lf = this.listFrame; if (!lf) return;
    var col = index % meta.cols; var row = Math.floor(index / meta.cols);
    var x = 1 + col * (meta.tileW + meta.gap) + (meta.offsetX || 0);
    var yBase = 1 + (meta.topMargin || 0) + row * (meta.stepHeight || meta.tileHeight || 0);
    var contentHeight = meta.tileHeight || 0;
    if (contentHeight < 1) contentHeight = 1;
    var innerTop = meta.innerTop || 0;
    var innerBottom = meta.innerBottom || 0;
    var headerHeight = meta.headerHeight || 0;
    var bodyHeight = meta.bodyHeight || 0;
    var footerHeight = meta.footerHeight || 0;
    var headerY = yBase + innerTop;
    var bodyStartY = headerY + headerHeight;
    var footerY = bodyStartY + bodyHeight;
    var selected = (index === this.selectedIndex);
    var tileW = meta.tileW;

    var originalAttr = lf.attr;
    var fallbackAttr = (typeof originalAttr === 'number') ? originalAttr : 0;
    var listAttr = this.paletteAttr('LIST', fallbackAttr);
    var selectedAttr = this.paletteAttr('LIGHTBAR', listAttr);
    var tileAttr = selected ? selectedAttr : listAttr;
    var blank = tileW > 0 ? repeat(tileW, ' ') : '';
    var record = {
        index: index,
        tileType: tile ? tile.type : null,
        x: x,
        yBase: yBase,
        tileW: tileW,
        contentHeight: contentHeight,
        blank: blank,
        listAttr: listAttr,
        selectedAttr: selectedAttr,
        selected: selected,
        headerX: x,
        headerY: headerY,
        footerX: x,
        footerY: footerY,
        bodyStartY: bodyStartY,
        headerHeight: headerHeight,
        bodyHeight: bodyHeight,
        footerHeight: footerHeight,
        tileAttr: tileAttr
    };
    this._tileFrameMap[index] = record;
    var restoreAttr = false;
    if (blank) {
        lf.attr = tileAttr;
        restoreAttr = true;
        for (var yy = 0; yy < contentHeight; yy++) {
            try {
                lf.gotoxy(x, yBase + yy);
                lf.putmsg(blank);
            } catch (e) { }
        }
    }
    if (restoreAttr) lf.attr = originalAttr;

    if (tile.type === 'back') {
        var iconWidth = 12;
        var iconHeight = 6;
        var iconAttr = this.paletteAttr('ICON') || (BG_BLACK | LIGHTGRAY);
        var iconBg = iconAttr & 0xF0;
        var iconFg = iconAttr & 0x0F;
        var iconOffset = Math.max(0, Math.floor((tileW - iconWidth) / 2));
        var iconX = lf.x + x - 1 + iconOffset;
        var iconY = lf.y + bodyStartY - 2;
        var iconFrame = new Frame(iconX, iconY, iconWidth, iconHeight, iconAttr, lf);
        try { iconFrame.open(); } catch (e) { }
        var labelFrame = new Frame(iconX, iconY + iconHeight + 1, iconWidth, 1, iconAttr, lf);
        try { labelFrame.open(); } catch (e) { }
        var iconData = { iconFile: 'back_red', label: 'Back', iconBg: iconBg, iconFg: iconFg };
        try {
            var iconObj = new Icon(iconFrame, labelFrame, iconData);
            log(iconData.iconFile + " Rendering icon in Icon Frame size " + iconFrame.width + "x" + iconFrame.height + " at " + iconX + "," + iconY);
            iconObj.render();
            try { iconFrame.top(); } catch (_) { }
            try { labelFrame.top(); } catch (_) { }
        } catch (e) { }
        this._tileIconFrames.push(iconFrame, labelFrame);
        if (record) record.iconFrames = [iconFrame, labelFrame];

        // Hotspots for back tile
        if (!hotspotDefs) hotspotDefs = [];
        var backCommands = ['0', 'B', 'b'];
        for (var bc = 0; bc < backCommands.length; bc++) {
            var cmdB = backCommands[bc];
            hotspotDefs.push({
                key: cmdB,
                x: iconX,
                y: iconY,
                width: iconWidth,
                height: iconHeight + 1,
                swallow: false,
                owner: 'users:back'
            });
            this._hotspotMap[cmdB] = index;
        }
        return;
    }

    var user = tile.user;
    if (!user) return;
    var header = user.alias + ' #' + user.number;
    if (header.length > tileW) header = header.substr(0, tileW);
    var footer = (user.online !== -1) ? '\x01W[\x01C ON Node #' + user.online + '\x01W]' : system.datestr(user.laston);
    // Strip color codes to get actual display width (codes don't render)
    var footerDisplay = footer.replace(/\x01[a-zA-Z0-9]/g, '');
    if (footerDisplay.length > tileW) {
        // If too long, remove color codes first, then truncate
        footer = footerDisplay.substr(0, tileW);
    }

    var containerHeight = contentHeight;
    var headerRows = Math.max(1, headerHeight || 1);
    if (headerRows > containerHeight) headerRows = containerHeight;
    var remainingAfterHeader = Math.max(0, containerHeight - headerRows);
    var footerRows = Math.max(1, footerHeight || 1);
    if (footerRows > remainingAfterHeader) footerRows = Math.max(1, remainingAfterHeader || 1);
    var bodyRows = Math.max(1, containerHeight - headerRows - footerRows);
    record.headerRows = headerRows;
    record.bodyRows = bodyRows;
    record.footerRows = footerRows;
    record.headerText = header;
    record.footerText = footer;

    var containerFrame = null;
    var headerFrame = null;
    var bodyFrame = null;
    var footerFrame = null;
    var frameX = lf.x + x - 1;
    var frameY = lf.y + headerY - 1;
    try {
        containerFrame = new Frame(frameX, frameY, tileW, headerRows + bodyRows + footerRows, tileAttr, lf);
        containerFrame.open();
        this._tileAvatarFrames.push(containerFrame);
    } catch (cfErr) {
        containerFrame = null;
    }

    if (containerFrame) {
        try {
            headerFrame = new Frame(containerFrame.x, containerFrame.y, tileW, headerRows, tileAttr, containerFrame);
            headerFrame.open();
            this._tileAvatarFrames.push(headerFrame);
        } catch (_) { headerFrame = null; }
        try {
            bodyFrame = new Frame(containerFrame.x, containerFrame.y + headerRows, tileW, bodyRows, tileAttr, containerFrame);
            bodyFrame.open();
            this._tileAvatarFrames.push(bodyFrame);
        } catch (_) { bodyFrame = null; }
        try {
            footerFrame = new Frame(containerFrame.x, containerFrame.y + headerRows + bodyRows, tileW, footerRows, tileAttr, containerFrame);
            footerFrame.open();
            this._tileAvatarFrames.push(footerFrame);
        } catch (_) { footerFrame = null; }
    }

    record.containerFrame = containerFrame;
    record.headerFrame = headerFrame;
    record.bodyFrame = bodyFrame;
    record.footerFrame = footerFrame;

    if (headerFrame) {
        try {
            headerFrame.clear(tileAttr);
            headerFrame.gotoxy(1, 1);
            headerFrame.putmsg((selected ? '\x01h' : '') + header + '\x01n');
        } catch (_) { }
    } else {
        try { lf.gotoxy(x, headerY); lf.putmsg((selected ? '\x01h' : '') + header + '\x01n'); } catch (e) { }
    }

    if (this.showAvatars && this._avatarsEnabled && bodyFrame) {
        try {
            var avatarLines = this._getAvatar(user) || [];
            if (avatarLines.length) {
                var base64Candidate = avatarLines[0];
                var avatarWidth = Math.min(this.avatarWidth, tileW);
                var avatarHeight = Math.min(this.avatarHeight, bodyRows);
                if (avatarWidth > 0 && avatarHeight > 0) {
                    var avatarOffset = Math.max(0, Math.floor((tileW - avatarWidth) / 2));
                    var avatarDestX = avatarOffset + 1;
                    try { bodyFrame.clear(tileAttr); } catch (_) { }
                    this.putAvatarBindataIntoFrame(base64Candidate, bodyFrame, avatarDestX, 1, avatarLines);
                    try { bodyFrame.top(); } catch (_) { }
                    record.avatarData = {
                        base64: base64Candidate,
                        lines: avatarLines ? avatarLines.slice(0) : [],
                        destX: avatarDestX,
                        destY: 1,
                        usesBodyFrame: true
                    };
                }
            }
        } catch (ae) {
            try { log("Error drawing avatar for user #" + user.number + " " + user.alias + ": " + ae); } catch (_) { }
        }
    } else if (this.showAvatars && this._avatarsEnabled) {
        try {
            var fallbackAvatarLines = this._getAvatar(user) || [];
            if (fallbackAvatarLines.length) {
                var fallbackData = fallbackAvatarLines[0];
                var fallbackX = x + Math.max(0, Math.floor((tileW - Math.min(this.avatarWidth, tileW)) / 2));
                this.putAvatarBindataIntoFrame(fallbackData, lf, fallbackX, headerY + 1, fallbackAvatarLines);
                record.avatarData = {
                    base64: fallbackData,
                    lines: fallbackAvatarLines.slice(0),
                    destX: fallbackX,
                    destY: headerY + 1,
                    usesBodyFrame: false
                };
            }
        } catch (be) {
            try { log("Error drawing avatar for user #" + user.number + " " + user.alias + ": " + be); } catch (_) { }
        }
    }

    if (footerFrame) {
        try {
            footerFrame.clear(tileAttr);
            footerFrame.gotoxy(1, 1);
            footerFrame.putmsg((selected ? '\x01h' : '') + footer + '\x01n');
        } catch (_) { }
    } else {
        try { lf.gotoxy(x, footerY); lf.putmsg((selected ? '\x01h' : '') + footer + '\x01n'); } catch (e) { }
    }

    if (index < 36) {
        var cmd = (index < 10) ? String(index) : String.fromCharCode('A'.charCodeAt(0) + (index - 10));
        if (!hotspotDefs) hotspotDefs = [];
        hotspotDefs.push({
            key: cmd,
            x: x + lf.x - 1,
            y: yBase + lf.y - 1,
            width: Math.max(1, tileW),
            height: Math.max(1, contentHeight),
            swallow: false,
            owner: 'users:tile',
            data: { index: index }
        });
        this._hotspotMap[cmd] = index;
    }
};

Users.prototype._updateTileHighlight = function (index, selected) {
    if (!this.listFrame) return false;
    if (!this._tileFrameMap) return false;
    if (index === undefined || index === null || index < 0) return false;
    var record = this._tileFrameMap[index];
    if (!record) return false;
    if (record.selected === selected) return true;
    var lf = this.listFrame;
    var attr = selected ? record.selectedAttr : record.listAttr;
    if (typeof attr !== 'number') attr = record.tileAttr || 0;
    var blank = record.blank;
    if (blank && record.contentHeight > 0) {
        var originalAttr = lf.attr;
        lf.attr = attr;
        for (var yy = 0; yy < record.contentHeight; yy++) {
            try {
                lf.gotoxy(record.x, record.yBase + yy);
                lf.putmsg(blank);
            } catch (e) { }
        }
        lf.attr = originalAttr;
    }
    if (record.containerFrame) {
        try { record.containerFrame.attr = attr; } catch (e) { }
    }
    var headerText = record.headerText;
    if (headerText !== undefined) {
        var prefix = selected ? '\x01h' : '';
        var frameAttr = attr;
        if (record.headerFrame) {
            try {
                record.headerFrame.attr = frameAttr;
                record.headerFrame.clear(frameAttr);
                record.headerFrame.gotoxy(1, 1);
                record.headerFrame.putmsg(prefix + headerText + '\x01n');
            } catch (e) { }
        } else {
            try {
                lf.gotoxy(record.headerX, record.headerY);
                lf.putmsg(prefix + headerText + '\x01n');
            } catch (e) { }
        }
    }
    var footerText = record.footerText;
    if (footerText !== undefined) {
        var prefixFooter = selected ? '\x01h' : '';
        var footerAttr = attr;
        if (record.footerFrame) {
            try {
                record.footerFrame.attr = footerAttr;
                record.footerFrame.clear(footerAttr);
                record.footerFrame.gotoxy(1, 1);
                record.footerFrame.putmsg(prefixFooter + footerText + '\x01n');
            } catch (e) { }
        } else {
            try {
                lf.gotoxy(record.footerX, record.footerY);
                lf.putmsg(prefixFooter + footerText + '\x01n');
            } catch (e) { }
        }
    }
    if (record.bodyFrame) {
        try {
            record.bodyFrame.attr = attr;
            if (record.avatarData && record.avatarData.lines) {
                record.bodyFrame.clear(attr);
                this.putAvatarBindataIntoFrame(
                    record.avatarData.base64,
                    record.bodyFrame,
                    record.avatarData.destX || 1,
                    record.avatarData.destY || 1,
                    record.avatarData.lines
                );
                try { record.bodyFrame.top(); } catch (_) { }
            } else {
                record.bodyFrame.clear(attr);
            }
        } catch (e) { }
    } else if (record.avatarData && record.avatarData.lines && record.avatarData.usesBodyFrame === false) {
        var savedAttr = lf.attr;
        try {
            lf.attr = attr;
            this.putAvatarBindataIntoFrame(
                record.avatarData.base64,
                lf,
                record.avatarData.destX || record.headerX,
                record.avatarData.destY || (record.headerY + 1),
                record.avatarData.lines
            );
        } catch (e) { }
        lf.attr = savedAttr;
    }
    record.selected = selected;
    return true;
};

Users.prototype._applySelectionChange = function (oldIndex, newIndex) {
    if (!this.listFrame) return false;
    if (oldIndex === newIndex && oldIndex !== undefined && oldIndex !== null) {
        var selfUpdate = this._updateTileHighlight(newIndex, true);
        if (selfUpdate) {
            try { this.listFrame.cycle(); } catch (e) { }
        }
        return selfUpdate;
    }
    var ok = true;
    if (typeof oldIndex === 'number' && oldIndex >= 0) {
        if (!this._updateTileHighlight(oldIndex, false)) ok = false;
    }
    if (typeof newIndex === 'number' && newIndex >= 0) {
        if (!this._updateTileHighlight(newIndex, true)) ok = false;
    }
    if (!ok) return false;
    try { this.listFrame.cycle(); } catch (e) { }
    return true;
};

Users.prototype._drawStatus = function (msg) {
    if (!this.statusFrame) return;
    // Guard against uninitialized page/pageSize to prevent NaN
    if (typeof this.page !== 'number' || this.page < 0) this.page = 0;
    var perPage = this.pageSize;
    if (!perPage || isNaN(perPage)) {
        var fallbackSlots = this._tileMeta ? this._tileMeta.slots || 1 : 1;
        perPage = Math.max(1, fallbackSlots - 1);
    }
    var total = this._sortedFiltered ? this._sortedFiltered.length : this.users.length;
    var showingStart = total ? (this.page * perPage + 1) : 0;
    var showingEnd = Math.min(total, showingStart + perPage - 1);
    if (total === 0) { showingStart = 0; showingEnd = 0; }
    var title = total + ' ' + system.name + ' users. Online:' + this.onlineUsers;
    this.headerFrame.clear();
    this.headerFrame.center(title);
    var hotkeys = [{ val: 'Mode', action: this.whichUsers }, { val: 'O', action: 'Online/All' }, { val: 'N', action: 'Name sort' }, { val: 'L', action: 'Last On' }, { val: 'ENTER', action: 'Details' }, { val: 'ESC', action: 'Quit' }];
    var crumb = this._generateHotkeyLine(hotkeys);
    var info = (msg ? msg + '  ' : '') + crumb;
    try { this.statusFrame.clear(); this.statusFrame.center(info); this.statusFrame.cycle(); } catch (e) { }
};

Users.prototype._destroyTileIcons = function () {
    if (this._tileIconFrames) {
        for (var i = 0; i < this._tileIconFrames.length; i++) {
            try { this._tileIconFrames[i].close(); } catch (e) { }
        }
        this._tileIconFrames = [];
    }
    if (this._tileAvatarFrames) {
        for (var j = 0; j < this._tileAvatarFrames.length; j++) {
            try { this._tileAvatarFrames[j].close(); } catch (e) { }
        }
        this._tileAvatarFrames = [];
    }
    this._tileFrameMap = [];
    this._currentTiles = [];
};

// Simple repeat helper
function repeat(n, ch) { var s = ''; while (n-- > 0) s += ch; return s; }

Users.prototype._openModalForSelected = function () {
    var tile = this._getTileAtIndex(this.selectedIndex);
    if (!tile) return;
    if (tile.type === 'back') {
        this.exit();
        return;
    }
    if (!tile.user) return;
    this._openModal(tile.user);
};

Users.prototype._openModal = function (user) {
    if (this.modal) return; // one at a time
    if (!this.parentFrame) return;
    if (typeof Modal === 'undefined') {
        try { load('future_shell/lib/util/layout/modal.js'); } catch (_mErr) { }
    }
    var self = this;
    var u = user;
    // We'll display:
    // Top header (alias + number)
    // Left column: details list
    // Right column: avatar box (if any)
    // Footer help line
    // Using single frame; manual positioning inside render callback
    function buildDetailLines(userObj) {
        return [
            'Location: ' + (userObj.location || ''),
            'Last On : ' + system.datestr(userObj.laston),
            'Conn    : ' + (userObj.connection || ''),
            'Online  : ' + (userObj.online !== -1 ? ('Yes (Node ' + userObj.online + ')') : 'No')
        ];
    }
    var avatarLines = [];
    try { avatarLines = this._getAvatar(u) || []; } catch (_) { }
    var detailLines = buildDetailLines(u);
    // Fixed classic layout (no adaptive fallback). Dimensions approximate original multi-frame design.
    var classic = true;
    var FIXED_WIDTH = 44;
    var FIXED_HEIGHT = 16; // matches earlier multi-frame vertical footprint
    // Build minimal placeholder string (runtime may not support String.repeat)
    var placeholder = (function (n) { var s = ''; while (n-- > 0) s += ' '; return s; })(10);
    var modalParent = this.parentFrame;
    if (modalParent && modalParent.parent) {
        while (modalParent.parent) modalParent = modalParent.parent;
    }
    if (!modalParent && this.shell && this.shell.root) modalParent = this.shell.root;
    var modalButtonAttr = this.paletteAttr('MODAL_BUTTON', ((typeof BG_MAGENTA !== 'undefined' ? BG_MAGENTA : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7)));
    var modalButtonFocusAttr = this.paletteAttr('MODAL_BUTTON_FOCUS', modalButtonAttr);
    var modalButtonDisabledAttr = this.paletteAttr('MODAL_BUTTON_DISABLED', modalButtonAttr);
    var modalButtonMaskAttr = this.paletteAttr('MODAL_BUTTON_MASK', ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof BLUE !== 'undefined' ? BLUE : 1)));
    var modalButtonShadowAttr = this.paletteAttr('MODAL_BUTTON_SHADOW', ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof BLACK !== 'undefined' ? BLACK : 0)));
    this.modal = new Modal({
        type: 'custom',
        title: 'User Detail',
        message: placeholder, // minimal placeholder; we fully custom render
        parentFrame: modalParent || this.parentFrame,
        overlay: false,
        width: FIXED_WIDTH,
        height: FIXED_HEIGHT,
        attr: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7),
        contentAttr: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7),
        buttonAttr: modalButtonAttr,
        buttonFocusAttr: modalButtonFocusAttr,
        buttonDisabledAttr: modalButtonDisabledAttr,
        buttonMaskAttr: modalButtonMaskAttr,
        buttonShadowAttr: modalButtonShadowAttr,
        buttons: [{ label: 'Close', value: true, default: true }],
        captureKeys: true,
        render: function (frame, modal) {
            // Clear content area (leave border handled by Modal)
            try { frame.clear(); } catch (_) { }
            if (!frame || frame.width < FIXED_WIDTH || frame.height < FIXED_HEIGHT) return; // expect fixed dims
            var startX = 2, startY = 2;
            var colGap = 2;
            var avatarColW = (avatarLines.length ? self.avatarWidth : 0);
            if (avatarColW > 10) avatarColW = 10; // cap inside fixed width
            var leftColW = FIXED_WIDTH - 2 - (avatarColW ? (avatarColW + colGap) : 0) - 1; // border + gap
            if (leftColW < 24) { // enforce minimum left width; if too tight, drop avatar entirely
                if (avatarColW) { avatarColW = 0; leftColW = FIXED_WIDTH - 4; }
            }

            // Header
            var header = ('User #' + u.number + '  ' + u.alias).substr(0, leftColW);
            try { frame.gotoxy(startX, startY); frame.putmsg('\x01h' + header + '\x01n'); } catch (_) { }
            // Detail lines (fixed vertical slots)
            var detailStartY = startY + 2;
            for (var i = 0; i < detailLines.length && i < 6; i++) { // show up to 6 lines
                var dl = detailLines[i]; if (dl.length > leftColW) dl = dl.substr(0, leftColW);
                try { frame.gotoxy(startX, detailStartY + i); frame.putmsg(dl); } catch (_) { }
            }
            // Avatar block (attempt base64 decode + blit; fallback to ASCII lines without raw base64 line)
            if (avatarColW && avatarLines.length) {
                var ax = startX + leftColW + colGap;
                var ay = startY + 1; // below header
                var usedBinary = false;
                var candidate = avatarLines[0];
                // Heuristic: candidate length and base64 charset
                if (candidate && candidate.length > 16 && /^(?:[A-Za-z0-9+\/=]+)$/.test(candidate)) {
                    try {
                        // putAvatarBindataIntoFrame will internally try base64_decode and fallback
                        self.putAvatarBindataIntoFrame(candidate, frame, ax, ay, avatarLines);
                        usedBinary = true;
                    } catch (_binErr) { usedBinary = false; }
                }
                if (!usedBinary) {
                    var startIndex = 0;
                    // If it looks like base64 but failed to render, skip raw line to avoid visual noise
                    if (candidate && /^(?:[A-Za-z0-9+\/=]+)$/.test(candidate)) startIndex = 1;
                    var maxAvatarLines = Math.min(self.avatarHeight, avatarLines.length - startIndex);
                    for (var al = 0; al < maxAvatarLines; al++) {
                        var avl = avatarLines[startIndex + al];
                        if (avl.length > avatarColW) avl = avl.substr(0, avatarColW);
                        try { frame.gotoxy(ax, ay + al); frame.putmsg(avl); } catch (_) { }
                    }
                }
            }

            // Footer help
            var help = '(ENTER/ESC to close)';
            if (help.length > leftColW) help = help.substr(0, leftColW);
            try { frame.gotoxy(startX, frame.height - 4); frame.putmsg(help); } catch (_) { }
        },
        onClose: function () { self.modal = null; self.draw(); }
    });
};

// Legacy _closeModal removed; unified Modal handles its own lifecycle via onClose

// Legacy _drawModal removed; unified Modal handles content rendering

// Override handleKey when modal active
Users.prototype.handleKey = function (k) {
    if (this.modal) {
        // Close modal on any key (ENTER/ESC already mapped via buttons/help text)
        if (k) {
            try { if (this.modal && typeof this.modal.close === 'function') this.modal.close(); } catch (_) { }
            // onClose will redraw
        }
        return;
    }
    return this._handleMainKey(k);
};

// Main (non-modal) key dispatch extracted so modal override above can delegate
Users.prototype._handleMainKey = function (k) {
    if (!k) return;
    if (typeof k === 'string') {
        if (k.length === 1) {
            switch (k.charCodeAt(0)) {
                case 10: // LF (Doorway down arrow)
                    k = KEY_DOWN; break;
                case 6:  // ^F (Doorway right arrow)
                    k = KEY_RIGHT; break;
                case 30: // RS (Doorway up arrow in CP437 clients)
                    k = KEY_UP; break;
                case 29: // GS (Doorway left)
                    k = KEY_LEFT; break;
                case 31: // US (Doorway up)
                    k = KEY_UP; break;
                case 1:  // ^A (Doorway Home)
                    k = KEY_HOME; break;
                case 5:  // ^E (Doorway End)
                    k = KEY_END; break;
            }
        } else if (k.length >= 2 && k.charAt(0) === '\x1b') {
            // ANSI escape sequences (ESC [ A/B/C/D)
            var seq = k.substr(1);
            if (seq === '[A') k = KEY_UP;
            else if (seq === '[B') k = KEY_DOWN;
            else if (seq === '[C') k = KEY_RIGHT;
            else if (seq === '[D') k = KEY_LEFT;
            else if (seq === '[5~') k = KEY_PGUP;
            else if (seq === '[6~') k = KEY_PGDN;
            else if (seq === '[H') k = KEY_HOME;
            else if (seq === '[F') k = KEY_END;
            else if (seq === 'OA') k = KEY_UP;
            else if (seq === 'OB') k = KEY_DOWN;
            else if (seq === 'OC') k = KEY_RIGHT;
            else if (seq === 'OD') k = KEY_LEFT;
            else if (seq === 'OP') k = KEY_HOME;
            else if (seq === 'OQ') k = KEY_END;
        }
    }
    if (this._hotspotMap && this._hotspotMap[k] !== undefined) {
        var tilesHot = this._currentTiles || [];
        var mapped = this._hotspotMap[k];
        if (tilesHot.length) {
            if (mapped >= tilesHot.length) mapped = tilesHot.length - 1;
            if (mapped < 0) mapped = 0;
        } else mapped = 0;
        this.selectedIndex = mapped;
        this.draw();
        this._openModalForSelected();
        return;
    }
    var tiles = this._currentTiles || [];
    var tileCount = tiles.length;
    var meta = this._tileMeta;
    switch (k) {
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'O': case 'o': this._toggleWhichUsers(); this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'N': case 'n': this.sortMode = 'N'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'L': case 'l': this.sortMode = 'L'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case KEY_LEFT:
            if (!tileCount) return;
            if (this._shiftSelectionLocal(-1)) return;
            this._switchPage(-1, meta, (meta && meta.cols) ? meta.cols - 1 : 0, true);
            return;
        case KEY_RIGHT:
            if (!tileCount) return;
            if (this._shiftSelectionLocal(1)) return;
            this._switchPage(1, meta, 0, false);
            return;
        case KEY_UP:
            if (!meta || !meta.cols) return;
            if (!tileCount) return;
            if (this._shiftSelectionLocal(-(meta.cols || 1))) return;
            this._switchPage(-1, meta, this._localColumn(meta), true);
            return;
        case KEY_DOWN:
            if (!meta || !meta.cols) return;
            if (!tileCount) return;
            if (this._shiftSelectionLocal(meta.cols || 1)) return;
            this._switchPage(1, meta, this._localColumn(meta), false);
            return;
        case KEY_PGUP:
            if (!meta || !meta.cols) return;
            this._switchPage(-1, meta, this._localColumn(meta), false);
            return;
        case KEY_PGDN:
            if (!meta || !meta.cols) return;
            this._switchPage(1, meta, this._localColumn(meta), false);
            return;
        case '\r': case '\n': this._openModalForSelected(); return;
    }
};

Users.prototype._currentUserList = function () {
    if (this._sortedFiltered && this._sortedFiltered.length) return this._sortedFiltered;
    var list = this._filterUsers();
    if (this.sortMode === 'L') list.sort(function (a, b) { return b.laston - a.laston; });
    else if (this.sortMode === 'N') list.sort(function (a, b) {
        var A = a.alias.toLowerCase(), B = b.alias.toLowerCase();
        if (A > B) return 1;
        if (A < B) return -1;
        return 0;
    });
    this._sortedFiltered = list;
    return list;
};

Users.prototype._firstUserIndex = function () {
    return this.page === 0 ? 1 : 0;
};

Users.prototype._localColumn = function (meta) {
    var cols = (meta && meta.cols) || 1;
    var start = this._firstUserIndex();
    var local = this.selectedIndex - start;
    if (local < 0) local = 0;
    return local % cols;
};

Users.prototype._shiftSelectionLocal = function (offset) {
    var tiles = this._currentTiles || [];
    if (!tiles.length) return false;
    var first = this._firstUserIndex();
    var last = tiles.length - 1;
    if (last < first) return false;
    var target = this.selectedIndex + offset;
    if (target < first || target > last) return false;
    var prev = this.selectedIndex;
    this.selectedIndex = target;
    if (!this._applySelectionChange(prev, target)) this.draw();
    return true;
};

Users.prototype._indexForColumnOnPage = function (meta, column, preferBottom) {
    var tiles = this._currentTiles || [];
    if (!tiles.length) return 0;
    var cols = (meta && meta.cols) || 1;
    var start = this._firstUserIndex();
    var count = Math.max(0, tiles.length - start);
    if (!count) return start;
    var rows = Math.max(1, Math.ceil(count / cols));
    var targetRow = preferBottom ? rows - 1 : 0;
    var entriesInRow = (targetRow === rows - 1) ? (count % cols || cols) : cols;
    var col = Math.max(0, Math.min(typeof column === 'number' ? column : 0, entriesInRow - 1));
    var idx = start + targetRow * cols + col;
    if (idx >= start + count) idx = start + count - 1;
    return idx;
};

Users.prototype._switchPage = function (deltaPage, meta, column, preferBottom) {
    var list = this._currentUserList();
    if (!list.length) return false;
    var perPage = Math.max(1, this.pageSize || 1);
    var newPage = this.page + deltaPage;
    if (newPage < 0) {
        if (this.page === 0 && this._firstUserIndex() === 1) {
            if (this.selectedIndex !== 0) {
                var prev = this.selectedIndex;
                this.selectedIndex = 0;
                if (!this._applySelectionChange(prev, 0)) this.draw();
                return true;
            }
        }
        return false;
    }
    var maxPage = Math.max(0, Math.ceil(list.length / perPage) - 1);
    if (newPage > maxPage) return false;
    var prevSelected = this.selectedIndex;
    this.page = newPage;
    this.selectedIndex = 0;
    this.draw();
    var idx = this._indexForColumnOnPage(meta, column, preferBottom);
    this.selectedIndex = idx;
    if (!this._applySelectionChange(prevSelected, idx)) this.draw();
    return true;
};

Users.prototype.cleanup = function () {
    if (this.hotspots) this.hotspots.clear();
    this._destroyTileIcons();
    try { if (this.listFrame) this.listFrame.close(); } catch (e) { }
    try { if (this.statusFrame) this.statusFrame.close(); } catch (e) { }
    try { if (this.headerFrame) this.headerFrame.close(); } catch (e) { }
    try { if (this.modal && this.modal.frame) this.modal.frame.close(); } catch (e) { }
    this.listFrame = this.statusFrame = null; this.modal = null; this.headerFrame = null;
    this._avatarCache = {};
    Subprogram.prototype.cleanup.call(this);
};

// Lazy avatar fetch helper methods
Users.prototype._fetchAvatarData = function (usernum, alias) {
    if (!this._avatarLib || !this.showAvatars) return null;
    try {
        var raw = this._avatarLib.read(usernum, alias);
        if (!raw || !raw.data) return null;
        var lines = ('' + raw.data).split(/\r?\n/);
        // Trim trailing blanks
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        return lines;
    } catch (e) { return null; }
};

Users.prototype._getAvatar = function (u) {
    if (!u) return null;
    if (this._avatarCache[u.number]) return this._avatarCache[u.number];
    var data = this._fetchAvatarData(u.number, u.alias) || [];
    this._avatarCache[u.number] = data;
    return data;
};

Users.prototype.putAvatarBindataIntoFrame = function (data, frame, dstX, dstY, originalLines) {
    // Backwards compat defaults
    dstX = dstX || 1; dstY = dstY || 1;
    if (!data) {
        // Fallback to plain lines if provided
        if (originalLines) this._drawAsciiAvatar(frame, originalLines, dstX, dstY);
        return;
    }
    var bin = null;
    if (typeof base64_decode === 'function') {
        try { bin = base64_decode(data); } catch (e) { bin = null; }
    }
    // Heuristic: expect char+attr pairs length >= w*h*2
    if (bin && bin.length >= (this.avatarWidth * this.avatarHeight * 2)) {
        this._blitAvatarToFrame(frame, bin, this.avatarWidth, this.avatarHeight, dstX, dstY);
        return;
    }
    // Not valid bindata; draw ASCII lines (originalLines includes first line already)
    if (originalLines) this._drawAsciiAvatar(frame, originalLines, dstX, dstY);
};

Users.prototype._drawAsciiAvatar = function (frame, lines, dstX, dstY) {
    var h = Math.min(this.avatarHeight, lines.length);
    for (var i = 0; i < h; i++) {
        var line = lines[i];
        if (!line) line = '';
        if (line.length > this.avatarWidth) line = line.substr(0, this.avatarWidth);
        try { frame.gotoxy(dstX, dstY + i); frame.putmsg(line); } catch (e) { }
    }
};

Users.prototype._blitAvatarToFrame = function (frame, binData, w, h, dstX, dstY) {
    var offset = 0;
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (offset + 1 >= binData.length) return;
            var ch = binData.substr(offset++, 1);
            var attr = ascii(binData.substr(offset++, 1));
            try { frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); } catch (se) { }
        }
    }
    frame.top();
};

Users.prototype._cleanup = function () {
    // Clean up all child frames when exiting
    this._destroyTileIcons();
    if (this.hotspots) this.hotspots.clear();
    if (this.headerFrame) {
        try { this.headerFrame.clear(); } catch (_e) { }
        try { this.headerFrame.close(); } catch (_e2) { }
        this.headerFrame = null;
    }
    if (this.listFrame) {
        try { this.listFrame.clear(); } catch (_e3) { }
        try { this.listFrame.close(); } catch (_e4) { }
        this.listFrame = null;
    }
    if (this.statusFrame) {
        try { this.statusFrame.clear(); } catch (_e5) { }
        try { this.statusFrame.close(); } catch (_e6) { }
        this.statusFrame = null;
    }
};

Users.prototype.resumeForReason = function (reason) {
    // Redraw the subprogram when coming back from external events
    if (reason === 'screensaver_off' || reason === 'external_return') {
        this.draw();
    }
}

Users.prototype.pauseForReason = function (reason) {
    // Optional: Clear display when pausing for external programs
    if (reason === 'external_launch') {
        if (this.hostFrame) {
            try { this.hostFrame.clear(); } catch (_e) { }
        }
    }
}

// Export
registerModuleExports({ Users: Users });
