"use strict";

load("future_shell/lib/subprograms/chat_helpers.js");
load("future_shell/lib/subprograms/subprogram.js"); // Base class
load('future_shell/lib/subprograms/subprogram_hotspots.js');
load('future_shell/lib/util/layout/button.js');
load('future_shell/lib/util/layout/modal.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

function Chat(jsonchat, opts) {
    opts = opts || {};
    Subprogram.call(this, {
        name: 'chat',
        parentFrame: opts.parentFrame,
        shell: opts.shell,
        timer: opts.timer
    });
    this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'chat', layerName: 'chat-controls', priority: 70 });
    this.jsonchat = jsonchat; // persistent backend instance
    this.input = "";
    this._inputCursor = 0;      // cursor position in input string
    this._inputScrollOffset = 0; // horizontal scroll offset for display
    this.running = false;
    this.channel = "main";
    this.headerFrame = null;
    this.chatOutputFrame = null;
    this.chatInputFrame = null;
    this.chatControlsFrame = null;
    this.leftAvatarFrame = null;
    this.leftMsgFrame = null;
    this.rightMsgFrame = null;
    this.rightAvatarFrame = null;
    this.messageFrames = [];
    this._controlButtons = [];
    this._controlButtonHotkeyMap = {};
    this._hotspotActionMap = {};
    this._hotspotBuffer = '';
    this._hotspotTokenSeq = 0;
    this._activeRosterModal = null;
    this.done = null;
    this.lastSender = null; // State tracking for last sender
    this.lastRow = 0; // State tracking for last rendered row
    this.avatarWidth = 10;
    this.avatarHeight = 6;
    this._needsRedraw = false;
    this._lastMessageSignature = null;
    this._lastRenderedSide = 'right';
    this.timer = null;
    this.scrollOffset = 0;
    this._maxScrollOffset = 0;
    this._userScrolled = false;
    this._totalLineCount = 0;
    this._statusText = '';
    this._lastStatusUpdateTs = 0;
    this._statusRefreshIntervalMs = 5000;
    this._lastKeyTs = 0;
    this._lastInputRendered = '';
    this._redrawThrottleMs = 250;
    this._expectedHeaderAttr = null;
    this._lastHeaderAttrLog = null;
    this._frameMetrics = null;
    this._controlHotspotsDirty = true;
    this._messageIndicatorColor = CYAN;
    this._wrapIndicatorColor = BLUE;
    this._timestampColor = LIGHTBLUE;
    this._lastRenderTs = 0;
    this._pendingMessage = null;
    // Bitmap art carousel state
    this._bitmapQueue = [];         // Array of { width, height, fromName, bitmap, time }
    this._bitmapMaxHistory = 20;    // Keep last N bitmaps
    this._bitmapModalActive = null; // Active bitmap modal
    this._bitmapViewIndex = 0;      // Current carousel index
    this._newBitmapCount = 0;       // Unviewed bitmap count
    this._imgButtonFlashState = false; // Flash toggle state for /img button
    this._imgButtonFlashTs = 0;     // Last flash toggle timestamp
    this._processedBitmapKeys = {}; // Track processed bitmap msg keys to prevent duplicates
    this._bitmapViewerActive = false; // Whether bitmap viewer frame is open
    this._bitmapViewerFrame = null;   // Frame reference for viewer
    this._bitmapScrollX = 0;          // Horizontal scroll offset
    this._bitmapScrollY = 0;          // Vertical scroll offset
    this._bitmapViewW = 0;            // Viewport width
    this._bitmapViewH = 0;            // Viewport height
    this._bitmap256Color = true;      // Use 256-color mode (false = 16-color downsampled)
    this._lastBitmapRedrawTs = 0;     // Throttle timestamp for bitmap redraws
    // Configurable group line color and pad character
    this.groupLineColor = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_GROUP_LINE) ? ICSH_VALS.CHAT_GROUP_LINE : MAGENTA;
    this._lastPrivateSenderNick = null;
    this._jsonchatOriginalUpdate = null;
    this._privateMailboxHookInstalled = false;
    // Shared avatar library resolution (reuse singleton to avoid duplicate loads / class mismatch)
    this._avatarLib = (function () {
        try {
            if (typeof bbs !== 'undefined') {
                if (!bbs.mods) bbs.mods = {};
                if (bbs.mods.avatar_lib) return bbs.mods.avatar_lib;
            }
        } catch (_) { }
        function attempt(path, key) {
            try {
                var lib = (typeof lazyLoadModule === 'function') ? lazyLoadModule(path, { cacheKey: key || path }) : load(path);
                if (lib && (typeof lib.read === 'function' || typeof lib.get === 'function')) {
                    try { if (typeof bbs !== 'undefined') { if (!bbs.mods) bbs.mods = {}; if (!bbs.mods.avatar_lib) bbs.mods.avatar_lib = lib; } } catch (_) { }
                    return lib;
                }
            } catch (e) { try { dbug('[Chat] avatar_lib miss ' + path + ': ' + e, 'chat'); } catch (_) { } }
            return null;
        }
        var candidates = ['avatar_lib.js', '../exec/load/avatar_lib.js', '../../exec/load/avatar_lib.js'];
        for (var i = 0; i < candidates.length; i++) {
            var lib = attempt(candidates[i], 'avatar_lib.chat:' + i);
            if (lib) { try { dbug('[Chat] avatar_lib loaded from ' + candidates[i], 'chat'); } catch (_) { } return lib; }
        }
        try { dbug('[Chat] avatar_lib unavailable after attempts: ' + candidates.join(', '), 'chat'); } catch (_) { }
        return null;
    })();
    if (typeof this.registerColors === 'function') {
        this.registerColors({
            CHAT_HEADER: { BG: BG_BLUE, FG: WHITE },
            CHAT_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_CONTROLS: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_BUTTON: { BG: BG_CYAN, FG: WHITE },
            CHAT_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },
            CHAT_BUTTON_FLASH: { BG: BG_RED, FG: YELLOW },
            CHAT_ROSTER_MODAL_FRAME: { BG: BG_BLUE, FG: WHITE },
            CHAT_ROSTER_MODAL_CONTENT: { BG: BG_BLACK, FG: LIGHTGRAY },
            CHAT_ROSTER_MODAL_TITLE: { BG: BG_BLUE, FG: WHITE },
            CHAT_ROSTER_MODAL_BUTTON: { BG: BG_CYAN, FG: WHITE },
            CHAT_ROSTER_MODAL_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },
            CHAT_INPUT: { BG: BG_BLUE, FG: WHITE }
        }, 'chat');
    }
}

if (typeof extend === 'function') {
    extend(Chat, Subprogram);
} else {
    Chat.prototype = Object.create(Subprogram.prototype);
    Chat.prototype.constructor = Chat;
}

Chat.prototype._resetRuntimeState = function () {
    this._disposeFrames();
    this._needsRedraw = true;
    this._lastMessageSignature = null;
    this._lastRenderTs = 0;
    this._inputCursor = 0;
    this._inputScrollOffset = 0;
    this.scrollOffset = 0;
    this._maxScrollOffset = 0;
    this._userScrolled = false;
    this._totalLineCount = 0;
    this._statusText = '';
    this._lastStatusUpdateTs = 0;
    this._lastKeyTs = 0;
    this._lastInputRendered = '';
    this._pendingMessage = null;
    this.messageFrames = [];
    this._expectedHeaderAttr = null;
    this._lastHeaderAttrLog = null;
    this._frameMetrics = null;
    this._controlHotspotsDirty = true;
};

Chat.prototype._disposeFrames = function () {
    this._destroyControlButtons();
    var frames = [
        'chatControlsFrame',
        'headerFrame',
        'leftAvatarFrame',
        'leftMsgFrame',
        'rightMsgFrame',
        'rightAvatarFrame',
        'chatSpacerFrame',
        'chatOutputFrame',
        'chatInputFrame'
    ];
    for (var i = 0; i < frames.length; i++) {
        var key = frames[i];
        var frame = this[key];
        if (!frame) continue;
        try { frame.close(); } catch (_) { }
        if (this._myFrames) {
            var idx = this._myFrames.indexOf(frame);
            if (idx !== -1) this._myFrames.splice(idx, 1);
        }
        this[key] = null;
    }
    // this.setBackgroundFrame(null);
    this.messageFrames = [];
    this._frameMetrics = null;
    this._controlHotspotsDirty = true;
};

Chat.prototype._ensureFrames = function () {
    var host = (typeof this._ensureHostFrame === 'function') ? this._ensureHostFrame() : (this.parentFrame || null);
    if (!host) return;

    var width = host.width || 0;
    var height = host.height || 0;
    if (width <= 0 || height <= 0) return;

    if (!this._frameMetrics || this._frameMetrics.width !== width || this._frameMetrics.height !== height) {
        this._disposeFrames();
        this._frameMetrics = { width: width, height: height };
    }

    var headerHeight = 1;
    var inputHeight = 1;
    var outputHeight = Math.max(1, height - headerHeight - inputHeight);

    var headerAttr = this.paletteAttr('CHAT_HEADER', host.attr || 0);
    if (!this.headerFrame) {
        this.headerFrame = new Frame(1, 1, width, headerHeight, headerAttr, host);
        if (typeof this.registerFrame === 'function') this.registerFrame(this.headerFrame);
    }
    this.headerFrame.open();
    this.headerFrame.attr = headerAttr;

    var outputAttr = this.paletteAttr('CHAT_OUTPUT', host.attr || 0);
    if (!this.chatOutputFrame) {
        this.chatOutputFrame = new Frame(1, headerHeight + 1, width, outputHeight, outputAttr, host);
        this.chatOutputFrame.transparent = false;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.chatOutputFrame);
    }
    this.chatOutputFrame.open();
    this.chatOutputFrame.transparent = false;
    this.chatOutputFrame.attr = outputAttr;
    // backgroundFrame is chatOutputFrame (for background screensavers that render behind content)
    this.setBackgroundFrame(this.chatOutputFrame);

    var controlsAttr = this.paletteAttr('CHAT_CONTROLS', outputAttr);
    var controlHeight = Math.min(3, Math.max(0, outputHeight - 1));
    if (controlHeight > 0) {
        if (!this.chatControlsFrame || this.chatControlsFrame.height !== controlHeight) {
            if (this.chatControlsFrame) {
                try { this.chatControlsFrame.close(); } catch (_) { }
                if (this._myFrames) {
                    var idxCtrl = this._myFrames.indexOf(this.chatControlsFrame);
                    if (idxCtrl !== -1) this._myFrames.splice(idxCtrl, 1);
                }
            }
            this.chatControlsFrame = new Frame(1, 1, width, controlHeight, controlsAttr, this.chatOutputFrame);
            if (typeof this.registerFrame === 'function') this.registerFrame(this.chatControlsFrame);
        }
        this.chatControlsFrame.transparent = false;
        this.chatControlsFrame.open();
        this.chatControlsFrame.attr = controlsAttr;
    } else if (this.chatControlsFrame) {
        this._destroyControlButtons();
        try { this.chatControlsFrame.close(); } catch (_) { }
        if (this._myFrames) {
            var idxCtrlClose = this._myFrames.indexOf(this.chatControlsFrame);
            if (idxCtrlClose !== -1) this._myFrames.splice(idxCtrlClose, 1);
        }
        this.chatControlsFrame = null;
    }

    var messageStartY = (this.chatControlsFrame ? this.chatControlsFrame.height : 0) + 1;
    var messageHeight = Math.max(1, outputHeight - (this.chatControlsFrame ? this.chatControlsFrame.height : 0));
    var outputWidth = this.chatOutputFrame.width || width;
    var avatarWidth = this.avatarWidth || 10;
    if ((avatarWidth * 2) >= (outputWidth - 4)) avatarWidth = Math.max(2, Math.floor(outputWidth / 4));
    if (avatarWidth < 2) avatarWidth = 2;
    this.avatarWidth = avatarWidth;
    var messageAreaWidth = Math.max(2, outputWidth - (avatarWidth * 2));
    var leftMsgWidth = Math.max(2, Math.floor(messageAreaWidth / 2));
    var rightMsgWidth = Math.max(2, messageAreaWidth - leftMsgWidth);
    var leftAvatarX = 1;
    var rightAvatarX = outputWidth - avatarWidth + 1;
    var leftMsgX = leftAvatarX + avatarWidth;
    var rightMsgX = rightAvatarX - rightMsgWidth;

    if (!this.leftAvatarFrame) {
        this.leftAvatarFrame = new Frame(leftAvatarX, messageStartY, avatarWidth, messageHeight, outputAttr, this.chatOutputFrame);
        this.leftAvatarFrame.transparent = true;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.leftAvatarFrame);
    }
    this.leftAvatarFrame.open();
    this.leftAvatarFrame.attr = outputAttr;
    this.leftAvatarFrame.transparent = true;

    if (!this.leftMsgFrame) {
        this.leftMsgFrame = new Frame(leftMsgX, messageStartY, leftMsgWidth, messageHeight, outputAttr, this.chatOutputFrame);
        this.leftMsgFrame.transparent = true;
        this.leftMsgFrame.word_wrap = true;
        this.leftMsgFrame.h_scroll = false;
        this.leftMsgFrame.v_scroll = false;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.leftMsgFrame);
    }
    this.leftMsgFrame.open();
    this.leftMsgFrame.attr = outputAttr;
    this.leftMsgFrame.transparent = true;

    if (!this.rightMsgFrame) {
        this.rightMsgFrame = new Frame(rightMsgX, messageStartY, rightMsgWidth, messageHeight, outputAttr, this.chatOutputFrame);
        this.rightMsgFrame.transparent = true;
        this.rightMsgFrame.word_wrap = true;
        this.rightMsgFrame.h_scroll = false;
        this.rightMsgFrame.v_scroll = false;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.rightMsgFrame);
    }
    this.rightMsgFrame.open();
    this.rightMsgFrame.attr = outputAttr;
    this.rightMsgFrame.transparent = true;

    if (!this.rightAvatarFrame) {
        this.rightAvatarFrame = new Frame(rightAvatarX, messageStartY, avatarWidth, messageHeight, outputAttr, this.chatOutputFrame);
        this.rightAvatarFrame.transparent = true;
        if (typeof this.registerFrame === 'function') this.registerFrame(this.rightAvatarFrame);
    }
    this.rightAvatarFrame.open();
    this.rightAvatarFrame.attr = outputAttr;
    this.rightAvatarFrame.transparent = true;

    var inputAttr = this.paletteAttr('CHAT_INPUT', this.chatInputFrame ? this.chatInputFrame.attr : (host.attr || 0));
    var inputY = headerHeight + outputHeight + 1;
    if (inputY > height) inputY = height;
    if (!this.chatInputFrame) {
        this.chatInputFrame = new Frame(1, inputY, width, 1, inputAttr, host);
        if (typeof this.registerFrame === 'function') this.registerFrame(this.chatInputFrame);
        this._lastInputRendered = '';
    }
    this.chatInputFrame.open();
    this.chatInputFrame.attr = inputAttr;

    if (!this._controlButtons || !this._controlButtons.length) {
        this._buildControlButtons({
            buttonAttr: this.paletteAttr('CHAT_BUTTON', controlsAttr),
            buttonFocusAttr: this.paletteAttr('CHAT_BUTTON_FOCUS', controlsAttr),
            controlsAttr: controlsAttr
        });
    } else {
        this._renderControlButtons();
        if (this._controlHotspotsDirty) {
            this._registerControlHotspots();
        }
    }
};

Chat.prototype.enter = function (done) {
    this.done = done;
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    this._resetRuntimeState();
    this._frameMetrics = null;
    this._installPrivateMailboxHook();
    if (typeof Subprogram.prototype.enter === 'function') {
        Subprogram.prototype.enter.call(this, done);
    } else {
        this.running = true;
        this._ensureFrames();
        this.draw();
        this._done = (typeof done === 'function') ? done : function () { };
    }
    // Award points for joining chat
    try {
        var shell = (typeof IconShell !== 'undefined' && IconShell._activeInstance) ? IconShell._activeInstance : null;
        if (shell && shell._pointsSystem && typeof shell._pointsSystem.award === 'function') {
            shell._pointsSystem.award('joinedChat');
        }
    } catch (e) { /* ignore */ }
    // Start periodic redraw timer (every minute) using Synchronet Timer
};

Chat.prototype.exit = function () {
    // Stop periodic redraw timer
    // Abort periodic redraw event
    if (this._redrawEvent) {
        this._redrawEvent.abort = true;
        this._redrawEvent = null;
    }
    if (typeof Subprogram.prototype.exit === 'function') {
        Subprogram.prototype.exit.call(this);
    } else {
        this.running = false;
        if (this._done) this._done();
    }
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
};

Chat.prototype.attachShellTimer = function (timer) {
    this.timer = timer || null;
};

Chat.prototype._installPrivateMailboxHook = function () {
    var self = this;
    if (!this.jsonchat || typeof this.jsonchat.update !== 'function') return;
    if (!this._jsonchatOriginalUpdate) {
        this._jsonchatOriginalUpdate = this.jsonchat.update.bind(this.jsonchat);
    }
    this.jsonchat.update = function (packet) {
        if (self._handlePrivateMailboxPacket(packet)) return true;
        return self._jsonchatOriginalUpdate ? self._jsonchatOriginalUpdate(packet) : false;
    };
    this._privateMailboxHookInstalled = true;
};

Chat.prototype._restorePrivateMailboxHook = function () {
    if (!this.jsonchat || !this._privateMailboxHookInstalled || !this._jsonchatOriginalUpdate) return;
    this.jsonchat.update = this._jsonchatOriginalUpdate;
    this._privateMailboxHookInstalled = false;
};

Chat.prototype._normalizePrivateNick = function (nick) {
    var name = '';
    var avatar = '';
    if (nick && nick.name) name = String(nick.name).replace(/^\s+|\s+$/g, '');
    if (nick && nick.avatar) avatar = String(nick.avatar).replace(/^\s+|\s+$/g, '');
    if (!name.length) return null;
    return {
        name: name,
        host: (nick && nick.host) ? String(nick.host).replace(/^\s+|\s+$/g, '') : undefined,
        ip: (nick && nick.ip) ? String(nick.ip) : undefined,
        qwkid: (nick && nick.qwkid) ? String(nick.qwkid).replace(/^\s+|\s+$/g, '').toUpperCase() : undefined,
        avatar: avatar.length ? avatar : undefined
    };
};

Chat.prototype._getOwnAvatarData = function () {
    var avatarObj = null;
    if (!this._avatarLib || typeof this._avatarLib.read !== 'function') return undefined;
    try {
        avatarObj = this._avatarLib.read(user.number, user.alias, null, null) || null;
    } catch (_) {
        avatarObj = null;
    }
    if (!avatarObj || avatarObj.disabled || !avatarObj.data) return undefined;
    return String(avatarObj.data);
};

