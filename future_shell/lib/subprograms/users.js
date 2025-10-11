if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

function Users(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'user-list', parentFrame: opts.parentFrame });
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
}

Users.prototype.getUsers = function () {
    var users = [];
    var total = system.lastuser;
    var u = new User;
    for (var i = 1; i <= total; i++) {
        u.number = i;
        if (u.settings & (USER_DELETED | USER_INACTIVE)) continue;
        users.push({
            number: u.number,
            alias: u.alias,
            location: u.location,
            note: u.note,
            connection: u.connection,
            laston: u.stats.laston_date,
            netmail: u.netmail,
            avatar: null, // lazy
            online: -1
        });
    }
    return users;
};

Users.prototype.getOnlineUsers = function () {
    var collected = [];
    for (var n = 1; n <= system.nodes; n++) {
        var node = system.node_list[n - 1];
        if (!node || !node.useron) continue;
        var u = new User(node.useron);
        collected.push({ node: n, alias: u.alias, number: u.number });
    }
    this.onlineUsers = collected.length;
    return collected;
}

Users.prototype._hydrateOnlineUsers = function (users, online) {
    for (var i = 0; i < users.length; i++) {
        var u = users[i];
        for (var j = 0; j < online.length; j++) {
            if (u.number === online[j].number) {
                // Use node number (or 1) to mark online; previous code assigned undefined (online[j].online) causing miss
                u.online = online[j].node || 1;
                break;
            }
        }
    }
    return users;
};

Users.prototype._toggleWhichUsers = function () {
    if (this.whichUsers === 'all') this.whichUsers = 'online';
    else this.whichUsers = 'all';
}

Users.prototype.enter = function (done) {
    this.updateAllUsers();
    Subprogram.prototype.enter.call(this, done);
    // this.draw();
};

Users.prototype._filterUsers = function () {
    if (this.whichUsers === 'online') return this.users.filter(function (u) { return u.online !== -1; });
    return this.users;
};

Users.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.listFrame) {
        var h = Math.max(1, this.parentFrame.height - 1);
        this.listFrame = new Frame(1, 1, this.parentFrame.width, h, ICSH_ATTR('USERS_LIST'), this.parentFrame); this.listFrame.open();
        this.registerFrame(this.listFrame);
        this.listFrame.bottom();
        this.setBackgroundFrame(this.listFrame);
    }
    if (!this.statusFrame) {
        this.statusFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, ICSH_ATTR('USERS_STATUS'), this.parentFrame); this.statusFrame.open();
        this.registerFrame(this.statusFrame);
    }
};

Users.prototype._recomputeLayout = function () {
    if (!this.listFrame) { this.pageSize = 0; return; }
    var tileH = (this.showAvatars ? this.avatarHeight : 1) + 2; // header + footer
    var tileW = Math.max(this.avatarWidth, 10); // ensure min width for alias
    var gap = 1;
    var cols = Math.max(1, Math.floor((this.listFrame.width + gap) / (tileW + gap)));
    var rows = Math.max(1, Math.floor(this.listFrame.height / tileH));
    this._tileMeta = { tileH: tileH, tileW: tileW, gap: gap, cols: cols, rows: rows };
    this.pageSize = cols * rows;
};

Users.prototype._visibleUsers = function () {
    var list = this._filterUsers();
    if (this.sortMode === 'L') list.sort(function (a, b) { return b.laston - a.laston; });
    else if (this.sortMode === 'N') list.sort(function (a, b) { var A = a.alias.toLowerCase(), B = b.alias.toLowerCase(); if (A > B) return 1; if (A < B) return -1; return 0; });
    this._sortedFiltered = list;
    var start = this.page * this.pageSize;
    return list.slice(start, start + this.pageSize);
};

Users.prototype.draw = function () {
    this._ensureFrames();
    this._recomputeLayout();
    if (!this.listFrame) return;
    var lf = this.listFrame; lf.clear();
    var users = this._visibleUsers();
    this._hotspotMap = {};
    if (typeof console.clear_hotspots === 'function') try { console.clear_hotspots(); } catch (e) { }
    for (var i = 0; i < users.length; i++) this._drawTile(i, users[i]);
    this._drawStatus();
    try { lf.cycle(); } catch (e) { }
};

