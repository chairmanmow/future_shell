/**
"use strict";
 * MRC Controller Factory
 * Ensures one persistent controller per node, stored on bbs object.
 * Survives shell crashes/reloads for seamless MRC experience.
 * 
 * User preferences (alias colors, msg_fg) are stored via ShellPrefs/json-db.
 * Server settings (host, port, room) are loaded from mrc-client.ini.
 */

load('future_shell/lib/mrc/controller.js');

/**
 * Get or create the MRC controller for this node.
 * Stored on bbs._mrcController to persist across shell reloads.
 * 
 * @param {object} opts - Configuration options
 * @param {object} opts.shell - Shell instance (required for shell prefs access)
 * @param {Timer} opts.timer - Optional timer for cycle scheduling
 * @returns {MrcController} The persistent controller instance
 */
function getMrcController(opts) {
    opts = opts || {};
    function mrcLog(msg) {
        try { if (typeof dbug === 'function') dbug(msg, 'mrc'); } catch (_) { }
    }

    // Ensure bbs object exists and has our storage namespace
    if (typeof bbs === 'undefined') {
        throw new Error('getMrcController: bbs object not available');
    }

    // MIGRATION: Clean up old global controller if it exists
    if (bbs._mrcController) {
        try {
            mrcLog('[mrc-factory] Migrating: disconnecting old global controller');
            if (typeof bbs._mrcController.disconnect === 'function') {
                bbs._mrcController.disconnect();
            }
        } catch (_) { }
        delete bbs._mrcController;
        mrcLog('[mrc-factory] Migrated: old global controller removed');
    }

    // Get node-specific key
    var nodeNum = bbs.node_num || 1;
    var controllerKey = '_mrcController_node' + nodeNum;

    mrcLog('[mrc-factory] Node ' + nodeNum + ': looking for ' + controllerKey);

    // Return existing controller if present for this node
    if (bbs[controllerKey] && typeof bbs[controllerKey].tick === 'function') {
        // Controller exists - update shell and timer references
        // Shell must be updated to ensure activeSubprogram checks work correctly
        if (opts.shell) {
            bbs[controllerKey].shell = opts.shell;
        }
        if (opts.timer && typeof bbs[controllerKey].attachTimer === 'function') {
            try { bbs[controllerKey].attachTimer(opts.timer); } catch (_) { }
        }
        return bbs[controllerKey];
    }

    // Load server settings from INI file
    mrcLog('[mrc-factory] Node ' + nodeNum + ': loading server settings');
    var serverSettings = _loadServerSettings();
    mrcLog('[mrc-factory] Node ' + nodeNum + ': server settings: ' + JSON.stringify(serverSettings));

    // Get username for this session
    var username = (typeof user !== 'undefined' && user && user.alias) ? user.alias : 'guest';

    // Get user preferences (alias, msg_color, msg_bg) from ShellPrefs via shell
    var formattedAlias = '';
    var msgColor = 7;
    var msgBg = 0;
    
    if (opts.shell && typeof opts.shell._getShellPrefs === 'function') {
        try {
            var prefs = opts.shell._getShellPrefs();
            if (prefs) {
                // Get MRC alias from shell prefs (auto-generates if not set)
                if (typeof prefs.getMrcAlias === 'function') {
                    formattedAlias = prefs.getMrcAlias();
                    mrcLog('[mrc-factory] Node ' + nodeNum + ': got alias from shell prefs: ' + formattedAlias);
                }
                // Get msg_color from shell prefs
                if (typeof prefs.getMrcMsgColor === 'function') {
                    msgColor = prefs.getMrcMsgColor();
                    mrcLog('[mrc-factory] Node ' + nodeNum + ': got msg_color from shell prefs: ' + msgColor);
                }
                // Get msg_bg from shell prefs
                if (typeof prefs.getMrcMsgBg === 'function') {
                    msgBg = prefs.getMrcMsgBg();
                    mrcLog('[mrc-factory] Node ' + nodeNum + ': got msg_bg from shell prefs: ' + msgBg);
                }
            }
        } catch (prefsErr) {
            mrcLog('[mrc-factory] Node ' + nodeNum + ': shell prefs error: ' + prefsErr);
        }
    }

    // Fallback: generate alias if shell prefs not available
    if (!formattedAlias) {
        formattedAlias = _generateFallbackAlias(username);
        mrcLog('[mrc-factory] Node ' + nodeNum + ': generated fallback alias: ' + formattedAlias);
    }

    var controllerOpts = {
        host: serverSettings.server || 'localhost',
        port: parseInt(serverSettings.port, 10) || 5000,
        user: username,
        pass: (typeof user !== 'undefined' && user && user.security && user.security.password) ? user.security.password : '',
        alias: formattedAlias,
        msg_color: msgColor,
        msg_bg: msgBg,
        room: serverSettings.room || 'futureland',
        nodeId: nodeNum,
        timer: opts.timer || null,
        shell: opts.shell || null
    };

    mrcLog('[mrc-factory] Node ' + nodeNum + ': creating controller with alias=' + controllerOpts.alias + ', msg_color=' + controllerOpts.msg_color + ', msg_bg=' + controllerOpts.msg_bg);

    try {
        bbs[controllerKey] = new MrcController(controllerOpts);

        // Check if controller was actually created
        if (!bbs[controllerKey]) {
            throw new Error('Controller creation returned null/undefined');
        }

        mrcLog('[mrc-factory] Node ' + nodeNum + ': created new controller for ' + controllerOpts.user);

        // Auto-connect on creation
        try {
            if (typeof bbs[controllerKey].connect === 'function') {
                bbs[controllerKey].connect();
            } else {
                throw new Error('Controller missing connect method');
            }
        } catch (connErr) {
            mrcLog('[mrc-factory] auto-connect failed: ' + connErr);
            // Don't fail the whole factory if connect fails - just log and continue
        }

        return bbs[controllerKey];
    } catch (createErr) {
        mrcLog('[mrc-factory] controller creation failed: ' + createErr);
        throw createErr;
    }
}

