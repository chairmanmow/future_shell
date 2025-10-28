IconShell.prototype.disposeAllFrames = function() {
	// Clear the screen to remove any leftovers
	if (typeof console !== 'undefined' && typeof console.clear === 'function') console.clear();
	if (this.grid && this.grid.cells) {
		for (var i = 0; i < this.grid.cells.length; i++) {
			if (this.grid.cells[i].icon && typeof this.grid.cells[i].icon.close === 'function') this.grid.cells[i].icon.close();
			if (this.grid.cells[i].label && typeof this.grid.cells[i].label.close === 'function') this.grid.cells[i].label.close();
		}
	}
	if (typeof this.view !== 'undefined' && this.view && typeof this.view.close === 'function') this.view.close();
	if (typeof this.crumb !== 'undefined' && this.crumb && typeof this.crumb.close === 'function') this.crumb.close();
	if (typeof this.root !== 'undefined' && this.root && typeof this.root.close === 'function') this.root.close();
	// this.grid = undefined;
	// this.view = undefined;
	this.crumb = undefined;
	this.root = undefined;
};

IconShell.prototype.recreateFramesIfNeeded = function() {
	if (typeof this._checkConsoleResize === 'function') {
		var cols = (typeof console !== 'undefined' && typeof console.screen_columns === 'number') ? console.screen_columns : null;
		var rows = (typeof console !== 'undefined' && typeof console.screen_rows === 'number') ? console.screen_rows : null;
		if (cols !== null && rows !== null) {
			var last = this._lastConsoleDimensions;
			if (!last || cols !== last.cols || rows !== last.rows) this._checkConsoleResize();
		}
		return;
	}
	if (console.screen_columns !== this.lastCols || console.screen_rows !== this.lastRows) {
		this.lastCols = console.screen_columns;
		this.lastRows = console.screen_rows;
		this.disposeAllFrames();
		this.root = new Frame(1, 1, console.screen_columns, console.screen_rows, ICSH_ATTR('FRAME_STANDARD'));
		this.root.open();
		this.view = new Frame(1, 1, this.root.width, this.root.height - 1, ICSH_ATTR('FRAME_STANDARD'), this.root);
		this.view.open();
		this.crumb = new Frame(1, this.root.height, this.root.width, 1, ICSH_ATTR('STATUS_BAR'), this.root);
		this.crumb.open();
		this.drawFolder();
	}
};

IconShell.prototype.flashSelection = function() {
    var idx = this.selection - this.scrollOffset;
    if (!this.grid || !this.grid.cells || idx < 0 || idx >= this.grid.cells.length) return;
    var cell = this.grid.cells[idx];
    if (!cell) return;
    this.paintIcon(cell, true, true);
    this.root.cycle();
    mswait(80);
    this.paintIcon(cell, true, false);
    this.root.cycle();
};

IconShell.prototype.moveSelection = function(dx, dy) {
    dbug("Current selection: " + this.selection + ", move " + dx + "," + dy, "nav");
    var grid = this.grid;
    if (!grid || !grid.cells) return;
    var cols = grid.cols;
    var rows = grid.rows || 1; // ensure rows defined for maxIcons calculation
    var node = this.stack[this.stack.length-1];
    // Use cached children snapshot for consistency with drawFolder/openSelection
    var baseChildren = node._cachedChildren ? node._cachedChildren.slice() : (node.children ? node.children.slice() : []);
    if (!node._cachedChildren) {
        node._cachedChildren = baseChildren.slice();
        dbug('[cache] snapshot (move) children for ' + (node.label||'') + ' count=' + baseChildren.length, 'nav');
    }
    var items = baseChildren.slice();
    var hasUp = this.stack.length > 1;
    if (hasUp) {
        items.unshift({ label: "..", type: "item" });
    }
    // Log full item map (global list including .. if present)
    for (var li=0; li<items.length; li++) {
        try { dbug('[moveSelection:list] idx=' + li + (li===this.selection?' *':'  ') + ' label=' + (items[li].label||'') + ' type=' + items[li].type, 'nav'); } catch(e) {}
    }
    var total = items.length;
    if (!total) return;
    var oldSelection = this.selection;
    var oldScrollOffset = this.scrollOffset;
    var maxIcons = cols * rows;

    // Calculate current x/y
    var x = this.selection % cols;
    var y = Math.floor(this.selection / cols);

    // Move selection safely
    if (dx === 1) { // Right
        if (this.selection < total - 1) this.selection++;
    } else if (dx === -1) { // Left
        if (this.selection > 0) this.selection--;
    } else if (dy === 1) { // Down
        var newIndexD = this.selection + cols;
        this.selection = (newIndexD < total) ? newIndexD : total - 1;
    } else if (dy === -1) { // Up
        var newIndexU = this.selection - cols;
        this.selection = (newIndexU >= 0) ? newIndexU : 0;
    }

    // Hard clamp (defensive)
    if (this.selection < 0) this.selection = 0;
    if (this.selection >= total) this.selection = total - 1;

    // Ensure selection is visible, adjust scrollOffset if needed
    if (this.selection < this.scrollOffset) {
        this.scrollOffset = Math.floor(this.selection / cols) * cols;
    } else if (this.selection >= this.scrollOffset + maxIcons) {
        this.scrollOffset = Math.floor(this.selection / cols) * cols;
    }

    // Clamp scrollOffset
    if (this.scrollOffset > total - maxIcons) this.scrollOffset = Math.max(0, total - maxIcons);
    if (this.scrollOffset < 0) this.scrollOffset = 0;

    // Efficient repaint: only redraw the whole folder if scrollOffset changed (i.e., scrolled)
    if (this.scrollOffset !== oldScrollOffset) {
        this.drawFolder({ skipHeaderRefresh: true });
    } else if (this.selection !== oldSelection) {
        // Only repaint the old and new selection
        var oldIdx = oldSelection - this.scrollOffset;
        var newIdx = this.selection - this.scrollOffset;
        if (grid.cells[oldIdx]) {
            this.paintIcon(grid.cells[oldIdx], false, false);
            this.clearCellBorder(grid.cells[oldIdx]);
        }
        if (grid.cells[newIdx]) {
            this.paintIcon(grid.cells[newIdx], true, false);
            this.drawCellBorder(grid.cells[newIdx]);
        }
        // Visible item mapping after move
        try {
            var visStart = this.scrollOffset;
            var visEnd = this.scrollOffset + maxIcons - 1;
            dbug('[moveSelection:visible-range] ' + visStart + '-' + visEnd + ' maxIcons=' + maxIcons, 'nav');
        } catch(e) {}
        // Update breadcrumb bar to show current selection
        if (typeof this.crumb !== 'undefined' && this.crumb) {
            // Use unified breadcrumb formatting
            var names = [];
            for (var i=0; i<this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
            var total = (this.stack[this.stack.length-1].children || []).length;
            var selectedNum = this.selection + 1;
            if (typeof this._drawBreadcrumb === 'function') {
                this.crumb.clear(ICSH_ATTR('STATUS_BAR'));
                this.crumb.home();
                this._drawBreadcrumb(names, selectedNum, total);
            }
        }
        this.root.cycle();
    dbug('[moveSelection] final selection=' + this.selection + ' total=' + total + ' scrollOffset=' + this.scrollOffset, 'nav');
    }
}
