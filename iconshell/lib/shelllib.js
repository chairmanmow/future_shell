// Run an external program and always refresh the shell UI after
load("iconshell/lib/eye_candy.js");
load('iconshell/lib/chat.js');
load("sbbsdefs.js");
load("iconshell/lib/helpers.js");
load("iconshell/lib/config.js");
load("iconshell/lib/hotkeys.js");
load("iconshell/lib/grid_nav.js");
load("iconshell/lib/launch.js");
load("iconshell/lib/debug.js");
load("json-client.js")
load("json-chat.js")

// IconShell prototype extensions for member logic
// Run time logic
// Add subprogram state to IconShell
IconShell.prototype.init = function() {
    dbug("Initialize icon shell 42A","init")
    // === Instance state ===
    // Main root frame for the entire shell UI
    this.root = new Frame(1, 1, console.screen_columns, console.screen_rows, ICSH_VALS.ROOT.BG | ICSH_VALS.ROOT.FG);
    this.root.open();
    // Main icon view area (excludes crumb bar)
    this.view = new Frame(1, 1, this.root.width, this.root.height - 1, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.root);
    this.view.open();
    // Breadcrumb bar at the bottom
    this.crumb = new Frame(1, this.root.height, this.root.width, 1, ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG, this.root);
    this.crumb.open();
    // Stack of folder nodes (for navigation)
    this.stack = [ICSH_CONFIG];
    // Current selection index (absolute, not relative to scroll)
    this.selection = 0;
    // Current icon grid (object with .cells, .cols, .rows)
    this.grid = null;
    // Current scroll offset (index of first visible item)
    this.scrollOffset = 0;
    // Set true if folder was changed and needs redraw
    this.folderChanged = false;
    // Last known screen size (for resize detection)
    this.lastCols = console.screen_columns;
    this.lastRows = console.screen_rows;
    // Current view ID (for dynamic menus)
    this.currentView = "view1";
    // Hotkey map for current view
    this.viewHotkeys = {};
    // Subprogram state: null or { name, handlers }
    this.activeSubprogram = null;
    // === End instance state ===
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
        if (packet && packet.oper && packet.oper.toUpperCase() === "WRITE") {
            dbug(!!self.activeSubprogram + "Incoming chat messageABC: " + JSON.stringify(packet), "chat");
            if(self.activeSubprogram && self.activeSubprogram.updateChat) self.activeSubprogram.updateChat(packet);
        return origUpdate.call(this, packet)}
    }
    // Assign hotkeys for root view
    this.assignViewHotkeys(ICSH_CONFIG.children);
    this.drawFolder();
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
            // Non-blocking input: 100ms timeout
            var key = console.inkey(K_NOECHO|K_NOSPIN, 100);
            if (typeof key === 'string' && key.length > 0) {
                dbug("Key:" + key, "keylog");
                this.processKeyboardInput(key);
            }
            yield(true);
        }
    } finally {
        if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    }
};

// Refactor processKeyboardInput to not call changeFolder() with no argument
IconShell.prototype.processKeyboardInput = function(ch) {
    dbug("Shell processing keyboard input:" + ch, "keylog");
    if (this.activeSubprogram) {
        this._handleSubprogramKey(ch);
        return;
    }
    if (this._handleNavigationKey(ch)) return true;
    if (this._handleHotkeyAction(ch)) return true;
    if (this._handleHotkeyItemSelection(ch)) return true;
    return false;
};

IconShell.prototype._handleSubprogramKey = function(ch) {
    dbug("received key " + ch + " to proxy to active subprogram", "subprogram");
    if (typeof this.activeSubprogram.handleKey === 'function') {
        dbug("subprogram has handleKey() function", "subprogram");
        this.activeSubprogram.handleKey(ch);
    }
};

IconShell.prototype._handleNavigationKey = function(ch) {
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
                    this.drawFolder();
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
            this.drawFolder();
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
                this.drawFolder();
            }
            return true;
        }
    }
    return false;
};











