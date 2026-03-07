"use strict";

load('sbbsdefs.js');
load('funclib.js');
load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/util/layout/button.js');
load('future_shell/lib/util/layout/modal.js');
load('frame.js');
load('scrollbar.js');
load('future_shell/lib/effects/frame-ext.js');
load('future_shell/lib/mrc/session.js');
load('future_shell/lib/mrc/factory.js');

if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

if (typeof KEY_F1 === 'undefined') var KEY_F1 = 0x3B00;

var MRC_MAX_MESSAGE_LENGTH = 140;
var MRC_PIPE_COLOURS = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15];

var DEFAULT_MRC_SETTINGS = {
    root: { server: 'localhost', port: 5000 },
    startup: { room: 'futureland', motd: true, splash: true },
    aliases: {},
    client: {},
    show_nicks: {},
    msg_color: {},
    twit_list: {},
    chat_sounds: {},
    toast: {}
};

function resolveMrcPath(rel) {
    if (!resolveMrcPath.base) {
        var candidates = [];
        var modsDir = null;
        try {
            if (typeof system !== 'undefined' && system && system.mods_dir) modsDir = system.mods_dir;
        } catch (_) { }
        if (modsDir) {
            candidates.push(backslash(modsDir) + 'future_shell/lib/3rdp/mrc/');
        }
        candidates.push(backslash(system.exec_dir || '.') + '../xtrn/mrc/');
        for (var i = 0; i < candidates.length; i++) {
            var dir = candidates[i];
            var probe = new File(dir + 'mrc-session.js');
            if (probe.exists) {
                resolveMrcPath.base = dir;
                break;
            }
        }
        if (!resolveMrcPath.base) resolveMrcPath.base = candidates[0];
    }
    if (!rel) return resolveMrcPath.base;
    return resolveMrcPath.base + rel;
}

function stripSyncColors(text) {
    if (!text) return '';
    var out = String(text);
    out = out.replace(/\|[0-9]{2}/g, '');
    out = out.replace(/\x01./g, '');
    return out;
}

function ctrlA(text) {
    if (!text) return '';
    if (typeof pipeToCtrlA === 'function') return pipeToCtrlA(text);
    return text;
}

// URL detection regex — matches http/https URLs in plain text
var _urlPattern = /https?:\/\/[^\s<>"'\x01|]+/gi;

function findUrls(plainText) {
    if (!plainText || typeof plainText !== 'string') return [];
    var results = [];
    var m;
    _urlPattern.lastIndex = 0;
    while ((m = _urlPattern.exec(plainText)) !== null) {
        var url = m[0];
        // Strip trailing punctuation that's likely not part of the URL
        url = url.replace(/[).,;:!?]+$/, '');
        results.push({ url: url, index: m.index, length: url.length });
    }
    return results;
}

function nowTimestamp() {
    var d = new Date();
    return format('%02d:%02d:%02d', d.getHours(), d.getMinutes(), d.getSeconds());
}

function saveIniSetting(section, key, value, settingsCache) {
    var path = resolveMrcPath('mrc-client.ini');
    var file = new File(path);
    if (!file.open(file_exists(path) ? 'r+' : 'w+')) return false;
    try {
        file.iniSetValue(section, key, value);
        if (settingsCache) {
            if (!settingsCache[section]) settingsCache[section] = {};
            settingsCache[section][key] = value;
        }
    } finally {
        file.close();
    }
    return true;
}

function ensureAlias(settings) {
    var alias = settings.aliases[user.alias];
    if (alias) return alias;
    var prefix = format('|03%s', '<');
    var suffix = format('|03%s', '>');
    var color = MRC_PIPE_COLOURS[Math.floor(Math.random() * MRC_PIPE_COLOURS.length)];
    alias = prefix + format('|%02d%s', color, user.alias.replace(/\s/g, '_')) + suffix;
    saveIniSetting('aliases', user.alias, alias, settings);
    return alias;
}

function readMrcSettings() {
    var result = JSON.parse(JSON.stringify(DEFAULT_MRC_SETTINGS));
    var path = resolveMrcPath('mrc-client.ini');
    var f = new File(path);
    if (!f.open('r')) return result;
    try {
        result.root = f.iniGetObject() || result.root;
        result.startup = f.iniGetObject('startup') || result.startup;
        result.aliases = f.iniGetObject('aliases') || result.aliases;
        result.client = f.iniGetObject('client') || result.client;
        result.show_nicks = f.iniGetObject('show_nicks') || result.show_nicks;
        result.msg_color = f.iniGetObject('msg_color') || result.msg_color;
        result.twit_list = f.iniGetObject('twit_list') || result.twit_list;
        result.chat_sounds = f.iniGetObject('chat_sounds') || result.chat_sounds;
        result.toast = f.iniGetObject('toast') || result.toast;
    } finally {
        f.close();
    }
    return result;
}

function truncateLines(lines, max) {
    if (lines.length <= max) return lines;
    return lines.slice(lines.length - max);
}

function convertStatus(stats, latency) {
    var parts = [];
    if (latency !== undefined && latency !== null && latency !== '-' && latency !== '') {
        parts.push('Latency ' + latency + 'ms');
    }
    if (Array.isArray(stats) && stats.length >= 3) {
        parts.push('BBS ' + stats[0]);
        parts.push('Rooms ' + stats[1]);
        parts.push('Users ' + stats[2]);
    }
    return parts.join('  ');
}

function normalizeServer(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    return value;
}

// DEPRECATED: Global singleton removed to prevent cross-user state bleed.
// Each shell instance now gets its own MRCService via ensureMrcService().
var _sharedMrcService = null;

function ensureMrcService(opts) {
    opts = opts || {};
    // Always create per-shell instance to avoid cross-user contamination
    if (opts.shell) {
        if (!opts.shell.mrcService) {
            opts.shell.mrcService = new MRCService(opts);
            try { opts.shell.mrcService.setToastEnabled(true); } catch (_) { }
        }
        return opts.shell.mrcService;
    }
    // Fallback: create standalone instance (no sharing)
    // Note: This branch should rarely be hit; shells should always provide opts.shell
    var service = new MRCService(opts);
    try { service.setToastEnabled(true); } catch (_) { }
    return service;
}

function MRCService(opts) {
    opts = opts || {};
    this.shell = opts.shell || null;
    this.timer = opts.timer || null;
    this.settings = readMrcSettings();
    this.alias = ensureAlias(this.settings);
    this.serverHost = normalizeServer(this.settings.root.server, 'localhost');
    this.serverPort = parseInt(this.settings.root.port, 10) || 5000;
    this.toastEnabled = this._loadToastPreference(true);
    this.showNickList = this._loadNickPreference(true);
    this.msgColor = this._loadMsgColor(7);
    this.twitList = this._loadTwitList();
    this.listeners = [];
    this.messages = [];
    this.maxMessageLines = 400;
    this.nickColors = {};
    this.nickList = [];
    this.roomName = '';
    this.roomTopic = '';
    this.stats = ['-', '-', '-', '0'];
    this.latency = '-';
    this.connected = false;
    this._messageSeq = 0;
    this._typingHoldUntil = 0;
    this._toastHistory = [];
    this._toastHistoryMax = 40;
    this._timerEvent = null;
    this._ownTimer = null;
    this._lastMessageEpoch = Date.now();
    this._lastBacklogTs = this._lastMessageEpoch;
    this._externalSuspendInfo = null;
    this._backlogPath = null;

    this._initializeSession();
    this._scheduleCycle();
}

MRCService.prototype._loadToastPreference = function (fallback) {
    var val = this.settings.toast[user.alias];
    if (val === undefined) return fallback;
    return String(val).toLowerCase() !== 'false';
};

MRCService.prototype._loadNickPreference = function (fallback) {
    var val = this.settings.show_nicks[user.alias];
    if (val === undefined) return fallback;
    return String(val).toLowerCase() !== 'false';
};

MRCService.prototype._loadMsgColor = function (fallback) {
    var val = this.settings.msg_color[user.alias];
    if (val === undefined) return fallback;
    var parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 15) return fallback;
    return parsed;
};

MRCService.prototype._loadTwitList = function () {
    var raw = this.settings.twit_list[user.alias];
    if (!raw) return [];
    if (typeof raw !== 'string') raw = String(raw);
    return raw.split(ascii(126)).filter(function (item) {
        return item && item.trim().length;
    });
};

MRCService.prototype._resolveWrapColor = function (fromUser, rawBody) {
    var colorCode = null;
    if (typeof rawBody === 'string') {
        var matches = rawBody.match(/\|([0-9]{2})/g);
        if (matches && matches.length) {
            for (var m = matches.length - 1; m >= 0; m--) {
                var parsed = parseInt(matches[m].substr(1), 10);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 15) {
                    colorCode = parsed;
                    break;
                }
            }
        }
    }
    var isSelf = fromUser && typeof fromUser === 'string' && typeof user !== 'undefined' && user && user.alias && fromUser.toLowerCase() === user.alias.toLowerCase();
    if (colorCode === null && isSelf && typeof this.msgColor === 'number') colorCode = this.msgColor;
    if (colorCode === null && fromUser && this.nickColors && this.nickColors[fromUser] !== undefined) colorCode = this.nickColors[fromUser];
    if (colorCode === null) colorCode = (typeof this.msgColor === 'number') ? this.msgColor : 7;
    return (colorCode !== null) ? ctrlA(format('|%02d', colorCode)) : '';
};

MRCService.prototype._initializeSession = function () {
    if (this.session && typeof this.session.disconnect === 'function') {
        try { this.session.disconnect(); } catch (_) { }
    }
    var newSession = new MRC_Session(
        this.serverHost,
        this.serverPort,
        user.alias,
        user.security.password,
        this.alias
    );
    newSession.msg_color = this.msgColor;
    newSession.twit_list = this.twitList.slice();
    this.session = newSession;
    this._bindSessionEvents();
    try {
        newSession.connect();
        this.connected = true;
        this._sendStartupMetadata();
    } catch (err) {
        this.connected = false;
        this._handleServerText(this.colorize('STATE_ERROR', 'Unable to connect to MRC: ') + this.colorize('MESSAGE_ERROR', err));
    }
};

MRCService.prototype._scheduleCycle = function () {
    var self = this;
    if (this.timer && typeof this.timer.addEvent === 'function') {
        this._timerEvent = this.timer.addEvent(120, true, function () { self.cycle(); });
    } else {
        this._ownTimer = new Timer();
        this._timerEvent = this._ownTimer.addEvent(120, true, function () { self.cycle(); });
    }
};

MRCService.prototype._sendStartupMetadata = function () {
    var self = this;
    function safe(fn) { try { fn(); } catch (_) { } mswait(20); }
    safe(function () { self.session.send_notme('|07- |11' + user.alias + ' |03has arrived.'); });
    safe(function () { self.session.send_command('TERMSIZE:' + console.screen_columns + 'x' + console.screen_rows); });
    safe(function () { self.session.send_command('BBSMETA: SecLevel(' + user.security.level + ') SysOp(' + system.operator + ')'); });
    safe(function () { self.session.send_command('USERIP:' + (bbs.atcode('IP') === '127.0.0.1' ? client.ip_address : bbs.atcode('IP'))); });
    var targetRoom = this.settings.startup.room || 'futureland';
    safe(function () { self.session.join(targetRoom); });
    if (this.settings.startup.motd) {
        safe(function () { self.session.motd(''); });
    }
};