Chat.prototype._buildPrivateMessage = function (sender, recipient, text, timestamp) {
    return {
        nick: this._normalizePrivateNick(sender) || sender,
        str: text,
        time: timestamp,
        private: {
            to: this._normalizePrivateNick(recipient) || recipient
        }
    };
};

Chat.prototype._getMailboxMessagesPath = function () {
    return 'channels.' + user.alias + '.messages';
};

Chat.prototype._getMailboxHistoryPath = function () {
    return 'channels.' + user.alias + '.history';
};

Chat.prototype._ensureHistoryArray = function (location) {
    var existing;
    if (!this.jsonchat || !this.jsonchat.client || typeof this.jsonchat.client.read !== 'function') return;
    try {
        existing = this.jsonchat.client.read('chat', location, 1);
    } catch (_) {
        existing = null;
    }
    if (existing instanceof Array) return;
    this.jsonchat.client.write('chat', location, [], 2);
};

Chat.prototype._isPrivateMessage = function (msg) {
    return !!(msg && msg.private && msg.private.to && msg.private.to.name);
};

Chat.prototype._resolvePrivateTargetNick = function (name) {
    var trimmedName = String(name || '').replace(/^\s+|\s+$/g, '');
    var normalizedTarget = this._normalizePrivateLookupKey(trimmedName);
    var roster = [];
    if (!trimmedName.length) return null;
    try { roster = this._fetchJsonChatRoster() || []; } catch (_) { roster = []; }
    for (var i = 0; i < roster.length; i++) {
        var entry = roster[i];
        var nick = null;
        if (entry && entry.nick && typeof entry.nick === 'object') {
            nick = this._normalizePrivateNick({
                name: entry.nick.name || entry.nick.alias || entry.nick.user,
                host: entry.nick.host || entry.system || entry.host || entry.bbs,
                ip: entry.nick.ip || entry.ip,
                qwkid: entry.nick.qwkid || entry.qwkid
            });
        } else if (entry) {
            nick = this._normalizePrivateNick({
                name: entry.nick || entry.name || entry.alias || entry.user,
                host: entry.system || entry.host || entry.bbs,
                qwkid: entry.qwkid
            });
        }
        if (nick && (nick.name.toUpperCase() === trimmedName.toUpperCase() || this._normalizePrivateLookupKey(nick.name) === normalizedTarget)) return nick;
    }
    return null;
};

