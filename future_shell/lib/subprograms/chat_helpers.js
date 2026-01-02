function createTimestamp(currentMsgTime, lastMsgTime) {
    function pad(n) { return n < 10 ? '0' + n : n; }
    function ampm(hours) { return hours % 12 === 0 ? 12 : hours % 12; }
    function getAmPm(hours) { return hours < 12 ? 'am' : 'pm'; }
    var now = new Date();
    var todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();
    var cur = new Date(currentMsgTime);
    var curY = cur.getFullYear(), curM = cur.getMonth(), curD = cur.getDate();
    var curH = cur.getHours(), curMin = cur.getMinutes();
    var curIsToday = (curY === todayY && curM === todayM && curD === todayD);
    var curDateStr = pad(curM + 1) + '/' + pad(curD) + '/' + String(curY).slice(-2);
    var curTimeStr = ampm(curH) + ':' + pad(curMin) + ' ' + getAmPm(curH);

    if (!lastMsgTime) {
        if (curIsToday) {
            return 'Today ' + curTimeStr;
        } else {
            return curDateStr + ' ' + curTimeStr;
        }
    }

    var last = new Date(lastMsgTime);
    var lastY = last.getFullYear(), lastM = last.getMonth(), lastD = last.getDate();
    var lastIsToday = (lastY === todayY && lastM === todayM && lastD === todayD);

    // If same day
    if (curY === lastY && curM === lastM && curD === lastD) {
        if (curIsToday) {
            // Show time difference from now to currentMsgTime
            var diffMs = now - cur;
            var diffMin = Math.floor(diffMs / 60000);
            var diffHr = Math.floor(diffMin / 60);
            diffMin = diffMin % 60;
            var agoStr = '';
            if (diffHr > 0) agoStr += diffHr + ' hour' + (diffHr > 1 ? 's' : '');
            if (diffHr > 0 && diffMin > 0) agoStr += ' ';
            if (diffMin > 0) agoStr += diffMin + ' minute' + (diffMin > 1 ? 's' : '');
            if (!agoStr) agoStr = 'just now';
            else agoStr += ' ago';
            return agoStr;
        } else {
            return curTimeStr;
        }
    }

    // If current is today, but previous is not
    if (curIsToday && !lastIsToday) {
        return 'Today ' + curTimeStr;
    }

    // If different days
    return curDateStr + ' ' + curTimeStr;
}

function wrapText(text, width) {
    width = width - 3;
    var lines = [];
    var words = text.split(' ');
    var line = '';
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        // If the word itself is longer than width, break it up
        while (word.length > width) {
            if (line.length > 0) {
                lines.push(line);
                line = '';
            }
            lines.push(word.slice(0, width));
            word = word.slice(width);
        }
        if ((line.length ? line.length + 1 : 0) + word.length > width) {
            if (line.length > 0) lines.push(line);
            line = word;
        } else {
            line += (line.length ? ' ' : '') + word;
        }
    }
    if (line.length > 0) lines.push(line);
    return lines;
}

function getDividerString(side, width, currentMsgTime, lastMsgTime) {
    var ts = createTimestamp(currentMsgTime, lastMsgTime);
    var padLen = width - ts.length - 1;
    if (padLen < 0) padLen = 0;
    var pad = Array(padLen).join('-');
    // Place timestamp at start or end depending on side
    if (side === 'left') {
        return ts + pad + ">";
    } else {
        return "<" + pad + ts;
    }
}

