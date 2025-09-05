load("iconshell/lib/subfunctions/chat_helpers.js");
load("iconshell/lib/subfunctions/subprogram.js"); // Base class


function Chat(jsonchat) {
    // Call Subprogram base constructor
    Subprogram.call(this, { name: 'chat' });
    this.input = "";
    this.channel = "main";
    this.jsonchat = jsonchat; // persistent backend instance
    // Frame references (created lazily by initFrames / draw)
    this.chatInputFrame = null;
    this.leftAvatarFrame = null;
    this.centerMsgFrame = null;
    this.rightAvatarFrame = null;
    this.messageFrames = [];
    this.done = null; // external completion callback
    this.lastSender = null; // State tracking for last sender
    this.lastRow = 0; // State tracking for last rendered row
    this._redrawEvent = null; // placeholder for future timer event
    // Configurable group line color and pad character
    this.groupLineColor = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_GROUP_LINE) ? ICSH_VALS.CHAT_GROUP_LINE : MAGENTA;
}

// Inherit from Subprogram
if (typeof extend === 'function') {
    extend(Chat, Subprogram);
} else {
    // Fallback simple inheritance if extend() not present
    Chat.prototype = Object.create(Subprogram.prototype);
    Chat.prototype.constructor = Chat;
}

Chat.prototype.enter = function(done){
    this.done = (typeof done === 'function') ? done : function(){};
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    // Use base enter to setup frame & running state; provide wrapper to restore mouse & call original done
    var self = this;
    Subprogram.prototype.enter.call(this, function(){
        if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true; // safety if base exit triggers callback
        try { self.done(); } catch(e) {}
    });
    // Ensure frames exist before first draw (draw will call initFrames if needed)
    // (Already handled inside draw via lazy init)
    // Start periodic redraw timer (future enhancement placeholder)
};

Chat.prototype.exit = function(){
    // Stop periodic redraw timer (if implemented)
    if (this._redrawEvent) {
        this._redrawEvent.abort = true;
        this._redrawEvent = null;
    }
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
    // Let base handle running flag + cleanup + callback
    Subprogram.prototype.exit.call(this);
};
Chat.prototype.handleKey = function(key){
    // ESC key (string '\x1B')
    if (key === '\x1B') {
        this.exit();
        return;
    }
    // Enter/Return (string '\r' or '\n')
    if (key === '\r' || key === '\n') {
        if (this.input.trim().length > 0 && this.jsonchat && typeof this.jsonchat.submit === 'function') {
            var msgText = this.input;
            var nick = (typeof user !== 'undefined' && user.alias) ? { name: user.alias, number: user.number } : { name: 'You', number: 0 };
            var packet = {
                scope: 'CHAT',
                func: 'UPDATE',
                oper: 'WRITE',
                location: 'channels.' + this.channel + '.messages',
                data: {
                    nick: nick,
                    str: msgText,
                    time: (new Date()).getTime()
                }
            };
            // Render immediately for sender
            // if (typeof this.updateChat === 'function') this.updateChat(packet);
            this.jsonchat.submit(this.channel, this.input);
            this.draw();
        }
        this.input = "";
        this.updateInputFrame();
        return;
    }
    // Backspace (string '\b' or '\x7F')
    if (key === '\b' || key === '\x7F') {
        if (this.input.length > 0) {
            this.input = this.input.slice(0, -1);
            this.updateInputFrame();
        }
        return;
    }
    // Printable characters (single character string, not control)
    if (typeof key === 'string' && key.length === 1 && key >= ' ' && key <= '~') {
        this.input += key;
        this.updateInputFrame();
        return;
    }
    // Ignore all other keys
};

// Efficiently update just the chat input frame
Chat.prototype.updateInputFrame = function() {
    if (!this.chatInputFrame) return;
    this.chatInputFrame.clear();
    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
    this.chatInputFrame.cycle();
};

// Efficiently append new messages to the chat (call this from IconShell on new message event)
Chat.prototype.updateChat = function(packet) {
    // Efficiently append a new message using renderMessage, only redraw if needed
    dbug("Called update chat", "chat");
    // Clear frames before redraw
    if (this.leftAvatarFrame) this.leftAvatarFrame.clear();
    if (this.centerMsgFrame) this.centerMsgFrame.clear();
    if (this.rightAvatarFrame) this.rightAvatarFrame.clear();
    if (this.chatInputFrame) this.chatInputFrame.clear();
    // Always refresh to ensure model is up-to-date before rendering
    this.draw(packet);
    this.refresh();
};

