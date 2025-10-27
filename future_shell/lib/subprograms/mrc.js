load('sbbsdefs.js');
load('funclib.js');
load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/util/layout/button.js');
load('frame.js');
load('scrollbar.js');
load('future_shell/lib/effects/frame-ext.js');
load('future_shell/lib/mrc/session.js');
load('future_shell/lib/mrc/factory.js');

if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

if (typeof KEY_F1 === 'undefined') var KEY_F1 = 0x3B00;

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
        this._handleServerText('Unable to connect to MRC: ' + err);
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
    this.session.on('error', function (err) { self._handleServerText(String(err || 'Unknown error')); });
};

MRCService.prototype._handlePrivateEcho = function (target, msg) {
    var epoch = Date.now();
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
        plain: stripSyncColors(msg),
        display: display,
        wrapColor: this._resolveWrapColor(user.alias, msg)
    });
};

MRCService.prototype._handleDisconnect = function () {
    this.connected = false;
    this._handleServerText('Disconnected from MRC.');
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
    if (msg.to_room && msg.to_room !== '' && this.session.room && msg.to_room.toLowerCase() !== this.session.room.toLowerCase()) {
        return;
    }
    var epoch = (typeof msg.ts === 'number') ? msg.ts : Date.now();
    var display = format('\x01n\x01h[%s]\x01n %s%s\x01n%s',
        nowTimestamp(),
        mention ? '\x01h\x01r! ' : '',
        ctrlA(msg.from_user || 'System'),
        ctrlA(': ' + (msg.body || ''))
    );
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
        plain: stripSyncColors(text),
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
            try { this._handleServerText('Attempt to join #' + cleanTarget + ' failed: ' + joinErr); } catch (_) { }
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
    this.shell.showToast({
        title: payload.from || 'MRC',
        message: (payload.from || 'MRC') + ': ' + (payload.plain || '').substr(0, 120),
        launch: 'mrc',
        category: 'mrc',
        sender: payload.from || 'mrc',
        programIcon: 'mrc'
    });
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
    var now = Date.now();
    if (this._typingHoldUntil && now < this._typingHoldUntil) return;
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
        this._handleServerText('Toast notifications ' + (this.toastEnabled ? 'enabled' : 'disabled') + '.');
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
    this._handleServerText('Disconnected.');
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
            CHAT_HEADER: { BG: BG_BLUE, FG: WHITE },
            CHAT_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_CONTROLS: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_INPUT: { BG: BG_BLUE, FG: WHITE },
            CHAT_ROSTER: { BG: BG_BLACK, FG: CYAN },
            CHAT_BUTTON: { BG: BG_CYAN, FG: WHITE },
            CHAT_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE }
        }, 'mrc');
    }
    this.rendered = false;

    // Use factory to get persistent per-node controller
    this.controller = getMrcController();

    // Create adapter to bridge old service API to new controller API
    this.service = this._createServiceAdapter(this.controller);
    this.controller.addListener(this._onControllerUpdate.bind(this));

    this.headerFrame = null;
    this.controlsFrame = null;
    this.buttonsFrame = null;
    this.messagesFrame = null;
    this.nickFrame = null;
    this.footerFrame = null;
    this.messageScroll = null;
    this.headerHeight = 1;
    this.footerHeight = 2;
    this.controlHeight = 4;
    this._messageLines = [];
    this._maxLines = 800;
    this._scrollOffset = 0;
    this._userScrolled = false;
    this._buttons = [];
    this._inputBuffer = '';
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
    this._buttonHotspotTokens = {};
    this._buttonKeyMap = {};
    this._hotspotBuffer = '';
    this._wrappedLineCache = null;
    this._wrappedLineCacheWidth = 0;
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
            if (text.trim()[0] === '/') {
                controller.executeCommand(text.trim().slice(1));
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
    this._showNickList = snapshot.prefs.showNickList;
    this._toastEnabled = snapshot.prefs.toastEnabled;
    this._latency = snapshot.latency.ping > 0 ? String(snapshot.latency.ping) + 'ms' : '-';

    // Update messages
    this._messageLines = snapshot.messages.slice();
    this._messageLines = truncateLines(this._messageLines, this._maxLines);
    this._invalidateWrappedMessageLines();

    this._needsRedraw = true;
};

// Store bound update for cleanup
MRC.prototype._boundUpdate = MRC.prototype._onControllerUpdate;

MRC.prototype.enter = function (done) {
    this._exiting = false;
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
    this._showNickList = snapshot.showNickList;
    this._toastEnabled = snapshot.toastEnabled;
    this._nickList = snapshot.nickList || [];
    this._needsRedraw = true;
    if (this.running) this.draw();
};

