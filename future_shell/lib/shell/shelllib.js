if (typeof dbug !== 'function') {
    try { load('future_shell/lib/util/debug.js'); } catch (e) {
        dbug = function () { };
    }
}

load("event-timer.js");
var ANSI_ESCAPE_RE = /\x1B\[[0-?]*[ -\/]*[@-~]/g;
try { load('future_shell/lib/effects/screensaver.js'); } catch (e) { }
// Performance instrumentation (optional)
try { load('future_shell/lib/util/perf.js'); } catch (e) { }
try { load('future_shell/lib/subprograms/subprogram.js'); } catch (e) { }
try { load('future_shell/lib/subprograms/mrc.js'); } catch (e) { dbug('shell init unable to preload mrc.js: ' + e, 'mrc'); }
try { load('future_shell/lib/util/launch_queue.js'); } catch (e) { dbug('shell init unable to load launch_queue.js: ' + e, 'launch'); }
try { load('future_shell/lib/util/hotspot_manger.js'); } catch (e) { dbug('shell init unable to load hotspot_manger.js: ' + e, 'hotspot'); }

var SHELL_KEY_TOKEN_UP = (typeof KEY_UP !== 'undefined') ? KEY_UP : '\x1B[A';
var SHELL_KEY_TOKEN_DOWN = (typeof KEY_DOWN !== 'undefined') ? KEY_DOWN : '\x1B[B';
var SHELL_KEY_TOKEN_RIGHT = (typeof KEY_RIGHT !== 'undefined') ? KEY_RIGHT : '\x1B[C';
var SHELL_KEY_TOKEN_LEFT = (typeof KEY_LEFT !== 'undefined') ? KEY_LEFT : '\x1B[D';
var SHELL_KEY_TOKEN_HOME = (typeof KEY_HOME !== 'undefined') ? KEY_HOME : '\x1B[H';
var SHELL_KEY_TOKEN_END = (typeof KEY_END !== 'undefined') ? KEY_END : '\x1B[F';
var SHELL_KEY_TOKEN_PGUP = (typeof KEY_PGUP !== 'undefined') ? KEY_PGUP : '\x1B[5~';
var SHELL_KEY_TOKEN_PGDN = (typeof KEY_PGDN !== 'undefined') ? KEY_PGDN : '\x1B[6~';
var SHELL_KEY_TOKEN_INS = (typeof KEY_INSERT !== 'undefined') ? KEY_INSERT : ((typeof KEY_INS !== 'undefined') ? KEY_INS : '\x1B[2~');
var SHELL_KEY_TOKEN_DEL = (typeof KEY_DELETE !== 'undefined') ? KEY_DELETE : ((typeof KEY_DEL !== 'undefined') ? KEY_DEL : '\x1B[3~');

var SHELL_ESCAPE_SEQUENCE_MAP = {};
var SHELL_ESCAPE_SEQUENCE_PREFIXES = { '\x1B': true };
(function () {
    function add(seq, token) {
        SHELL_ESCAPE_SEQUENCE_MAP[seq] = token;
        for (var i = 1; i < seq.length; i++) {
            SHELL_ESCAPE_SEQUENCE_PREFIXES[seq.substring(0, i)] = true;
        }
    }

    // Arrow keys (VT100 and SS3 variants)
    add('\x1B[A', SHELL_KEY_TOKEN_UP);
    add('\x1B[B', SHELL_KEY_TOKEN_DOWN);
    add('\x1B[C', SHELL_KEY_TOKEN_RIGHT);
    add('\x1B[D', SHELL_KEY_TOKEN_LEFT);
    add('\x1BOA', SHELL_KEY_TOKEN_UP);
    add('\x1BOB', SHELL_KEY_TOKEN_DOWN);
    add('\x1BOC', SHELL_KEY_TOKEN_RIGHT);
    add('\x1BOD', SHELL_KEY_TOKEN_LEFT);

    // Home / End variants
    add('\x1B[H', SHELL_KEY_TOKEN_HOME);
    add('\x1B[F', SHELL_KEY_TOKEN_END);
    add('\x1BOH', SHELL_KEY_TOKEN_HOME);
    add('\x1BOF', SHELL_KEY_TOKEN_END);
    add('\x1B[1~', SHELL_KEY_TOKEN_HOME);
    add('\x1B[4~', SHELL_KEY_TOKEN_END);
    add('\x1B[7~', SHELL_KEY_TOKEN_HOME);
    add('\x1B[8~', SHELL_KEY_TOKEN_END);

    // Page navigation
    add('\x1B[5~', SHELL_KEY_TOKEN_PGUP);
    add('\x1B[6~', SHELL_KEY_TOKEN_PGDN);

    // Insert / Delete
    add('\x1B[2~', SHELL_KEY_TOKEN_INS);
    add('\x1B[3~', SHELL_KEY_TOKEN_DEL);

    // Function keys (SS3 and CSI variants)
    add('\x1BOP', 'F1');
    add('\x1BOQ', 'F2');
    add('\x1BOR', 'F3');
    add('\x1BOS', 'F4');
    add('\x1B[11~', 'F1');
    add('\x1B[12~', 'F2');
    add('\x1B[13~', 'F3');
    add('\x1B[14~', 'F4');
    add('\x1B[15~', 'F5');
    add('\x1B[17~', 'F6');
    add('\x1B[18~', 'F7');
    add('\x1B[19~', 'F8');
    add('\x1B[20~', 'F9');
    add('\x1B[21~', 'F10');
    add('\x1B[23~', 'F11');
    add('\x1B[24~', 'F12');

    // Shift+Tab
    add('\x1B[Z', (typeof KEY_SHIFT_TAB !== 'undefined') ? KEY_SHIFT_TAB : 'SHIFT_TAB');
})();

var SHELL_COLOR_DEFAULTS = {
    ROOT: { BG: (typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0), FG: (typeof WHITE !== 'undefined' ? WHITE : 7) },
    VIEW: { BG: (typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0), FG: (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7) },
    CRUMB: { BG: BG_BLACK, FG: WHITE },
    HEADER_BAR: { BG: BG_BLACK, FG: WHITE },
    STATUS_BAR: { BG: BG_BLACK, FG: WHITE },
    MOUSE_ON: { BG: BG_BLACK, FG: WHITE },
    MOUSE_OFF: { BG: BG_BLACK, FG: WHITE },
    FRAME_STANDARD: { BG: BG_BLACK, FG: WHITE },
    LABEL: { BG: BG_BLACK, FG: WHITE },
    SELECTED: { BG: (typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)), FG: (typeof WHITE !== 'undefined' ? WHITE : 7) }
};
(function () {
    if (typeof Subprogram !== 'function') return;
    if (typeof IconShell.registerColors !== 'function') IconShell.registerColors = Subprogram.registerColors;
    if (typeof IconShell.getColors !== 'function') IconShell.getColors = Subprogram.getColors;
    var colorMethods = [
        'registerColors',
        'resolveColor',
        'colorPalette',
        'paletteAttr',
        'colorReset',
        'colorCode',
        'colorCodeNamespace',
        'colorCodeShared',
        'colorize',
        'colorizeNamespace',
        'colorizeShared'
    ];
    for (var i = 0; i < colorMethods.length; i++) {
        var key = colorMethods[i];
        if (typeof IconShell.prototype[key] !== 'function' && typeof Subprogram.prototype[key] === 'function') {
            IconShell.prototype[key] = Subprogram.prototype[key];
        }
    }
})();

