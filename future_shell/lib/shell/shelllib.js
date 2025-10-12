
load("event-timer.js");
var ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -\/]*[@-~]/g;
try { load('future_shell/lib/effects/screensaver.js'); } catch (e) { }
// Performance instrumentation (optional)
try { load('future_shell/lib/util/perf.js'); } catch (e) { }

// IconShell prototype extensions for member logic
// Run time logic
// Add subprogram state to IconShell
IconShell.prototype.init = function () {
    dbug("Initialize icon shell 42A", "init")
    // === Instance state ===
    // Main root frame hierarchy (root/view/crumb)
    var initialDims = this._getConsoleDimensions();
    this._createShellFrames(initialDims);
    // Ensure view id generator exists BEFORE assigning any _viewId
    if (typeof this.generateViewId !== 'function') {
        this._viewSeq = 0;
        this.generateViewId = function () { return 'view_' + (++this._viewSeq); };
    }
    // Stack of folder nodes (for navigation)
    this.stack = [ICSH_CONFIG];
    // Ensure root node has a stable internal view id
    if (!ICSH_CONFIG._viewId) {
        ICSH_CONFIG._viewId = 'root';
        dbug('[init] Assigned root _viewId=root', 'nav');
    }
    // Current selection index (absolute, not relative to scroll)
    this.selection = 0;
    this._saverActive = false;
    this._pendingFolderRedraw = false;
    this._saverEpoch = 0;
    // Current icon grid (object with .cells, .cols, .rows)
    this.grid = null;
    // Current scroll offset (index of first visible item)
    this.scrollOffset = 0;
    // Set true if folder was changed and needs redraw
    this.folderChanged = false;
    // Last known screen size (for resize detection)
    this._lastConsoleDimensions = initialDims;
    this.lastCols = initialDims.cols;
    this.lastRows = initialDims.rows;
    // Current view ID (assigned lazily); using dynamic generator avoids coupling to config
    this.currentView = null; // set just-in-time (root assigned above)
    // Hotkey map for current view
    this.viewHotkeys = {};
    // Subprogram state: null or { name, handlers }
    this.activeSubprogram = null;
    // Track whether folder UI frames have been shelved (temporarily removed) for a subprogram
    this._folderShelved = false;
    // Mouse support detection
    this.mouseActive = this.detectMouseSupport();
    // Toast tracking
    this.toasts = [];
    // Track reserved hotspot commands so we avoid collisions
    this._reservedHotspotCommands = {};
    if (typeof ICSH_HOTSPOT_FILL_CMD === 'string' && ICSH_HOTSPOT_FILL_CMD.length === 1) {
        this._reservedHotspotCommands[ICSH_HOTSPOT_FILL_CMD] = true;
    }
    // Screensaver hotspot state
    this._screensaverDismissCmd = this._reserveHotspotCmd('\u0007');
    this._screensaverHotspotActive = false;
    this._lastChatPollTs = 0;
    this._lastWasCR = false;
    this._lastKeyTimestamp = 0;
    this.keyStrokeTimeoutMs = 1000;
    this._chatPollEvent = null;
    this._subprogramCycleEvent = null;
    this._inactivityEvent = null;
    this._toastCycleEvent = null;
    this._folderFlushEvent = null;
    // Explicit modal tracking (replaces blind static dispatch). Stack is LIFO.
    this._modalStack = [];
    // Publish active shell instance globally for modal registration without circular import.
    try {
        global.__ICSH_ACTIVE_SHELL__ = this;
        if (typeof globalThis !== 'undefined') globalThis.__ICSH_ACTIVE_SHELL__ = this;
    } catch (_) { }
    // === End instance state ===
    // Inactivity tracking for background effects
    this._lastActivityTs = Date.now();
    // Configure inactivity threshold from ICSH_SETTINGS (seconds) if available.
    var _secs = (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS && typeof ICSH_SETTINGS.inactivitySeconds === 'number') ? ICSH_SETTINGS.inactivitySeconds : 180;
    if (_secs === -1) this.inactivityThresholdMs = -1; // disabled
    else this.inactivityThresholdMs = Math.max(0, _secs) * 1000;
    // Persistent chat backend (JSONChat)
    var usernum = (typeof user !== 'undefined' && user.number) ? user.number : 1;
    var host = bbs.sys_inetaddr || "127.0.0.1";
    var port = 10088; // Adjust as needed
    var jsonclient = new JSONClient(host, port);
    this.jsonchat = new JSONChat(usernum, jsonclient, host, port);
    this.jsonchat.join("main");
    // Wrap update() to log incoming messages for notification/debugging

    this.chatNotifications = [];
    // Chat subprogram gets reference to persistent backend
    this.chat = new Chat(this.jsonchat);
    var origUpdate = this.jsonchat.update;
    var self = this;
    this.jsonchat.update = function (packet) {
        self._processChatUpdate(packet);
        return origUpdate.call(this, packet);
    }

    // Inject Timer for periodic chat redraw
    if (typeof Timer === 'function') {
        log("Creating timer");
        this.timer = new Timer();
        this._chatRedrawEvent = this.timer.addEvent(60000, true, function () {
            if (self.activeSubprogram && typeof self.activeSubprogram.updateChat === 'function') {
                self.activeSubprogram.updateChat();
            }
        }); // 60 seconds
        this._resizePollEvent = this.timer.addEvent(3000, true, function () {
            self._checkConsoleResize();
        });
        this._nodeMsgEvent = this.timer.addEvent(5000, true, function () {
            try {
                var toastMsg;
                var type;
                // AI do not change this line. there is no space between .misc&NODE_MSGW by design.
                if (system.node_list[bbs.node_num - 1].misc & NODE_MSGW) {
                    var msg = system.get_telegram(user.number);
                    toastMsg = { message: msg.replace(/\r\n$/, '') }
                    type = 'telegram';
                }
                // AI do not change this line. there is no space between .misc&NODE_MSGW by design.
                if (system.node_list[bbs.node_num - 1].misc & NODE_NMSG) {
                    var msg = system.get_node_message(bbs.node_num);
                    toastMsg = { message: msg.replace(/\r\n$/, '') }
                    type = 'node';
                }
                if (!toastMsg) return;
                var trimmed = (toastMsg.message != null ? String(toastMsg.message) : '').replace(ANSI_ESCAPE_RE, '');
                if (!trimmed.length) return;
                log("Showing toast: " + trimmed);
                self.showToast({ title: type === 'telegram' ? "Incoming message" : "Alert", message: trimmed, height: 6, timeout: 8000 });
            } catch (e) { dbug('node toast error: ' + e, 'toast'); }
        });
        this._chatPollEvent = this.timer.addEvent(1000, true, function () {
            self._pollChatBackend();
        });
        this._subprogramCycleEvent = this.timer.addEvent(50, true, function () {
            self._cycleActiveSubprogram();
        });
        this._inactivityEvent = this.timer.addEvent(1000, true, function () {
            self._handleInactivity(Date.now());
        });
        this._toastCycleEvent = this.timer.addEvent(300, true, function () {
            self._cycleToasts();
        });
        this._folderFlushEvent = this.timer.addEvent(300, true, function () {
            self._flushPendingFolderRedraw();
        });
    }

    // Assign hotkeys for root view
    // Set currentView explicitly to root's id before assigning hotkeys
    this.currentView = ICSH_CONFIG._viewId;
    this.assignViewHotkeys(ICSH_CONFIG.children);
    if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
    // Background matrix rain effect (behind content)
    // NOTE: Do NOT start immediately; main loop will start it after inactivity threshold.
    if (typeof ShellScreenSaver === 'function') {
        var saverConfig = (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS && ICSH_SETTINGS.screensaver) ? ICSH_SETTINGS.screensaver : {};
        this._screenSaver = new ShellScreenSaver({
            shell: this,
            getFrame: this._resolveScreensaverFrame.bind(this),
            config: saverConfig
        });
        if (this.timer) this._screenSaver.attachTimer(this.timer);
        this._refreshScreenSaverFrame();
    }
    // Enable mouse mode for hotspots
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
};

