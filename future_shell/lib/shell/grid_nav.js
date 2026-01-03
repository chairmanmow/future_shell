// Update openSelection to use changeFolder for both up and down navigation
IconShell.prototype.openSelection = function () {
    var logFile = new File(system.logs_dir + 'dissolve_debug.log');
    logFile.open('a');
    logFile.writeln('[openSelection] called');

    dbug('[openSelection] selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length, 'nav');
    var node = this.stack[this.stack.length - 1];
    if (!node._cachedChildren) {
        try {
            var rawChildren = node.children ? node.children.slice() : [];
            node._cachedChildren = rawChildren;
            dbug('[cache] snapshot children for ' + (node.label || '') + ' count=' + rawChildren.length, 'nav');
        } catch (e) { node._cachedChildren = []; }
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
    if (!isFolderNav) this.flashSelection();
    if (hasUp && this.selection === 0) {
        logFile.writeln('[openSelection] UP action triggered');
        logFile.close();
        dbug('[openSelection] UP action triggered', 'nav');
        this._handleUpSelection(item);
        return;
    }
    logFile.writeln('[openSelection] activating label=' + (item.label || '') + ' type=' + item.type);
    dbug('[openSelection] activating label=' + (item.label || '') + ' type=' + item.type, 'nav');
    if (item.type === 'folder') {
        logFile.writeln('[openSelection] calling _handleFolderSelection');
        logFile.close();
        this._handleFolderSelection(item);
        return;
    }
    if (item.type === 'item') {
        logFile.writeln('[openSelection] calling _handleItemSelection');
        logFile.close();
        this._handleItemSelection(item);
    }
};

IconShell.prototype._getCurrentItemsWithUp = function (node, hasUp) {
    var items = node.children ? node.children.slice() : [];
    if (hasUp) {
        items.unshift({
            label: "..",
            type: "item",
            iconFile: "back",
            action: function () { this.changeFolder(null, { direction: 'up' }); }.bind(this)
        });
    }
    // Ensure each real item action is bound exactly once (so 'this' is IconShell)
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it && typeof it.action === 'function' && !it._icshBound) {
            it.action = it.action.bind(this);
            it._icshBound = true;
        }
    }
    return items;
};

IconShell.prototype._handleUpSelection = function (item) {
    // Up action executes changeFolder(up) via bound action. Do NOT reset selection;
    // changeFolder already restores parent's stored selection & scrollOffset.
    if (typeof item.action === "function") {
        item.action(); // already bound with .bind(this) in _getCurrentItemsWithUp
        this.drawFolder();
    }
};

IconShell.prototype._handleFolderSelection = function (realItem) {
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
    dbug('[folder] ENTER child label=' + realItem.label + ' children=' + (realItem.children ? realItem.children.length : 0), 'folder');

    // Play dissolve animation before opening folder
    try {
        this.playDissolveBefore(this.selection);
    } catch (e) {
        dbug("dissolve error in _handleFolderSelection: " + e, "view");
    }

    this.changeFolder(realItem, { direction: 'down' });
    // ALWAYS redraw after entering a folder. Previously we only redrew when childrenChanged.
    // That left the grid showing the OLD (parent) folder icons while the stack now pointed
    // at the NEW folder's child list. Result: selection index (against new folder items)
    // didn't match what was visibly highlighted (old grid), so activating selection opened
    // the wrong target (e.g. grid said "Apps" but we launched "Assassin").
    this.drawFolder();
};