Chat.prototype.cleanup = function(){
    // Close and null out all frames
    if (this.leftAvatarFrame) {
        this.leftAvatarFrame.close();
        this.leftAvatarFrame = null;
    }
    if (this.centerMsgFrame) {
        this.centerMsgFrame.close();
        this.centerMsgFrame = null;
    }
    if (this.rightAvatarFrame) {
        this.rightAvatarFrame.close();
        this.rightAvatarFrame = null;
    }
    if (this.chatInputFrame) {
        this.chatInputFrame.close();
        this.chatInputFrame = null;
    }
    if (this.parentFrame) {
        this.parentFrame.close();
        this.parentFrame = null;
    }
    this.messageFrames = [];
}


Chat.prototype.initFrames = function() {
	// Assume parentFrame is set externally (e.g., shell.view)
	// If not, fallback to creating a new Frame
	if (!this.parentFrame) {
		// Fallback: create a full-screen frame
		this.parentFrame = new Frame(1, 1, console.screen_columns, console.screen_rows, BG_BLACK|LIGHTGRAY);
		this.parentFrame.open();
	}
	var w = this.parentFrame.width;
	var h = this.parentFrame.height;
	// Chat output area (above input)
	var outputH = h - 3;
	// Three horizontal frames: left avatar, center message, right avatar
	this.leftAvatarFrame = new Frame(1, 1, 10, outputH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.parentFrame);
	this.centerMsgFrame = new Frame(11, 1, w - 20, outputH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.parentFrame);
	this.rightAvatarFrame = new Frame(w - 9, 1, 10, outputH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.parentFrame);
	this.leftAvatarFrame.open();
	this.centerMsgFrame.open();
	this.rightAvatarFrame.open();
	// Chat input frame (bottom)
	this.chatInputFrame = new Frame(1, h - 2, w, 2, ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG, this.parentFrame);
	this.chatInputFrame.open();
};

Chat.prototype.refresh = function(){
	this.jsonchat.cycle();
	this.draw();
}

Chat.prototype.draw = function(newMsg) {
    if (!this.leftAvatarFrame || !this.centerMsgFrame || !this.rightAvatarFrame || !this.chatInputFrame) this.initFrames();
    var chan = this.jsonchat ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
    var messages = chan ? chan.messages : [];
    if(newMsg) {
        messages.push(newMsg);
    }
    // Filter out messages without a valid nick.name property
    messages = messages.filter(function(msg) {
        return msg && msg.nick && typeof msg.nick.name === 'string' && msg.nick.name.length > 0;
    });
    var maxRows = this.centerMsgFrame.height;
    var centerWidth = this.centerMsgFrame.width;
    var avatarHeight = 6;
    var avatarWidth = 10;
    var maxMsgWidth = Math.floor(centerWidth / 2);
    this.messageFrames = [];
    var avatarLib = load({}, '../exec/load/avatar_lib.js');

    // Refactored steps
    var senderGroups = this._collectSenderGroups(messages, maxRows, maxMsgWidth, avatarHeight);
    var avatarMap = this._collectAvatarMap(senderGroups, avatarLib, avatarWidth, avatarHeight);
    this._drawAvatars(avatarMap, avatarLib, avatarWidth, avatarHeight);
    var lastMsgInfo = this._renderMessages(messages, maxRows, maxMsgWidth, centerWidth, senderGroups);
    this._drawLastDivider(messages, maxMsgWidth, centerWidth, lastMsgInfo.row, lastMsgInfo.side);
    this._drawInputFrame();
    this.parentFrame.cycle();
}

