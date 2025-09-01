// Helper to blit a decoded avatar block into a frame at (dstX, dstY)
function blitAvatarToFrame(frame, avatarData, width, height, dstX, dstY) {
    var offset = 0;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            if (offset + 1 >= avatarData.length) return;
            var ch = avatarData.substr(offset++, 1);
            var attr = ascii(avatarData.substr(offset++, 1));
            frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false);
        }
    }
}


// Load avatar library for user avatars
// MessageFrame: represents a single chat message with avatar and content

function Chat(jsonchat) {
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
}

Chat.prototype.enter = function(done){
    this.done = done;
    this.initFrames();
    this.draw();
}

Chat.prototype.exit = function(){
    this.cleanup();
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
            if (typeof this.updateChat === 'function') this.updateChat(packet);
            this.jsonchat.submit(this.channel, this.input);
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
    if (!packet || !packet.data) {
        this.draw();
        return;
    }
    var msg = packet.data;
    var chan = this.jsonchat ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
    var messages = chan ? chan.messages : [];
    var maxRows = this.centerMsgFrame.height;
    var avatarHeight = 6;
    var avatarWidth = 10;
    var centerWidth = this.centerMsgFrame.width;
    var padding = 8;
    var avatarLib = load({}, '../exec/load/avatar_lib.js');

    // Determine y position for the new message
    var y = messages.length;
    if (messages.length > maxRows) y = maxRows;

    // Determine side (left/right) and if avatar should be drawn
    var lastSender = null;
    var side = 'left';
    if (messages.length > 1) {
        var prevMsg = messages[messages.length - 2];
        if (prevMsg && prevMsg.nick && prevMsg.nick.name) {
            lastSender = prevMsg.nick.name;
        }
    }
    var from = msg.nick && msg.nick.name ? msg.nick.name : "";
    var drawAvatar = false;
    if (lastSender === null || from !== lastSender) {
        side = (side === 'left') ? 'right' : 'left';
        drawAvatar = true;
    } else {
        // Use same side as previous message
        if (this.messageFrames.length > 0) {
            side = this.messageFrames[this.messageFrames.length - 1].side;
        }
    }

    // Wrap text for the new message
    function wrapText(text, width) {
        var lines = [];
        var words = text.split(' ');
        var line = '';
        for (var i = 0; i < words.length; i++) {
            if ((line.length ? line + ' ' : '') + words[i].length > width) {
                if (line.length > 0) lines.push(line);
                line = words[i];
            } else {
                line += (line.length ? ' ' : '') + words[i];
            }
        }
        if (line.length > 0) lines.push(line);
        return lines;
    }
    var msgText = from + ': ' + (msg.str || msg.text || '');
    var wrapWidth = centerWidth - 4;
    var lines = wrapText(msgText, wrapWidth);

    // If too many messages, redraw everything (scrolling)
    if (messages.length > maxRows) {
        this.draw();
        return;
    }

    // Render each line of the new message
    for (var l = 0; l < lines.length; l++) {
        var lineY = y + l;
        var params = {
            msg: msg,
            side: side,
            y: lineY,
            avatarLib: avatarLib,
            lastSender: lastSender,
            drawAvatar: drawAvatar && l === 0, // Only draw avatar on first line
            centerMsgFrame: this.centerMsgFrame,
            leftAvatarFrame: this.leftAvatarFrame,
            rightAvatarFrame: this.rightAvatarFrame,
            centerWidth: centerWidth,
            avatarHeight: avatarHeight,
            padding: padding
        };
        this.renderMessage(params);
        this.messageFrames.push({msg: msg, y: lineY, side: side});
    }

    // Update input frame
    this.updateInputFrame();
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
Chat.prototype.renderMessage = function(params) {
    var {msg, side, y, avatarLib, lastSender, drawAvatar, centerMsgFrame, leftAvatarFrame, rightAvatarFrame, centerWidth, avatarHeight, padding} = params;
    var from = msg.nick.name;
    var text = msg.str || msg.text || "";
    var usernum = (msg.nick.number && !isNaN(msg.nick.number)) ? msg.nick.number : system.matchuser(from);
    var avatarArt = null;
    if (drawAvatar && usernum && typeof avatarLib.read === 'function') {
        var avatarObj = avatarLib.read(usernum, from);
        if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
    }
    // Message subframe width
    var msgFrameWidth = centerWidth - padding;
    var msgFrameX = (side === 'left') ? 2 : (centerWidth - msgFrameWidth);
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
    // Message subframe in center
    var msgFrame = new Frame(msgFrameX, y, msgFrameWidth, avatarHeight, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, centerMsgFrame);
    msgFrame.open();
    msgFrame.gotoxy(1, 1);
    msgFrame.putmsg(from + ": " + text);
    return msgFrame;
};

Chat.prototype.draw = function() {
    // Clear and redraw chat frames
    if (!this.leftAvatarFrame || !this.centerMsgFrame || !this.rightAvatarFrame || !this.chatInputFrame) this.initFrames();
    // Optionally clear frames here if needed

    var chan = this.jsonchat ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
    var messages = chan ? chan.messages : [];
    var maxRows = this.centerMsgFrame.height;
    var avatarHeight = 6;
    var avatarWidth = 10;
    var centerWidth = this.centerMsgFrame.width;
    this.messageFrames = [];
    var avatarLib = load({}, '../exec/load/avatar_lib.js');

    // Helper to wrap text to fit the center frame width
    function wrapText(text, width) {
        var lines = [];
        var words = text.split(' ');
        var line = '';
        for (var i = 0; i < words.length; i++) {
            if ((line.length ? line + ' ' : '') + words[i].length > width) {
                if (line.length > 0) lines.push(line);
                line = words[i];
            } else {
                line += (line.length ? ' ' : '') + words[i];
            }
        }
        if (line.length > 0) lines.push(line);
        return lines;
    }

    // 1. First pass: collect avatar placement requests
    var avatarPlacements = { left: [], right: [] };
    var yCursor = 1;
    var lastSender = null;
    var side = 'left';
    var i, msg, from, isFirstMessage, msgText, wrapWidth, lines, col;
    for (i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        msg = messages[i];
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            from = msg.nick.name;
            isFirstMessage = (lastSender === null);
            msgText = from + ': ' + (msg.str || msg.text || '');
            wrapWidth = centerWidth - 4;
            lines = wrapText(msgText, wrapWidth);
            if (isFirstMessage || from !== lastSender) {
                side = (side === 'left') ? 'right' : 'left';
                col = (side === 'left') ? 'left' : 'right';
                avatarPlacements[col].push({ user: from, y: yCursor, height: avatarHeight });
            }
            yCursor += lines.length;
            lastSender = from;
        }
    }

    // 2. Second pass: pack avatars for each column
    function packAvatars(placements) {
        var packed = [];
        var i, j, req, p, merged, tryY, overlap, newStart, newEnd;
        for (i = 0; i < placements.length; i++) {
            req = placements[i];
            merged = false;
            // Consolidate for same user if overlapping
            for (j = 0; j < packed.length; j++) {
                p = packed[j];
                if (p.user === req.user && !(req.y + req.height - 1 < p.y || req.y > p.y + p.height - 1)) {
                    newStart = Math.min(p.y, req.y);
                    newEnd = Math.max(p.y + p.height - 1, req.y + req.height - 1);
                    p.y = newStart;
                    p.height = newEnd - newStart + 1;
                    merged = true;
                    break;
                }
            }
            if (!merged) {
                // Only try y-positions within ±3 of req.y, and within valid range
                var bestY = null;
                var minGap = null;
                var maxY = Math.max(1, maxRows - req.height + 1);
                for (tryY = req.y - 3; tryY <= req.y + 3; tryY++) {
                    if (tryY < 1 || tryY > maxY) continue;
                    overlap = false;
                    for (j = 0; j < packed.length; j++) {
                        p = packed[j];
                        if (p.user !== req.user && !(tryY + req.height - 1 < p.y || tryY > p.y + p.height - 1)) {
                            overlap = true;
                            break;
                        }
                    }
                    if (!overlap) {
                        var gap = Math.abs(tryY - req.y);
                        if (minGap === null || gap < minGap || (gap === minGap && tryY < bestY)) {
                            minGap = gap;
                            bestY = tryY;
                        }
                    }
                }
                // If no spot found, always use requested y (will overlap)
                if (bestY === null) {
                    bestY = req.y;
                }
                packed.push({ user: req.user, y: bestY, height: req.height });
            }
        }
        packed.sort(function(a, b) { return a.y - b.y; });
        return packed;
    }
    var avatarMap = { left: packAvatars(avatarPlacements.left), right: packAvatars(avatarPlacements.right) };

    // 3. Third pass: draw avatars at packed positions
    var avatarDrawn = { left: {}, right: {} };
    var colnames = ['left', 'right'];
    for (var c = 0; c < colnames.length; c++) {
        var col = colnames[c];
        for (i = 0; i < avatarMap[col].length; i++) {
            var a = avatarMap[col][i];
            if (avatarDrawn[col][a.user]) continue;
            var usernum = system.matchuser(a.user);
            var avatarArt = null;
            if (usernum && typeof avatarLib.read === 'function') {
                var avatarObj = avatarLib.read(usernum, a.user);
                if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
            }
            log('[AVATAR] PACKED BLIT for ' + a.user + ' at y=' + a.y + ' height=' + a.height + ' side=' + col);
            if (avatarArt && avatarArt.length >= avatarWidth * avatarHeight * 2) {
                blitAvatarToFrame(col === 'left' ? this.leftAvatarFrame : this.rightAvatarFrame, avatarArt, avatarWidth, Math.min(avatarHeight, a.height), 1, a.y);
            } else {
                (col === 'left' ? this.leftAvatarFrame : this.rightAvatarFrame).gotoxy(1, a.y);
                (col === 'left' ? this.leftAvatarFrame : this.rightAvatarFrame).putmsg('[ ]');
            }
            avatarDrawn[col][a.user] = true;
        }
    }

    // 4. Render messages as before
    var y = 1;
    lastSender = null;
    side = 'left';
    for (i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        msg = messages[i];
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            from = msg.nick.name;
            isFirstMessage = (lastSender === null);
            msgText = from + ': ' + (msg.str || msg.text || '');
            wrapWidth = centerWidth - 4;
            lines = wrapText(msgText, wrapWidth);
            if (isFirstMessage || from !== lastSender) {
                side = (side === 'left') ? 'right' : 'left';
            }
            for (var l = 0; l < lines.length; l++) {
                if (side === 'left') {
                    this.centerMsgFrame.gotoxy(2, y);
                    this.centerMsgFrame.putmsg(lines[l]);
                } else {
                    var pad = this.centerMsgFrame.width - lines[l].length - 1;
                    this.centerMsgFrame.gotoxy(Math.max(2, pad), y);
                    this.centerMsgFrame.putmsg(lines[l]);
                }
                this.messageFrames.push({msg: msg, y: y, side: side});
                y += 1;
            }
            lastSender = from;
        } else {
            try { log('[CHAT:SKIP] ' + JSON.stringify(msg)); } catch (e) {}
        }
    }

    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
    this.parentFrame.cycle();
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



Chat.prototype.refresh = function (){
	this.jsonchat.cycle();
	this.draw();
}

