// MRC Controller: Orchestrates client, store, and persistence
// Translates client events → store actions; exposes command API to view

load('future_shell/lib/mrc/client.js');
load('future_shell/lib/mrc/store.js');
load('future_shell/lib/mrc/actions.js');

/**
 * MrcController - Main service layer
 * @param {object} opts - { host, port, user, pass, alias, nodeId }
 */
function MrcController(opts) {
    opts = opts || {};

    this.nodeId = opts.nodeId || (typeof bbs !== 'undefined' && bbs.node_num) || 1;
    this.host = opts.host || 'localhost';
    this.port = opts.port || 5000;
    this.user = opts.user || (typeof user !== 'undefined' ? user.alias : '');
    this.pass = opts.pass || (typeof user !== 'undefined' ? user.security.password : '');
    this.alias = opts.alias || this.user;
    this.defaultRoom = opts.room || 'futureland';
    this.shell = opts.shell || null;

    this.store = new MrcStore();
    this.client = new MrcClient({
        host: this.host,
        port: this.port,
        user: this.user,
        pass: this.pass,
        alias: this.alias
    });

    this.listeners = [];
    this._lastCycle = 0;
    this._cycleInterval = 50; // ms between cycles
    this._connected = false;

    this._bindClientEvents();
    this._debugLog('Controller initialized for node:', this.nodeId);
}

/**
 * Connect to MRC server
 */
MrcController.prototype.connect = function () {
    this._debugLog('Connecting...');
    this.store.apply(connecting());
    this.client.connect();
};

/**
 * Disconnect from server
 */
MrcController.prototype.disconnect = function () {
    this._debugLog('Disconnecting...');
    this.client.disconnect();
    this.store.apply(disconnected('User initiated disconnect'));
};

/**
 * Tick handler (called by shell cycle)
 */
MrcController.prototype.tick = function () {
    var now = Date.now();
    if (now - this._lastCycle < this._cycleInterval) return;
    this._lastCycle = now;

    // Always cycle the client to process socket events, even during connection
    this.client.cycle();

    // Notify listeners if state changed
    if (this.store.isDirty()) {
        this._notifyListenersSnapshot();
        this.store.clearDirty();
    }
};

/**
 * Command API: Join a room
 */