// Helper: collect sender groups and avatar placements
Chat.prototype._collectSenderGroups = function(messages, maxRows, maxMsgWidth, avatarHeight) {
    var avatarPlacements = { left: [], right: [] };
    var yCursor = 1;
    var lastSender = null;
    var side = 'left';
    var senderGroups = [];
    var currentGroup = null;
    for (var i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        var msg = messages[i];
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            var from = msg.nick.name;
            var isFirstMessage = (lastSender === null);
            var msgText = from + ': ' + (msg.str || msg.text || '');
            var lines = wrapText(msgText, maxMsgWidth);
            if (isFirstMessage || from !== lastSender) {
                side = (side === 'left') ? 'right' : 'left';
                var col = (side === 'left') ? 'left' : 'right';
                avatarPlacements[col].push({ user: from, y: yCursor, height: avatarHeight });
                if (currentGroup) senderGroups.push(currentGroup);
                currentGroup = { sender: from, start: yCursor, end: yCursor + lines.length - 1 };
            } else {
                if (currentGroup) currentGroup.end = yCursor + lines.length - 1;
            }
            yCursor += lines.length;
            lastSender = from;
        }
    }
    if (currentGroup) senderGroups.push(currentGroup);
    senderGroups.avatarPlacements = avatarPlacements;
    return senderGroups;
}

// Helper: collect avatar map
Chat.prototype._collectAvatarMap = function(senderGroups, avatarLib, avatarWidth, avatarHeight) {
    return {
        left: packAvatars(senderGroups.avatarPlacements.left),
        right: packAvatars(senderGroups.avatarPlacements.right)
    };
}

// Helper: draw avatars
Chat.prototype._drawAvatars = function(avatarMap, avatarLib, avatarWidth, avatarHeight) {
    var avatarDrawn = { left: {}, right: {} };
    var colnames = ['left', 'right'];
    for (var c = 0; c < colnames.length; c++) {
        var col = colnames[c];
        var oppositeFrame = (col === 'left') ? this.rightAvatarFrame : this.leftAvatarFrame;
        for (var i = 0; i < avatarMap[col].length; i++) {
            var a = avatarMap[col][i];
            if (avatarDrawn[col][a.user]) continue;
            var usernum = system.matchuser(a.user);
            var avatarArt = null;
            if (usernum && typeof avatarLib.read === 'function') {
                var avatarObj = avatarLib.read(usernum, a.user);
                if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
            }
            if (avatarArt && avatarArt.length >= avatarWidth * avatarHeight * 2) {
                blitAvatarToFrame(oppositeFrame, avatarArt, avatarWidth, Math.min(avatarHeight, a.height), 1, a.y);
            } else {
                oppositeFrame.gotoxy(1, a.y);
                oppositeFrame.putmsg('[ ]');
            }
            avatarDrawn[col][a.user] = true;
        }
    }
}