// Main loop: delegate to subprogram if active
IconShell.prototype.main = function () {
    try {
        while (!js.terminated) {
            var keys = [];
            var key;
            while ((key = console.inkey(K_NOECHO | K_NOSPIN, 0))) {
                keys.push(key);
            }
            if (keys.length) {
                var nowTs = Date.now();
                if (global.__ICSH_PERF__) {
                    try { global.__ICSH_PERF__.tick(); } catch (_) { }
                }
                this._processKeyQueue(keys, nowTs);
            }
            if (this._pendingSubLaunch) this._processPendingSubLaunch();
            if (this.timer) {
                var elapsed = this._lastKeyTimestamp ? (Date.now() - this._lastKeyTimestamp) : Infinity;
                if (elapsed >= this.keyStrokeTimeoutMs) this.timer.cycle();
            }
            yield(true);
        }
    } finally {
        this._cleanupMainLoop();
    }
};

// Refactor processKeyboardInput to not call changeFolder() with no argument
IconShell.prototype.processKeyboardInput = function (ch) {
    dbug('Shell processing keyboard input:' + JSON.stringify(ch), 'keylog');
    if (this.activeSubprogram && this.activeSubprogram.running === false) {
        dbug('Releasing inactive subprogram before handling key', 'subprogram');
        this.exitSubprogram();
    }
    // Ignore filler hotspot command (used to swallow empty grid area clicks)
    if (typeof ICSH_HOTSPOT_FILL_CMD !== 'undefined' && ch === ICSH_HOTSPOT_FILL_CMD) return true;
    if (ch === this._screensaverDismissCmd) {
        log('dismissing screensaver due to hotspot click');
        if (this._stopScreenSaver()) {
            if (this.activeSubprogram && typeof this.activeSubprogram.resumeForReason === 'function') {
                this.activeSubprogram.resumeForReason('screensaver_off');
            }
            if (this.activeSubprogram && typeof this.activeSubprogram.draw === 'function') {
                this.activeSubprogram.draw();
            } else if (!this.activeSubprogram || !this.activeSubprogram.running) {
                this.drawFolder();
            }
        }
        return true;
    }
    // If any toasts are active, ESC dismisses the oldest
    if (this.toasts && this.toasts.length > 0) {
        var toast = this.toasts[0];
        if (toast && typeof toast.dismiss === 'function') toast.dismiss();
        return true;
    }
    if (this.activeSubprogram) {
        this._handleSubprogramKey(ch);
        return;
    }
    if (this._handleNavigationKey(ch)) return true;
    if (this._handleHotkeyAction(ch)) return true;
    if (this._handleHotkeyItemSelection(ch)) return true;
    return false;
};

