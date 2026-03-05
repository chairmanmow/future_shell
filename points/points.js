// points.js - BBS Points System Library
// Tracks and awards points to users for various BBS actions
//
// Architecture:
//   1. Session state (on bbs object): Ephemeral action tracking for display
//   2. Points ledger (persistent): Append-only {timestamp, delta, source} for blockchain
//
// Usage:
//   var points = load({}, system.mods_dir + 'points/points.js');
//   points.award('ranExternal');
//   points.commitSession();  // Called at logoff - writes to ledger
//   var balance = points.getBalance();

var CONFIG_PATH = system.mods_dir + 'points/points_config.json';
var DATA_DIR = system.data_dir + 'points/';
var SOURCE = 'futureland.today';  // BBS identifier for ledger entries

// Ensure data directory exists
if (!file_exists(DATA_DIR)) {
    mkdir(DATA_DIR);
}

// Load configuration
var config = { actions: {}, multipliers: {}, limits: {} };
try {
    var f = new File(CONFIG_PATH);
    if (f.open('r')) {
        var loaded = JSON.parse(f.read());
        f.close();
        config.actions = loaded.actions || {};
        config.multipliers = loaded.multipliers || {};
        config.limits = loaded.limits || {};
    } else {
        log(LOG_WARNING, 'points.js: Could not open config: ' + CONFIG_PATH);
    }
} catch (e) {
    log(LOG_WARNING, 'points.js: Failed to load config: ' + e);
}

// Session state key on bbs object (persists across load() calls within session)
var SESSION_KEY = '_pointsSession_' + (user ? user.number : 0);

// Initialize or retrieve session state from bbs object
function getSession() {
    if (!bbs[SESSION_KEY]) {
        bbs[SESSION_KEY] = {
            points: {},       // { action: totalPointsForAction }
            counts: {},       // { action: timesAwarded }
            startTime: Date.now(),
            committed: false  // Prevent double-commit
        };
    }
    return bbs[SESSION_KEY];
}

// Get ledger file path
function getLedgerPath(userNum) {
    return DATA_DIR + 'ledger_' + userNum + '.json';
}

// Load user's points ledger
function loadLedger(userNum) {
    var path = getLedgerPath(userNum);
    try {
        var f = new File(path);
        if (f.open('r')) {
            var data = JSON.parse(f.read());
            f.close();
            return data;
        }
    } catch (e) {
        // File doesn't exist or corrupt, start fresh
    }
    return {
        entries: [],           // Array of {timestamp, delta, source}
        lastLogin: null,
        consecutiveDays: 0
    };
}

// Save user's points ledger
function saveLedger(userNum, data) {
    var path = getLedgerPath(userNum);
    try {
        var f = new File(path);
        if (f.open('w')) {
            f.write(JSON.stringify(data, null, 2));
            f.close();
            return true;
        }
    } catch (e) {
        log(LOG_ERR, 'points.js: Failed to save ledger: ' + e);
    }
    return false;
}

// Get multiplier for current user
function getUserMultiplier() {
    if (!config.multipliers) return 1.0;
    
    // Sysop gets no points (or whatever configured)
    if (user.level >= 90 && typeof config.multipliers.sysop === 'number') {
        return config.multipliers.sysop;
    }
    
    // New users (< 7 days) get bonus
    if (config.multipliers.newUser) {
        var accountAge = Date.now() - (user.stats.firston_date * 1000);
        var sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (accountAge < sevenDays) {
            return config.multipliers.newUser;
        }
    }
    
    return 1.0;
}

// Check if action is at its per-session limit
function isActionAtLimit(action) {
    if (!config.limits || !config.limits.maxPointsPerAction) return false;
    var limit = config.limits.maxPointsPerAction[action];
    if (typeof limit !== 'number') return false;
    var session = getSession();
    return (session.points[action] || 0) >= limit;
}