IconShell.prototype._handleItemSelection = function (realItem) {
    var logFile = new File(system.logs_dir + 'dissolve_debug.log');
    logFile.open('a');
    logFile.writeln('[_handleItemSelection] *** CODE VERSION: v2-with-timing ***');
    logFile.writeln('[_handleItemSelection] called, typeof realItem.action=' + typeof realItem.action);

    if (typeof realItem.action === "function") {
        logFile.writeln('[_handleItemSelection] action is function');
        try {
            var t1 = Date.now();
            logFile.writeln('[_handleItemSelection] playDissolveBefore START at ' + t1);
            // Play dissolve animation before launching
            this.playDissolveBefore(this.selection);
            var t2 = Date.now();
            logFile.writeln('[_handleItemSelection] playDissolveBefore END at ' + t2 + ' (duration: ' + (t2 - t1) + 'ms)');

            // Ensure the action runs with IconShell as 'this' (was unbound, breaking runExternal etc.)
            var t3 = Date.now();
            logFile.writeln('[_handleItemSelection] action START at ' + t3);
            realItem.action.call(this);
            var t4 = Date.now();
            logFile.writeln('[_handleItemSelection] action END at ' + t4 + ' (duration: ' + (t4 - t3) + 'ms)');
        } catch (e) {
            logFile.writeln('[_handleItemSelection] EXCEPTION: ' + e);
            logFile.close();
            dbug("IconShell action error: " + e, "view");
            if (e === "Exit Shell") throw e;
        }
        this.drawFolder();
    }
    logFile.close();
};


/**
 * Change the current folder/view.
 * @param {Object|null} targetFolder - The folder object to navigate into, or null/undefined to go up.
 * @param {Object} [options] - Optional: { direction: 'up'|'down' }.
 */