IconShell.prototype._processChatUpdate = function (packet) {
    dbug("_processChatUpdate(): " + JSON.stringify(packet), "chat");
    // someone is sending a message
    if (packet && packet.oper && packet.oper.toUpperCase() === "WRITE") {
        dbug(!!this.activeSubprogram + "Incoming chat messageABC: " + JSON.stringify(packet), "chat");
        // If not in chat subprogram, show toast
        if (!this.activeSubprogram || this.activeSubprogram !== this.chat) {
            // Only show if message has text
            if (packet.data && packet.data.str) {
                this.showToast({
                    message: packet.data.nick.name + ': ' + packet.data.str,
                    avatar: { username: packet.data.nick.name, netaddr: packet.data.nick.host },
                    title: packet.data.nick.name
                });
            }
        }
        // print the message to the chat subprogram if active
        if (this.activeSubprogram && typeof this.activeSubprogram.updateChat === 'function') {
            this.activeSubprogram.updateChat(packet.data);
        }
    }
    // someone has joined
    if (packet && packet.oper && packet.oper.toUpperCase() === "SUBSCRIBE") {
        this.showToast({
            message: packet.data.nick + ' from ' + packet.data.system + " is here.",
            avatar: { username: packet.data.nick, netaddr: packet.data.system },
            title: packet.data.nick
        });
    }
    if (packet && packet.oper && packet.oper.toUpperCase() === "UNSUBSCRIBE") {
        this.showToast({
            message: packet.data.nick + ' from ' + packet.data.system + " has left.",
            avatar: { username: packet.data.nick, netaddr: packet.data.system },
            title: packet.data.nick
        });
    }

};

IconShell.prototype._getConsoleDimensions = function () {
    var cols = null;
    var rows = null;
    if (typeof console !== 'undefined') {
        if (typeof console.ansi_getdims === 'function') {
            try {
                var dims = console.ansi_getdims();
                if (dims) {
                    if (typeof dims.cols === 'number' && dims.cols > 0) cols = dims.cols;
                    else if (typeof dims.width === 'number' && dims.width > 0) cols = dims.width;
                    if (typeof dims.rows === 'number' && dims.rows > 0) rows = dims.rows;
                    else if (typeof dims.height === 'number' && dims.height > 0) rows = dims.height;
                }
            } catch (e) { dbug('[resize] ansi_getdims error: ' + e, 'resize'); }
        }
        if (cols === null && typeof console.screen_columns === 'number' && console.screen_columns > 0) cols = console.screen_columns;
        if (rows === null && typeof console.screen_rows === 'number' && console.screen_rows > 0) rows = console.screen_rows;
    }
    if (cols === null) cols = 80;
    if (rows === null) rows = 24;
    return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
};