Chat.prototype._normalizePrivateLookupKey = function (text) {
    return String(text || '').replace(/^\s+|\s+$/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};

Chat.prototype._listPrivateTargetNames = function () {
    var seen = {};
    var names = [];
    var roster = [];
    try { roster = this._fetchJsonChatRoster() || []; } catch (_) { roster = []; }
    for (var i = 0; i < roster.length; i++) {
        var entry = roster[i];
        var name = '';
        if (entry && entry.nick && typeof entry.nick === 'object') {
            name = String(entry.nick.name || entry.nick.alias || entry.nick.user || '').replace(/^\s+|\s+$/g, '');
        } else if (entry) {
            name = String(entry.nick || entry.name || entry.alias || entry.user || '').replace(/^\s+|\s+$/g, '');
        }
        if (name.length && !seen[name.toUpperCase()]) {
            seen[name.toUpperCase()] = true;
            names.push(name);
        }
    }
    names.sort(function (left, right) { return right.length - left.length; });
    return names;
};

Chat.prototype._parsePrivateCommandInput = function (input) {
    var text = String(input || '').replace(/^\s+|\s+$/g, '');
    var args = text.replace(/^\/(?:msg|pm|tell|whisper)\s+/i, '');
    var closingQuoteIndex;
    var candidateNames;
    var recipientName = '';
    var messageText = '';
    var spaceIndex;

    if (!args.length || args === text) return null;

    if (args.charAt(0) === '"') {
        closingQuoteIndex = args.indexOf('"', 1);
        if (closingQuoteIndex < 2) return null;
        recipientName = args.substring(1, closingQuoteIndex).replace(/^\s+|\s+$/g, '');
        messageText = args.substr(closingQuoteIndex + 1).replace(/^\s+|\s+$/g, '');
        return (recipientName.length && messageText.length) ? { recipientName: recipientName, messageText: messageText } : null;
    }

    candidateNames = this._listPrivateTargetNames();
    for (var i = 0; i < candidateNames.length; i++) {
        var candidateName = candidateNames[i] || '';
        if (!candidateName.length) continue;
        if (args.substr(0, candidateName.length).toUpperCase() !== candidateName.toUpperCase()) continue;
        if (args.length > candidateName.length && args.charAt(candidateName.length) !== ' ') continue;
        recipientName = candidateName;
        messageText = args.substr(candidateName.length).replace(/^\s+|\s+$/g, '');
        if (recipientName.length && messageText.length) {
            return { recipientName: recipientName, messageText: messageText };
        }
    }

    spaceIndex = args.indexOf(' ');
    if (spaceIndex < 1) return null;
    recipientName = args.substr(0, spaceIndex).replace(/^\s+|\s+$/g, '');
    messageText = args.substr(spaceIndex + 1).replace(/^\s+|\s+$/g, '');
    return (recipientName.length && messageText.length) ? { recipientName: recipientName, messageText: messageText } : null;
};

Chat.prototype._getActiveDisplayChannel = function () {
    if (!this.jsonchat || !this.jsonchat.channels) return null;
    var chan = this.channel ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
    if (chan) return chan;
    for (var key in this.jsonchat.channels) {
        if (!Object.prototype.hasOwnProperty.call(this.jsonchat.channels, key)) continue;
        if (this.jsonchat.channels[key]) return this.jsonchat.channels[key];
    }
    return null;
};

Chat.prototype._appendPrivateDisplayMessage = function (message, outgoing) {
    var chan = this._getActiveDisplayChannel();
    var copy;
    var target = (message && message.private && message.private.to) ? message.private.to : null;
    var prefix = '';
    if (!chan || !Array.isArray(chan.messages) || !message || !message.nick) return false;
    prefix = outgoing && target && target.name
        ? ('[PM to ' + target.name + '] ')
        : '[PM] ';
    copy = {
        nick: message.nick,
        str: prefix + message.str,
        time: message.time,
        private: message.private,
        displaySender: outgoing && target && target.name
            ? (message.nick.name + ' [PM to ' + target.name + ']')
            : (message.nick.name + ' [PM]')
    };
    chan.messages.push(copy);
    this._needsRedraw = true;
    if (this.running) this.draw();
    return true;
};

Chat.prototype._handlePrivateMailboxPacket = function (packet) {
    var message = null;
    var senderNick = null;
    if (!packet || packet.oper !== 'WRITE' || packet.location !== this._getMailboxMessagesPath()) return false;
    message = packet.data;
    if (!this._isPrivateMessage(message)) return false;
    senderNick = this._normalizePrivateNick(message.nick || null);
    if (senderNick) this._lastPrivateSenderNick = senderNick;
    this._appendPrivateDisplayMessage(message, false);
    this._statusText = 'Private message from ' + (senderNick ? senderNick.name : 'someone');
    this._lastStatusUpdateTs = Date.now();
    this._lastInputRendered = '';
    this._refreshHeaderAndInput(true);
    return true;
};

Chat.prototype._sendPrivateMessage = function (targetNick, text) {
    var recipient = this._normalizePrivateNick(targetNick);
    var ownAvatar = this._getOwnAvatarData();
    var sender = this._normalizePrivateNick({
        name: (typeof user !== 'undefined' && user.alias) ? user.alias : 'You',
        host: (typeof system !== 'undefined' && system && system.name) ? system.name : '',
        ip: (typeof user !== 'undefined' && user.ip_address) ? user.ip_address : '',
        qwkid: (typeof system !== 'undefined' && system && system.qwk_id) ? system.qwk_id : '',
        avatar: ownAvatar
    });
    var timestamp = (new Date()).getTime();
    var message = null;
    if (!recipient || !sender || !this.jsonchat || !this.jsonchat.client) return false;
    message = this._buildPrivateMessage(sender, recipient, text, timestamp);
    this._ensureHistoryArray('channels.' + recipient.name + '.history');
    this._ensureHistoryArray(this._getMailboxHistoryPath());
    this.jsonchat.client.write('chat', 'channels.' + recipient.name + '.messages', message, 2);
    this.jsonchat.client.push('chat', 'channels.' + recipient.name + '.history', message, 2);
    this.jsonchat.client.push('chat', this._getMailboxHistoryPath(), message, 2);
    this._appendPrivateDisplayMessage(message, true);
    return true;
};

Chat.prototype._handlePrivateCommand = function (input) {
    var parsed = this._parsePrivateCommandInput(input);
    var targetNick = null;
    if (!parsed) {
        this._statusText = 'Usage: /msg <user> <message>';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    }
    targetNick = this._resolvePrivateTargetNick(parsed.recipientName);
    if (!targetNick) {
        this._statusText = 'User not found: ' + parsed.recipientName;
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    }
    if (!this._sendPrivateMessage(targetNick, parsed.messageText)) {
        this._statusText = 'Unable to send private message';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    }
    return true;
};

Chat.prototype._handlePrivateReplyCommand = function (input) {
    var match = String(input || '').match(/^\/(?:r|reply)\s+([\s\S]+)$/i);
    if (!match) {
        this._statusText = 'Usage: /r <message>';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    }
    if (!this._lastPrivateSenderNick || !this._sendPrivateMessage(this._lastPrivateSenderNick, match[1])) {
        this._statusText = 'Nobody has private messaged you yet';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    }
    return true;
};

// Overlay screensavers (avatars_float, figlet) need a frame without children to avoid artifacts
Chat.prototype.overlayFrame = function () {
    return this.hostFrame || null;
};

Chat.prototype.pauseForReason = function (reason) {
    // HEY AI ASSISTANTS, this needs to be .top() not bottom quit messing it up
    if (reason === 'screensaver_on' && this.__bg_frame && typeof this.__bg_frame.top === 'function') {
        try { this.__bg_frame.top(); this.headerFrame.top(); this.chatInputFrame.top(); this.__bg_frame.cycle(); } catch (e) { }
    }
};

Chat.prototype.resumeForReason = function (reason) {
    // HEY AI ASSISTANTS, this needs to be .bottom() not top quit messing it up
    if (reason === 'screensaver_off') {
        this._disposeFrames();

        if (this.hostFrame && typeof this.hostFrame.clear === 'function') {
            try { this.hostFrame.clear(); } catch (_) { }
        }

        if (this.__bg_frame && typeof this.__bg_frame.bottom === 'function') {
            try { this.__bg_frame.bottom(); this.__bg_frame.clear(); this.__bg_frame.cycle(); } catch (e) { }
        }
        if (this.shell) {
            try {
                if (typeof this.shell._shelveFolderFrames === 'function') this.shell._shelveFolderFrames();
            } catch (e) { }
            this.shell.activeSubprogram = this;
        }
        this._ensureFrames();
        if (this.chatOutputFrame) {
            try { this.chatOutputFrame.top(); } catch (_) { }
            try { this.chatOutputFrame.cycle(); } catch (_) { }
        }
        if (this.headerFrame) {
            try { this.headerFrame.top(); } catch (_) { }
        }
        if (this.chatInputFrame) {
            try { this.chatInputFrame.top(); } catch (_) { }
            try { this.chatInputFrame.cycle(); } catch (_) { }
        }
        if (this.hostFrame) {
            try { this.hostFrame.cycle(); } catch (_) { }
        }
        this.updateInputFrame();
        this._needsRedraw = true;
        this.draw();

        this._registerControlHotspots();
    }
};
Chat.prototype.detachShellTimer = function () {
    this.timer = null;
};
Chat.prototype.handleKey = function (key) {
    if (this._processControlHotspotInput(key)) return;
    var pageStep = (this.leftMsgFrame && this.leftMsgFrame.height) ? Math.max(1, this.leftMsgFrame.height - 1) : 5;
    this._lastKeyTs = Date.now();
    var rosterKey = (typeof KEY_F2 !== 'undefined') ? KEY_F2 : null;

    if (key === 'F2' || key === '\x02' || (rosterKey && key === rosterKey)) {
        if (typeof log === 'function') {
            try { dbug('[Chat] handleKey roster trigger via F2 combo', 'chat'); } catch (_) { }
        }
        this._showRosterModal();
        return;
    }

    // TAB key - username autocomplete
    if (key === '\t' || key === '\x09') {
        this._handleUsernameAutocomplete();
        return;
    }
    
    // Handle bitmap viewer keys when active
    if (this._bitmapViewerActive) {
        // Navigation between images: left/right arrows or [ ]
        if (key === KEY_LEFT || key === '\x1B[D' || key === '[') {
            this._bitmapViewerNav(-1);
            return;
        }
        if (key === KEY_RIGHT || key === '\x1B[C' || key === ']') {
            this._bitmapViewerNav(1);
            return;
        }
        // Scroll large images: up/down/pgup/pgdn
        if (key === KEY_UP || key === '\x1B[A') {
            this._bitmapScroll(0, -1);
            return;
        }
        if (key === KEY_DOWN || key === '\x1B[B') {
            this._bitmapScroll(0, 1);
            return;
        }
        if (key === KEY_PGUP) {
            this._bitmapScroll(0, -10);
            return;
        }
        if (key === KEY_PGDN) {
            this._bitmapScroll(0, 10);
            return;
        }
        // Toggle color mode (256 vs 16)
        if (key === 'c' || key === 'C') {
            this._bitmap256Color = !this._bitmap256Color;
            this._drawBitmapContent();
            return;
        }
        // Debug: dump bitmap data for diagnostics - writes to file
        if (key === 'd' || key === 'D') {
            var entry = this._bitmapQueue[this._bitmapViewIndex];
            if (entry) {
                try {
                    var debugFile = new File(system.data_dir + 'bitmap_debug.txt');
                    if (debugFile.open('w')) {
                        debugFile.writeln('BITMAP DEBUG INFO');
                        debugFile.writeln('================');
                        debugFile.writeln('Stored width: ' + entry.width);
                        debugFile.writeln('Stored height: ' + entry.height);
                        debugFile.writeln('Actual width: ' + (entry.actualWidth || 'N/A'));
                        debugFile.writeln('Actual height: ' + (entry.actualHeight || 'N/A'));
                        debugFile.writeln('Bitmap array length: ' + entry.bitmap.length);
                        debugFile.writeln('Expected pixels (w*h): ' + (entry.width * entry.height));
                        debugFile.writeln('');
                        debugFile.writeln('First 10 pixels:');
                        for (var pi = 0; pi < 10 && pi < entry.bitmap.length; pi++) {
                            var cell = entry.bitmap[pi];
                            debugFile.writeln('  [' + pi + '] char=' + (cell.charCode || '?') + ' fg=' + cell.fg + ' bg=' + cell.bg);
                        }
                        debugFile.writeln('');
                        debugFile.writeln('Row 0 first 10 chars: ');
                        var row0 = '';
                        for (var c0 = 0; c0 < 10 && c0 < entry.width; c0++) {
                            row0 += (entry.bitmap[c0].charCode || 0) + ',';
                        }
                        debugFile.writeln('  ' + row0);
                        debugFile.writeln('Row 1 first 10 chars: ');
                        var row1 = '';
                        for (var c1 = 0; c1 < 10 && c1 < entry.width; c1++) {
                            var idx1 = entry.width + c1;
                            row1 += (entry.bitmap[idx1] ? entry.bitmap[idx1].charCode : '?') + ',';
                        }
                        debugFile.writeln('  ' + row1);
                        debugFile.close();
                        this._statusText = 'Debug written to ' + system.data_dir + 'bitmap_debug.txt';
                    } else {
                        this._statusText = 'Failed to open debug file';
                    }
                } catch (e) {
                    this._statusText = 'Debug error: ' + e;
                }
                this._lastStatusUpdateTs = Date.now();
                this._lastInputRendered = '';
                this._refreshHeaderAndInput(true);
            }
            return;
        }
        // Any other key dismisses the viewer (like backdrop click)
        this._closeBitmapViewer();
        return;
    }

    // Message scroll keys (Up/Down/PgUp/PgDn/wheel)
    switch (key) {
        case KEY_UP:
        case '\x1B[A':
            if (this._adjustScrollOffset(1)) return;
            break;
        case KEY_DOWN:
        case '\x1B[B':
            if (this._adjustScrollOffset(-1)) return;
            break;
        case KEY_PGUP:
            if (this._adjustScrollOffset(pageStep)) return;
            break;
        case KEY_PGDN:
            if (this._adjustScrollOffset(-pageStep)) return;
            break;
        case 'wheel_up':
            if (this._adjustScrollOffset(1)) return;
            break;
        case 'wheel_down':
            if (this._adjustScrollOffset(-1)) return;
            break;
    }

    // Input cursor movement (left/right arrows, home/end)
    if (key === KEY_LEFT || key === '\x1B[D') {
        if (this._inputCursor > 0) {
            this._inputCursor--;
            this._updateInputDisplay();
        }
        return;
    }
    if (key === KEY_RIGHT || key === '\x1B[C') {
        if (this._inputCursor < this.input.length) {
            this._inputCursor++;
            this._updateInputDisplay();
        }
        return;
    }
    if (key === KEY_HOME || key === '\x01') { // Ctrl+A or Home
        if (this._inputCursor !== 0) {
            this._inputCursor = 0;
            this._updateInputDisplay();
        }
        return;
    }
    if (key === KEY_END || key === '\x05') { // Ctrl+E or End
        if (this._inputCursor !== this.input.length) {
            this._inputCursor = this.input.length;
            this._updateInputDisplay();
        }
        return;
    }

    if (this._handleControlHotkey(key)) return;
    if (key === '\x1B') {
        // Exit only if no active modal
        if (!this._activeRosterModal || this._activeRosterModal._closed) {
            this.exit();
            return;
        }
        return; // swallow ESC while modal open
    }
    // Enter/Return (string '\r' or '\n')
    if (key === '\r' || key === '\n') {
        var rawTrimmedInput = this.input.trim();
        var trimmedInput = rawTrimmedInput.toLowerCase();
        // Handle slash commands
        if (rawTrimmedInput.length > 0 && rawTrimmedInput.charAt(0) === '/') {
            var slashCmd = trimmedInput;
            var cmdHandled = false;
            if (/^\/(?:msg|pm|tell|whisper)\b/i.test(rawTrimmedInput)) {
                cmdHandled = this._handlePrivateCommand(rawTrimmedInput);
            } else if (/^\/(?:r|reply)\b/i.test(rawTrimmedInput)) {
                cmdHandled = this._handlePrivateReplyCommand(rawTrimmedInput);
            }
            switch (slashCmd) {
                case '/exit':
                case '/quit':
                case '/leave':
                    cmdHandled = this._activateControlAction('back');
                    break;
                case '/who':
                case '/users':
                case '/roster':
                    cmdHandled = this._activateControlAction('roster');
                    break;
                case '/help':
                case '/?':
                    cmdHandled = this._activateControlAction('help');
                    break;
                case '/info':
                    cmdHandled = this._activateControlAction('info');
                    break;
                case '/channels':
                case '/rooms':
                    cmdHandled = this._activateControlAction('channels');
                    break;
                case '/settings':
                case '/prefs':
                case '/options':
                    cmdHandled = this._activateControlAction('settings');
                    break;
                case '/img':
                case '/images':
                case '/pics':
                case '/art':
                    cmdHandled = this._activateControlAction('img');
                    break;
            }
            if (cmdHandled) {
                this.input = "";
                this._inputCursor = 0;
                this._inputScrollOffset = 0;
                this._updateInputDisplay();
                return;
            }
            // Unknown slash command - fall through to send as regular message
        }
        if (this.input.trim().length > 0 && this.jsonchat && this.jsonchat.client && typeof this.jsonchat.client.write === 'function' && typeof this.jsonchat.client.push === 'function') {
            var msgText = this.input;
            var ownAvatar = this._getOwnAvatarData();
            var nick = (typeof user !== 'undefined' && user.alias)
                ? { name: user.alias, host: system.name, ip: user.ip_address, qwkid: system.qwk_id, avatar: ownAvatar }
                : { name: 'You', host: (system && system.name) ? system.name : '', qwkid: (system && system.qwk_id) ? system.qwk_id : '', avatar: ownAvatar };
            var message = {
                nick: nick,
                str: msgText,
                time: (new Date()).getTime()
            };
            var chan = (this.jsonchat.channels && this.channel) ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
            // Award points for sending chat message
            try {
                var shell = (typeof IconShell !== 'undefined' && IconShell._activeInstance) ? IconShell._activeInstance : null;
                if (shell && shell._pointsSystem && typeof shell._pointsSystem.award === 'function') {
                    shell._pointsSystem.award('sentChatMessage');
                }
            } catch (e) { /* ignore */ }
            // Render immediately for sender
            this.jsonchat.client.write('chat', 'channels.' + this.channel + '.messages', message, 2);
            this.jsonchat.client.push('chat', 'channels.' + this.channel + '.history', message, 2);
            if (chan && Array.isArray(chan.messages)) chan.messages.push(message);
            this.draw();
        }
        this.input = "";
        this._inputCursor = 0;
        this._inputScrollOffset = 0;
        this._updateInputDisplay();
        return;
    }
    // Backspace - delete character before cursor
    if (key === '\b' || key === '\x7F') {
        if (this._inputCursor > 0) {
            this.input = this.input.slice(0, this._inputCursor - 1) + this.input.slice(this._inputCursor);
            this._inputCursor--;
            this._updateInputDisplay();
        }
        return;
    }
    // Delete key - delete character at cursor
    if (key === KEY_DEL || key === '\x7E') {
        if (this._inputCursor < this.input.length) {
            this.input = this.input.slice(0, this._inputCursor) + this.input.slice(this._inputCursor + 1);
            this._updateInputDisplay();
        }
        return;
    }
    // Printable characters - insert at cursor position
    if (typeof key === 'string' && key.length === 1 && key >= ' ' && key <= '~') {
        this.input = this.input.slice(0, this._inputCursor) + key + this.input.slice(this._inputCursor);
        this._inputCursor++;
        this._updateInputDisplay();
        return;
    }
    // Ignore all other keys
};

// Username autocomplete (TAB key) - case insensitive
Chat.prototype._handleUsernameAutocomplete = function () {
    if (!this.input || this.input.length === 0) return;
    
    // Find the word at/before cursor
    var beforeCursor = this.input.slice(0, this._inputCursor);
    var afterCursor = this.input.slice(this._inputCursor);
    
    // Find word boundary - look for last space before cursor
    var lastSpace = beforeCursor.lastIndexOf(' ');
    var wordStart = lastSpace + 1;
    var partial = beforeCursor.slice(wordStart).toLowerCase();
    
    if (partial.length === 0) return;
    
    // Get roster usernames
    var roster = [];
    try {
        roster = this._getRosterEntries();
    } catch (e) {
        return;
    }
    
    if (!roster || !roster.length) return;
    
    // Build list of usernames (case-preserved)
    var candidates = [];
    for (var i = 0; i < roster.length; i++) {
        var entry = roster[i];
        if (entry && entry.username) {
            candidates.push(entry.username);
        }
    }
    
    // Find matches (case insensitive)
    var matches = [];
    for (var j = 0; j < candidates.length; j++) {
        var name = candidates[j];
        if (name.toLowerCase().indexOf(partial) === 0) {
            matches.push(name);
        }
    }
    
    if (matches.length === 0) return;
    
    // Track autocomplete state for cycling through matches
    if (!this._autocompleteState || 
        this._autocompleteState.partial !== partial ||
        this._autocompleteState.wordStart !== wordStart) {
        // New autocomplete session
        this._autocompleteState = {
            partial: partial,
            wordStart: wordStart,
            matches: matches,
            index: 0
        };
    } else {
        // Cycle to next match
        this._autocompleteState.index = (this._autocompleteState.index + 1) % this._autocompleteState.matches.length;
    }
    
    var completion = this._autocompleteState.matches[this._autocompleteState.index];
    
    // Replace partial with completion
    var prefix = this.input.slice(0, wordStart);
    // Check if there's more word after cursor (complete the whole word)
    var restOfWord = '';
    var spaceAfter = afterCursor.indexOf(' ');
    if (spaceAfter === -1) {
        restOfWord = afterCursor;
        afterCursor = '';
    } else {
        restOfWord = afterCursor.slice(0, spaceAfter);
        afterCursor = afterCursor.slice(spaceAfter);
    }
    
    this.input = prefix + completion + afterCursor;
    this._inputCursor = wordStart + completion.length;
    this._updateInputDisplay();
};

// Fast input display update (skips full redraw for responsiveness)
Chat.prototype._updateInputDisplay = function () {
    this._drawInputFrame(true);
};

// Update the chat input/status line
Chat.prototype.updateInputFrame = function () {
    this._refreshHeaderAndInput(true);
};

// Efficiently append new messages to the chat (call this from IconShell on new message event)
Chat.prototype.updateChat = function (packet) {
    log('updateChat invoked', 'chat');
    if (packet) this._pendingMessage = packet;
    this._needsRedraw = true;
    if (this.running) this.draw();
};

// Discord bridge detection helpers
Chat.prototype._isDiscordUser = function (nickName) {
    return typeof nickName === 'string' && nickName.indexOf('DISCORD:') === 0;
};

Chat.prototype._extractDiscordUsername = function (nickName) {
    if (!this._isDiscordUser(nickName)) return null;
    return nickName.slice(8); // Remove "DISCORD:" prefix (8 chars)
};

Chat.prototype._isDiscordBridge = function (nick) {
    if (!nick) return false;
    if (typeof nick === 'string') return nick === 'DiscordBridge';
    if (typeof nick === 'object') {
        return nick.name === 'DiscordBridge' || nick.host === 'discord.bridge';
    }
    return false;
};

// BLOCKBRAIN bridge detection helpers
Chat.prototype._isBlockbrainUser = function (nickName) {
    return typeof nickName === 'string' && nickName.indexOf('BLOCKBRAIN:') === 0;
};

Chat.prototype._extractBlockbrainUsername = function (nickName) {
    if (!this._isBlockbrainUser(nickName)) return null;
    return nickName.slice(11); // Remove "BLOCKBRAIN:" prefix (11 chars)
};

Chat.prototype._isBlockbrainBridge = function (nick) {
    if (!nick) return false;
    if (typeof nick === 'string') return nick === 'BlockbrainBridge' || nick === 'BLOCKBRAIN';
    if (typeof nick === 'object') {
        return nick.name === 'BlockbrainBridge' || nick.name === 'BLOCKBRAIN' || nick.host === 'blockbrain.bridge';
    }
    return false;
};

// Generic bridge user detection - returns { type: 'discord'|'blockbrain'|null, username: string|null }
Chat.prototype._parseBridgeUser = function (nickName) {
    if (this._isDiscordUser(nickName)) {
        return { type: 'discord', username: this._extractDiscordUsername(nickName), shortLabel: 'D' };
    }
    if (this._isBlockbrainUser(nickName)) {
        return { type: 'blockbrain', username: this._extractBlockbrainUsername(nickName), shortLabel: 'BB' };
    }
    return { type: null, username: null, shortLabel: null };
};

// Check if nick is any bridge service (not a user)
Chat.prototype._isBridgeService = function (nick) {
    return this._isDiscordBridge(nick) || this._isBlockbrainBridge(nick);
};

// Attempt to match a bridged display name to a BBS user number
Chat.prototype._matchBridgedUserToBBS = function (bridgedName) {
    if (!bridgedName || typeof system === 'undefined' || typeof system.matchuser !== 'function') return 0;
    
    // Strategy 1: Exact match (case-insensitive via matchuser)
    var exactMatch = system.matchuser(bridgedName);
    if (exactMatch) return exactMatch;
    
    // Strategy 2: Try without spaces (bridge names often have spaces, BBS aliases might not)
    var noSpaces = bridgedName.replace(/\s+/g, '');
    if (noSpaces !== bridgedName) {
        var noSpaceMatch = system.matchuser(noSpaces);
        if (noSpaceMatch) return noSpaceMatch;
    }
    
    // Strategy 3: Try first word only (e.g., "Larry King Lagomorph" -> "Larry")
    var firstWord = bridgedName.split(/\s+/)[0];
    if (firstWord && firstWord !== bridgedName && firstWord.length >= 2) {
        var firstWordMatch = system.matchuser(firstWord);
        if (firstWordMatch) return firstWordMatch;
    }
    
    return 0;
};

// Attempt to match a Discord display name to a BBS user number (legacy wrapper)
Chat.prototype._matchDiscordToBBSUser = function (discordName) {
    return this._matchBridgedUserToBBS(discordName);
};

// ============== BITMAP Art Support ==============
// Zlib inflate implementation (adapted from png_loader.js)
Chat.prototype._inflateZlib = (function () {
    // ====== Inflate (zlib + DEFLATE) ======
    function Inflate(u8, off) {
        this.u8 = u8; this.p = off || 0; this.bitbuf = 0; this.bitcnt = 0;
    }
    Inflate.prototype.readU8 = function () { return this.u8[this.p++]; };
    Inflate.prototype.readBits = function (n) {
        var b = this.bitbuf, c = this.bitcnt;
        while (c < n) { b |= this.readU8() << c; c += 8; }
        var out = b & ((1 << n) - 1);
        this.bitbuf = b >>> n; this.bitcnt = c - n;
        return out;
    };
    Inflate.prototype.alignByte = function () { this.bitbuf = 0; this.bitcnt = 0; };

    function buildHuff(codeLengths) {
        var maxLen = 0, i;
        for (i = 0; i < codeLengths.length; i++) if (codeLengths[i] > maxLen) maxLen = codeLengths[i];
        var bl_count = new Array(maxLen + 1); for (i = 0; i <= maxLen; i++) bl_count[i] = 0;
        for (i = 0; i < codeLengths.length; i++) bl_count[codeLengths[i]]++;
        var code = 0, next_code = new Array(maxLen + 1); bl_count[0] = 0;
        for (i = 1; i <= maxLen; i++) { code = (code + bl_count[i - 1]) << 1; next_code[i] = code; }
        function revbits(x, n) {
            var r = 0;
            for (var k = 0; k < n; k++) { r = (r << 1) | (x & 1); x >>= 1; }
            return r;
        }
        var map = {};
        for (var sym = 0; sym < codeLengths.length; sym++) {
            var len = codeLengths[sym];
            if (len !== 0) {
                var c = next_code[len]++;
                var key = (revbits(c, len) | (len << 16));
                map[key] = sym;
            }
        }
        return { maxBits: maxLen, map: map };
    }

    function readCode(h, inf) {
        var code = 0;
        for (var len = 1; len <= h.maxBits; len++) {
            code |= (inf.readBits(1) << (len - 1));
            var key = (code | (len << 16));
            if (h.map[key] !== undefined) return h.map[key];
        }
        throw "Huffman decode failed";
    }

    var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    var DST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    var DST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

    function fixedLitHuff() {
        var len = [];
        for (var i = 0; i <= 287; i++) len[i] = 0;
        for (i = 0; i <= 143; i++) len[i] = 8;
        for (i = 144; i <= 255; i++) len[i] = 9;
        for (i = 256; i <= 279; i++) len[i] = 7;
        for (i = 280; i <= 287; i++) len[i] = 8;
        return buildHuff(len);
    }
    function fixedDistHuff() {
        var len = [];
        for (var i = 0; i < 32; i++) len[i] = 5;
        return buildHuff(len);
    }

    function decodeDynamicTables(inf) {
        var HLIT = inf.readBits(5) + 257;
        var HDIST = inf.readBits(5) + 1;
        var HCLEN = inf.readBits(4) + 4;
        var order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        var clen = new Array(19); for (var i = 0; i < 19; i++) clen[i] = 0;
        for (i = 0; i < HCLEN; i++) clen[order[i]] = inf.readBits(3);
        var chuff = buildHuff(clen);
        function readLens(n) {
            var out = [], prev = 0;
            while (out.length < n) {
                var sym = readCode(chuff, inf);
                if (sym <= 15) { out.push(prev = sym); }
                else if (sym === 16) { var rpt = 3 + inf.readBits(2); for (var k = 0; k < rpt; k++) out.push(prev); }
                else if (sym === 17) { var rpt17 = 3 + inf.readBits(3); for (k = 0; k < rpt17; k++) out.push(0); prev = 0; }
                else if (sym === 18) { var rpt18 = 11 + inf.readBits(7); for (k = 0; k < rpt18; k++) out.push(0); prev = 0; }
                else throw "bad RLE in code lengths";
            }
            return out;
        }
        var litlen = readLens(HLIT);
        var dist = readLens(HDIST);
        return { lit: buildHuff(litlen), dist: buildHuff(dist) };
    }

    function inflateRaw(u8, start) {
        var inf = new Inflate(u8, start || 0);
        var out = [];
        var done = false;
        var litFix = fixedLitHuff(), distFix = fixedDistHuff();
        while (!done) {
            var BFINAL = inf.readBits(1);
            var BTYPE = inf.readBits(2);
            if (BTYPE === 0) {
                inf.alignByte();
                var len = inf.readU8() | (inf.readU8() << 8);
                var nlen = inf.readU8() | (inf.readU8() << 8);
                if ((len ^ 0xFFFF) !== nlen) throw "stored block LEN/NLEN mismatch";
                for (var i = 0; i < len; i++) out.push(inf.readU8());
            } else {
                var lit, dist;
                if (BTYPE === 1) { lit = litFix; dist = distFix; }
                else if (BTYPE === 2) { var tbl = decodeDynamicTables(inf); lit = tbl.lit; dist = tbl.dist; }
                else throw "invalid BTYPE";
                for (; ;) {
                    var sym = readCode(lit, inf);
                    if (sym < 256) { out.push(sym); }
                    else if (sym === 256) { break; }
                    else {
                        var lidx = sym - 257;
                        if (lidx < 0 || lidx >= LEN_BASE.length) throw "bad length symbol";
                        var length = LEN_BASE[lidx] + (LEN_EXTRA[lidx] ? inf.readBits(LEN_EXTRA[lidx]) : 0);
                        var dsym = readCode(dist, inf);
                        if (dsym < 0 || dsym >= 30) throw "bad distance symbol " + dsym;
                        var distance = DST_BASE[dsym] + (DST_EXTRA[dsym] ? inf.readBits(DST_EXTRA[dsym]) : 0);
                        var base = out.length - distance;
                        if (base < 0) throw "invalid distance";
                        for (var k = 0; k < length; k++) out.push(out[base + k]);
                    }
                }
            }
            if (BFINAL) done = true;
        }
        var u = new Uint8Array(out.length);
        for (var q = 0; q < out.length; q++) u[q] = out[q];
        return u;
    }

    return function inflateZlib(u8, off) {
        var p = off || 0;
        var CMF = u8[p++], FLG = u8[p++];
        if ((CMF & 0x0F) !== 8) throw "zlib CM not deflate";
        if (FLG & 0x20) p += 4; // skip preset dict DICTID
        return inflateRaw(u8, p);
    };
})();

// Detect if a message is a BITMAP payload
Chat.prototype._isBitmapMessage = function (text) {
    if (typeof text !== 'string') return false;
    return text.indexOf('[BITMAP|') === 0 && text.charAt(text.length - 1) === ']';
};

// Parse a BITMAP message and return structured data
Chat.prototype._parseBitmapMessage = function (text) {
    if (!this._isBitmapMessage(text)) return null;
    try {
        var inner = text.slice(1, -1); // strip [ and ]
        var parts = inner.split('|');
        if (parts.length !== 5 || parts[0] !== 'BITMAP') return null;
        var width = parseInt(parts[1], 10);
        var height = parseInt(parts[2], 10);
        var fromName = parts[3];
        var hexData = parts[4];
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return null;
        if (!hexData || hexData.length < 2) return null;
        return { width: width, height: height, fromName: fromName, hexData: hexData };
    } catch (e) {
        try { dbug('[Chat] _parseBitmapMessage error: ' + e, 'chat'); } catch (_) { }
        return null;
    }
};

// Decode hex string to Uint8Array
Chat.prototype._hexToBytes = function (hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
};

// Decode and decompress BITMAP data into a 2D bitmap array
// Format: height byte, then all FGs, then all BGs, then all chars (3 parallel arrays)
Chat.prototype._decodeBitmap = function (hexData, expectedWidth, expectedHeight) {
    var compressed = this._hexToBytes(hexData);
    var decompressed = this._inflateZlib(compressed);
    
    if (!decompressed || decompressed.length < 4) {
        try { dbug('[Chat] _decodeBitmap: decompressed data too short: ' + (decompressed ? decompressed.length : 'null'), 'chat'); } catch (_) { }
        return { bitmap: [], width: 0, height: 0 };
    }
    
    // First byte is height
    var dataHeight = decompressed[0];
    var dataLen = decompressed.length - 1;
    
    // Remaining data is divided into 3 equal parts: fgs, bgs, chars
    if (dataLen % 3 !== 0) {
        try { dbug('[Chat] _decodeBitmap: data length not divisible by 3: ' + dataLen, 'chat'); } catch (_) { }
    }
    
    var slicepoint = Math.floor(dataLen / 3);
    var totalPixels = slicepoint;
    var dataWidth = Math.floor(totalPixels / dataHeight);
    
    // Debug: log all dimension sources
    try { 
        dbug('[Chat] _decodeBitmap: expectedW=' + expectedWidth + ' expectedH=' + expectedHeight + 
             ' dataH=' + dataHeight + ' dataW=' + dataWidth + 
             ' totalPixels=' + totalPixels + ' expected*=' + (expectedWidth * expectedHeight) +
             ' decompLen=' + decompressed.length, 'chat'); 
    } catch (_) { }
    
    // Use dimensions from message wrapper (more reliable than embedded height byte)
    var width = expectedWidth || dataWidth;
    var height = expectedHeight || dataHeight;
    
    // Sanity check
    if (width * height !== totalPixels) {
        try { dbug('[Chat] _decodeBitmap: DIMENSION MISMATCH! w*h=' + (width*height) + ' vs totalPixels=' + totalPixels, 'chat'); } catch (_) { }
        // Fall back to data-derived dimensions
        width = dataWidth;
        height = dataHeight;
    }
    
    // Store both sets of dimensions for debugging
    var actualWidth = dataWidth;
    var actualHeight = dataHeight;
    
    // Extract the 3 parallel arrays (offset by 1 due to height byte)
    var fgs = [];
    var bgs = [];
    var chars = [];
    for (var i = 0; i < slicepoint; i++) {
        fgs.push(decompressed[1 + i]);
        bgs.push(decompressed[1 + slicepoint + i]);
        chars.push(decompressed[1 + slicepoint * 2 + i]);
    }
    
    // Debug: show first few values from each array
    try {
        dbug('[Chat] _decodeBitmap: first 5 chars=' + chars.slice(0,5).join(',') + 
             ' fgs=' + fgs.slice(0,5).join(',') + ' bgs=' + bgs.slice(0,5).join(','), 'chat');
    } catch (_) { }
    
    // Build bitmap array with { ch, fg, bg } objects
    // Note: CP437 characters 0-31 are printable (faces, symbols, etc) but codes 7-13
    // can interfere with terminal output. Store the raw code for safe rendering.
    var bitmap = [];
    for (var i = 0; i < totalPixels; i++) {
        var charCode = chars[i];
        // ascii() is Synchronet's CP437-aware character converter
        var ch = (typeof ascii === 'function') ? ascii(charCode) : String.fromCharCode(charCode);
        bitmap.push({
            ch: ch,
            charCode: charCode,  // Store raw code for safe rendering
            fg: fgs[i],
            bg: bgs[i]
        });
    }
    
    return { bitmap: bitmap, width: width, height: height, actualWidth: actualWidth, actualHeight: actualHeight };
};

// Process incoming message text, detect and queue bitmaps
Chat.prototype._processBitmapPayload = function (msg) {
    var text = this._extractMessageText(msg);
    var parsed = this._parseBitmapMessage(text);
    if (!parsed) return false;
    try {
        var decoded = this._decodeBitmap(parsed.hexData, parsed.width, parsed.height);
        if (!decoded.bitmap || decoded.bitmap.length === 0) {
            try { dbug('[Chat] _processBitmapPayload: empty bitmap result', 'chat'); } catch (_) { }
            return false;
        }
        // Use fromName from payload (the actual artist), not msg.nick.name (which is BLOCKBRAIN:SYSTEM)
        var sender = parsed.fromName || ((msg && msg.nick && msg.nick.name) ? msg.nick.name : 'Unknown');
        // Parse sender through bridge detection for cleaner display
        var bridge = this._parseBridgeUser(sender);
        var displayName = (bridge.type && bridge.username) ? bridge.username : sender;
        var entry = {
            width: decoded.width,
            height: decoded.height,
            actualWidth: decoded.actualWidth,
            actualHeight: decoded.actualHeight,
            fromName: displayName,
            bridgeType: bridge.type,
            bitmap: decoded.bitmap,
            time: msg.time || Date.now()
        };
        this._bitmapQueue.push(entry);
        this._newBitmapCount++;
        // Trim to max history
        while (this._bitmapQueue.length > this._bitmapMaxHistory) {
            this._bitmapQueue.shift();
        }
        try { dbug('[Chat] Bitmap received from ' + displayName + ' (' + decoded.width + 'x' + decoded.height + ')', 'chat'); } catch (_) { }
        // Update status to notify user
        this._statusText = this._newBitmapCount + ' new image(s) - type /img to view';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return true;
    } catch (e) {
        try { dbug('[Chat] _processBitmapPayload decode error: ' + e, 'chat'); } catch (_) { }
        return false;
    }
};

// Show bitmap carousel modal
Chat.prototype._showBitmapModal = function () {
    // Close existing bitmap viewer if open
    if (this._bitmapViewerFrame) {
        try { this._bitmapViewerFrame.close(); } catch (_) { }
        this._bitmapViewerFrame = null;
    }
    // Reset view index to most recent (or -1 if no images)
    this._bitmapViewIndex = this._bitmapQueue.length > 0 ? this._bitmapQueue.length - 1 : -1;
    this._newBitmapCount = 0;
    this._showBitmapViewer();
};

// Map 256-color index to nearest 16-color (DOS palette) attribute
Chat.prototype._color256to16 = function (c) {
    if (c < 16) return c; // Already 16-color
    if (c >= 232) {
        // Grayscale ramp 232-255 -> map to 0,8,7,15
        var gray = c - 232; // 0-23
        if (gray < 6) return 0;       // black
        if (gray < 12) return 8;      // dark gray
        if (gray < 18) return 7;      // light gray
        return 15;                     // white
    }
    // 6x6x6 color cube (16-231)
    var idx = c - 16;
    var r = Math.floor(idx / 36);
    var g = Math.floor((idx % 36) / 6);
    var b = idx % 6;
    // Convert to 0-1 range
    var rn = r / 5, gn = g / 5, bn = b / 5;
    // Map to nearest DOS color
    var bright = (rn > 0.5 || gn > 0.5 || bn > 0.5) ? 8 : 0;
    var rb = (rn > 0.3) ? 4 : 0;
    var gb = (gn > 0.3) ? 2 : 0;
    var bb = (bn > 0.3) ? 1 : 0;
    return bright | rb | gb | bb;
};

// Show bitmap using direct Frame rendering (bypasses Modal text processing issues)
Chat.prototype._showBitmapViewer = function () {
    var self = this;
    var entry = this._bitmapQueue[this._bitmapViewIndex];
    var hasArt = !!entry;
    
    var parent = this.parentFrame || this.chatOutputFrame;
    if (!parent) return;
    
    // Calculate viewer dimensions
    var screenW = parent.width || 80;
    var screenH = parent.height || 25;
    
    // Header area: 2 rows for avatar (small) + metadata beside it
    var headerH = 2;
    var borderW = 2, borderH = 4 + headerH; // 1 each side + title row + header rows + status row
    
    var viewW, viewH, frameW, frameH;
    if (hasArt) {
        viewW = Math.min(entry.width, screenW - borderW - 2);
        viewH = Math.min(entry.height, screenH - borderH - 2);
        frameW = viewW + borderW;
        frameH = viewH + borderH;
    } else {
        // No art: smaller dialog just for the create hint
        frameW = Math.min(50, screenW - 4);
        frameH = 6; // title + 2 header + status + borders
        viewW = frameW - borderW;
        viewH = 0;
    }
    
    // Store viewport dimensions for scroll calculations
    this._bitmapViewW = viewW;
    this._bitmapViewH = viewH;
    this._bitmapHeaderH = headerH;
    
    // Reset scroll offsets
    this._bitmapScrollX = 0;
    this._bitmapScrollY = 0;
    
    // Center the frame
    var frameX = Math.max(1, Math.floor((screenW - frameW) / 2) + parent.x);
    var frameY = Math.max(1, Math.floor((screenH - frameH) / 2) + parent.y);
    
    // Create overlay frame
    var frameAttr = this.paletteAttr('CHAT_ROSTER_MODAL_FRAME', BG_BLUE | WHITE);
    this._bitmapViewerFrame = new Frame(frameX, frameY, frameW, frameH, frameAttr, parent);
    this._bitmapViewerFrame.open();
    this._bitmapViewerActive = true;
    
    // Stash current hotspots and register dismiss hotspot covering entire chat area
    if (this.hotspots) {
        this.hotspots.stash();
        // Register a clickable hotspot to dismiss - covers whole parent frame for easy click-to-close
        this.hotspots.set([{
            key: '\r',  // Click sends carriage return
            x: parent.x,
            y: parent.y,
            width: parent.width,
            height: parent.height,
            swallow: true,
            owner: 'chat:bitmap-dismiss'
        }], { activate: true });
    }
    
    this._drawBitmapContent();
};

// Draw bitmap content into the viewer frame (called on open and scroll)
Chat.prototype._drawBitmapContent = function () {
    var entry = this._bitmapQueue[this._bitmapViewIndex];
    var hasArt = !!entry;
    if (!this._bitmapViewerFrame) return;
    
    var viewW = this._bitmapViewW;
    var viewH = this._bitmapViewH;
    var headerH = this._bitmapHeaderH || 2;
    var frameW = this._bitmapViewerFrame.width;
    var frameH = this._bitmapViewerFrame.height;
    var scrollX = this._bitmapScrollX || 0;
    var scrollY = this._bitmapScrollY || 0;
    
    // Clear frame
    var frameAttr = this.paletteAttr('CHAT_ROSTER_MODAL_FRAME', BG_BLUE | WHITE);
    this._bitmapViewerFrame.clear(frameAttr);
    
    // Draw title bar
    var total = this._bitmapQueue.length;
    var current = this._bitmapViewIndex + 1;
    var title;
    if (hasArt) {
        var colorMode = this._bitmap256Color ? '256c' : '16c';
        var dimInfo = entry.width + 'x' + entry.height;
        title = ' ' + current + '/' + total + ' [' + colorMode + '] ' + dimInfo + ' ';
    } else {
        title = ' Image Viewer ';
    }
    var titleX = Math.max(0, Math.floor((frameW - title.length) / 2));
    for (var ti = 0; ti < title.length && titleX + ti < frameW; ti++) {
        this._bitmapViewerFrame.setData(titleX + ti, 0, title.charAt(ti), BG_CYAN | WHITE, false);
    }
    
    // Draw header area with create hint (and avatar + username when art exists)
    var headerY = 1;
    var hintUrl = 'https://blockbra.in/draw';
    var hintText = 'Visit ' + hintUrl + ' to create';
    var avatarW = 0;
    
    if (hasArt && entry.fromName) {
        // Try to render small avatar for the artist
        avatarW = 5; // Small avatar width
        var avatarLib = this._avatarLib;
        var artistName = entry.fromName;
        var usernum = 0;
        
        // Try to match artist to BBS user
        if (typeof system !== 'undefined' && typeof system.matchuser === 'function') {
            usernum = system.matchuser(artistName);
        }
        
        // Draw avatar placeholder area (2 rows x 5 cols)
        if (avatarLib && typeof avatarLib.read === 'function' && usernum) {
            var avatarObj = avatarLib.read(usernum, artistName);
            if (avatarObj && avatarObj.data) {
                var avatarArt = base64_decode(avatarObj.data);
                if (avatarArt) {
                    blitAvatarToFrame(this._bitmapViewerFrame, avatarArt, avatarW, headerH, 1, headerY);
                }
            }
        } else {
            // No avatar - show initials
            var initials = '[' + artistName.substr(0, 2).toUpperCase() + ']';
            for (var ii = 0; ii < initials.length && ii < avatarW; ii++) {
                this._bitmapViewerFrame.setData(1 + ii, headerY, initials.charAt(ii), BG_BLUE | YELLOW, false);
            }
        }
        
        // Draw artist name beside avatar
        var textX = 1 + avatarW + 1;
        var byLine = 'By: ' + artistName;
        for (var bi = 0; bi < byLine.length && textX + bi < frameW - 1; bi++) {
            this._bitmapViewerFrame.setData(textX + bi, headerY, byLine.charAt(bi), BG_BLUE | WHITE, false);
        }
        // Draw hint on second header row
        for (var hi = 0; hi < hintText.length && textX + hi < frameW - 1; hi++) {
            this._bitmapViewerFrame.setData(textX + hi, headerY + 1, hintText.charAt(hi), BG_BLUE | LIGHTCYAN, false);
        }
    } else {
        // No art - center the hint text
        var hintX = Math.max(1, Math.floor((frameW - hintText.length) / 2));
        for (var hi = 0; hi < hintText.length && hintX + hi < frameW - 1; hi++) {
            this._bitmapViewerFrame.setData(hintX + hi, headerY, hintText.charAt(hi), BG_BLUE | LIGHTCYAN, false);
        }
    }
    
    // If no art, we're done after drawing status
    if (!hasArt) {
        var statusY = frameH - 2;
        var statusNoArt = ' any key to close ';
        var statusX = Math.max(0, Math.floor((frameW - statusNoArt.length) / 2));
        for (var si = 0; si < statusNoArt.length && statusX + si < frameW; si++) {
            this._bitmapViewerFrame.setData(statusX + si, statusY, statusNoArt.charAt(si), BG_BLUE | LIGHTCYAN, false);
        }
        this._bitmapViewerFrame.cycle();
        var parent = this.parentFrame || this.chatOutputFrame;
        if (parent) parent.cycle();
        return;
    }
    
    // Draw bitmap content with scroll offset
    var startX = 1;
    var startY = 1 + headerH; // Below the header area
    
    if (this._bitmap256Color) {
        // 256-color mode: render directly to console with ANSI escapes
        // First cycle the frame to draw borders/title
        this._bitmapViewerFrame.cycle();
        var parent = this.parentFrame || this.chatOutputFrame;
        if (parent) parent.cycle();
        
        // Calculate absolute screen position of the frame content area
        var frameAbsX = this._bitmapViewerFrame.x;
        var frameAbsY = this._bitmapViewerFrame.y;
        
        // Build and output each row directly
        for (var y = 0; y < viewH; y++) {
            var srcY = y + scrollY;
            if (srcY >= entry.height) continue;
            
            // Position cursor at start of this row
            console.gotoxy(frameAbsX + startX, frameAbsY + startY + y);
            
            var rowStr = '';
            var lastFg = -1, lastBg = -1;
            
            for (var x = 0; x < viewW; x++) {
                var srcX = x + scrollX;
                if (srcX >= entry.width) {
                    rowStr += ' ';
                    continue;
                }
                var cell = entry.bitmap[srcY * entry.width + srcX];
                if (cell) {
                    var ch = cell.ch || ' ';
                    var charCode = cell.charCode;
                    // Replace control characters (7-13, 27) that would interfere with terminal
                    // Use space for these problematic codes  
                    if (charCode === 7 || charCode === 8 || charCode === 9 || 
                        charCode === 10 || charCode === 11 || charCode === 12 || 
                        charCode === 13 || charCode === 27) {
                        ch = ' ';
                    }
                    var fg = cell.fg !== undefined ? cell.fg : 7;
                    var bg = cell.bg !== undefined ? cell.bg : 0;
                    // Half-block optimization: if fg == bg on ▀(223) or ▄(220), use █(219)
                    if (fg === bg && (charCode === 223 || charCode === 220)) {
                        ch = ascii(219); // Full block
                    }
                    // Only emit color codes when they change
                    if (fg !== lastFg || bg !== lastBg) {
                        rowStr += '\x1b[38;5;' + fg + 'm\x1b[48;5;' + bg + 'm';
                        lastFg = fg;
                        lastBg = bg;
                    }
                    rowStr += ch;
                } else {
                    rowStr += ' ';
                }
            }
            rowStr += '\x1b[0m'; // Reset at end of row
            console.write(rowStr);
        }
    } else {
        // 16-color mode: use Frame.setData with downsampled colors
        for (var y = 0; y < viewH; y++) {
            for (var x = 0; x < viewW; x++) {
                var srcY = y + scrollY;
                var srcX = x + scrollX;
                if (srcY >= entry.height || srcX >= entry.width) continue;
                var cell = entry.bitmap[srcY * entry.width + srcX];
                if (cell) {
                    var ch = cell.ch || ' ';
                    var charCode = cell.charCode;
                    // Replace problematic control characters
                    if (charCode === 7 || charCode === 8 || charCode === 9 || 
                        charCode === 10 || charCode === 11 || charCode === 12 || 
                        charCode === 13 || charCode === 27) {
                        ch = ' ';
                    }
                    var fg16 = this._color256to16(cell.fg || 7);
                    var bg16 = this._color256to16(cell.bg || 0);
                    // Half-block optimization: if fg == bg on ▀(223) or ▄(220), use █(219)
                    if (fg16 === bg16 && (charCode === 223 || charCode === 220)) {
                        ch = ascii(219); // Full block
                    }
                    var attr = ((bg16 & 0x07) << 4) | (fg16 & 0x0F);
                    this._bitmapViewerFrame.setData(startX + x, startY + y, ch, attr, false);
                }
            }
        }
        // Cycle frame for 16-color mode
        this._bitmapViewerFrame.cycle();
        var parent = this.parentFrame || this.chatOutputFrame;
        if (parent) parent.cycle();
    }
    
    // Draw status bar with scroll info
    var statusY = frameH - 2;
    var canScroll = (entry.width > viewW) || (entry.height > viewH);
    var status = (total > 1) ? ' </> ' : '';
    if (canScroll) {
        status += 'v^:scroll ';
    }
    status += 'c:color ';
    status += '(' + entry.width + 'x' + entry.height;
    if (canScroll) {
        status += ' @' + scrollX + ',' + scrollY;
    }
    status += ') any key:close';
    var statusX = Math.max(0, Math.floor((frameW - status.length) / 2));
    for (var si = 0; si < status.length && statusX + si < frameW; si++) {
        this._bitmapViewerFrame.setData(statusX + si, statusY, status.charAt(si), BG_BLUE | LIGHTCYAN, false);
    }
    
    // For 256-color mode: draw status bar directly to console instead of cycling frame
    // to avoid Frame overwriting our 256-color content
    if (this._bitmap256Color) {
        var frameAbsX = this._bitmapViewerFrame.x;
        var frameAbsY = this._bitmapViewerFrame.y;
        console.gotoxy(frameAbsX + statusX, frameAbsY + statusY);
        console.attributes = BG_BLUE | LIGHTCYAN;
        console.write(status);
        console.attributes = 7; // Reset
    } else {
        // 16-color mode: cycle to draw status bar
        this._bitmapViewerFrame.cycle();
    }
};

// Scroll bitmap viewer by delta
Chat.prototype._bitmapScroll = function (dx, dy) {
    var entry = this._bitmapQueue[this._bitmapViewIndex];
    if (!entry) return;
    
    var maxX = Math.max(0, entry.width - this._bitmapViewW);
    var maxY = Math.max(0, entry.height - this._bitmapViewH);
    
    var newX = Math.max(0, Math.min(maxX, this._bitmapScrollX + dx));
    var newY = Math.max(0, Math.min(maxY, this._bitmapScrollY + dy));
    
    if (newX !== this._bitmapScrollX || newY !== this._bitmapScrollY) {
        this._bitmapScrollX = newX;
        this._bitmapScrollY = newY;
        this._drawBitmapContent();
    }
};

// Refresh bitmap viewer (for nav)
Chat.prototype._refreshBitmapViewer = function () {
    this._drawBitmapContent();
};

// Close bitmap viewer
Chat.prototype._closeBitmapViewer = function () {
    // Reset ANSI colors first (in case 256-color mode was used)
    if (typeof console !== 'undefined') {
        try { console.write('\x1b[0m'); } catch (_) { } // Reset all attributes
        try { console.attributes = 7; } catch (_) { }   // Default colors
    }
    if (this._bitmapViewerFrame) {
        // Clear the frame before closing to avoid visual artifacts
        try { this._bitmapViewerFrame.clear(); } catch (_) { }
        try { this._bitmapViewerFrame.cycle(); } catch (_) { }
        try { this._bitmapViewerFrame.close(); } catch (_) { }
        this._bitmapViewerFrame = null;
    }
    this._bitmapViewerActive = false;
    
    // Restore stashed hotspots
    if (this.hotspots) {
        this.hotspots.restore();
    }
    
    this._needsRedraw = true;
    if (this.running) {
        try { this.draw(); } catch (e) { }
    }
    this._registerControlHotspots();
    this.updateInputFrame();
};

// Navigate bitmap viewer
Chat.prototype._bitmapViewerNav = function (delta) {
    var newIndex = this._bitmapViewIndex + delta;
    if (newIndex >= 0 && newIndex < this._bitmapQueue.length) {
        this._bitmapViewIndex = newIndex;
        // Just close the frame, don't do full close routine
        if (this._bitmapViewerFrame) {
            try { this._bitmapViewerFrame.close(); } catch (_) { }
            this._bitmapViewerFrame = null;
        }
        this._showBitmapViewer();
    }
};

// Create/update bitmap modal for current index
Chat.prototype._createBitmapModal = function () {
    var self = this;
    var entry = this._bitmapQueue[this._bitmapViewIndex];
    if (!entry) return;
    // Determine modal size based on bitmap and screen
    var screenW = (this.parentFrame && this.parentFrame.width) ? this.parentFrame.width : (console.screen_columns || 80);
    var screenH = (this.parentFrame && this.parentFrame.height) ? this.parentFrame.height : (console.screen_rows || 25);
    var modalW = Math.min(entry.width + 4, screenW - 4);
    var modalH = Math.min(entry.height + 6, screenH - 4); // +6 for title, buttons, padding
    var viewW = modalW - 4;
    var viewH = modalH - 6;
    // Build nav info
    var total = this._bitmapQueue.length;
    var current = this._bitmapViewIndex + 1;
    var navInfo = current + '/' + total;
    var title = entry.fromName + (entry.bridgeType ? ' (' + entry.bridgeType + ')' : '') + ' - ' + navInfo;
    // Render bitmap content with ANSI escape sequences for 256-color support
    var content = this._renderBitmapToAnsi(entry.bitmap, entry.width, entry.height, viewW, viewH);
    var frameAttr = this.paletteAttr('CHAT_ROSTER_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_ROSTER_MODAL_CONTENT', frameAttr);
    var titleAttr = this.paletteAttr('CHAT_ROSTER_MODAL_TITLE', frameAttr);
    var buttonAttr = this.paletteAttr('CHAT_ROSTER_MODAL_BUTTON', contentAttr);
    var buttonFocusAttr = this.paletteAttr('CHAT_ROSTER_MODAL_BUTTON_FOCUS', buttonAttr);
    // Nav hint for user (using raw ANSI to match bitmap content)
    var navHint = (total > 1) ? '\r\n\x1B[0m\x1B[38;5;14m</>:navigate, any key to close\x1B[0m' : '';
    var fullContent = content + navHint;
    try {
        this._bitmapModalActive = new Modal({
            type: 'confirm',
            title: title,
            message: fullContent,
            width: modalW,
            height: modalH + (total > 1 ? 1 : 0),
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            titleAttr: titleAttr,
            buttonAttr: buttonAttr,
            buttonFocusAttr: buttonFocusAttr,
            buttons: [
                { id: 'close', label: 'Close', isDefault: true }
            ],
            keyHandler: function (key, modal) {
                // Navigate with [ ] or arrow keys
                if (key === '[' || key === KEY_LEFT || key === '\x1B[D') {
                    if (self._bitmapViewIndex > 0) {
                        self._bitmapViewIndex--;
                        modal.close();
                        self._createBitmapModal();
                    }
                    return true;
                }
                if (key === ']' || key === KEY_RIGHT || key === '\x1B[C') {
                    if (self._bitmapViewIndex < self._bitmapQueue.length - 1) {
                        self._bitmapViewIndex++;
                        modal.close();
                        self._createBitmapModal();
                    }
                    return true;
                }
                return false;
            },
            onClose: function (result) {
                self._bitmapModalActive = null;
                self._needsRedraw = true;
                if (self.running) {
                    try { self.draw(); } catch (e) { }
                }
                self._registerControlHotspots();
                self.updateInputFrame();
            }
        });
    } catch (modalErr) {
        try { dbug('[Chat] bitmap modal error: ' + modalErr, 'chat'); } catch (_) { }
        this._bitmapModalActive = null;
    }
};

// Navigate to previous bitmap (standalone call)
Chat.prototype._bitmapNavPrev = function () {
    if (this._bitmapViewIndex > 0) {
        this._bitmapViewIndex--;
        if (this._bitmapModalActive && typeof this._bitmapModalActive.close === 'function') {
            try { this._bitmapModalActive.close(); } catch (_) { }
        }
        this._createBitmapModal();
    }
};

// Navigate to next bitmap
Chat.prototype._bitmapNavNext = function () {
    if (this._bitmapViewIndex < this._bitmapQueue.length - 1) {
        this._bitmapViewIndex++;
        if (this._bitmapModalActive && typeof this._bitmapModalActive.close === 'function') {
            try { this._bitmapModalActive.close(); } catch (_) { }
        }
        this._createBitmapModal();
    }
};

// Render bitmap data to ANSI string for display
Chat.prototype._renderBitmapToAnsi = function (bitmap, width, height, viewW, viewH) {
    // Use raw 256-color ANSI escape sequences
    var lines = [];
    var displayH = Math.min(height, viewH);
    var displayW = Math.min(width, viewW);
    var lastFg = -1, lastBg = -1;
    
    for (var y = 0; y < displayH; y++) {
        var line = '';
        lastFg = -1; lastBg = -1; // Reset per line for safety
        for (var x = 0; x < displayW; x++) {
            var cell = bitmap[y * width + x];
            if (cell) {
                var ch = cell.ch || ' ';
                var fg = (typeof cell.fg === 'number') ? cell.fg : 7;
                var bg = (typeof cell.bg === 'number') ? cell.bg : 0;
                
                // Only emit color codes when they change (optimization)
                if (fg !== lastFg || bg !== lastBg) {
                    // 256-color ANSI: ESC[38;5;Nm for fg, ESC[48;5;Nm for bg
                    line += '\x1B[38;5;' + fg + ';48;5;' + bg + 'm';
                    lastFg = fg;
                    lastBg = bg;
                }
                line += ch;
            } else {
                line += ' ';
            }
        }
        lines.push(line + '\x1B[0m'); // Reset at end of line
    }
    // Add truncation notice if needed
    if (height > viewH || width > viewW) {
        lines.push('\x1B[0m\x1B[38;5;11m(Image cropped to fit - ' + width + 'x' + height + ' original)\x1B[0m');
    }
    return lines.join('\r\n');
};

// Legacy ctrl-A converter (kept for potential fallback)
Chat.prototype._attrToCtrlA = function (fg, bg) {
    // ctrl-A color codes: n=normal, k=black, b=blue, g=green, c=cyan, r=red, m=magenta, y=yellow/brown, w=white
    // h=high intensity, i=blink, 0-7 for background
    var fgCodes = ['k', 'b', 'g', 'c', 'r', 'm', 'y', 'w', 'hk', 'hb', 'hg', 'hc', 'hr', 'hm', 'hy', 'hw'];
    var result = '\x01n'; // Reset first
    if (bg > 0 && bg < 8) result += '\x01' + bg; // Background color 1-7
    if (fg < fgCodes.length) {
        var fgCode = fgCodes[fg];
        for (var i = 0; i < fgCode.length; i++) {
            result += '\x01' + fgCode[i];
        }
    }
    return result;
};

Chat.prototype._cleanup = function () {
    this._restorePrivateMailboxHook();
    if (this._activeRosterModal && typeof this._activeRosterModal.close === 'function') {
        try { this._activeRosterModal.close(); } catch (_) { }
    }
    this._activeRosterModal = null;
    if (this._bitmapModalActive && typeof this._bitmapModalActive.close === 'function') {
        try { this._bitmapModalActive.close(); } catch (_) { }
    }
    this._bitmapModalActive = null;
    // Close bitmap viewer if open
    if (this._bitmapViewerFrame && typeof this._bitmapViewerFrame.close === 'function') {
        try { this._bitmapViewerFrame.close(); } catch (_) { }
    }
    this._bitmapViewerFrame = null;
    this._bitmapViewerActive = false;
    this._clearControlHotspots({ hard: true });
    this._disposeFrames();
};

Chat.prototype.cleanup = function () {
    // First call our own cleanup logic
    if (this._cleanup && typeof this._cleanup === 'function') {
        try { this._cleanup(); } catch (e) {
            try { if (typeof dbug === 'function') dbug('[Chat] _cleanup error: ' + e, 'chat'); } catch (_) { }
        }
    }
    // Then call parent cleanup to close frames, detach timer, etc.
    Subprogram.prototype.cleanup.call(this);
};

Chat.prototype.restoreHotspots = function () {
    try {
        this._registerControlHotspots();
        if (typeof this.draw === 'function') this.draw();
    } catch (err) {
        if (typeof log === 'function') {
            try { dbug('[Chat] restoreHotspots error: ' + err, 'chat'); } catch (_) { }
        }
    }
};


Chat.prototype._destroyControlButtons = function () {
    if (!this._controlButtons) {
        this._controlButtons = [];
        this._controlHotspotsDirty = false;
        return;
    }
    for (var i = 0; i < this._controlButtons.length; i++) {
        var btn = this._controlButtons[i];
        if (!btn || !btn.button) continue;
        try { btn.button.destroy(); } catch (_) { }
    }
    this._controlButtons = [];
    this._clearControlHotspots();
    this._controlHotspotsDirty = false;
};

Chat.prototype._buildControlButtons = function (opts) {
    opts = opts || {};
    this._destroyControlButtons();
    if (!this.chatControlsFrame || this.chatControlsFrame.height < 1) return;
    this._hotspotTokenSeq = 0;
    var frame = this.chatControlsFrame;
    if (frame.width <= 6) return;
    var buttonAttr = opts.buttonAttr || frame.attr;
    var buttonFocusAttr = opts.buttonFocusAttr || buttonAttr;
    var rowY = Math.min(frame.height, 2);
    var margin = 2;
    var gap = 2;
    var currentX = margin;
    var maxWidth = frame.width;
    var self = this;
    // Use a stable single-char token unlikely to conflict with typical typing: 0x0E (Shift Out)
    // Avoid ESC-based multi-byte sequences which previously caused premature exits.
    // Use ~token~ style hotspot tokens (multi-char escape sequence pattern)
    // These are matched via buffer accumulation in _processControlHotspotInput
    // Dynamic label for /img button showing image count
    var imgCount = (this._bitmapQueue && this._bitmapQueue.length) ? this._bitmapQueue.length : 0;
    var imgLabel = imgCount > 0 ? '/img(' + imgCount + ')' : '/img';
    var buttonDefs = [
        {
            id: 'exit',
            label: '/exit',
            action: 'back',
            hotKeys: [],
            hotspotToken: '~ex~'
        },
        {
            id: 'img',
            label: imgLabel,
            action: 'img',
            hotKeys: [],
            hotspotToken: '~im~'
        },
        {
            id: 'who',
            label: '/who',
            action: 'roster',
            hotKeys: [],
            hotspotToken: '~wh~'
        },
        {
            id: 'help',
            label: '/help',
            action: 'help',
            hotKeys: [],
            hotspotToken: '~he~'
        },
        {
            id: 'info',
            label: '/info',
            action: 'info',
            hotKeys: [],
            hotspotToken: '~in~'
        },
        {
            id: 'channels',
            label: '/channels',
            action: 'channels',
            hotKeys: [],
            hotspotToken: '~ch~'
        },
        {
            id: 'settings',
            label: '/settings',
            action: 'settings',
            hotKeys: [],
            hotspotToken: '~se~'
        }
    ];
    // Extract blend color from controls frame background
    var frameBg = (frame && frame.attr) ? ((frame.attr >> 4) & 0x07) : BLACK;
    var buttonShadowColors = [8, frameBg]; // shadow=DARKGRAY(8), blend=frameBg
    for (var i = 0; i < buttonDefs.length; i++) {
        var def = buttonDefs[i];
        var minWidth = Math.max(6, def.label.length + 2);
        var remaining = maxWidth - currentX + 1;
        if (remaining < minWidth) break;
        var width = Math.min(minWidth, remaining);
        var btn = new Button({
            parentFrame: frame,
            x: currentX,
            y: rowY,
            width: width,
            height: Math.min(2, frame.height - rowY + 1),
            attr: buttonAttr,
            focusAttr: buttonFocusAttr,
            shadowColors: buttonShadowColors,
            label: def.label,
            onClick: (function (action) {
                return function () { self._activateControlAction(action); };
            })(def.action)
        });
        this._controlButtons.push({
            id: def.id,
            action: def.action,
            hotKeys: def.hotKeys || [],
            hotspotToken: def.hotspotToken || null,
            button: btn
        });
        currentX += width + gap;
        if (currentX >= maxWidth) break;
    }
    this._controlHotspotsDirty = true;
    this._registerControlHotspots();
};

Chat.prototype._renderControlButtons = function () {
    if (!this._controlButtons) return;
    for (var i = 0; i < this._controlButtons.length; i++) {
        var btn = this._controlButtons[i];
        if (btn && btn.button && typeof btn.button.render === 'function') {
            try { btn.button.render(); } catch (_) { }
        }
    }
};

Chat.prototype._renderHeaderFrame = function () {
    if (!this.headerFrame) return;
    var attr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('CHAT_HEADER', this.headerFrame.attr || 0) : (this.headerFrame.attr || 0);
    this.headerFrame.attr = attr;
    try { this.headerFrame.clear(attr); } catch (_) { }
    var title = 'Chat';
    if (this.channel) title += ' - ' + this.channel;
    var text = title;
    var width = this.headerFrame.width || 0;
    if (width <= 0) return;
    if (text.length > width) text = text.substr(0, width);
    var startX = Math.max(1, Math.floor((width - text.length) / 2) + 1);
    try {
        this.headerFrame.gotoxy(startX, 1);
        this.headerFrame.putmsg(text, attr);
    } catch (_) { }
    this._expectedHeaderAttr = attr;
};

Chat.prototype._formatControlsInfo = function () {
    var channel = this.channel ? this.channel : 'main';
    return 'Channel: ' + channel;
};

Chat.prototype._renderControlsArea = function () {
    if (!this.chatControlsFrame) return;
    var attr = (typeof this.paletteAttr === 'function') ? this.paletteAttr('CHAT_CONTROLS', this.chatControlsFrame.attr || 0) : (this.chatControlsFrame.attr || 0);
    this.chatControlsFrame.attr = attr;
    try { this.chatControlsFrame.clear(attr); } catch (_) { }
    var info = this._formatControlsInfo();
    if (info) {
        var width = this.chatControlsFrame.width || 0;
        var text = info;
        if (text.length > width) text = text.substr(0, width);
        var startX = Math.max(1, Math.floor((width - text.length) / 2) + 1);
        try {
            this.chatControlsFrame.gotoxy(startX, 1);
            this.chatControlsFrame.putmsg(text);
        } catch (_) { }
    }
    this._renderControlButtons();
};

Chat.prototype._nextControlHotspotToken = function () {
    if (this._hotspotTokenSeq === null || typeof this._hotspotTokenSeq === 'undefined') this._hotspotTokenSeq = 0;
    var base = 0x10 + (this._hotspotTokenSeq % 8); // 0x10 - 0x17
    var offset = 0x18 + ((this._hotspotTokenSeq / 8) | 0) % 8; // 0x18 - 0x1F
    this._hotspotTokenSeq += 1;
    return String.fromCharCode(base) + String.fromCharCode(offset);
};

Chat.prototype._handleRosterRequest = function () {
    this._showRosterModal();
};

Chat.prototype._fetchJsonChatRoster = function () {
    if (!this.jsonchat || !this.jsonchat.client || typeof this.jsonchat.client.who !== 'function') return [];
    var channelName = this.channel || 'main';
    var seenNames = {};
    var candidates = [];
    function addCandidate(name) {
        if (!name) return;
        var normalized = String(name);
        if (seenNames[normalized]) return;
        seenNames[normalized] = true;
        candidates.push(normalized);
    }
    addCandidate(channelName);
    addCandidate(channelName.toUpperCase());
    addCandidate(channelName.toLowerCase());
    if (channelName.charAt(0) !== '#') addCandidate('#' + channelName);
    var results = [];
    for (var i = 0; i < candidates.length; i++) {
        var chan = candidates[i];
        var location = 'channels.' + chan + '.messages';
        try {
            var whoResult = this.jsonchat.client.who('chat', location);
            if (!whoResult) continue;
            for (var j = 0; j < whoResult.length; j++) {
                var entry = whoResult[j];
                if (entry != null) results.push(entry);
            }
            if (results.length) break;
        } catch (whoErr) {
            if (typeof log === 'function') {
                try { dbug('[Chat] jsonchat who failed for ' + location + ': ' + whoErr, 'chat'); } catch (_) { }
            }
        }
    }
    return results;
};

Chat.prototype._getRosterEntries = function () {
    var entries = [];
    var seen = {};
    var sourceCounts = {};
    function normalize(str) {
        return (str && str !== 0) ? String(str).trim() : '';
    }
    function addEntry(rawName, rawBbs, source) {
        var name = normalize(rawName);
        if (!name.length) return;
        var bbs = normalize(rawBbs);
        if (!bbs.length && typeof system !== 'undefined' && system && system.name) {
            bbs = String(system.name);
        }
        if (!bbs.length) bbs = 'Unknown BBS';
        var key = (name + '|' + bbs).toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        if (source) {
            if (!Object.prototype.hasOwnProperty.call(sourceCounts, source)) sourceCounts[source] = 0;
            sourceCounts[source] += 1;
        }
        entries.push({ username: name, bbs: bbs });
    }
    function extractJsonEntry(entry) {
        if (!entry) return;
        var possibleName;
        if (entry.nick && typeof entry.nick === 'object') {
            possibleName = entry.nick.name || entry.nick.alias || entry.nick.user;
            if (!possibleName && entry.nick.toString) possibleName = entry.nick.toString();
        } else {
            possibleName = entry.nick || entry.name || entry.alias || entry.user || entry.id || entry.uid;
        }
        // Skip bridge services - they're infrastructure, not users
        if (possibleName === 'DiscordBridge' || possibleName === 'BlockbrainBridge' || possibleName === 'BLOCKBRAIN') return;
        var possibleBbs = entry.system || (entry.nick && entry.nick.host) || entry.host || entry.origin || entry.bbs;
        // Skip entries from bridge hosts that aren't actual bridged users
        if (possibleBbs === 'discord.bridge' && (!possibleName || possibleName.indexOf('DISCORD:') !== 0)) return;
        if (possibleBbs === 'blockbrain.bridge' && (!possibleName || possibleName.indexOf('BLOCKBRAIN:') !== 0)) return;
        addEntry(possibleName, possibleBbs, 'jsonchat');
    }

    if (typeof user !== 'undefined' && user && user.alias) {
        var selfBbs = (typeof system !== 'undefined' && system && system.name) ? system.name : '';
        addEntry(user.alias, selfBbs, 'self');
    }

    var jsonRoster;
    try {
        jsonRoster = this._fetchJsonChatRoster();
    } catch (_jsonErr) {
        if (typeof log === 'function') {
            try { dbug('[Chat] _fetchJsonChatRoster threw: ' + _jsonErr, 'chat'); } catch (_) { }
        }
        jsonRoster = [];
    }
    if (jsonRoster && jsonRoster.length) {
        for (var r = 0; r < jsonRoster.length; r++) {
            extractJsonEntry(jsonRoster[r]);
        }
    }

    if (typeof log === 'function') {
        try {
            var breakdown = [];
            for (var key in sourceCounts) {
                if (!Object.prototype.hasOwnProperty.call(sourceCounts, key)) continue;
                breakdown.push(key + ':' + sourceCounts[key]);
            }
            dbug('[Chat] roster sources => ' + (breakdown.length ? breakdown.join(', ') : 'none') + ' total=' + entries.length, 'chat');
        } catch (_) { }
    }

    entries.sort(function (a, b) {
        var nameCmp = a.username.localeCompare(b.username);
        if (nameCmp !== 0) return nameCmp;
        return a.bbs.localeCompare(b.bbs);
    });
    return entries;
};

Chat.prototype._showRosterModal = function () {
    if (typeof log === 'function') {
        try { dbug('[Chat] _showRosterModal invoked', 'chat'); } catch (_) { }
    }
    if (typeof Modal !== 'function') {
        if (typeof log === 'function') {
            try { dbug('[Chat] Modal constructor unavailable; falling back to status text', 'chat'); } catch (_) { }
        }
        this._statusText = 'Feature unavailable';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return;
    }

    var roster = [];
    try {
        roster = this._getRosterEntries();
    } catch (err) {
        if (typeof log === 'function') {
            try { dbug('[Chat] roster gather failed: ' + err, 'chat'); } catch (_) { }
        }
        roster = [];
    }

    if (typeof log === 'function') {
        try { dbug('[Chat] roster entry count => ' + roster.length, 'chat'); } catch (_) { }
    }

    var body;
    if (roster.length) {
        var lines = [];
        for (var li = 0; li < roster.length; li++) {
            var entry = roster[li];
            if (!entry) continue;
            var username = entry.username || 'Unknown';
            var bbs = entry.bbs || 'Unknown BBS';
            lines.push(username + ' - ' + bbs);
        }
        body = lines.join('\r\n');
    } else {
        body = 'No one else is here right now.';
    }
    var frameAttr = this.paletteAttr('CHAT_ROSTER_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_ROSTER_MODAL_CONTENT', frameAttr);
    var titleAttr = this.paletteAttr('CHAT_ROSTER_MODAL_TITLE', frameAttr);
    var buttonAttr = this.paletteAttr('CHAT_ROSTER_MODAL_BUTTON', contentAttr);
    var buttonFocusAttr = this.paletteAttr('CHAT_ROSTER_MODAL_BUTTON_FOCUS', buttonAttr);
    var self = this;
    if (this._activeRosterModal && typeof this._activeRosterModal.close === 'function') {
        try { this._activeRosterModal.close(); } catch (_) { }
    }
    try {
        this._activeRosterModal = new Modal({
            type: 'confirm',
            title: "Who's Here",
            message: body,
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            titleAttr: titleAttr,
            buttonAttr: buttonAttr,
            buttonFocusAttr: buttonFocusAttr,
            buttons: [
                { id: 'ok', label: 'OK', isDefault: true }
            ],
            onClose: function () {
                if (typeof log === 'function') {
                    try { dbug('[Chat] roster modal closed', 'chat'); } catch (_) { }
                }
                self._activeRosterModal = null;
                self._needsRedraw = true;
                if (self.running) {
                    try { self.draw(); } catch (e) { }
                }
                self._registerControlHotspots();
                // Force input frame refresh after modal to avoid stale cursor or residual chars
                self.updateInputFrame();
            }
        });
        if (typeof log === 'function') {
            try { dbug('[Chat] roster modal created', 'chat'); } catch (_) { }
        }
    } catch (modalErr) {
        if (typeof log === 'function') {
            var detail = modalErr && modalErr.stack ? modalErr.stack : modalErr;
            try { dbug('[Chat] roster modal creation failed: ' + detail, 'chat'); } catch (_) { }
        }
        this._activeRosterModal = null;
        this._registerControlHotspots();
        this._statusText = 'Unable to show roster';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
    }
};

// Stub: Help modal - shows available commands
Chat.prototype._showHelpModal = function () {
    if (typeof log === 'function') {
        try { dbug('[Chat] _showHelpModal invoked', 'chat'); } catch (_) { }
    }
    if (typeof Modal !== 'function') {
        this._statusText = 'Help: /exit, /who, /msg, /r, /help, /info, /channels, /settings';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return;
    }
    var helpText = [
        'Available Commands:',
        '',
        '/exit    - Leave chat',
        '/who     - See who is online',
        '/msg     - Send a private message',
        '/r       - Reply to last private message',
        '/img     - View bitmap art',
        '/help    - Show this help',
        '/info    - Channel information',
        '/channels - List channels',
        '/settings - Chat preferences',
        '',
        'TAB - Autocomplete usernames'
    ].join('\r\n');
    var frameAttr = this.paletteAttr('CHAT_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_MODAL_CONTENT', frameAttr);
    var self = this;
    try {
        new Modal({
            type: 'confirm',
            title: 'Help',
            message: helpText,
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
            onClose: function () {
                self._needsRedraw = true;
                if (self.running) try { self.draw(); } catch (_) { }
                self._registerControlHotspots();
                self.updateInputFrame();
            }
        });
    } catch (e) {
        this._statusText = 'Help unavailable';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
    }
};

// Stub: Info modal - shows channel information
Chat.prototype._showInfoModal = function () {
    if (typeof log === 'function') {
        try { dbug('[Chat] _showInfoModal invoked', 'chat'); } catch (_) { }
    }
    if (typeof Modal !== 'function') {
        this._statusText = 'Channel: ' + (this.channel || 'default');
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return;
    }
    var infoText = [
        'Channel: ' + (this.channel || 'default'),
        '',
        'JSON Chat service connected.',
        '',
        '(More info coming soon)'
    ].join('\r\n');
    var frameAttr = this.paletteAttr('CHAT_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_MODAL_CONTENT', frameAttr);
    var self = this;
    try {
        new Modal({
            type: 'confirm',
            title: 'Channel Info',
            message: infoText,
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
            onClose: function () {
                self._needsRedraw = true;
                if (self.running) try { self.draw(); } catch (_) { }
                self._registerControlHotspots();
                self.updateInputFrame();
            }
        });
    } catch (e) {
        this._statusText = 'Info unavailable';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
    }
};

// Stub: Channels modal - placeholder for channel listing
Chat.prototype._showChannelsModal = function () {
    if (typeof log === 'function') {
        try { dbug('[Chat] _showChannelsModal invoked', 'chat'); } catch (_) { }
    }
    if (typeof Modal !== 'function') {
        this._statusText = 'Channels feature coming soon';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return;
    }
    var channelsText = [
        'Available Channels:',
        '',
        '* ' + (this.channel || 'default') + ' (current)',
        '',
        '(Channel switching coming soon)'
    ].join('\r\n');
    var frameAttr = this.paletteAttr('CHAT_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_MODAL_CONTENT', frameAttr);
    var self = this;
    try {
        new Modal({
            type: 'confirm',
            title: 'Channels',
            message: channelsText,
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
            onClose: function () {
                self._needsRedraw = true;
                if (self.running) try { self.draw(); } catch (_) { }
                self._registerControlHotspots();
                self.updateInputFrame();
            }
        });
    } catch (e) {
        this._statusText = 'Channels unavailable';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
    }
};

// Stub: Settings modal - placeholder for preferences
Chat.prototype._showSettingsModal = function () {
    if (typeof log === 'function') {
        try { dbug('[Chat] _showSettingsModal invoked', 'chat'); } catch (_) { }
    }
    if (typeof Modal !== 'function') {
        this._statusText = 'Settings feature coming soon';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
        return;
    }
    var settingsText = [
        'Chat Settings:',
        '',
        '(Preferences coming soon)',
        '',
        '- Notification sounds',
        '- Color theme',
        '- Message history'
    ].join('\r\n');
    var frameAttr = this.paletteAttr('CHAT_MODAL_FRAME', this.chatOutputFrame ? this.chatOutputFrame.attr : 0);
    var contentAttr = this.paletteAttr('CHAT_MODAL_CONTENT', frameAttr);
    var self = this;
    try {
        new Modal({
            type: 'confirm',
            title: 'Settings',
            message: settingsText,
            parentFrame: this.parentFrame || this.chatOutputFrame || null,
            captureKeys: true,
            attr: frameAttr,
            contentAttr: contentAttr,
            buttons: [{ id: 'ok', label: 'OK', isDefault: true }],
            onClose: function () {
                self._needsRedraw = true;
                if (self.running) try { self.draw(); } catch (_) { }
                self._registerControlHotspots();
                self.updateInputFrame();
            }
        });
    } catch (e) {
        this._statusText = 'Settings unavailable';
        this._lastStatusUpdateTs = Date.now();
        this._lastInputRendered = '';
        this._refreshHeaderAndInput(true);
    }
};

Chat.prototype._clearControlHotspots = function (opts) {
    if (typeof log === 'function') {
        try { dbug('[Chat] clearing control hotspots', 'chat'); } catch (_) { }
    }
    if (this.hotspots) {
        if (opts && opts.hard) this.hotspots.clear();
        else this.hotspots.deactivate();
    }
    this._hotspotActionMap = {};
    this._controlButtonHotkeyMap = {};
    this._hotspotBuffer = '';
};

Chat.prototype._registerControlHotspots = function () {
    this._clearControlHotspots();
    if (!this._controlButtons || !this._controlButtons.length) return;
    var registered = 0;
    var defs = [];
    for (var i = 0; i < this._controlButtons.length; i++) {
        var entry = this._controlButtons[i];
        if (!entry || !entry.button || !entry.button.frame) continue;
        var frame = entry.button.frame;
        var minX = frame.x;
        var maxX = frame.x + frame.width - 1;
        var minY = Math.max(1, frame.y - 1);
        var maxY = Math.max(minY, minY + frame.height - 1);
        var keys = entry.hotKeys || [];
        for (var k = 0; k < keys.length; k++) {
            var key = keys[k];
            this._controlButtonHotkeyMap[key] = entry.action;
            if (typeof key === 'string' && key.length === 1) {
                defs.push({
                    key: key,
                    x: minX,
                    y: minY,
                    width: Math.max(1, maxX - minX + 1),
                    height: Math.max(1, maxY - minY + 1),
                    swallow: false,
                    owner: 'chat:control',
                    data: { action: entry.action }
                });
                registered += 1;
            }
        }
        if (entry.hotspotToken && typeof entry.hotspotToken === 'string' && entry.hotspotToken.length > 0) {
            this._hotspotActionMap[entry.hotspotToken] = entry.action;
            // Register each row explicitly (top and bottom of button) swallow=false so token propagates
            var rows = [];
            if (minY === maxY) rows.push(minY); else { rows.push(minY); rows.push(maxY); }
            for (var ry = 0; ry < rows.length; ry++) {
                defs.push({
                    key: entry.hotspotToken,
                    x: minX,
                    y: rows[ry],
                    width: Math.max(1, maxX - minX + 1),
                    height: 1,
                    swallow: false,
                    owner: 'chat:control-token',
                    data: { action: entry.action }
                });
            }
            registered += 1;
        }
    }
    if (this.hotspots) this.hotspots.set(defs);
    if (typeof log === 'function') {
        try { dbug('[Chat] registered control hotspots => ' + registered, 'chat'); } catch (_) { }
    }
    this._controlHotspotsDirty = false;
};

Chat.prototype._activateControlAction = function (action) {
    if (typeof log === 'function') {
        try { dbug('[Chat] _activateControlAction action=' + action, 'chat'); } catch (_) { }
    }
    if (!action) return false;
    switch (action) {
        case 'back':
            this.exit();
            return true;
        case 'roster':
            this._showRosterModal();
            return true;
        case 'help':
            this._showHelpModal();
            return true;
        case 'info':
            this._showInfoModal();
            return true;
        case 'channels':
            this._showChannelsModal();
            return true;
        case 'settings':
            this._showSettingsModal();
            return true;
        case 'img':
            if (this._bitmapViewerActive) {
                this._closeBitmapViewer();
            } else {
                this._showBitmapModal();
            }
            return true;
        default:
            return false;
    }
};

Chat.prototype._handleControlHotkey = function (key) {
    if (typeof log === 'function') {
        try { dbug('[Chat] _handleControlHotkey key=' + JSON.stringify(key) + ' mapHit=' + (this._controlButtonHotkeyMap && Object.prototype.hasOwnProperty.call(this._controlButtonHotkeyMap, key)), 'chat'); } catch (_) { }
    }
    if (!key || !this._controlButtonHotkeyMap) return false;
    if (!Object.prototype.hasOwnProperty.call(this._controlButtonHotkeyMap, key)) return false;
    return this._activateControlAction(this._controlButtonHotkeyMap[key]);
};

Chat.prototype._processControlHotspotInput = function (key) {
    if (!key || !this._hotspotActionMap) return false;
    var hasToken = false;
    for (var probe in this._hotspotActionMap) {
        if (Object.prototype.hasOwnProperty.call(this._hotspotActionMap, probe)) {
            hasToken = true;
            break;
        }
    }
    if (!hasToken) {
        this._hotspotBuffer = '';
        return false;
    }
    this._hotspotBuffer += key;
    if (this._hotspotBuffer.length > 16) this._hotspotBuffer = this._hotspotBuffer.substr(this._hotspotBuffer.length - 16);
    var handled = false;
    for (var token in this._hotspotActionMap) {
        if (!Object.prototype.hasOwnProperty.call(this._hotspotActionMap, token)) continue;
        if (!token || !token.length) continue;
        if (this._hotspotBuffer.slice(-token.length) === token) {
            handled = this._activateControlAction(this._hotspotActionMap[token]) || handled;
            this._hotspotBuffer = '';
        }
    }
    if (handled) return true;
    if (this._hotspotBuffer.length) {
        var keep = false;
        for (var t in this._hotspotActionMap) {
            if (!Object.prototype.hasOwnProperty.call(this._hotspotActionMap, t)) continue;
            if (!t || !t.length) continue;
            if (t.indexOf(this._hotspotBuffer) === 0) {
                keep = true;
                break;
            }
        }
        if (!keep) {
            this._hotspotBuffer = '';
            return false;
        }
        // We're building up a potential token - swallow the character
        return true;
    }
    return false;
};

Chat.prototype.initFrames = function () {
    this._ensureFrames();
};

Chat.prototype.refresh = function () {
    this._needsRedraw = true;
    this.cycle();
}

Chat.prototype.cycle = function () {
    if (!this.running) return;
    // When bitmap viewer is active, only cycle jsonchat for message updates
    if (this._bitmapViewerActive && this._bitmapViewerFrame) {
        // Still process incoming messages
        if (this.jsonchat && typeof this.jsonchat.cycle === 'function') {
            var client = this.jsonchat.client;
            if (client && client.connected && client.socket && client.socket.data_waiting) {
                try { this.jsonchat.cycle(); } catch (_) { }
            }
        }
        return;
    }
    if (this.headerFrame && typeof this._expectedHeaderAttr === 'number') {
        var actualAttr = this.headerFrame.attr;
        if (actualAttr !== this._expectedHeaderAttr) {
            if (this._lastHeaderAttrLog !== actualAttr) {
                if (typeof log === 'function') {
                    try { dbug('[Chat] header attr drift: expected=' + this._expectedHeaderAttr + ' actual=' + actualAttr, 'chat'); } catch (_) { }
                }
                this._lastHeaderAttrLog = actualAttr;
            }
        } else {
            this._lastHeaderAttrLog = actualAttr;
        }
    }
    this._ensureFrames();
    // Defensive: check connection health before cycling to avoid 30s blocking socket reads
    if (this.jsonchat && typeof this.jsonchat.cycle === 'function') {
        var client = this.jsonchat.client;
        if (client && client.connected) {
            // Skip if no data waiting - prevents blocking on partial data
            if (client.socket && !client.socket.data_waiting) {
                // No data to read, skip cycle
            } else {
                var cycleStart = Date.now();
                try { this.jsonchat.cycle(); } catch (e) {
                    try { log(LOG_WARNING, '[Chat.cycle] jsonchat cycle error: ' + e); } catch (_) { }
                }
                var cycleDuration = Date.now() - cycleStart;
                if (cycleDuration > 2000) {
                    try { log(LOG_WARNING, '[Chat.cycle] jsonchat cycle took ' + cycleDuration + 'ms - potential blocking!'); } catch (_) { }
                }
            }
        }
    }
    var now = Date.now();
    // Flash /img button when new bitmaps are available
    if (this._newBitmapCount > 0 && this._controlButtons) {
        var flashInterval = 600; // ms between flash toggles
        if (!this._imgButtonFlashTs || (now - this._imgButtonFlashTs) >= flashInterval) {
            this._imgButtonFlashState = !this._imgButtonFlashState;
            this._imgButtonFlashTs = now;
            // Update img button attr
            for (var bi = 0; bi < this._controlButtons.length; bi++) {
                var btnEntry = this._controlButtons[bi];
                if (btnEntry && btnEntry.id === 'img' && btnEntry.button) {
                    var normalAttr = this.paletteAttr('CHAT_BUTTON', BG_CYAN | WHITE);
                    var flashAttr = this.paletteAttr('CHAT_BUTTON_FLASH', BG_RED | YELLOW);
                    btnEntry.button.attr = this._imgButtonFlashState ? flashAttr : normalAttr;
                    try { btnEntry.button.render(); } catch (_) { }
                }
            }
        }
    } else if (this._imgButtonFlashState) {
        // Reset flash state when no new bitmaps
        this._imgButtonFlashState = false;
        this._imgButtonFlashTs = 0;
        for (var bi = 0; bi < this._controlButtons.length; bi++) {
            var btnEntry = this._controlButtons[bi];
            if (btnEntry && btnEntry.id === 'img' && btnEntry.button) {
                btnEntry.button.attr = this.paletteAttr('CHAT_BUTTON', BG_CYAN | WHITE);
                try { btnEntry.button.render(); } catch (_) { }
            }
        }
    }
    if (!this.input || !this.input.length) {
        if (now - this._lastStatusUpdateTs > this._statusRefreshIntervalMs) {
            var context = this._buildCrumbContext();
            var status = this._formatPrimaryCrumb(context) || '';
            if (status !== this._statusText) {
                this._statusText = status;
                this._lastInputRendered = '';
                this._refreshHeaderAndInput();
            }
            this._lastStatusUpdateTs = now;
        }
    } else if (this._statusText) {
        this._statusText = '';
        this._lastStatusUpdateTs = now;
        this._lastInputRendered = '';
        this._refreshHeaderAndInput();
    }
    var messages = this._getChannelMessages();
    var signature = this._computeMessageSignature(messages);
    var needsRedraw = this._needsRedraw || signature !== this._lastMessageSignature;
    var recentKey = this._lastKeyTs && (now - this._lastKeyTs) < this._redrawThrottleMs;
    if (needsRedraw) {
        if (recentKey) {
            this._needsRedraw = true;
        } else {
            this.draw();
        }
    }
};

Chat.prototype.draw = function () {
    // Skip heavy redraw when bitmap viewer is active - it renders directly to console
    if (this._bitmapViewerActive && this._bitmapViewerFrame) {
        // Throttle bitmap redraws to avoid flicker
        var nowTs = Date.now();
        if (this._lastBitmapRedrawTs && (nowTs - this._lastBitmapRedrawTs) < 100) return;
        this._lastBitmapRedrawTs = nowTs;
        // Redraw the bitmap content (handles both 16-color and 256-color modes)
        this._drawBitmapContent();
        return;
    }
    // Throttle heavy redraws if invoked too frequently (typing bursts)
    var nowTs = Date.now();
    if (this._lastRenderTs && (nowTs - this._lastRenderTs) < 25) { // 25ms min interval (~40fps)
        // Defer actual draw; mark dirty and skip
        if (!this._throttlePending) {
            var self = this;
            // Use shell timer if available, else immediate setTimeout analog via Timer
            try {
                if (this.timer && typeof this.timer.addEvent === 'function') {
                    this._throttlePending = this.timer.addEvent(30, false, function () { self._throttlePending = null; self.draw(); });
                } else {
                    // Fallback: just skip; next cycle() will redraw
                }
            } catch (e) { }
        }
        this._needsRedraw = true;
        return;
    }
    var _perfStart = (global.__ICSH_PERF__) ? Date.now() : 0;
    this._ensureFrames();
    this._renderHeaderFrame();
    this._renderControlsArea();

    var channelMessages = this._getChannelMessages();
    var signature = this._computeMessageSignature(channelMessages);
    var renderMessages = channelMessages.slice();
    if (this._pendingMessage) {
        renderMessages.push(this._pendingMessage);
    }

    var groups = this._groupMessages(renderMessages);
    this._prepareGroupLayouts(groups);
    var layout = this._buildLayoutLines(groups);
    var windowInfo = this._resolveScrollWindow(layout.totalLines);

    this._clearChatFrames();
    this.messageFrames = [];

    if (layout.totalLines > 0 && windowInfo.endLine > windowInfo.startLine) {
        this._renderGroups(groups, layout.lines, windowInfo.startLine, windowInfo.endLine);
        var tailGroup = this._findLastVisibleGroup(groups);
        if (tailGroup) {
            this.lastSender = tailGroup.sender;
            this.lastRow = tailGroup.renderEnd || 0;
            this._lastRenderedSide = tailGroup.side;
        } else {
            this.lastSender = null;
            this.lastRow = Math.max(0, windowInfo.endLine - windowInfo.startLine);
        }
    } else {
        this.lastSender = null;
        this.lastRow = 0;
    }

    this._renderAvatars(groups);
    this._lastInputRendered = '';
    this._refreshHeaderAndInput();
    this.headerFrame.top();
    this.chatInputFrame.top();
    if (this.hostFrame) this.hostFrame.cycle();
    else if (this.parentFrame) this.parentFrame.cycle();

    this._lastMessageSignature = signature;
    this._needsRedraw = false;
    this._pendingMessage = null;
    this._lastRenderTs = Date.now();
    if (_perfStart && global.__ICSH_INSTRUMENT_CHAT_REDRAW) try { global.__ICSH_INSTRUMENT_CHAT_REDRAW(_perfStart); } catch (_) { }
};

Chat.prototype._clearChatFrames = function () {
    if (this.leftAvatarFrame) this.leftAvatarFrame.clear();
    if (this.rightAvatarFrame) this.rightAvatarFrame.clear();
    if (this.leftMsgFrame) this.leftMsgFrame.clear();
    if (this.rightMsgFrame) this.rightMsgFrame.clear();
};

Chat.prototype._groupMessages = function (messages) {
    var groups = [];
    var lastSender = null;
    var currentSide = 'right';

    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (!msg || !msg.nick || typeof msg.nick.name !== 'string') continue;
        var sender = msg.nick.name;
        var senderDisplay = (typeof msg.displaySender === 'string' && msg.displaySender.length) ? msg.displaySender : sender;
        var text = this._extractMessageText(msg);
        if (!text || text.replace(/\s+/g, '') === '') continue;
        
        // Check if this is a bitmap message - process and skip from normal display
        if (this._isBitmapMessage(text)) {
            // Create unique key to prevent duplicate processing
            var bitmapKey = (msg.time || 0) + ':' + sender + ':' + text.length;
            if (!this._processedBitmapKeys[bitmapKey]) {
                this._processedBitmapKeys[bitmapKey] = true;
                this._processBitmapPayload(msg);
            }
            continue;
        }

        if (senderDisplay !== lastSender) {
            currentSide = (currentSide === 'left') ? 'right' : 'left';
            groups.push({
                sender: senderDisplay,
                nick: msg.nick,
                side: currentSide,
                messages: [],
                lastTime: msg.time || Date.now(),
                messageLines: [],
                lineCount: 0,
                renderStart: 0,
                renderEnd: 0
            });
        }

        var group = groups[groups.length - 1];
        if ((!group.nick || !group.nick.qwkid) && msg.nick) group.nick = msg.nick;
        group.messages.push(msg);
        group.lastTime = msg.time || group.lastTime;
        lastSender = senderDisplay;
    }

    return groups;
};

