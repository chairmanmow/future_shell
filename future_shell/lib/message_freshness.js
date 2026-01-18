/**
"use strict";
 * Message Freshness Checker
 * 
 * Computes "new since last check" counts for message subs by directly polling
 * MsgBase.last_msg, avoiding Synchronet's scan_subs() and its side effects.
 * 
 * Usage:
 *   load('future_shell/lib/message_freshness.js');
 *   var checker = new MessageFreshnessChecker({ userNumber: user.number });
 *   var result = checker.check(['fsx_gen', 'fsx_bbs'], { force: false });
 *   // result.perSub = { fsx_gen: 5, fsx_bbs: '50+' }
 *   // result.total = 55
 *   // result.checkedAt = 1736000000
 */

load('sbbsdefs.js');

// Configuration defaults
var DEFAULT_REFRESH_SECS = 90;       // Debounce interval in seconds
var DEFAULT_MAX_COUNT_WALK = 50;     // Walk headers only if delta <= this
var DEFAULT_MAX_COUNT = 50;          // Cap reported count at this value

// State directory under system.data_dir
var STATE_DIR = 'user_msg_freshness';

/**
 * MessageFreshnessChecker constructor
 * @param {Object} opts
 * @param {number} opts.userNumber - User number (required)
 * @param {number} [opts.refreshSecs] - Debounce interval (default 90)
 * @param {number} [opts.maxCountWalk] - Walk headers only if delta <= this (default 50)
 * @param {number} [opts.maxCount] - Cap count at this value (default 50)
 * @param {boolean} [opts.filterDeleted] - If true, walk headers to skip deleted/nodisp (default false)
 */
function MessageFreshnessChecker(opts) {
    opts = opts || {};
    if (!opts.userNumber && opts.userNumber !== 0) {
        throw new Error('MessageFreshnessChecker requires userNumber');
    }
    this.userNumber = opts.userNumber;
    this.refreshSecs = (typeof opts.refreshSecs === 'number') ? opts.refreshSecs : DEFAULT_REFRESH_SECS;
    this.maxCountWalk = (typeof opts.maxCountWalk === 'number') ? opts.maxCountWalk : DEFAULT_MAX_COUNT_WALK;
    this.maxCount = (typeof opts.maxCount === 'number') ? opts.maxCount : DEFAULT_MAX_COUNT;
    this.filterDeleted = !!opts.filterDeleted;
    
    this._stateDir = backslash(system.data_dir) + STATE_DIR;
    this._stateFile = this._stateDir + '/' + format('%04d', this.userNumber) + '.json';
    this._state = null;
    this._lastResult = null;
}

/**
 * Check freshness for a list of sub codes
 * @param {string[]} subCodes - Array of sub codes to check
 * @param {Object} [opts]
 * @param {boolean} [opts.force] - Bypass debounce
 * @param {number} [opts.maxCount] - Override maxCount for this call
 * @returns {Object} result
 * @returns {Object} result.perSub - Map of subCode -> delta (number or "N+")
 * @returns {number} result.total - Sum of deltas (capped values count as maxCount)
 * @returns {number} result.checkedAt - Epoch seconds when check was performed
 * @returns {string[]} result.skippedSubs - Subs that failed to open
 * @returns {boolean} result.debounced - True if result was debounced (cached)
 */