// Check if session is at max points
function isSessionAtLimit() {
    if (!config.limits || typeof config.limits.maxPointsPerSession !== 'number') return false;
    var session = getSession();
    var total = 0;
    for (var a in session.points) {
        total += session.points[a];
    }
    return total >= config.limits.maxPointsPerSession;
}

// Award points for an action
function award(action, opts) {
    opts = opts || {};
    var session = getSession();
    
    // Don't award if already committed
    if (session.committed) {
        log(LOG_DEBUG, 'points.js: Session already committed');
        return 0;
    }
    
    // Check if action exists in config
    var basePoints = config.actions[action];
    if (typeof basePoints !== 'number') {
        log(LOG_DEBUG, 'points.js: Unknown action: ' + action);
        return 0;
    }
    
    // Check limits
    if (isSessionAtLimit()) {
        log(LOG_DEBUG, 'points.js: Session at max points limit');
        return 0;
    }
    if (isActionAtLimit(action)) {
        log(LOG_DEBUG, 'points.js: Action ' + action + ' at limit');
        return 0;
    }
    
    // Calculate points with multiplier
    var multiplier = getUserMultiplier();
    var count = opts.count || 1;
    var points = Math.floor(basePoints * multiplier * count);
    
    // Apply per-action limit if needed
    if (config.limits && config.limits.maxPointsPerAction && config.limits.maxPointsPerAction[action]) {
        var remaining = config.limits.maxPointsPerAction[action] - (session.points[action] || 0);
        points = Math.min(points, remaining);
    }
    
    // Apply session limit if needed
    if (config.limits && typeof config.limits.maxPointsPerSession === 'number') {
        var sessionTotal = 0;
        for (var a in session.points) sessionTotal += session.points[a];
        var sessionRemaining = config.limits.maxPointsPerSession - sessionTotal;
        points = Math.min(points, sessionRemaining);
    }
    
    if (points <= 0) return 0;
    
    // Track in session state on bbs object
    session.points[action] = (session.points[action] || 0) + points;
    session.counts[action] = (session.counts[action] || 0) + count;
    
    log(LOG_DEBUG, 'points.js: Awarded ' + points + ' points for ' + action + ' to user ' + user.alias);
    
    return points;
}

// Get human-readable action name
function getActionLabel(action) {
    var labels = {
        loggedIn: 'Logged In',
        loggedOff: 'Logged Off',
        ranExternal: 'Ran External Program',
        postedMessage: 'Posted Message',
        sentEmail: 'Sent Email',
        readMessage: 'Read Message',
        downloadedFile: 'Downloaded File',
        uploadedFile: 'Uploaded File',
        joinedChat: 'Joined Chat',
        sentChatMessage: 'Chat Message',
        setAvatar: 'Set Avatar',
        setEmail: 'Set Email',
        viewedUserList: 'Viewed User List',
        viewedStats: 'Viewed Stats',
        playedDoor: 'Played Door Game',
        firstLoginOfDay: 'First Login Today',
        consecutiveLoginDays: 'Consecutive Day Bonus'
    };
    return labels[action] || action;
}

// Get session summary for display at logoff (ephemeral, detailed)
function getSessionSummary() {
    var session = getSession();
    var summary = {
        actions: [],
        totalPoints: 0,
        sessionDuration: Math.floor((Date.now() - session.startTime) / 1000)
    };
    
    for (var action in session.points) {
        if (session.points[action] > 0) {
            summary.actions.push({
                action: action,
                label: getActionLabel(action),
                count: session.counts[action] || 1,
                points: session.points[action]
            });
            summary.totalPoints += session.points[action];
        }
    }
    
    // Sort by points descending
    summary.actions.sort(function(a, b) {
        return b.points - a.points;
    });
    
    return summary;
}