IconShell.prototype.changeFolder = function (targetFolder, options) {
    dbug('[changeFolder] direction=' + (options && options.direction) + ' target=' + (targetFolder ? targetFolder.label : '<up>') + ' stackDepth=' + this.stack.length, 'nav');
    options = options || {};
    var direction = options.direction || (targetFolder ? 'down' : 'up');
    if (direction === 'down' && targetFolder) {
        // Store current selection on the parent so we can restore it when coming back
        var parentNode = this.stack[this.stack.length - 1];
        parentNode._lastSelectionForChildren = this.selection;
        parentNode._lastScrollOffsetForChildren = this.scrollOffset;
        dbug('[changeFolder] storing parent selection=' + this.selection + ' for ' + (parentNode.label || ''), 'nav');
        this.stack.push(targetFolder);
    } else if (direction === 'up') {
        if (this.stack.length > 1) {
            var removed = this.stack.pop();
            dbug('[changeFolder] popped ' + (removed && removed.label), 'nav');
        }
    }
    // Always update currentView and viewHotkeys to match the new top of stack
    var currentNode = this.stack[this.stack.length - 1];
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
        dbug('[changeFolder] restored selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' for ' + (currentNode.label || ''), 'nav');
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

IconShell.prototype.drawFolder = function (options) {
    var opts = (options && typeof options === 'object') ? options : {};
    // If a subprogram is active, skip drawing the folder grid to avoid overwriting its frames.
    if (this.activeSubprogram && this.activeSubprogram.running) {
        dbug('drawFolder() skipped due to active subprogram: ' + (this.activeSubprogram.name || '?'), 'drawFolder');
        return;
    }
    dbug('selection=' + this.selection + ' scrollOffset=' + this.scrollOffset + ' stackDepth=' + this.stack.length, "drawFolder");
    this._closePreviousFrames();
    this._clearHotspots();
    // Reset border tracking when redrawing grid
    this.previousSelectedIndex = -1;
    var fallbackHeader = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackView = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));
    var fallbackCrumb = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackMouseOn = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackMouseOff = ((typeof BG_RED !== 'undefined' ? BG_RED : (4 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var viewAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('VIEW', fallbackView) : fallbackView;
    if (this.view) {
        try { this.view.attr = viewAttr; this.view.clear(viewAttr); } catch (e) { dbug('view clear error: ' + e, 'theme'); }
    }
    if (!opts.skipHeaderRefresh) this._refreshHeaderFrame();
    var names = [];
    for (var i = 0; i < this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
    // Recreate crumb and mouse indicator frames to fit screen
    var mouseIndicatorWidth = 10; // Allow extra space for full text
    var screenWidth = (typeof console !== 'undefined' && console.screen_columns) ? console.screen_columns : this.root.width;
    var crumbWidth = screenWidth - mouseIndicatorWidth;
    if (crumbWidth < 1) crumbWidth = 1;
    // Dispose old frames if they exist
    if (this.crumb && typeof this.crumb.close === 'function') this.crumb.close();
    if (this.mouseIndicator && typeof this.mouseIndicator.close === 'function') this.mouseIndicator.close();
    // Create crumb frame (left)
    var crumbAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('CRUMB', fallbackCrumb) : fallbackCrumb;
    this.crumb = new Frame(1, this.root.height, crumbWidth, 1, crumbAttr, this.root);
    this.crumb.open();
    this.crumb.clear(crumbAttr);
    this.crumb.home();
    // Create mouse indicator frame (right)
    var mouseX = crumbWidth + 1;
    var mouseY = this.root.height;
    var mouseAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('MOUSE_ON', fallbackMouseOn) : fallbackMouseOn;
    this.mouseIndicator = new Frame(mouseX, mouseY, mouseIndicatorWidth, 1, mouseAttr, this.root);
    this.mouseIndicator.open();
    this._updateMouseIndicator();
    var node = this.stack[this.stack.length - 1];
    if (!node._cachedChildren) {
        try {
            var rawChildren = node.children ? node.children.slice() : [];
            node._cachedChildren = rawChildren;
            dbug('[cache] snapshot (draw) children for ' + (node.label || '') + ' count=' + rawChildren.length, 'nav');
        } catch (e) { node._cachedChildren = []; }
    }
    var items = node._cachedChildren.slice();
    if (this.stack.length > 1) {
        items.unshift({
            label: "..",
            type: "item",
            iconFile: "back",
            action: function () { this.changeFolder(null, { direction: 'up' }); }.bind(this)
        });
    }
    this.assignViewHotkeys(items);
    this._decorateMailIcons(items);
    var dims = this._calculateGridDimensions(this.view);
    var cols = dims.cols;
    var rows = dims.maxRows;
    var maxIcons = cols * rows;
    this._clampSelection(items);
    this._adjustScroll(items, cols, maxIcons);
    var visibleItems = this._calculateVisibleItems(items, maxIcons);
    this.grid = this.buildIconGrid(this.view, visibleItems);
    this._highlightSelectedCell();
    this._addMouseHotspots();
    this._adjustSelectionWithinBounds(items, maxIcons);
    this._drawBreadcrumb(names, this.selection + 1, items.length);
    this.root.cycle();
    // Rendering complete; clear pending change flag
    this.folderChanged = false;
};

IconShell.prototype._updateMouseIndicator = function () {
    if (!this.mouseIndicator) return;
    var isActive = !!this.mouseActive;
    var fallbackOn = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var fallbackOff = ((typeof BG_RED !== 'undefined' ? BG_RED : (4 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var attr = (typeof this.paletteAttr === 'function') ? this.paletteAttr(isActive ? 'MOUSE_ON' : 'MOUSE_OFF', isActive ? fallbackOn : fallbackOff) : (isActive ? fallbackOn : fallbackOff);
    this.mouseIndicator.attr = attr;
    this.mouseIndicator.clear(attr);
    this.mouseIndicator.gotoxy(1, 1);
    // Always write exactly 10 chars, pad if needed; prefix with a space for visual gap
    var msg = isActive ? "MOUSE ON" : "MOUSE OFF";
    msg = ' ' + msg;
    if (msg.length < 10) msg += Array(11 - msg.length).join(' ');
    else if (msg.length > 10) msg = msg.substring(0, 10);
    this.mouseIndicator.putmsg(msg);
    this.mouseIndicator.cycle();
};

IconShell.prototype._closePreviousFrames = function () {
    if (this.grid && this.grid.cells) {
        for (var i = 0; i < this.grid.cells.length; i++) {
            if (this.grid.cells[i].icon && typeof this.grid.cells[i].icon.close === 'function') this.grid.cells[i].icon.close();
            if (this.grid.cells[i].label && typeof this.grid.cells[i].label.close === 'function') this.grid.cells[i].label.close();
            if (this.grid.cells[i].borderFrame) {
                try { this.grid.cells[i].borderFrame.clear(); } catch (e) { }
                if (typeof this.grid.cells[i].borderFrame.close === 'function') this.grid.cells[i].borderFrame.close();
            }
        }
    }
};

// Temporarily dispose of folder view frames while a subprogram is active to avoid visual residue.
// They will be recreated automatically by recreateFramesIfNeeded/drawFolder when the subprogram exits.
IconShell.prototype._shelveFolderFrames = function () {
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
        if (this.headerFrame && typeof this.headerFrame.clear === 'function') {
            try { this.headerFrame.clear(); this.headerFrame.home(); } catch (e) { }
        }
        // Null out grid so recreateFramesIfNeeded knows to rebuild later
        this.grid = null;
        this._folderShelved = true;
        dbug('[shelve] folder frames shelved', 'subprogram');
    } catch (e) { dbug('[shelve] error: ' + e, 'subprogram'); }
};

IconShell.prototype._clearHotspots = function () {
    if (this.hotspotManager && this._gridHotspotLayerId) {
        this.hotspotManager.clearLayer(this._gridHotspotLayerId);
        return;
    }
    if (typeof console.clear_hotspots === 'function') console.clear_hotspots();
};

IconShell.prototype._drawBreadcrumb = function (names, selectedNum, total) {
    if (!this.crumb) return;
    var fallbackCrumb = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var crumbAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('CRUMB', fallbackCrumb) : fallbackCrumb;
    this.crumb.attr = crumbAttr;
    this.crumb.clear(crumbAttr);
    this.crumb.gotoxy(1, 1);

    var userNumber = (typeof user !== 'undefined' && typeof user.number === 'number') ? user.number : 0;
    if (!userNumber || userNumber < 0) userNumber = 0;
    var boardName = 'bbs';
    if (typeof system !== 'undefined') {
        if (system.qwk_id) boardName = system.qwk_id;
        else if (system.name) boardName = system.name;
    }
    boardName = ('' + boardName).replace(/\s+/g, '').toLowerCase();
    if (!boardName) boardName = 'bbs';

    var pathParts = names.slice();
    if (pathParts.length && /^home$/i.test(pathParts[0])) pathParts.shift();
    var path = pathParts.join('/');

    var selectedLabel = this._getSelectedItemLabel();
    var segments = userNumber + '@' + boardName + ':';
    if (path) segments += '/' + path;
    var crumbText = segments;
    crumbText += '$';
    if (selectedLabel) crumbText += selectedLabel;

    if (crumbText.length > this.crumb.width) {
        if (this.crumb.width > 3) crumbText = crumbText.substring(0, this.crumb.width - 3) + '...';
        else crumbText = crumbText.substring(0, this.crumb.width);
    }
    if (crumbText) {
        this.crumb.gotoxy(1, 1);
        this.crumb.putmsg(crumbText);
    }
    this.crumb.cycle();
};

IconShell.prototype._getSelectedItemLabel = function () {
    if (!this.grid || !this.grid.cells || !this.grid.cells.length) return '';
    var selIdx = this.selection - this.scrollOffset;
    if (selIdx < 0 || selIdx >= this.grid.cells.length) return '';
    var cell = this.grid.cells[selIdx];
    if (!cell || !cell.item) return '';
    return cell.item.label || '';
};

IconShell.prototype._getMailCounts = function () {
    var unread = 0;
    var read = 0;
    var total = 0;
    var stats = (typeof user !== 'undefined' && user && user.stats) ? user.stats : null;
    if (stats) {
        if (typeof stats.unread_mail_waiting === 'number') unread = stats.unread_mail_waiting;
        if (typeof stats.read_mail_waiting === 'number') read = stats.read_mail_waiting;
        if (typeof stats.mail_waiting === 'number') total = stats.mail_waiting;
    }
    if (typeof bbs !== 'undefined') {
        try {
            if (!total) {
                if (typeof bbs.mail_waiting === 'number') total = bbs.mail_waiting;
                else if (typeof bbs.mail_waiting === 'function') total = bbs.mail_waiting();
            }
            if (!unread && typeof bbs.unread_mail_waiting === 'number') unread = bbs.unread_mail_waiting;
            if (!read && typeof bbs.read_mail_waiting === 'number') read = bbs.read_mail_waiting;
        } catch (e) { }
    }
    unread = Math.max(0, parseInt(unread, 10) || 0);
    read = Math.max(0, parseInt(read, 10) || 0);
    total = Math.max(0, parseInt(total, 10) || 0);
    if (!total) total = unread + read;
    if (!unread && total && read) unread = Math.max(0, total - read);
    if (total < unread) total = unread;
    return { unread: unread, total: total };
};

IconShell.prototype._buildMailLabelInfo = function (baseLabel, counts) {
    baseLabel = baseLabel || 'Mail';
    counts = counts || {};
    var unread = Math.max(0, parseInt(counts.unread, 10) || 0);
    var total = Math.max(0, parseInt(counts.total, 10) || 0);
    if (total < unread) total = unread;
    var segments = [];
    var text = '';
    if (unread > 0) {
        var unreadText = String(unread);
        segments.push({ text: unreadText, color: (typeof LIGHTGREEN !== 'undefined') ? LIGHTGREEN : GREEN });
        segments.push({ text: ' ', color: null });
        text += unreadText + ' ';
    }
    segments.push({ text: baseLabel, color: null });
    text += baseLabel;
    segments.push({ text: ' ', color: null });
    text += ' ';
    var totalText = String(total);
    segments.push({ text: totalText, color: (typeof YELLOW !== 'undefined') ? YELLOW : WHITE });
    text += totalText;
    return { text: text, segments: segments };
};

IconShell.prototype._isMailIconItem = function (item) {
    if (!item) return false;
    if (typeof BUILTIN_ACTIONS !== 'undefined' && item.action === BUILTIN_ACTIONS.mail) return true;
    var iconFile = item.iconFile ? String(item.iconFile).toLowerCase() : '';
    if (iconFile.indexOf('mail') !== -1) return true;
    var label = (item._mailBaseLabel || item.label || '').toLowerCase();
    return label.indexOf('mail') !== -1;
};

IconShell.prototype._decorateMailIcons = function (items) {
    if (!items || !items.length) return;
    var counts = this._getMailCounts();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!this._isMailIconItem(item)) continue;
        if (!item._mailBaseLabel) item._mailBaseLabel = item.label || 'Mail';
        var info = this._buildMailLabelInfo(item._mailBaseLabel, counts);
        item.label = info.text;
        item._labelSegments = info.segments;
    }
};

IconShell.prototype._clampSelection = function (items) {
    if (this.selection < 0) this.selection = 0;
    if (this.selection >= items.length) this.selection = items.length ? items.length - 1 : 0;
};

IconShell.prototype._adjustScroll = function (items, cols, maxIcons) {
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

IconShell.prototype._calculateVisibleItems = function (items, maxIcons) {
    var visibleItems = items.slice(this.scrollOffset, this.scrollOffset + maxIcons);
    while (visibleItems.length < maxIcons) {
        visibleItems.push({ label: "", type: "placeholder", isPlaceholder: true });
    }
    return visibleItems;
};

IconShell.prototype._highlightSelectedCell = function () {
    if (this.grid && this.grid.cells) {
        var selIdx = this.selection - this.scrollOffset;
        if (selIdx >= 0 && selIdx < this.grid.cells.length) {
            // Clear previous border if different cell
            if (this.previousSelectedIndex >= 0 && this.previousSelectedIndex !== selIdx) {
                var prevCell = this.grid.cells[this.previousSelectedIndex];
                if (prevCell) this.clearCellBorder(prevCell);
            }

            // Paint icon and draw border for current selection
            this.paintIcon(this.grid.cells[selIdx], true, false);
            this.drawCellBorder(this.grid.cells[selIdx]);

            this.previousSelectedIndex = selIdx;
        }
    }
};

IconShell.prototype._addMouseHotspots = function () {
    // Note: Passing swallow=false to avoid "hungry" hotspots that appear to consume
    // clicks beyond their intended horizontal bounds on partially filled rows.
    if (!this.grid || !this.grid.cells) return;
    if (this.hotspotManager && this._gridHotspotLayerId) {
        var defs = [];
        var fillCmd = (typeof ICSH_HOTSPOT_FILL_CMD !== 'undefined') ? ICSH_HOTSPOT_FILL_CMD : '\x7F';
        var perRow = {};
        for (var i = 0; i < this.grid.cells.length; i++) {
            var cell = this.grid.cells[i];
            if (!cell || !cell.icon) continue;
            var item = cell.item || {};
            if (!item.hotkey || item.type === 'placeholder') continue;
            var iconX = cell.icon.x;
            var iconY = cell.icon.y;
            var iconW = cell.icon.width;
            var iconH = cell.icon.height;
            defs.push({
                key: item.hotkey,
                x: iconX,
                y: iconY,
                width: iconW,
                height: iconH + 1,
                swallow: false,
                owner: 'grid',
                data: { index: i, label: item.label || '' }
            });
            var rowIdx = Math.floor(i / this.grid.cols);
            var rightMost = iconX + iconW - 1;
            if (!perRow[rowIdx]) perRow[rowIdx] = { y: iconY, iconHeight: iconH, rightMost: rightMost };
            else if (rightMost > perRow[rowIdx].rightMost) perRow[rowIdx].rightMost = rightMost;
        }
        if (this.view && typeof this.view.x === 'number' && typeof this.view.width === 'number') {
            var viewRight = this.view.x + this.view.width - 1;
            for (var rk in perRow) {
                if (!perRow.hasOwnProperty(rk)) continue;
                var info = perRow[rk];
                if (info.rightMost < viewRight) {
                    var fillerWidth = viewRight - info.rightMost;
                    if (fillerWidth > 0) {
                        defs.push({
                            key: fillCmd,
                            x: info.rightMost + 1,
                            y: info.y,
                            width: fillerWidth,
                            height: info.iconHeight + 1,
                            swallow: false,
                            owner: 'grid-filler'
                        });
                    }
                }
            }
        }
        this.hotspotManager.setLayerHotspots(this._gridHotspotLayerId, defs);
        this.hotspotManager.activateLayer(this._gridHotspotLayerId);
        return;
    }
    if (typeof console.add_hotspot !== 'function') return;
    var FILL_CMD = (typeof ICSH_HOTSPOT_FILL_CMD !== 'undefined') ? ICSH_HOTSPOT_FILL_CMD : '\x7F';
    var perRowLegacy = {}; // rowIndex -> { y, iconHeight, rightMost }
    for (var j = 0; j < this.grid.cells.length; j++) {
        var legacyCell = this.grid.cells[j];
        var legacyItem = legacyCell.item;
        if (!legacyItem.hotkey || legacyItem.type === 'placeholder') continue; // skip placeholders
        var cmd = legacyItem.hotkey;
        var min_x = legacyCell.icon.x;
        var max_x = legacyCell.icon.x + legacyCell.icon.width - 1; // strictly icon width
        var y = legacyCell.icon.y;
        dbug('[HOTSPOT] i=' + j + ' label=' + (legacyItem.label || '') + ' hotkey=' + cmd + ' x=' + min_x + '-' + max_x + ' y=' + y + '-' + (y + legacyCell.icon.height - 1), 'hotspots');
        for (var row = 0; row < legacyCell.icon.height; row++) {
            try { console.add_hotspot(cmd, false, min_x, max_x, y + row); } catch (e) { }
        }
        // Optionally include label line for easier clicking (keep within same horizontal bounds)
        try { console.add_hotspot(cmd, false, min_x, max_x, y + legacyCell.icon.height); } catch (e) { }
        var rIdx = Math.floor(j / this.grid.cols);
        if (!perRowLegacy[rIdx]) perRowLegacy[rIdx] = { y: y, iconHeight: legacyCell.icon.height, rightMost: max_x };
        else if (max_x > perRowLegacy[rIdx].rightMost) perRowLegacy[rIdx].rightMost = max_x;
    }
    // Add filler hotspots (swallow clicks) for gap area to the right of last real icon in each row
    var viewRightLegacy = this.view.x + this.view.width - 1;
    for (var key in perRowLegacy) {
        if (!perRowLegacy.hasOwnProperty(key)) continue;
        var infoLegacy = perRowLegacy[key];
        if (infoLegacy.rightMost < viewRightLegacy) {
            for (var ry = 0; ry <= infoLegacy.iconHeight; ry++) { // cover icon + label line
                try { console.add_hotspot(FILL_CMD, false, infoLegacy.rightMost + 1, viewRightLegacy, infoLegacy.y + ry); } catch (e) { }
            }
        }
    }
};

IconShell.prototype._adjustSelectionWithinBounds = function (items, maxIcons) {
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
    // var Icon = load("future_shell/lib/icon.js");
    for (var i = 0; i < items.length && i < maxIcons; i++) {
        var cell = this._createIconCell(i, dims, items, parentFrame, Icon);
        cells.push(cell);
    }
    var rows = Math.ceil(Math.min(items.length, maxIcons) / dims.cols);
    return { cells: cells, cols: dims.cols, rows: rows, iconW: dims.iconW, iconH: dims.iconH };
};

IconShell.prototype._calculateGridDimensions = function (parentFrame) {
    var iconW = ICSH_CONSTANTS.ICON_W;
    var iconH = ICSH_CONSTANTS.ICON_H;
    var labelH = 1;
    var cellW = iconW + 2;
    var cellH = iconH + labelH + 1; // single-row vertical gap between icon rows
    var topMargin = 1;
    var offsetY = 1; // leave a blank row above the grid
    var usableHeight = Math.max(0, parentFrame.height - topMargin - offsetY);
    var cols = Math.max(1, Math.floor(parentFrame.width / cellW));
    var maxRows = Math.max(1, Math.floor(usableHeight / cellH));
    return {
        iconW: iconW,
        iconH: iconH,
        labelH: labelH,
        cellW: cellW,
        cellH: cellH,
        cols: cols,
        maxRows: maxRows,
        topMargin: topMargin,
        offsetY: offsetY
    };
};

IconShell.prototype._createIconCell = function (i, dims, items, parentFrame, Icon) {
    var col = i % dims.cols;
    var row = Math.floor(i / dims.cols);
    var x = (col * dims.cellW) + 2;
    var y = (row * dims.cellH) + 1 + (dims.topMargin || 0) + (dims.offsetY || 0);
    // If this is a placeholder (padding cell), don't create visible frames.
    // Preserve a cell object so selection math & hotspots (which skip placeholders) still work.
    if (items[i] && items[i].isPlaceholder) {
        return {
            icon: { x: x, y: y, width: dims.iconW, height: dims.iconH, isPlaceholder: true },
            label: { x: x, y: y + dims.iconH, width: dims.iconW, height: dims.labelH, isPlaceholder: true },
            item: items[i], iconObj: null, borderFrame: null
        };
    }
    var hasBg = typeof items[i].iconBg !== 'undefined';
    var hasFg = typeof items[i].iconFg !== 'undefined';
    var iconAttr = 0;
    if (hasBg || hasFg) {
        iconAttr = (hasBg ? items[i].iconBg : 0) | (hasFg ? items[i].iconFg : 0);
    }
    var iconFrame = new Frame(x, y, dims.iconW, dims.iconH, iconAttr, parentFrame);
    iconFrame.transparent = true;
    var fallbackFrameAttr = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));
    var frameAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('FRAME_STANDARD', fallbackFrameAttr) : fallbackFrameAttr;
    var labelFrame = new Frame(x, y + dims.iconH, dims.iconW, dims.labelH, frameAttr, parentFrame);

    // Create border frame for selection highlighting
    // Positioned around icon+label with 1-cell margin, dimensions include the margin
    var borderFrameAttr = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));
    var borderFrame = new Frame(x - 1, y - 1, dims.iconW + 2, dims.iconH + dims.labelH + 2, borderFrameAttr, parentFrame);
    borderFrame.transparent = true;
    if (typeof borderFrame.open === 'function') borderFrame.open();

    var iconObj = new Icon(iconFrame, labelFrame, items[i], i == 0);
    iconObj.render();
    return { icon: iconFrame, label: labelFrame, item: items[i], iconObj: iconObj, borderFrame: borderFrame };
};

IconShell.prototype._handleScreenTooSmall = function (parentFrame, msg, iconW, iconH) {
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
    var hasIconAsset = cell.iconObj && cell.iconObj.data && (cell.iconObj.data.iconFile || (cell.iconObj.data.avatarObj && cell.iconObj.data.avatarObj.data));
    if (!hasIconAsset && typeof item.iconBg !== 'undefined' && typeof item.iconFg !== 'undefined') {
        cell.icon.clear(item.iconBg | item.iconFg);
    }

    // Highlight label if selected
    var fallbackLabelAttr = ((typeof BG_BLACK !== 'undefined' ? BG_BLACK : 0) | (typeof LIGHTGRAY !== 'undefined' ? LIGHTGRAY : 7));
    var fallbackSelectedAttr = ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));
    var labelAttr = (typeof this.paletteAttr === 'function') ? this.paletteAttr(selected ? 'SELECTED' : 'LABEL', selected ? fallbackSelectedAttr : fallbackLabelAttr) : (selected ? fallbackSelectedAttr : fallbackLabelAttr);
    cell.label.clear(labelAttr);
    cell.label.home();
    var segments = item._labelSegments && item._labelSegments.length ? item._labelSegments : null;
    var width = cell.label.width || cell.icon.width;
    if (segments) {
        var truncated = [];
        var visible = 0;
        for (var s = 0; s < segments.length; s++) {
            var seg = segments[s];
            var segText = seg && typeof seg.text !== 'undefined' ? String(seg.text) : '';
            if (!segText.length && segText !== '0') continue;
            var remaining = width - visible;
            if (remaining <= 0) break;
            if (segText.length > remaining) segText = segText.substr(0, remaining);
            truncated.push({ text: segText, color: seg ? seg.color : null });
            visible += segText.length;
        }
        var leftPad = Math.max(0, Math.floor((width - visible) / 2));
        var written = 0;
        var bg = labelAttr & 0xF0;
        if (leftPad) {
            cell.label.attr = labelAttr;
            cell.label.putmsg(new Array(leftPad + 1).join(' '));
            written += leftPad;
        }
        for (var t = 0; t < truncated.length && written < width; t++) {
            var segInfo = truncated[t];
            if (!segInfo.text.length && segInfo.text !== '0') continue;
            var attr = (segInfo.color !== null && typeof segInfo.color === 'number') ? (bg | segInfo.color) : labelAttr;
            cell.label.attr = attr;
            cell.label.putmsg(segInfo.text);
            written += segInfo.text.length;
        }
        if (written < width) {
            cell.label.attr = labelAttr;
            cell.label.putmsg(new Array(width - written + 1).join(' '));
        }
        return;
    }
    var name = item.label || "";
    var start = Math.max(0, Math.floor((width - name.length) / 2));
    var pad = start > 0 ? new Array(start + 1).join(' ') : '';
    cell.label.putmsg((pad + name).substr(0, width));
}