MRCService.prototype._bindSessionEvents = function () {
    var self = this;
    this.session.on('message', function (msg) { self._handleIncoming(msg); });
    this.session.on('banner', function (msg) { self._handleServerText(msg); });
    this.session.on('nicks', function (room, nicks) { self._updateNickList(room, nicks); });
    this.session.on('topic', function (room, topic) { self._updateTopic(room, topic); });
    this.session.on('stats', function () { self._broadcastStats(); });
    this.session.on('latency', function () { self._broadcastLatency(); });
    this.session.on('sent_privmsg', function (target, body) { self._handlePrivateEcho(target, body); });
    this.session.on('ctcp-msg', function (msg) { self._handleServerText(msg); });
    this.session.on('disconnect', function () { self._handleDisconnect(); });
    this.session.on('error', function (err) { self._handleServerText(self.colorize('MESSAGE_ERROR', String(err || 'Unknown error'))); });
};

MRCService.prototype._handlePrivateEcho = function (target, msg) {
    var epoch = Date.now();
    var _pmPlain = stripSyncColors(msg);
    var _pmUrls = findUrls(_pmPlain);
    var display = format('\x01n\x01h[%s]\x01n \x01c%s\x01n -> \x01c%s\x01n %s', nowTimestamp(), user.alias, target, ctrlA(msg));
    this._pushMessage({
        id: ++this._messageSeq,
        from: user.alias,
        to: target,
        timestamp: new Date(epoch),
        epoch: epoch,
        mention: false,
        system: false,
        body: ctrlA(msg),
        plain: _pmPlain,
        urls: _pmUrls,
        display: display,
        wrapColor: this._resolveWrapColor(user.alias, msg)
    });
};

MRCService.prototype._handleDisconnect = function () {
    this.connected = false;
    this._handleServerText(this.colorize('STATE_DISCONNECTED', 'Disconnected from MRC.'));
    this._notify('onServiceDisconnect', {});
};

MRCService.prototype._handleIncoming = function (msg, opts) {
    opts = opts || {};
    if (!msg || typeof msg !== 'object') return;
    if (msg.from_user === 'SERVER') {
        if (typeof msg.ts === 'number') opts.ts = msg.ts;
        if (msg.backlog === true && opts.backlog === undefined) opts.backlog = true;
        this._handleServerText(msg.body || '', opts);
        return;
    }
    if (this.twitList.length && msg.from_user && this.twitList.indexOf(String(msg.from_user).toLowerCase()) >= 0) {
        return;
    }
    var plain = stripSyncColors(msg.body || '');
    var mention = false;
    if (plain && user.alias && msg.from_user && msg.from_user.toLowerCase() !== user.alias.toLowerCase()) {
        mention = plain.toLowerCase().indexOf(user.alias.toLowerCase()) >= 0;
    }
    // Normalize room comparison: strip leading #, trim, lowercase
    var normRoom = function(s) { return String(s || '').replace(/^#/, '').trim().toLowerCase(); };
    if (msg.to_room && msg.to_room !== '' && this.session.room && normRoom(msg.to_room) !== normRoom(this.session.room)) {
        return;
    }
    var epoch = (typeof msg.ts === 'number') ? msg.ts : Date.now();
    // Note: msg.body already contains the formatted alias as first word (e.g., "|03<|05User|03> message")
    // So we just display the body directly, not prepending from_user again
    var display = format('\x01n\x01h[%s]\x01n %s%s',
        nowTimestamp(),
        mention ? '\x01h\x01r! ' : '',
        ctrlA(msg.body || '')
    );
    var _inUrls = findUrls(plain);
    var payload = {
        id: ++this._messageSeq,
        from: msg.from_user || 'System',
        to: msg.to_user || '',
        timestamp: new Date(epoch),
        epoch: epoch,
        mention: mention,
        system: false,
        body: ctrlA(msg.body || ''),
        plain: plain,
        urls: _inUrls,
        display: display,
        wrapColor: this._resolveWrapColor(msg.from_user, msg.body),
        backlog: opts.backlog === true
    };
    if (mention) this.session.mention_count = (this.session.mention_count || 0) + 1;
    this._pushMessage(payload);
    if (!payload.backlog) this._showToastForMessage(payload);

    // if (this.toastEnabled && this.shell && msg.from_user && msg.from_user.toLowerCase() !== user.alias.toLowerCase()) {
    //     this._showToastForMessage(payload);
    // }
};

MRCService.prototype._handleServerText = function (text, opts) {
    opts = opts || {};
    if (!text) return;
    var epoch = (typeof opts.ts === 'number') ? opts.ts : Date.now();
    var _srvPlain = stripSyncColors(text);
    var _srvUrls = findUrls(_srvPlain);
    var display = format('\x01n\x01h[%s]\x01n \x01c%s\x01n %s', nowTimestamp(), 'System', ctrlA(text));
    this._pushMessage({
        id: ++this._messageSeq,
        from: 'System',
        to: '',
        timestamp: new Date(epoch),
        epoch: epoch,
        mention: false,
        system: true,
        body: ctrlA(text),
        plain: _srvPlain,
        urls: _srvUrls,
        display: display,
        wrapColor: '',
        backlog: opts.backlog === true,
        presence: opts.presence === true
    });
};

MRCService.prototype._pushMessage = function (payload) {
    if (typeof payload.epoch !== 'number') payload.epoch = Date.now();
    this.messages.push(payload);
    this.messages = truncateLines(this.messages, this.maxMessageLines);
    this._lastMessageEpoch = Math.max(this._lastMessageEpoch || 0, payload.epoch);
    this._lastBacklogTs = this._lastMessageEpoch;
    this._notify('onServiceMessage', payload);
};

MRCService.prototype._resolveBacklogPath = function () {
    if (this._backlogPath) return this._backlogPath;
    var baseDir = '';
    try {
        if (system && system.mods_dir) baseDir = system.mods_dir;
    } catch (_) { }
    if (!baseDir || !baseDir.length) {
        baseDir = 'mods/';
    }
    if (baseDir.slice(-1) !== '/' && baseDir.slice(-1) !== '\\') baseDir += '/';
    baseDir += 'future_shell/';
    if (baseDir.slice(-1) !== '/' && baseDir.slice(-1) !== '\\') baseDir += '/';
    this._backlogPath = baseDir + 'data/mrc_backlog.json';
    return this._backlogPath;
};

MRCService.prototype._readBacklogRooms = function () {
    var path = this._resolveBacklogPath();
    if (!path) return null;
    var f = new File(path);
    if (!f.exists) return null;
    if (!f.open('r')) return null;
    var raw = '';
    try {
        raw = f.read(f.length);
        if (typeof raw !== 'string') raw = String(raw || '');
    } catch (_) {
        try {
            raw = f.read();
        } catch (__) {
            raw = '';
        }
    } finally {
        f.close();
    }
    if (!raw || !raw.length) return null;
    try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.rooms && typeof parsed.rooms === 'object') {
            return parsed.rooms;
        }
    } catch (_) { }
    return null;
};

MRCService.prototype._fetchBacklogSince = function (sinceTs, roomOverride) {
    var rooms = this._readBacklogRooms();
    if (!rooms) return 0;
    var key = '';
    if (typeof roomOverride === 'string' && roomOverride.length) {
        key = roomOverride.toLowerCase();
    } else if (this.session && typeof this.session.room === 'string' && this.session.room.length) {
        key = this.session.room.toLowerCase();
    } else {
        key = '__global__';
    }
    var list = rooms[key] || [];
    if (!list.length) return 0;
    var updates = [];
    for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        if (!entry || typeof entry.ts !== 'number') continue;
        if (entry.ts <= sinceTs) continue;
        updates.push({
            from_user: entry.from_user,
            to_user: entry.to_user,
            to_room: entry.to_room,
            from_room: entry.from_room,
            body: entry.body,
            ts: entry.ts
        });
    }
    if (!updates.length) return 0;
    updates.sort(function (a, b) { return a.ts - b.ts; });
    for (var u = 0; u < updates.length; u++) {
        this._handleIncoming(updates[u], { backlog: true });
    }
    return updates.length;
};

MRCService.prototype._formatProgramName = function (programId) {
    if (!programId || !programId.length) return 'an external program';
    return String(programId).replace(/^exec_xtrn:/i, '').replace(/[_]+/g, ' ');
};

MRCService.prototype._sendPresenceNotice = function (event, programId, missedCount) {
    if (!this.session || !this.connected) return;
    var verb = (event === 'returned') ? 'returned from' : 'left to run';
    var programName = this._formatProgramName(programId);
    var suffix = '.';
    if (event === 'returned' && typeof missedCount === 'number' && missedCount > 0) {
        suffix = format(' (cached %d message%s).', missedCount, (missedCount === 1) ? '' : 's');
    }
    var brackets = '';
    if (event === 'returned') {
        brackets = '|10[RETURNED FROM APP]|07 ';
    } else {
        brackets = '|12[LAUNCHED APP]|07 ';
    }
    var remote = format(brackets + '%s %s |15%s|07%s',
        user.alias,
        verb,
        programName,
        suffix
    );
    var broadcastOk = false;
    try {
        if (typeof this.session.send_room_message === 'function') {
            this.session.send_room_message(remote);
            broadcastOk = true;
        } else {
            this.session.send_notme(remote);
            broadcastOk = true;
        }
        this.flush();
    } catch (_) { }
    if (!broadcastOk) {
        var local;
        if (event === 'returned') {
            if (typeof missedCount === 'number' && missedCount > 0) {
                local = format('Returned from %s with %d message%s cached.', programName, missedCount, (missedCount === 1) ? '' : 's');
            } else {
                local = format('Returned from %s.', programName);
            }
        } else {
            local = format('Left to run %s.', programName);
        }
        if (local && local.trim().length) {
            this._handleServerText(local, { backlog: true, presence: true });
        }
    }
};

MRCService.prototype.handleExternalSuspend = function (info) {
    var programId = (info && info.programId) || '';
    this._externalSuspendInfo = {
        programId: programId,
        lastSeenTs: this._lastMessageEpoch || Date.now(),
        room: (this.session && typeof this.session.room === 'string') ? this.session.room : ''
    };
    if (this.connected) {
        this._sendPresenceNotice('left', programId, 0);
    }
};

MRCService.prototype.handleExternalResume = function (info) {
    var suspendInfo = this._externalSuspendInfo || {};
    var programId = (info && info.programId) || suspendInfo.programId || '';
    var sinceTs = suspendInfo.lastSeenTs || this._lastMessageEpoch || 0;
    var roomKey = (info && info.room) || suspendInfo.room || this.roomName || '';
    var fetched = 0;
    if (!this.connected) {
        this._initializeSession();
    }
    if (this.connected) {
        if (roomKey || this.roomName) {
            var targetRoom = roomKey || this.roomName;
            this.ensureActiveRoom(targetRoom);
            roomKey = this.roomName || targetRoom || roomKey;
        }
        fetched = this._fetchBacklogSince(sinceTs, roomKey);
        this._sendPresenceNotice('returned', programId, fetched);
    }
    this._externalSuspendInfo = null;
};