MrcController.prototype.joinRoom = function (room) {
    if (!room || !room.length) return false;

    var cleanRoom = String(room).replace(/^#/, '').trim();
    if (!cleanRoom.length) return false;

    this._debugLog('Joining room:', cleanRoom);

    try {
        if (typeof log === 'function') {
            log(LOG_INFO, '[mrc-controller] joinRoom called with: "' + room + '" -> cleaned: "' + cleanRoom + '"');
        }
    } catch (_) { }

    this.store.apply(roomJoinRequest(cleanRoom));

    var success = this.client.joinRoom(cleanRoom);
    if (!success) {
        this.store.apply(roomJoinFail(cleanRoom, 'Client join failed'));
    }
    return success;
};

/**
 * Command API: Send message to current room
 */
MrcController.prototype.sendMessage = function (text) {
    if (!text || !text.length) return false;

    var currentRoom = this.client.getCurrentRoom();
    if (!currentRoom) {
        this._debugLog('Cannot send message: not in a room');
        return false;
    }

    return this.client.sendRoomMessage(text);
};

/**
 * Command API: Send private message
 */
MrcController.prototype.sendPrivateMessage = function (nick, text) {
    if (!nick || !text) return false;
    return this.client.sendPrivateMessage(nick, text);
};

/**
 * Command API: Execute server command
 */
/**
 * Command API: Execute a command (e.g., "join #channel", "help", etc.)
 */
MrcController.prototype.executeCommand = function (cmdLine) {
    if (!cmdLine || !cmdLine.length) return false;

    var parts = String(cmdLine).split(' ');
    var command = parts.shift().toLowerCase();
    var rest = parts.join(' ');

    // Handle built-in commands
    if (command === 'toggle_toast') {
        this.toggleToast();
        return true;
    }

    if (command === 'toggle_nicks') {
        this.toggleNickList();
        return true;
    }

    // Handle 'join' command specially
    if (command === 'join') {
        var room = rest.trim();
        if (room) {
            return this.joinRoom(room);
        }
        return false;
    }

    // Check if it's a session method (help, motd, who, etc.)
    if (this.client.session && typeof this.client.session[command] === 'function') {
        try {
            this.client.session[command].call(this.client.session, rest);
            return true;
        } catch (err) {
            this._debugLog('Command execution error:', command, err);
            return false;
        }
    }

    // Otherwise send raw command to server
    return this.client.sendCommand(cmdLine);
};

/**
 * Command API: Set preference
 */
MrcController.prototype.setPreference = function (key, value) {
    this.store.apply(prefChanged(key, value));
    this._notifyListeners('preference', { key: key, value: value });
};

/**
 * Command API: Toggle toast
 */
MrcController.prototype.toggleToast = function () {
    var prefs = this.store.getPrefs();
    var newValue = !prefs.toastEnabled;
    this.setPreference('toastEnabled', newValue);
    this.store.apply(systemMessage('Toast notifications ' + (newValue ? 'enabled' : 'disabled')));
};

/**
 * Command API: Toggle nicklist
 */
MrcController.prototype.toggleNickList = function () {
    var prefs = this.store.getPrefs();
    var newValue = !prefs.showNickList;
    this.setPreference('showNickList', newValue);
    this.store.apply(systemMessage('Nick list ' + (newValue ? 'shown' : 'hidden')));
};

/**
 * Handle external program suspend (user launching XTRN)
 */
MrcController.prototype.handleExternalSuspend = function (info) {
    var programId = (info && info.programId) || '';
    var currentRoom = this.client.getCurrentRoom();

    this._externalSuspendInfo = {
        programId: programId,
        lastSeenTs: Date.now(),
        room: currentRoom || ''
    };

    if (this._connected && currentRoom) {
        this._sendPresenceNotice('left', programId, 0);
    }
};

/**
 * Handle external program resume (user returning from XTRN)
 */
MrcController.prototype.handleExternalResume = function (info) {
    var suspendInfo = this._externalSuspendInfo || {};
    var programId = (info && info.programId) || suspendInfo.programId || '';
    var roomKey = (info && info.room) || suspendInfo.room || this.client.getCurrentRoom() || this.defaultRoom;

    // Ensure we're connected and in a room
    if (!this._connected && this.client) {
        this.connect();
    }

    if (this._connected && roomKey) {
        // Make sure we're in the right room
        var currentRoom = this.client.getCurrentRoom();
        if (!currentRoom || currentRoom.toLowerCase() !== roomKey.toLowerCase()) {
            this.joinRoom(roomKey);
        }

        // Send presence notification
        this._sendPresenceNotice('returned', programId, 0);
    }

    this._externalSuspendInfo = null;
};

/**
 * Send presence notification to room
 */
MrcController.prototype._sendPresenceNotice = function (event, programId, missedCount) {
    if (!this.client || !this._connected) return;

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

    var userName = (typeof user !== 'undefined' && user && user.alias) ? user.alias : 'User';
    var remote = format(brackets + '%s %s |15%s|07%s',
        userName,
        verb,
        programName,
        suffix
    );

    try {
        this.client.sendRoomMessage(remote);
    } catch (err) {
        this._debugLog('Failed to send presence notice:', err);
    }
};

/**
 * Format program name for display
 */
MrcController.prototype._formatProgramName = function (programId) {
    if (!programId || typeof programId !== 'string') return 'external program';
    // Simple formatting: remove underscores, capitalize first letter
    return programId.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
};

/**
 * Get state snapshot
 */
MrcController.prototype.getSnapshot = function () {
    return this.store.snapshot();
};

/**
 * Check if UI needs redraw
 */
MrcController.prototype.isDirty = function () {
    return this.store.isDirty();
};

/**
 * Clear dirty flag (call after rendering)
 */
MrcController.prototype.clearDirty = function () {
    this.store.clearDirty();
};

/**
 * Add listener for controller events
 */
MrcController.prototype.addListener = function (listener) {
    if (this.listeners.indexOf(listener) === -1) {
        this.listeners.push(listener);
    }

    // Send initial snapshot
    if (listener && typeof listener.onSnapshot === 'function') {
        try {
            listener.onSnapshot(this.getSnapshot());
        } catch (err) {
            this._debugLog('Listener onSnapshot error:', err);
        }
    }
};

/**
 * Remove listener
 */
MrcController.prototype.removeListener = function (listener) {
    var idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
        this.listeners.splice(idx, 1);
    }
};

