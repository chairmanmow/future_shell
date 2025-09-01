load("iconshell/lib/debug.js");



// Update openSelection to use changeFolder for both up and down navigation
IconShell.prototype.openSelection = function() {
    dbug("open Selection", "view");
    this.flashSelection();
    var node = this.stack[this.stack.length-1];
    var hasUp = this.stack.length > 1;
    var items = this._getCurrentItemsWithUp(node, hasUp);
    if (!items.length) return;
    var item = items[this.selection];
    if (!item) return;

    if (hasUp && this.selection === 0) {
        this._handleUpSelection(item);
        return;
    }

    var realIndex = hasUp ? this.selection - 1 : this.selection;
    var realChildren = node.children || [];
    if (!realChildren.length || realIndex < 0 || realIndex >= realChildren.length) return;
    var realItem = realChildren[realIndex];
    if (realItem.type === "folder") {
        this._handleFolderSelection(realItem);
        return;
    }
    if (realItem.type === "item") {
        this._handleItemSelection(realItem);
    }
};

IconShell.prototype._getCurrentItemsWithUp = function(node, hasUp) {
    var items = node.children ? node.children.slice() : [];
    if (hasUp) {
        items.unshift({
            label: "..",
            type: "item",
            iconFile:"back",
            action: function() {
                this.changeFolder(null, { direction: 'up' });
            }.bind(this)
        });
    }
    return items;
};

IconShell.prototype._handleUpSelection = function(item) {
    if (typeof item.action === "function") {
        item.action();
        this.selection = 0;
        this.scrollOffset = 0;
        this.drawFolder();
    }
};

IconShell.prototype._handleFolderSelection = function(realItem) {
    var childrenChanged = false;
    var isWhoCmd = realItem.label === "Who" && typeof getOnlineUserIcons === 'function';
    if (isWhoCmd) {
        realItem.children = getOnlineUserIcons();
        this.assignViewHotkeys(realItem.children);
        childrenChanged = true;
    }
    var isGamesMenu = realItem.label && realItem.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function';
    if (isGamesMenu) {
        realItem.children = getGamesMenuItems();
        this.assignViewHotkeys(realItem.children);
        childrenChanged = true;
    }
    this.changeFolder(realItem, { direction: 'down' });
    if (childrenChanged) this.drawFolder();
};

IconShell.prototype._handleItemSelection = function(realItem) {
    if (typeof realItem.action === "function") {
        try {
            realItem.action();
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
    dbug("change folder?", "view");
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
    dbug("Change folder to view " + this.currentView + " (" + direction + ")", "view");
};

IconShell.prototype.drawFolder = function() {
    dbug('selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length, "drawFolder");
    this._closePreviousFrames();
    this._clearHotspots();
    this.view.clear(ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG);
    var names = [];
    for (var i=0; i<this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
    this.crumb.clear(ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG);
    this.crumb.home();
    var node = this.stack[this.stack.length-1];
    var items = node.children ? node.children.slice() : [];
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
};

IconShell.prototype._closePreviousFrames = function() {
    if (this.grid && this.grid.cells) {
        for (var i = 0; i < this.grid.cells.length; i++) {
            if (this.grid.cells[i].icon && typeof this.grid.cells[i].icon.close === 'function') this.grid.cells[i].icon.close();
            if (this.grid.cells[i].label && typeof this.grid.cells[i].label.close === 'function') this.grid.cells[i].label.close();
        }
    }
};

IconShell.prototype._clearHotspots = function() {
    if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
};

IconShell.prototype._drawBreadcrumb = function(names, selectedNum, total) {
    var itemInfo = " (Item " + selectedNum + "/" + total + ")";
    this.crumb.putmsg(" " + names.join(" \x10 ") + " " + itemInfo);
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
    if (this.grid && this.grid.cells && typeof console.add_hotspot === 'function') {
        for (var i = 0; i < this.grid.cells.length; i++) {
            var cell = this.grid.cells[i];
            var item = cell.item;
            if (!item.hotkey) continue;
            var cmd = item.hotkey;
            var min_x = cell.icon.x;
            var max_x = cell.icon.x + cell.icon.width - 1;
            var y = cell.icon.y;
            dbug('[HOTSPOT] i=' + i + ' label=' + (item.label || '') + ' hotkey=' + cmd + ' x=' + min_x + '-' + max_x + ' y=' + y + '-' + (y + cell.icon.height - 1), "hotspots");
            for (var row = 0; row < cell.icon.height; row++) {
                console.add_hotspot(cmd, true, min_x, max_x, y + row);
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
    var Icon = load("iconshell/lib/icon.js");
    log("render " + items.length + " items. First item" + JSON.stringify(items[0]) + "\r\nSecven:" + JSON.stringify(items[7]));
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
    var hasBg = typeof items[i].iconBg !== 'undefined';
    var hasFg = typeof items[i].iconFg !== 'undefined';
    var iconAttr = 0;
    if (hasBg || hasFg) {
        iconAttr = (hasBg ? items[i].iconBg : 0) | (hasFg ? items[i].iconFg : 0);
    }
    var iconFrame = new Frame(x, y, dims.iconW, dims.iconH, iconAttr, parentFrame);
    var labelFrame = new Frame(x, y + dims.iconH, dims.iconW, dims.labelH, BG_BLACK|LIGHTGRAY, parentFrame);
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