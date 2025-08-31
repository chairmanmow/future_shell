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


// IconShell prototype extensions for member logic
// Run time logic
// Add subprogram state to IconShell
IconShell.prototype.init = function() {
    dbug("Initialize icon shell","init")
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
    this.chat = new Chat();
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
            // If a subprogram is active and has an enter() method, let it run exclusively

            var key = console.getkey(K_NOECHO|K_NOSPIN);

             if (typeof key === 'string' && key.length > 0) {
                var ch = key;
                dbug("Key:" + ch,"keylog")
                this.processKeyboardInput(ch);
            }
            yield(true);
        }
    } finally {
        if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    }
};

// Refactor processKeyboardInput to not call changeFolder() with no argument
IconShell.prototype.processKeyboardInput = function(ch) {
    dbug("Shell processing keyboard input:" + ch,"keylog")
        if (this.activeSubprogram) {
            dbug("received key " + ch + " to proxy to active subprogram","subprogram")
            if (typeof this.activeSubprogram.handleKey === 'function') {
                dbug("subprogram has handleKey() function","subprogram")
                this.activeSubprogram.handleKey(ch);
            }
            return;
        }
    // Navigation keys
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
            // Use viewHotkeys for currentView
            var viewId = this.currentView || (this.generateViewId ? this.generateViewId() : "root");
            var hotkeyMap = this.viewHotkeys[viewId] || {};
            dbug("Checking view " + viewId + " hot keys." + JSON.stringify(hotkeyMap), "hotkeys");
            // Try all forms: raw, uppercase, lowercase
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
            // If not a function, try to find the item and open it (for folders/items)
            var node = this.stack[this.stack.length-1];
            var items = node.children ? node.children.slice() : [];
            if (this.stack.length > 1) {
                items.unshift({ label: "..", type: "item", hotkey: "\x1B" });
            }
            var iconW = 12, iconH = 6, labelH = 1, cellW = iconW + 2, cellH = iconH + labelH + 2;
            var cols = Math.max(1, Math.floor(this.view.width / cellW));
            var rows = Math.max(1, Math.floor(this.view.height / cellH));
            var maxIcons = cols * rows;
            var visibleItems = items.slice(this.scrollOffset, this.scrollOffset + maxIcons);
            for (var i = 0; i < visibleItems.length; i++) {
                var item = visibleItems[i];
                if (item.hotkey && ch === item.hotkey) {
                    dbug(item.hotkey + ":" + item.label, "hotkeys")
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
    }
};











