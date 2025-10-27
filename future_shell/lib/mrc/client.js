// MRC Client: Thin wrapper around MRC_Session
// Normalizes events to a minimal interface and hides session implementation details

load('future_shell/lib/mrc/session.js');

/**
 * MrcClient - Wraps MRC_Session and emits normalized events
 * @param {object} opts - { host, port, user, pass, alias }
 */
function MrcClient(opts) {
    opts = opts || {};
    this.host = opts.host || 'localhost';
    this.port = opts.port || 5000;
    this.user = opts.user || '';
    this.pass = opts.pass || '';
    this.alias = opts.alias || this.user;

    this.session = null;
    this.listeners = {};
    this.connected = false;
    this._lastPing = 0;
    this._outputQueue = [];
}

/**
 * Connect to MRC server
 */
MrcClient.prototype.connect = function () {
    if (this.session) {
        this._debugLog('Already have session; disconnecting before reconnect');
        this.disconnect();
    }

    this._debugLog('Creating MRC_Session:', this.host, this.port, this.user);
    this.session = new MRC_Session(this.host, this.port, this.user, this.pass, this.alias);

    this._bindSessionEvents();

    try {
        this.session.connect();
        this.connected = true;
        this._emit('connect', { host: this.host, port: this.port });
    } catch (err) {
        this._debugLog('Connection error:', err);
        this._emit('error', { error: String(err) });
        this.connected = false;
    }
};

/**
 * Disconnect from server
 */
MrcClient.prototype.disconnect = function () {
    this.connected = false;
    if (this.session && typeof this.session.disconnect === 'function') {
        try {
            this.session.disconnect();
        } catch (_) { }
    }
    this.session = null;
    this._emit('disconnect', {});
};

/**
 * Cycle the session (polls socket, sends queued messages)
 * Called by controller.tick()
 */
MrcClient.prototype.cycle = function () {
    if (!this.session) return;

    try {
        this.session.cycle();
    } catch (err) {
        this._debugLog('Cycle error:', err);
    }
};

/**
 * Send a room message
 */
MrcClient.prototype.sendRoomMessage = function (text) {
    if (!this.session || !this.connected) return false;
    try {
        this.session.send_room_message(text);
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Send a private message
 */
MrcClient.prototype.sendPrivateMessage = function (nick, text) {
    if (!this.session || !this.connected) return false;
    try {
        this.session.send_private_messsage(nick, text);
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Send a command to the server
 */
MrcClient.prototype.sendCommand = function (cmdLine) {
    if (!this.session || !this.connected) return false;
    try {
        this.session.send_command(cmdLine);
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Join a room
 */
MrcClient.prototype.joinRoom = function (room) {
    if (!this.session || !this.connected) return false;
    try {
        this.session.join(room);
        return true;
    } catch (_) {
        return false;
    }
};

/**
 * Get current room name
 */
MrcClient.prototype.getCurrentRoom = function () {
    return (this.session && this.session.room) ? this.session.room : '';
};

/**
 * Get session stats
 */
MrcClient.prototype.getStats = function () {
    return (this.session && this.session.stats) ? this.session.stats : ['-', '-', '-', '0'];
};

/**
 * Get latency
 */
MrcClient.prototype.getLatency = function () {
    return (this.session && this.session.latency) ? this.session.latency : '-';
};

/**
 * Bind session events to normalized client events
 */
MrcClient.prototype._bindSessionEvents = function () {
    var self = this;

    this.session.on('message', function (msg) {
        self._emit('message', msg);
    });

    this.session.on('banner', function (text) {
        self._emit('banner', { text: text });
    });

    this.session.on('nicks', function (room, nicks) {
        self._emit('nicks', { room: room, nicks: nicks });
    });

    this.session.on('topic', function (room, topic) {
        self._emit('topic', { room: room, topic: topic });
    });

    this.session.on('stats', function () {
        self._emit('stats', { stats: self.session.stats });
    });

    this.session.on('latency', function () {
        self._emit('latency', { ms: self.session.latency });
    });

    this.session.on('sent_privmsg', function (target, body) {
        self._emit('sent_privmsg', { target: target, body: body });
    });

    this.session.on('ctcp-msg', function (msg) {
        self._emit('ctcp', { msg: msg });
    });

    this.session.on('local_help', function (helpText) {
        self._emit('banner', { text: helpText });
    });

    this.session.on('disconnect', function () {
        self.connected = false;
        self._emit('disconnect', {});
    });

    this.session.on('error', function (err) {
        self._emit('error', { error: String(err) });
    });
};

/**
 * Register event listener
 */
MrcClient.prototype.on = function (event, callback) {
    if (!this.listeners[event]) {
        this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
};

/**
 * Emit event to listeners
 */
MrcClient.prototype._emit = function (event, data) {
    this._debugLog('Event:', event, data);
    if (!this.listeners[event]) return;

    for (var i = 0; i < this.listeners[event].length; i++) {
        try {
            this.listeners[event][i](data);
        } catch (err) {
            this._debugLog('Listener error:', err);
        }
    }
};

MrcClient.prototype._debugLog = function () {
    if (typeof global !== 'undefined' && global.__MRC_CLIENT_DEBUG__) {
        var args = Array.prototype.slice.call(arguments);
        try {
            if (typeof log === 'function') {
                log(LOG_DEBUG, '[MrcClient] ' + args.join(' '));
            }
        } catch (_) { }
    }
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ MrcClient: MrcClient });
}