MRCService.prototype.ensureActiveRoom = function (roomHint) {
    if (!this.connected || !this.session || typeof this.session.join !== 'function') return false;
    var fallbackRoom = '';
    if (this.settings && this.settings.startup && this.settings.startup.room) fallbackRoom = this.settings.startup.room;
    var target = roomHint || this.roomName || fallbackRoom || '';
    if (!target) return false;
    var cleanTarget = String(target).replace(/^#/, '').trim();
    if (!cleanTarget.length) return false;
    var current = '';
    if (typeof this.session.room === 'string') current = this.session.room.replace(/^#/, '').trim().toLowerCase();
    var desired = cleanTarget.toLowerCase();
    if (!current || current !== desired) {
        try {
            this.session.join(cleanTarget);
            this.flush();
        } catch (joinErr) {
            try { this._handleServerText(this.colorize('STATE_ERROR', 'Attempt to join ') + this.colorize('HEADER_ROOM', '#' + cleanTarget) + this.colorize('STATE_ERROR', ' failed: ') + this.colorize('MESSAGE_ERROR', joinErr)); } catch (_) { }
            return false;
        }
    }
    if (!this.roomName || this.roomName.toLowerCase() !== desired) {
        this.roomName = cleanTarget;
        this._notify('onServiceTopic', { room: this.roomName, topic: this.roomTopic });
    }
    return true;
};

MRCService.prototype._updateNickList = function (room, nicks) {
    var sessionRoom = (this.session && typeof this.session.room === 'string') ? this.session.room : '';
    var incomingRoom = (typeof room === 'string') ? room : '';

    // Strict room matching: only update if incoming room matches our session room
    // Reject if: (1) both specified and different, OR (2) incoming specified but we have no room
    if (incomingRoom) {
        if (!sessionRoom) return; // Incoming room specified but we're not in any room
        if (incomingRoom.toLowerCase() !== sessionRoom.toLowerCase()) return; // Different rooms
    }

    var list = Array.isArray(nicks) ? nicks.slice() : [];
    var self = this;
    this.nickList = list.slice();
    this.nickColors = {};
    this.nickList.forEach(function (nick, idx) {
        self.nickColors[nick] = MRC_PIPE_COLOURS[idx % MRC_PIPE_COLOURS.length];
    });
    this._notify('onServiceNickList', this.nickList.slice());
};

MRCService.prototype._updateTopic = function (room, topic) {
    var sessionRoom = (this.session && typeof this.session.room === 'string') ? this.session.room : '';
    var incomingRoom = (typeof room === 'string') ? room : '';

    // Strict room matching: only update if incoming room matches our session room
    if (incomingRoom) {
        if (!sessionRoom) return; // Incoming room specified but we're not in any room
        if (incomingRoom.toLowerCase() !== sessionRoom.toLowerCase()) return; // Different rooms
    }

    this.roomName = sessionRoom || this.roomName || '';
    this.roomTopic = topic || '';
    this._notify('onServiceTopic', { room: this.roomName, topic: this.roomTopic });
};

MRCService.prototype._broadcastStats = function () {
    this.stats = this.session.stats ? this.session.stats.slice() : this.stats;
    this._notify('onServiceStats', this.stats.slice());
};

MRCService.prototype._broadcastLatency = function () {
    this.latency = this.session.latency || this.latency;
    this._notify('onServiceLatency', this.latency);
};

MRCService.prototype._notify = function (fnName, payload) {
    for (var i = 0; i < this.listeners.length; i++) {
        var listener = this.listeners[i];
        if (!listener) continue;
        if (typeof listener[fnName] === 'function') {
            try { listener[fnName](payload); } catch (_) { }
        }
    }
};

MRCService.prototype._showToastForMessage = function (payload) {
    if (!this.shell || typeof this.shell.showToast !== 'function') return;
    if (this.shell.activeSubprogram && this.shell.activeSubprogram.name === 'mrc') return;
    if (!payload || payload.backlog) return;
    if (payload.presence) return;
    if (payload.plain && payload.plain.indexOf('[FSXTRN]') !== -1) return;
    var signature = payload.from + ':' + payload.plain;
    if (this._toastHistory.indexOf(signature) >= 0) return;
    if (this._toastHistory.length >= this._toastHistoryMax) this._toastHistory.shift();
    this._toastHistory.push(signature);
    var self = this;
    
    // Get themed colors for MRC toast
    var toastColors = this._getToastColors();
    
    this.shell.showToast({
        title: payload.from || 'MRC',
        message: (payload.from || 'MRC') + ': ' + (payload.plain || '').substr(0, 120),
        launch: 'mrc',
        category: 'mrc',
        sender: payload.from || 'mrc',
        programIcon: 'mrc',
        colors: toastColors
    });
};

/**
 * Get toast colors from theme configuration
 * Falls back to sensible defaults if theme not available
 */
MRCService.prototype._getToastColors = function () {
    var BG = (typeof BG_BLACK !== 'undefined') ? BG_BLACK : 0;
    var defaultMsg = BG | ((typeof LIGHTCYAN !== 'undefined') ? LIGHTCYAN : 11);
    var defaultBorder = BG | ((typeof LIGHTMAGENTA !== 'undefined') ? LIGHTMAGENTA : 13);
    var defaultTitle = BG | ((typeof CYAN !== 'undefined') ? CYAN : 3);
    
    // Try to get colors from theme via shell.paletteAttr (if shell has it)
    if (this.shell && typeof this.shell.paletteAttr === 'function') {
        return {
            msg: this.shell.paletteAttr('mrc', 'TOAST_MSG', defaultMsg),
            border: this.shell.paletteAttr('mrc', 'TOAST_BORDER', defaultBorder),
            title: this.shell.paletteAttr('mrc', 'TOAST_TITLE', defaultTitle)
        };
    }
    
    // Try ThemeRegistry directly as fallback
    if (typeof ThemeRegistry !== 'undefined' && typeof ThemeRegistry.get === 'function') {
        var getAttr = function (key, fallback) {
            var entry = ThemeRegistry.get('mrc', key, null);
            if (!entry) return fallback;
            if (typeof entry === 'number') return entry;
            var bg = entry.BG || 0;
            var fg = entry.FG || entry.COLOR || 0;
            return bg | fg;
        };
        return {
            msg: getAttr('TOAST_MSG', defaultMsg),
            border: getAttr('TOAST_BORDER', defaultBorder),
            title: getAttr('TOAST_TITLE', defaultTitle)
        };
    }
    
    // Fall back to defaults
    return {
        msg: defaultMsg,
        border: defaultBorder,
        title: defaultTitle
    };
};

MRCService.prototype.addListener = function (listener) {
    if (this.listeners.indexOf(listener) === -1) this.listeners.push(listener);
    if (listener && typeof listener.onServiceSnapshot === 'function') {
        listener.onServiceSnapshot({
            messages: this.messages.slice(),
            nickList: this.nickList.slice(),
            room: this.roomName,
            topic: this.roomTopic,
            stats: this.stats.slice(),
            latency: this.latency,
            toastEnabled: this.toastEnabled,
            showNickList: this.showNickList
        });
    }
};

MRCService.prototype.removeListener = function (listener) {
    var idx = this.listeners.indexOf(listener);
    if (idx >= 0) this.listeners.splice(idx, 1);
};

MRCService.prototype.cycle = function () {
    if (!this.connected) return;
    // Always cycle the socket - do not block on typing hold
    // Typing hold was causing significant latency issues
    try { this.session.cycle(); } catch (_) { }
};

MRCService.prototype.pauseTypingFor = function (ms) {
    this._typingHoldUntil = Date.now() + (ms || 1000);
};

MRCService.prototype.flush = function () {
    try { this.session.cycle(); } catch (_) { }
};

MRCService.prototype.sendLine = function (line) {
    if (!line || !line.length) return;
    if (line.charAt(0) === '/') {
        this.executeCommand(line.substr(1));
    } else if (line.charAt(0) === '!') {
        // Server commands prefixed with ! (e.g., !info, !quote)
        // Send as raw command including the !
        this.session.send_command(line);
        this.flush();
    } else {
        this.session.send_room_message(line);
        this.flush();
    }
};

MRCService.prototype.executeCommand = function (cmdLine) {
    if (!cmdLine) return;
    var parts = cmdLine.split(' ');
    var command = parts.shift().toLowerCase();
    var rest = parts.join(' ');
    if (command === 'toggle_toast') {
        this.setToastEnabled(!this.toastEnabled);
        var status = this.toastEnabled ? 'enabled' : 'disabled';
        var statusColor = this.toastEnabled ? 'TOAST_ENABLED' : 'TOAST_DISABLED';
        this._handleServerText(this.colorize('MESSAGE_SYSTEM', 'Toast notifications ') + this.colorize(statusColor, status) + this.colorize('MESSAGE_SYSTEM', '.'));
        return;
    }
    if (command === 'toggle_nicks') {
        this.setNickListVisible(!this.showNickList);
        return;
    }
    var fn = this.session[command];
    if (typeof fn === 'function') {
        fn.call(this.session, rest);
        this.flush();
        return;
    }
    this.session.send_command(cmdLine);
};

MRCService.prototype.setToastEnabled = function (enabled) {
    this.toastEnabled = !!enabled;
    saveIniSetting('toast', user.alias, this.toastEnabled, this.settings);
    this._notify('onServicePreference', { key: 'toast', value: this.toastEnabled });
};

MRCService.prototype.setNickListVisible = function (show) {
    this.showNickList = !!show;
    saveIniSetting('show_nicks', user.alias, this.showNickList, this.settings);
    this._notify('onServicePreference', { key: 'showNickList', value: this.showNickList });
};

MRCService.prototype.rotateMsgColor = function (delta) {
    var next = this.session.msg_color + delta;
    if (next < 1) next = 15;
    if (next > 15) next = 1;
    this.session.msg_color = next;
    saveIniSetting('msg_color', user.alias, next, this.settings);
    this._handleServerText('Message colour changed to ' + next + '.');
};

MRCService.prototype.disconnect = function () {
    this.connected = false;
    try { this.session.disconnect(); } catch (_) { }
    if (this._timerEvent) this._timerEvent.abort = true;
    this._timerEvent = null;
    if (this._ownTimer) {
        try { this._ownTimer.dispose(); } catch (_) { }
        this._ownTimer = null;
    }
    this._handleServerText(this.colorize('STATE_DISCONNECTED', 'Disconnected.'));
};

function MRC(opts) {
    opts = opts || {};
    opts.name = 'mrc';
    Subprogram.call(this, opts);
    
    this._redrawThrottleMs = 200;
    this._lastRenderTs = 0;
    this._throttlePending = null;
    this._lastKeyTs = 0;
    if (typeof this.registerColors === 'function') {
        this.registerColors({
            // Frame backgrounds and structures
            CHAT_HEADER: { BG: BG_BLUE, FG: WHITE },
            CHAT_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_CONTROLS: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_INPUT: { BG: BG_BLUE, FG: WHITE },
            CHAT_ROSTER: { BG: BG_BLACK, FG: CYAN },

            // Buttons and interactive elements
            CHAT_BUTTON: { BG: BG_CYAN, FG: WHITE },
            CHAT_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },

            // Header content - room name, topic, etc.
            HEADER_TITLE: { BG: BG_BLUE, FG: WHITE },
            HEADER_ROOM: { BG: BG_BLUE, FG: YELLOW },
            HEADER_TOPIC: { BG: BG_BLUE, FG: LIGHTCYAN },

            // Footer status display
            STATUS_LATENCY: { BG: BG_BLUE, FG: LIGHTGREEN },
            STATUS_BBS_COUNT: { BG: BG_BLUE, FG: LIGHTCYAN },
            STATUS_ROOM_COUNT: { BG: BG_BLUE, FG: YELLOW },
            STATUS_USER_COUNT: { BG: BG_BLUE, FG: LIGHTMAGENTA },
            STATUS_FLAGS: { BG: BG_BLUE, FG: WHITE },

            // Input area
            INPUT_PROMPT: { BG: BG_BLUE, FG: LIGHTGREEN },
            INPUT_TEXT: { BG: BG_BLUE, FG: WHITE },

            // Message display
            MESSAGE_TEXT: { BG: BG_BLACK, FG: LIGHTGRAY },
            MESSAGE_TIMESTAMP: { BG: BG_BLACK, FG: DARKGRAY },
            MESSAGE_NICK: { BG: BG_BLACK, FG: CYAN },
            MESSAGE_MENTION: { BG: BG_BLACK, FG: YELLOW },
            MESSAGE_SYSTEM: { BG: BG_BLACK, FG: LIGHTGREEN },
            MESSAGE_ERROR: { BG: BG_BLACK, FG: LIGHTRED },

            // Nickname list
            NICK_NORMAL: { BG: BG_BLACK, FG: CYAN },
            NICK_SELF: { BG: BG_BLACK, FG: YELLOW },
            NICK_OPERATOR: { BG: BG_BLACK, FG: LIGHTGREEN },

            // Controls panel info
            CONTROLS_HELP: { BG: BG_BLACK, FG: LIGHTGRAY },
            CONTROLS_KEYHELP: { BG: BG_BLACK, FG: WHITE },

            // Connection states  
            STATE_CONNECTING: { BG: BG_BLACK, FG: YELLOW },
            STATE_CONNECTED: { BG: BG_BLACK, FG: LIGHTGREEN },
            STATE_DISCONNECTED: { BG: BG_BLACK, FG: LIGHTRED },
            STATE_ERROR: { BG: BG_BLACK, FG: RED },

            // Toast toggles and flags
            TOAST_ENABLED: { BG: BG_BLUE, FG: LIGHTGREEN },
            TOAST_DISABLED: { BG: BG_BLUE, FG: LIGHTRED },
            NICKS_SHOWN: { BG: BG_BLUE, FG: LIGHTGREEN },
            NICKS_HIDDEN: { BG: BG_BLUE, FG: LIGHTRED }
        }, 'mrc');
    }
    this.rendered = false;

    // Use factory to get persistent per-node controller
    this.controller = getMrcController();
    
    try { if (typeof dbug === 'function') dbug('[MRC] Got controller from factory, listeners count: ' + (this.controller.listeners ? this.controller.listeners.length : 'N/A'), 'mrc'); } catch (_) { }

    // Create adapter to bridge old service API to new controller API
    this.service = this._createServiceAdapter(this.controller);
    
    // Register as object listener to receive both snapshots and events
    // Note: We create a fresh proxy each time since MRC instances don't persist
    this._listenerProxy = this._createListenerProxy();
    this.controller.addListener(this._listenerProxy);
    
    try { if (typeof dbug === 'function') dbug('[MRC] Registered listener proxy with controller, new listeners count: ' + (this.controller.listeners ? this.controller.listeners.length : 'N/A'), 'mrc'); } catch (_) { }

    this.headerFrame = null;
    this.controlsFrame = null;
    this.buttonsFrame = null;
    this.messagesFrame = null;
    this.nickFrame = null;
    this.footerFrame = null;
    this.messageScroll = null;
    this.headerHeight = 1;
    this.footerHeight = 1; // Just the input prompt
    this.controlHeight = 4;
    this._messageLines = [];
    this._maxLines = 800;
    this._scrollOffset = 0;
    this._userScrolled = false;
    this._buttons = [];
    this._inputBuffer = '';
    this._inputCursor = 0;       // cursor position in input buffer
    this._inputScrollOffset = 0; // horizontal scroll for input display
    this._room = '';
    this._topic = '';
    this._stats = ['-', '-', '-', '0'];
    this._latency = '-';
    this._showNickList = this.service.showNickList;
    this._toastEnabled = this.service.toastEnabled;
    this._nickList = [];
    this._needsRedraw = true;
    this._exiting = false;
    this._buttonHotspots = [];
    this._hotspotHandlers = {};
    this._hotspotCounter = 0;
    this._hotspotBuffer = '';
    this._wrappedLineCache = null;
    this._wrappedLineCacheWidth = 0;
    this._lastRenderedMsgId = 0;
    this._lastContentHash = null;
    this._activeBannerModal = null;
    this._systemModal = null;
    this._systemModalLines = [];
    this._systemModalFrame = null;
    this._lastMessageCount = 0;
    
    // Force nick list off - will be integrated into header info instead
    this._showNickList = false;
}

if (typeof extend === 'function') extend(MRC, Subprogram);
else {
    MRC.prototype = Object.create(Subprogram.prototype);
    MRC.prototype.constructor = MRC;
}

/**
 * Create service adapter that wraps controller with old service API
 */
MRC.prototype._createServiceAdapter = function (controller) {
    var self = this;
    var snapshot = controller.getSnapshot();

    return {
        connected: snapshot.connection.connected,
        roomName: snapshot.room.name,
        messages: snapshot.messages,
        showNickList: snapshot.prefs.showNickList,
        toastEnabled: snapshot.prefs.toastEnabled,
        settings: { startup: { room: snapshot.room.name } },

        cycle: function () { controller.tick(); },
        flush: function () { controller.tick(); },

        disconnect: function () { controller.disconnect(); },

        executeCommand: function (cmd) {
            return controller.executeCommand(cmd);
        },

        sendLine: function (text) {
            if (!text || !text.trim().length) return;
            var trimmed = text.trim();
            if (trimmed[0] === '/') {
                controller.executeCommand(trimmed.slice(1));
            } else if (trimmed[0] === '!') {
                // Server commands prefixed with ! (e.g., !info, !quote)
                // Send as raw command including the !
                controller.executeCommand('quote ' + trimmed);
            } else {
                controller.sendMessage(text);
            }
        },

        rotateMsgColor: function (dir) {
            // Not implemented in new controller yet
        },

        pauseTypingFor: function (ms) {
            // Not implemented in new controller yet
        },

        setToastEnabled: function (enabled) {
            controller.toggleToast();
            this.toastEnabled = enabled;
        },

        setNickListVisible: function (visible) {
            controller.toggleNickList();
            this.showNickList = visible;
        },

        handleExternalSuspend: function (info) {
            return controller.handleExternalSuspend(info);
        },

        handleExternalResume: function (info) {
            return controller.handleExternalResume(info);
        },

        removeListener: function (listener) {
            controller.removeListener(listener._boundUpdate);
        }
    };
};

/**
 * Create listener proxy object for controller events
 */
MRC.prototype._createListenerProxy = function() {
    var self = this;
    return {
        onSnapshot: function(snapshot) {
            self._onControllerUpdate(snapshot);
        },
        onBanner: function(data) {
            // Pattern detection happens HERE in the view (which is recreated each time)
            // Controller just forwards all banners
            var text = (data && data.text) || '';
            
            // Strip pipe codes for pattern matching
            var cleanText = text.replace(/\|[0-9]{2}/g, '');
            
            // Match header pattern: underscores, dashes, or equals followed by /command
            var headerPattern = /[_=-]{10,}[^\/]*\/(\w+)/;
            var match = cleanText.match(headerPattern);
            
            if (match) {
                var command = match[1].toLowerCase();
                var bannerCommands = ['list', 'motd', 'help', 'whoon', 'info', 'users'];
                if (bannerCommands.indexOf(command) >= 0) {
                    // Show in modal
                    self._handleBannerModal({ command: command, text: text });
                    return;
                }
            }
            
            // Default: show as system message in chat
            self._addBannerToChat(text);
        },
        onBannerModal: function(data) {
            // Legacy handler - kept for compatibility
            self._handleBannerModal(data);
        }
    };
};

/**
 * Add banner text to chat as system messages
 */
MRC.prototype._addBannerToChat = function(text) {
    if (!text) return;
    var lines = text.split('\n');
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.length > 0) {
            this._messageLines.push('[' + nowTimestamp() + '] System *.: ' + line);
        }
    }
    this._invalidateWrappedMessageLines();
    this._needsRedraw = true;
};

