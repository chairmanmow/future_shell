"use strict";

/*
 * Launch Queue - lightweight inter-node notification channel.
 * Stores recent external launch events in JSONdb so each shell instance
 * can emit toast notifications without relying on telegram/node messages.
 */

if (typeof JSONdb === 'undefined') {
    try { load('json-db.js'); } catch (e) { log('launch_queue: unable to load json-db.js (' + e + ')'); }
}
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

(function (global) {
    var LaunchQueue = {};

    var baseDir = system && system.mods_dir ? system.mods_dir : (js && js.exec_dir ? js.exec_dir : '.');
    if (baseDir.slice(-1) !== '/' && baseDir.slice(-1) !== '\\') baseDir += '/';
    var shellDir = baseDir + 'future_shell/';
    var dataDir = shellDir + 'data/';
    var queueFile = dataDir + 'launch_queue.json';

    function ensureDir(path) {
        if (file_isdir(path)) return;
        try { mkdir(path); } catch (e) { }
    }

    ensureDir(shellDir);
    ensureDir(dataDir);

    var db = null;
    if (typeof JSONdb === 'function') {
        try {
            db = new JSONdb(queueFile, 'ICSH_LAUNCH_QUEUE');
            db.settings.KEEP_READABLE = true;
        } catch (e) {
            try { log('launch_queue: JSONdb init failed (' + e + ')'); } catch (_) { }
            db = null;
        }
    }

    function loadLatest() {
        if (!db) return;
        try { db.load(); } catch (e) { try { log('launch_queue: load failed (' + e + ')'); } catch (_) { } }
    }

    function ensureRoot() {
        if (!db) return null;
        if (!db.masterData || typeof db.masterData !== 'object') db.masterData = { data: {} };
        if (!db.masterData.data || typeof db.masterData.data !== 'object') db.masterData.data = {};
        var root = db.masterData.data;
        if (!Array.isArray(root.events)) root.events = [];
        if (typeof root.lastId !== 'number') root.lastId = 0;
        return root;
    }

    var MAX_EVENTS = 200;
    var MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes

    LaunchQueue.record = function (info) {
        if (!db) return null;
        var root = ensureRoot();
        if (!root) return null;
        root.lastId += 1;
        var evt = {
            id: root.lastId,
            timestamp: (info && typeof info.timestamp === 'number') ? info.timestamp : Date.now(),
            node: (info && typeof info.node === 'number') ? info.node : null,
            userAlias: info && info.userAlias ? String(info.userAlias) : null,
            userNumber: (info && typeof info.userNumber === 'number') ? info.userNumber : null,
            programId: info && info.programId ? String(info.programId) : null,
            label: info && info.label ? String(info.label) : null,
            icon: info && info.icon ? String(info.icon) : null
        };
        root.events.push(evt);
        if (root.events.length > MAX_EVENTS) root.events = root.events.slice(-MAX_EVENTS);
        var cutoff = Date.now() - MAX_EVENT_AGE_MS;
        root.events = root.events.filter(function (e) {
            return typeof e === 'object' && e && typeof e.timestamp === 'number' ? (e.timestamp >= cutoff) : true;
        });
        try { db.save(); } catch (saveErr) { log('launch_queue: save failed (' + saveErr + ')'); }
        return evt;
    };

    LaunchQueue.listSince = function (lastId) {
        if (!db) return [];
        loadLatest();
        var root = ensureRoot();
        if (!root) return [];
        var threshold = (typeof lastId === 'number' && lastId >= 0) ? lastId : 0;
        return root.events.filter(function (evt) {
            return evt && typeof evt.id === 'number' && evt.id > threshold;
        }).sort(function (a, b) {
            return a.id - b.id;
        });
    };

    LaunchQueue.latestId = function () {
        if (!db) return 0;
        loadLatest();
        var root = ensureRoot();
        if (!root) return 0;
        return root.lastId || 0;
    };

    LaunchQueue.trim = function () {
        if (!db) return;
        var root = ensureRoot();
        if (!root) return;
        var cutoff = Date.now() - MAX_EVENT_AGE_MS;
        root.events = root.events.filter(function (evt) {
            return evt && typeof evt.timestamp === 'number' && evt.timestamp >= cutoff;
        });
        if (root.events.length > MAX_EVENTS) root.events = root.events.slice(-MAX_EVENTS);
        try { db.save(); } catch (_) { }
    };

    if (typeof registerModuleExports === 'function') {
        registerModuleExports({ LaunchQueue: LaunchQueue });
    } else {
        if (global) global.LaunchQueue = LaunchQueue;
    }
    return LaunchQueue;
})(this);
