IconShell.prototype.runExternal = function(fn) {
    try {
        // Optional: dissolve animation before clearing and launching external
        if (this.view && typeof dissolve === 'function') {
            dissolve(this.view, ICSH_VALS.ANIMATION.COLOR, 0); // 2ms delay for visible effect
        }
        console.attr = ICSH_VALS.EXTERNAL_BG | ICSH_VALS.EXTERNAL_FG;
        console.clear();
        dbug("RUNNING EXTERNAL PROGRAM WRAPPER", "external");
        fn();
        dbug("EXITING EXTERNAL PROGRAMMING RECREATING FRAMES?", "external");
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

// Queue a subprogram launch so the triggering key (e.g. ENTER) is fully processed
// before the subprogram begins receiving keystrokes.
IconShell.prototype.queueSubprogramLaunch = function(name, instance) {
    dbug('Queue subprogram launch: ' + name, 'subprogram');
    this._pendingSubLaunch = { name: name, instance: instance };
    // Mark that we just processed a CR; swallow subsequent LF if present
    this._swallowNextLF = true;
};

// Launch a subprogram (e.g., chat)
IconShell.prototype.launchSubprogram = function(name, handlers) {
    dbug("Launch subprogram " + name, "subprogram");
    // If launching chat, always use the persistent instance
    if (name === "chat" && this.chat) {
        this.activeSubprogram = this.chat;
    } else {
        this.activeSubprogram = handlers;
    }
    this.activeSubprogram.enter(this.exitSubprogram.bind(this));
};

// Exit subprogram and return to shell
IconShell.prototype.exitSubprogram = function() {
    dbug("Exit subprogram", "subprogram");
    this.activeSubprogram = null;
    this.recreateFramesIfNeeded();
    this.drawFolder();
};