/**
 * Handle banner-modal event from controller
 * Shows banner content in a modal with context-aware actions
 */
MRC.prototype._handleBannerModal = function(data) {
    try { if (typeof dbug === 'function') dbug('[MRC] _handleBannerModal called for: ' + (data ? data.command : 'null'), 'mrc'); } catch (_) { }
    try { log('[MRC-MODAL] _handleBannerModal called for command: ' + (data ? data.command : 'null')); } catch (_) { }
    
    var self = this;
    if (!data) {
        try { if (typeof dbug === 'function') dbug('[MRC] _handleBannerModal: no data, returning', 'mrc'); } catch (_) { }
        return;
    }
    var command = data.command;
    var text = data.text || '';
    
    try { if (typeof dbug === 'function') dbug('[MRC] _handleBannerModal: text length=' + text.length, 'mrc'); } catch (_) { }
    
    // Convert pipe codes to Ctrl-A for display using funclib's pipeToCtrlA
    var displayText = typeof pipeToCtrlA === 'function' ? pipeToCtrlA(text) : text;
    
    // Close any existing banner modal
    if (this._activeBannerModal) {
        try { this._activeBannerModal.close(); } catch (_) { }
        this._activeBannerModal = null;
    }
    
    // Get modal title and action based on command
    // Note: 'list' is the actual header for /rooms command
    var titles = {
        list: 'Room List',
        motd: 'Message of the Day',
        help: 'Help',
        whoon: 'Who\'s Online',
        info: 'MRC Info',
        users: 'Who\'s Online'
    };
    var title = titles[command] || 'Server Message';
    
    // Get action hint for prepopulating input
    var actions = {
        list: '/join #',
        whoon: '/tell ',
        users: '/tell '
    };
    var actionHint = actions[command] || null;
    
    // Build buttons based on whether action is available
    var buttons = [];
    if (actionHint) {
        buttons.push({ label: 'Action', hotKey: 'A', value: 'action', default: true });
    }
    buttons.push({ label: 'Close', value: 'close', cancel: true });
    
    // Create modal with banner content
    this._activeBannerModal = new Modal({
        type: 'custom',
        title: title,
        parentFrame: this.parentFrame,
        overlay: true,
        captureKeys: true,
        render: function(contentFrame) {
            // Split text into lines and draw
            var lines = displayText.split('\n');
            var y = 0;
            for (var i = 0; i < lines.length && y < contentFrame.height; i++) {
                contentFrame.gotoxy(1, y + 1);
                contentFrame.putmsg(lines[i]);
                y++;
            }
        },
        buttons: buttons,
        onSubmit: function(value) {
            self._activeBannerModal = null;
            // Handle action button - prepopulate input
            if (value === 'action' && actionHint) {
                self._inputBuffer = actionHint;
                self._inputCursor = self._inputBuffer.length;
                self._inputScrollOffset = 0;
            }
            self._needsRedraw = true;
        },
        onCancel: function() {
            self._activeBannerModal = null;
            self._needsRedraw = true;
        },
        onClose: function() {
            self._activeBannerModal = null;
            self._needsRedraw = true;
        }
    });
    
    // Bring modal to front and cycle to make visible
    if (this._activeBannerModal && this._activeBannerModal.frame) {
        this._activeBannerModal.frame.top();
        this._activeBannerModal.frame.cycle();
        // Also bring to top of parent
        if (this.parentFrame) this.parentFrame.cycle();
    }
};