MRC.prototype.onServiceMessage = function (payload) {
    if (typeof log === 'function') {
        try { log('[MRC] onServiceMessage from ' + (payload ? payload.from : 'unknown')); } catch (_) { }
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
    if (pref.key === 'showNickList') {
        this._showNickList = !!pref.value;
        this._releaseFrameRefs();
        this._ensureFrames();
    }
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
    var controlsHeight = Math.min(mainHeight, 3);
    var messageWidth = width;
    if (this._showNickList) messageWidth = Math.max(24, width - 18);

    if (!this.controlsFrame) {
        this.controlsFrame = new Frame(1, mainTop, messageWidth, Math.min(2, controlsHeight), controlsAttr, host);
        this.controlsFrame.open();
        this.registerFrame(this.controlsFrame);
    } else {
        this.controlsFrame.moveTo(1, mainTop);
        this.controlsFrame.width = messageWidth;
        this.controlsFrame.height = Math.min(2, controlsHeight);
    }
    this.controlsFrame.attr = controlsAttr;

    var buttonTop = mainTop + 2;
    if (!this.buttonsFrame) {
        this.buttonsFrame = new Frame(1, buttonTop, messageWidth, 2, controlsAttr, host);
        this.buttonsFrame.open();
        this.registerFrame(this.buttonsFrame);
    } else {
        this.buttonsFrame.moveTo(1, buttonTop);
        this.buttonsFrame.width = messageWidth;
        this.buttonsFrame.height = 2;
    }
    this.buttonsFrame.attr = controlsAttr;

    var messagesTop = buttonTop + this.buttonsFrame.height;
    var messagesHeight = Math.max(1, height - messagesTop - this.footerHeight + 1);
    if (!this.messagesFrame) {
        this.messagesFrame = new Frame(1, messagesTop, messageWidth, messagesHeight, messagesAttr, host);
        this.messagesFrame.word_wrap = false;
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
    this._buttonHotspotTokens = {};
    this._buttonKeyMap = {};
    var buttonHeight = 2;
    var buttonY = 3;
    function addButton(label, handler, x, keyChar) {
        var btn = new Button({
            parentFrame: buttonSurface,
            x: x,
            y: buttonY,
            width: Math.max(8, label.length + 4),
            height: buttonHeight,
            attr: attr,
            focusAttr: focusAttr,
            label: label,
            onClick: handler
        });
        self._buttons.push(btn);
        self._buttonHotspots.push({ frame: btn.frame, action: handler, key: keyChar || null, token: null });
        return btn.frame.width + 1;
    }
    var nextX = 2;
    nextX += addButton('Help', function () { self._requestHelp(); }, nextX, null);
    nextX += addButton('Exit', function () { self._requestExit(); }, nextX, null);
};

MRC.prototype._buttonFrameBounds = function (frame) {
    var buttonSurface = this.buttonsFrame || this.controlsFrame || this.hostFrame;
    var surfaceX = buttonSurface ? buttonSurface.x : 1;
    var surfaceY = buttonSurface ? buttonSurface.y : 1;
    var minX = surfaceX + (frame.x || 1) - 1;
    var minY = surfaceY + (frame.y || 1) - 5;
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
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (_) { }
    }
    this._buttonHotspotTokens = {};
    this._buttonKeyMap = {};
    this._hotspotBuffer = '';
};

MRC.prototype._registerHotspots = function () {
    this._clearHotspots();
    if (!this._buttonHotspots || !this._buttonHotspots.length) return;
    if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
    for (var i = 0; i < this._buttonHotspots.length; i++) {
        var entry = this._buttonHotspots[i];
        if (!entry || !entry.frame) continue;
        var bounds = this._buttonFrameBounds(entry.frame);
        var token = entry.token || String.fromCharCode(0x10 + (i % 16));
        entry.token = token;
        this._buttonHotspotTokens[token] = entry.action;
        for (var y = bounds.minY; y <= bounds.maxY; y++) {
            try { console.add_hotspot(token, false, bounds.minX, bounds.maxX, y); } catch (_) { }
        }
        if (entry.key) {
            var lower = entry.key.toLowerCase();
            var upper = entry.key.toUpperCase();
            this._buttonKeyMap[lower] = entry.action;
            this._buttonKeyMap[upper] = entry.action;
            for (var y2 = bounds.minY; y2 <= bounds.maxY; y2++) {
                try { console.add_hotspot(lower, false, bounds.minX, bounds.maxX, y2); } catch (_) { }
                if (upper !== lower) {
                    try { console.add_hotspot(upper, false, bounds.minX, bounds.maxX, y2); } catch (_) { }
                }
            }
        }
    }
};

MRC.prototype._activateButtonAction = function (handler) {
    if (typeof handler === 'function') {
        try { handler(); } catch (_) { }
        return true;
    }
    return false;
};

MRC.prototype._processButtonHotspotInput = function (key) {
    if (typeof key === 'number') key = String.fromCharCode(key);
    if (!key || typeof key !== 'string') return false;
    if (this._buttonKeyMap && Object.prototype.hasOwnProperty.call(this._buttonKeyMap, key)) {
        return this._activateButtonAction(this._buttonKeyMap[key]);
    }
    if (this._buttonHotspotTokens && Object.prototype.hasOwnProperty.call(this._buttonHotspotTokens, key)) {
        return this._activateButtonAction(this._buttonHotspotTokens[key]);
    }
    return false;
};

MRC.prototype._requestHelp = function () {
    this.service.executeCommand('help');
};

MRC.prototype._requestExit = function () {
    if (this._exiting) return;
    this._exiting = true;
    this.service.disconnect();
    if (this.running) this.exit();
};

MRC.prototype._renderHeader = function () {
    if (!this.headerFrame) return;
    var attr = this.headerFrame.attr || this.paletteAttr('CHAT_HEADER', BG_BLUE | WHITE);
    this.headerFrame.attr = attr;
    this.headerFrame.clear(attr);
    var text = 'MRC';
    if (this._room) text += ' #' + this._room;
    if (this._topic) text += ' - ' + this._topic;
    this.headerFrame.gotoxy(1, 1);
    this.headerFrame.putmsg(text.substr(0, this.headerFrame.width), attr);
    this.headerFrame.cycle();
};

MRC.prototype._renderFooter = function () {
    if (!this.footerFrame) return;
    var attr = this.footerFrame.attr || this.paletteAttr('CHAT_INPUT', BG_BLUE | WHITE);
    this.footerFrame.attr = attr;
    this.footerFrame.clear(attr);
    var status = convertStatus(this._stats, this._latency);
    var flags = '[Toasts ' + (this._toastEnabled ? 'On' : 'Off') + '] [Nicks ' + (this._showNickList ? 'Shown' : 'Hidden') + ']';
    var width = this.footerFrame.width;
    this.footerFrame.gotoxy(1, 1);
    this.footerFrame.putmsg((status + ' ' + flags).substr(0, width), attr);
    var inputLine = '> ' + this._inputBuffer;
    var available = Math.max(1, width);
    var trimmed = inputLine;
    if (inputLine.length > available) {
        trimmed = inputLine.substr(inputLine.length - available);
    }
    this.footerFrame.gotoxy(1, Math.max(1, this.footerFrame.height));
    this.footerFrame.putmsg(trimmed, attr);
    this.footerFrame.cycle();
};

MRC.prototype._refreshFooterInput = function () {
    if (!this.footerFrame) return;
    var attr = this.footerFrame.attr || this.paletteAttr('CHAT_INPUT', BG_BLUE | WHITE);
    if (typeof this.footerFrame.attr !== 'number' || this.footerFrame.attr !== attr) {
        this.footerFrame.attr = attr;
    }
    var width = this.footerFrame.width;
    var inputLine = '> ' + this._inputBuffer;
    var available = Math.max(1, width);
    var trimmed = inputLine;
    if (inputLine.length > available) {
        trimmed = inputLine.substr(inputLine.length - available);
    }
    var spaces = '';
    if (trimmed.length < available) spaces = new Array(available - trimmed.length + 1).join(' ');
    try {
        this.footerFrame.gotoxy(1, Math.max(1, this.footerFrame.height));
        this.footerFrame.putmsg(trimmed + spaces, attr);
        this.footerFrame.cycle();
    } catch (_) { }
};

MRC.prototype._renderMessages = function () {
    if (!this.messagesFrame) return;
    var width = Math.max(1, this.messagesFrame.width);
    var wrappedLines = this._getWrappedMessageLines(width);
    var attr = this.messagesFrame.attr || this.paletteAttr('CHAT_OUTPUT', BG_BLACK | LIGHTGRAY);
    this.messagesFrame.attr = attr;
    this.messagesFrame.clear(attr);
    var height = this.messagesFrame.height;
    var total = wrappedLines.length;
    if (total <= 0) total = 0;
    var maxOffset = Math.max(0, total - height);
    if (this._scrollOffset > maxOffset) this._scrollOffset = maxOffset;
    var start = Math.max(0, total - height - this._scrollOffset);
    var end = Math.max(0, total - this._scrollOffset);
    var y = 1;
    for (var i = start; i < end; i++) {
        if (y > height) break;
        this.messagesFrame.gotoxy(1, y++);
        this.messagesFrame.putmsg(wrappedLines[i]);
    }
    if (this.messageScroll) this.messageScroll.cycle();
    this.messagesFrame.cycle();
};

MRC.prototype._invalidateWrappedMessageLines = function () {
    this._wrappedLineCache = null;
    this._wrappedLineCacheWidth = 0;
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
    this.controlsFrame.clear(attr);
    if (this.buttonsFrame) {
        var info = '[Ctrl+Q Exit] [F1 Help] [PgUp/PgDn Scroll] [Ctrl+T Toast] [Ctrl+N Nicks]';
        this.controlsFrame.gotoxy(1, 1);
        this.controlsFrame.putmsg(info.substr(0, this.controlsFrame.width), attr);
    }
    this.controlsFrame.cycle();
    if (this.buttonsFrame) {
        this.buttonsFrame.clear(attr);
    }
    this._registerHotspots();
    for (var i = 0; i < this._buttons.length; i++) {
        if (this._buttons[i] && typeof this._buttons[i].render === 'function') {
            try { this._buttons[i].render(); } catch (_) { }
        }
    }
    if (this.buttonsFrame) this.buttonsFrame.cycle();
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
    this._lastRenderTs = nowTs;
};

MRC.prototype.handleKey = function (key) {
    if (key === null || typeof key === 'undefined' || key === '') return true;
    this._lastKeyTs = Date.now();
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
    if (this._processButtonHotspotInput(key)) return true;
    var needsFullRedraw = false;
    switch (key) {
        case KEY_UP:
            this._scrollOffset = Math.min(this._scrollOffset + 1, maxOffset);
            this._userScrolled = this._scrollOffset > 0;
            needsFullRedraw = true;
            break;
        case KEY_DOWN:
            this._scrollOffset = Math.max(0, this._scrollOffset - 1);
            this._userScrolled = this._scrollOffset > 0;
            needsFullRedraw = true;
            break;
        case KEY_PGUP:
            this._scrollOffset = Math.min(this._scrollOffset + page, maxOffset);
            this._userScrolled = this._scrollOffset > 0;
            needsFullRedraw = true;
            break;
        case KEY_PGDN:
            this._scrollOffset = Math.max(0, this._scrollOffset - page);
            this._userScrolled = this._scrollOffset > 0;
            needsFullRedraw = true;
            break;
        case KEY_HOME:
            this._scrollOffset = maxOffset;
            this._userScrolled = this._scrollOffset > 0;
            needsFullRedraw = true;
            break;
        case KEY_END:
            this._scrollOffset = 0;
            this._userScrolled = false;
            needsFullRedraw = true;
            break;
        case KEY_LEFT:
            this.service.rotateMsgColor(-1);
            needsFullRedraw = true;
            break;
        case KEY_RIGHT:
            this.service.rotateMsgColor(1);
            needsFullRedraw = true;
            break;
        case '\r':
        case '\n':
            this.service.sendLine(this._inputBuffer);
            this._inputBuffer = '';
            this._scrollOffset = 0;
            this._userScrolled = false;
            this._refreshFooterInput();
            needsFullRedraw = true;
            break;
        case '\b':
        case '\x7F':
            if (this._inputBuffer.length) {
                this._inputBuffer = this._inputBuffer.slice(0, -1);
                this.service.pauseTypingFor(1000);
                this._refreshFooterInput();
            }
            break;
        case '\t':
            this._autoComplete();
            this._refreshFooterInput();
            break;
        case KEY_F1:
            this._requestHelp();
            needsFullRedraw = true;
            break;
        case '\x11': // Ctrl+Q
            this._requestExit();
            needsFullRedraw = true;
            break;
        case '\x14': // Ctrl+T
            this.service.setToastEnabled(!this._toastEnabled);
            needsFullRedraw = true;
            break;
        case '\x0E': // Ctrl+N
            this.service.setNickListVisible(!this._showNickList);
            needsFullRedraw = true;
            break;
        default:
            if (typeof key === 'string' && key.length === 1 && key >= ' ') {
                this._inputBuffer += key;
                this.service.pauseTypingFor(1000);
                this._refreshFooterInput();
            }
            break;
    }
    if (needsFullRedraw) {
        this._needsRedraw = true;
        if (this.running) this.draw();
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
};

MRC.prototype.cleanup = function () {
    if (this._throttlePending && typeof this._throttlePending === 'object') {
        try { this._throttlePending.abort = true; } catch (_) { }
    }
    this._throttlePending = null;
    this._lastRenderTs = 0;
    this.service.removeListener(this);
    this._destroyButtons();
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
