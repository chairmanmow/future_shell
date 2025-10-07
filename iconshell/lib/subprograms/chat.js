load("iconshell/lib/subprograms/chat_helpers.js");
load("iconshell/lib/subprograms/subprogram.js"); // Base class


function Chat(jsonchat) {
    this.input = "";
    this.running = false;
    this.channel = "main";
    this.jsonchat = jsonchat; // persistent backend instance
    this.parentFrame = null;
    this.chatOutputFrame = null;
    this.chatInputFrame = null;
    this.leftAvatarFrame = null;
    this.leftMsgFrame = null;
    this.rightMsgFrame = null;
    this.rightAvatarFrame = null;
    this.chatSpacerFrame = null;
    this.messageFrames = [];
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
    var indicatorColor = (typeof CYAN !== 'undefined') ? CYAN : undefined;
    if (!indicatorColor && typeof LIGHTCYAN !== 'undefined') indicatorColor = LIGHTCYAN;
    if (!indicatorColor && typeof WHITE !== 'undefined') indicatorColor = WHITE;
    this._messageIndicatorColor = indicatorColor;
    var wrapColor = (typeof BLUE !== 'undefined') ? BLUE : undefined;
    if (!wrapColor && typeof LIGHTBLUE !== 'undefined') wrapColor = LIGHTBLUE;
    this._wrapIndicatorColor = wrapColor || indicatorColor;
    this._timestampColor = (typeof LIGHTBLUE !== 'undefined') ? LIGHTBLUE : ((typeof LIGHTCYAN !== 'undefined') ? LIGHTCYAN : indicatorColor);
    this._lastRenderTs = 0;
    this._pendingMessage = null;
    // Configurable group line color and pad character
    this.groupLineColor = (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.CHAT_GROUP_LINE) ? ICSH_VALS.CHAT_GROUP_LINE : MAGENTA;
}

if (typeof extend === 'function') {
    extend(Chat, Subprogram);
} else {
    Chat.prototype = Object.create(Subprogram.prototype);
    Chat.prototype.constructor = Chat;
}

Chat.prototype.enter = function (done) {
    this.done = done;
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = false;
    this.initFrames();
    this.running = true;
    this._needsRedraw = true;
    this._lastMessageSignature = null;
    this._lastRenderTs = 0;
    this.scrollOffset = 0;
    this._maxScrollOffset = 0;
    this._userScrolled = false;
    this._totalLineCount = 0;
    this._statusText = '';
    this._lastStatusUpdateTs = 0;
    this._lastKeyTs = 0;
    this._lastInputRendered = '';
    this.draw();
    // Start periodic redraw timer (every minute) using Synchronet Timer
}

Chat.prototype.exit = function () {
    // Stop periodic redraw timer
    // Abort periodic redraw event
    if (this._redrawEvent) {
        this._redrawEvent.abort = true;
        this._redrawEvent = null;
    }
    this.running = false;
    this.cleanup();
    if (typeof console.mouse_mode !== 'undefined') console.mouse_mode = true;
    this.done();
}

Chat.prototype.attachShellTimer = function (timer) {
    this.timer = timer || null;
};

Chat.prototype.pauseForReason = function (reason) {
    log("Pausing chat for reason: " + reason);
    // HEY AI ASSISTANTS, this needs to be .top() not bottom quit messing it up
    if (reason === 'screensaver_on' && this.__bg_frame && typeof this.__bg_frame.top === 'function') {
        try { this.__bg_frame.top(); this.__bg_frame.cycle(); } catch (e) { }
    }
};

