load(system.mods_dir + 'future_shell/lib/util/usage_tracker.js');
load(system.mods_dir + 'future_shell/lib/util/launch_queue.js');
var UsageTracker = this.UsageTracker || {};
var LaunchQueue = this.LaunchQueue || {};

IconShell.prototype.runExternal = function (fn, opts) {
    opts = opts || {};
    var trackUsage = (opts.trackUsage !== false);
    var programId = opts.programId || 'unknown';
    var broadcastLaunch = opts.broadcast !== false;
    var activeBefore = this.activeSubprogram || null;
    var shouldResumeSub = !!(activeBefore && activeBefore.running);
    if (broadcastLaunch && LaunchQueue && typeof LaunchQueue.record === 'function' && programId && programId !== 'unknown') {
        try {
            log('[launch_queue] recording launch programId=' + programId + ' label=' + (opts.label || programId) + ' icon=' + (opts.icon || ''));
            LaunchQueue.record({
                programId: programId,
                label: opts.label || programId,
                icon: opts.icon || null,
                timestamp: Date.now(),
                node: (typeof bbs !== 'undefined' && typeof bbs.node_num === 'number') ? bbs.node_num : null,
                userAlias: (typeof user !== 'undefined' && user && user.alias) ? user.alias : null,
                userNumber: (typeof user !== 'undefined' && user && typeof user.number === 'number') ? user.number : null
            });
        } catch (queueErr) {
            try { log('launch_queue: record failed (' + queueErr + ')'); } catch (_) { }
        }
    }
    var startTs = trackUsage ? Date.now() : 0;
    try {
        if (typeof this._notifyMrcExternalSuspend === 'function') {
            try { this._notifyMrcExternalSuspend({ programId: programId }); } catch (_) { }
        }
        if (shouldResumeSub && typeof activeBefore.pauseForReason === 'function') {
            try { activeBefore.pauseForReason('external_launch'); } catch (_) { }
        }
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
        var handledBySubprogram = false;
        var activeAfter = this.activeSubprogram || null;
        if (shouldResumeSub && activeBefore && activeBefore === activeAfter) {
            if (typeof activeBefore.setParentFrame === 'function') {
                try { activeBefore.setParentFrame(this.subFrame || this.view); } catch (_) { }
            }
            if (typeof activeBefore.resumeForReason === 'function') {
                try { activeBefore.resumeForReason('external_return'); } catch (_) { }
            }
            if (typeof activeBefore.refresh === 'function') {
                try { activeBefore.refresh(); handledBySubprogram = true; } catch (e) { dbug('runExternal subprogram refresh error: ' + e, 'external'); }
            } else if (typeof activeBefore.draw === 'function') {
                try { activeBefore.draw(); handledBySubprogram = true; } catch (e) { dbug('runExternal subprogram draw error: ' + e, 'external'); }
            }
        }
        if (!handledBySubprogram) {
            var node = this.stack && this.stack.length ? this.stack[this.stack.length - 1] : null;
            if (!this.activeSubprogram || !this.activeSubprogram.running) {
                if (node && node.label && node.label.toLowerCase().indexOf("game") !== -1 && typeof getGamesMenuItems === 'function') {
                    node.children = getGamesMenuItems();
                    this.assignViewHotkeys(node.children);
                }
                this.drawFolder();
            } else {
                var sub = this.activeSubprogram;
                if (typeof sub.setParentFrame === 'function') {
                    try { sub.setParentFrame(this.subFrame || this.view); } catch (_) { }
                }
                if (typeof sub.resumeForReason === 'function' && sub !== activeBefore) {
                    try { sub.resumeForReason('external_return'); } catch (_) { }
                }
                if (typeof sub.refresh === 'function') {
                    try { sub.refresh(); } catch (e) { dbug('runExternal subprogram refresh error: ' + e, 'external'); }
                } else if (typeof sub.draw === 'function') {
                    try { sub.draw(); } catch (e) { dbug('runExternal subprogram draw error: ' + e, 'external'); }
                }
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
        if (typeof this._notifyMrcExternalResume === 'function') {
            try { this._notifyMrcExternalResume({ programId: programId }); } catch (_) { }
        }
    }
};

IconShell.prototype._notifyMrcExternalSuspend = function (info) {
    if (!this.mrcController || typeof this.mrcController.handleExternalSuspend !== 'function') return;
    // Check user preference for MRC presence notifications
    var prefs = this._getShellPrefs ? this._getShellPrefs() : null;
    if (prefs && typeof prefs.shouldDisplayNotification === 'function') {
        if (!prefs.shouldDisplayNotification('mrc_presence')) return;
    }
    try { this.mrcController.handleExternalSuspend(info || {}); } catch (_) { }
};

IconShell.prototype._notifyMrcExternalResume = function (info) {
    if (!this.mrcController || typeof this.mrcController.handleExternalResume !== 'function') return;
    // Check user preference for MRC presence notifications
    var prefs = this._getShellPrefs ? this._getShellPrefs() : null;
    if (prefs && typeof prefs.shouldDisplayNotification === 'function') {
        if (!prefs.shouldDisplayNotification('mrc_presence')) return;
    }
    try { this.mrcController.handleExternalResume(info || {}); } catch (_) { }
};

// Queue a subprogram launch so the triggering key (e.g. ENTER) is fully processed
// before the subprogram begins receiving keystrokes.
IconShell.prototype.queueSubprogramLaunch = function (name, instance) {
    var ts = Date.now();
    dbug('Queue subprogram launch: ' + name, 'subprogram');
    var logFile = new File(system.logs_dir + 'subprogram_timing.log');
    logFile.open('a');
    logFile.writeln('[' + ts + '] queueSubprogramLaunch START - name: ' + name);
    logFile.close();
    this._pendingSubLaunch = { name: name, instance: instance, _queuedAt: ts };
    // Mark that we just processed a CR; swallow subsequent LF if present
    this._swallowNextLF = true;
    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[' + ts2 + '] queueSubprogramLaunch END (duration: ' + (ts2 - ts) + 'ms)');
    logFile.close();
};

// Launch a subprogram (e.g., chat)
IconShell.prototype.launchSubprogram = function (name, handlers) {
    var ts1 = Date.now();
    var logFile = new File(system.logs_dir + 'subprogram_timing.log');
    logFile.open('a');
    logFile.writeln('[' + ts1 + '] launchSubprogram START - name: ' + name);
    logFile.close();

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
    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[' + ts2 + '] launchSubprogram before _shelveFolderFrames (duration so far: ' + (ts2 - ts1) + 'ms)');
    logFile.close();

    if (typeof this._shelveFolderFrames === 'function') this._shelveFolderFrames();

    var ts3 = Date.now();
    logFile.open('a');
    logFile.writeln('[' + ts3 + '] launchSubprogram before enter() call (duration so far: ' + (ts3 - ts1) + 'ms)');
    logFile.close();

    this.activeSubprogram.enter(this.exitSubprogram.bind(this));

    var ts4 = Date.now();
    logFile.open('a');
    logFile.writeln('[' + ts4 + '] launchSubprogram after enter() call (duration: ' + (ts4 - ts3) + 'ms)');
    logFile.close();

    this._refreshScreenSaverFrame();

    var ts5 = Date.now();
    logFile.open('a');
    logFile.writeln('[' + ts5 + '] launchSubprogram END - total duration: ' + (ts5 - ts1) + 'ms');
    logFile.close();
};

// Exit subprogram and return to shell
IconShell.prototype.exitSubprogram = function () {
    dbug("Exit subprogram", "subprogram");
    if (this.activeSubprogram && typeof this.activeSubprogram.detachShellTimer === 'function') {
        this.activeSubprogram.detachShellTimer();
    }
    this.activeSubprogram = null;
    // Mark shelved state false so folder will rebuild cleanly
    this._folderShelved = false;
    this._refreshScreenSaverFrame();
    this.recreateFramesIfNeeded();
    if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
};