// Helper: render messages
Chat.prototype._renderMessages = function(messages, maxRows, maxMsgWidth, centerWidth, senderGroups) {
    var y = 1;
    var lastSender = null;
    var side = 'left';
    var firstGroup = true;
    var prevMsg = null;
    var lastMsgSide = 'left';
    for (var i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        var msg = messages[i];
        var prevMsg = (i > Math.max(0, messages.length - maxRows)) ? messages[i - 1] : null;
        if (prevMsg && msg.nick && prevMsg.nick && msg.nick.name === prevMsg.nick.name && msg.time === prevMsg.time) {
            continue;
        }
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            var from = msg.nick.name;
            var isFirstMessage = (lastSender === null);
            var msgText = from + ': ' + (msg.str || msg.text || '');
            var lines = wrapText(msgText, maxMsgWidth);
            var senderChanged = isFirstMessage || from !== lastSender;
            if (senderChanged) {
                if (!firstGroup && y > 1 && prevMsg) {
                    var curTime = Date.now();
                    var prevTime = (prevMsg && typeof prevMsg.time === 'number') ? prevMsg.time : undefined;
                    var dividerStr = getDividerString(side, maxMsgWidth, prevTime, curTime);
                    var drawY = y;
                    this.centerMsgFrame.gotoxy(2, drawY);
                    this.centerMsgFrame.putmsg(Array(centerWidth + 1).join(' '));
                    if (side === 'left') {
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
                        var rightHalf = (lines[0].length >= maxMsgWidth)
                            ? lines[0].slice(-maxMsgWidth)
                            : Array((maxMsgWidth - lines[0].length)).join(' ') + lines[0];
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(rightHalf);
                    } else {
                        var msgPadLen = maxMsgWidth - lines[0].length;
                        if (msgPadLen < 0) msgPadLen = 0;
                        var leftHalf = lines[0] + Array(msgPadLen + 1).join(' ');
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(leftHalf);
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
                    }
                    this.messageFrames.push({msg: msg, y: drawY, side: (side === 'left') ? 'right' : 'left'});
                    y += 1;
                } else {
                    var drawY = y;
                    this.centerMsgFrame.gotoxy(2, drawY);
                    this.centerMsgFrame.putmsg(Array(centerWidth + 1).join(' '));
                    if (side === 'left') {
                        var msgPadLen = maxMsgWidth - lines[0].length;
                        if (msgPadLen < 0) msgPadLen = 0;
                        var leftHalf = lines[0] + Array(msgPadLen + 1).join(' ');
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(leftHalf);
                    } else {
                        var rightHalf = (lines[0].length >= maxMsgWidth)
                            ? lines[0].slice(-maxMsgWidth)
                            : Array((maxMsgWidth - lines[0].length)).join(' ') + lines[0];
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(rightHalf);
                    }
                    this.messageFrames.push({msg: msg, y: drawY, side: (side === 'left') ? 'right' : 'left'});
                    y += 1;
                }
                for (var l = 1; l < lines.length; l++) {
                    var drawY = y;
                    var msgStr = lines[l];
                    this.centerMsgFrame.gotoxy(2, drawY);
                    this.centerMsgFrame.putmsg(Array(centerWidth + 1).join(' '));
                    if (side === 'left') {
                        var msgPadLen = maxMsgWidth - msgStr.length;
                        if (msgPadLen < 0) msgPadLen = 0;
                        var leftHalf = msgStr + Array(msgPadLen + 1).join(' ');
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(leftHalf);
                    } else {
                        var rightHalf = (msgStr.length >= maxMsgWidth)
                            ? msgStr.slice(-maxMsgWidth)
                            : Array((maxMsgWidth - msgStr.length)).join(' ') + msgStr;
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(rightHalf);
                    }
                    this.messageFrames.push({msg: msg, y: drawY, side: side});
                    y += 1;
                }
                if (!firstGroup) {
                    side = (side === 'left') ? 'right' : 'left';
                }
                firstGroup = false;
            } else {
                for (var l = 0; l < lines.length; l++) {
                    var drawY = y;
                    var msgStr = lines[l];
                    this.centerMsgFrame.gotoxy(2, drawY);
                    this.centerMsgFrame.putmsg(Array(centerWidth + 1).join(' '));
                    if (side === 'left') {
                        var msgPadLen = maxMsgWidth - msgStr.length;
                        if (msgPadLen < 0) msgPadLen = 0;
                        var leftHalf = msgStr + Array(msgPadLen + 1).join(' ');
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(leftHalf);
                    } else {
                        var rightHalf = (msgStr.length >= maxMsgWidth)
                            ? msgStr.slice(-maxMsgWidth)
                            : Array((maxMsgWidth - msgStr.length)).join(' ') + msgStr;
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(rightHalf);
                    }
                    this.messageFrames.push({msg: msg, y: drawY, side: side});
                    y += 1;
                }
            }
            lastSender = from;
            lastMsgSide = side;
            prevMsg = msg;
        } else {
            try { 
                // log('[CHAT:SKIP] ' + JSON.stringify(msg));
            } catch (e) {}
        }
    }
    return { row: y, side: lastMsgSide };
}

// Helper: draw last divider
Chat.prototype._drawLastDivider = function(messages, maxMsgWidth, centerWidth) {
    var prevMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    var y = arguments.length > 3 ? arguments[3] : this.centerMsgFrame.height;
    var side = arguments.length > 4 ? arguments[4] : 'left';
    if (messages.length > 0 && prevMsg) {
        var lastMsgTime = prevMsg.time;
        // (prevMsg && typeof prevMsg.time === 'number') ? new Date(prevMsg.time) : undefined;
        var currentMsgTime = Date.now();
        var dividerStr = getDividerString(side, maxMsgWidth, lastMsgTime, currentMsgTime );
        var drawY = y;
        this.centerMsgFrame.gotoxy(2, drawY);
        this.centerMsgFrame.putmsg(Array(centerWidth + 1).join(' '));
        if (side === 'left') {
            this.centerMsgFrame.gotoxy(2, drawY);
            this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
        } else {
            this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
            this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
        }
    }
}

// Helper: draw input frame
Chat.prototype._drawInputFrame = function() {
    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
}