Chat.prototype._prepareGroupLayouts = function (groups) {
    if (!this.leftMsgFrame || !this.rightMsgFrame || !groups || groups.length === 0) return groups;

    for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var width = group.side === 'left' ? this.leftMsgFrame.width : this.rightMsgFrame.width;
        group.messageLines = this._wrapGroupMessages(group, width);
        group.lineCount = group.messageLines.length + 1;
    }

    return groups;
};

Chat.prototype._buildLayoutLines = function (groups) {
    var layout = { lines: [], totalLines: 0 };
    if (!groups || groups.length === 0) return layout;

    var lineIndex = 0;
    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        var prevGroup = (g > 0) ? groups[g - 1] : null;
        var overlap = (prevGroup && prevGroup.side !== group.side);
        if (overlap && lineIndex > 0) {
            lineIndex -= 1;
        }

        var prevTime = prevGroup ? prevGroup.lastTime : undefined;
        var timestamp = this._formatTimestamp(group.lastTime, prevTime);

        layout.lines.push({
            index: lineIndex,
            type: 'header',
            group: group,
            side: group.side,
            timestamp: timestamp,
            overlap: overlap
        });

        lineIndex += 1;

        for (var m = 0; m < group.messageLines.length; m++) {
            var entry = group.messageLines[m];
            layout.lines.push({
                index: lineIndex,
                type: 'message',
                group: group,
                side: group.side,
                text: entry.text,
                message: entry.message || group.messages[group.messages.length - 1],
                isFirstLine: !!entry.isFirstLine
            });
            lineIndex += 1;
        }
    }

    layout.totalLines = lineIndex;
    return layout;
};