/**
 * Bind client events to store actions
 */
MrcController.prototype._bindClientEvents = function () {
    var self = this;

    this.client.on('connect', function (info) {
        self._debugLog('Client connected');
        self._connected = true;
        self.store.apply(connected(info));
        self._notifyListeners('connected', info);

        // Send startup metadata and join default room
        self._sendStartupMetadata();
    });

    this.client.on('disconnect', function (info) {
        self._debugLog('Client disconnected');
        self._connected = false;
        self.store.apply(disconnected(info.reason || 'Connection closed'));
        self._notifyListeners('disconnected', info);
    });

    this.client.on('error', function (info) {
        self._debugLog('Client error:', info.error);
        self.store.apply(connectionError(info.error));
        self._notifyListeners('error', info);
    });

    this.client.on('message', function (msg) {
        self._handleIncomingMessage(msg);
    });

    this.client.on('banner', function (info) {
        self._handleSystemMessage(info.text);
    });

    this.client.on('nicks', function (info) {
        self._debugLog('Nicklist updated:', info.room, info.nicks.length);

        // Get our current room from the session
        var currentRoom = self.client.getCurrentRoom();
        if (!currentRoom || !info.room) {
            return;
        }

        // Case-insensitive room match
        if (info.room.toLowerCase() !== currentRoom.toLowerCase()) {
            self._debugLog('Ignoring nicklist for different room:', info.room, 'vs', currentRoom);
            return;
        }

        self.store.apply(nicklistUpdated(info.room, info.nicks));

        // If this is for our current room and we're in joining state, mark as joined
        var room = self.store.getRoom();
        if (room.joinState === 'joining') {
            self.store.apply(roomJoinSuccess(info.room, room.topic, info.nicks));
        }
    }); this.client.on('topic', function (info) {
        self._debugLog('Topic updated:', info.room, info.topic);

        // Only process topic for our current room
        var currentRoom = self.client.getCurrentRoom();
        if (!currentRoom || !info.room) {
            return;
        }

        // Case-insensitive room match
        if (info.room.toLowerCase() !== currentRoom.toLowerCase()) {
            self._debugLog('Ignoring topic for different room:', info.room, 'vs', currentRoom);
            return;
        }

        self.store.apply(topicUpdated(info.room, info.topic));
    });

    this.client.on('stats', function (info) {
        self.store.apply(statsUpdated(info.stats));
    });

    this.client.on('latency', function (info) {
        self.store.apply(latencyUpdated(info.ms));
    });

    this.client.on('sent_privmsg', function (info) {
        // Echo private message to store
        self.store.apply(messageReceived({
            from: self.user,
            to: info.target,
            body: info.body,
            plain: info.body,
            display: format('[%s] %s -> %s %s', self._timestamp(), self.user, info.target, info.body),
            system: false,
            mention: false,
            backlog: false
        }));
    });

    this.client.on('ctcp', function (info) {
        self._handleSystemMessage(info.msg);
    });
};

/**
 * Handle system/server messages with formatting
 */
MrcController.prototype._handleSystemMessage = function (text) {
    if (!text) return;

    var ts = this._timestamp();
    var formattedText = this._convertPipeToCtrlA(text);
    var display = format('\x01n\x01h[%s]\x01n \x01c%s\x01n %s',
        ts,
        'System',
        formattedText
    );

    this.store.apply(systemMessage(display));
};

/**
 * Handle incoming messages (filtering, mention detection, etc.)
 */