/**
 * Handle controller updates
 */
MRC.prototype._onControllerUpdate = function (snapshot) {
    if (!this.controller) return;

    // Use provided snapshot or fetch new one
    if (!snapshot) {
        snapshot = this.controller.getSnapshot();
    }

    // Update adapter state
    if (this.service) {
        this.service.connected = snapshot.connection.connected;
        this.service.roomName = snapshot.room.name;
        this.service.messages = snapshot.messages;
        this.service.showNickList = snapshot.prefs.showNickList;
        this.service.toastEnabled = snapshot.prefs.toastEnabled;
    }

    // Update local view state
    this._room = snapshot.room.name;
    this._topic = snapshot.room.topic;
    this._nickList = snapshot.room.users.map(function (u) { return u.nick; });
    // Force nick list off - integrated into header instead of sidebar
    this._showNickList = false;
    this._toastEnabled = snapshot.prefs.toastEnabled;
    this._latency = snapshot.latency.ping > 0 ? String(snapshot.latency.ping) + 'ms' : '-';

    // Filter messages - System messages go to modal, rest to chat
    var filtered = this._filterSystemMessages(snapshot.messages);
    
    this._messageLines = filtered;
    this._messageLines = truncateLines(this._messageLines, this._maxLines);
    this._invalidateWrappedMessageLines();

    this._needsRedraw = true;
};

/**
 * SIMPLE: System messages go to modal, everything else to chat
 */
MRC.prototype._filterSystemMessages = function(messages) {
    if (!messages || !messages.length) return [];
    
    var result = [];
    var prevCount = this._lastMessageCount || 0;
    this._lastMessageCount = messages.length;
    
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        
        // Only check NEW messages
        if (i < prevCount) {
            result.push(msg);
            continue;
        }
        
        // Handle both string and object message formats
        var msgText = '';
        if (typeof msg === 'string') {
            msgText = msg;
        } else if (msg && typeof msg === 'object') {
            msgText = msg.display || msg.text || msg.body || '';
        }
        
        // Strip pipe color codes for pattern matching (|00 through |FF)
        var cleanMsg = String(msgText).replace(/\|[0-9A-Fa-f]{2}/g, '');
        
        // Is this a System message? Pattern: "[HH:MM:SS] System *.:"
        if (/\]\s*System\s*\*\.:\s*/.test(cleanMsg)) {
            // Extract content after "System *.:" (from original msgText to preserve colors)
            var content = String(msgText).replace(/^.*System\s*\*\.:\s*/i, '');
            this._addToSystemModal(content);
            // Don't add to chat
        } else {
            result.push(msg);
        }
    }
    
    return result;
};

/**
 * Add line to system modal - create if doesn't exist, append if it does
 */
MRC.prototype._addToSystemModal = function(content) {
    // If no modal or modal is closed, create new one
    if (!this._systemModal || !this._systemModal.isOpen) {
        this._systemModalLines = [];
        this._createSystemModal();
    }
    
    // Append content
    this._systemModalLines.push(content);
    
    // Update modal content
    if (this._systemModal && this._systemModal.frame) {
        this._renderSystemModalContent();
    }
};

/**
 * Create the system modal
 */
MRC.prototype._createSystemModal = function() {
    var self = this;
    
    this._systemModal = new Modal({
        parentFrame: this.layout.parentFrame,
        title: 'System',
        type: 'custom',
        width: Math.min(70, this.layout.parentFrame.width - 4),
        height: Math.min(20, this.layout.parentFrame.height - 4),
        render: function(modalFrame) {
            self._systemModalFrame = modalFrame;
            self._renderSystemModalContent();
        },
        keyHandler: function(key) {
            if (key === '\x1b' || key.toLowerCase() === 'q') {
                self._systemModal.close();
                self._systemModal = null;
                return true;
            }
            return false;
        },
        buttons: [
            { text: 'Close', hotkey: 'C', action: function() { 
                self._systemModal.close();
                self._systemModal = null;
            }}
        ]
    });
    
    // Bring to front
    if (this._systemModal.frame) {
        this._systemModal.frame.top();
    }
};

/**
 * Render content into system modal
 */
MRC.prototype._renderSystemModalContent = function() {
    if (!this._systemModalFrame || !this._systemModalLines) return;
    
    this._systemModalFrame.clear();
    
    var lines = this._systemModalLines;
    var maxLines = this._systemModalFrame.height - 1;
    var startLine = Math.max(0, lines.length - maxLines);
    
    for (var i = startLine; i < lines.length; i++) {
        var line = lines[i];
        // Truncate to frame width
        if (line.length > this._systemModalFrame.width - 1) {
            line = line.substring(0, this._systemModalFrame.width - 1);
        }
        this._systemModalFrame.putmsg(line + '\n');
    }
};

// Store bound update for cleanup
MRC.prototype._boundUpdate = MRC.prototype._onControllerUpdate;

MRC.prototype.enter = function (done) {
    this._exiting = false;
    
    // Reset scroll state on re-entry
    this._scrollOffset = 0;
    this._userScrolled = false;
    
    if (this.service) {
        if (typeof this.service.flush === 'function') {
            try { this.service.flush(); } catch (_) { }
        } else if (typeof this.service.cycle === 'function') {
            try { this.service.cycle(); } catch (_) { }
        }
        if (!this.service.connected && typeof this.service._initializeSession === 'function') {
            try { this.service._initializeSession(); } catch (_) { }
        }
        if (typeof this.service.ensureActiveRoom === 'function') {
            var preferredRoom = this.service.roomName || (this.service.settings && this.service.settings.startup && this.service.settings.startup.room) || '';
            try { this.service.ensureActiveRoom(preferredRoom); } catch (_) { }
        }
    }
    if (this.service && Array.isArray(this.service.messages)) {
        this._messageLines = this.service.messages.slice();
        this._messageLines = truncateLines(this._messageLines, this._maxLines);
        this._invalidateWrappedMessageLines();
    }
    
    // Clear frame data to force full re-render
    if (this.messagesFrame) {
        try { this.messagesFrame.clear(); } catch (_) { }
    }
    
    Subprogram.prototype.enter.call(this, done);
};