// IconShell prototype extensions for member logic
// Run time logic
// Add subprogram state to IconShell
IconShell.prototype.init = function () {
    dbug("Initialize icon shell 42A", "init")
    // === Instance state ===
    // Main root frame hierarchy (root/view/crumb)
    var initialDims = this._getConsoleDimensions();
    if (!this.themeNamespace) this.themeNamespace = 'shell';
    if (typeof this.registerColors === 'function') {
        try { this.registerColors(SHELL_COLOR_DEFAULTS, 'shell'); } catch (e) { dbug('shell registerColors error: ' + e, 'theme'); }
    }
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
    this._toastHotspots = {};
    this._toastKeyBuffer = '';
    this._toastTokenCounter = 0;
    this._toastSequenceStartTs = 0;
    this._toastSequenceTimeoutMs = 600;
    this._toastHotspotStashActive = false;
    this._toastDismissCmd = this._reserveHotspotCmd('\u0006');
    this._lastLaunchEventId = undefined;
    this._shellPrefsInstance = null;
    // Track reserved hotspot commands so we avoid collisions
    this._reservedHotspotCommands = {};
    if (typeof ICSH_HOTSPOT_FILL_CMD === 'string' && ICSH_HOTSPOT_FILL_CMD.length === 1) {
        this._reservedHotspotCommands[ICSH_HOTSPOT_FILL_CMD] = true;
    }
    this.hotspotManager = null;
    this._gridHotspotLayerId = null;
    this._toastHotspotLayerId = null;
    this._screensaverHotspotLayerId = null;
    if (typeof HotSpotManager === 'function') {
        try {
            this.hotspotManager = new HotSpotManager({ console: console, baseLayerName: 'shell-grid', baseLayerPriority: 10 });
            this._gridHotspotLayerId = this.hotspotManager.getBaseLayerId();
            this._toastHotspotLayerId = this.hotspotManager.ensureLayer('toast-overlay', 100, { active: false });
            this._screensaverHotspotLayerId = this.hotspotManager.ensureLayer('screensaver', 200, { active: false });
        } catch (hotspotErr) {
            this.hotspotManager = null;
            try { dbug('hotspot manager init error: ' + hotspotErr, 'hotspot'); } catch (_) { }
        }
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
    this._unknownEscapeSequences = {};
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
            self._pollLaunchQueue();
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
        this._applyScreensaverPreferences();
    }
    // Enable mouse mode for hotspots
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;

    // Initialize MRC controller for background operation
    this.mrcController = null;
    try {
        var getMrcController = load({}, 'future_shell/lib/mrc/factory.js');
        if (typeof getMrcController === 'function') {
            this.mrcController = getMrcController({ shell: this, timer: this.timer });
            log(LOG_INFO, '[shell] MRC controller initialized for node ' + bbs.node_num);
        }
    } catch (e) {
        try { log(LOG_ERR, '[shell] MRC controller init failed: ' + e); } catch (_) { }
    }
};

IconShell.prototype._computeToastDismissRegions = function (toastRects) {
    if (!toastRects || !toastRects.length) return [];
    var root = this.root;
    var consoleCols = (typeof console !== 'undefined' && console && typeof console.screen_columns === 'number') ? console.screen_columns : 0;
    var consoleRows = (typeof console !== 'undefined' && console && typeof console.screen_rows === 'number') ? console.screen_rows : 0;
    var startX = root ? root.x : 1;
    var startY = root ? root.y : 1;
    var width = root ? root.width : consoleCols;
    var height = root ? root.height : consoleRows;
    if (!width) width = consoleCols || 80;
    if (!height) height = consoleRows || 24;
    if (!width || !height) return [];
    var endX = startX + Math.max(0, width - 1);
    var endY = startY + Math.max(0, height - 1);

    var coverage = {};
    for (var i = 0; i < toastRects.length; i++) {
        var rect = toastRects[i];
        if (!rect) continue;
        var x1 = Math.max(startX, rect.x);
        var y1 = Math.max(startY, rect.y);
        var x2 = Math.min(endX, rect.x + Math.max(1, rect.width) - 1);
        var y2 = Math.min(endY, rect.y + Math.max(1, rect.height) - 1);
        if (x1 > x2 || y1 > y2) continue;
        for (var y = y1; y <= y2; y++) {
            if (!coverage[y]) coverage[y] = [];
            coverage[y].push({ start: x1, end: x2 });
        }
    }

    function mergeIntervals(list) {
        if (!list || !list.length) return [];
        list.sort(function (a, b) { return a.start - b.start; });
        var merged = [];
        var current = { start: list[0].start, end: list[0].end };
        for (var i2 = 1; i2 < list.length; i2++) {
            var next = list[i2];
            if (next.start <= current.end + 1) {
                if (next.end > current.end) current.end = next.end;
            } else {
                merged.push(current);
                current = { start: next.start, end: next.end };
            }
        }
        merged.push(current);
        return merged;
    }

    var uncoveredByRow = {};
    for (var row = startY; row <= endY; row++) {
        var merged = mergeIntervals(coverage[row]);
        var cursor = startX;
        var segments = [];
        if (!merged.length) {
            segments.push({ x1: startX, x2: endX });
        } else {
            for (var m = 0; m < merged.length; m++) {
                var interval = merged[m];
                if (interval.start > cursor) {
                    segments.push({ x1: cursor, x2: interval.start - 1 });
                }
                if (interval.end + 1 > cursor) cursor = interval.end + 1;
                if (cursor > endX) break;
            }
            if (cursor <= endX) {
                segments.push({ x1: cursor, x2: endX });
            }
        }
        if (segments.length) uncoveredByRow[row] = segments;
    }

    var regions = [];
    var active = {};
    for (var yRow = startY; yRow <= endY; yRow++) {
        var segmentsForRow = uncoveredByRow[yRow] || [];
        var nextActive = {};
        for (var s = 0; s < segmentsForRow.length; s++) {
            var seg = segmentsForRow[s];
            if (seg.x1 > seg.x2) continue;
            var key = seg.x1 + ':' + seg.x2;
            var region = active[key];
            if (region) {
                region.height += 1;
                nextActive[key] = region;
            } else {
                nextActive[key] = {
                    x: seg.x1,
                    y: yRow,
                    width: seg.x2 - seg.x1 + 1,
                    height: 1
                };
            }
        }
        for (var activeKey in active) {
            if (!active.hasOwnProperty(activeKey)) continue;
            if (!nextActive[activeKey]) regions.push(active[activeKey]);
        }
        active = nextActive;
    }
    for (var remainingKey in active) {
        if (active.hasOwnProperty(remainingKey)) regions.push(active[remainingKey]);
    }
    return regions;
};