IconShell.prototype._disposeShellFrames = function () {
    try { this._removeScreensaverHotspot(); } catch (e) { }
    this._screensaverHotspotActive = false;
    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    if (typeof this._closePreviousFrames === 'function') this._closePreviousFrames();
    if (this.mouseIndicator && typeof this.mouseIndicator.close === 'function') {
        try { this.mouseIndicator.close(); } catch (e) { }
    }
    if (this.crumb && typeof this.crumb.close === 'function') {
        try { this.crumb.close(); } catch (e) { }
    }
    if (this.view && typeof this.view.close === 'function') {
        try { this.view.close(); } catch (e) { }
    }
    if (this.root && typeof this.root.close === 'function') {
        try { this.root.close(); } catch (e) { }
    }
    this.mouseIndicator = null;
    this.crumb = null;
    this.view = null;
    this.root = null;
    this.grid = null;
    this.subFrame = null;
};

IconShell.prototype._createShellFrames = function (dims) {
    dims = dims || this._getConsoleDimensions();
    var cols = Math.max(1, dims.cols);
    var rows = Math.max(1, dims.rows);
    this.root = new Frame(1, 1, cols, rows, ICSH_VALS.ROOT.BG | ICSH_VALS.ROOT.FG);
    this.root.open();
    var viewH = Math.max(1, rows - 1);
    this.view = new Frame(1, 1, cols, viewH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.root);
    this.view.open();
    var crumbY = rows;
    if (crumbY < 1) crumbY = 1;
    this.crumb = new Frame(1, crumbY, cols, 1, ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG, this.root);
    this.crumb.open();
    this.subFrame = this.view;
    this.mouseIndicator = null;
    if (typeof console !== 'undefined' && typeof console.mouse_mode !== 'undefined') {
        console.mouse_mode = !!this.mouseActive;
    }
};

IconShell.prototype._handleConsoleResize = function (dims) {
    dims = dims || this._getConsoleDimensions();
    dbug('[resize] detected console resize to ' + dims.cols + 'x' + dims.rows, 'resize');
    this._disposeShellFrames();
    this._createShellFrames(dims);
    this._lastConsoleDimensions = { cols: dims.cols, rows: dims.rows };
    this.lastCols = dims.cols;
    this.lastRows = dims.rows;
    if (this._screenSaver) {
        this._screenSaver.refreshFrame();
        if (this._screenSaver.isActive()) {
            this._activateScreensaverHotspot();
        }
    }
    if (this.activeSubprogram && this.activeSubprogram.running) {
        if (typeof this.activeSubprogram.setParentFrame === 'function') {
            try { this.activeSubprogram.setParentFrame(this.subFrame || this.view); } catch (e) { dbug('[resize] subprogram setParentFrame error: ' + e, 'resize'); }
        }
        if (typeof this.activeSubprogram.onShellResize === 'function') {
            try { this.activeSubprogram.onShellResize(dims); } catch (e2) { dbug('[resize] subprogram onShellResize error: ' + e2, 'resize'); }
        } else if (typeof this.activeSubprogram.refresh === 'function') {
            try { this.activeSubprogram.refresh(); } catch (e3) { dbug('[resize] subprogram refresh error: ' + e3, 'resize'); }
        } else if (typeof this.activeSubprogram.draw === 'function') {
            try { this.activeSubprogram.draw(); } catch (e4) { dbug('[resize] subprogram draw error: ' + e4, 'resize'); }
        }
        return;
    }
    this.drawFolder();
};

IconShell.prototype._resolveScreensaverFrame = function () {
    if (this.activeSubprogram && typeof this.activeSubprogram.backgroundFrame === 'function') {
        try {
            var frame = this.activeSubprogram.backgroundFrame();
            if (frame && frame.is_open !== false) return frame;
        } catch (e) { dbug('screensaver backgroundFrame error: ' + e, 'screensaver'); }
    }
    var viewFrame = this.view;
    if (!viewFrame || (typeof viewFrame.is_open !== 'undefined' && !viewFrame.is_open)) {
        try { this.recreateFramesIfNeeded(); } catch (e) { dbug('screensaver frame recreate error: ' + e, 'screensaver'); }
        viewFrame = this.view;
        if (!viewFrame || (typeof viewFrame.is_open !== 'undefined' && !viewFrame.is_open)) {
            try { this.drawFolder(); } catch (e2) { dbug('screensaver frame draw error: ' + e2, 'screensaver'); }
            viewFrame = this.view;
        }
    }
    if (!viewFrame || (typeof viewFrame.is_open !== 'undefined' && !viewFrame.is_open)) {
        return this.root && (typeof this.root.is_open === 'undefined' || this.root.is_open) ? this.root : null;
    }
    return viewFrame;
};

