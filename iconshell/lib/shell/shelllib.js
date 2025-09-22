
load("event-timer.js");
try { load('iconshell/lib/effects/matrix_rain.js'); } catch(e) {}

// IconShell prototype extensions for member logic
// Run time logic
// Add subprogram state to IconShell
IconShell.prototype.init = function() {
    dbug("Initialize icon shell 42A","init")
    // === Instance state ===
    // Main root frame hierarchy (root/view/crumb)
    var initialDims = this._getConsoleDimensions();
    this._createShellFrames(initialDims);
    // Ensure view id generator exists BEFORE assigning any _viewId
    if (typeof this.generateViewId !== 'function') {
        this._viewSeq = 0;
        this.generateViewId = function() { return 'view_' + (++this._viewSeq); };
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
    this._mailHotspotCmd = this._reserveHotspotCmd('z');
    // === End instance state ===
    // Inactivity tracking for background effects
    this._lastActivityTs = Date.now();
    // Configure inactivity threshold from ICSH_SETTINGS (minutes) if available.
    var _mins = (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS && typeof ICSH_SETTINGS.inactivityMinutes === 'number') ? ICSH_SETTINGS.inactivityMinutes : 3;
    if(_mins === -1) this.inactivityThresholdMs = -1; // disabled
    else this.inactivityThresholdMs = Math.max(0, _mins) * 60000;
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
    this.jsonchat.update = function(packet) {
        self._processChatUpdate(packet);
        return origUpdate.call(this, packet);
    }

    // Inject Timer for periodic chat redraw
    if (typeof Timer === 'function') {
        log("Creating timer");
        this.timer = new Timer();
        this._chatRedrawEvent = this.timer.addEvent(60000, true, function() {
            if (self.activeSubprogram && typeof self.activeSubprogram.updateChat === 'function') {
                self.activeSubprogram.updateChat();
            }
        }); // 60 seconds
        // If matrix rain already instantiated, attach it to the shared timer
        if(this._matrixRain && typeof this._matrixRain.attachTimer === 'function'){
            this._matrixRain.attachTimer(this.timer);
        }
        this._resizePollEvent = this.timer.addEvent(3000, true, function() {
            self._checkConsoleResize();
        });
    }

    // Assign hotkeys for root view
    // Set currentView explicitly to root's id before assigning hotkeys
    this.currentView = ICSH_CONFIG._viewId;
    this.assignViewHotkeys(ICSH_CONFIG.children);
    if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
    // Background matrix rain effect (behind content)
    // NOTE: Do NOT start immediately; main loop will start it after inactivity threshold.
    if (typeof MatrixRain === 'function') {
        this._matrixRain = new MatrixRain({ parent: this.view, deterministic: true });
        this._updateMatrixRainParent();
        // Defer start; will activate after inactivity.
    }
    // Enable mouse mode for hotspots
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
};

// Main loop: delegate to subprogram if active
IconShell.prototype.main = function() {
    try {
        while (!js.terminated) {
            this.recreateFramesIfNeeded();
            // Always cycle chat backend for notifications
            if (this.jsonchat) {
                this.jsonchat.cycle();
                // TODO: notification logic (step 4)
            }
            // Background rain animation cycle (only if no timer event attached)
            if(this._matrixRain && this._matrixRain.running && !this._matrixRain._timerEvent){
                this._matrixRain.cycle();
            }
            if(this.timer){
                this.timer.cycle();
            } else {
                this._checkConsoleResize();
            }
            if (this.activeSubprogram && typeof this.activeSubprogram.cycle === 'function') {
                this.activeSubprogram.cycle();
            }
            // If a subprogram launch was queued, process it now (after previous key fully handled)
            if (this._pendingSubLaunch) {
                var p = this._pendingSubLaunch; delete this._pendingSubLaunch;
                this.launchSubprogram(p.name, p.instance);
            }
            // Non-blocking input: shorter timeout when rain active for faster responsiveness
            var _pollMs = (this._matrixRain && this._matrixRain.running) ? 40 : 100;
            var key = console.inkey(K_NOECHO|K_NOSPIN, 100);
            // Normalize CRLF: if CR received, peek for immediate LF next loop; treat as single ENTER
            if (key === '\r') {
                this._lastWasCR = true;
            } else if (this._lastWasCR && key === '\n') {
                // Swallow the LF partner
                this._lastWasCR = false;
                dbug('Swallowed LF following CR', 'keylog');
                continue;
            } else {
                this._lastWasCR = false;
            }
            if (typeof key === 'string' && key.length > 0) {
                dbug("Key:" + JSON.stringify(key), "keylog");
                // User activity resets inactivity timer and stops rain if active
                this._lastActivityTs = Date.now();

                if(this._matrixRain && this._matrixRain.running){
                    // Stop rain without an immediate full-frame clear (expensive & causes lag).
                    // Foreground redraw overwrites rain cells.
                        if(typeof this._matrixRain.requestInterrupt === 'function') this._matrixRain.requestInterrupt();
                    this._matrixRain.stop();
                    this._removeScreensaverHotspot();
                    if(this.activeSubprogram && typeof this.activeSubprogram.resumeForReason === 'function'){
                        this.activeSubprogram.resumeForReason('screensaver_off');
                    }
                    if(this.activeSubprogram && typeof this.activeSubprogram.draw==='function') this.activeSubprogram.draw();
                    else if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
                }
            }
            if(key) this.processKeyboardInput(key);
            // Inactivity trigger (disabled if inactivityThresholdMs === -1)
            if(this._matrixRain && !this._matrixRain.running && this.inactivityThresholdMs !== -1){
                if(Date.now() - this._lastActivityTs > this.inactivityThresholdMs){
                    if(this.activeSubprogram && typeof this.activeSubprogram.pauseForReason === 'function'){
                        this.activeSubprogram.pauseForReason('screensaver_on');
                    }
                    this._updateMatrixRainParent();
                    this._matrixRain.start();
                    if(this._matrixRain && this._matrixRain.running) this._activateScreensaverHotspot();
                }
            }
            // Cycle all toasts for auto-dismiss
            if (this.toasts && this.toasts.length > 0) {
                for (var i = 0; i < this.toasts.length; i++) {
                    if (typeof this.toasts[i].cycle === 'function') this.toasts[i].cycle();
                }
            }
            yield(true);
        }
    } finally {
        // Abort periodic chat redraw event on exit
        if (this._chatRedrawEvent && this._chatRedrawEvent.abort !== undefined) {
            this._chatRedrawEvent.abort = true;
        }
        if (this._resizePollEvent && this._resizePollEvent.abort !== undefined) {
            this._resizePollEvent.abort = true;
        }
        this._removeScreensaverHotspot();
        if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    }
};

// Refactor processKeyboardInput to not call changeFolder() with no argument
IconShell.prototype.processKeyboardInput = function(ch) {
    dbug('Shell processing keyboard input:' + JSON.stringify(ch), 'keylog');
    if (ch === this._mailHotspotCmd) {
        this._handleMailHotspot();
        return true;
    }
    // Ignore filler hotspot command (used to swallow empty grid area clicks)
    if (typeof ICSH_HOTSPOT_FILL_CMD !== 'undefined' && ch === ICSH_HOTSPOT_FILL_CMD) return true;
    if (ch === this._screensaverDismissCmd) {
        var saverActive = this._matrixRain && this._matrixRain.running;
        if (saverActive && typeof this._matrixRain.requestInterrupt === 'function') this._matrixRain.requestInterrupt();
        if (saverActive && typeof this._matrixRain.stop === 'function') this._matrixRain.stop();
        this._removeScreensaverHotspot();
        if (saverActive) {
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

IconShell.prototype._processChatUpdate = function(packet) {
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
                    avatar:{username:packet.data.nick.name, netaddr:packet.data.nick.host}
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
                avatar:{username:packet.data.nick, netaddr:packet.data.system}
        });
    }
        if (packet && packet.oper && packet.oper.toUpperCase() === "UNSUBSCRIBE") {
        this.showToast({
            message: packet.data.nick + ' from ' + packet.data.system + " has left.",
            avatar:{username:packet.data.nick, netaddr:packet.data.system}
        });
    }

};

IconShell.prototype._handleMailHotspot = function() {
    try {
        if (typeof BUILTIN_ACTIONS !== 'undefined' && BUILTIN_ACTIONS && typeof BUILTIN_ACTIONS.mail === 'function') {
            BUILTIN_ACTIONS.mail.call(this);
            return;
        }
    } catch (e) {
        dbug('mail hotspot builtin error: ' + e, 'mail');
    }
    try {
        if (typeof Mail !== 'function') load('iconshell/lib/subfunctions/mail.js');
    } catch (loadErr) {
        dbug('mail hotspot load error: ' + loadErr, 'mail');
        return;
    }
    if (typeof Mail === 'function' && typeof this.queueSubprogramLaunch === 'function') {
        if (!this.mailSub) this.mailSub = new Mail({ parentFrame: this.subFrame, shell: this });
        else {
            this.mailSub.parentFrame = this.subFrame;
            this.mailSub.shell = this;
        }
        this.queueSubprogramLaunch('mail', this.mailSub);
    }
};

IconShell.prototype._getConsoleDimensions = function() {
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

IconShell.prototype._disposeShellFrames = function() {
    try { this._removeScreensaverHotspot(); } catch (e) {}
    this._screensaverHotspotActive = false;
    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    if (typeof this._closePreviousFrames === 'function') this._closePreviousFrames();
    if (this.mouseIndicator && typeof this.mouseIndicator.close === 'function') {
        try { this.mouseIndicator.close(); } catch(e) {}
    }
    if (this.crumb && typeof this.crumb.close === 'function') {
        try { this.crumb.close(); } catch(e) {}
    }
    if (this.view && typeof this.view.close === 'function') {
        try { this.view.close(); } catch(e) {}
    }
    if (this.root && typeof this.root.close === 'function') {
        try { this.root.close(); } catch(e) {}
    }
    this.mouseIndicator = null;
    this.crumb = null;
    this.view = null;
    this.root = null;
    this.grid = null;
    this.subFrame = null;
};

IconShell.prototype._createShellFrames = function(dims) {
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

IconShell.prototype._handleConsoleResize = function(dims) {
    dims = dims || this._getConsoleDimensions();
    dbug('[resize] detected console resize to ' + dims.cols + 'x' + dims.rows, 'resize');
    this._disposeShellFrames();
    this._createShellFrames(dims);
    this._lastConsoleDimensions = { cols: dims.cols, rows: dims.rows };
    this.lastCols = dims.cols;
    this.lastRows = dims.rows;
    if (this._matrixRain) {
        this._updateMatrixRainParent();
        if (this._matrixRain.running) {
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

IconShell.prototype._selectMatrixRainParent = function(){
    if (this.activeSubprogram && typeof this.activeSubprogram.backgroundFrame === 'function') {
        try {
            var frame = this.activeSubprogram.backgroundFrame();
            if (frame && frame.is_open !== false) return frame;
        } catch(e) { dbug('matrix rain backgroundFrame error: ' + e, 'screensaver'); }
    }
    return this.view;
};

IconShell.prototype._updateMatrixRainParent = function(){
    if (!this._matrixRain) return;
    var target = this._selectMatrixRainParent();
    if (!target) return;
    if (this._matrixRain.parent !== target) {
        if (typeof this._matrixRain.setParent === 'function') {
            try { this._matrixRain.setParent(target); } catch(e) { dbug('matrix rain setParent error: ' + e, 'screensaver'); }
        } else {
            this._matrixRain.parent = target;
            if (typeof this._matrixRain.resize === 'function') {
                try { this._matrixRain.resize(); } catch(e) { dbug('matrix rain resize error: ' + e, 'screensaver'); }
            }
        }
    } else if (typeof this._matrixRain.resize === 'function') {
        try { this._matrixRain.resize(); } catch(e) { dbug('matrix rain resize error: ' + e, 'screensaver'); }
    }
};

IconShell.prototype._checkConsoleResize = function() {
    var dims = this._getConsoleDimensions();
    var last = this._lastConsoleDimensions;
    if (!last || dims.cols !== last.cols || dims.rows !== last.rows) {
        this._handleConsoleResize(dims);
    }
};

IconShell.prototype._reserveHotspotCmd = function(preferred) {
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
        '\u0002','\u0003','\u0004','\u0005','\u0006','\u000E','\u000F',
        '\u0010','\u0011','\u0012','\u0013','\u0014','\u0015','\u0016','\u0017',
        '\u0018','\u0019','\u001A','\u001C','\u001D','\u001E','\u001F'
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

IconShell.prototype._handleSubprogramKey = function(ch) {
    dbug("received key " + ch + " to proxy to active subprogram", "subprogram");
    if (typeof this.activeSubprogram.handleKey === 'function') {
        dbug("subprogram has handleKey() function", "subprogram");
        this.activeSubprogram.handleKey(ch);
    }
};

IconShell.prototype._handleNavigationKey = function(ch) {
    // Defensive: ensure selection/index not out of sync with current visible items (especially root view)
    try {
        var node = this.stack[this.stack.length-1];
        var items = node && node.children ? node.children : [];
        if (this.selection < 0) this.selection = 0;
        if (this.selection >= items.length) this.selection = items.length ? items.length - 1 : 0;
    } catch(e) {}
    switch (ch) {
        case KEY_LEFT:  this.moveSelection(-1, 0); return true;
        case KEY_RIGHT: this.moveSelection( 1, 0); return true;
        case KEY_UP:    this.moveSelection( 0,-1); return true;
        case KEY_DOWN:  this.moveSelection( 0, 1); return true;
        case '\r': // ENTER
            this.openSelection();
            return true;
        case '\x1B': // ESC: up a level (if possible)
            if (this.stack.length > 1) {
                this.changeFolder(null, { direction: 'up' });
                if (this.folderChanged) {
                    this.folderChanged = false;
                    if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
                }
            }
            return true;
        default:
            return false;
    }
};

IconShell.prototype._handleHotkeyAction = function(ch) {
    var viewId = this.currentView || (this.generateViewId ? this.generateViewId() : "root");
    var hotkeyMap = this.viewHotkeys[viewId] || {};
    dbug("Checking view " + viewId + " hot keys." + JSON.stringify(hotkeyMap), "hotkeys");
    var action = hotkeyMap[ch];
    if (typeof action === 'function') {
        dbug("Executing hotkey action for " + ch + " in view " + viewId, "hotkeys");
        action();
        if (this.folderChanged) {
            this.folderChanged = false;
            if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
        }
        return true;
    }
    return false;
};

IconShell.prototype._handleHotkeyItemSelection = function(ch) {
    var node = this.stack[this.stack.length-1];
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
                if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
            }
            return true;
        }
    }
    return false;
};

// Detect if the terminal supports mouse events
IconShell.prototype.detectMouseSupport = function() {
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

IconShell.prototype._activateScreensaverHotspot = function() {
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
        try { console.add_hotspot(cmd, true, startX, endX, y); } catch (e) {}
    }

    this._screensaverHotspotActive = true;
};

IconShell.prototype._removeScreensaverHotspot = function() {
    if (!this._screensaverHotspotActive) return;
    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    else if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
    this._screensaverHotspotActive = false;
};

IconShell.prototype.showToast = function(params) {
    var self = this;
    var opts = params || {};
    opts.parentFrame = this.root;
    opts.onDone = function(t) {
        var idx = self.toasts.indexOf(t);
        if (idx !== -1) self.toasts.splice(idx, 1);
    };
    var toast = new Toast(opts);
    this.toasts.push(toast);
    return toast;
};
