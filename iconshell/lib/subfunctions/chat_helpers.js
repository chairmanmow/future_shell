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
};


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

function packAvatars(placements, maxRows) {
    var packed = [];
    for (var i = 0; i < placements.length; i++) {
        var req = placements[i];
        var merged = false;
        for (var j = 0; j < packed.length; j++) {
            var p = packed[j];
            if (p.user === req.user && !(req.y + req.height - 1 < p.y || req.y > p.y + p.height - 1)) {
                var newStart = Math.min(p.y, req.y);
                var newEnd = Math.max(p.y + p.height - 1, req.y + req.height - 1);
                p.y = newStart;
                p.height = newEnd - newStart + 1;
                merged = true;
                break;
            }
        }
        if (!merged) {
            var bestY = null;
            var minGap = null;
            var maxY = Math.max(1, maxRows - req.height + 1);
            for (var tryY = req.y - 3; tryY <= req.y + 3; tryY++) {
                if (tryY < 1 || tryY > maxY) continue;
                var overlap = false;
                for (var j = 0; j < packed.length; j++) {
                    var p = packed[j];
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
            if (bestY === null) {
                bestY = req.y;
            }
            packed.push({ user: req.user, y: bestY, height: req.height });
        }
    }
    packed.sort(function(a, b) { return a.y - b.y; });
    return packed;
};

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