MessageFreshnessChecker.prototype.check = function (subCodes, opts) {
    opts = opts || {};
    var force = !!opts.force;
    var maxCount = (typeof opts.maxCount === 'number') ? opts.maxCount : this.maxCount;
    var now = Math.floor(Date.now() / 1000);
    
    // Load state
    this._loadState();
    
    // Debounce check
    if (!force && this._state.lastCheckTs) {
        var elapsed = now - this._state.lastCheckTs;
        if (elapsed < this.refreshSecs && this._lastResult) {
            // Return cached result with debounced flag
            var cached = {};
            for (var k in this._lastResult) {
                cached[k] = this._lastResult[k];
            }
            cached.debounced = true;
            return cached;
        }
    }
    
    var perSub = {};
    var skippedSubs = [];
    var total = 0;
    var cappedTotal = false;
    
    for (var i = 0; i < subCodes.length; i++) {
        var subCode = subCodes[i];
        if (!subCode) continue;
        
        var delta = this._checkSub(subCode, maxCount);
        if (delta === null) {
            skippedSubs.push(subCode);
            continue;
        }
        
        perSub[subCode] = delta;
        
        // Accumulate total
        if (typeof delta === 'number') {
            total += delta;
        } else if (typeof delta === 'string' && delta.indexOf('+') > 0) {
            // Capped value like "50+"
            var numPart = parseInt(delta, 10);
            if (!isNaN(numPart)) {
                total += numPart;
                cappedTotal = true;
            }
        }
    }
    
    // Update state
    this._state.lastCheckTs = now;
    this._saveState();
    
    var result = {
        perSub: perSub,
        total: total,
        cappedTotal: cappedTotal,
        checkedAt: now,
        skippedSubs: skippedSubs,
        debounced: false
    };
    
    this._lastResult = result;
    return result;
};

/**
 * Check a single sub and update state
 * @private
 * @param {string} subCode
 * @param {number} maxCount
 * @returns {number|string|null} delta, "N+" if capped, or null if failed
 */
MessageFreshnessChecker.prototype._checkSub = function (subCode, maxCount) {
    var mb;
    try {
        mb = new MsgBase(subCode);
    } catch (e) {
        return null;
    }
    
    if (!mb.open()) {
        return null;
    }
    
    var current = mb.last_msg;
    var previous = this._state.lastSeenLastMsg[subCode];
    
    // Initialize if missing
    if (typeof previous !== 'number') {
        this._state.lastSeenLastMsg[subCode] = current;
        mb.close();
        return 0;
    }
    
    var deltaRaw = Math.max(0, current - previous);
    var delta = deltaRaw;
    
    // If filtering deleted and delta is small enough, walk headers
    if (this.filterDeleted && deltaRaw > 0 && deltaRaw <= this.maxCountWalk) {
        var filteredDelta = 0;
        for (var n = previous + 1; n <= current && filteredDelta <= maxCount; n++) {
            try {
                var hdr = mb.get_msg_header(false, n);
                if (!hdr) continue;
                // Skip deleted or nodisp
                if ((hdr.attr & MSG_DELETE) || (hdr.attr & MSG_NODISP)) continue;
                filteredDelta++;
            } catch (e) {
                // Skip on error
            }
        }
        delta = filteredDelta;
    }
    
    // Cap if exceeds maxCount
    if (delta > maxCount) {
        delta = maxCount + '+';
    }
    
    // Update pointer
    this._state.lastSeenLastMsg[subCode] = current;
    mb.close();
    
    return delta;
};

/**
 * Load state from disk
 * @private
 */
MessageFreshnessChecker.prototype._loadState = function () {
    if (this._state) return;
    
    this._state = {
        lastSeenLastMsg: {},
        lastCheckTs: 0
    };
    
    try {
        var f = new File(this._stateFile);
        if (f.exists && f.open('r')) {
            var content = f.read();
            f.close();
            if (content) {
                var parsed = JSON.parse(content);
                if (parsed && typeof parsed === 'object') {
                    if (parsed.lastSeenLastMsg && typeof parsed.lastSeenLastMsg === 'object') {
                        this._state.lastSeenLastMsg = parsed.lastSeenLastMsg;
                    }
                    if (typeof parsed.lastCheckTs === 'number') {
                        this._state.lastCheckTs = parsed.lastCheckTs;
                    }
                }
            }
        }
    } catch (e) {
        // State missing or corrupt - use defaults
        this._state = {
            lastSeenLastMsg: {},
            lastCheckTs: 0
        };
    }
};

