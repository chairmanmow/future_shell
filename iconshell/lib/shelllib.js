// Run an external program and always refresh the shell UI after
load("iconshell/lib/eye_candy.js");
IconShell.prototype.runExternal = function(fn) {
    try {
        // Optional: dissolve animation before clearing and launching external
        if (this.view && typeof dissolve === 'function') {
            dissolve(this.view, GREEN, 0); // 2ms delay for visible effect
        }
        console.attr = BG_BLACK|LIGHTGRAY;
        console.clear();
        log("RUNNING EXTERNAL PROGRAM WRAPPER");
        fn();
        log("EXITING EXTERNAL PROGRAMMING RECREATING FRAMES?");
    } finally {
        console.clear();
        this.recreateFramesIfNeeded();
        // Always refresh dynamic children and hotkeys for current folder after external program
        var node = this.stack && this.stack.length ? this.stack[this.stack.length-1] : null;
        if (node && node.label && node.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function') {
            node.children = getGamesMenuItems();
            this.assignViewHotkeys(node.children);
        }
        this.drawFolder();
    }
};
load("sbbsdefs.js");
load("iconshell/lib/helpers.js");

// IconShell prototype extensions for member logic
// Run time logic
IconShell.prototype.init = function() {
    log("Initialize icon shell");
    // === Instance state ===
    // Main root frame for the entire shell UI
    this.root = new Frame(1, 1, console.screen_columns, console.screen_rows, BG_BLACK|LIGHTGRAY);
    this.root.open();
    // Main icon view area (excludes crumb bar)
    this.view = new Frame(1, 1, this.root.width, this.root.height - 1, BG_BLACK|LIGHTGRAY, this.root);
    this.view.open();
    // Breadcrumb bar at the bottom
    this.crumb = new Frame(1, this.root.height, this.root.width, 1, BG_BLUE|WHITE, this.root);
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
    // === End instance state ===

    // Assign hotkeys for root view
    this.assignViewHotkeys(ICSH_CONFIG.children);
    this.drawFolder();
    // Enable mouse mode for hotspots
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
};