Chat.prototype._resolveScrollWindow = function (totalLines) {
    var height = (this.leftMsgFrame && this.leftMsgFrame.height) ? this.leftMsgFrame.height : 0;
    if (height <= 0) height = 1;

    if (!this._userScrolled) {
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, totalLines));
    }

    if (this._userScrolled && typeof this._totalLineCount === 'number' && totalLines > this._totalLineCount) {
        this.scrollOffset += (totalLines - this._totalLineCount);
    }

    this._totalLineCount = totalLines;
    this._maxScrollOffset = Math.max(0, totalLines - height);

    if (this.scrollOffset > this._maxScrollOffset) this.scrollOffset = this._maxScrollOffset;
    if (this.scrollOffset < 0) this.scrollOffset = 0;
    if (this.scrollOffset === 0) this._userScrolled = false;

    var startLine = Math.max(0, totalLines - height - this.scrollOffset);
    var endLine = Math.min(totalLines, startLine + height);

    return { startLine: startLine, endLine: endLine, height: height };
};

Chat.prototype._findLastVisibleGroup = function (groups) {
    if (!groups) return null;
    for (var i = groups.length - 1; i >= 0; i--) {
        var group = groups[i];
        if (group && group.renderEnd !== undefined && group.renderEnd >= group.renderStart && group.renderEnd >= 1) {
            return group;
        }
    }
    return null;
};