/**
 * Save state to disk atomically (write temp then rename)
 * @private
 */
MessageFreshnessChecker.prototype._saveState = function () {
    if (!this._state) return;
    
    // Ensure directory exists
    try {
        if (!file_isdir(this._stateDir)) {
            mkdir(this._stateDir);
        }
    } catch (e) {
        // Ignore mkdir errors
    }
    
    var tempFile = this._stateFile + '.tmp';
    var content = JSON.stringify(this._state);
    
    try {
        var f = new File(tempFile);
        if (f.open('w')) {
            f.write(content);
            f.close();
            // Atomic rename
            file_rename(tempFile, this._stateFile);
        }
    } catch (e) {
        // Failed to save - non-fatal
        try { file_remove(tempFile); } catch (_) {}
    }
};

/**
 * Force refresh on next check (clears debounce)
 */
MessageFreshnessChecker.prototype.invalidate = function () {
    if (this._state) {
        this._state.lastCheckTs = 0;
    }
    this._lastResult = null;
};

/**
 * Reset state for specific subs (sets pointer to current last_msg)
 * Useful after user reads messages in a sub
 * @param {string[]} subCodes
 */
MessageFreshnessChecker.prototype.markRead = function (subCodes) {
    this._loadState();
    
    for (var i = 0; i < subCodes.length; i++) {
        var subCode = subCodes[i];
        if (!subCode) continue;
        
        try {
            var mb = new MsgBase(subCode);
            if (mb.open()) {
                this._state.lastSeenLastMsg[subCode] = mb.last_msg;
                mb.close();
            }
        } catch (e) {
            // Skip on error
        }
    }
    
    this._saveState();
};

/**
 * Get current pointer for a sub without updating it
 * @param {string} subCode
 * @returns {number|undefined}
 */
MessageFreshnessChecker.prototype.getPointer = function (subCode) {
    this._loadState();
    return this._state.lastSeenLastMsg[subCode];
};

/**
 * Get all stored pointers
 * @returns {Object} map of subCode -> lastSeenLastMsg
 */
MessageFreshnessChecker.prototype.getAllPointers = function () {
    this._loadState();
    var result = {};
    for (var k in this._state.lastSeenLastMsg) {
        result[k] = this._state.lastSeenLastMsg[k];
    }
    return result;
};

/**
 * Convenience: get sub codes from a message group
 * @param {number} grp - Group number
 * @returns {string[]}
 */
MessageFreshnessChecker.getSubCodesForGroup = function (grp) {
    var codes = [];
    if (typeof msg_area === 'undefined' || !msg_area.grp_list) return codes;
    if (grp < 0 || grp >= msg_area.grp_list.length) return codes;
    var group = msg_area.grp_list[grp];
    if (!group || !group.sub_list) return codes;
    for (var i = 0; i < group.sub_list.length; i++) {
        var sub = group.sub_list[i];
        if (sub && sub.code) codes.push(sub.code);
    }
    return codes;
};

/**
 * Convenience: get all sub codes user has access to
 * @returns {string[]}
 */
MessageFreshnessChecker.getAllSubCodes = function () {
    var codes = [];
    if (typeof msg_area === 'undefined' || !msg_area.grp_list) return codes;
    for (var g = 0; g < msg_area.grp_list.length; g++) {
        var group = msg_area.grp_list[g];
        if (!group || !group.sub_list) continue;
        for (var s = 0; s < group.sub_list.length; s++) {
            var sub = group.sub_list[s];
            if (sub && sub.code) codes.push(sub.code);
        }
    }
    return codes;
};

// Export
if (typeof registerModuleExports === 'function') {
    registerModuleExports({ MessageFreshnessChecker: MessageFreshnessChecker });
} else {
    this.MessageFreshnessChecker = MessageFreshnessChecker;
}