IconShell.prototype._refreshScreenSaverFrame = function () {
    if (!this._screenSaver) return;
    this._screenSaver.refreshFrame();
};

IconShell.prototype._pollChatBackend = function (nowTs) {
    if (!this.jsonchat) return;
    var ts = nowTs || Date.now();
    if (this._lastChatPollTs && (ts - this._lastChatPollTs) < 1000) return;
    this._lastChatPollTs = ts;
    try { this.jsonchat.cycle(); } catch (e) { dbug('jsonchat cycle error: ' + e, 'chat'); }
};

IconShell.prototype._cycleActiveSubprogram = function () {
    if (this._saverActive) return;
    this.recreateFramesIfNeeded();
    if (this.activeSubprogram && typeof this.activeSubprogram.cycle === 'function') {
        try { this.activeSubprogram.cycle(); } catch (e) { dbug('subprogram cycle error: ' + e, 'subprogram'); }
    }
    if (this._screenSaver && this._screenSaver.isActive()) this._screenSaver.pump();
};

IconShell.prototype._processPendingSubLaunch = function () {
    if (!this._pendingSubLaunch) return;
    var pending = this._pendingSubLaunch;
    delete this._pendingSubLaunch;
    this.launchSubprogram(pending.name, pending.instance);
};

IconShell.prototype._normalizeKey = function (key) {
    if (key === '\r') {
        this._lastWasCR = true;
        return key;
    }
    if (this._lastWasCR && key === '\n') {
        this._lastWasCR = false;
        return '';
    }
    this._lastWasCR = false;
    return key;
};

IconShell.prototype._processKeyQueue = function (keys, nowTs) {
    if (!keys || !keys.length) return;
    var perf = global.__ICSH_PERF__ || null;
    if (!nowTs) nowTs = Date.now();
    if (perf) {
        if (perf.lastKeyTs) {
            var gap = nowTs - perf.lastKeyTs;
            if (gap > perf.maxKeyGap) perf.maxKeyGap = gap;
        }
        perf.lastKeyTs = nowTs;
        perf.keyEvents += keys.length;
        if (keys.length > 50) perf.keyBurstDrops++;
    }
    while (keys.length) {
        var key = keys.shift();
        if (key === undefined || key === null) continue;
        key = this._normalizeKey(key);
        try {
            if (typeof ICSH_MODAL_DEBUG !== 'undefined' && ICSH_MODAL_DEBUG && key !== '') {
                var code = (typeof key === 'string' && key.length) ? key.charCodeAt(0) : key;
                log('[GLOBAL normalized key] repr=' + JSON.stringify(key) + ' code=' + code);
            }
        } catch (_) { }
        if (!key) continue;
        if (typeof key === 'string' && key.length > 0) {
            if (key === CTRL_D && perf) {
                perf.dump();
                continue;
            }
            this._lastActivityTs = nowTs;
            if (this._stopScreenSaver()) {
                if (this.activeSubprogram && typeof this.activeSubprogram.resumeForReason === 'function') {
                    this.activeSubprogram.resumeForReason('screensaver_off');
                }
                if (this.activeSubprogram && typeof this.activeSubprogram.draw === 'function') this.activeSubprogram.draw();
                else if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
                continue;
            }
        }
        this._lastKeyTimestamp = nowTs;
        // Modal interception via explicit shell-managed stack (only if top modal wants capture)
        var topModal = this.activeModal && this.activeModal();
        if (topModal && topModal.captureKeys) {
            if (this._dispatchModalKey(key)) continue;
        }
        this.processKeyboardInput(key);
    }
};

// Modal integration hooks (called from modal.js when a modal registers/unregisters)
IconShell.prototype._modalRegistered = function (modal) {
    if (!modal) return;
    this._modalStack.push(modal);
};

IconShell.prototype._modalUnregistered = function (modal) {
    if (!modal) return;
    for (var i = this._modalStack.length - 1; i >= 0; i--) {
        if (this._modalStack[i] === modal) {
            this._modalStack.splice(i, 1);
            break;
        }
    }
};