Chat.prototype._adjustScrollOffset = function (delta) {
    if (!this.leftMsgFrame || typeof delta !== 'number' || delta === 0) return false;

    var prev = this.scrollOffset || 0;
    var max = this._maxScrollOffset || 0;
    var next = prev + delta;
    if (next < 0) next = 0;
    if (next > max) next = max;
    if (next === prev) return false;

    return this._setScrollOffset(next);
};

Chat.prototype._setScrollOffset = function (value) {
    if (!this.leftMsgFrame) return false;

    if (this.scrollOffset === 0 && value === 0) {
        this._userScrolled = false;
    }
    if (typeof value !== 'number' || isNaN(value)) value = 0;

    var max = this._maxScrollOffset || 0;
    if (value < 0) value = 0;
    if (value > max) value = max;
    if (value === this.scrollOffset) return false;

    this.scrollOffset = value;
    this._userScrolled = this.scrollOffset > 0;
    this._needsRedraw = true;
    if (this.running) this.draw();
    return true;
};

Chat.prototype._wrapGroupMessages = function (group, width) {
    var lines = [];
    var indicatorWidth = 2; // '> ' consumes two columns
    var available = Math.max(1, width - indicatorWidth);

    for (var m = 0; m < group.messages.length; m++) {
        var text = this._extractMessageText(group.messages[m]);
        if (!text) continue;
        var wrapped = this._wrapPlainText(text, available);
        for (var w = 0; w < wrapped.length; w++) {
            var segment = wrapped[w];
            if (segment === undefined || segment === null) continue;
            var content = segment;
            if (!content || !content.replace(/\s+/g, '').length) continue;
            lines.push({ text: content, message: group.messages[m], isFirstLine: (w === 0) });
        }
    }

    return lines;
};