Users.prototype._drawTile = function (index, user) {
    var meta = this._tileMeta; if (!meta) return;
    var lf = this.listFrame; if (!lf) return;
    var col = index % meta.cols; var row = Math.floor(index / meta.cols);
    var x = 1 + col * (meta.tileW + meta.gap);
    var y = 1 + row * meta.tileH;
    var selected = (index === this.selectedIndex);
    // Background block
    for (var yy = 0; yy < meta.tileH; yy++) {
        try { lf.gotoxy(x, y + yy); lf.putmsg('\x01' + (selected ? '4' : '0') + repeat(meta.tileW, ' ') + '\x01n'); } catch (e) { }
    }
    // Header line
    var header = user.alias + ' #' + user.number;
    if (header.length > meta.tileW) header = header.substr(0, meta.tileW);
    try { lf.gotoxy(x, y); lf.putmsg((selected ? '\x01h' : '') + header + '\x01n'); } catch (e) { }
    // Avatar area (lines y+1 .. y+avatarHeight)
    if (this.showAvatars && this._avatarsEnabled) {
        try {
            var avatarLines = this._getAvatar(user) || [];
            if (avatarLines.length) {
                // Assume first line is potential base64 bindata for attr-pair avatar
                var base64Candidate = avatarLines[0];
                this.putAvatarBindataIntoFrame(base64Candidate, lf, x, y + 1, avatarLines);
            }
        } catch (e) {
            log("Error drawing avatar for user #" + user.number + " " + user.alias + ": " + e);
        }
    }
    // Footer (online badge / laston date)
    var footerY = y + meta.tileH - 1;
    var footer = (user.online !== -1) ? '[ON]' : system.datestr(user.laston);
    if (footer.length > meta.tileW) footer = footer.substr(0, meta.tileW);
    try { lf.gotoxy(x, footerY); lf.putmsg((selected ? '\x01h' : '') + footer + '\x01n'); } catch (e) { }
    // Hotspot mapping
    if (typeof console.add_hotspot === 'function' && index < 36) {
        var cmd = (index < 10) ? String(index) : String.fromCharCode('A'.charCodeAt(0) + (index - 10));
        for (var yy2 = 0; yy2 < meta.tileH; yy2++) {
            try { console.add_hotspot(cmd, false, x + lf.x - 1, x + lf.x + meta.tileW - 2, y + lf.y + yy2 - 1); } catch (e) { }
        }
        this._hotspotMap[cmd] = index;
    }
};

Users.prototype._drawStatus = function (msg) {
    if (!this.statusFrame) return;
    // Guard against uninitialized page/pageSize to prevent NaN
    if (typeof this.page !== 'number' || this.page < 0) this.page = 0;
    if (!this.pageSize || isNaN(this.pageSize)) this.pageSize = (this._tileMeta ? this._tileMeta.cols * this._tileMeta.rows : 0) || 1;
    var total = this._sortedFiltered ? this._sortedFiltered.length : this.users.length;
    var showingStart = this.page * this.pageSize + 1;
    var showingEnd = Math.min(total, showingStart + this.pageSize - 1);
    if (total === 0) { showingStart = 0; showingEnd = 0; }
    var info = (msg ? msg + '  ' : '') + 'Users ' + showingStart + '-' + showingEnd + '/' + total + '  Mode:' + this.whichUsers + '  Sort:' + (this.sortMode || '-') + '  Online:' + this.onlineUsers + '  (O=Toggle N=Name L=Last PgUp/PgDn=Page ENTER=Details Q=Quit)';
    if (info.length > this.statusFrame.width) info = info.substr(0, this.statusFrame.width);
    try { this.statusFrame.clear(); this.statusFrame.gotoxy(1, 1); this.statusFrame.putmsg(info); this.statusFrame.cycle(); } catch (e) { }
};

// Simple repeat helper
function repeat(n, ch) { var s = ''; while (n-- > 0) s += ch; return s; }

