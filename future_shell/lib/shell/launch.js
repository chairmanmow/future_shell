"use strict";

load(system.mods_dir + 'future_shell/lib/util/usage_tracker.js');
load(system.mods_dir + 'future_shell/lib/util/launch_queue.js');
var UsageTracker = this.UsageTracker || {};
var LaunchQueue = this.LaunchQueue || {};

IconShell.prototype._normalizeNodeStatusKind = function (kind, fallback) {
    var value = String(kind || fallback || '').toLowerCase();
    switch (value) {
        case 'sub':
        case 'subprogram':
        case 'using':
            return 'using';
        case 'browse':
        case 'browsing':
        case 'folder':
        case 'view':
            return 'browsing';
        case 'app':
        case 'external':
        case 'run':
        case 'running':
        case 'xtrn':
            return 'running';
    }
    return fallback || 'using';
};

IconShell.prototype._normalizeNodeStatusLabel = function (label, fallback) {
    var value = label == null ? '' : String(label);
    value = value.replace(/\x01./g, '');
    value = value.replace(/[\x00-\x1F\x7F]+/g, ' ');
    value = value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (!value.length && fallback != null) {
        value = String(fallback);
        value = value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    return value;
};

IconShell.prototype._humanizeNodeStatusLabel = function (value) {
    var text = this._normalizeNodeStatusLabel(value, '');
    if (!text.length) return '';
    return text.replace(/[_:]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
};

IconShell.prototype._renderNodeStatusTemplate = function (template, vars) {
    var source = template == null ? '' : String(template);
    vars = vars || {};
    return source.replace(/\$\{([A-Za-z0-9_]+)\}/g, function (_, key) {
        return Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null ? String(vars[key]) : '';
    });
};

IconShell.prototype._buildNodeStatusText = function (defaultKind, meta) {
    meta = meta || {};
    var kind = this._normalizeNodeStatusKind(meta.kind, defaultKind || 'using');
    var rawLabel = meta.label;
    if ((rawLabel == null || rawLabel === '') && meta.programId) rawLabel = meta.programId;
    var label = this._normalizeNodeStatusLabel(rawLabel, this._humanizeNodeStatusLabel(rawLabel));
    if (!label.length && meta.fallbackLabel) {
        label = this._normalizeNodeStatusLabel(meta.fallbackLabel, this._humanizeNodeStatusLabel(meta.fallbackLabel));
    }
    var vars = {
        action: kind,
        folderName: label,
        kind: kind,
        label: label,
        name: label,
        programId: meta.programId ? String(meta.programId) : '',
        subprogram: label,
        subprogramName: label,
        xtrn: label,
        xtrnName: label
    };
    var text = '';
    if (meta.text != null && String(meta.text).length) {
        text = this._renderNodeStatusTemplate(meta.text, vars);
    } else if (label.length) {
        text = kind + ' ' + label;
    } else {
        text = kind;
    }
    return this._normalizeNodeStatusLabel(text, '');
};

IconShell.prototype._setNodeStatusText = function (text) {
    if (typeof setNodeStatus !== 'function') return false;
    try {
        return setNodeStatus(text || '');
    } catch (e) {
        dbug('node status set failed: ' + e, 'launch');
    }
    return false;
};

IconShell.prototype._clearNodeStatus = function () {
    return this._setNodeStatusText('');
};

IconShell.prototype._setNodeStatusForContext = function (defaultKind, meta) {
    var text = this._buildNodeStatusText(defaultKind, meta);
    if (!text.length) return false;
    return this._setNodeStatusText(text);
};

IconShell.prototype._captureNodeStatusIntent = function (item) {
    this._pendingNodeStatusItem = item || null;
};

IconShell.prototype._clearNodeStatusIntent = function () {
    this._pendingNodeStatusItem = null;
};

IconShell.prototype._consumeNodeStatusIntent = function (defaultKind) {
    var item = this._pendingNodeStatusItem;
    this._pendingNodeStatusItem = null;
    if (!item) return null;
    return {
        item: item,
        kind: item.nodeStatusKind || defaultKind || null,
        label: item.nodeStatusLabel || item.label || '',
        text: item.nodeStatus || item.nodeStatusText || ''
    };
};

IconShell.prototype._folderNodeStatusMeta = function (node) {
    node = node || {};
    return {
        kind: node.nodeStatusKind || 'browsing',
        label: node.nodeStatusLabel || node.label || 'Home',
        text: node.nodeStatus || node.nodeStatusText || ''
    };
};

IconShell.prototype._subprogramNodeStatusMeta = function (name, handlers, meta) {
    handlers = handlers || {};
    meta = meta || handlers._nodeStatusMeta || {};
    return {
        kind: meta.kind || 'using',
        label: meta.label || meta.fallbackLabel || handlers.label || handlers.title || handlers.displayName || handlers.name || this._humanizeNodeStatusLabel(name) || 'subprogram',
        text: meta.text || '',
        programId: meta.programId || name || handlers.id || handlers.name || ''
    };
};

IconShell.prototype._externalNodeStatusMeta = function (opts, intent) {
    opts = opts || {};
    intent = intent || {};
    return {
        kind: opts.nodeStatusKind || intent.kind || 'running',
        label: opts.nodeStatusLabel || opts.label || intent.label || this._humanizeNodeStatusLabel(opts.programId) || 'external program',
        text: opts.nodeStatusText || opts.nodeStatus || intent.text || '',
        programId: opts.programId || intent.programId || ''
    };
};

IconShell.prototype._screensaverNodeStatusMeta = function () {
    return {
        kind: 'idle',
        text: (typeof this.nodeStatusIdleText === 'string' && this.nodeStatusIdleText.length)
            ? this.nodeStatusIdleText
            : 'idle'
    };
};

IconShell.prototype._refreshNodeStatus = function () {
    if (this._screenSaver && typeof this._screenSaver.isActive === 'function' && this._screenSaver.isActive()) {
        return this._setNodeStatusForContext('idle', this._screensaverNodeStatusMeta());
    }
    if (this.activeSubprogram && this.activeSubprogram.running) {
        return this._setNodeStatusForContext('using', this._subprogramNodeStatusMeta(this.activeSubprogram.name, this.activeSubprogram, this.activeSubprogram._nodeStatusMeta));
    }
    var node = this.stack && this.stack.length ? this.stack[this.stack.length - 1] : null;
    if (node) return this._setNodeStatusForContext('browsing', this._folderNodeStatusMeta(node));
    return this._clearNodeStatus();
};

IconShell.prototype.runExternal = function (fn, opts) {
    opts = opts || {};
    var trackUsage = (opts.trackUsage !== false);
    var programId = opts.programId || 'unknown';
    var broadcastLaunch = opts.broadcast !== false;
    var activeBefore = this.activeSubprogram || null;
    var shouldResumeSub = !!(activeBefore && activeBefore.running);
    var nodeStatusMeta = this._externalNodeStatusMeta(opts, this._consumeNodeStatusIntent('running'));

    // Award points for running external program
    if (this._pointsSystem && typeof this._pointsSystem.award === 'function') {
        try {
            this._pointsSystem.award('ranExternal');
            // Extra points for door games
            if (programId && programId !== 'unknown') {
                this._pointsSystem.award('playedDoor');
            }
        } catch (e) { dbug('[launch] points award error: ' + e, 'points'); }
    }
    if (broadcastLaunch && LaunchQueue && typeof LaunchQueue.record === 'function' && programId && programId !== 'unknown') {
        try {
            dbug('[launch_queue] recording launch programId=' + programId + ' label=' + (opts.label || programId) + ' icon=' + (opts.icon || ''), 'launch');
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
        // Suspend JSON chat before launching external to prevent multi-user freezes
        if (typeof this._suspendJsonChat === 'function') {
            try { this._suspendJsonChat(); } catch (e) { dbug('[launch] _suspendJsonChat failed: ' + e, 'external'); }
        }
        if (typeof this._notifyMrcExternalSuspend === 'function') {
            try { this._notifyMrcExternalSuspend({ programId: programId }); } catch (_) { }
        }
        if (shouldResumeSub && typeof activeBefore.pauseForReason === 'function') {
            try { activeBefore.pauseForReason('external_launch'); } catch (_) { }
        }
        this._setNodeStatusForContext('running', nodeStatusMeta);
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
        // Resume JSON chat after external returns
        if (typeof this._resumeJsonChat === 'function') {
            try { this._resumeJsonChat(); } catch (e) { dbug('[launch] _resumeJsonChat failed: ' + e, 'external'); }
        }
        var endTs = Date.now();
        console.clear();
        this.recreateFramesIfNeeded();
        if (typeof console !== 'undefined' && typeof console.mouse_mode !== 'undefined') {
            console.mouse_mode = !!this.mouseActive;
        }
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
                this._gridHotspotBuffer = '';
                if (this.grid && this.grid.cells && this.grid.cells.length) {
                    if (typeof this._clearHotspots === 'function') this._clearHotspots();
                    if (typeof this._addMouseHotspots === 'function') this._addMouseHotspots();
                }
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
        this._refreshNodeStatus();
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
IconShell.prototype.queueSubprogramLaunch = function (name, instance, meta) {
    dbug('Queue subprogram launch: ' + name, 'subprogram');
    this._pendingSubLaunch = { name: name, instance: instance, statusMeta: meta || this._consumeNodeStatusIntent('using'), _queuedAt: Date.now() };
    // Mark that we just processed a CR; swallow subsequent LF if present
    this._swallowNextLF = true;
};

// Launch a subprogram (e.g., chat)
IconShell.prototype.launchSubprogram = function (name, handlers, statusMeta) {
    dbug("Launch subprogram " + name, "subprogram");

    // Clean up any currently-active subprogram before launching the new one.
    // This prevents orphaned frames when e.g. a toast click launches a new
    // subprogram while another is still running.
    if (this.activeSubprogram && this.activeSubprogram.running) {
        dbug('Cleaning up active subprogram before launching ' + name, 'subprogram');
        try { this.activeSubprogram.exit(); } catch (e) {
            dbug('launchSubprogram: old sub exit error: ' + e, 'subprogram');
            // Fallback: at least try cleanup directly
            try { this.activeSubprogram.cleanup(); } catch (ce) {
                dbug('launchSubprogram: old sub cleanup fallback error: ' + ce, 'subprogram');
            }
        }
        this.activeSubprogram = null;
    }

    // If launching chat, always use the persistent instance
    if (name === "chat" && this.chat) {
        this.activeSubprogram = this.chat;
    } else {
        this.activeSubprogram = handlers;
    }
    if (this.activeSubprogram && typeof this.activeSubprogram.attachShellTimer === 'function') {
        this.activeSubprogram.attachShellTimer(this.timer);
    }
    this.activeSubprogram._nodeStatusMeta = this._subprogramNodeStatusMeta(name, this.activeSubprogram, statusMeta);
    // Proactively shelve (dispose) folder frames to prevent residual redraw artifacts.

    if (typeof this._shelveFolderFrames === 'function') this._shelveFolderFrames();

    // Ensure the subprogram has a parentFrame connected to the shell's frame tree.
    // Without this, persistent subprograms (like chat) create standalone frames
    // whose display is disconnected from the shell — leaving visual artifacts on exit.
    var subParent = this.subFrame || this.view;
    if (subParent && typeof this.activeSubprogram.setParentFrame === 'function') {
        this.activeSubprogram.setParentFrame(subParent);
    }

    this.activeSubprogram.enter(this.exitSubprogram.bind(this));
    this._setNodeStatusForContext('using', this.activeSubprogram._nodeStatusMeta);

    this._refreshScreenSaverFrame();
};

// Exit subprogram and return to shell
IconShell.prototype.exitSubprogram = function () {
    dbug("Exit subprogram", "subprogram");
    if (this.activeSubprogram) {
        if (typeof this.activeSubprogram.detachShellTimer === 'function') {
            this.activeSubprogram.detachShellTimer();
        }
        // Defensive: if the subprogram still considers itself running, its
        // cleanup() was never called (e.g. it was orphaned). Run it now.
        if (this.activeSubprogram.running) {
            dbug('exitSubprogram: sub still running, calling cleanup()', 'subprogram');
            try { this.activeSubprogram.cleanup(); } catch (e) {
                dbug('exitSubprogram: defensive cleanup error: ' + e, 'subprogram');
            }
            this.activeSubprogram.running = false;
        }
    }
    this.activeSubprogram = null;
    // Mark shelved state false so folder will rebuild cleanly
    this._folderShelved = false;
    this._refreshScreenSaverFrame();
    this.recreateFramesIfNeeded();
    this._refreshNodeStatus();
    if (!this.activeSubprogram || !this.activeSubprogram.running) this.drawFolder();
};