MrcController.prototype._handleIncomingMessage = function (msg) {
    if (!msg || typeof msg !== 'object') return;

    // Filter SERVER messages for special handling
    if (msg.from_user === 'SERVER') {
        // Already handled by session (banner, topic, nicks, stats)
        // Just log as system message
        this._handleSystemMessage(msg.body || '');
        return;
    }

    // Filter twit list
    var prefs = this.store.getPrefs();
    if (Array.isArray(prefs.twitList) && prefs.twitList.length > 0) {
        var fromLower = (msg.from_user || '').toLowerCase();
        if (prefs.twitList.indexOf(fromLower) >= 0) {
            this._debugLog('Filtered twit:', msg.from_user);
            return;
        }
    }

    // Check for mention
    var plain = this._stripColors(msg.body || '');
    var mention = false;
    if (plain && this.user && msg.from_user &&
        msg.from_user.toLowerCase() !== this.user.toLowerCase()) {
        var userLower = this.user.toLowerCase();
        var plainLower = plain.toLowerCase();
        mention = plainLower.indexOf(userLower) >= 0;
    }

    // Check room match
    var currentRoom = this.client.getCurrentRoom();
    if (msg.to_room && msg.to_room !== '' && currentRoom &&
        msg.to_room.toLowerCase() !== currentRoom.toLowerCase()) {
        this._debugLog('Message for different room:', msg.to_room, 'vs', currentRoom);
        return;
    }

    // Build payload
    var payload = {
        from: msg.from_user || 'System',
        to: msg.to_user || '',
        body: this._convertPipeToCtrlA(msg.body || ''),
        plain: plain,
        display: this._formatDisplay(msg, mention),
        epoch: (typeof msg.ts === 'number') ? msg.ts : Date.now(),
        mention: mention,
        system: false,
        backlog: false
    };

    this.store.apply(messageReceived(payload));

    // Show toast notification for messages from other users
    this._showToastForMessage(payload);
};

/**
 * Show toast notification for incoming message
 */
MrcController.prototype._showToastForMessage = function (payload) {
    if (!this.shell || typeof this.shell.showToast !== 'function') return;
    if (!payload || payload.backlog || payload.system) return;

    // Don't show toast if user is already in MRC subprogram
    if (this.shell.activeSubprogram && this.shell.activeSubprogram.name === 'mrc') return;

    // Don't show toast for our own messages
    if (payload.from && this.user && payload.from.toLowerCase() === this.user.toLowerCase()) return;

    // Check if toasts are enabled in preferences
    var prefs = this.store.getPrefs();
    if (prefs.toastEnabled === false) return;

    // Filter out presence/system messages
    if (payload.presence) return;
    if (payload.plain && payload.plain.indexOf('[FSXTRN]') !== -1) return;

    var self = this;
    this.shell.showToast({
        title: payload.from || 'MRC',
        message: (payload.from || 'MRC') + ': ' + (payload.plain || '').substr(0, 120),
        launch: 'mrc',
        category: 'mrc-chat',
        sender: payload.from || 'MRC',
        programIcon: 'mrc',
        timeout: 8000
    });
};

MrcController.prototype._formatDisplay = function (msg, mention) {
    // Format with colors: [HH:MM:SS] ! fromUser: body
    // Use Ctrl-A codes for color formatting
    var ts = this._timestamp();
    var mentionPrefix = mention ? '\x01h\x01r! ' : '';
    var fromUser = this._convertPipeToCtrlA(msg.from_user || 'System');
    var body = this._convertPipeToCtrlA(msg.body || '');

    return format('\x01n\x01h[%s]\x01n %s%s\x01n%s',
        ts,
        mentionPrefix,
        fromUser,
        ': ' + body
    );
};

MrcController.prototype._timestamp = function () {
    var d = new Date();
    return format('%02d:%02d:%02d', d.getHours(), d.getMinutes(), d.getSeconds());
};

MrcController.prototype._stripColors = function (text) {
    if (!text) return '';
    var out = String(text);
    out = out.replace(/\|[0-9]{2}/g, '');
    out = out.replace(/\x01./g, '');
    return out;
};