IconShell.prototype._dismissAllToasts = function () {
    if (!this.toasts || !this.toasts.length) return;
    var pending = this.toasts.slice();
    for (var i = pending.length - 1; i >= 0; i--) {
        var toast = pending[i];
        if (toast && typeof toast.dismiss === 'function') {
            try { toast.dismiss(); } catch (e) { try { log('[toast] dismiss error: ' + e); } catch (_) { } }
        }
    }
    this._toastKeyBuffer = '';
    this._toastSequenceStartTs = 0;
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

            // Cycle background MRC controller if present
            if (this.mrcController && typeof this.mrcController.tick === 'function') {
                try { this.mrcController.tick(); } catch (_) { }
            }

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
    if (ch === this._toastDismissCmd) {
        if (this.toasts && this.toasts.length) {
            this._dismissAllToasts();
            return true;
        }
        // No active toast to dismiss; treat as a normal keystroke
    }
    if (typeof ch === 'string' && ch.length && this.toasts && this.toasts.length) {
        var toastNowTs = Date.now();
        this._toastKeyBuffer = ((typeof this._toastKeyBuffer === 'string') ? this._toastKeyBuffer : '') + ch;
        if (this._toastKeyBuffer.length > 32) this._toastKeyBuffer = this._toastKeyBuffer.slice(-32);
        var matchedToken = null;
        var pendingPrefix = false;
        for (var token in this._toastHotspots) {
            if (!this._toastHotspots.hasOwnProperty(token)) continue;
            if (!token) continue;
            if (this._toastKeyBuffer && this._toastKeyBuffer.slice(-token.length) === token) {
                matchedToken = token;
                break;
            }
            if (token.length > 1) {
                var sliceLen = Math.min(token.length, this._toastKeyBuffer.length);
                if (sliceLen > 0) {
                    var suffix = this._toastKeyBuffer.slice(-sliceLen);
                    if (token.substring(0, sliceLen) === suffix) pendingPrefix = true;
                }
            }
        }
        if (matchedToken) {
            var selectedToastToken = this._toastHotspots[matchedToken];
            var launchedToken = false;
            if (selectedToastToken && selectedToastToken.__shellMeta && typeof selectedToastToken.__shellMeta.action === 'function') {
                try { selectedToastToken.__shellMeta.action(); launchedToken = true; } catch (actionErr) { log('[toast] action handler error: ' + actionErr); }
            } else if (selectedToastToken && selectedToastToken.__shellMeta && selectedToastToken.__shellMeta.launch) {
                launchedToken = this._launchToastTarget(selectedToastToken.__shellMeta.launch, selectedToastToken);
            }
            if (launchedToken) {
                if (selectedToastToken && typeof selectedToastToken.dismiss === 'function') selectedToastToken.dismiss();
            }
            this._toastKeyBuffer = '';
            this._toastSequenceStartTs = 0;
            return true;
        }
        if (pendingPrefix) {
            var timeoutMs = (typeof this._toastSequenceTimeoutMs === 'number') ? this._toastSequenceTimeoutMs : 600;
            if (!this._toastSequenceStartTs || (toastNowTs - this._toastSequenceStartTs) > timeoutMs) {
                this._toastSequenceStartTs = toastNowTs;
            }
            if (this._toastKeyBuffer.length > 1 && (toastNowTs - this._toastSequenceStartTs) <= timeoutMs) {
                return true;
            }
        } else {
            this._toastSequenceStartTs = 0;
        }
    }
    if (typeof ch === 'string' && this._toastHotspots && this._toastHotspots[ch]) {
        var selectedToast = this._toastHotspots[ch];
        var launched = false;
        if (selectedToast && selectedToast.__shellMeta && typeof selectedToast.__shellMeta.action === 'function') {
            try { selectedToast.__shellMeta.action(); launched = true; } catch (actionErr) { log('[toast] action handler error: ' + actionErr); }
        } else if (selectedToast && selectedToast.__shellMeta && selectedToast.__shellMeta.launch) {
            launched = this._launchToastTarget(selectedToast.__shellMeta.launch, selectedToast);
        }
        if (launched) {
            if (selectedToast && typeof selectedToast.dismiss === 'function') selectedToast.dismiss();
        } else {
            log('[toast] launch not handled; toast remains visible');
        }
        return true;
    }
    // If any toasts are active, ESC dismisses the most recent
    if (ch === '\x1B' && this.toasts && this.toasts.length > 0) {
        var toast = this.toasts[this.toasts.length - 1];
        if (toast && typeof toast.dismiss === 'function') toast.dismiss();
        return true;
    }
    if (this.activeSubprogram) {
        if (typeof dbug === 'function') {
            try { dbug('processKey:forward-to-sub key=' + JSON.stringify(ch) + ' sub=' + (this.activeSubprogram.id || this.activeSubprogram.name || 'unknown'), 'keylog'); } catch (_) { }
        }
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
                var nickName = (packet.data && packet.data.nick && (packet.data.nick.name || packet.data.nick)) ? (packet.data.nick.name || packet.data.nick) : 'Chat';
                var netAddr = (packet.data && packet.data.nick && (packet.data.nick.host || packet.data.nick.netaddr)) ? (packet.data.nick.host || packet.data.nick.netaddr) : system.name;
                this.showToast({
                    message: nickName + ': ' + packet.data.str,
                    avatar: { username: nickName, netaddr: netAddr },
                    title: nickName,
                    launch: 'chat',
                    category: 'json-chat',
                    sender: nickName
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
        var joinNick = packet.data && packet.data.nick ? packet.data.nick : 'Someone';
        var joinSystem = packet.data && packet.data.system ? packet.data.system : system.name;
        this.showToast({
            message: joinNick + ' from ' + joinSystem + " is here.",
            avatar: { username: joinNick, netaddr: joinSystem },
            title: joinNick,
            launch: 'chat',
            category: 'json-chat',
            sender: joinNick
        });
    }
    if (packet && packet.oper && packet.oper.toUpperCase() === "UNSUBSCRIBE") {
        var leaveNick = packet.data && packet.data.nick ? packet.data.nick : 'Someone';
        var leaveSystem = packet.data && packet.data.system ? packet.data.system : system.name;
        this.showToast({
            message: leaveNick + ' from ' + leaveSystem + " has left.",
            avatar: { username: leaveNick, netaddr: leaveSystem },
            title: leaveNick,
            launch: 'chat',
            category: 'json-chat',
            sender: leaveNick
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
    if (this.headerFrame && typeof this.headerFrame.close === 'function') {
        try { this.headerFrame.close(); } catch (e) { }
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
    this.headerFrame = null;
    this.root = null;
    this.grid = null;
    this.subFrame = null;
};

IconShell.prototype._refreshHeaderFrame = function () {
    if (!this.headerFrame) return;
    try {
        var headerAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('HEADER_BAR', ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7))) : ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
        var headerText = (system && system.name) ? ' ' + String(system.name) + ' ' : '';
        this.headerFrame.attr = headerAttr;
        this.headerFrame.clear(headerAttr);
        this.headerFrame.home();
        var width = this.headerFrame.width || headerText.length || 1;
        if (typeof Gradient !== 'undefined' && Gradient && typeof Gradient.get === 'function') {
            try {
                var gtype = 'ocean';
                // var gt_copy = JSON.parse(JSON.stringify(gtype));
                //var gradientFill = Gradient.get(gtype, width, 'both', { glyph: "shade", fgIndex: 4, bgIndex: 2 });
                //var gradientFill = Gradient.getHalf('cyber', width, 'both');
                // var gradientFill = Gradient.getMix('futureland', width, 'l');
                var gradientFill = Gradient.stringPad(headerText, width, "both", { type: "random", glyph: "mix" })
                this.headerFrame.gotoxy(1, 1);
                this.headerFrame.putmsg(gradientFill);
            } catch (gErr) { dbug('header gradient error: ' + gErr, 'theme'); }
        }
        this.headerFrame.cycle();
    } catch (e) { dbug('header refresh error: ' + e, 'theme'); }
};

IconShell.prototype._createShellFrames = function (dims) {
    dims = dims || this._getConsoleDimensions();
    var cols = Math.max(1, dims.cols);
    var rows = Math.max(1, dims.rows);
    var fallbackRoot = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackView = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));
    var fallbackCrumb = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackHeader = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var rootAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('ROOT', fallbackRoot) : fallbackRoot;
    this.root = new Frame(1, 1, cols, rows, rootAttr);
    this.root.open();
    var headerAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('HEADER_BAR', fallbackHeader) : fallbackHeader;
    this.headerFrame = new Frame(1, 1, cols, 1, headerAttr, this.root);
    this.headerFrame.open();
    var viewH = Math.max(1, rows - 2);
    var viewAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('VIEW', fallbackView) : fallbackView;
    this.view = new Frame(1, 2, cols, viewH, viewAttr, this.root);
    this.view.open();
    var crumbY = rows;
    if (crumbY < 1) crumbY = 1;
    var crumbAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('CRUMB', fallbackCrumb) : fallbackCrumb;
    this.crumb = new Frame(1, crumbY, cols, 1, crumbAttr, this.root);
    this.crumb.open();
    this._refreshHeaderFrame();
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
    if (this.toasts && this.toasts.length) this._reflowAllToasts();
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
    if (key === '\n') {
        if (this._lastWasCR) {
            this._lastWasCR = false;
            return '';
        }
        return key;
    }
    this._lastWasCR = false;
    return key;
};

IconShell.prototype._decodeEscapeSequence = function (key, queue) {
    if (key !== '\x1B') return key;
    var consumed = [];
    var sequence = '\x1B';
    var map = SHELL_ESCAPE_SEQUENCE_MAP;
    var prefixes = SHELL_ESCAPE_SEQUENCE_PREFIXES;
    var self = this;

    function restoreQueue() {
        for (var i = consumed.length - 1; i >= 0; i--) {
            queue.unshift(consumed[i]);
        }
    }

    while (true) {
        if (!queue.length) {
            restoreQueue();
            if (consumed.length === 1 && typeof consumed[0] === 'string' && consumed[0].length > 0) {
                return consumed[0];
            }
            return key;
        }
        var next = queue.shift();
        consumed.push(next);
        sequence += next;
        if (Object.prototype.hasOwnProperty.call(map, sequence)) {
            return map[sequence];
        }
        if (!Object.prototype.hasOwnProperty.call(prefixes, sequence)) {
            if (consumed.length === 1 && typeof consumed[0] === 'string' && consumed[0].length > 0) {
                return consumed[0];
            }
            restoreQueue();
            if (sequence.length > 1 && self && self._unknownEscapeSequences && !self._unknownEscapeSequences[sequence]) {
                self._unknownEscapeSequences[sequence] = true;
                var payload = '[Shell] Unknown escape sequence: ' + JSON.stringify(sequence);
                if (typeof dbug === 'function') {
                    try { dbug(payload, 'keylog'); } catch (_) { }
                } else if (typeof log === 'function') {
                    try { log(payload); } catch (_) { }
                }
            }
            return key;
        }
    }
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
        key = this._decodeEscapeSequence(key, keys);
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
    if (this.toasts && this.toasts.length) {
        for (var i = 0; i < this.toasts.length; i++) {
            var toast = this.toasts[i];
            if (toast && typeof toast.cycle === 'function') {
                try { toast.cycle(); } catch (e) { dbug('toast cycle error: ' + e, 'toast'); }
            }
        }
    }
};

IconShell.prototype._pollLaunchQueue = function () {
    if (typeof LaunchQueue === 'undefined' || !LaunchQueue || typeof LaunchQueue.listSince !== 'function') return;
    if (typeof this._lastLaunchEventId === 'undefined') {
        if (typeof LaunchQueue.latestId === 'function') this._lastLaunchEventId = LaunchQueue.latestId();
        else this._lastLaunchEventId = 0;
        return;
    }
    var events = [];
    try { events = LaunchQueue.listSince(this._lastLaunchEventId || 0); }
    catch (e) { try { log('launch_queue: listSince failed (' + e + ')'); } catch (_) { } return; }
    if (!events || !events.length) {
        return;
    }
    var currentNode = (typeof bbs !== 'undefined' && typeof bbs.node_num === 'number') ? bbs.node_num : null;
    for (var i = 0; i < events.length; i++) {
        var evt = events[i];
        if (!evt || typeof evt.id !== 'number') continue;
        if (evt.node !== null && currentNode !== null && evt.node === currentNode) {
            if (evt.id > this._lastLaunchEventId) this._lastLaunchEventId = evt.id;
            continue;
        }
        try { log('[launch_queue] handling event id=' + evt.id + ' node=' + evt.node + ' program=' + evt.programId); } catch (_) { }
        this._handleLaunchEvent(evt);
        if (evt.id > this._lastLaunchEventId) this._lastLaunchEventId = evt.id;
    }
    if (typeof LaunchQueue.trim === 'function') {
        try { LaunchQueue.trim(); } catch (_) { }
    }
};

IconShell.prototype._handleLaunchEvent = function (evt) {
    if (!evt) return;
    var alias = evt.userAlias || 'Another user';
    var label = evt.label || evt.programId || 'program';
    var message = alias + ' started ' + label;
    var shell = this;
    var actionFn = null;
    if (evt.programId) {
        actionFn = function () {
            shell.runExternal(function () {
                try { bbs.exec_xtrn(evt.programId); } catch (e) { log('launch toast exec_xtrn failed: ' + e); }
            }, {
                programId: evt.programId,
                label: label,
                icon: evt.icon || null,
                broadcast: false
            });
        };
    }
    this.showToast({
        title: alias,
        message: message,
        category: 'launch_notice',
        sender: evt.programId || label,
        programIcon: evt.icon || 'program',
        timeout: 12000,
        action: actionFn
    });
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
        case KEY_DOWN:
        case "\u000a":
            log('key down detected as navigation');
            this.moveSelection(0, 1);
            return true;
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
    if (typeof this._clearHotspots === 'function') this._clearHotspots();
    else if (typeof console.clear_hotspots === 'function') console.clear_hotspots();

    if (this.hotspotManager && this._screensaverHotspotLayerId) {
        var shellRoot = this.root;
        var startXMgr = shellRoot ? shellRoot.x : 1;
        var startYMgr = shellRoot ? shellRoot.y : 1;
        var widthMgr = shellRoot ? shellRoot.width : console.screen_columns;
        var heightMgr = shellRoot ? shellRoot.height : console.screen_rows;
        widthMgr = Math.max(1, widthMgr || console.screen_columns || 80);
        heightMgr = Math.max(1, heightMgr || console.screen_rows || 24);
        var defs = [{
            key: this._screensaverDismissCmd || '__ICSH_SAVER__',
            x: startXMgr,
            y: startYMgr,
            width: widthMgr,
            height: heightMgr,
            swallow: true,
            owner: 'screensaver'
        }];
        this.hotspotManager.setLayerHotspots(this._screensaverHotspotLayerId, defs);
        this.hotspotManager.activateLayer(this._screensaverHotspotLayerId);
        if (this._gridHotspotLayerId) this.hotspotManager.deactivateLayer(this._gridHotspotLayerId);
        this._screensaverHotspotActive = true;
        return;
    }
    if (typeof console.add_hotspot !== 'function') return;
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
    if (this.hotspotManager && this._screensaverHotspotLayerId) {
        this.hotspotManager.clearLayer(this._screensaverHotspotLayerId);
        this.hotspotManager.deactivateLayer(this._screensaverHotspotLayerId);
        if (this._gridHotspotLayerId) this.hotspotManager.activateLayer(this._gridHotspotLayerId);
    } else {
        if (typeof this._clearHotspots === 'function') this._clearHotspots();
        else if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
    }
    this._screensaverHotspotActive = false;
};

IconShell.prototype._getShellPrefs = function () {
    if (this._shellPrefsInstance) return this._shellPrefsInstance;
    if (typeof ShellPrefs === 'undefined') {
        try {
            load('future_shell/lib/subprograms/shell_prefs.js');
        } catch (loadErr) {
            try { log('[shell-prefs] load failed: ' + loadErr); } catch (_) { }
        }
    }
    if (typeof ShellPrefs !== 'function') return null;
    var opts = { shell: this };
    try {
        if (typeof user !== 'undefined' && user) {
            if (typeof user.number === 'number') opts.userNumber = user.number;
            if (user.alias) opts.userAlias = user.alias;
        }
    } catch (_) { }
    try {
        this._shellPrefsInstance = new ShellPrefs(opts);
    } catch (instantiateErr) {
        try { log('[shell-prefs] instantiate failed: ' + instantiateErr); } catch (_) { }
        this._shellPrefsInstance = null;
    }
    return this._shellPrefsInstance;
};

IconShell.prototype.reloadShellPrefs = function () {
    var prefs = this._shellPrefsInstance;
    if (!prefs) prefs = this._getShellPrefs();
    if (prefs && typeof prefs._load === 'function') {
        try { prefs._load(); } catch (e) { try { log('[shell-prefs] reload failed: ' + e); } catch (_) { } }
    }
    return prefs;
};

IconShell.prototype._applyScreensaverPreferences = function (prefs) {
    if (!prefs) prefs = this._shellPrefsInstance || this._getShellPrefs();
    if (!prefs || typeof prefs.getScreensaverConfig !== 'function') return;
    var cfg = prefs.getScreensaverConfig();
    if (cfg) {
        if (cfg.timeoutSeconds === -1) this.inactivityThresholdMs = -1;
        else this.inactivityThresholdMs = Math.max(0, cfg.timeoutSeconds | 0) * 1000;
        if (this.inactivityThresholdMs !== -1) this._lastActivityTs = Date.now();
        if (this._screenSaver && typeof this._screenSaver.configure === 'function') {
            var enabled = [];
            if (Array.isArray(cfg.order)) {
                for (var i = 0; i < cfg.order.length; i++) {
                    var name = cfg.order[i];
                    if (!name) continue;
                    if (cfg.enabled && cfg.enabled[name] === false) continue;
                    if (enabled.indexOf(name) === -1) enabled.push(name);
                }
            }
            if (this._screenSaver.registry) {
                var filtered = [];
                for (var e = 0; e < enabled.length; e++) {
                    if (this._screenSaver.registry[enabled[e]]) filtered.push(enabled[e]);
                }
                enabled = filtered;
            }
            if (!enabled.length) enabled.push('matrix_rain');
            var switchSeconds = (typeof cfg.switchIntervalSeconds === 'number') ? cfg.switchIntervalSeconds : 90;
            if (switchSeconds > 0 && switchSeconds < 5) switchSeconds = 5;
            this._screenSaver.configure({
                animations: enabled,
                random: !!cfg.randomOrder,
                switch_interval: switchSeconds
            });
        }
    }
};

IconShell.prototype.onShellPrefsSaved = function (prefs) {
    var instance = this.reloadShellPrefs();
    if (!instance) instance = prefs;
    this._applyScreensaverPreferences(instance);
};

IconShell.prototype.showToast = function (params) {
    var self = this;
    var opts = params || {};
    opts.parentFrame = this.root;
    var action = (typeof opts.action === 'function') ? opts.action : null;
    var launch = null;
    if (typeof opts.launch === 'string') launch = opts.launch;
    else if (typeof opts.subprogram === 'string') launch = opts.subprogram;
    var category = (typeof opts.category === 'string' && opts.category.length) ? opts.category : null;
    var sender = (typeof opts.sender === 'string' && opts.sender.length) ? opts.sender : null;
    if (category || sender) {
        var prefs = this.reloadShellPrefs();
        if (prefs && typeof prefs.shouldDisplayNotification === 'function') {
            var allow = true;
            try { allow = prefs.shouldDisplayNotification(category, sender); }
            catch (_) { allow = true; }
            try { log('[toast] prefs check category=' + (category || '') + ' sender=' + (sender || '') + ' allow=' + allow); } catch (_) { }
            if (!allow) {
                try { log('[toast] suppressed category=' + (category || 'unknown') + ' sender=' + (sender || 'unknown')); } catch (_) { }
                return null;
            }
        }
    }
    log('[toast] showToast title=' + (opts.title || '') + ' launch=' + (launch || '') + ' category=' + (category || ''));
    var position = opts.position || 'bottom-right';
    var userOnDone = opts.onDone;
    opts.onDone = function (t) {
        self._unregisterToastHotspot(t);
        self._removeToastFromList(t);
        if (typeof userOnDone === 'function') {
            try { userOnDone(t); } catch (_) { }
        }
    };
    var toast = new Toast(opts);
    toast.__shellMeta = {
        action: action,
        launch: launch,
        position: position,
        command: null
    };
    this.toasts.push(toast);
    if (this.toasts.length === 1) this._toastKeyBuffer = '';
    if (this.toasts.length === 1 && typeof console !== 'undefined' && console && typeof console.mouse_mode !== 'undefined') {
        if (typeof this._toastMouseRestore === 'undefined') this._toastMouseRestore = console.mouse_mode;
        console.mouse_mode = true;
        try { log('[toast] mouse mode enabled'); } catch (_) { }
    }
    this._registerToastHotspot(toast);
    this._reflowAllToasts();
    return toast;
};

IconShell.prototype.launchToast = function (target) {
    if (!target) return false;
    return this._launchToastTarget(target, null);
};

IconShell.prototype._toastPosition = function (toast) {
    if (!toast || !toast.__shellMeta || !toast.__shellMeta.position) return 'bottom-right';
    return toast.__shellMeta.position;
};

IconShell.prototype._removeToastFromList = function (toast) {
    if (!this.toasts || !this.toasts.length) return;
    var idx = this.toasts.indexOf(toast);
    if (idx !== -1) this.toasts.splice(idx, 1);
    if (!this.toasts.length && typeof console !== 'undefined' && console && typeof console.mouse_mode !== 'undefined' && typeof this._toastMouseRestore !== 'undefined') {
        console.mouse_mode = this._toastMouseRestore;
        try { log('[toast] mouse mode restored'); } catch (_) { }
        this._toastMouseRestore = undefined;
    }
    if (!this.toasts.length) {
        this._toastKeyBuffer = '';
        this._toastTokenCounter = 0;
        this._toastSequenceStartTs = 0;
    }
    this._reflowAllToasts();
    this._refreshToastHotspotLayer();
    if (!this.toasts.length) {
        this._releaseToastHotspotExclusivity();
        try { this._restoreHotspotsAfterToast(); } catch (e) { log('[toast] hotspot restore error: ' + e); }
    }
};

IconShell.prototype._restoreHotspotsAfterToast = function () {
    if (this._screensaverHotspotActive) return;
    if (this.activeSubprogram && this.activeSubprogram.running) {
        var sub = this.activeSubprogram;
        var restored = false;
        if (typeof sub.restoreHotspots === 'function') {
            try { sub.restoreHotspots(); restored = true; } catch (restoreErr) { log('[toast] subprogram restoreHotspots error: ' + restoreErr); }
        }
        if (typeof sub.resumeForReason === 'function') {
            try { sub.resumeForReason('toast_closed'); } catch (resumeErr) { log('[toast] subprogram resumeForReason error: ' + resumeErr); }
        }
        if (!restored && typeof sub.refresh === 'function') {
            try { sub.refresh(); restored = true; } catch (refreshErr) { log('[toast] subprogram refresh error: ' + refreshErr); }
        }
        if (!restored && typeof sub.draw === 'function') {
            try { sub.draw(); restored = true; } catch (drawErr) { log('[toast] subprogram draw error: ' + drawErr); }
        }
        if (restored && sub.parentFrame && typeof sub.parentFrame.cycle === 'function') {
            try { sub.parentFrame.cycle(); } catch (_) { }
        }
    } else {
        if (this.grid && this.grid.cells && this.grid.cells.length) {
            this._clearHotspots();
            this._addMouseHotspots();
        } else {
            this.drawFolder({ skipHeaderRefresh: true });
        }
    }
};

IconShell.prototype._launchToastTarget = function (target, toast) {
    if (!target) return false;
    var handled = false;
    log('[toast] launch requested: ' + target + ' (toast=' + (toast && toast.__shellMeta ? JSON.stringify(toast.__shellMeta.launch) : 'null') + ')');
    if (typeof BUILTIN_ACTIONS !== 'undefined' && BUILTIN_ACTIONS && typeof BUILTIN_ACTIONS[target] === 'function') {
        log('[toast] invoking builtin action: ' + target);
        try {
            BUILTIN_ACTIONS[target].call(this);
            handled = true;
        } catch (builtinErr) {
            log('[toast] builtin action threw: ' + builtinErr);
        }
    }
    if (!handled && typeof this[target] === 'function') {
        log('[toast] invoking shell method: ' + target);
        try {
            this[target]();
            handled = true;
        } catch (shellErr) {
            log('[toast] shell method threw: ' + shellErr);
        }
    }
    if (!handled && typeof this.queueSubprogramLaunch === 'function' && target === 'mrc') {
        log('[toast] attempting queueSubprogramLaunch for mrc');
        try {
            if (!this.mrcSub && typeof MRC === 'function') {
                this.mrcSub = new MRC({ shell: this, timer: this.timer });
            }
            if (this.mrcSub) {
                this.queueSubprogramLaunch('mrc', this.mrcSub);
                handled = true;
            } else {
                log('[toast] unable to instantiate MRC subprogram');
            }
        } catch (queueErr) {
            log('[toast] queueSubprogramLaunch failed: ' + queueErr);
        }
    }
    if (!handled && typeof this.launchSubprogram === 'function' && target === 'mrc') {
        log('[toast] attempting direct launchSubprogram for mrc');
        try {
            if (!this.mrcSub && typeof MRC === 'function') {
                this.mrcSub = new MRC({ shell: this, timer: this.timer });
            }
            if (this.mrcSub) {
                this.launchSubprogram('mrc', this.mrcSub);
                handled = true;
            } else {
                log('[toast] launchSubprogram skipped; no mrc instance');
            }
        } catch (launchErr) {
            log('[toast] launchSubprogram failed: ' + launchErr);
        }
    }
    if (!handled) {
        log('[toast] launch target not handled: ' + target);
    }
    return handled;
};
IconShell.prototype._ensureToastHotspotExclusivity = function () {
    if (!this.hotspotManager || !this._toastHotspotLayerId) return;
    if (this._toastHotspotStashActive) return;
    try {
        this.hotspotManager.stashHotSpots();
        this._toastHotspotStashActive = true;
        if (this.activeSubprogram && typeof this.activeSubprogram.refresh === 'function') {
            try { this.activeSubprogram.refresh(); } catch (_) { }
        }
    } catch (stashErr) {
        try { log('[toast] hotspot stash error: ' + stashErr); } catch (_) { }
    }
};

IconShell.prototype._releaseToastHotspotExclusivity = function () {
    if (!this.hotspotManager || !this._toastHotspotLayerId) return;
    if (!this._toastHotspotStashActive) return;
    try {
        this.hotspotManager.restoreStashedHotSpots();
    } catch (restoreErr) {
        try { log('[toast] hotspot restore error: ' + restoreErr); } catch (_) { }
    }
    this._toastHotspotStashActive = false;
};

IconShell.prototype._refreshToastHotspotLayer = function () {
    if (!this.hotspotManager || !this._toastHotspotLayerId) return;
    var defs = [];
    var toastRects = [];
    var metaList = [];
    for (var key in this._toastHotspots) {
        if (!this._toastHotspots.hasOwnProperty(key)) continue;
        var toast = this._toastHotspots[key];
        if (!toast || toast._dismissed || !toast.toastFrame) continue;
        var frame = toast.toastFrame;
        var meta = toast.__shellMeta || {};
        toast.__shellMeta = meta;
        var toastHeight = Math.max(1, frame.height || 1);
        meta.rect = {
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: toastHeight
        };
        metaList.push(meta);
        defs.push({
            key: key,
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: toastHeight,
            swallow: false,
            owner: 'toast',
            data: { launch: meta.launch || null }
        });
        toastRects.push(meta.rect);
    }
    if (defs.length) {
        this._styleToastFrames(metaList);
        if (this._toastDismissCmd) {
            var dismissRegions = this._computeToastDismissRegions(toastRects);
            for (var i = 0; i < dismissRegions.length; i++) {
                var region = dismissRegions[i];
                defs.push({
                    key: this._toastDismissCmd,
                    x: region.x,
                    y: region.y,
                    width: region.width,
                    height: region.height,
                    swallow: false,
                    owner: 'toast-dismiss'
                });
            }
        }
        this._ensureToastHotspotExclusivity();
        this.hotspotManager.setLayerHotspots(this._toastHotspotLayerId, defs);
        this.hotspotManager.activateLayer(this._toastHotspotLayerId);
    } else {
        this.hotspotManager.clearLayer(this._toastHotspotLayerId);
        this.hotspotManager.deactivateLayer(this._toastHotspotLayerId);
    }
};
IconShell.prototype._styleToastFrames = function (metaList) {
    if (!metaList || !metaList.length) return;
    for (var i = 0; i < metaList.length; i++) {
        var meta = metaList[i];
        if (!meta) continue;
        var toast = meta.toast;
        if (!toast || typeof toast.refreshTheme !== 'function') continue;
        try { toast.refreshTheme(); } catch (err) {
            try { log('[toast] refreshTheme error: ' + err); } catch (_) { }
        }
    }
};
IconShell.prototype._registerToastHotspot = function (toast) {
    if (!toast || !toast.toastFrame) return;
    if (!this._toastHotspots) this._toastHotspots = {};
    if (!toast.__shellMeta) toast.__shellMeta = {};
    if (!toast.__shellMeta.command) {
        this._toastTokenCounter = (this._toastTokenCounter || 0) + 1;
        var token = '~t' + this._toastTokenCounter.toString(36) + '~';
        while (this._reservedHotspotCommands && this._reservedHotspotCommands[token]) {
            this._toastTokenCounter += 1;
            token = '~t' + this._toastTokenCounter.toString(36) + '~';
        }
        if (!this._reservedHotspotCommands) this._reservedHotspotCommands = {};
        this._reservedHotspotCommands[token] = true;
        toast.__shellMeta.command = token;
    }
    toast.__shellMeta.toast = toast;
    var cmd = toast.__shellMeta.command;
    if (!cmd) return;
    if (this.hotspotManager && this._toastHotspotLayerId && !this._toastHotspotStashActive) {
        this._ensureToastHotspotExclusivity();
    }
    this._toastHotspots[cmd] = toast;
    log('[toast] register hotspot cmd=' + JSON.stringify(cmd) + ' code=' + (cmd ? cmd.charCodeAt(0) : 'null') + ' launch=' + (toast.__shellMeta.launch || ''));
    var frame = toast.toastFrame;
    var toastHeight = Math.max(1, frame.height || 1);
    toast.__shellMeta.rect = {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: toastHeight
    };
    if (this.hotspotManager && this._toastHotspotLayerId) {
        this._refreshToastHotspotLayer();
        return;
    }
    if (typeof console.add_hotspot !== 'function') return;
    var startX = frame.x;
    var endX = frame.x + frame.width - 1;
    var startY = frame.y;
    var endY = frame.y + toastHeight - 1;
    for (var y = startY; y <= endY; y++) {
        try { console.add_hotspot(cmd, false, startX, endX, y); } catch (_) { }
    }
};

IconShell.prototype._unregisterToastHotspot = function (toast) {
    if (!toast || !toast.__shellMeta) return;
    var cmd = toast.__shellMeta.command;
    if (!cmd) return;
    delete this._toastHotspots[cmd];
    if (this._reservedHotspotCommands) delete this._reservedHotspotCommands[cmd];
    toast.__shellMeta.command = null;
    toast.__shellMeta.rect = null;
    log('[toast] unregister hotspot cmd=' + JSON.stringify(cmd) + ' code=' + (cmd ? cmd.charCodeAt(0) : 'null'));
    if (this.hotspotManager && this._toastHotspotLayerId) {
        this._refreshToastHotspotLayer();
        return;
    }
    if (typeof console.delete_hotspot === 'function') {
        try { console.delete_hotspot(cmd); } catch (_) { }
    }
};

IconShell.prototype._updateToastHotspot = function (toast) {
    if (!toast || toast._dismissed || !toast.toastFrame) return;
    var meta = toast.__shellMeta || {};
    var rect = meta.rect || {};
    var frame = toast.toastFrame;
    if (rect && rect.x === frame.x && rect.y === frame.y && rect.width === frame.width && rect.height === frame.height) {
        return;
    }
    log('[toast] update hotspot launch=' + (meta.launch || ''));
    var cmd = meta.command;
    meta.rect = {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: Math.max(1, frame.height || 1)
    };
    if (this.hotspotManager && this._toastHotspotLayerId) {
        this._refreshToastHotspotLayer();
        return;
    }
    if (cmd && typeof console.delete_hotspot === 'function') {
        try { console.delete_hotspot(cmd); } catch (_) { }
    }
    this._registerToastHotspot(toast);
};

IconShell.prototype._reflowAllToasts = function () {
    if (!this.toasts || !this.toasts.length) return;
    var seen = {};
    for (var i = 0; i < this.toasts.length; i++) {
        var toast = this.toasts[i];
        if (!toast || toast._dismissed) continue;
        var pos = this._toastPosition(toast);
        if (!seen[pos]) {
            seen[pos] = true;
            this._reflowToastsForPosition(pos);
        }
    }
};

IconShell.prototype._reflowToastsForPosition = function (position) {
    if (!this.toasts || !this.toasts.length) return;
    var stack = [];
    for (var i = 0; i < this.toasts.length; i++) {
        var toast = this.toasts[i];
        if (!toast || toast._dismissed) continue;
        if (this._toastPosition(toast) === position) stack.push(toast);
    }
    if (!stack.length) return;
    var screenRows = console.screen_rows || (this.root ? this.root.height : 24);
    var gap = 1;
    var isBottom = position.indexOf('bottom') === 0;
    var isTop = position.indexOf('top') === 0 || position === 'center';
    if (isBottom) {
        var baseline = screenRows - gap + 1;
        for (var idx = stack.length - 1; idx >= 0; idx--) {
            var t = stack[idx];
            var height = t.toastFrame.height;
            baseline -= height;
            if (baseline < 1) baseline = 1;
            t.toastFrame.moveTo(t.toastFrame.x, baseline);
            if (typeof t.toastFrame.top === 'function') { try { t.toastFrame.top(); } catch (_) { } }
            if (typeof t.toastFrame.cycle === 'function') { try { t.toastFrame.cycle(); } catch (_) { } }
            baseline -= gap;
            this._updateToastHotspot(t);
        }
    } else if (isTop) {
        var nextY = 1;
        for (var j = stack.length - 1; j >= 0; j--) {
            var tt = stack[j];
            if (nextY > screenRows) break;
            tt.toastFrame.moveTo(tt.toastFrame.x, nextY);
            if (typeof tt.toastFrame.top === 'function') { try { tt.toastFrame.top(); } catch (_) { } }
            if (typeof tt.toastFrame.cycle === 'function') { try { tt.toastFrame.cycle(); } catch (_) { } }
            nextY += tt.toastFrame.height + gap;
            this._updateToastHotspot(tt);
        }
    } else {
        var midY = Math.max(1, Math.floor(screenRows / 2));
        var cursor = midY;
        for (var k = stack.length - 1; k >= 0; k--) {
            var tm = stack[k];
            cursor -= Math.floor(tm.toastFrame.height / 2);
            if (cursor < 1) cursor = 1;
            tm.toastFrame.moveTo(tm.toastFrame.x, cursor);
            if (typeof tm.toastFrame.top === 'function') { try { tm.toastFrame.top(); } catch (_) { } }
            if (typeof tm.toastFrame.cycle === 'function') { try { tm.toastFrame.cycle(); } catch (_) { } }
            cursor -= gap;
            this._updateToastHotspot(tm);
        }
    }
    // Hotspots already updated during positioning above.
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
