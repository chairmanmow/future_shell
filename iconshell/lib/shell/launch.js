load(system.mods_dir + 'iconshell/lib/util/usage_tracker.js');
var UsageTracker = this.UsageTracker || {};

IconShell.prototype.runExternal = function(fn, opts) {
    opts = opts || {};
    var trackUsage = (opts.trackUsage !== false);
    var programId = opts.programId || 'unknown';
    var startTs = trackUsage ? Date.now() : 0;
    try {
        // Optional: dissolve animation before clearing and launching external
        // if (this.view && typeof dissolve === 'function') {
        //     dissolve(this.view, ICSH_VALS.ANIMATION.COLOR, 0); // 2ms delay for visible effect
        // }
        console.attr = ICSH_VALS.EXTERNAL_BG | ICSH_VALS.EXTERNAL_FG;
        console.clear();
        dbug("RUNNING EXTERNAL PROGRAM WRAPPER", "external");
        fn();
        dbug("EXITING EXTERNAL PROGRAMMING RECREATING FRAMES?", "external");
    } finally {
        var endTs = Date.now();
        console.clear();
        this.recreateFramesIfNeeded();
        // Refresh dynamic children (games menu rebuilding) if we're returning to shell folder view.
        var node = this.stack && this.stack.length ? this.stack[this.stack.length-1] : null;
        if (!this.activeSubprogram) {
            if (node && node.label && node.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function') {
                node.children = getGamesMenuItems();
                this.assignViewHotkeys(node.children);
            }
            if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
        } else {
            // If a subprogram is active, allow it to repaint its own frames instead of drawing folder over them.
            if (typeof this.activeSubprogram.refresh === 'function') {
                try { this.activeSubprogram.refresh(); } catch(e) {}
            } else if (typeof this.activeSubprogram.draw === 'function') {
                try { this.activeSubprogram.draw(); } catch(e) {}
            }
        }
        // Reset inactivity so the screensaver won't instantly resume.
        this._lastActivityTs = Date.now();
        this._stopScreenSaver();
        if (trackUsage && UsageTracker && typeof UsageTracker.record === 'function') {
            try {
                var elapsed = Math.max(0, Math.round((endTs - startTs) / 1000));
                var info = {
                    programId: programId,
                    elapsedSeconds: elapsed,
                    timestamp: endTs
                };
                if (typeof user !== 'undefined' && user) {
                    if (user.alias) info.userAlias = user.alias;
                    if (typeof user.number === 'number') info.userNumber = user.number;
                }
                UsageTracker.record(info);
            } catch (trackErr) {
                log(LOG_ERROR, 'runExternal usage tracking error: ' + trackErr);
            }
        }
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
    if (this.activeSubprogram && typeof this.activeSubprogram.attachShellTimer === 'function') {
        this.activeSubprogram.attachShellTimer(this.timer);
    }
    // Proactively shelve (dispose) folder frames to prevent residual redraw artifacts.
    if (typeof this._shelveFolderFrames === 'function') this._shelveFolderFrames();
    this.activeSubprogram.enter(this.exitSubprogram.bind(this));
    this._refreshScreenSaverFrame();
};

// Exit subprogram and return to shell
IconShell.prototype.exitSubprogram = function() {
    dbug("Exit subprogram", "subprogram");
    if (this.activeSubprogram && typeof this.activeSubprogram.detachShellTimer === 'function') {
        this.activeSubprogram.detachShellTimer();
    }
    this.activeSubprogram = null;
    // Mark shelved state false so folder will rebuild cleanly
    this._folderShelved = false;
    this._refreshScreenSaverFrame();
    this.recreateFramesIfNeeded();
    if(!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
};