IconShell.prototype._dispatchModalKey = function (key) {
    if (!this._modalStack.length) return false;
    var top = this._modalStack[this._modalStack.length - 1];
    if (!top || typeof top.handleKey !== 'function') return false;
    return top.handleKey(key) === true;
};

IconShell.prototype.hasActiveModal = function () {
    for (var i = this._modalStack.length - 1; i >= 0; i--) {
        var m = this._modalStack[i];
        if (m && m._open) return true;
    }
    return false;
};

IconShell.prototype.activeModal = function () {
    for (var i = this._modalStack.length - 1; i >= 0; i--) {
        var m = this._modalStack[i];
        if (m && m._open) return m;
    }
    return null;
};

IconShell.prototype.setModalCapture = function (modal, capture) {
    if (!modal) return;
    try { modal.captureKeys = !!capture; } catch (_) { }
};

IconShell.prototype._handleInactivity = function (nowTs) {
    if (!this._screenSaver || this._screenSaver.isActive()) return;
    if (this.inactivityThresholdMs === -1) return;
    var sub = this.activeSubprogram;
    var blockSaver = sub && (sub.blockScreensaver === true || sub.blockScreenSaver === true);
    if (blockSaver) return;
    if (nowTs - this._lastActivityTs <= this.inactivityThresholdMs) return;
    if (sub && typeof sub.pauseForReason === 'function') {
        try { sub.pauseForReason('screensaver_on'); } catch (e) { dbug('pauseForReason error: ' + e, 'screensaver'); }
    }
    if (this._startScreenSaver()) this._activateScreensaverHotspot();
};

IconShell.prototype._cycleToasts = function () {
    if (!this.toasts || !this.toasts.length) return;
    for (var i = 0; i < this.toasts.length; i++) {
        var toast = this.toasts[i];
        if (toast && typeof toast.cycle === 'function') {
            try { toast.cycle(); } catch (e) { dbug('toast cycle error: ' + e, 'toast'); }
        }
    }
};

IconShell.prototype._flushPendingFolderRedraw = function () {
    if (this._saverActive || !this._pendingFolderRedraw) return;
    this._pendingFolderRedraw = false;
    if (this.activeSubprogram && this.activeSubprogram.running) {
        if (typeof this.activeSubprogram.draw === 'function') {
            try { this.activeSubprogram.draw(); } catch (e) { dbug('post-saver subprogram draw error: ' + e, 'ambient'); }
        }
    } else {
        try { this.drawFolder(true); } catch (e2) { dbug('post-saver folder redraw error: ' + e2, 'ambient'); }
    }
};
IconShell.prototype._checkConsoleResize = function () {
    if (this._pendingSubLaunch) return;
    var dims = this._getConsoleDimensions();
    var last = this._lastConsoleDimensions;
    if (!last || dims.cols !== last.cols || dims.rows !== last.rows) {
        this._handleConsoleResize(dims);
    }
};

IconShell.prototype._reserveHotspotCmd = function (preferred) {
    if (!this._reservedHotspotCommands) this._reservedHotspotCommands = {};
    var taken = this._reservedHotspotCommands;
    var forbidden = {};
    if (typeof ICSH_HOTSPOT_FILL_CMD === 'string' && ICSH_HOTSPOT_FILL_CMD.length === 1) {
        forbidden[ICSH_HOTSPOT_FILL_CMD] = true;
    }
    function available(ch) {
        return !taken[ch] && !forbidden[ch];
    }
    if (available(preferred)) {
        taken[preferred] = true;
        return preferred;
    }
    var candidates = [
        '\u0002', '\u0003', '\u0004', '\u0005', '\u0006', '\u000E', '\u000F',
        '\u0010', '\u0011', '\u0012', '\u0013', '\u0014', '\u0015', '\u0016', '\u0017',
        '\u0018', '\u0019', '\u001A', '\u001C', '\u001D', '\u001E', '\u001F'
    ];
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        if (available(candidate)) {
            taken[candidate] = true;
            return candidate;
        }
    }
    for (var code = 33; code <= 126; code++) {
        var ch = String.fromCharCode(code);
        if (/[A-Za-z0-9]/.test(ch)) continue;
        if (available(ch)) {
            taken[ch] = true;
            return ch;
        }
    }
    taken[preferred] = true;
    return preferred;
};