function packAvatars(placements, maxRows, opts) {
    var packed = [];
    var desiredPadding = (opts && typeof opts.padding === 'number') ? opts.padding : 1;

    function clamp(value, min, max) {
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    for (var i = 0; i < placements.length; i++) {
        var req = placements[i];
        if (!req || !req.user) continue;
        var height = Math.max(1, req.height || 1);
        var maxTop = Math.max(1, maxRows - height + 1);
        var minY = (typeof req.minY === 'number') ? req.minY : req.y;
        var maxY = (typeof req.maxY === 'number') ? req.maxY : req.y;
        minY = clamp(minY, 1, maxTop);
        maxY = clamp(maxY, 1, maxTop);
        if (minY > maxY) {
            var clamped = clamp(req.y, 1, maxTop);
            minY = clamped;
            maxY = clamped;
        }

        var best = null;
        var bestOverlap = null;

        for (var tryY = minY; tryY <= maxY; tryY++) {
            var curStart = tryY;
            var curEnd = tryY + height - 1;
            var overlapRows = 0;
            var minGap = null;
            var collision = false;

            for (var j = 0; j < packed.length; j++) {
                var p = packed[j];
                var pStart = p.y;
                var pEnd = p.y + p.height - 1;
                if (curEnd < pStart) {
                    var gap = pStart - curEnd - 1;
                    if (minGap === null || gap < minGap) minGap = gap;
                } else if (pEnd < curStart) {
                    var gap2 = curStart - pEnd - 1;
                    if (minGap === null || gap2 < minGap) minGap = gap2;
                } else {
                    collision = true;
                    var overlap = Math.min(curEnd, pEnd) - Math.max(curStart, pStart) + 1;
                    overlapRows += overlap;
                    if (minGap === null || -1 < minGap) minGap = -1;
                }
            }

            var dist = Math.abs(tryY - req.y);
            if (!collision) {
                var padPenalty = 0;
                if (minGap !== null && minGap < desiredPadding) {
                    padPenalty = (desiredPadding - minGap) * 5;
                }
                var score = dist * 2 + padPenalty;
                if (!best || score < best.score || (score == best.score && tryY < best.y)) {
                    best = { y: tryY, score: score };
                }
            } else {
                var overlapScore = overlapRows * 10 + dist * 2;
                if (!bestOverlap || overlapScore < bestOverlap.score || (overlapScore == bestOverlap.score && tryY < bestOverlap.y)) {
                    bestOverlap = { y: tryY, score: overlapScore };
                }
            }
        }

        var finalY = best ? best.y : (bestOverlap ? bestOverlap.y : clamp(req.y, 1, maxTop));
        packed.push({ user: req.user, y: finalY, height: height, available: req.available });
    }
    packed.sort(function(a, b) { return a.y - b.y; });
    return packed;
}

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

// New helper function to render message frames
function renderMessageFrames(messageFrames, centerMsgFrame, maxMsgWidth) {
    // Clear the frame first
    centerMsgFrame.clear();
    
    for (var i = 0; i < messageFrames.length; i++) {
        var frame = messageFrames[i];
        var y = frame.y;
        var side = frame.side;
        var msg = frame.msg;
        var text = frame.text || '';  // Support for divider text
        var isDivider = frame.isDivider || false;
        var color = frame.color || undefined;
        
        // Skip rendering if outside visible area
        if (y < 1 || y > centerMsgFrame.height) continue;
        
        // Clear the line first
        centerMsgFrame.gotoxy(2, y);
        centerMsgFrame.putmsg(Array(centerMsgFrame.width - 1).join(' '));
        
        if (isDivider) {
            // Render divider with color if specified
            if (side === 'left') {
                centerMsgFrame.gotoxy(2, y);
                centerMsgFrame.putmsg(text, color);
            } else {
                centerMsgFrame.gotoxy(2 + maxMsgWidth, y);
                centerMsgFrame.putmsg(text, color);
            }
        } else if (text) {
            // Render regular message
            if (side === 'left') {
                var msgPadLen = maxMsgWidth - text.length;
                if (msgPadLen < 0) msgPadLen = 0;
                var leftHalf = text + Array(msgPadLen + 1).join(' ');
                centerMsgFrame.gotoxy(2, y);
                centerMsgFrame.putmsg(leftHalf, color);
            } else {
                var rightHalf = (text.length >= maxMsgWidth)
                    ? text.slice(-maxMsgWidth)
                    : Array((maxMsgWidth - text.length)).join(' ') + text;
                centerMsgFrame.gotoxy(2 + maxMsgWidth, y);
                centerMsgFrame.putmsg(rightHalf, color);
            }
        }
    }
}