/**
 * Load MRC server settings from INI file.
 * Only loads server connection info, NOT user preferences.
 * @returns {object} Settings object with server, port, room
 */
function _loadServerSettings() {
    var defaults = {
        server: 'localhost',
        port: 5000,
        room: 'futureland'
    };

    try {
        if (typeof system === 'undefined' || !system.exec_dir) return defaults;

        // Load from xtrn/mrc/mrc-client.ini (canonical location)
        var iniPath = backslash(system.exec_dir) + '../xtrn/mrc/mrc-client.ini';
        if (!file_exists(iniPath)) return defaults;

        var f = new File(iniPath);
        if (!f.open('r')) return defaults;

        var settings = {};
        try {
            // Load root section (no section header)
            var root = f.iniGetObject() || {};
            settings.server = root.server || defaults.server;
            settings.port = root.port || defaults.port;

            // Load startup section for room
            var startup = f.iniGetObject('startup') || {};
            settings.room = startup.room || defaults.room;
        } finally {
            f.close();
        }

        return settings;
    } catch (loadErr) {
        return defaults;
    }
}

// Valid foreground colors for MRC aliases (excludes black, dark colors for visibility)
var MRC_FALLBACK_FG_COLORS = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15];

/**
 * Generate a fallback alias when ShellPrefs is not available.
 * This should rarely happen - only if shell context is missing.
 * Uses the new format with background codes.
 * @param {string} username - The user's alias/name
 * @returns {string} Formatted alias with color codes
 */
function _generateFallbackAlias(username) {
    var bracketFg = 3; // Cyan for brackets
    var bracketBg = 0; // Black background
    var nameFg = MRC_FALLBACK_FG_COLORS[Math.floor(Math.random() * MRC_FALLBACK_FG_COLORS.length)];
    var nameBg = 0; // Black background
    var name = (username || 'guest').replace(/\s/g, '_');
    
    // Pipe codes: 00-15 = foreground, 16-23 = background (16 + bg color)
    var bracketBgCode = 16 + bracketBg;
    var nameBgCode = 16 + nameBg;
    
    return format('|%02d|%02d<|%02d|%02d%s|%02d|%02d>',
        bracketBgCode, bracketFg,
        nameBgCode, nameFg, name,
        bracketBgCode, bracketFg
    );
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
        try {
            if (typeof dbug === 'function') dbug('[mrc-factory] disconnect error: ' + disconnErr, 'mrc');
        } catch (_) { }
    }

    delete bbs[controllerKey];
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getMrcController: getMrcController, destroyMrcController: destroyMrcController };
}

// Return the main function for load() usage
getMrcController;