Chat.prototype._wrapPlainText = function (text, width) {
    var normalized = (text || '').toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var segments = normalized.split('\n');
    var lines = [];

    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        if (segment.length === 0) {
            lines.push('');
            continue;
        }
        if (typeof word_wrap === 'function') {
            var wrapped = word_wrap(segment, width, segment.length, false).split(/\r?\n/);
            for (var w = 0; w < wrapped.length; w++) {
                if (wrapped[w] !== undefined) lines.push(wrapped[w]);
            }
        } else {
            for (var pos = 0; pos < segment.length; pos += width) {
                lines.push(segment.substr(pos, width));
            }
        }
    }

    return lines;
};

Chat.prototype._formatTimestamp = function (currentMs, previousMs) {
    if (typeof createTimestamp === 'function') {
        return createTimestamp(currentMs, previousMs);
    }

    if (typeof currentMs !== 'number' || isNaN(currentMs)) return '';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var dt = new Date(currentMs);
    return pad(dt.getHours()) + ':' + pad(dt.getMinutes());
};

Chat.prototype._formatGroupHeader = function (sender, width) {
    var safeSender = (sender || '').toString();
    // Strip bridge prefixes for cleaner display
    var bridge = this._parseBridgeUser(safeSender);
    if (bridge.type && bridge.username) {
        var bridgeLabel = bridge.type === 'discord' ? 'Discord' : 'Blockbrain';
        var color = bridge.type === 'discord' ? '\x01m' : '\x01y'; // magenta for Discord, yellow for Blockbrain
        safeSender = '\x01n' + color + bridge.username + ' \x01h\x01c(' + bridgeLabel + ')\x01n';
    }
    if (safeSender.length > width) {
        safeSender = safeSender.substr(0, width);
    }
    return safeSender;
};

Chat.prototype._extractMessageText = function (msg) {
    if (!msg) return '';
    if (typeof msg.str === 'string' && msg.str.length > 0) return msg.str;
    if (typeof msg.text === 'string' && msg.text.length > 0) return msg.text;
    return '';
};

Chat.prototype._computeMessageSignature = function (messages) {
    if (!messages || !messages.length) return '0';
    var last = messages[messages.length - 1] || {};
    return messages.length + ':' + (last.time || 0) + ':' + (last.nick && last.nick.name ? last.nick.name : '');
};

Chat.prototype._getChannelMessages = function () {
    if (!this.jsonchat || !this.jsonchat.channels) return [];
    var chan = this.jsonchat.channels[this.channel.toUpperCase()];
    if (!chan || !Array.isArray(chan.messages)) return [];
    return chan.messages;
};

Chat.prototype._renderGroups = function (groups, layoutLines, startLine, endLine) {
    if (!this.leftMsgFrame || !this.rightMsgFrame) return;

    var height = this.leftMsgFrame.height || 0;
    if (height <= 0) return;

    for (var resetIndex = 0; resetIndex < groups.length; resetIndex++) {
        groups[resetIndex].renderStart = 0;
        groups[resetIndex].renderEnd = -1;
    }

    for (var i = 0; i < layoutLines.length; i++) {
        var line = layoutLines[i];
        if (!line || line.index < startLine || line.index >= endLine) continue;

        var row = (line.index - startLine) + 1;
        if (row < 1 || row > height) continue;

        var frame = (line.side === 'left') ? this.leftMsgFrame : this.rightMsgFrame;
        var otherFrame = (line.side === 'left') ? this.rightMsgFrame : this.leftMsgFrame;
        var group = line.group;

        if (!frame || !otherFrame || !group) continue;

        if (line.type === 'header') {
            var headerParts = this._prepareHeaderParts(group.sender, line.timestamp, frame.width);
            this._renderGroupHeader(frame, otherFrame, row, headerParts, line.side, !!line.overlap);
            this.messageFrames.push({ msg: group.messages[group.messages.length - 1], y: row, side: line.side, isHeader: true });
        } else if (line.type === 'message') {
            this._writeLineToFrames(frame, otherFrame, row, line.text, false, line.side, line.isFirstLine);
            this.messageFrames.push({ msg: line.message, y: row, side: line.side });
        }

        if (group.renderStart <= 0 || group.renderStart > row) group.renderStart = row;
        if (group.renderEnd < row) group.renderEnd = row;
    }

    this.lastRow = Math.max(0, Math.min(height, endLine - startLine));
};

Chat.prototype._prepareHeaderParts = function (sender, timestamp, width) {
    var name = (sender || '').toString();
    // Strip bridge prefixes and add indicator for cleaner display
    var bridge = this._parseBridgeUser(name);
    var isBridged = bridge.type !== null;
    if (isBridged && bridge.username) {
        name = bridge.username + ' (' + bridge.shortLabel + ')';
    }
    if (width <= 0) return { name: '', timestamp: '', isBridged: isBridged, bridgeType: bridge.type };

    if (name.length > width) {
        name = name.substr(0, width);
        return { name: name, timestamp: '', isBridged: isBridged, bridgeType: bridge.type };
    }

    var ts = timestamp ? timestamp.toString() : '';
    if (!ts.length) return { name: name, timestamp: '', isBridged: isBridged, bridgeType: bridge.type };

    var fits = name.length + 1 + ts.length <= width;
    if (!fits) {
        var compact = this._compactTimestamp(ts);
        if (name.length + 1 + compact.length <= width) {
            ts = compact;
            fits = true;
        } else {
            var maxTs = Math.max(0, width - name.length - 1);
            if (maxTs <= 0) {
                ts = '';
            } else {
                if (compact.length > maxTs) compact = compact.substr(compact.length - maxTs);
                ts = compact;
            }
        }
    }

    return { name: name, timestamp: ts, isBridged: isBridged, bridgeType: bridge.type };
};

Chat.prototype._compactTimestamp = function (text) {
    if (!text) return '';
    var compact = text.toString();
    compact = compact.replace(/hours?/g, 'h');
    compact = compact.replace(/minutes?/g, 'm');
    compact = compact.replace(/seconds?/g, 's');
    compact = compact.replace(/\bago\b/, 'ago');
    compact = compact.replace(/\bToday\s*/i, '');
    compact = compact.replace(/\bYesterday\s*/i, 'yday ');
    compact = compact.replace(/\s+/g, ' ').trim();
    if (compact === 'just now') compact = 'now';
    return compact;
};

