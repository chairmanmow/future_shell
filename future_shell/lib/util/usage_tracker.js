"use strict";

/*
 * External Program Usage Tracker
 * ------------------------------
 * Stores aggregated per-month usage statistics for external programs using
 * Synchronet's json-db.js helper. Data lives under mods/iconshell/data/.
 */

if (typeof JSONdb === 'undefined') {
    try {
        load('json-db.js');
    } catch (e) {
        log(LOG_ERROR, 'usage_tracker: unable to load json-db.js (' + e + ')');
    }
}

(function (global) {
    var UsageTracker = {};

    var baseDir = system.mods_dir;
    if (baseDir && baseDir.slice(-1) !== '/' && baseDir.slice(-1) !== '\\') baseDir += '/';
    baseDir += 'future_shell/';
    var dataDir = baseDir + 'data/';
    var usageFile = dataDir + 'external_usage.json';

    function ensureDir(path) {
        if (file_isdir(path)) return;
        try { mkdir(path); } catch (e) { }
    }

    ensureDir(baseDir);
    ensureDir(dataDir);

    var db = null;
    if (typeof JSONdb === 'function') {
        try {
            db = new JSONdb(usageFile, 'ICSH_USAGE');
            db.settings.KEEP_READABLE = true;
        } catch (e) {
            log(LOG_ERROR, 'usage_tracker: unable to init JSONdb (' + e + ')');
            db = null;
        }
    }

    function getMonthKey(ts) {
        var date = new Date(ts);
        var month = date.getMonth() + 1;
        var year = date.getFullYear();
        return year + '-' + (month < 10 ? '0' + month : '' + month);
    }

    function sanitizeProgramId(id) {
        if (!id) return 'unknown';
        return String(id).replace(/\s+/g, '_');
    }

    UsageTracker.record = function (info) {
        if (!db || !info) return;

        var nowTs = info.timestamp || Date.now();
        var monthKey = getMonthKey(nowTs);
        var programId = sanitizeProgramId(info.programId);
        var elapsed = Math.max(0, Math.round(Number(info.elapsedSeconds) || 0));
        var userAlias = info.userAlias ? String(info.userAlias) : null;
        var userNumber = (typeof info.userNumber === 'number') ? info.userNumber : null;
        var usersKey = userAlias || (userNumber != null ? '#' + userNumber : null);

        // DEFENSIVE: Reload data from disk before modifying to ensure we have latest state
        // This prevents data loss if multiple processes are writing or if the in-memory
        // state has become stale
        try {
            if (typeof db.load === 'function') {
                db.load();
            }
        } catch (e) {
            log(LOG_WARNING, 'usage_tracker: reload failed (' + e + '), continuing with cached data');
        }

        var root = db.masterData.data || {};
        var month = root[monthKey];
        if (!month) {
            month = {
                totals: { count: 0, seconds: 0 },
                programs: {}
            };
        }

        if (!month.totals) month.totals = { count: 0, seconds: 0 };
        month.totals.count = (month.totals.count || 0) + 1;
        month.totals.seconds = (month.totals.seconds || 0) + elapsed;

        if (!month.programs) month.programs = {};
        var prog = month.programs[programId] || { count: 0, seconds: 0 };
        prog.count += 1;
        prog.seconds += elapsed;
        prog.lastTimestamp = nowTs;
        month.programs[programId] = prog;

        if (usersKey) {
            if (!month.users) month.users = {};
            var userStats = month.users[usersKey] || { count: 0, seconds: 0, programs: {} };
            userStats.count += 1;
            userStats.seconds += elapsed;
            if (info.userAlias) userStats.alias = info.userAlias;
            if (typeof info.userNumber === 'number') userStats.number = info.userNumber;
            var uProg = userStats.programs[programId] || { count: 0, seconds: 0 };
            uProg.count += 1;
            uProg.seconds += elapsed;
            uProg.lastTimestamp = nowTs;
            userStats.programs[programId] = uProg;
            userStats.lastTimestamp = nowTs;
            month.users[usersKey] = userStats;
        }

        month.lastTimestamp = nowTs;
        root[monthKey] = month;
        db.masterData.data = root;
        try {
            db.save();
            log(LOG_DEBUG, 'usage_tracker: recorded usage for ' + (usersKey || 'unknown') + ':' + programId + ' (' + elapsed + 's)');
        } catch (e) {
            log(LOG_ERROR, 'usage_tracker: save failed (' + e + ') - data loss may have occurred!');
        }
    };

    if (global) global.UsageTracker = UsageTracker;
    return UsageTracker;

})(this);