IconShell.prototype.main = function() {
    try {
        while (!js.terminated) {
            this.recreateFramesIfNeeded();
            var key = console.getkey(K_NOECHO|K_NOSPIN);
            if (typeof key === 'string' && key.length > 0) {
                var ch = key;
                log("Key:" + ch);
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
    log("process keyboard input " + ch);
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
            log("Checking view " + viewId + " hot keys." + JSON.stringify(hotkeyMap));
            // Try all forms: raw, uppercase, lowercase
            var action = hotkeyMap[ch];
            if (typeof action === 'function') {
                log("Executing hotkey action for " + ch + " in view " + viewId);
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
                    log(item.hotkey + ":" + item.label);
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

IconShell.prototype.assignViewHotkeys = function(items, logit) {
    if (!items) return;
    var used = {};
    // Ensure currentView is set
    if (!this.currentView) this.currentView = this.generateViewId ? this.generateViewId() : "root";
    this.viewHotkeys[this.currentView] = {};
    this.assignHotkeys(items, used, logit, this.currentView);
};

IconShell.prototype.assignHotkeys = function (items, used, logit, viewId) {
    used = used || {};
    viewId = viewId || (this.currentView || "root");
    var hotkeyPool = [];
    // Add uppercase A-Z
    for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(65 + k));
    // Add digits 0-9
    for (var k = 0; k < 10; k++) hotkeyPool.push(String.fromCharCode(48 + k));
    // Add lowercase a-z
    for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(97 + k));

    var fallbackCount = 1;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type === 'placeholder') continue;
        // Assign hotkey if not already set
        if (!item.hotkey) {
            var label = item.label || "";
            var found = false;
            // Try to assign a hotkey from the label (A-Z, 0-9, a-z)
            for (var j = 0; j < label.length; j++) {
                var c = label[j];
                if (hotkeyPool.indexOf(c) !== -1 && !used[c]) {
                    item.hotkey = c;
                    used[c] = true;
                    found = true;
                    if(logit) log(item.label + " Assign hotkey " + JSON.stringify(item.hotkey));
                    break;
                }
                var cU = c;
                if (hotkeyPool.indexOf(cU) !== -1 && !used[cU]) {
                    item.hotkey = cU;
                    used[cU] = true;
                    found = true;
                    if(logit) log(item.label + " Assign hotkey " + JSON.stringify(item.hotkey));
                    break;
                }
            }
            // fallback: assign any unused hotkey from the pool
            if (!found) {
                for (var h = 0; h < hotkeyPool.length; h++) {
                    var hk = hotkeyPool[h];
                    if (!used[hk]) {
                        item.hotkey = hk;
                        used[hk] = true;
                        found = true;
                        if(logit) log(item.label + " Assign hotkey " + JSON.stringify(item.hotkey));
                        break;
                    }
                }
            }
            // If still not found, assign a fallback hotkey (e.g., F1, F2, ...)
            if (!found) {
                var fallbackKey = 'F' + fallbackCount;
                item.hotkey = fallbackKey;
                used[fallbackKey] = true;
                fallbackCount++;
                log(LOG_WARNING, "Hotkey pool exhausted, assigning fallback hotkey " + fallbackKey + " to " + item.label);
            }
        } else {
            used[item.hotkey] = true;
            if(logit) log(item.label + " Assign hotkey " + JSON.stringify(item.hotkey));
        }
        // Register the action for this hotkey in the viewHotkeys map
        if (!this.viewHotkeys[viewId]) this.viewHotkeys[viewId] = {};
        if (item.hotkey && typeof item.action === 'function') {
            this.viewHotkeys[viewId][item.hotkey] = item.action.bind(this);
        }
    }
}

// Update openSelection to use changeFolder for both up and down navigation
IconShell.prototype.openSelection = function() {
    log("open Selection");
    this.flashSelection();
    // Use instance state directly
    var node = this.stack[this.stack.length-1];
    var hasUp = this.stack.length > 1;
    // Build the current items array (with up if needed)
    var items = node.children ? node.children.slice() : [];
    if (hasUp) {
        items.unshift({
            label: "..",
            type: "item",
            iconBg: BG_LIGHTGRAY,
            iconFg: BLACK,
            action: function() {
                this.changeFolder(null, { direction: 'up' });
            }.bind(this)
        });
    }
    if (!items.length) return;
    var item = items[this.selection];
    if (!item) return;

    // If '..' is selected, just run its action
    if (hasUp && this.selection === 0) {
        if (typeof item.action === "function") {
            item.action();
            // After going up, always reset selection/scroll and redraw
            this.selection = 0;
            this.scrollOffset = 0;
            this.drawFolder();
        }
        return;
    }

    // For all other items, adjust index if '..' is present
    var realIndex = hasUp ? this.selection - 1 : this.selection;
    var realChildren = node.children || [];
    if (!realChildren.length || realIndex < 0 || realIndex >= realChildren.length) return;
    var realItem = realChildren[realIndex];
    if (realItem.type === "folder") {
        // If Who's Online, always rebuild children
        var childrenChanged = false;
        var isWhoCmd = realItem.label === "Who" && typeof getOnlineUserIcons === 'function';
        if (isWhoCmd) {
            realItem.children = getOnlineUserIcons();
            this.assignViewHotkeys(realItem.children);
            childrenChanged = true;
        }
        // If Games, always rebuild children and assign hotkeys
        var isGamesMenu = realItem.label && realItem.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function';
        if (isGamesMenu) {
            realItem.children = getGamesMenuItems();
            this.assignViewHotkeys(realItem.children);
            childrenChanged = true;
        }
        this.changeFolder(realItem, { direction: 'down' });
        if (childrenChanged) this.drawFolder();
        return;
    }
    if (realItem.type === "item") {
        // Visual feedback: flash selection, then run action
        if (typeof realItem.action === "function") {
            try {
                realItem.action();
            } catch(e) {
                log(LOG_ERR, "IconShell action error: " + e);
                if (e === "Exit Shell") throw e;
            }
            // Always re-initialize frames and redraw after action (for external programs)
            this.drawFolder();
        }
    }
};


/**
 * Change the current folder/view.
 * @param {Object|null} targetFolder - The folder object to navigate into, or null/undefined to go up.
 * @param {Object} [options] - Optional: { direction: 'up'|'down' }.
 */
IconShell.prototype.changeFolder = function(targetFolder, options) {
    log("change folder?");
    options = options || {};
    var direction = options.direction || (targetFolder ? 'down' : 'up');
    if (direction === 'down' && targetFolder) {
        this.stack.push(targetFolder);
    } else if (direction === 'up') {
        if (this.stack.length > 1) {
            this.stack.pop();
        }
    }
    // Always update currentView and viewHotkeys to match the new top of stack
    var currentNode = this.stack[this.stack.length-1];
    if (currentNode && currentNode.viewId) {
        this.currentView = currentNode.viewId;
    } else {
        this.currentView = this.generateViewId();
    }
    this.viewHotkeys = {};
    this.selection = 0;
    this.scrollOffset = 0;
    this.folderChanged = true;
    if (currentNode && currentNode.children) {
        this.assignViewHotkeys(currentNode.children);
    }
    log("Change folder to view " + this.currentView + " (" + direction + ")");
};

IconShell.prototype.drawFolder = function() {
    log('[drawFolder] called. selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length);
    // Close previous icon/label frames if any
    if (this.grid && this.grid.cells) {
        for (var i = 0; i < this.grid.cells.length; i++) {
            if (this.grid.cells[i].icon && typeof this.grid.cells[i].icon.close === 'function') this.grid.cells[i].icon.close();
            if (this.grid.cells[i].label && typeof this.grid.cells[i].label.close === 'function') this.grid.cells[i].label.close();
        }
    }
    // Clear all mouse hotspots before redrawing
    if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
    // clear view area
    this.view.clear(BG_BLACK|LIGHTGRAY);
    // compute breadcrumb text
    var names = [];
    for (var i=0; i<this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
    this.crumb.clear(BG_BLUE|WHITE);
    this.crumb.home();
    var node = this.stack[this.stack.length-1];
    // Use instance state for items (all children, including up-item if present)
    var items = node.children ? node.children.slice() : [];
    if (this.stack.length > 1) {
        items.unshift({
            label: "..",
            type: "item",
            hotkey: '\x1B',
            iconBg: BG_LIGHTGRAY,
            iconFg: BLACK
        });
    }
    // Assign hotkeys to all items (not just visible)
    this.assignViewHotkeys(items);
    var total = items.length;
    var selectedNum = this.selection + 1;
    var itemInfo = " (Item " + selectedNum + "/" + total + ")";
    this.crumb.putmsg(" " + names.join(" \x10 ") + " " + itemInfo);
    // build icon frames grid from current folder children
    var iconW = 12, iconH = 6, labelH = 1, cellW = iconW + 2, cellH = iconH + labelH + 2;
    var cols = Math.max(1, Math.floor(this.view.width / cellW));
    var rows = Math.max(1, Math.floor(this.view.height / cellH));
    var maxIcons = cols * rows;
    // Clamp selection
    if (this.selection < 0) this.selection = 0;
    if (this.selection >= items.length) this.selection = items.length ? items.length-1 : 0;
    // Only scroll if selection is outside the visible window, and jump by a full page
    var maxRow = Math.max(0, Math.floor((items.length - 1) / cols));
    var pageRows = Math.max(1, Math.floor(maxIcons / cols));
    var selRow = Math.floor(this.selection / cols);
    var firstVisibleRow = Math.floor(this.scrollOffset / cols);
    var lastVisibleRow = firstVisibleRow + pageRows - 1;
    if (selRow < firstVisibleRow) {
        this.scrollOffset = Math.max(0, (firstVisibleRow - pageRows) * cols);
        if (selRow < Math.floor(this.scrollOffset / cols)) {
            this.scrollOffset = selRow * cols;
        }
    } else if (selRow > lastVisibleRow) {
        this.scrollOffset = Math.min((selRow) * cols, Math.max(0, items.length - maxIcons));
    }
    // Only show the visible window of items, pad with empty placeholders if needed
    var visibleItems = items.slice(this.scrollOffset, this.scrollOffset + maxIcons);
    while (visibleItems.length < maxIcons) {
        visibleItems.push({ label: "", type: "placeholder", isPlaceholder: true });
    }
    this.grid = this.buildIconGrid(this.view, visibleItems);
    // Highlight the selected cell
    if (this.grid && this.grid.cells) {
        var selIdx = this.selection - this.scrollOffset;
        if (selIdx >= 0 && selIdx < this.grid.cells.length) {
            this.paintIcon(this.grid.cells[selIdx], true, false);
        }
    }
    // Add mouse hotspots for each icon cell using hotkey (from visibleItems, but hotkeys from full items array)
    if (this.grid && this.grid.cells && typeof console.add_hotspot === 'function') {
        for (var i = 0; i < this.grid.cells.length; i++) {
            var cell = this.grid.cells[i];
            var item = cell.item;
            if (!item.hotkey) continue;
            var cmd = item.hotkey;
            var min_x = cell.icon.x;
            var max_x = cell.icon.x + cell.icon.width - 1;
            var y = cell.icon.y;
            log('[HOTSPOT] i=' + i + ' label=' + (item.label || '') + ' hotkey=' + cmd + ' x=' + min_x + '-' + max_x + ' y=' + y + '-' + (y + cell.icon.height - 1));
            for (var row = 0; row < cell.icon.height; row++) {
                console.add_hotspot(cmd, true, min_x, max_x, y + row);
            }
        }
    }
    // set initial selection within bounds of visible, non-placeholder items
    if (this.selection < this.scrollOffset) this.selection = this.scrollOffset;
    var visibleCount = Math.min(items.length - this.scrollOffset, maxIcons);
    if (this.selection >= this.scrollOffset + visibleCount) this.selection = this.scrollOffset + (visibleCount ? visibleCount - 1 : 0);
    if (this.selection < 0) this.selection = 0;
    // this.updateHighlight();
    this.root.cycle();
};

IconShell.prototype.buildIconGrid = function (parentFrame, items) {
	var iconW = ICSH_CONSTANTS.ICON_W;
	var iconH = ICSH_CONSTANTS.ICON_H;
	var labelH = 1;
	var cellW = iconW + 2;
	var cellH = iconH + labelH + 2;
	var cols = Math.max(1, Math.floor(parentFrame.width / cellW));
	var maxRows = Math.max(1, Math.floor(parentFrame.height / cellH));
	if (maxRows < 1 || cols < 1) {
		var msg = "[Screen too small for icons]";
		var msgX = Math.max(1, Math.floor((parentFrame.width - msg.length) / 2));
		var msgY = Math.max(1, Math.floor(parentFrame.height / 2));
		parentFrame.gotoxy(msgX, msgY);
		parentFrame.putmsg(msg);
		return { cells: [], cols: 0, rows: 0, iconW: iconW, iconH: iconH };
	}
	var maxIcons = cols * maxRows;
	var cells = [];
	var Icon = load("iconshell/lib/icon.js");
	for (var i = 0; i < items.length && i < maxIcons; i++) {
		var col = i % cols;
		var row = Math.floor(i / cols);
		var x = (col * cellW) + 2;
		var y = (row * cellH) + 1;
		var hasBg = typeof items[i].iconBg !== 'undefined';
		var hasFg = typeof items[i].iconFg !== 'undefined';
		var iconAttr = 0;
		if (hasBg || hasFg) {
			iconAttr = (hasBg ? items[i].iconBg : 0) | (hasFg ? items[i].iconFg : 0);
		}
		var iconFrame = new Frame(x, y, iconW, iconH, iconAttr, parentFrame);
		var labelFrame = new Frame(x, y + iconH, iconW, labelH, BG_BLACK|LIGHTGRAY, parentFrame);
		var iconObj = new Icon(iconFrame, labelFrame, items[i]);
		iconObj.render();
		cells.push({ icon: iconFrame, label: labelFrame, item: items[i], iconObj: iconObj });
	}
	var rows = Math.ceil(Math.min(items.length, maxIcons) / cols);
	return { cells: cells, cols: cols, rows: rows, iconW: iconW, iconH: iconH };
}

IconShell.prototype.paintIcon = function (cell, selected, invert) {
    log('[paintIcon] called for label="' + (cell.item && cell.item.label) + '" selected=' + selected + ' invert=' + invert);
    var item = cell.item;
	var hasBg = typeof item.iconBg !== 'undefined';
	var hasFg = typeof item.iconFg !== 'undefined';
	if (hasBg || hasFg) {
		var baseAttr = (hasBg ? item.iconBg : 0) | (hasFg ? item.iconFg : 0);
		cell.icon.clear(baseAttr);
	}

	// Highlight label if selected
	var labelAttr = selected ? (BG_BLUE | WHITE) : (BG_BLACK | LIGHTGRAY);
	cell.label.clear(labelAttr);
	cell.label.home();
	var name = item.label || "";
	var start = Math.max(0, Math.floor((cell.icon.width - name.length) / 2));
	var pad = repeatChar(" ", start);
	cell.label.putmsg(pad + name.substr(0, cell.icon.width));
}








