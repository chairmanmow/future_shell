// Update openSelection to use changeFolder for both up and down navigation
IconShell.prototype.openSelection = function() {
    dbug('[openSelection] selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length, 'nav');
    var node = this.stack[this.stack.length-1];
    if (!node._cachedChildren) {
        try {
            var rawChildren = node.children ? node.children.slice() : [];
            node._cachedChildren = rawChildren;
            dbug('[cache] snapshot children for ' + (node.label||'') + ' count=' + rawChildren.length, 'nav');
        } catch(e) { node._cachedChildren = []; }
    }
    var hasUp = this.stack.length > 1;
    var tmpNode = { children: node._cachedChildren };
    var items = this._getCurrentItemsWithUp(tmpNode, hasUp);
    if (!items || !items.length) return;
    if (this.selection < 0) this.selection = 0;
    if (this.selection >= items.length) this.selection = items.length - 1;
    var item = items[this.selection];
    if (!item) return;
    // If it's not a folder (or up), show selection flash; skip for folder to avoid extra repaint before redraw
    var isFolderNav = (item.type === 'folder') || (hasUp && this.selection === 0);
    if(!isFolderNav) this.flashSelection();
    if (hasUp && this.selection === 0) {
        dbug('[openSelection] UP action triggered', 'nav');
        this._handleUpSelection(item);
        return;
    }
    dbug('[openSelection] activating label=' + (item.label||'') + ' type=' + item.type, 'nav');
    if (item.type === 'folder') {
        this._handleFolderSelection(item);
        return;
    }
    if (item.type === 'item') {
        this._handleItemSelection(item);
    }
};

IconShell.prototype._getCurrentItemsWithUp = function(node, hasUp) {
    var items = node.children ? node.children.slice() : [];
    if (hasUp) {
        items.unshift({
            label: "..",
            type: "item",
            iconFile:"back",
            action: function() { this.changeFolder(null, { direction: 'up' }); }.bind(this)
        });
    }
    // Ensure each real item action is bound exactly once (so 'this' is IconShell)
    for (var i=0;i<items.length;i++) {
        var it = items[i];
        if (it && typeof it.action === 'function' && !it._icshBound) {
            it.action = it.action.bind(this);
            it._icshBound = true;
        }
    }
    return items;
};

IconShell.prototype._handleUpSelection = function(item) {
    // Up action executes changeFolder(up) via bound action. Do NOT reset selection;
    // changeFolder already restores parent's stored selection & scrollOffset.
    if (typeof item.action === "function") {
        item.action(); // already bound with .bind(this) in _getCurrentItemsWithUp
        this.drawFolder();
    }
};

IconShell.prototype._handleFolderSelection = function(realItem) {
    if (!realItem._viewId && typeof this.generateViewId === 'function') {
        realItem._viewId = this.generateViewId();
        dbug('[folder] assign _viewId=' + realItem._viewId + ' label=' + realItem.label, 'folder');
    }
    var childrenChanged = false;
    var isGamesMenu = realItem.label && realItem.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function';
    if (isGamesMenu) {
        realItem.children = getGamesMenuItems();
        this.assignViewHotkeys(realItem.children);
        childrenChanged = true;
    }
    dbug('[folder] ENTER child label=' + realItem.label + ' children=' + (realItem.children?realItem.children.length:0), 'folder');
    this.changeFolder(realItem, { direction: 'down' });
    // ALWAYS redraw after entering a folder. Previously we only redrew when childrenChanged.
    // That left the grid showing the OLD (parent) folder icons while the stack now pointed
    // at the NEW folder's child list. Result: selection index (against new folder items)
    // didn't match what was visibly highlighted (old grid), so activating selection opened
    // the wrong target (e.g. grid said "Apps" but we launched "Assassin").
    this.drawFolder();
};

IconShell.prototype._handleItemSelection = function(realItem) {
    if (typeof realItem.action === "function") {
        try {
            // Ensure the action runs with IconShell as 'this' (was unbound, breaking runExternal etc.)
            realItem.action.call(this);
        } catch(e) {
            dbug("IconShell action error: " + e, "view");
            if (e === "Exit Shell") throw e;
        }
        this.drawFolder();
    }
};


/**
 * Change the current folder/view.
 * @param {Object|null} targetFolder - The folder object to navigate into, or null/undefined to go up.
 * @param {Object} [options] - Optional: { direction: 'up'|'down' }.
 */
IconShell.prototype.changeFolder = function(targetFolder, options) {
    dbug('[changeFolder] direction=' + (options && options.direction) + ' target=' + (targetFolder?targetFolder.label:'<up>') + ' stackDepth=' + this.stack.length, 'nav');
    options = options || {};
    var direction = options.direction || (targetFolder ? 'down' : 'up');
    if (direction === 'down' && targetFolder) {
        // Store current selection on the parent so we can restore it when coming back
        var parentNode = this.stack[this.stack.length-1];
        parentNode._lastSelectionForChildren = this.selection;
    parentNode._lastScrollOffsetForChildren = this.scrollOffset;
        dbug('[changeFolder] storing parent selection=' + this.selection + ' for ' + (parentNode.label||''), 'nav');
        this.stack.push(targetFolder);
    } else if (direction === 'up') {
        if (this.stack.length > 1) {
            var removed = this.stack.pop();
            dbug('[changeFolder] popped ' + (removed && removed.label), 'nav');
        }
    }
    // Always update currentView and viewHotkeys to match the new top of stack
    var currentNode = this.stack[this.stack.length-1];
    if (currentNode) {
        if (!currentNode._viewId) currentNode._viewId = this.generateViewId();
        this.currentView = currentNode._viewId;
    }
    this.viewHotkeys = {};
    if (direction === 'down') {
        // Reset selection at entry to new folder
        this.selection = 0;
        this.scrollOffset = 0;
    } else if (direction === 'up') {
        // Restore previous selection if available
        var restoreSel = (typeof currentNode._lastSelectionForChildren === 'number') ? currentNode._lastSelectionForChildren : 0;
    var restoreScroll = (typeof currentNode._lastScrollOffsetForChildren === 'number') ? currentNode._lastScrollOffsetForChildren : 0;
    this.selection = restoreSel;
    this.scrollOffset = restoreScroll;
    dbug('[changeFolder] restored selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' for ' + (currentNode.label||''), 'nav');
    }
    this.folderChanged = true;
    if (currentNode && currentNode.children) {
        this.assignViewHotkeys(currentNode.children);
    }
    dbug('[changeFolder] now at label=' + (currentNode && currentNode.label) + ' view=' + this.currentView + ' depth=' + this.stack.length, 'nav');
    // Ensure folder change is immediately reflected visually (especially for non-dynamic folders)
    // Without this, the grid could remain from the previous folder until the next redraw trigger,
    // causing selection/action mismatches.
    // Model A: changeFolder never draws; caller must call drawFolder() once.
};

IconShell.prototype.drawFolder = function() {
    // If a subprogram is active, skip drawing the folder grid to avoid overwriting its frames.
    if (this.activeSubprogram && this.activeSubprogram.running) {
        dbug('drawFolder() skipped due to active subprogram: ' + (this.activeSubprogram.name||'?'), 'drawFolder');
        return;
    }
    dbug('selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length, "drawFolder");
    this._closePreviousFrames();
    this._clearHotspots();
    this.view.clear(ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG);
    var names = [];
    for (var i=0; i<this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
    // Recreate crumb and mouse indicator frames to fit screen
    var mouseIndicatorWidth = 10; // Allow extra space for full text
    var screenWidth = (typeof console !== 'undefined' && console.screen_columns) ? console.screen_columns : this.root.width;
    var crumbWidth = screenWidth - mouseIndicatorWidth;
    if (crumbWidth < 1) crumbWidth = 1;
    // Dispose old frames if they exist
    if (this.crumb && typeof this.crumb.close === 'function') this.crumb.close();
    if (this.mouseIndicator && typeof this.mouseIndicator.close === 'function') this.mouseIndicator.close();
    // Create crumb frame (left)
    this.crumb = new Frame(1, this.root.height, crumbWidth, 1, ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG, this.root);
    this.crumb.open();
    this.crumb.clear(ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG);
    this.crumb.home();
    // Create mouse indicator frame (right)
    var mouseX = crumbWidth + 1;
    var mouseY = this.root.height;
    this.mouseIndicator = new Frame(mouseX, mouseY, mouseIndicatorWidth, 1, ICSH_VALS.MOUSE_ON.BG | ICSH_VALS.MOUSE_ON.FG, this.root);
    this.mouseIndicator.open();
    this._updateMouseIndicator();
    var node = this.stack[this.stack.length-1];
    if (!node._cachedChildren) {
        try {
            var rawChildren = node.children ? node.children.slice() : [];
            node._cachedChildren = rawChildren;
            dbug('[cache] snapshot (draw) children for ' + (node.label||'') + ' count=' + rawChildren.length, 'nav');
        } catch(e) { node._cachedChildren = []; }
    }
    var items = node._cachedChildren.slice();
    if (this.stack.length > 1) {
        items.unshift({
            label: "..",
            type: "item",
            iconFile:"back",
            hotkey: '\x1B',
        });
    }
    this.assignViewHotkeys(items);
    var total = items.length;
    var selectedNum = this.selection + 1;
    this._drawBreadcrumb(names, selectedNum, total);
    var iconW = 12, iconH = 6, labelH = 1, cellW = iconW + 2, cellH = iconH + labelH + 2;
    var cols = Math.max(1, Math.floor(this.view.width / cellW));
    var rows = Math.max(1, Math.floor(this.view.height / cellH));
    var maxIcons = cols * rows;
    this._clampSelection(items);
    this._adjustScroll(items, cols, maxIcons);
    var visibleItems = this._calculateVisibleItems(items, maxIcons);
    this.grid = this.buildIconGrid(this.view, visibleItems);
    this._highlightSelectedCell();
    this._addMouseHotspots();
    this._adjustSelectionWithinBounds(items, maxIcons);
    this.root.cycle();
    // Rendering complete; clear pending change flag
    this.folderChanged = false;
};

IconShell.prototype._updateMouseIndicator = function() {
    if (!this.mouseIndicator) return;
    var isActive = !!this.mouseActive;
    var vals = isActive ? ICSH_VALS.MOUSE_ON : ICSH_VALS.MOUSE_OFF;
    this.mouseIndicator.attr = vals.BG | vals.FG;
    this.mouseIndicator.clear();
    this.mouseIndicator.gotoxy(1, 1);
    // Always write exactly 10 chars, pad if needed
    var msg = isActive ? "MOUSE ON" : "MOUSE OFF";
    if (msg.length < 10) msg += Array(11 - msg.length).join(' ');
    this.mouseIndicator.putmsg(msg);
    this.mouseIndicator.cycle();
};

IconShell.prototype._closePreviousFrames = function() {
    if (this.grid && this.grid.cells) {
        for (var i = 0; i < this.grid.cells.length; i++) {
            if (this.grid.cells[i].icon && typeof this.grid.cells[i].icon.close === 'function') this.grid.cells[i].icon.close();
            if (this.grid.cells[i].label && typeof this.grid.cells[i].label.close === 'function') this.grid.cells[i].label.close();
        }
    }
};

// Temporarily dispose of folder view frames while a subprogram is active to avoid visual residue.
// They will be recreated automatically by recreateFramesIfNeeded/drawFolder when the subprogram exits.
IconShell.prototype._shelveFolderFrames = function() {
    if (this._folderShelved) return; // already done
    try {
        // Close icon cell frames
        this._closePreviousFrames();
        // Clear hotspots so clicks don't route to hidden icons
        this._clearHotspots();
        // Close crumb & mouse indicator
        if (this.crumb && typeof this.crumb.close === 'function') this.crumb.close();
        if (this.mouseIndicator && typeof this.mouseIndicator.close === 'function') this.mouseIndicator.close();
        // Clear primary view surface (avoid leaving stale glyphs behind the subprogram)
        if (this.view && typeof this.view.clear === 'function') this.view.clear();
        // Null out grid so recreateFramesIfNeeded knows to rebuild later
        this.grid = null;
        this._folderShelved = true;
        dbug('[shelve] folder frames shelved', 'subprogram');
    } catch(e) { dbug('[shelve] error: ' + e, 'subprogram'); }
};

IconShell.prototype._clearHotspots = function() {
    if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
};

IconShell.prototype._drawBreadcrumb = function(names, selectedNum, total) {
    // Compose path as /folder1/folder2/...
    var path = '/' + names.join('/');
    // Get user and bbs info if available
    var userName = (typeof user !== 'undefined' && user.name) ? user.name : 'user';
    var bbsName = (typeof system !== 'undefined' && system.name) ? system.name : 'bbs';
    // Get selected item name if available
    var selectedItemName = '';
    if (this.grid && this.grid.cells && this.selection >= 0 && this.selection < this.grid.cells.length) {
        var item = this.grid.cells[this.selection].item;
        if (item && item.label) selectedItemName = item.label;
    }
    var crumbText = userName + '@' + bbsName + ':' + path + '/' + selectedItemName + '$';
    this.crumb.putmsg(crumbText);
};

IconShell.prototype._clampSelection = function(items) {
    if (this.selection < 0) this.selection = 0;
    if (this.selection >= items.length) this.selection = items.length ? items.length-1 : 0;
};

IconShell.prototype._adjustScroll = function(items, cols, maxIcons) {
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
};

IconShell.prototype._calculateVisibleItems = function(items, maxIcons) {
    var visibleItems = items.slice(this.scrollOffset, this.scrollOffset + maxIcons);
    while (visibleItems.length < maxIcons) {
        visibleItems.push({ label: "", type: "placeholder", isPlaceholder: true });
    }
    return visibleItems;
};

IconShell.prototype._highlightSelectedCell = function() {
    if (this.grid && this.grid.cells) {
        var selIdx = this.selection - this.scrollOffset;
        if (selIdx >= 0 && selIdx < this.grid.cells.length) {
            this.paintIcon(this.grid.cells[selIdx], true, false);
        }
    }
};

IconShell.prototype._addMouseHotspots = function() {
    // Note: Passing swallow=false to avoid "hungry" hotspots that appear to consume
    // clicks beyond their intended horizontal bounds on partially filled rows.
    if (this.grid && this.grid.cells && typeof console.add_hotspot === 'function') {
        var FILL_CMD = (typeof ICSH_HOTSPOT_FILL_CMD !== 'undefined') ? ICSH_HOTSPOT_FILL_CMD : '\x7F';
        var perRow = {}; // rowIndex -> { y, iconHeight, rightMost }
        for (var i = 0; i < this.grid.cells.length; i++) {
            var cell = this.grid.cells[i];
            var item = cell.item;
            if (!item.hotkey || item.type === 'placeholder') continue; // skip placeholders
            var cmd = item.hotkey;
            var min_x = cell.icon.x;
            var max_x = cell.icon.x + cell.icon.width - 1; // strictly icon width
            var y = cell.icon.y;
            dbug('[HOTSPOT] i=' + i + ' label=' + (item.label || '') + ' hotkey=' + cmd + ' x=' + min_x + '-' + max_x + ' y=' + y + '-' + (y + cell.icon.height - 1), 'hotspots');
            for (var row = 0; row < cell.icon.height; row++) {
                try { console.add_hotspot(cmd, false, min_x, max_x, y + row); } catch(e) {}
            }
            // Optionally include label line for easier clicking (keep within same horizontal bounds)
            try { console.add_hotspot(cmd, false, min_x, max_x, y + cell.icon.height); } catch(e) {}
            var rIdx = Math.floor(i / this.grid.cols);
            if (!perRow[rIdx]) perRow[rIdx] = { y: y, iconHeight: cell.icon.height, rightMost: max_x };
            else if (max_x > perRow[rIdx].rightMost) perRow[rIdx].rightMost = max_x;
        }
        // Add filler hotspots (swallow clicks) for gap area to the right of last real icon in each row
        var viewRight = this.view.x + this.view.width - 1;
        for (var rk in perRow) {
            var info = perRow[rk];
            if (info.rightMost < viewRight) {
                for (var ry = 0; ry <= info.iconHeight; ry++) { // cover icon + label line
                    try { console.add_hotspot(FILL_CMD, false, info.rightMost + 1, viewRight, info.y + ry); } catch(e) {}
                }
            }
        }
    }
};

IconShell.prototype._adjustSelectionWithinBounds = function(items, maxIcons) {
    if (this.selection < this.scrollOffset) this.selection = this.scrollOffset;
    var visibleCount = Math.min(items.length - this.scrollOffset, maxIcons);
    if (this.selection >= this.scrollOffset + visibleCount) this.selection = this.scrollOffset + (visibleCount ? visibleCount - 1 : 0);
    if (this.selection < 0) this.selection = 0;
};

IconShell.prototype.buildIconGrid = function (parentFrame, items) {
    var dims = this._calculateGridDimensions(parentFrame);
    if (dims.maxRows < 1 || dims.cols < 1) {
        return this._handleScreenTooSmall(parentFrame, "[Screen too small for icons]", dims.iconW, dims.iconH);
    }
    var maxIcons = dims.cols * dims.maxRows;
    var cells = [];
    // var Icon = load("iconshell/lib/icon.js");
    for (var i = 0; i < items.length && i < maxIcons; i++) {
        var cell = this._createIconCell(i, dims, items, parentFrame, Icon);
        cells.push(cell);
    }
    var rows = Math.ceil(Math.min(items.length, maxIcons) / dims.cols);
    return { cells: cells, cols: dims.cols, rows: rows, iconW: dims.iconW, iconH: dims.iconH };
};

IconShell.prototype._calculateGridDimensions = function(parentFrame) {
    var iconW = ICSH_CONSTANTS.ICON_W;
    var iconH = ICSH_CONSTANTS.ICON_H;
    var labelH = 1;
    var cellW = iconW + 2;
    var cellH = iconH + labelH + 2;
    var cols = Math.max(1, Math.floor(parentFrame.width / cellW));
    var maxRows = Math.max(1, Math.floor(parentFrame.height / cellH));
    return { iconW: iconW, iconH: iconH, labelH: labelH, cellW: cellW, cellH: cellH, cols: cols, maxRows: maxRows };
};

IconShell.prototype._createIconCell = function(i, dims, items, parentFrame, Icon) {
    var col = i % dims.cols;
    var row = Math.floor(i / dims.cols);
    var x = (col * dims.cellW) + 2;
    var y = (row * dims.cellH) + 1;
    // If this is a placeholder (padding cell), don't create visible frames.
    // Preserve a cell object so selection math & hotspots (which skip placeholders) still work.
    if (items[i] && items[i].isPlaceholder) {
        return { icon: { x:x, y:y, width:dims.iconW, height:dims.iconH, isPlaceholder:true },
                 label: { x:x, y:y + dims.iconH, width:dims.iconW, height:dims.labelH, isPlaceholder:true },
                 item: items[i], iconObj: null };
    }
    var hasBg = typeof items[i].iconBg !== 'undefined';
    var hasFg = typeof items[i].iconFg !== 'undefined';
    var iconAttr = 0;
    if (hasBg || hasFg) {
        iconAttr = (hasBg ? items[i].iconBg : 0) | (hasFg ? items[i].iconFg : 0);
    }
    var iconFrame = new Frame(x, y, dims.iconW, dims.iconH, iconAttr, parentFrame);
    var labelFrame = new Frame(x, y + dims.iconH, dims.iconW, dims.labelH, ICSH_ATTR('FRAME_STANDARD'), parentFrame);
    var iconObj = new Icon(iconFrame, labelFrame, items[i], i == 0);
    iconObj.render();
    return { icon: iconFrame, label: labelFrame, item: items[i], iconObj: iconObj };
};

IconShell.prototype._handleScreenTooSmall = function(parentFrame, msg, iconW, iconH) {
    var msgX = Math.max(1, Math.floor((parentFrame.width - msg.length) / 2));
    var msgY = Math.max(1, Math.floor(parentFrame.height / 2));
    parentFrame.gotoxy(msgX, msgY);
    parentFrame.putmsg(msg);
    return { cells: [], cols: 0, rows: 0, iconW: iconW, iconH: iconH };
};

IconShell.prototype.paintIcon = function (cell, selected, invert) {
    dbug('[paintIcon] called for label="' + (cell.item && cell.item.label) + '" selected=' + selected + ' invert=' + invert, "view");
    var item = cell.item;
    if (item && item.isPlaceholder) return; // nothing to paint
    if (typeof item.iconBg !== 'undefined' && typeof item.iconFg !== 'undefined') {
        cell.icon.clear(item.iconBg | item.iconFg);
    }

	// Highlight label if selected
    var labelAttr = selected
        ? (ICSH_VALS.SELECTED.BG | ICSH_VALS.SELECTED.FG)
        : (ICSH_VALS.LABEL.BG | ICSH_VALS.LABEL.FG);
	cell.label.clear(labelAttr);
	cell.label.home();
	var name = item.label || "";
	var start = Math.max(0, Math.floor((cell.icon.width - name.length) / 2));
	var pad = repeatChar(" ", start);
	cell.label.putmsg(pad + name.substr(0, cell.icon.width));
}