IconShell.prototype._handleSubprogramKey = function (ch) {
    dbug("received key " + ch + " to proxy to active subprogram", "subprogram");
    if (typeof this.activeSubprogram.handleKey === 'function') {
        dbug("subprogram has handleKey() function", "subprogram");
        this.activeSubprogram.handleKey(ch);
    }
};

IconShell.prototype._handleNavigationKey = function (ch) {
    // Defensive: ensure selection/index not out of sync with current visible items (especially root view)
    try {
        var node = this.stack[this.stack.length - 1];
        var items = node && node.children ? node.children : [];
        if (this.selection < 0) this.selection = 0;
        if (this.selection >= items.length) this.selection = items.length ? items.length - 1 : 0;
    } catch (e) { }
    switch (ch) {
        case KEY_LEFT: this.moveSelection(-1, 0); return true;
        case KEY_RIGHT: this.moveSelection(1, 0); return true;
        case KEY_UP: this.moveSelection(0, -1); return true;
        case KEY_DOWN: this.moveSelection(0, 1); return true;
        case '\r': // ENTER
            this.openSelection();
            return true;
        case '\x1B': // ESC: up a level (if possible)
            if (this.stack.length > 1) {
                this.changeFolder(null, { direction: 'up' });
                if (this.folderChanged) {
                    this.folderChanged = false;
                    if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
                }
            }
            return true;
        default:
            return false;
    }
};

IconShell.prototype._handleHotkeyAction = function (ch) {
    var viewId = this.currentView || (this.generateViewId ? this.generateViewId() : "root");
    var hotkeyMap = this.viewHotkeys[viewId] || {};
    dbug("Checking view " + viewId + " hot keys." + JSON.stringify(hotkeyMap), "hotkeys");
    var action = hotkeyMap[ch];
    if (typeof action === 'function') {
        dbug("Executing hotkey action for " + ch + " in view " + viewId, "hotkeys");
        action();
        if (this.folderChanged) {
            this.folderChanged = false;
            if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
        }
        return true;
    }
    return false;
};

IconShell.prototype._handleHotkeyItemSelection = function (ch) {
    var node = this.stack[this.stack.length - 1];
    var items = node.children ? node.children.slice() : [];
    if (this.stack.length > 1) {
        items.unshift({ label: "..", type: "item", hotkey: "\x1B", iconFile: "back" });
    }
    var iconW = 12, iconH = 6, labelH = 1, cellW = iconW + 2, cellH = iconH + labelH + 2;
    var cols = Math.max(1, Math.floor(this.view.width / cellW));
    var rows = Math.max(1, Math.floor(this.view.height / cellH));
    var maxIcons = cols * rows;
    var visibleItems = items.slice(this.scrollOffset, this.scrollOffset + maxIcons);
    for (var i = 0; i < visibleItems.length; i++) {
        var item = visibleItems[i];
        if (item.hotkey && ch === item.hotkey) {
            dbug(item.hotkey + ":" + item.label, "hotkeys");
            this.selection = this.scrollOffset + i;
            this.openSelection();
            if (this.folderChanged) {
                this.folderChanged = false;
                if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
            }
            return true;
        }
    }
    return false;
};

// Detect if the terminal supports mouse events
IconShell.prototype.detectMouseSupport = function () {
    // 1. Check user.settings for USER_MOUSE if available
    if (typeof user !== 'undefined' && typeof USER_MOUSE !== 'undefined' && (user.settings & USER_MOUSE)) {
        return true;
    }
    // TODO: 2. Fallback: check runtime terminal support for mouse flags
    // var mouseFlags = [MOUSE_MODE_NORM, MOUSE_MODE_X10, MOUSE_MODE_ANY, MOUSE_MODE_BTN, MOUSE_MODE_EXT];
    // for (var i = 0; i < mouseFlags.length; i++) {
    //     if (typeof mouseFlags[i] !== 'undefined' && console.term_supports && console.term_supports(mouseFlags[i])) {
    //         log('Mouse support detected via console.term_supports: ' + mouseFlags[i]);
    //         return true;
    //     }
    // }
    return false;
};

IconShell.prototype._startScreenSaver = function () {
    if (!this._screenSaver) return false;
    if (this._screenSaver.isActive()) return false;
    var sub = this.activeSubprogram;
    if (sub && (sub.blockScreensaver === true || sub.blockScreenSaver === true)) return false;
    return this._screenSaver.activate();
};

