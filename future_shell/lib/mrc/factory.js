/**
 * MRC Controller Factory
 * Ensures one persistent controller per node, stored on bbs object.
 * Survives shell crashes/reloads for seamless MRC experience.
 */

load('future_shell/lib/mrc/controller.js');

/**
 * Get or create the MRC controller for this node.
 * Stored on bbs._mrcController to persist across shell reloads.
 * 
 * @param {object} opts - Configuration options
 * @param {object} opts.shell - Shell instance (for timer integration)
 * @param {Timer} opts.timer - Optional timer for cycle scheduling
 * @returns {MrcController} The persistent controller instance
 */
function getMrcController(opts) {
    opts = opts || {};

    // Ensure bbs object exists and has our storage namespace
    if (typeof bbs === 'undefined') {
        throw new Error('getMrcController: bbs object not available');
    }

    // MIGRATION: Clean up old global controller if it exists
    if (bbs._mrcController) {
        try {
            if (typeof log === 'function') {
                log(LOG_INFO, '[mrc-factory] Migrating: disconnecting old global controller');
            }
            if (typeof bbs._mrcController.disconnect === 'function') {
                bbs._mrcController.disconnect();
            }
        } catch (_) { }
        delete bbs._mrcController;
        try {
            if (typeof log === 'function') {
                log(LOG_INFO, '[mrc-factory] Migrated: old global controller removed');
            }
        } catch (_) { }
    }

    // Get node-specific key
    var nodeNum = bbs.node_num || 1;
    var controllerKey = '_mrcController_node' + nodeNum;

    try {
        if (typeof log === 'function') {
            log(LOG_DEBUG, '[mrc-factory] Node ' + nodeNum + ': looking for ' + controllerKey);
        }
    } catch (_) { }

    // Return existing controller if present for this node
    if (bbs[controllerKey] && typeof bbs[controllerKey].tick === 'function') {
        // Controller exists - just update timer if provided
        if (opts.timer && typeof bbs[controllerKey].attachTimer === 'function') {
            try { bbs[controllerKey].attachTimer(opts.timer); } catch (_) { }
        }
        return bbs[controllerKey];
    }
    // Create new controller with settings from INI
    try {
        if (typeof log === 'function') {
            log(LOG_DEBUG, '[mrc-factory] Node ' + nodeNum + ': loading settings');
        }
    } catch (_) { }

    var settings = _loadMrcSettings();

    try {
        if (typeof log === 'function') {
            log(LOG_DEBUG, '[mrc-factory] Node ' + nodeNum + ': settings loaded: ' + JSON.stringify(settings));
        }
    } catch (_) { }

    var controllerOpts = {
        host: settings.server || 'localhost',
        port: parseInt(settings.port, 10) || 5000,
        user: (typeof user !== 'undefined' && user && user.alias) ? user.alias : 'guest',
        pass: (typeof user !== 'undefined' && user && user.security && user.security.password) ? user.security.password : '',
        alias: settings.alias || '',
        room: settings.room || 'futureland',
        nodeId: nodeNum,
        timer: opts.timer || null,
        shell: opts.shell || null
    };

    try {
        if (typeof log === 'function') {
            log(LOG_DEBUG, '[mrc-factory] Node ' + nodeNum + ': creating controller with opts: ' + JSON.stringify(controllerOpts));
        }
    } catch (_) { }

    try {
        bbs[controllerKey] = new MrcController(controllerOpts);

        // Check if controller was actually created
        if (!bbs[controllerKey]) {
            throw new Error('Controller creation returned null/undefined');
        }

        try {
            if (typeof log === 'function') {
                log(LOG_INFO, '[mrc-factory] Node ' + nodeNum + ': created new controller for ' + controllerOpts.user);
            }
        } catch (_) { }

        // Auto-connect on creation
        try {
            if (typeof bbs[controllerKey].connect === 'function') {
                bbs[controllerKey].connect();
            } else {
                throw new Error('Controller missing connect method');
            }
        } catch (connErr) {
            try { log('[mrc-factory] auto-connect failed: ' + connErr); } catch (_) { }
            // Don't fail the whole factory if connect fails - just log and continue
        }

        return bbs[controllerKey];
    } catch (createErr) {
        try { log('[mrc-factory] controller creation failed: ' + createErr); } catch (_) { }
        throw createErr;
    }
}

/**
 * Load MRC settings from INI file
 * @returns {object} Settings object with server, port, alias, room
 */
function _loadMrcSettings() {
    var defaults = {
        server: 'localhost',
        port: 5000,
        alias: '',
        room: 'futureland'
    };

    try {
        if (typeof system === 'undefined' || !system.mods_dir) return defaults;

        var iniPath = system.mods_dir + 'future_shell/config/mrc.ini';
        if (!file_exists(iniPath)) return defaults;

        var f = new File(iniPath);
        if (!f.open('r')) return defaults;

        var settings = {};
        var line;
        while ((line = f.readln()) !== null) {
            line = line.trim();
            if (!line || line.charAt(0) === ';' || line.charAt(0) === '#') continue;

            var match = line.match(/^(\w+)\s*=\s*(.+)$/);
            if (match) {
                var key = match[1].toLowerCase();
                var value = match[2].trim();
                if (key === 'server' || key === 'host') settings.server = value;
                else if (key === 'port') settings.port = value;
                else if (key === 'alias') settings.alias = value;
                else if (key === 'room') settings.room = value;
            }
        }

        f.close();

        // Merge with defaults
        for (var key in defaults) {
            if (!settings[key]) settings[key] = defaults[key];
        }

        return settings;
    } catch (loadErr) {
        try { log('[mrc-factory] settings load error: ' + loadErr); } catch (_) { }
        return defaults;
    }
}

/**
 * Disconnect and cleanup the controller for this node.
 * Useful for explicit disconnection (e.g., user logoff).
 */
function destroyMrcController() {
    if (typeof bbs === 'undefined') return;

    var nodeNum = bbs.node_num || 1;
    var controllerKey = '_mrcController_node' + nodeNum;

    if (!bbs[controllerKey]) return;

    try {
        if (typeof bbs[controllerKey].disconnect === 'function') {
            bbs[controllerKey].disconnect();
        }
    } catch (disconnErr) {
        try { log('[mrc-factory] disconnect error: ' + disconnErr); } catch (_) { }
    }

    delete bbs[controllerKey];
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getMrcController: getMrcController, destroyMrcController: destroyMrcController };
}

// Return the main function for load() usage
getMrcController;