/**
 * Convert pipe codes (|XX) to Ctrl-A codes (\x01X)
 */
MrcController.prototype._convertPipeToCtrlA = function (text) {
    if (!text) return '';

    // Use pipeToCtrlA if available (from sbbsdefs.js)
    if (typeof pipeToCtrlA === 'function') {
        return pipeToCtrlA(text);
    }

    // Fallback: manual conversion
    return String(text).replace(/\|([0-9]{2})/g, function (match, code) {
        var num = parseInt(code, 10);
        if (isNaN(num) || num < 0 || num > 15) return match;
        return '\x01' + String.fromCharCode(48 + num); // 48 = '0'
    });
};

/**
 * Send startup metadata to server
 */
MrcController.prototype._sendStartupMetadata = function () {
    var self = this;
    function safe(fn) {
        try {
            fn();
        } catch (err) {
            self._debugLog('Startup command error:', err);
        }
        if (typeof mswait === 'function') {
            mswait(20);
        }
    }

    // Send arrival notification
    if (typeof user !== 'undefined' && user && user.alias) {
        safe(function () {
            self.client.sendCommand('NOTME |07- |11' + user.alias + ' |03has arrived.');
        });
    }

    // Send terminal size
    if (typeof console !== 'undefined' && console) {
        safe(function () {
            self.client.sendCommand('TERMSIZE:' + console.screen_columns + 'x' + console.screen_rows);
        });
    }

    // Send BBS metadata
    if (typeof user !== 'undefined' && user && typeof system !== 'undefined' && system) {
        safe(function () {
            self.client.sendCommand('BBSMETA: SecLevel(' + user.security.level + ') SysOp(' + system.operator + ')');
        });
    }

    // Send user IP
    if (typeof bbs !== 'undefined' && bbs && typeof client !== 'undefined' && client) {
        var ip = '127.0.0.1';
        try {
            var atcodeIp = bbs.atcode('IP');
            ip = (atcodeIp === '127.0.0.1') ? client.ip_address : atcodeIp;
        } catch (_) { }
        safe(function () {
            self.client.sendCommand('USERIP:' + ip);
        });
    }

    // Join configured default room - this sets state.room and requests USERLIST
    safe(function () {
        try {
            if (typeof log === 'function') {
                log(LOG_INFO, '[mrc-controller] Joining default room: ' + self.defaultRoom);
            }
        } catch (_) { }
        self.joinRoom(self.defaultRoom);
    });

    // Get MOTD
    safe(function () {
        self.client.sendCommand('MOTD');
    });
};/**
 * Notify listeners of events
 */
MrcController.prototype._notifyListeners = function (event, data) {
    for (var i = 0; i < this.listeners.length; i++) {
        var listener = this.listeners[i];
        var method = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        if (listener && typeof listener[method] === 'function') {
            try {
                listener[method](data);
            } catch (err) {
                this._debugLog('Listener error:', method, err);
            }
        }
    }
};

/**
 * Notify all listeners with current snapshot
 */
MrcController.prototype._notifyListenersSnapshot = function () {
    var snapshot = this.getSnapshot();
    for (var i = 0; i < this.listeners.length; i++) {
        var listener = this.listeners[i];

        // Try onSnapshot method (for object listeners)
        if (listener && typeof listener.onSnapshot === 'function') {
            try {
                listener.onSnapshot(snapshot);
            } catch (err) {
                this._debugLog('Listener onSnapshot error:', err);
            }
        }
        // Try calling as function (for function listeners)
        else if (typeof listener === 'function') {
            try {
                listener(snapshot);
            } catch (err) {
                this._debugLog('Listener function error:', err);
            }
        }
    }
};

MrcController.prototype._debugLog = function () {
    if (typeof global !== 'undefined' && global.__MRC_CONTROLLER_DEBUG__) {
        var args = Array.prototype.slice.call(arguments);
        try {
            if (typeof log === 'function') {
                log(LOG_DEBUG, '[MrcController] ' + args.join(' '));
            }
        } catch (_) { }
    }
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ MrcController: MrcController });
}
