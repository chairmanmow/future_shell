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
	if (console.screen_columns !== this.lastCols || console.screen_rows !== this.lastRows) {
		this.lastCols = console.screen_columns;
		this.lastRows = console.screen_rows;
		this.disposeAllFrames();
		// recreate root/view/crumb
		this.root = new Frame(1, 1, console.screen_columns, console.screen_rows, BG_BLACK|LIGHTGRAY);
		this.root.open();
		this.view = new Frame(1, 1, this.root.width, this.root.height - 1, BG_BLACK|LIGHTGRAY, this.root);
		this.view.open();
		this.crumb = new Frame(1, this.root.height, this.root.width, 1, BG_BLUE|WHITE, this.root);
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
    log(this.selection, "move selection " + dx + "," + dy);
    var grid = this.grid;
    if (!grid || !grid.cells) return;
    var cols = grid.cols, rows = grid.rows;
    var node = this.stack[this.stack.length-1];
    var items = node.children ? node.children.slice() : [];
    if (this.stack.length > 1) {
        items.unshift({ label: "..", type: "item" });
    }
    var total = items.length;
    if (!total) return;
    var oldSelection = this.selection;
    var oldScrollOffset = this.scrollOffset;
    var maxIcons = cols * rows;

    // Calculate current x/y
    var x = this.selection % cols;
    var y = Math.floor(this.selection / cols);

    // Move selection
    if (dx === 1) { // Right
        if (this.selection < total - 1) this.selection++;
    } else if (dx === -1) { // Left
        if (this.selection > 0) this.selection--;
    } else if (dy === 1) { // Down
        var newIndex = this.selection + cols;
        if (newIndex < total) this.selection = newIndex;
        else this.selection = total - 1;
    } else if (dy === -1) { // Up
        var newIndex = this.selection - cols;
        if (newIndex >= 0) this.selection = newIndex;
        else this.selection = 0;
    }

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
        this.drawFolder();
    } else if (this.selection !== oldSelection) {
        // Only repaint the old and new selection
        var oldIdx = oldSelection - this.scrollOffset;
        var newIdx = this.selection - this.scrollOffset;
        if (grid.cells[oldIdx]) this.paintIcon(grid.cells[oldIdx], false, false);
        if (grid.cells[newIdx]) this.paintIcon(grid.cells[newIdx], true, false);
        // Update breadcrumb bar to show current selection
        if (typeof this.crumb !== 'undefined' && this.crumb) {
            this.crumb.clear(BG_BLUE|WHITE);
            this.crumb.home();
            var node = this.stack[this.stack.length-1];
            var items = node.children ? node.children.slice() : [];
            if (this.stack.length > 1) {
                items.unshift({ label: "..", type: "item" });
            }
            var total = items.length;
            var selectedNum = this.selection + 1;
            var selectedLabel = (items[this.selection] && items[this.selection].label) ? items[this.selection].label : "";
            var names = [];
            for (var i=0; i<this.stack.length; i++) names.push(this.stack[i].label || "Untitled");
            var itemInfo = " (Item " + selectedNum + "/" + total + ")";
            var crumbText = " " + names.join(" \x10 ") + " " + itemInfo;
            if (selectedLabel) crumbText += " | " + selectedLabel;
            this.crumb.putmsg(crumbText);
        }
        this.root.cycle();
    }
}