Users.prototype.handleKey = function (k) {
    if (!k) return;
    if (this._hotspotMap && this._hotspotMap[k] !== undefined) { this.selectedIndex = this._hotspotMap[k]; this.draw(); return; }
    switch (k) {
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'O': case 'o': this._toggleWhichUsers(); this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'N': case 'n': this.sortMode = 'N'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'L': case 'l': this.sortMode = 'L'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case KEY_LEFT: if (this.selectedIndex > 0) { this.selectedIndex--; this.draw(); } return;
        case KEY_RIGHT: if (this.selectedIndex < Math.min(this.pageSize - 1, (this._visibleUsers().length - 1))) { this.selectedIndex++; this.draw(); } return;
        case KEY_UP: {
            var meta = this._tileMeta; if (!meta) return; var target = this.selectedIndex - meta.cols; if (target >= 0) { this.selectedIndex = target; this.draw(); } return;
        }
        case KEY_DOWN: {
            var meta = this._tileMeta; if (!meta) return; var target = this.selectedIndex + meta.cols; if (target < Math.min(this.pageSize, this._visibleUsers().length)) { this.selectedIndex = target; this.draw(); } return;
        }
        case KEY_PGUP: if (this.page > 0) { this.page--; this.selectedIndex = 0; this.draw(); } return;
        case KEY_PGDN: {
            var total = this._sortedFiltered ? this._sortedFiltered.length : this._filterUsers().length;
            var maxPage = total ? Math.floor((total - 1) / this.pageSize) : 0;
            if (this.page < maxPage) { this.page++; this.selectedIndex = 0; this.draw(); }
            return;
        }
        case '\r': case '\n': this._openModalForSelected(); return;
    }
};

Users.prototype._openModalForSelected = function () {
    var vis = this._visibleUsers();
    if (!vis.length) return;
    var u = vis[this.selectedIndex];
    if (!u) return;
    this._openModal(u);
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
    this.modal = new Modal({
        type: 'custom',
        title: 'User Detail',
        message: placeholder, // minimal placeholder; we fully custom render
        parentFrame: this.parentFrame,
        overlay: false,
        width: FIXED_WIDTH,
        height: FIXED_HEIGHT,
        attr: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7),
        contentAttr: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7),
        buttonAttr: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7),
        buttons: [{ label: 'Close', value: true, default: true }],
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
    if (this._hotspotMap && this._hotspotMap[k] !== undefined) {
        this.selectedIndex = this._hotspotMap[k];
        this.draw();
        // Auto-open modal for hotspot activation
        this._openModalForSelected();
        return;
    }
    switch (k) {
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'O': case 'o': this._toggleWhichUsers(); this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'N': case 'n': this.sortMode = 'N'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case 'L': case 'l': this.sortMode = 'L'; this.page = 0; this.selectedIndex = 0; this.draw(); return;
        case KEY_LEFT: if (this.selectedIndex > 0) { this.selectedIndex--; this.draw(); } return;
        case KEY_RIGHT: if (this.selectedIndex < Math.min(this.pageSize - 1, (this._visibleUsers().length - 1))) { this.selectedIndex++; this.draw(); } return;
        case KEY_UP: {
            var meta = this._tileMeta; if (!meta) return; var target = this.selectedIndex - meta.cols; if (target >= 0) { this.selectedIndex = target; this.draw(); } return;
        }
        case KEY_DOWN: {
            var meta = this._tileMeta; if (!meta) return; var target = this.selectedIndex + meta.cols; if (target < Math.min(this.pageSize, this._visibleUsers().length)) { this.selectedIndex = target; this.draw(); } return;
        }
        case KEY_PGUP: if (this.page > 0) { this.page--; this.selectedIndex = 0; this.draw(); } return;
        case KEY_PGDN: {
            var total = this._sortedFiltered ? this._sortedFiltered.length : this._filterUsers().length;
            var maxPage = total ? Math.floor((total - 1) / this.pageSize) : 0;
            if (this.page < maxPage) { this.page++; this.selectedIndex = 0; this.draw(); }
            return;
        }
        case '\r': case '\n': this._openModalForSelected(); return;
    }
};

Users.prototype.cleanup = function () {
    if (typeof console.clear_hotspots === 'function') { try { console.clear_hotspots(); } catch (e) { } }
    try { if (this.listFrame) this.listFrame.close(); } catch (e) { }
    try { if (this.statusFrame) this.statusFrame.close(); } catch (e) { }
    try { if (this.modal && this.modal.frame) this.modal.frame.close(); } catch (e) { }
    this.listFrame = this.statusFrame = null; this.modal = null;
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

// Export
registerModuleExports({ Users: Users });