IconShell.prototype._stopScreenSaver = function () {
    if (!this._screenSaver || !this._screenSaver.isActive()) return false;
    this._screenSaver.deactivate();
    this._removeScreensaverHotspot();
    return true;
};

IconShell.prototype._activateScreensaverHotspot = function () {
    if (this._screensaverHotspotActive) return;
    if (typeof console.add_hotspot !== 'function') return;

    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    else if (typeof console.clear_hotspots === 'function') console.clear_hotspots();

    var root = this.root;
    var startX = root ? root.x : 1;
    var startY = root ? root.y : 1;
    var width = root ? root.width : console.screen_columns;
    var height = root ? root.height : console.screen_rows;
    var endX = startX + Math.max(0, width - 1);
    var cmd = this._screensaverDismissCmd || '__ICSH_SAVER__';

    for (var y = startY; y < startY + height; y++) {
        try { console.add_hotspot(cmd, true, startX, endX, y); } catch (e) { }
    }

    this._screensaverHotspotActive = true;
};

IconShell.prototype._removeScreensaverHotspot = function () {
    if (!this._screensaverHotspotActive) return;
    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    else if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
    this._screensaverHotspotActive = false;
};

IconShell.prototype.showToast = function (params) {
    var self = this;
    var opts = params || {};
    opts.parentFrame = this.root;
    opts.onDone = function (t) {
        var idx = self.toasts.indexOf(t);
        if (idx !== -1) self.toasts.splice(idx, 1);
    };
    var toast = new Toast(opts);
    this.toasts.push(toast);
    return toast;
};


// ADD (or adjust) ambient manager instantiation to pass shell reference (if done elsewhere, keep single instance)
IconShell.prototype._initAmbient = function () {
    if (this._ambientConfig) {
        try {
            var ambOpts = {
                random: this._ambientConfig.random,
                switch_interval: this._ambientConfig.switch_interval,
                fps: this._ambientConfig.fps,
                clear_on_switch: this._ambientConfig.clear_on_switch,
                animationOptions: this._ambientConfig.animationOptions,
                shell: this
            };
            // Expect ambientFrame prepared elsewhere; fallback to view.
            ambOpts.frame = this.ambientFrame || this.view;
            this._ambient = new ShellAmbientManager(ambOpts.frame, ambOpts);
            // (Registration of specific animations remains where you had it.)
        } catch (e) {
            dbug('ambient init error: ' + e, 'ambient');
        }
    }
};

// HOOK: start/stop callbacks (called by ambient manager)
IconShell.prototype._onAmbientStart = function () {
    this._saverActive = true;
    this._saverEpoch++;
    this._pendingFolderRedraw = true; // mark that when saver ends we redraw cleanly
};

IconShell.prototype._onAmbientStop = function () {
    this._saverActive = false;
    this._saverEpoch++;
    this._pendingFolderRedraw = true;
};

// WRAP drawFolder to suppress during saver unless forced
if (!IconShell.prototype._drawFolderOrig) {
    IconShell.prototype._drawFolderOrig = IconShell.prototype.drawFolder;
    IconShell.prototype.drawFolder = function (force) {
        if (this._saverActive && !force) {
            this._pendingFolderRedraw = true;
            return;
        }
        return this._drawFolderOrig.apply(this, arguments);
    };
}
IconShell.prototype._cleanupMainLoop = function () {
    if (this._chatRedrawEvent && this._chatRedrawEvent.abort !== undefined) this._chatRedrawEvent.abort = true;
    if (this._resizePollEvent && this._resizePollEvent.abort !== undefined) this._resizePollEvent.abort = true;
    if (this._chatPollEvent && this._chatPollEvent.abort !== undefined) this._chatPollEvent.abort = true;
    if (this._subprogramCycleEvent && this._subprogramCycleEvent.abort !== undefined) this._subprogramCycleEvent.abort = true;
    if (this._inactivityEvent && this._inactivityEvent.abort !== undefined) this._inactivityEvent.abort = true;
    if (this._toastCycleEvent && this._toastCycleEvent.abort !== undefined) this._toastCycleEvent.abort = true;
    if (this._folderFlushEvent && this._folderFlushEvent.abort !== undefined) this._folderFlushEvent.abort = true;
    this._chatRedrawEvent = this._resizePollEvent = this._nodeMsgEvent = null;
    this._chatPollEvent = this._subprogramCycleEvent = this._inactivityEvent = null;
    this._toastCycleEvent = this._folderFlushEvent = null;
    this._stopScreenSaver();
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
};