Chat.prototype._renderGroupHeader = function (primary, secondary, row, parts, side, preserveSecondary) {
    if (!primary || !secondary || !parts) return;
    var width = primary.width;
    var name = parts.name || '';
    var timestamp = parts.timestamp || '';
    var tsColor = this._timestampColor || this.groupLineColor;

    this._clearFrameLine(primary, row);

    var totalLen = 0;
    if (name) totalLen += name.length;
    if (timestamp) totalLen += timestamp.length;
    if (timestamp && name) totalLen += 1;

    var currentCol = 1;
    if (side === 'right') currentCol = Math.max(1, width - totalLen + 1);

    if (side === 'left') {
        if (name) currentCol = this._writeChars(primary, row, currentCol, name, this.groupLineColor);
        if (timestamp) {
            currentCol++;
            if (currentCol <= width) this._writeChars(primary, row, currentCol, timestamp, tsColor);
        }
    } else {
        if (timestamp) currentCol = this._writeChars(primary, row, currentCol, timestamp, tsColor);
        if (timestamp && name) currentCol++;
        if (name && currentCol <= width) this._writeChars(primary, row, currentCol, name, this.groupLineColor);
    }

    if (!preserveSecondary && secondary) {
        this._clearFrameLine(secondary, row);
    }
};

Chat.prototype._writeLineToFrames = function (primary, secondary, row, text, isHeader, side, isFirstLine) {
    if (!primary || !secondary || row < 1) return;

    if (isHeader) {
        this._renderGroupHeader(primary, secondary, row, { name: text || '', timestamp: '' }, side, false);
        return;
    }

    var displayText = text || '';
    var width = primary.width;
    if (typeof isFirstLine === 'undefined') isFirstLine = true;

    var indicatorAttr = this._messageIndicatorColor;
    var wrapAttr = this._wrapIndicatorColor || indicatorAttr;
    this._clearFrameLine(primary, row);
    if (side === 'right') {
        var trimmed = displayText;
        var maxContent = Math.max(0, width - 2);
        if (trimmed.length > maxContent) trimmed = trimmed.substr(trimmed.length - maxContent);
        var attr = isFirstLine ? indicatorAttr : wrapAttr;
        this._writeChars(primary, row, width, '<', attr);
        var textEnd = width - 2;
        if (trimmed.length > 0 && textEnd >= 1) {
            var startCol = Math.max(1, textEnd - trimmed.length + 1);
            this._writeChars(primary, row, startCol, trimmed);
        }
    } else {
        var available = Math.max(1, width - 2);
        if (displayText.length > available) displayText = displayText.substr(0, available);
        var attr = isFirstLine ? indicatorAttr : wrapAttr;
        this._writeChars(primary, row, 1, '>', attr);
        var textStart = width >= 3 ? 3 : Math.min(width, 2);
        if (displayText.length > 0 && textStart <= width) {
            this._writeChars(primary, row, textStart, displayText);
        }
    }

    this._clearFrameLine(secondary, row);
};

Chat.prototype._writeChars = function (frame, row, column, text, attr) {
    if (!frame || row < 1) return column || 1;
    text = text || '';
    if (!text.length) return column || 1;
    var width = frame.width || 0;
    if (width <= 0) return column || 1;
    var y = row - 1;
    var x = Math.max(1, column);
    var useAttr = (attr !== undefined && attr !== null) ? attr : frame.attr;
    for (var i = 0; i < text.length && x <= width; i++, x++) {
        var ch = text.charAt(i);
        try { frame.setData(x - 1, y, ch, useAttr, false); } catch (e) { }
    }
    return x;
};

Chat.prototype._clearFrameLine = function (frame, row) {
    if (!frame || row < 1) return;
    var width = frame.width || 0;
    if (width <= 0) return;
    var y = row - 1;
    for (var x = 0; x < width; x++) {
        var refresh = (x === width - 1);
        try { frame.setData(x, y, undefined, 0, refresh); } catch (e) { }
    }
};

Chat.prototype._getCrumbContentWidth = function () {
    if (!this.chatInputFrame) return 0;
    return Math.max(1, this.chatInputFrame.width - 1);
};

Chat.prototype._nickLabel = function (entry, fallback) {
    if (entry && entry.nick && typeof entry.nick === 'object') {
        return entry.nick.name || entry.nick.alias || entry.nick.user || fallback || '';
    }
    if (entry) return entry.nick || entry.name || entry.user || entry.alias || fallback || '';
    return fallback || '';
};

Chat.prototype._normalizeQwkId = function (qwkid) {
    if (qwkid === undefined || qwkid === null) return null;
    qwkid = String(qwkid).trim();
    if (!qwkid.length) return null;
    return qwkid.toUpperCase();
};

Chat.prototype._resolveAvatarNetaddr = function (nick) {
    if (!nick || typeof nick !== 'object') return null;
    var qwkid = this._normalizeQwkId(nick.qwkid);
    if (qwkid) return qwkid;
    return nick.host || null;
};

Chat.prototype._buildCrumbContext = function () {
    var currentUser = (typeof user !== 'undefined' && user && user.alias) ? user.alias : 'You';
    var channelName = this.channel || 'main';
    var upperChannel = channelName.toUpperCase();
    var chan = (this.jsonchat && this.jsonchat.channels) ? this.jsonchat.channels[upperChannel] : null;
    var rawUsers = (chan && chan.users) ? chan.users : [];
    var names = [];
    var seen = {};
    if (rawUsers) {
        var isArray = (typeof Array !== 'undefined' && Array.isArray) ? Array.isArray(rawUsers) : (Object.prototype.toString.call(rawUsers) === '[object Array]');
        if (isArray) {
            for (var i = 0; i < rawUsers.length; i++) {
                var entry = rawUsers[i];
                var name = this._nickLabel(entry, '');
                if (name && !seen[name]) {
                    seen[name] = true;
                    names.push(name);
                }
            }
        } else {
            for (var key in rawUsers) {
                if (!rawUsers.hasOwnProperty(key)) continue;
                var obj = rawUsers[key];
                var uname = this._nickLabel(obj, key);
                if (uname && !seen[uname]) {
                    seen[uname] = true;
                    names.push(uname);
                }
            }
        }
    }
    return {
        currentUser: currentUser,
        channelName: channelName,
        userCount: names.length,
        userNames: names
    };
};

Chat.prototype._formatPrimaryCrumb = function (context) {
    var countText = context.userCount === 1 ? '1 user' : context.userCount + ' users';
    var base = context.currentUser + ' chatting in ' + context.channelName + '. ' + countText + ' here [ESC exit]';
    if (this.scrollOffset > 0) {
        base += ' (scroll +' + this.scrollOffset + ')';
    }
    // Show bitmap notification if there are unviewed images
    if (this._newBitmapCount > 0) {
        base += ' [' + this._newBitmapCount + ' new img]';
    }
    return base;
};

Chat.prototype._fitCrumbText = function (text, width) {
    if (!text) return '';
    if (text.length <= width) return text;
    return text.substr(0, width);
};

Chat.prototype._buildUserListSegments = function (names, width) {
    var label = 'Users here: ';
    var fullList;
    if (!names || names.length === 0) {
        fullList = label + '(none)';
    } else {
        fullList = label + this._joinUserNames(names);
    }
    return this._chunkCrumbText(fullList, width);
};

Chat.prototype._joinUserNames = function (names) {
    if (!names || names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' & ' + names[1];
    var head = names.slice(0, names.length - 1).join(', ');
    return head + ' & ' + names[names.length - 1];
};

Chat.prototype._chunkCrumbText = function (text, width) {
    var chunks = [];
    if (!text || width <= 0) return chunks;
    var remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= width) {
            chunks.push(remaining);
            break;
        }
        var sliceLen = width;
        for (var i = width; i > 0; i--) {
            var ch = remaining.charAt(i - 1);
            if (ch === ' ' || ch === ',' || ch === '&') {
                sliceLen = i;
                break;
            }
        }
        if (sliceLen <= 0) sliceLen = width;
        var segment = remaining.substr(0, sliceLen).trim();
        if (!segment.length) segment = remaining.substr(0, width);
        chunks.push(segment);
        remaining = remaining.substr(sliceLen);
        remaining = remaining.replace(/^[\s,]+/, '');
    }
    return chunks;
};

Chat.prototype._writeCrumbMessage = function (text) {
    if (!this.chatInputFrame) return;
    if (!text) text = '';
    var width = this.chatInputFrame ? Math.max(1, this.chatInputFrame.width - 2) : 0;
    if (text.length > width) text = text.substr(0, width);
    this.chatInputFrame.putmsg(text);
};

Chat.prototype._renderAvatars = function (groups) {
    if (!this.leftAvatarFrame || !this.rightAvatarFrame || groups.length === 0) return;

    var placements = { left: [], right: [] };
    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        if (!group || !group.sender || group.renderEnd < group.renderStart) continue;

        var sideKey = group.side === 'left' ? 'left' : 'right';
        var frameRef = (sideKey === 'left') ? this.leftAvatarFrame : this.rightAvatarFrame;
        if (!frameRef || frameRef.height <= 0) continue;

        var frameHeightRef = frameRef.height;
        var rangeStart = Math.max(1, Math.min(group.renderStart || 1, frameHeightRef));
        var rangeEnd = Math.max(rangeStart, Math.min(group.renderEnd || rangeStart, frameHeightRef));
        var rangeHeight = Math.max(1, rangeEnd - rangeStart + 1);
        var weightedCenter = rangeStart + ((rangeHeight - 1) / 2);

        var avatarMaxHeight = this.avatarHeight || rangeHeight;
        var targetHeight = Math.max(1, Math.min(avatarMaxHeight, frameHeightRef));

        var minTop = rangeStart - targetHeight + 1;
        var maxTop = rangeEnd;
        minTop = Math.max(1, Math.min(minTop, frameHeightRef - targetHeight + 1));
        maxTop = Math.min(frameHeightRef - targetHeight + 1, maxTop);
        if (minTop > maxTop) {
            minTop = Math.max(1, Math.min(rangeStart, frameHeightRef - targetHeight + 1));
            maxTop = Math.max(minTop, Math.min(frameHeightRef - targetHeight + 1, rangeEnd));
        }

        var desiredTop = Math.round(weightedCenter - ((targetHeight - 1) / 2));
        if (desiredTop < minTop) desiredTop = minTop;
        if (desiredTop > maxTop) desiredTop = maxTop;

        placements[sideKey].push({
            key: sideKey + ':' + g,
            user: group.sender,
            nick: group.nick || null,
            y: desiredTop,
            height: targetHeight,
            minY: minTop,
            maxY: maxTop,
            available: frameHeightRef
        });
    }

    var avatarLib = this._avatarLib; // reuse shared instance
    var leftPacked = packAvatars(placements.left, this.leftAvatarFrame.height, { padding: 1 });
    var rightPacked = packAvatars(placements.right, this.rightAvatarFrame.height, { padding: 1 });

    this._drawAvatarSet(this.leftAvatarFrame, leftPacked, avatarLib);
    this._drawAvatarSet(this.rightAvatarFrame, rightPacked, avatarLib);
};

Chat.prototype._drawAvatarSet = function (frame, avatarList, avatarLib) {
    if (!frame || !Array.isArray(avatarList)) return;

    var drawnKeys = {};
    var frameWidth = frame.width;
    var artWidth = Math.min(this.avatarWidth || frameWidth, frameWidth);
    var artHeight = this.avatarHeight || frame.height;

    for (var i = 0; i < avatarList.length; i++) {
        var placement = avatarList[i];
        if (!placement || !placement.user) continue;
        var placementKey = placement.key || (placement.user + ':' + i);
        if (drawnKeys[placementKey]) continue;

        var availableHeight = placement.available || placement.height;
        var frameRemaining = Math.max(1, frame.height - placement.y + 1);
        var desiredHeight = Math.min(availableHeight, artHeight);
        var targetHeight = Math.min(frameRemaining, Math.max(placement.height, desiredHeight));
        if (placement.y < 1 || placement.y > frame.height || targetHeight <= 0) continue;

        var avatarArt = null;
        var displayUser = placement.user;
        var nick = placement.nick || null;
        var usernum = 0;
        var netaddr = null;
        var bbsid = null;
        var localQwk = this._normalizeQwkId((typeof system !== 'undefined' && system) ? system.qwk_id : '');
        var nickQwk = nick ? this._normalizeQwkId(nick.qwkid) : null;
        
        // Check if this is a bridged user (Discord, Blockbrain, etc.) and try to match to BBS user
        var bridge = this._parseBridgeUser(placement.user);
        if (bridge.type && bridge.username) {
            usernum = this._matchBridgedUserToBBS(bridge.username);
            if (usernum) {
                displayUser = bridge.username; // Use extracted name for fallback initials
                try { dbug('[Chat] ' + bridge.type + ' user "' + bridge.username + '" matched to BBS user #' + usernum, 'chat'); } catch (_) { }
            } else {
                displayUser = bridge.username; // Still use clean name for initials even if no match
            }
        } else if ((!nickQwk || nickQwk === localQwk) && typeof system !== 'undefined' && typeof system.matchuser === 'function') {
            usernum = system.matchuser(placement.user);
        }

        if (nick) {
            netaddr = this._resolveAvatarNetaddr(nick);
            bbsid = nick.host || null;
            if (nick.name) displayUser = nick.name;
        }

        if (nick && nick.avatar) {
            try { avatarArt = base64_decode(String(nick.avatar).replace(/^\s+|\s+$/g, '')); } catch (_) { avatarArt = null; }
        }

        if (!avatarArt && avatarLib && typeof avatarLib.read === 'function') {
            var avatarObj = null;
            if (usernum) avatarObj = avatarLib.read(usernum, displayUser);
            else if (netaddr) avatarObj = avatarLib.read(0, displayUser, netaddr, bbsid);
            if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
        }

        frame.gotoxy(1, placement.y);
        frame.clearline();
        frame.gotoxy(1, placement.y);

        var rendered = false;
        if (avatarArt) {
            var artRowCount = Math.floor(avatarArt.length / (artWidth * 2));
            var usableHeight = Math.min(targetHeight, artRowCount);
            if (usableHeight > 0) {
                blitAvatarToFrame(frame, avatarArt, artWidth, usableHeight, 1, placement.y);
                rendered = true;
            }
        }

        if (!rendered) {
            var initialsWidth = Math.max(1, frameWidth - 2);
            // Use extracted Discord name for initials if applicable
            var initialsSource = displayUser || placement.user;
            var initials = initialsSource.substr(0, initialsWidth).toUpperCase();
            var label = '[' + initials + ']';
            frame.putmsg(label.substr(0, frameWidth));
        }

        drawnKeys[placementKey] = true;
    }
};

Chat.prototype._refreshHeaderAndInput = function (force) {
    this._ensureFrames();
    if (typeof this._renderHeaderFrame === 'function') this._renderHeaderFrame();
    this._drawInputFrame(force);
};

// Helper: draw input frame with horizontal scrolling and cursor support
Chat.prototype._drawInputFrame = function (force) {
    if (!this.chatInputFrame) return;
    var width = this.chatInputFrame.width || 0;
    if (width <= 0) return;
    
    var prefix = 'You: ';
    var prefixLen = prefix.length;
    var contentWidth = Math.max(1, width - prefixLen);
    
    // Ensure cursor is within bounds
    if (this._inputCursor < 0) this._inputCursor = 0;
    if (this._inputCursor > this.input.length) this._inputCursor = this.input.length;
    
    // Calculate scroll offset to keep cursor visible
    // Leave 1 char margin on right for cursor visibility
    var cursorPos = this._inputCursor;
    var scrollOffset = this._inputScrollOffset || 0;
    
    // Adjust scroll if cursor is before visible area
    if (cursorPos < scrollOffset) {
        scrollOffset = cursorPos;
    }
    // Adjust scroll if cursor is past visible area (leave room for cursor char)
    if (cursorPos >= scrollOffset + contentWidth) {
        scrollOffset = cursorPos - contentWidth + 1;
    }
    // Clamp scroll offset
    if (scrollOffset < 0) scrollOffset = 0;
    var maxScroll = Math.max(0, this.input.length - contentWidth + 1);
    if (scrollOffset > maxScroll) scrollOffset = maxScroll;
    this._inputScrollOffset = scrollOffset;
    
    // Build visible portion of input
    var visibleInput = this.input.substr(scrollOffset, contentWidth);
    
    // Show status text if input is empty and not scrolled
    var statusSuffix = '';
    if (!this.input.length && this._statusText) {
        statusSuffix = '  |  ' + this._statusText;
    }
    
    // Build full display string
    var scrollIndicator = (scrollOffset > 0) ? '<' : '';
    var displayPrefix = scrollIndicator ? scrollIndicator + prefix.substr(1) : prefix;
    var display = displayPrefix + visibleInput + statusSuffix;
    
    // Pad to width
    if (display.length < width) {
        display = display + Array(width - display.length + 1).join(' ');
    } else if (display.length > width) {
        display = display.substr(0, width);
    }
    
    // Calculate cursor screen position
    var cursorScreenPos = prefixLen + (cursorPos - scrollOffset);
    if (scrollIndicator) cursorScreenPos = prefixLen + (cursorPos - scrollOffset); // same since prefix len unchanged
    
    // Skip render if nothing changed
    var signature = display + ':' + cursorScreenPos;
    if (!force && this._lastInputRendered === signature) return;
    
    // Render with cursor highlight
    this._renderInputWithCursor(display, cursorScreenPos);
    this._lastInputRendered = signature;
};

// Render input string with cursor at specified position
Chat.prototype._renderInputWithCursor = function (text, cursorPos) {
    if (!this.chatInputFrame) return;
    var width = this.chatInputFrame.width || 0;
    if (width <= 0) {
        this.chatInputFrame.gotoxy(1, 1);
        this.chatInputFrame.putmsg(text);
        return;
    }
    
    var baseAttr = (typeof this.chatInputFrame.attr === 'number') ? this.chatInputFrame.attr : 0;
    // Cursor uses inverted colors for visibility
    var cursorAttr = ((baseAttr & 0x07) << 4) | ((baseAttr >> 4) & 0x07) | (baseAttr & 0x88);
    if (cursorAttr === baseAttr) cursorAttr = (BG_WHITE | BLACK); // fallback if same
    
    for (var i = 0; i < width; i++) {
        var ch = (i < text.length) ? text.charAt(i) : ' ';
        var attr = (i === cursorPos) ? cursorAttr : baseAttr;
        try { this.chatInputFrame.setData(i, 0, ch, attr, false); } catch (e) { }
    }
    if (typeof this.chatInputFrame.cycle === 'function') {
        try { this.chatInputFrame.cycle(); } catch (e) { }
    }
}

registerModuleExports({ Chat: Chat });
