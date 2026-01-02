Chat.prototype._isSenderSameAsLast = function(currentSender, lastSender) {
    return (currentSender === lastSender) && (currentSender !== null);
};

// Helper: Draw a vertical separator down the middle of the screen
Chat.prototype._drawVerticalSeparator = function() {
    // Calculate exact middle based on frame width
    var frameWidth = this.centerMsgFrame.width;
    var SEPARATOR_X = Math.floor(frameWidth / 2);
    var frameHeight = this.centerMsgFrame.height;
    var separatorChar = "|"; // Simple character for separation
        
    // Use color if available
    if (typeof LIGHTGRAY !== 'undefined') {
        this.centerMsgFrame.attributes = LIGHTGRAY;
    }
    
    // Draw the vertical line
    for (var i = 1; i < frameHeight; i++) {
        this.centerMsgFrame.gotoxy(SEPARATOR_X, i);
        this.centerMsgFrame.putmsg(separatorChar);
    }
    
    // Reset attributes if needed
    if (typeof LIGHTGRAY !== 'undefined' && typeof WHITE !== 'undefined') {
        this.centerMsgFrame.attributes = WHITE;
    }
}

Chat.prototype._initFrames = function() {
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

// Efficiently update just the chat input frame
Chat.prototype._updateInputFrame = function() {
    if (!this.chatInputFrame) return;
    this.chatInputFrame.clear();
    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
    this.chatInputFrame.cycle();
};

// Helper: collect sender groups and avatar placements
// Helper: Calculate avatar position for a user
Chat.prototype._calculateAvatarPosition = function(from, yCursor, avatarHeight, side) {
    var col = (side === 'left') ? 'left' : 'right';
    return { user: from, y: yCursor, height: avatarHeight };
};

Chat.prototype._collectSenderGroups = function(messages, maxRows, maxMsgWidth, avatarHeight) {
    var avatarPlacements = { left: [], right: [] };
    var yCursor = 1;
    var lastSender = null;
    var currentSide = this.lastMsgSide || 'left'; // Initialize side from instance variable
    var senderGroups = [];
    var currentGroup = null;
    
    // Debug logging    
    for (var i = Math.max(0, messages.length - maxRows); i < messages.length; i++) {
        var msg = messages[i];
        
        // Skip system messages and invalid messages
        if (this._isDuplicateMessage(msg, null)) {
            continue;
        }
        
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            var from = msg.nick.name;
            var isFirstMessage = (lastSender === null);
            var msgText = from + ': ' + (msg.str || msg.text || '');
            var lines = wrapText(msgText, maxMsgWidth);
            
            // Log each message we're processing
            
            if (isFirstMessage || !this._isSenderSameAsLast(from, lastSender)) {
                // Switch sides ONLY when the sender changes
                currentSide = (currentSide === 'left') ? 'right' : 'left';
                
                // Calculate avatar position - using currentSide for consistency
                var avatarPosition = this._calculateAvatarPosition(from, yCursor, avatarHeight, currentSide);
                var col = (currentSide === 'left') ? 'left' : 'right';
                avatarPlacements[col].push(avatarPosition);
                
                // Start a new sender group
                if (currentGroup) senderGroups.push(currentGroup);
                currentGroup = { sender: from, start: yCursor, end: yCursor + lines.length - 1 };
            } else {
                // Continue the current group
                if (currentGroup) currentGroup.end = yCursor + lines.length - 1;
            }
            yCursor += lines.length;
            lastSender = from;
        }
    }
    if (currentGroup) senderGroups.push(currentGroup);
    
    // Store the final side for consistent use in other methods
    this.lastMsgSide = currentSide;
    
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

// Helper: Check if a sender is the same as the previous sender
Chat.prototype._isSenderSameAsLast = function(currentSender, lastSender) {
    return currentSender === lastSender && lastSender !== null;
};

// Helper: Print text at current position based on side (left/right)
Chat.prototype._printText = function(text, side, maxMsgWidth, x, y) {
    // Safety check: if y is beyond the frame height, don't print anything
    if (y >= this.centerMsgFrame.height) {
        return;
    }
    
    // Ensure text is a string and not null/undefined
    text = text || "";
    
    // STRICT fixed positions for maximum consistency
    var LEFT_COLUMN_START = 2;        // Fixed position for left column
    var LEFT_MAX_WIDTH = 28;          // Further reduced max width for left column text for safety
    
    // Calculate actual right position based on frame width
    var frameWidth = this.centerMsgFrame.width;
    var RIGHT_COLUMN_START = Math.floor(frameWidth / 2) + 2; // Position right after midpoint
    var RIGHT_MAX_WIDTH = 28;         // Further reduced max width for right column text for safety
    
    // log removed
    
    // Always clear the ENTIRE line first to avoid artifacts
    this.centerMsgFrame.gotoxy(1, y);
    this.centerMsgFrame.cleartoeol();
    
    if (side === 'left') {
        // LEFT COLUMN - Fixed position on left side
        var displayText = text;
        
        // VERY STRICT safety check - always cap to max width
        if (text.length > LEFT_MAX_WIDTH) {
            displayText = text.substring(0, LEFT_MAX_WIDTH - 3) + "...";
            // log removed
        }
        
        // Go to fixed left position and print
        this.centerMsgFrame.gotoxy(LEFT_COLUMN_START, y);
    // log removed
        this.centerMsgFrame.putmsg(displayText);
    } else {
        // RIGHT COLUMN - Fixed position on right side - NOT related to midpoint
        var displayText = text;
        
        // VERY STRICT safety check - always cap to max width
        if (text.length > RIGHT_MAX_WIDTH) {
            displayText = text.substring(0, RIGHT_MAX_WIDTH - 3) + "...";
            // log removed
        }
        
        // Go to fixed right position and print
        this.centerMsgFrame.gotoxy(RIGHT_COLUMN_START, y);
    // log removed
        this.centerMsgFrame.putmsg(displayText);
    }
};

// Helper: Switch the rendering column (left/right)
Chat.prototype._switchRenderingColumn = function() {
    var oldSide = this.lastMsgSide; // log removed
    this.lastMsgSide = (this.lastMsgSide === 'left') ? 'right' : 'left';
    // log removed
    return this.lastMsgSide;
};

// Helper: Check if a message is a duplicate or system message
Chat.prototype._isDuplicateMessage = function(currentMsg, previousMsg) {
    // Safety check for invalid messages
    if (!currentMsg) {
    // log removed
        return true;
    }
    
    // Check for duplicate messages (same sender and timestamp)
    var isDuplicate = previousMsg && 
                     currentMsg.nick && 
                     previousMsg.nick && 
                     currentMsg.nick.name === previousMsg.nick.name && 
                     currentMsg.time === previousMsg.time;
                     
    // Also check for system messages - we want to exclude these from regular chat flow
    var isSystemMsg = false;
    if (currentMsg && currentMsg.nick && typeof currentMsg.nick.name === 'string') {
        // Check for system message patterns
        var name = currentMsg.nick.name;
        isSystemMsg = name.match(/^\*+$/) || 
                     name.match(/^=+$/) || 
                     name.match(/^-+$/) ||
                     name === 'System' ||
                     name === 'STATUS';
    }
    
    // Also check message content for system messages
    if (currentMsg && !isSystemMsg) {
        var msgText = currentMsg.str || currentMsg.text || "";
        isSystemMsg = msgText.match(/\b(has joined|has left|has quit|has connected|has disconnected)\b/i);
    }
    
    // Debug log for every message filtering decision
    if (isDuplicate || isSystemMsg) {
    // log removed
    }
    
    return isDuplicate || isSystemMsg;
};


// Helper: Draw divider at a specific position and side
Chat.prototype._drawDividerAtPosition = function(dividerStr, side, maxMsgWidth, y) {
    // Get frame width for calculations
    var frameWidth = this.centerMsgFrame.width;
    var middleX = Math.floor(frameWidth / 2);
    
    // Clear the line first to avoid artifacts
    this.centerMsgFrame.gotoxy(1, y);
    this.centerMsgFrame.cleartoeol();
    
    if (side === 'left') {
        // Draw dividers using the same fixed positions as _printText
        var LEFT_COLUMN_START = 2;
        this.centerMsgFrame.gotoxy(LEFT_COLUMN_START, y);
        this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
    } else {
        // Right side uses the consistent position from _printText
        var RIGHT_COLUMN_START = middleX + 2;
        this.centerMsgFrame.gotoxy(RIGHT_COLUMN_START, y);
        this.centerMsgFrame.putmsg(dividerStr, this.groupLineColor);
    }
};

// Helper: draw last divider - SIMPLIFIED VERSION
Chat.prototype._drawLastDivider = function(messages, maxMsgWidth, centerWidth) {
    // Just log that we're skipping the divider for now
    // log removed
    
    // DO NOTHING - we're skipping the divider entirely to avoid formatting issues
    // This will let messages render normally without any special handling for the last one
    
    return; // Exit early - don't draw anything
}

// Helper: draw input frame
Chat.prototype._drawInputFrame = function() {
    this.chatInputFrame.gotoxy(2, 1);
    this.chatInputFrame.putmsg('You: ' + this.input + '_');
    this.chatInputFrame.gotoxy(2, 2);
    this.chatInputFrame.putmsg('[ESC to exit chat]');
};


Chat.prototype._cleanup = function(){
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
}

Chat.prototype._refresh = function(){
	// Defensive: check connection health and wrap in try/catch to prevent blocking shell
	if (this.jsonchat && this.jsonchat.client && this.jsonchat.client.connected) {
		var client = this.jsonchat.client;
		// Skip if no data waiting - prevents blocking on partial data
		if (client.socket && !client.socket.data_waiting) {
			// No data to read, skip cycle
		} else {
			var cycleStart = Date.now();
			try { this.jsonchat.cycle(); } catch (e) {
				try { dbug('[Chat._refresh] jsonchat cycle error: ' + e, 'chat'); } catch (_) { }
			}
			var cycleDuration = Date.now() - cycleStart;
			if (cycleDuration > 2000) {
				try { dbug('[Chat._refresh] jsonchat cycle took ' + cycleDuration + 'ms - potential blocking!', 'chat'); } catch (_) { }
			}
		}
	}
	this.draw();
};
Chat.prototype._renderMessages = function(messages, maxRows, maxMsgWidth, centerWidth, senderGroups) {
    var y = 1;
    var lastSender = null;
    var firstGroup = true;
    var prevMsg = null;
    
    // Clear the entire message frame first
    this.centerMsgFrame.clear();
    
    // Ensure we don't render more lines than the frame can hold
    var maxVisibleRows = this.centerMsgFrame.height - 1; // Leave one row as buffer
    
    // IMPORTANT: Pre-calculate how many lines each message will take
    // This lets us prioritize newer messages by calculating from the end
    var messageLinesNeeded = [];
    var totalLinesNeeded = 0;
    
    // First pass - calculate how many lines each message will need
    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        var prevMsg = (i > 0) ? messages[i - 1] : null;
        
        // Skip system messages and duplicates
        if (this._isDuplicateMessage(msg, prevMsg)) {
            messageLinesNeeded.push(0); // This message won't be shown
            continue;
        }
        
        // Only process valid user messages
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            var from = msg.nick.name;
            var msgText = from + ': ' + (msg.str || msg.text || '');
            var lines = wrapText(msgText, Math.min(30, maxMsgWidth));
            
            // Store the number of lines needed for this message
            messageLinesNeeded.push(lines.length);
            totalLinesNeeded += lines.length;
            
            // Add 1 line for dividers between sender groups if needed
            if (i > 0 && from !== messages[i-1].nick.name) {
                totalLinesNeeded += 1;
                messageLinesNeeded[i] += 1; // Add the divider to this message's count
            }
        } else {
            messageLinesNeeded.push(0); // Invalid message won't be shown
        }
    }
    
    // Calculate which messages we can fit, starting from newest
    var startIndex = messages.length - 1;
    var visibleLines = 0;
    
    // Work backward from the newest message until we fill the visible area
    while (startIndex >= 0 && visibleLines < maxVisibleRows) {
        visibleLines += messageLinesNeeded[startIndex];
        startIndex--;
    }
    
    // Adjust startIndex to show as many complete messages as possible
    startIndex = Math.max(0, startIndex + 1);
    
    // log removed
    
    // Initialize currentSide - BUT we need special handling when starting mid-conversation
    var currentSide = this.lastMsgSide || 'left';
    
    // If we're starting from a message in the middle due to our new scrolling approach,
    // we need to determine what side this message should be on based on the sender pattern
    if (startIndex > 0) {
        // Count how many unique senders there are before our start point
        var seenSenders = {};
        var senderCount = 0;
        
        for (var i = 0; i < startIndex; i++) {
            if (messages[i] && messages[i].nick && messages[i].nick.name) {
                var sender = messages[i].nick.name;
                if (!seenSenders[sender]) {
                    seenSenders[sender] = true;
                    senderCount++;
                }
            }
        }
        
        // If there's an odd number of sender changes, we should start on the right
        // If there's an even number, we should start on the left
        var startSide = (senderCount % 2 === 0) ? 'left' : 'right';
        
        // Look at the first message we're going to show
        if (messages[startIndex] && messages[startIndex].nick && messages[startIndex].nick.name) {
            var firstVisibleSender = messages[startIndex].nick.name;
            var previousSender = (startIndex > 0 && messages[startIndex-1] && 
                                 messages[startIndex-1].nick) ? 
                                 messages[startIndex-1].nick.name : null;
                                 
            // If this is a continuation of the same sender, keep the same side
            if (previousSender === firstVisibleSender) {
                // log removed
                currentSide = startSide;
            } else {
                // This is a new sender, so alternate from the calculated start side
                // log removed
                currentSide = (startSide === 'left') ? 'right' : 'left';
            }
        }
        
    // log removed
    }
    
    // DEBUG: Log the last 3 messages to examine their structure
    try {
        if (messages.length >= 3) {
            // log removed
            for (var i = messages.length - 3; i < messages.length; i++) {
                var msg = messages[i];
                var msgProps = {
                    index: i,
                    nick: msg.nick ? (msg.nick.name || '(no name)') : '(no nick)',
                    time: msg.time || '(no time)',
                    text: (msg.str || msg.text || '').substring(0, 30) + ((msg.str || msg.text || '').length > 30 ? '...' : ''),
                    hasNick: !!msg.nick,
                    hasNickName: !!(msg.nick && msg.nick.name),
                    hasStr: !!msg.str,
                    hasText: !!msg.text,
                    isDuplicate: this._isDuplicateMessage(msg, messages[i-1]),
                    allProps: Object.keys(msg).join(', ')
                };
                // log removed
            }
            // log removed
        }
    } catch(e) {
    // log removed
    }
    
    // Debug logging to help troubleshoot
    // log removed
    
    // IMPORTANT: We're now rendering only the newest messages that will fit in our visible area
    for (var i = startIndex; i < messages.length; i++) {
        var msg = messages[i];
        var prevMsg = (i > startIndex) ? messages[i - 1] : null;
        
        // Skip system messages and duplicates
        if (this._isDuplicateMessage(msg, prevMsg)) {
            continue;
        }
        
        // Only process valid user messages
        if (msg && msg.nick && msg.nick.name && (msg.str || msg.text)) {
            var from = msg.nick.name;
            var isFirstMessage = (lastSender === null);
            var msgText = from + ': ' + (msg.str || msg.text || '');
            
            // FIXED width approach - no calculations
            var LEFT_MAX_WIDTH = 30;  // Match with _printText
            var RIGHT_MAX_WIDTH = 30; // Match with _printText
            
            // Select fixed width based on which side we're on
            var wrapWidth = (currentSide === 'left') ? LEFT_MAX_WIDTH : RIGHT_MAX_WIDTH;
            
            // Log the wrap setting
            // log removed
                
            var lines = wrapText(msgText, wrapWidth);
            
            // Clear the current row before printing anything
            this.centerMsgFrame.gotoxy(1, y);
            this.centerMsgFrame.cleartoeol();
            
            // CRITICAL SAFETY CHECK: Stop rendering if we've reached the frame boundary
            if (y >= maxVisibleRows) {
                // log removed
                break; // Stop rendering more messages
            }
            
            var senderChanged = isFirstMessage || !this._isSenderSameAsLast(from, lastSender);
            
            // Enhanced debug logging for sender changes
            // log removed
                
            // Draw a vertical separator down the middle of the screen for clarity
            this._drawVerticalSeparator();
            
            // Switch sides ONLY when sender changes
            if (senderChanged) {
                // First message or new sender - switch sides
                currentSide = this._switchRenderingColumn();
                // log removed
            } else {
                // Same sender - DEFINITELY keep the same side
                // log removed
                // Double-check we're using the correct side - no switching allowed
                currentSide = this.lastMsgSide; 
            }
            
            // Check if we need to add a divider between message groups
            var needDivider = senderChanged && !firstGroup;
            
            if (needDivider) {
                var drawY = y;
                
                // Clear the line first
                this.centerMsgFrame.gotoxy(1, drawY);
                this.centerMsgFrame.cleartoeol();
                
                // Draw a simple divider
                if (typeof this.groupLineColor !== 'undefined') {
                    this.centerMsgFrame.attributes = this.groupLineColor;
                }
                var curTime = (msg && typeof msg.time === 'number') ? msg.time : Date.now();
                var prevTime = (prevMsg && typeof prevMsg.time === 'number') ? prevMsg.time : undefined;
                
                // Simple timestamp
                var timestamp = createTimestamp(curTime, prevTime);
                var dashStr =  '-------'; // fixme this is garbage logic
                var dividerStr = dashStr + "< " + timestamp + " >" + dashStr;
                
                // Center the divider
                var frameWidth = this.centerMsgFrame.width;
                var startX = Math.max(1, Math.floor((frameWidth - dividerStr.length) / 2));
                
                this.centerMsgFrame.gotoxy(startX, drawY);
                this.centerMsgFrame.putmsg(dividerStr);
                
                // Reset color
                if (typeof WHITE !== 'undefined') {
                    this.centerMsgFrame.attributes = WHITE;
                }
                
                y++; // Move down after the divider
            }
            
            // Add this message to the screen
            if (lines && lines.length > 0) {
                // Get divider string based on opposite side from the message
                var dividerSide = (currentSide === 'left') ? 'right' : 'left';
                var dividerStr = getDividerString(dividerSide, maxMsgWidth, 
                                                prevMsg ? prevMsg.time : undefined, 
                                                msg.time);
                
                if (needDivider) {
                    // Start a new message after the divider
                    var drawY = y;
                    this.centerMsgFrame.gotoxy(1, drawY);
                    this.centerMsgFrame.cleartoeol();
                    
                    // Draw the first line of the message on the CURRENT side
                    if (lines.length > 0) {
                        this._printText(lines[0], currentSide, maxMsgWidth, 2, drawY);
                    }
                    y += 1;
                } else {
                    var drawY = y;
                    this.centerMsgFrame.gotoxy(1, drawY);
                    this.centerMsgFrame.cleartoeol();
                    
                    // No divider needed, print on current side
                    if (lines.length > 0) {
                        this._printText(lines[0], currentSide, maxMsgWidth, 2, drawY);
                    }
                    y += 1;
                }
                
                // Store the message side to ensure all wrapped lines use the same side
                var messageSide = currentSide;
                
                // All wrapped lines ALWAYS go on the same side as the first line
                for (var l = 1; l < lines.length; l++) {
                    // IMPORTANT SAFETY CHECK: Stop rendering if we're approaching the frame boundary
                    if (y >= maxVisibleRows) {
                        // log removed
                        break;
                    }
                    
                    var drawY = y;
                    var msgStr = lines[l] || "";  // Ensure we have valid text
                    this.centerMsgFrame.gotoxy(1, drawY);
                    this.centerMsgFrame.cleartoeol();
                    
                    // Log each line we're rendering
                    // log removed
                    
                    // No need to clear the line again since we already did above
                    
                    // Print ALL lines on the same side - NEVER switch within a message
                    // Use messageSide which is frozen for this entire message
                    this._printText(msgStr, messageSide, maxMsgWidth, 2, drawY);
                    y += 1;
                }
            }
            
            // Mark this group as processed
            firstGroup = false;
            lastSender = from;
        } else {
            // Skip invalid messages but log for debugging
            // log removed
        }
    }
    
    // Add specific logging for the very last message
    if (messages.length > 0) {
        var lastMsg = messages[messages.length - 1];
        var wasLastMsgRendered = (i >= messages.length); // Did we actually get to render the last message?
        
    // log removed
    }
    
    // Update the instance variable to maintain state between calls - BUT only if we 
    // actually rendered the newest message, otherwise preserve the previous state
    if (i >= messages.length) {
        // We rendered all messages including the newest one, so update the side
        this.lastMsgSide = currentSide;
    // log removed
    } else {
        // We didn't render the newest message, so don't update the side tracking
    // log removed
    }
    
    // Debug log for tracking side changes
    // log removed
    
    return { row: Math.min(y, maxVisibleRows), side: currentSide };
};
