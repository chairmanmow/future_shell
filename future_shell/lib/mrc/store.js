// MRC Store: Pure state container with reducer-like apply(action) logic
"use strict";
// No side-effects; mutations only via actions; exposes snapshot() and isDirty()

load('future_shell/lib/mrc/actions.js');

/**
 * MrcStore - Immutable state container
 * @param {object} initialState - Optional initial state override
 */
function MrcStore(initialState) {
    this._state = initialState || this._createDefaultState();
    this._dirty = false;
    this._messageSeq = 0;
}

MrcStore.prototype._createDefaultState = function () {
    return {
        connection: {
            status: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
            errorMsg: '',
            connectedSince: null
        },
        room: {
            name: '',
            topic: '',
            users: [], // [ { nick, color, idle, flags } ]
            joinState: 'idle' // 'idle' | 'joining' | 'joined' | 'failed'
        },
        messages: [], // [ { id, ts, nick, text, kind, mention, backlog } ]
        stats: {
            uptime: '-',
            userCount: '-',
            roomCount: '-',
            sites: '0'
        },
        latency: {
            lastMs: '-',
            avgMs: '-',
            samples: []
        },
        prefs: {
            autoJoinRoom: 'futureland',
            maxMessages: 400,
            showJoins: false,
            highlightSelf: true,
            toastEnabled: true,
            showNickList: true,
            msgColor: 7,
            twitList: []
        },
        backlog: {
            loading: false,
            appliedCount: 0
        }
    };
};

/**
 * Apply an action to mutate state
 * @param {object} action - { type, payload, ts }
 */
MrcStore.prototype.apply = function (action) {
    if (!action || !action.type) {
        this._debugLog('Invalid action (missing type):', action);
        return;
    }

    var type = action.type;
    var payload = action.payload || {};

    this._debugLog('Applying action:', type, payload);

    switch (type) {
        // Connection
        case ACTION_CONNECTING:
            this._state.connection.status = 'connecting';
            this._state.connection.errorMsg = '';
            this._markDirty();
            break;
        case ACTION_CONNECTED:
            this._state.connection.status = 'connected';
            this._state.connection.connectedSince = Date.now();
            this._state.connection.errorMsg = '';
            this._markDirty();
            break;
        case ACTION_DISCONNECTED:
            this._state.connection.status = 'disconnected';
            this._state.connection.connectedSince = null;
            this._state.room.joinState = 'idle';
            this._markDirty();
            break;
        case ACTION_CONNECTION_ERROR:
            this._state.connection.status = 'error';
            this._state.connection.errorMsg = payload.error || 'Unknown error';
            this._markDirty();
            break;

        // Room
        case ACTION_ROOM_JOIN_REQUEST:
            this._state.room.joinState = 'joining';
            this._state.room.name = payload.room || '';
            this._markDirty();
            break;
        case ACTION_ROOM_JOIN_SUCCESS:
            this._state.room.joinState = 'joined';
            this._state.room.name = payload.room || this._state.room.name;
            this._state.room.topic = payload.topic || '';
            if (Array.isArray(payload.nicks)) {
                this._state.room.users = this._buildUserList(payload.nicks);
            }
            this._markDirty();
            break;
        case ACTION_ROOM_JOIN_FAIL:
            this._state.room.joinState = 'failed';
            this._markDirty();
            break;

        // Messages
        case ACTION_MESSAGE_RECEIVED:
            this._addMessage({
                id: ++this._messageSeq,
                ts: payload.epoch || Date.now(),
                nick: payload.from || 'System',
                text: payload.body || payload.text || '',
                plain: payload.plain || '',
                display: payload.display || '',
                wrapColor: payload.wrapColor || '',
                kind: payload.system ? 'system' : 'chat',
                mention: payload.mention || false,
                backlog: payload.backlog || false,
                presence: payload.presence || false
            });
            this._markDirty();
            break;
        case ACTION_SYSTEM_MESSAGE:
            this._addMessage({
                id: ++this._messageSeq,
                ts: Date.now(),
                nick: 'System',
                text: payload.text || '',
                plain: payload.text || '',
                display: payload.text || '',
                wrapColor: '',
                kind: 'system',
                mention: false,
                backlog: false,
                presence: false
            });
            this._markDirty();
            break;

        // Roster
        case ACTION_NICKLIST_UPDATED:
            if (payload.room && this._state.room.name &&
                payload.room.toLowerCase() === this._state.room.name.toLowerCase()) {
                this._state.room.users = this._buildUserList(payload.nicks || []);
                this._markDirty();
            }
            break;

        // Metadata
        case ACTION_TOPIC_UPDATED:
            if (payload.room && this._state.room.name &&
                payload.room.toLowerCase() === this._state.room.name.toLowerCase()) {
                this._state.room.topic = payload.topic || '';
                this._markDirty();
            }
            break;
        case ACTION_STATS_UPDATED:
            if (Array.isArray(payload.stats)) {
                this._state.stats.uptime = payload.stats[0] || '-';
                this._state.stats.userCount = payload.stats[1] || '-';
                this._state.stats.roomCount = payload.stats[2] || '-';
                this._state.stats.sites = payload.stats[3] || '0';
            }
            this._markDirty();
            break;
        case ACTION_LATENCY_UPDATED:
            var ms = payload.ms;
            this._state.latency.lastMs = ms;
            if (typeof ms === 'number' && ms > 0) {
                this._state.latency.samples.push(ms);
                if (this._state.latency.samples.length > 10) {
                    this._state.latency.samples.shift();
                }
                var sum = 0;
                for (var i = 0; i < this._state.latency.samples.length; i++) {
                    sum += this._state.latency.samples[i];
                }
                this._state.latency.avgMs = Math.round(sum / this._state.latency.samples.length);
            } else {
                this._state.latency.avgMs = ms;
            }
            this._markDirty();
            break;

        // Preferences
        case ACTION_PREF_CHANGED:
            if (payload.key && this._state.prefs.hasOwnProperty(payload.key)) {
                this._state.prefs[payload.key] = payload.value;
                this._markDirty();
            }
            break;

        // Backlog
        case ACTION_BACKLOG_LOAD_START:
            this._state.backlog.loading = true;
            this._state.backlog.appliedCount = 0;
            this._markDirty();
            break;
        case ACTION_BACKLOG_ITEM:
            this._addMessage({
                id: ++this._messageSeq,
                ts: payload.epoch || payload.ts || Date.now(),
                nick: payload.from || payload.nick || 'System',
                text: payload.body || payload.text || '',
                plain: payload.plain || '',
                display: payload.display || '',
                wrapColor: payload.wrapColor || '',
                kind: payload.system ? 'system' : 'chat',
                mention: false,
                backlog: true,
                presence: payload.presence || false
            });
            this._state.backlog.appliedCount++;
            this._markDirty();
            break;
        case ACTION_BACKLOG_LOAD_COMPLETE:
            this._state.backlog.loading = false;
            this._markDirty();
            break;

        // UI control
        case ACTION_MARK_DIRTY:
            this._markDirty();
            break;
        case ACTION_CLEAR_DIRTY:
            this._dirty = false;
            break;

        default:
            this._debugLog('Unknown action type:', type);
            break;
    }
};