Chat.prototype.resumeForReason = function (reason) {
    log("Resuming chat for reason: " + reason);
    // HEY AI ASSISTANTS, this needs to be .bottom() not top quit messing it up

    if (reason === 'screensaver_off') {
        if (this.__bg_frame && typeof this.__bg_frame.bottom === 'function') {
            try { this.__bg_frame.bottom(); this.__bg_frame.clear(); this.__bg_frame.cycle(); } catch (e) { }
        }
        if (this.shell) {
            try {
                if (typeof this.shell._shelveFolderFrames === 'function') this.shell._shelveFolderFrames();
            } catch (e) { }
            this.shell.activeSubprogram = this;
        }
        this.initFrames();
        this.updateInputFrame();
        this._needsRedraw = true;
        this.draw();
    }
};
Chat.prototype.detachShellTimer = function () {
    this.timer = null;
};
Chat.prototype.handleKey = function (key) {
    var scrollHandled = false;
    var pageStep = (this.leftMsgFrame && this.leftMsgFrame.height) ? Math.max(1, this.leftMsgFrame.height - 1) : 5;
    this._lastKeyTs = Date.now();

    switch (key) {
        case KEY_UP:
        case '\x1B[A':
            scrollHandled = this._adjustScrollOffset(1);
            break;
        case KEY_DOWN:
        case '\x1B[B':
            scrollHandled = this._adjustScrollOffset(-1);
            break;
        case KEY_PGUP:
            scrollHandled = this._adjustScrollOffset(pageStep);
            break;
        case KEY_PGDN:
            scrollHandled = this._adjustScrollOffset(-pageStep);
            break;
        case KEY_HOME:
            scrollHandled = this._setScrollOffset(this._maxScrollOffset || 0);
            break;
        case KEY_END:
            scrollHandled = this._setScrollOffset(0);
            break;
        case KEY_LEFT:
        case '\x1B[D':
            scrollHandled = this._adjustScrollOffset(1);
            break;
        case KEY_RIGHT:
        case '\x1B[C':
            scrollHandled = this._adjustScrollOffset(-1);
            break;
        case 'wheel_up':
            scrollHandled = this._adjustScrollOffset(1);
            break;
        case 'wheel_down':
            scrollHandled = this._adjustScrollOffset(-1);
            break;
    }

    if (scrollHandled) return;
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

// Update the chat input/status line
Chat.prototype.updateInputFrame = function () {
    this._drawInputFrame(true);
};

// Efficiently append new messages to the chat (call this from IconShell on new message event)
Chat.prototype.updateChat = function (packet) {
    dbug('updateChat invoked', 'chat');
    if (packet) this._pendingMessage = packet;
    this._needsRedraw = true;
    if (this.running) this.draw();
};

Chat.prototype.cleanup = function () {
    // Close and null out all frames
    if (this.leftAvatarFrame) {
        this.leftAvatarFrame.close();
        this.leftAvatarFrame = null;
    }
    if (this.leftMsgFrame) {
        this.leftMsgFrame.close();
        this.leftMsgFrame = null;
    }
    if (this.rightMsgFrame) {
        this.rightMsgFrame.close();
        this.rightMsgFrame = null;
    }
    if (this.rightAvatarFrame) {
        this.rightAvatarFrame.close();
        this.rightAvatarFrame = null;
    }
    if (this.chatSpacerFrame) {
        this.chatSpacerFrame.close();
        this.chatSpacerFrame = null;
    }
    if (this.chatOutputFrame) {
        this.chatOutputFrame.close();
        this.chatOutputFrame = null;
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


Chat.prototype.initFrames = function () {
    // Assume parentFrame is set externally (e.g., shell.view)
    // If not, fallback to creating a new Frame
    if (!this.parentFrame) {
        // Fallback: create a full-screen frame
        this.parentFrame = new Frame(1, 1, console.screen_columns, console.screen_rows, ICSH_ATTR('CHAT_OUTPUT'));
        this.parentFrame.open();
    }
    var w = this.parentFrame.width;
    var h = this.parentFrame.height;
    // Chat output area (above input)
    var outputH = Math.max(1, h - 1);
    if (!this.chatOutputFrame) {
        this.chatOutputFrame = new Frame(1, 1, w, outputH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.parentFrame);
        this.chatOutputFrame.transparent = true;
        this.chatOutputFrame.open();
        this.setBackgroundFrame(this.chatOutputFrame || this.parentFrame);
    } else {
        var resized = false;
        if (typeof this.chatOutputFrame.resize === 'function') {
            try {
                this.chatOutputFrame.resize(1, 1, w, outputH);
                resized = true;
            } catch (e) { }
        }
        if (!resized && (this.chatOutputFrame.width !== w || this.chatOutputFrame.height !== outputH)) {
            try { this.chatOutputFrame.close(); } catch (e) { }
            this.chatOutputFrame = new Frame(1, 1, w, outputH, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.parentFrame);
            this.chatOutputFrame.transparent = true;
            this.chatOutputFrame.open();
            this.setBackgroundFrame(this.chatOutputFrame || this.parentFrame);
        }
        if (this.chatOutputFrame && this.chatOutputFrame.transparent !== true) this.chatOutputFrame.transparent = true;
    }
    var outputWidth = this.chatOutputFrame.width || w;
    var avatarWidth = this.avatarWidth || 10;
    if ((avatarWidth * 2) >= (outputWidth - 4)) avatarWidth = Math.max(2, Math.floor(outputWidth / 4));
    if (avatarWidth < 2) avatarWidth = 2;
    this.avatarWidth = avatarWidth;
    var gapRows = outputH > 1 ? 1 : 0;
    var messageHeight = Math.max(1, outputH - gapRows);
    var spacerY = messageHeight + 1;
    if (gapRows > 0 && spacerY >= outputH + 1) {
        // Not enough room for spacer; fall back to full height.
        gapRows = 0;
        messageHeight = outputH;
    }

    var messageAreaWidth = Math.max(2, outputWidth - (avatarWidth * 2));
    var leftMsgWidth = Math.max(2, Math.floor(messageAreaWidth / 2));
    var rightMsgWidth = Math.max(2, messageAreaWidth - leftMsgWidth);
    var leftAvatarX = 1;
    var rightAvatarX = outputWidth - avatarWidth + 1;
    var leftMsgX = leftAvatarX + avatarWidth;
    var rightMsgX = rightAvatarX - rightMsgWidth;
    // Column frames: avatar/message pairs on each side with optional spacer row
    this.leftAvatarFrame = new Frame(leftAvatarX, 1, avatarWidth, messageHeight, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.chatOutputFrame);
    this.leftAvatarFrame.transparent = true;
    this.leftMsgFrame = new Frame(leftMsgX, 1, leftMsgWidth, messageHeight, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.chatOutputFrame);
    this.leftMsgFrame.transparent = true;
    this.rightMsgFrame = new Frame(rightMsgX, 1, rightMsgWidth, messageHeight, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.chatOutputFrame);
    this.rightMsgFrame.transparent = true;
    this.rightAvatarFrame = new Frame(rightAvatarX, 1, avatarWidth, messageHeight, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.chatOutputFrame);
    this.rightAvatarFrame.transparent = true;
    this.leftAvatarFrame.open();
    this.leftMsgFrame.open();
    this.rightMsgFrame.open();
    this.rightAvatarFrame.open();
    if (gapRows > 0) {
        this.chatSpacerFrame = new Frame(1, spacerY, outputWidth, gapRows, ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG, this.chatOutputFrame);
        this.chatSpacerFrame.transparent = true;
        this.chatSpacerFrame.open();
        this.chatSpacerFrame.clear();
    } else {
        this.chatSpacerFrame = null;
    }
    this.leftMsgFrame.word_wrap = true;
    this.leftMsgFrame.h_scroll = false;
    this.leftMsgFrame.v_scroll = false;
    this.rightMsgFrame.word_wrap = true;
    this.rightMsgFrame.h_scroll = false;
    this.rightMsgFrame.v_scroll = false;
    // Chat input frame (bottom)
    this.chatInputFrame = new Frame(1, h, w, 1, ICSH_VALS.CRUMB.BG | ICSH_VALS.CRUMB.FG, this.parentFrame);
    this.chatInputFrame.open();
    this._lastInputRendered = '';
};

Chat.prototype.refresh = function () {
    this._needsRedraw = true;
    this.cycle();
}

Chat.prototype.cycle = function () {
    if (!this.running) return;
    if (this.jsonchat && typeof this.jsonchat.cycle === 'function') {
        this.jsonchat.cycle();
    }
    var now = Date.now();
    if (!this.input || !this.input.length) {
        if (now - this._lastStatusUpdateTs > this._statusRefreshIntervalMs) {
            var context = this._buildCrumbContext();
            var status = this._formatPrimaryCrumb(context) || '';
            if (status !== this._statusText) {
                this._statusText = status;
                this._lastInputRendered = '';
                this._drawInputFrame();
            }
            this._lastStatusUpdateTs = now;
        }
    } else if (this._statusText) {
        this._statusText = '';
        this._lastStatusUpdateTs = now;
        this._lastInputRendered = '';
        this._drawInputFrame();
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
    if (!this.leftAvatarFrame || !this.leftMsgFrame || !this.rightMsgFrame || !this.rightAvatarFrame || !this.chatInputFrame) {
        this.initFrames();
    }

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
    this._drawInputFrame();
    if (this.parentFrame) this.parentFrame.cycle();

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
    if (this.chatSpacerFrame) this.chatSpacerFrame.clear();
};

Chat.prototype._groupMessages = function (messages) {
    var groups = [];
    var lastSender = null;
    var currentSide = 'right';

    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (!msg || !msg.nick || typeof msg.nick.name !== 'string') continue;
        var sender = msg.nick.name;
        var text = this._extractMessageText(msg);
        if (!text || text.replace(/\s+/g, '') === '') continue;

        if (sender !== lastSender) {
            currentSide = (currentSide === 'left') ? 'right' : 'left';
            groups.push({
                sender: sender,
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
        group.messages.push(msg);
        group.lastTime = msg.time || group.lastTime;
        lastSender = sender;
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
    if (width <= 0) return { name: '', timestamp: '' };

    if (name.length > width) {
        name = name.substr(0, width);
        return { name: name, timestamp: '' };
    }

    var ts = timestamp ? timestamp.toString() : '';
    if (!ts.length) return { name: name, timestamp: '' };

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

    return { name: name, timestamp: ts };
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
                var name = entry ? (entry.nick || entry.name || entry.user || entry.alias || '') : '';
                if (name && !seen[name]) {
                    seen[name] = true;
                    names.push(name);
                }
            }
        } else {
            for (var key in rawUsers) {
                if (!rawUsers.hasOwnProperty(key)) continue;
                var obj = rawUsers[key];
                var uname = obj ? (obj.nick || obj.name || obj.user || obj.alias || key) : key;
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

    var aggregated = { left: {}, right: {} };

    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        if (!group || !group.sender || group.renderEnd < group.renderStart) continue;

        var side = group.side === 'left' ? 'left' : 'right';
        var frame = (side === 'left') ? this.leftAvatarFrame : this.rightAvatarFrame;
        if (!frame || frame.height <= 0) continue;

        var frameHeight = frame.height;
        var startY = Math.max(1, Math.min(group.renderStart || 1, frameHeight));
        var endY = Math.max(startY, Math.min(group.renderEnd || startY, frameHeight));
        var height = Math.max(1, endY - startY + 1);
        var center = startY + ((height - 1) / 2);

        if (!aggregated[side][group.sender]) {
            aggregated[side][group.sender] = {
                rangeStart: startY,
                rangeEnd: endY,
                weightSum: 0,
                weightTotal: 0
            };
        }

        var bucket = aggregated[side][group.sender];
        bucket.rangeStart = Math.min(bucket.rangeStart, startY);
        bucket.rangeEnd = Math.max(bucket.rangeEnd, endY);
        bucket.weightSum += center * height;
        bucket.weightTotal += height;
    }

    var placements = { left: [], right: [] };
    var sides = ['left', 'right'];
    for (var s = 0; s < sides.length; s++) {
        var sideKey = sides[s];
        var frameRef = (sideKey === 'left') ? this.leftAvatarFrame : this.rightAvatarFrame;
        if (!frameRef || frameRef.height <= 0) continue;

        var frameHeightRef = frameRef.height;
        var users = Object.keys(aggregated[sideKey]);
        users.sort(function (a, b) {
            return aggregated[sideKey][a].rangeStart - aggregated[sideKey][b].rangeStart;
        });

        for (var u = 0; u < users.length; u++) {
            var user = users[u];
            var info = aggregated[sideKey][user];
            var rangeStart = Math.max(1, Math.min(info.rangeStart, frameHeightRef));
            var rangeEnd = Math.max(rangeStart, Math.min(info.rangeEnd, frameHeightRef));
            var rangeHeight = Math.max(1, rangeEnd - rangeStart + 1);
            var weightedCenter = info.weightTotal
                ? (info.weightSum / info.weightTotal)
                : rangeStart + ((rangeHeight - 1) / 2);

            if (weightedCenter < rangeStart) weightedCenter = rangeStart;
            if (weightedCenter > rangeEnd) weightedCenter = rangeEnd;

            var avatarMaxHeight = this.avatarHeight || rangeHeight;
            var targetHeight = Math.max(1, Math.min(rangeHeight, avatarMaxHeight));
            targetHeight = Math.min(targetHeight, frameHeightRef);

            var minTop = Math.max(1, Math.min(rangeStart, frameHeightRef - targetHeight + 1));
            var maxTop = Math.max(minTop, Math.min(rangeEnd - targetHeight + 1, frameHeightRef - targetHeight + 1));
            var desiredTop = Math.round(weightedCenter - ((targetHeight - 1) / 2));
            if (desiredTop < minTop) desiredTop = minTop;
            if (desiredTop > maxTop) desiredTop = maxTop;

            placements[sideKey].push({
                user: user,
                y: desiredTop,
                height: targetHeight,
                available: rangeHeight
            });
        }
    }

    var avatarLib = load({}, '../exec/load/avatar_lib.js');
    var leftPacked = packAvatars(placements.left, this.leftAvatarFrame.height);
    var rightPacked = packAvatars(placements.right, this.rightAvatarFrame.height);

    this._drawAvatarSet(this.leftAvatarFrame, leftPacked, avatarLib);
    this._drawAvatarSet(this.rightAvatarFrame, rightPacked, avatarLib);
};

Chat.prototype._drawAvatarSet = function (frame, avatarList, avatarLib) {
    if (!frame || !Array.isArray(avatarList)) return;

    var drawnUsers = {};
    var frameWidth = frame.width;
    var artWidth = Math.min(this.avatarWidth || frameWidth, frameWidth);
    var artHeight = this.avatarHeight || frame.height;

    for (var i = 0; i < avatarList.length; i++) {
        var placement = avatarList[i];
        if (!placement || !placement.user || drawnUsers[placement.user]) continue;

        var availableHeight = placement.available || placement.height;
        var frameRemaining = Math.max(1, frame.height - placement.y + 1);
        var desiredHeight = Math.min(availableHeight, artHeight);
        var targetHeight = Math.min(frameRemaining, Math.max(placement.height, desiredHeight));
        if (placement.y < 1 || placement.y > frame.height || targetHeight <= 0) continue;

        var avatarArt = null;
        if (avatarLib && typeof avatarLib.read === 'function' && typeof system !== 'undefined' && typeof system.matchuser === 'function') {
            var usernum = system.matchuser(placement.user);
            if (usernum) {
                var avatarObj = avatarLib.read(usernum, placement.user);
                if (avatarObj && avatarObj.data) avatarArt = base64_decode(avatarObj.data);
            }
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
            var initials = placement.user.substr(0, initialsWidth).toUpperCase();
            var label = '[' + initials + ']';
            frame.putmsg(label.substr(0, frameWidth));
        }

        drawnUsers[placement.user] = true;
    }
};

// Helper: draw input frame
Chat.prototype._drawInputFrame = function (force) {
    if (!this.chatInputFrame) return;
    var base = 'You: ' + this.input;
    if (!this.input || !this.input.length) {
        if (this._statusText) base += '  |  ' + this._statusText;
    }
    var display = base + '_';
    var width = this.chatInputFrame.width || 0;
    if (width > 0 && display.length > width) {
        display = display.substr(0, width - 1) + '_';
    }
    if (width > 0 && display.length < width) {
        display = display + Array(width - display.length + 1).join(' ');
    }
    if (!force && this._lastInputRendered === display) return;
    this._renderInputString(display);
    this._lastInputRendered = display;
}

Chat.prototype._renderInputString = function (text) {
    if (!this.chatInputFrame) return;
    var width = this.chatInputFrame.width || 0;
    if (width <= 0) {
        this.chatInputFrame.gotoxy(1, 1);
        this.chatInputFrame.putmsg(text);
        return;
    }
    if (text.length < width) text += Array(width - text.length + 1).join(' ');
    else if (text.length > width) text = text.substr(0, width);
    var attr = (typeof this.chatInputFrame.attr === 'number') ? this.chatInputFrame.attr : undefined;
    for (var i = 0; i < width; i++) {
        var ch = text.charAt(i);
        try { this.chatInputFrame.setData(i, 0, ch, attr, false); } catch (e) { }
    }
    if (typeof this.chatInputFrame.cycle === 'function') {
        try { this.chatInputFrame.cycle(); } catch (e) { }
    }
};