// Commit session points to the ledger (called at logoff)
// This is the single write to persistent storage - append-only ledger entry
function commitSession() {
    var session = getSession();
    
    // Prevent double-commit
    if (session.committed) {
        log(LOG_DEBUG, 'points.js: Session already committed');
        return getSessionSummary();
    }
    
    var userNum = user.number;
    var ledger = loadLedger(userNum);
    var summary = getSessionSummary();
    
    // Only write to ledger if there are points to record
    if (summary.totalPoints > 0) {
        // Append single ledger entry: {timestamp, delta, source}
        ledger.entries.push({
            timestamp: new Date().toISOString(),
            delta: summary.totalPoints,
            source: SOURCE
        });
    }
    
    // Update streak tracking
    var today = new Date().toDateString();
    var lastLoginDate = ledger.lastLogin ? new Date(ledger.lastLogin).toDateString() : null;
    
    if (lastLoginDate && lastLoginDate !== today) {
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastLoginDate === yesterday.toDateString()) {
            ledger.consecutiveDays = (ledger.consecutiveDays || 0) + 1;
        } else {
            ledger.consecutiveDays = 1;
        }
    } else if (!lastLoginDate) {
        ledger.consecutiveDays = 1;
    }
    ledger.lastLogin = new Date().toISOString();
    
    saveLedger(userNum, ledger);
    
    // Mark session as committed
    session.committed = true;
    
    log(LOG_INFO, 'points.js: Committed ' + summary.totalPoints + ' points to ledger for user ' + user.alias);
    
    return summary;
}

// Get user's balance by reducing the ledger
function getBalance(userNum) {
    userNum = userNum || user.number;
    var ledger = loadLedger(userNum);
    
    // Sum all deltas to get current balance
    var balance = 0;
    var lifetime = 0;
    for (var i = 0; i < ledger.entries.length; i++) {
        var delta = ledger.entries[i].delta;
        balance += delta;
        if (delta > 0) lifetime += delta;
    }
    
    return {
        balance: balance,           // Current spendable balance (sum of all deltas)
        lifetime: lifetime,         // Total ever earned (sum of positive deltas)
        consecutiveDays: ledger.consecutiveDays || 0,
        entryCount: ledger.entries.length
    };
}

// Check and award first login of day bonus
function checkDailyLogin() {
    var ledger = loadLedger(user.number);
    var today = new Date().toDateString();
    var lastLoginDate = ledger.lastLogin ? new Date(ledger.lastLogin).toDateString() : null;
    
    if (lastLoginDate !== today) {
        award('firstLoginOfDay');
        
        // Check consecutive days
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (lastLoginDate === yesterday.toDateString()) {
            var streak = (ledger.consecutiveDays || 0) + 1;
            if (streak >= 2) {
                award('consecutiveLoginDays', { count: Math.min(streak, 7) });
            }
        }
    }
}

// Debit points from ledger (for token withdrawal)
// Returns true if successful, false if insufficient balance
function debit(amount, source) {
    if (amount <= 0) return false;
    
    var userNum = user.number;
    var ledger = loadLedger(userNum);
    
    // Calculate current balance
    var balance = 0;
    for (var i = 0; i < ledger.entries.length; i++) {
        balance += ledger.entries[i].delta;
    }
    
    if (balance < amount) {
        log(LOG_WARNING, 'points.js: Insufficient balance for debit: ' + balance + ' < ' + amount);
        return false;
    }
    
    // Append negative delta entry
    ledger.entries.push({
        timestamp: new Date().toISOString(),
        delta: -amount,
        source: source || SOURCE
    });
    
    saveLedger(userNum, ledger);
    log(LOG_INFO, 'points.js: Debited ' + amount + ' points from user ' + user.alias + ' for ' + (source || SOURCE));
    
    return true;
}

// Get raw ledger entries (for blockchain sync, auditing)
function getLedger(userNum) {
    userNum = userNum || user.number;
    return loadLedger(userNum);
}

// Export public API
({
    award: award,
    getSessionSummary: getSessionSummary,
    commitSession: commitSession,
    getBalance: getBalance,
    checkDailyLogin: checkDailyLogin,
    debit: debit,
    getLedger: getLedger,
    getActionLabel: getActionLabel,
    config: config,
    SOURCE: SOURCE
});