MrcStore.prototype._addMessage = function (msg) {
    this._state.messages.push(msg);
    var max = this._state.prefs.maxMessages || 400;
    if (this._state.messages.length > max) {
        this._state.messages = this._state.messages.slice(this._state.messages.length - max);
    }
};

MrcStore.prototype._buildUserList = function (nicks) {
    var users = [];
    for (var i = 0; i < nicks.length; i++) {
        users.push({
            nick: nicks[i],
            color: (i % 12) + 1, // simple color cycling
            idle: 0,
            flags: ''
        });
    }
    return users;
};

MrcStore.prototype._markDirty = function () {
    this._dirty = true;
};

/**
 * Returns true if state has changed since last clearDirty()
 */
MrcStore.prototype.isDirty = function () {
    return this._dirty;
};

/**
 * Clear the dirty flag (call after rendering)
 */
MrcStore.prototype.clearDirty = function () {
    this._dirty = false;
};

/**
 * Get immutable snapshot of current state
 */
MrcStore.prototype.snapshot = function () {
    return JSON.parse(JSON.stringify(this._state));
};

/**
 * Get specific state slice (avoids full deep clone)
 */
MrcStore.prototype.getConnection = function () {
    return this._state.connection;
};

MrcStore.prototype.getRoom = function () {
    return this._state.room;
};

MrcStore.prototype.getMessages = function () {
    return this._state.messages;
};

MrcStore.prototype.getStats = function () {
    return this._state.stats;
};

MrcStore.prototype.getLatency = function () {
    return this._state.latency;
};

MrcStore.prototype.getPrefs = function () {
    return this._state.prefs;
};

MrcStore.prototype.getBacklog = function () {
    return this._state.backlog;
};

MrcStore.prototype._debugLog = function () {
    if (typeof global !== 'undefined' && global.__MRC_STORE_DEBUG__) {
        var args = Array.prototype.slice.call(arguments);
        try {
            if (typeof log === 'function') {
                log(LOG_DEBUG, '[MrcStore] ' + args.join(' '));
            }
        } catch (_) { }
    }
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ MrcStore: MrcStore });
}
