load("iconshell/lib/subfunctions/chat_helpers.js");

function Chat(jsonchat) {
    log("CREATING CHAT 2");
    this.input = "";
    this.running = false;
    this.channel = "main";
    this.jsonchat = jsonchat; // persistent backend instance
    this.parentFrame = null;
    this.chatInputFrame = null;
    this.leftAvatarFrame = null;
    this.centerMsgFrame = null;
    this.rightAvatarFrame = null;
    this.messageFrames = [];
    this.done = null;
    this.lastSender = null; // State tracking for last sender
    this.lastRow = 0; // State tracking for last rendered row
    // Configurable group line color and pad character
        this.groupLineColor = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_GROUP_LINE) ? ICSH_VALS.CHAT_GROUP_LINE : MAGENTA;
        this.padChar = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_PAD_CHAR) ? ICSH_VALS.CHAT_PAD_CHAR : '.';
        this.padColor = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_PAD_COLOR) ? ICSH_VALS.CHAT_PAD_COLOR : DARKGRAY;
}

Chat.prototype.enter = function(done){
    this.done = done;
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    this.initFrames();
    this.draw();
}

Chat.prototype.exit = function(){
    this.cleanup();
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
    this.done();
}
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
// Helper to render a message and (optionally) avatar on a given side and row
// Helper to render a message line and (optionally) avatar on a given side and row
Chat.prototype.renderMessage = function(params) {
    var {msg, side, y, avatarLib, lastSender, drawAvatar, centerMsgFrame, leftAvatarFrame, rightAvatarFrame, centerWidth, avatarHeight, padding, lineText} = params;
    var from = msg.nick.name;
    var usernum = (msg.nick.number && !isNaN(msg.nick.number)) ? msg.nick.number : system.matchuser(from);
    var avatarArt = null;
    if (drawAvatar && usernum && typeof avatarLib.read === 'function') {
        var avatarObj = avatarLib.read(usernum, from);
        if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
    }
    // Draw avatar if needed
    if (side === 'left') {
        if (drawAvatar) {
            if (avatarArt && typeof leftAvatarFrame.load_bin === 'function') {
                leftAvatarFrame.gotoxy(1, y);
                leftAvatarFrame.load_bin(avatarArt, 10, avatarHeight);
            } else {
                leftAvatarFrame.gotoxy(1, y);
                leftAvatarFrame.putmsg("[ ]");
            }
        }
        // Clear right avatar area for this row
        rightAvatarFrame.gotoxy(1, y);
        rightAvatarFrame.putmsg("          ");
    } else {
        if (drawAvatar) {
            if (avatarArt && typeof rightAvatarFrame.load_bin === 'function') {
                rightAvatarFrame.gotoxy(1, y);
                rightAvatarFrame.load_bin(avatarArt, 10, avatarHeight);
            } else {
                rightAvatarFrame.gotoxy(1, y);
                rightAvatarFrame.putmsg("[ ]");
            }
        }
        // Clear left avatar area for this row
        leftAvatarFrame.gotoxy(1, y);
        leftAvatarFrame.putmsg("          ");
    }
    // Render the message line directly into the center message frame
    if (side === 'left') {
        centerMsgFrame.gotoxy(2, y);
        centerMsgFrame.putmsg(lineText);
    } else {
        var pad = centerMsgFrame.width - lineText.length - 1;
        centerMsgFrame.gotoxy(Math.max(2, pad), y);
        centerMsgFrame.putmsg(lineText);
    }
        this.lastSender = from; // Update last sender
        this.lastRow = y; // Update last rendered row
};


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
    // Helper to generate divider string for a side

    // Clear and redraw chat frames
    if (!this.leftAvatarFrame || !this.centerMsgFrame || !this.rightAvatarFrame || !this.chatInputFrame) this.initFrames();
    // Optionally clear frames here if needed

    var chan = this.jsonchat ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
    var messages = chan ? chan.messages : [];
    if(newMsg) {
        messages.push(newMsg);
        log("Pushing new message to chat.draw(newMsg)")
    }   
    var maxRows = this.centerMsgFrame.height;

    var centerWidth = this.centerMsgFrame.width;
    var maxRows = this.centerMsgFrame.height;
    var avatarHeight = 6;
    var avatarWidth = 10;
    var maxMsgWidth = Math.floor(centerWidth / 2);

    var maxMsgWidth = Math.floor(centerWidth / 2);
    this.messageFrames = [];
    var avatarLib = load({}, '../exec/load/avatar_lib.js');

    // 1. First pass: collect avatar placement requests
    var avatarPlacements = { left: [], right: [] };
    var yCursor = 1;
    var lastSender = null;
    var side = 'left';
    var i, msg, from, isFirstMessage, msgText, wrapWidth, lines, col;
    var senderGroups = [];
    var currentGroup = null;
    for (i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        msg = messages[i];
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            from = msg.nick.name;
            isFirstMessage = (lastSender === null);
            msgText = from + ': ' + (msg.str || msg.text || '');
            lines = wrapText(msgText, maxMsgWidth);
            if (isFirstMessage || from !== lastSender) {
                side = (side === 'left') ? 'right' : 'left';
                col = (side === 'left') ? 'left' : 'right';
                avatarPlacements[col].push({ user: from, y: yCursor, height: avatarHeight });
                // Start new group
                if (currentGroup) senderGroups.push(currentGroup);
                currentGroup = { sender: from, start: yCursor, end: yCursor + lines.length - 1 };
            } else {
                // Extend current group
                if (currentGroup) currentGroup.end = yCursor + lines.length - 1;
            }
            yCursor += lines.length;
            lastSender = from;
        }
    }
    if (currentGroup) senderGroups.push(currentGroup);

    var avatarMap = { left: packAvatars(avatarPlacements.left), right: packAvatars(avatarPlacements.right) };

    // 3. Third pass: draw avatars at packed positions
    var avatarDrawn = { left: {}, right: {} };
    var colnames = ['left', 'right'];
    for (var c = 0; c < colnames.length; c++) {
        var col = colnames[c];
        var oppositeFrame = (col === 'left') ? this.rightAvatarFrame : this.leftAvatarFrame;
        for (i = 0; i < avatarMap[col].length; i++) {
            var a = avatarMap[col][i];
            if (avatarDrawn[col][a.user]) continue;
            var usernum = system.matchuser(a.user);
            var avatarArt = null;
            if (usernum && typeof avatarLib.read === 'function') {
                var avatarObj = avatarLib.read(usernum, a.user);
                if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
            }
            log('[AVATAR] PACKED BLIT for ' + a.user + ' at y=' + a.y + ' height=' + a.height + ' side=' + col + ' (avatar in opposite frame)');
            if (avatarArt && avatarArt.length >= avatarWidth * avatarHeight * 2) {
                blitAvatarToFrame(oppositeFrame, avatarArt, avatarWidth, Math.min(avatarHeight, a.height), 1, a.y);
            } else {
                oppositeFrame.gotoxy(1, a.y);
                oppositeFrame.putmsg('[ ]');
            }
            avatarDrawn[col][a.user] = true;
        }
    }

    // 4. Render messages as before

    var y = 1;
    lastSender = null;
    side = 'left';
    var groupIdx = 0;
    var nextGroup = senderGroups[groupIdx] || null;
    var lastDividerRow = null;
    var lastDividerSide = null;
    var firstGroup = true;
    var prevMsg = null;
    for (i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        msg = messages[i];
        var prevMsg = (i > Math.max(0, messages.length - maxRows)) ? messages[i - 1] : null;
        // Deduplicate: skip if same sender and timestamp as previous
        if (prevMsg && msg.nick && prevMsg.nick && msg.nick.name === prevMsg.nick.name && msg.time === prevMsg.time) {
            continue;
        }
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            from = msg.nick.name;
            isFirstMessage = (lastSender === null);
            msgText = from + ': ' + (msg.str || msg.text || '');
            lines = wrapText(msgText, maxMsgWidth);
            var senderChanged = isFirstMessage || from !== lastSender;
            if (senderChanged) {
                // ...existing code for divider and first message rendering...
                if (!firstGroup && y > 1 && prevMsg) {
                    var curTime = (msg && typeof msg.time !== 'undefined') ? msg.time : undefined;
                    var prevTime = (prevMsg && typeof prevMsg.time !== 'undefined') ? prevMsg.time : undefined;
                    var dividerStr = getDividerString(side, maxMsgWidth, curTime, prevTime);
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
                        lastDividerRow = drawY;
                        lastDividerSide = 'left';
                    } else {
                        var msgPadLen = maxMsgWidth - lines[0].length;
                        if (msgPadLen < 0) msgPadLen = 0;
                        var leftHalf = lines[0] + Array(msgPadLen + 1).join(' ');
                        this.centerMsgFrame.gotoxy(2, drawY);
                        this.centerMsgFrame.putmsg(leftHalf);
                        this.centerMsgFrame.gotoxy(2 + maxMsgWidth, drawY);
                        this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
                        lastDividerRow = drawY;
                        lastDividerSide = 'right';
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
                if (!firstGroup) {
                    side = (side === 'left') ? 'right' : 'left';
                }
                firstGroup = false;
                for (var l = 1; l < lines.length; l++) {
                    drawY = y;
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
            prevMsg = msg;
        } else {
            try { log('[CHAT:SKIP] ' + JSON.stringify(msg)); } catch (e) {}
        }
    }
// Always draw divider for last sender at the end for visual consistency
if (messages.length > 0 && prevMsg) {
    var lastTime = (prevMsg && typeof prevMsg.time !== 'undefined') ? prevMsg.time : undefined;
    var dividerStr = getDividerString(side, maxMsgWidth, lastTime, lastTime);
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

    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
    this.parentFrame.cycle();
}