MRC.prototype.onServiceSnapshot = function (snapshot) {
    this._messageLines = snapshot.messages.slice();
    this._messageLines = truncateLines(this._messageLines, this._maxLines);
    this._invalidateWrappedMessageLines();
    this._room = snapshot.room || this._room;
    this._topic = snapshot.topic || this._topic;
    this._stats = snapshot.stats || this._stats;
    this._latency = snapshot.latency || this._latency;
    // Force nick list off - integrated into header
    this._showNickList = false;
    this._toastEnabled = snapshot.toastEnabled;
    this._nickList = snapshot.nickList || [];
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceMessage = function (payload) {
    if (typeof log === 'function') {
        try { dbug('[MRC] onServiceMessage from ' + (payload ? payload.from : 'unknown'), 'mrc'); } catch (_) { }
    }
    this._messageLines.push(payload);
    this._messageLines = truncateLines(this._messageLines, this._maxLines);
    this._invalidateWrappedMessageLines();
    if (!this._userScrolled) this._scrollOffset = 0;
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceNickList = function (list) {
    this._nickList = Array.isArray(list) ? list.slice() : [];
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceTopic = function (info) {
    if (info) {
        this._room = info.room || this._room;
        this._topic = info.topic || this._topic;
    }
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceStats = function (stats) {
    if (stats) this._stats = stats.slice();
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceLatency = function (latency) {
    this._latency = latency;
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServicePreference = function (pref) {
    if (!pref) return;
    if (pref.key === 'toast') this._toastEnabled = !!pref.value;
    // Nick list toggle is disabled - integrated into header instead
    // if (pref.key === 'showNickList') { ... }
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceDisconnect = function () {
    if (this._exiting) return;
    if (this.running) {
        this._exiting = true;
        this.exit();
    } else {
        this._needsRedraw = true;
    }
};

MRC.prototype._ensureFrames = function () {
    var host = this._ensureHostFrame();
    if (!host) return;
    var width = host.width;
    var height = host.height;
    if (width <= 0 || height <= 0) return;
    
    // Reset button render flag if dimensions changed
    if (this._lastFrameWidth !== width || this._lastFrameHeight !== height) {
        this._buttonsRendered = false;
        this._lastFrameWidth = width;
        this._lastFrameHeight = height;
    }

    var headerAttr = this.paletteAttr('CHAT_HEADER', BG_BLUE | WHITE);
    var footerAttr = this.paletteAttr('CHAT_INPUT', BG_BLUE | WHITE);
    var controlsAttr = this.paletteAttr('CHAT_CONTROLS', BG_BLACK | LIGHTGRAY);
    var messagesAttr = this.paletteAttr('CHAT_OUTPUT', BG_BLACK | LIGHTGRAY);
    var nickAttr = this.paletteAttr('CHAT_ROSTER', BG_BLACK | LIGHTCYAN);

    if (!this.headerFrame) {
        this.headerFrame = new Frame(1, 1, width, this.headerHeight, headerAttr, host);
        this.headerFrame.open();
        this.registerFrame(this.headerFrame);
    } else {
        this.headerFrame.moveTo(1, 1);
        this.headerFrame.width = width;
        this.headerFrame.height = this.headerHeight;
    }
    this.headerFrame.attr = headerAttr;

    if (!this.footerFrame) {
        this.footerFrame = new Frame(1, height - this.footerHeight + 1, width, this.footerHeight, footerAttr, host);
        this.footerFrame.open();
        this.registerFrame(this.footerFrame);
    } else {
        this.footerFrame.moveTo(1, height - this.footerHeight + 1);
        this.footerFrame.width = width;
        this.footerFrame.height = this.footerHeight;
    }
    this.footerFrame.attr = footerAttr;

    var mainHeight = Math.max(1, height - this.headerHeight - this.footerHeight);
    var mainTop = this.headerHeight + 1;
    var messageWidth = width;
    if (this._showNickList) messageWidth = Math.max(24, width - 18);

    // Layout order (matching wireframe):
    // 1. Buttons row (2 lines for button + shadow)
    // 2. Channel info row (1 line: #room - topic - N users)
    // 3. Messages (remaining space)
    
    var buttonTop = mainTop;
    var buttonHeight = 2;
    if (!this.buttonsFrame) {
        this.buttonsFrame = new Frame(1, buttonTop, messageWidth, buttonHeight, controlsAttr, host);
        this.buttonsFrame.open();
        this.registerFrame(this.buttonsFrame);
    } else {
        this.buttonsFrame.moveTo(1, buttonTop);
        this.buttonsFrame.width = messageWidth;
        this.buttonsFrame.height = buttonHeight;
    }
    this.buttonsFrame.attr = controlsAttr;

    var controlsTop = buttonTop + buttonHeight;
    var controlsHeight = 1;
    if (!this.controlsFrame) {
        this.controlsFrame = new Frame(1, controlsTop, messageWidth, controlsHeight, controlsAttr, host);
        this.controlsFrame.open();
        this.registerFrame(this.controlsFrame);
    } else {
        this.controlsFrame.moveTo(1, controlsTop);
        this.controlsFrame.width = messageWidth;
        this.controlsFrame.height = controlsHeight;
    }
    this.controlsFrame.attr = controlsAttr;

    var messagesTop = controlsTop + controlsHeight;
    var messagesHeight = Math.max(1, height - messagesTop - this.footerHeight + 1);
    if (!this.messagesFrame) {
        this.messagesFrame = new Frame(1, messagesTop, messageWidth, messagesHeight, messagesAttr, host);
        this.messagesFrame.word_wrap = false;
        this.messagesFrame.v_scroll = true;   // Enable vertical scrolling
        this.messagesFrame.lf_strict = true;  // Newlines trigger scroll at bottom
        this.messagesFrame.open();
        this.registerFrame(this.messagesFrame);
    } else {
        this.messagesFrame.moveTo(1, messagesTop);
        this.messagesFrame.width = messageWidth;
        this.messagesFrame.height = messagesHeight;
    }
    this.messagesFrame.attr = messagesAttr;
    this.setBackgroundFrame(this.messagesFrame);
    if (!this.messageScroll) {
        this.messageScroll = new ScrollBar(this.messagesFrame, { autohide: true });
    }

    if (this._showNickList) {
        var nickWidth = Math.max(1, width - messageWidth);
        if (!this.nickFrame) {
            this.nickFrame = new Frame(messageWidth + 1, mainTop, nickWidth, mainHeight, nickAttr, host);
            this.nickFrame.open();
            this.registerFrame(this.nickFrame);
        } else {
            this.nickFrame.moveTo(messageWidth + 1, mainTop);
            this.nickFrame.width = nickWidth;
            this.nickFrame.height = mainHeight;
        }
        this.nickFrame.attr = nickAttr;
    } else if (this.nickFrame) {
        try { this.nickFrame.close(); } catch (_) { }
        this.nickFrame = null;
    }
    this._buildButtons();
    this._needsRedraw = true;
};

MRC.prototype._destroyButtons = function () {
    for (var i = 0; i < this._buttons.length; i++) {
        var btn = this._buttons[i];
        if (btn && typeof btn.destroy === 'function') {
            try { btn.destroy(); } catch (_) { }
        }
    }
    this._buttons = [];
    this._clearHotspots();
    this._buttonHotspots = [];
};

MRC.prototype._buildButtons = function () {
    this._destroyButtons();
    var buttonSurface = this.buttonsFrame || this.controlsFrame;
    if (!buttonSurface) return;
    var attr = this.paletteAttr('CHAT_BUTTON', BG_CYAN | WHITE);
    var focusAttr = this.paletteAttr('CHAT_BUTTON_FOCUS', BG_BLUE | WHITE);
    var self = this;
    this._buttonHotspots = [];
    var buttonHeight = 2;
    var buttonY = 3;
    // Extract blend color from button surface background (defaults CYAN if available)
    var surfaceBg = (buttonSurface && buttonSurface.attr) ? ((buttonSurface.attr >> 4) & 0x07) : CYAN;
    var buttonShadowColors = [8, surfaceBg]; // shadow=DARKGRAY(8), blend=surfaceBg
    function addButton(label, handler, x) {
        var btn = new Button({
            parentFrame: buttonSurface,
            x: x,
            y: buttonY,
            width: Math.max(8, label.length + 4),
            height: buttonHeight,
            attr: attr,
            focusAttr: focusAttr,
            shadowColors: buttonShadowColors,
            label: label,
            onClick: handler
        });
        self._buttons.push(btn);
        self._buttonHotspots.push({ frame: btn.frame, button: btn });
        return btn.frame.width + 1;
    }
    var nextX = 2;
    nextX += addButton('Help', function () { self._requestHelp(); }, nextX);
    nextX += addButton('Rooms', function () { self._requestRooms(); }, nextX);
    nextX += addButton('Users', function () { self._requestWhoon(); }, nextX);
    nextX += addButton('BBSes', function () { self._requestBBSes(); }, nextX);
    nextX += addButton('Stats', function () { self._requestStats(); }, nextX);
    nextX += addButton('Motd', function () { self._requestMotd(); }, nextX);
    nextX += addButton('Exit', function () { self._requestExit(); }, nextX);
};

MRC.prototype._requestRooms = function () {
    try { if (typeof dbug === 'function') dbug('[MRC] _requestRooms called', 'mrc'); } catch (_) { }
    this.service.executeCommand('rooms');
};

MRC.prototype._requestWhoon = function () {
    try { if (typeof dbug === 'function') dbug('[MRC] _requestWhoon called', 'mrc'); } catch (_) { }
    this.service.executeCommand('quote chatters');
};

MRC.prototype._requestBBSes = function () {
    try { if (typeof dbug === 'function') dbug('[MRC] _requestBBSes called', 'mrc'); } catch (_) { }
    this.service.executeCommand('quote bbses');
};

MRC.prototype._requestMotd = function () {
    try { if (typeof dbug === 'function') dbug('[MRC] _requestMotd called', 'mrc'); } catch (_) { }
    this.service.executeCommand('motd');
};

MRC.prototype._requestStats = function () {
    try { if (typeof dbug === 'function') dbug('[MRC] _requestStats called', 'mrc'); } catch (_) { }
    this.service.executeCommand('quote statistics');
};

MRC.prototype._buttonFrameBounds = function (frame) {
    var buttonSurface = this.buttonsFrame || this.controlsFrame || this.hostFrame;
    var surfaceX = buttonSurface ? buttonSurface.x : 1;
    var surfaceY = buttonSurface ? buttonSurface.y : 1;
    // Compute absolute screen position from frame's relative position within surface
    var minX = surfaceX + (frame.x || 1) - 1;
    var minY = surfaceY + (frame.y || 1) - 1;
    var width = Math.max(1, frame.width || 1);
    var height = Math.max(1, frame.height || 1);
    return {
        minX: minX,
        maxX: minX + width - 1,
        minY: minY,
        maxY: minY + height - 1
    };
};

MRC.prototype._clearHotspots = function () {
    this._hotspotHandlers = {};
    this._hotspotCounter = 0;
    this._hotspotBuffer = '';
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_) { }
    }
};

MRC.prototype._nextHotspotToken = function () {
    var token = '~' + this._hotspotCounter.toString(36) + '~';
    this._hotspotCounter += 1;
    return token;
};

MRC.prototype._registerHotspot = function (minX, maxX, minY, maxY, button) {
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    if (minX > maxX || minY > maxY) return;
    var token = this._nextHotspotToken();
    this._hotspotHandlers[token] = button;
    for (var y = minY; y <= maxY; y++) {
        try { console.add_hotspot(token, false, minX, maxX, y); } catch (_) { }
    }
};

MRC.prototype._registerHotspots = function () {
    this._clearHotspots();
    if (!this._buttonHotspots || !this._buttonHotspots.length) return;
    
    for (var i = 0; i < this._buttonHotspots.length; i++) {
        var entry = this._buttonHotspots[i];
        if (!entry || !entry.frame || !entry.button) continue;
        var bounds = this._buttonFrameBounds(entry.frame);
        // Adjust Y coordinates by -2 to align hotspots with visual button positions
        this._registerHotspot(bounds.minX, bounds.maxX, bounds.minY - 2, bounds.maxY - 2, entry.button);
    }
};

MRC.prototype._registerUrlHotspots = function (wrappedLines, start, end) {
    // Clear previous URL hotspot tokens (keep button hotspots)
    var oldTokens = [];
    for (var t in this._hotspotHandlers) {
        if (this._hotspotHandlers.hasOwnProperty(t) && t.charAt(0) === '|') {
            oldTokens.push(t);
        }
    }
    for (var ot = 0; ot < oldTokens.length; ot++) {
        delete this._hotspotHandlers[oldTokens[ot]];
    }
    if (!this.messagesFrame) return;
    // messagesFrame.x and .y are 1-based; hotspot coords are 0-based
    var frameX = (this.messagesFrame.x || 1) - 1;
    var frameY = (this.messagesFrame.y || 1) - 1;
    var frameW = Math.max(1, this.messagesFrame.width);
    this._urlHotspotCounter = this._urlHotspotCounter || 0;
    var screenRow = 0;
    for (var li = start; li < end; li++) {
        var line = wrappedLines[li];
        if (!line) { screenRow++; continue; }
        // Strip Ctrl-A codes to get visible text for URL matching
        var visible = line.replace(/./g, '');
        var urls = findUrls(visible);
        for (var u = 0; u < urls.length; u++) {
            var urlInfo = urls[u];
            var token = '|u' + (this._urlHotspotCounter++).toString(36) + '|';
            this._hotspotHandlers[token] = { type: 'url', url: urlInfo.url };
            var minX = frameX + urlInfo.index;
            var maxX = frameX + urlInfo.index + urlInfo.length - 1;
            if (maxX >= frameX + frameW) maxX = frameX + frameW - 1;
            var absY = frameY + screenRow;
            try { console.add_hotspot(token, false, minX, maxX, absY); } catch (_) { }
        }
        screenRow++;
    }
};

MRC.prototype._cleanup = function () {
    this._clearHotspots();
    if (this._systemModal && typeof this._systemModal.close === 'function') {
        try { this._systemModal.close(); } catch (_) { }
    }
    this._systemModal = null;
    if (this._activeBannerModal && typeof this._activeBannerModal.close === 'function') {
        try { this._activeBannerModal.close(); } catch (_) { }
    }
    this._activeBannerModal = null;
    this._destroyButtons();

    // Explicitly close and null all child frames to prevent artifacts.
    // The base cleanup closes hostFrame (which cascades to children), but
    // nulling references ensures no stale frame objects linger on re-entry.
    var frameNames = ['headerFrame', 'footerFrame', 'controlsFrame', 'buttonsFrame', 'messagesFrame', 'nickFrame'];
    for (var i = 0; i < frameNames.length; i++) {
        var fn = frameNames[i];
        if (this[fn]) {
            try { this[fn].close(); } catch (_) { }
            this[fn] = null;
        }
    }
    if (this.messageScroll) {
        this.messageScroll = null;
    }
};

MRC.prototype.cleanup = MRC.prototype._cleanup;

MRC.prototype._processHotspotKey = function (key) {
    if (!key) return false;
    this._hotspotBuffer += key;
    if (this._hotspotBuffer.length > 16) {
        this._hotspotBuffer = this._hotspotBuffer.substr(this._hotspotBuffer.length - 16);
    }
    // Check for complete token match
    for (var token in this._hotspotHandlers) {
        if (this._hotspotHandlers.hasOwnProperty(token) && this._hotspotBuffer.indexOf(token) !== -1) {
            var handler = this._hotspotHandlers[token];
            this._hotspotBuffer = '';
            if (handler && handler.type === 'url' && handler.url) {
                if (this.shell && typeof this.shell.openWebsite === 'function') {
                    try { this.shell.openWebsite(handler.url); } catch (_) { }
                }
                return true;
            }
            if (handler && typeof handler.press === 'function') {
                try { handler.press(); } catch (_) { }
            }
            return true;
        }
    }
    // Check if we're in the middle of building a token (has ~ but no closing ~)
    // Tokens are format ~X~ where X is alphanumeric
    var tildeIdx = this._hotspotBuffer.lastIndexOf('~');
    if (tildeIdx !== -1) {
        var afterTilde = this._hotspotBuffer.substr(tildeIdx + 1);
        // If afterTilde has no closing ~, we might be mid-token - consume the key
        if (afterTilde.indexOf('~') === -1 && afterTilde.length < 8) {
            return true;
        }
    }
    return false;
};

MRC.prototype._requestHelp = function () {
    this.service.executeCommand('help');
};

MRC.prototype._requestExit = function () {
    if (this._exiting) return;
    this._exiting = true;
    // DO NOT disconnect from the network - MRC is a long-running service
    // that persists at the node level. Just exit the UI subprogram.
    // The user can still receive toast notifications and re-enter MRC later.
    if (this.running) this.exit();
};

MRC.prototype._renderHeader = function () {
    if (!this.headerFrame) return;
    var attr = this.headerFrame.attr || this.paletteAttr('CHAT_HEADER', BG_BLUE | WHITE);
    this.headerFrame.attr = attr;
    this.headerFrame.clear(attr);

    // Build colored header text with semantic colors
    var parts = [];
    parts.push(this.colorize('HEADER_TITLE', 'MRC'));
    if (this._room) {
        parts.push(' ');
        parts.push(this.colorize('HEADER_ROOM', '#' + this._room));
    }
    if (this._topic) {
        parts.push(this.colorize('HEADER_TOPIC', ' - ' + this._topic));
    }
    // Add user count to header (moved from controls row)
    if (this._nickList && this._nickList.length > 0) {
        parts.push(this.colorize('HEADER_LATENCY', ' (' + this._nickList.length + ' users)'));
    }

    var text = parts.join('');
    this.headerFrame.gotoxy(1, 1);
    this.headerFrame.putmsg(text.substr(0, this.headerFrame.width));
    this.headerFrame.cycle();
};

MRC.prototype._renderFooter = function () {
    if (!this.footerFrame) return;
    var attr = this.footerFrame.attr || this.paletteAttr('CHAT_INPUT', BG_BLUE | WHITE);
    this.footerFrame.attr = attr;
    this.footerFrame.clear(attr);

    // Just render the input prompt (no status line)
    this._refreshFooterInput();
};

MRC.prototype._refreshFooterInput = function () {
    if (!this.footerFrame) return;
    var attr = this.footerFrame.attr || this.paletteAttr('CHAT_INPUT', BG_BLUE | WHITE);
    if (typeof this.footerFrame.attr !== 'number' || this.footerFrame.attr !== attr) {
        this.footerFrame.attr = attr;
    }
    var width = this.footerFrame.width;
    if (width <= 0) return;
    
    // Build counter prefix: (len/140)> 
    var len = this._inputBuffer.length;
    var counter = '(' + len + '/' + MRC_MAX_MESSAGE_LENGTH + ')';
    var atMax = (len >= MRC_MAX_MESSAGE_LENGTH);
    var prefix = counter + '> ';
    var prefixLen = prefix.length;
    var contentWidth = Math.max(1, width - prefixLen);
    
    // Store counter info for rendering
    this._counterLen = counter.length;
    this._counterAtMax = atMax;
    
    // Ensure cursor is within bounds
    if (this._inputCursor < 0) this._inputCursor = 0;
    if (this._inputCursor > this._inputBuffer.length) this._inputCursor = this._inputBuffer.length;
    
    // Calculate scroll offset to keep cursor visible
    var cursorPos = this._inputCursor;
    var scrollOffset = this._inputScrollOffset || 0;
    
    // Adjust scroll if cursor is before visible area
    if (cursorPos < scrollOffset) {
        scrollOffset = cursorPos;
    }
    // Adjust scroll if cursor is past visible area
    if (cursorPos >= scrollOffset + contentWidth) {
        scrollOffset = cursorPos - contentWidth + 1;
    }
    // Clamp scroll offset
    if (scrollOffset < 0) scrollOffset = 0;
    var maxScroll = Math.max(0, this._inputBuffer.length - contentWidth + 1);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    this._inputScrollOffset = scrollOffset;
    
    // Build visible portion of input
    var visibleInput = this._inputBuffer.substr(scrollOffset, contentWidth);
    
    // Show scroll indicator if scrolled
    var scrollIndicator = (scrollOffset > 0) ? '<' : '';
    var displayPrefix = scrollIndicator ? scrollIndicator + prefix.substr(1) : prefix;
    
    // Calculate cursor screen position
    var cursorScreenPos = prefixLen + (cursorPos - scrollOffset);
    
    // Render using setData for precise cursor positioning
    this._renderInputWithCursor(displayPrefix, visibleInput, cursorScreenPos, width, attr);
};

// Render input line with visual cursor at specified position
MRC.prototype._renderInputWithCursor = function (prefix, text, cursorPos, width, baseAttr) {
    if (!this.footerFrame) return;
    var row = Math.max(0, this.footerFrame.height - 1); // 0-indexed for setData
    
    // Cursor uses inverted colors for visibility
    var cursorAttr = ((baseAttr & 0x07) << 4) | ((baseAttr >> 4) & 0x07) | (baseAttr & 0x88);
    if (cursorAttr === baseAttr) cursorAttr = (BG_WHITE | BLACK); // fallback if same
    
    // Counter color: bright red when at max, normal otherwise
    var counterLen = this._counterLen || 0;
    var counterAttr = this._counterAtMax ? (BG_BLUE | LIGHTRED) : baseAttr;
    
    var fullText = prefix + text;
    for (var i = 0; i < width; i++) {
        var ch = (i < fullText.length) ? fullText.charAt(i) : ' ';
        var attr;
        if (i === cursorPos) {
            attr = cursorAttr;
        } else if (i < counterLen) {
            attr = counterAttr;  // Counter portion
        } else {
            attr = baseAttr;
        }
        try { this.footerFrame.setData(i, row, ch, attr, false); } catch (e) { }
    }
    if (typeof this.footerFrame.cycle === 'function') {
        try { this.footerFrame.cycle(); } catch (e) { }
    }
};

MRC.prototype._renderMessages = function () {
    if (!this.messagesFrame) return;
    var width = Math.max(1, this.messagesFrame.width);
    var wrappedLines = this._getWrappedMessageLines(width);
    var attr = this.messagesFrame.attr || this.paletteAttr('CHAT_OUTPUT', BG_BLACK | LIGHTGRAY);
    this.messagesFrame.attr = attr;
    var height = this.messagesFrame.height;
    var total = wrappedLines.length;
    if (total <= 0) total = 0;
    
    // Calculate visible window
    var maxOffset = Math.max(0, total - height);
    if (this._scrollOffset > maxOffset) this._scrollOffset = maxOffset;
    var start = Math.max(0, total - height - this._scrollOffset);
    var end = Math.max(0, total - this._scrollOffset);
    
    // Clear and render visible lines using gotoxy (original working approach)
    this.messagesFrame.clear(attr);
    var y = 1;
    for (var i = start; i < end; i++) {
        if (y > height) break;
        this.messagesFrame.gotoxy(1, y++);
        this.messagesFrame.putmsg(wrappedLines[i]);
    }
    
    // Register URL hotspots for visible message lines
    this._registerUrlHotspots(wrappedLines, start, end);
    if (this.messageScroll) this.messageScroll.cycle();
    this.messagesFrame.cycle();
};

MRC.prototype._invalidateWrappedMessageLines = function () {
    this._wrappedLineCache = null;
    this._wrappedLineCacheWidth = 0;
};

// Lightweight scroll - with gotoxy approach, just re-render the visible window
MRC.prototype._scrollOnly = function () {
    // Simply re-render messages with updated scroll offset
    this._renderMessages();
};

MRC.prototype._getWrappedMessageLines = function (width) {
    var effectiveWidth = Math.max(1, width || 1);
    if (this._wrappedLineCache && this._wrappedLineCacheWidth === effectiveWidth) {
        return this._wrappedLineCache;
    }
    var lines = [];
    for (var i = 0; i < this._messageLines.length; i++) {
        var message = this._messageLines[i];
        var wrapped = this._wrapMessageForWidth(message, effectiveWidth);
        if (!wrapped || !wrapped.length) {
            lines.push('');
            continue;
        }
        for (var w = 0; w < wrapped.length; w++) {
            if (wrapped[w] === undefined) continue;
            lines.push(wrapped[w]);
        }
    }
    if (!lines.length) lines.push('');
    this._wrappedLineCache = lines;
    this._wrappedLineCacheWidth = effectiveWidth;
    return this._wrappedLineCache;
};

MRC.prototype._wrapMessageForWidth = function (message, width) {
    var payload = message;
    var normalized;
    if (payload && typeof payload === 'object' && payload.display !== undefined) {
        normalized = String(payload.display);
    } else if (message === undefined || message === null) {
        normalized = '';
        payload = { display: '' };
    } else {
        normalized = String(message);
        payload = { display: normalized };
    }
    if (!normalized.length) return [''];
    var wrappedStr = null;
    if (typeof word_wrap === 'function') {
        try {
            wrappedStr = word_wrap(normalized, width, normalized.length, false);
        } catch (_) {
            wrappedStr = null;
        }
    }
    var candidate;
    if (typeof wrappedStr === 'string') {
        candidate = wrappedStr;
    } else if (Array.isArray(wrappedStr)) {
        candidate = wrappedStr.join('\n');
    }
    if (typeof candidate !== 'string' || !candidate.length) {
        candidate = this._fallbackWrap(normalized, width);
    }
    var sanitized = candidate.replace(/\r/g, '\n');
    var parts = sanitized.split('\n');
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    if (!parts.length) parts.push('');
    return this._applyWrapColor(parts, payload.wrapColor);
};

MRC.prototype._fallbackWrap = function (text, width) {
    if (!text || !text.length) return '';
    var segments = text.replace(/\r/g, '\n').split('\n');
    var wrapped = [];
    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (!segment.length) {
            wrapped.push('');
            continue;
        }
        var remaining = segment;
        while (remaining.length > width) {
            wrapped.push(remaining.substr(0, width));
            remaining = remaining.substr(width);
        }
        if (remaining.length || !wrapped.length) wrapped.push(remaining);
    }
    return wrapped.join('\n');
};

MRC.prototype._applyWrapColor = function (lines, wrapColor) {
    if (!wrapColor || !lines || lines.length <= 1) return lines;
    for (var i = 1; i < lines.length; i++) {
        var line = lines[i];
        if (!line) continue;
        var idx = 0;
        while (idx < line.length && (line.charAt(idx) === ' ' || line.charAt(idx) === '\t')) idx++;
        var leading = line.substr(0, idx);
        var rest = line.substr(idx);
        if (!rest.length) continue;
        var firstChar = rest.charAt(0);
        if (firstChar === '\x01' || firstChar === '\x1b') continue;
        lines[i] = leading + wrapColor + rest;
    }
    return lines;
};

MRC.prototype._renderNickList = function () {
    if (!this.nickFrame) return;
    var attr = this.nickFrame.attr || this.paletteAttr('CHAT_ROSTER', BG_BLACK | LIGHTCYAN);
    this.nickFrame.attr = attr;
    this.nickFrame.clear(attr);
    var height = this.nickFrame.height;
    for (var i = 0; i < this._nickList.length && i < height; i++) {
        this.nickFrame.gotoxy(1, i + 1);
        this.nickFrame.putmsg(this._nickList[i]);
    }
    this.nickFrame.cycle();
};

MRC.prototype._renderButtons = function () {
    if (!this.controlsFrame) return;
    var attr = this.controlsFrame.attr || this.paletteAttr('CHAT_CONTROLS', BG_BLACK | LIGHTGRAY);
    this.controlsFrame.attr = attr;
    
    // Always register hotspots (they may change)
    this._registerHotspots();
    
    // Only clear/render button graphics on first render or explicit refresh
    if (!this._buttonsRendered) {
        this.controlsFrame.clear(attr);
        // Info row removed - users count moved to header, room/topic already in header
        this.controlsFrame.cycle();
        if (this.buttonsFrame) {
            this.buttonsFrame.clear(attr);
        }
        for (var i = 0; i < this._buttons.length; i++) {
            if (this._buttons[i] && typeof this._buttons[i].render === 'function') {
                try { this._buttons[i].render(); } catch (_) { }
            }
        }
        if (this.buttonsFrame) this.buttonsFrame.cycle();
        this._buttonsRendered = true;
    }
};

MRC.prototype.draw = function () {
    var nowTs = Date.now();
    if (this._lastRenderTs && (nowTs - this._lastRenderTs) < this._redrawThrottleMs) {
        if (this.timer && typeof this.timer.addEvent === 'function') {
            if (!this._throttlePending) {
                var self = this;
                try {
                    this._throttlePending = this.timer.addEvent(this._redrawThrottleMs, false, function () {
                        self._throttlePending = null;
                        self.draw();
                    });
                } catch (_) { }
            }
            this._needsRedraw = true;
            return;
        }
    }
    if (this._throttlePending) {
        try { this._throttlePending.abort = true; } catch (_) { }
        this._throttlePending = null;
    }
    this._ensureFrames();
    this._renderHeader();
    this._renderButtons();
    this._renderMessages();
    if (this._showNickList) this._renderNickList();
    this._renderFooter();
    this._needsRedraw = false;
    var framesToTop = [this.headerFrame, this.controlsFrame, this.buttonsFrame, this.messagesFrame, this.nickFrame, this.footerFrame];
    for (var i = 0; i < framesToTop.length; i++) {
        var frame = framesToTop[i];
        if (frame && typeof frame.top === 'function') {
            try { frame.top(); } catch (_) { }
        }
    }
    if (this.hostFrame) {
        try { this.hostFrame.top(); } catch (_) { }
        if (typeof this.hostFrame.cycle === 'function') {
            try { this.hostFrame.cycle(); } catch (_) { }
        }
    }
    if (this.parentFrame && typeof this.parentFrame.cycle === 'function') {
        try { this.parentFrame.cycle(); } catch (_) { }
    }
    
    // Ensure active modal stays on top
    if (this._activeBannerModal && this._activeBannerModal.frame) {
        try { this._activeBannerModal.frame.top(); } catch (_) { }
        try { this._activeBannerModal.frame.cycle(); } catch (_) { }
    }
    
    // System modal on top
    if (this._systemModal && this._systemModal.frame) {
        try { this._systemModal.frame.top(); } catch (_) { }
        try { this._systemModal.frame.cycle(); } catch (_) { }
    }
    
    this._lastRenderTs = nowTs;
};

MRC.prototype.handleKey = function (key) {
    if (key === null || typeof key === 'undefined' || key === '') return true;
    this._lastKeyTs = Date.now();
    
    // If system modal is open, route keys to it
    if (this._systemModal && this._systemModal.isOpen) {
        if (key === '\x1b' || key.toLowerCase() === 'q' || key.toLowerCase() === 'c') {
            this._systemModal.close();
            this._systemModal = null;
            this._needsRedraw = true;
            return true;
        }
        // Absorb all other keys while modal is open
        return true;
    }
    
    var frameHeight = this.messagesFrame ? Math.max(1, this.messagesFrame.height) : 6;
    var page = Math.max(1, frameHeight - 1);
    var fallbackWidth = 80;
    if (typeof console !== 'undefined' && console && console.screen_columns) {
        fallbackWidth = Math.max(1, console.screen_columns);
    }
    var cacheWidth = this.messagesFrame ? Math.max(1, this.messagesFrame.width) : fallbackWidth;
    var totalLines = this._getWrappedMessageLines(cacheWidth).length;
    var maxOffset = Math.max(0, totalLines - frameHeight);
    if (key === '\x1B') {
        if (!this._exiting) this._exiting = true;
        this.exit();
        return false;
    }
    if (this._processHotspotKey(key)) return true;
    var needsFullRedraw = false;
    
    // Message scroll keys - use lightweight scroll
    // Note: KEY_HOME/KEY_END are '\x02'/'\x05' per key_defs.js
    // For scroll-to-top/bottom, use Ctrl+Home (same as KEY_HOME) with modifier detection isn't reliable,
    // so we use '<' and '>' for jump to oldest/newest messages
    switch (key) {
        case KEY_UP:
            this._scrollOffset = Math.min(this._scrollOffset + 1, maxOffset);
            this._userScrolled = this._scrollOffset > 0;
            this._scrollOnly();
            return true;
        case KEY_DOWN:
            this._scrollOffset = Math.max(0, this._scrollOffset - 1);
            this._userScrolled = this._scrollOffset > 0;
            this._scrollOnly();
            return true;
        case KEY_PAGEUP:
        case '\x1b[5~':  // ANSI PgUp
            this._scrollOffset = Math.min(this._scrollOffset + page, maxOffset);
            this._userScrolled = this._scrollOffset > 0;
            this._scrollOnly();
            return true;
        case KEY_PAGEDN:
        case '\x1b[6~':  // ANSI PgDn
            this._scrollOffset = Math.max(0, this._scrollOffset - page);
            this._userScrolled = this._scrollOffset > 0;
            this._scrollOnly();
            return true;
        case '<':  // Jump to oldest (top) of message buffer
            this._scrollOffset = maxOffset;
            this._userScrolled = this._scrollOffset > 0;
            this._scrollOnly();
            return true;
        case '>':  // Jump to newest (bottom) of message buffer
            this._scrollOffset = 0;
            this._userScrolled = false;
            this._scrollOnly();
            return true;
    }
    if (needsFullRedraw) {
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }

    // Input cursor movement (left/right arrows)
    if (key === KEY_LEFT || key === '\x1B[D') {
        if (this._inputCursor > 0) {
            this._inputCursor--;
            this._refreshFooterInput();
        }
        return true;
    }
    if (key === KEY_RIGHT || key === '\x1B[C') {
        if (this._inputCursor < this._inputBuffer.length) {
            this._inputCursor++;
            this._refreshFooterInput();
        }
        return true;
    }
    // Home/End for input cursor
    if (key === KEY_HOME || key === '\x01') { // Ctrl+A or Home
        if (this._inputCursor !== 0) {
            this._inputCursor = 0;
            this._refreshFooterInput();
        }
        return true;
    }
    if (key === KEY_END || key === '\x05') { // Ctrl+E or End
        if (this._inputCursor !== this._inputBuffer.length) {
            this._inputCursor = this._inputBuffer.length;
            this._refreshFooterInput();
        }
        return true;
    }

    // Color rotation with Ctrl+Left/Ctrl+Right (or fallback: [ and ])
    if (key === '[' || key === '\x1B[1;5D') { // [ or Ctrl+Left
        this.service.rotateMsgColor(-1);
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    if (key === ']' || key === '\x1B[1;5C') { // ] or Ctrl+Right
        this.service.rotateMsgColor(1);
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }

    // Enter - send message
    if (key === '\r' || key === '\n') {
        this.service.sendLine(this._inputBuffer);
        this._inputBuffer = '';
        this._inputCursor = 0;
        this._inputScrollOffset = 0;
        this._scrollOffset = 0;
        this._userScrolled = false;
        this._refreshFooterInput();
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    
    // Backspace - delete character before cursor
    if (key === '\b' || key === '\x7F') {
        if (this._inputCursor > 0) {
            this._inputBuffer = this._inputBuffer.slice(0, this._inputCursor - 1) + this._inputBuffer.slice(this._inputCursor);
            this._inputCursor--;
            this.service.pauseTypingFor(1000);
            this._refreshFooterInput();
        }
        return true;
    }
    
    // Delete key - delete character at cursor
    if (key === KEY_DEL || key === '\x7E') {
        if (this._inputCursor < this._inputBuffer.length) {
            this._inputBuffer = this._inputBuffer.slice(0, this._inputCursor) + this._inputBuffer.slice(this._inputCursor + 1);
            this._refreshFooterInput();
        }
        return true;
    }
    
    // Tab - autocomplete
    if (key === '\t') {
        this._autoComplete();
        this._refreshFooterInput();
        return true;
    }
    
    // Function keys and control keys
    if (key === KEY_F1) {
        this._requestHelp();
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    if (key === '\x11') { // Ctrl+Q
        this._requestExit();
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    if (key === '\x14') { // Ctrl+T
        this.service.setToastEnabled(!this._toastEnabled);
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    if (key === '\x0E') { // Ctrl+N
        this.service.setNickListVisible(!this._showNickList);
        this._needsRedraw = true;
        if (this.running) this.draw();
        return true;
    }
    
    // Printable characters - insert at cursor position (max 140 chars for MRC)
    if (typeof key === 'string' && key.length === 1 && key >= ' ') {
        if (this._inputBuffer.length >= MRC_MAX_MESSAGE_LENGTH) {
            // At max length - reject input
            return true;
        }
        this._inputBuffer = this._inputBuffer.slice(0, this._inputCursor) + key + this._inputBuffer.slice(this._inputCursor);
        this._inputCursor++;
        this.service.pauseTypingFor(1000);
        this._refreshFooterInput();
        return true;
    }
    
    return true;
};

MRC.prototype._autoComplete = function () {
    if (!this._inputBuffer.length) return;
    var parts = this._inputBuffer.split(' ');
    var last = parts.pop();
    var lower = last.toLowerCase();
    var match = null;
    for (var i = 0; i < this._nickList.length; i++) {
        var nick = this._nickList[i];
        if (nick.toLowerCase().indexOf(lower) === 0) {
            match = nick;
            break;
        }
    }
    if (!match) {
        parts.push(last);
    } else {
        parts.push(match);
    }
    this._inputBuffer = parts.join(' ');
    // Update cursor to end of completed text
    this._inputCursor = this._inputBuffer.length;
};

MRC.prototype.cleanup = function () {
    // First call our own _cleanup to clear hotspots, modals, buttons
    if (this._cleanup && typeof this._cleanup === 'function') {
        try { this._cleanup(); } catch (e) { 
            try { if (typeof dbug === 'function') dbug('[MRC] _cleanup error: ' + e, 'mrc'); } catch (_) { }
        }
    }
    
    if (this._throttlePending && typeof this._throttlePending === 'object') {
        try { this._throttlePending.abort = true; } catch (_) { }
    }
    this._throttlePending = null;
    this._lastRenderTs = 0;
    
    // Remove listener proxy from controller (controller is persistent, MRC instance is not)
    if (this._listenerProxy && this.controller && typeof this.controller.removeListener === 'function') {
        try { 
            this.controller.removeListener(this._listenerProxy); 
            if (typeof dbug === 'function') dbug('[MRC] Removed listener proxy from controller in cleanup', 'mrc');
        } catch (_) { }
    }
    this._listenerProxy = null;
    
    // Remove from service listeners
    if (this.service && typeof this.service.removeListener === 'function') {
        try { this.service.removeListener(this); } catch (_) { }
    }
    
    // Call parent cleanup to close frames, detach timer, etc.
    Subprogram.prototype.cleanup.call(this);
};

MRC.prototype.cycle = function () {
    if (!this.running) return;

    // Cycle the controller to process socket data
    if (this.service && typeof this.service.cycle === 'function') {
        try { this.service.cycle(); } catch (_) { }
    }

    if (this._needsRedraw) this.draw();
};

registerModuleExports({ MRC: MRC, MRCService: MRCService });
