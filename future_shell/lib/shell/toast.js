if (typeof lazyLoadModule !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
var MIN_TOAST_WIDTH = 40;
var TARGET_TOAST_WIDTH = 60;
var DEFAULT_TOAST_TIMEOUT = 30000; // 30 seconds
var TOAST_PIPE_RE = /\|[0-9A-Za-z]{2}/g;
var TOAST_CTRL_A_RE = /\x01./g;
var TOAST_ANSI_RE = /\x1B\[[0-?]*[ -\/]*[@-~]/g;

function normalizeToastAttr(val, key, fallback) {
    if (val === null || val === undefined) return toastAttr(key, fallback);
    if (typeof val === 'number') return val | 0;
    if (typeof val === 'string' && val.trim().length) {
        var parsed = toastParseAttrString(val.trim());
        if (parsed !== null && parsed !== undefined) return parsed;
        var themed = toastAttr(val.trim(), null);
        if (themed !== null && themed !== undefined) return themed;
    }
    return toastAttr(key, fallback);
}

function normalizeToastColors(input) {
    var src = (input && typeof input === 'object') ? input : {};
    var colors = {
        frame: normalizeToastAttr(src.frame, 'TOAST_FRAME', ((typeof BG_BLACK !== 'undefined') ? BG_BLACK : 0) | ((typeof LIGHTGRAY !== 'undefined') ? LIGHTGRAY : 7)),
        msg: normalizeToastAttr(src.msg, 'TOAST_MSG', ((typeof BG_MAGENTA !== 'undefined') ? BG_MAGENTA : 0) | ((typeof WHITE !== 'undefined') ? WHITE : 7)),
        border: normalizeToastAttr(src.border, 'TOAST_BORDER', (typeof BG_BLUE !== 'undefined') ? BG_BLUE : 0),
        title: normalizeToastAttr(src.title, 'TOAST_TITLE', (typeof WHITE !== 'undefined' && typeof BG_GREEN !== 'undefined') ? (WHITE | BG_GREEN) : (((typeof BG_MAGENTA !== 'undefined') ? BG_MAGENTA : 0) | ((typeof WHITE !== 'undefined') ? WHITE : 7))),
        avatar: normalizeToastAttr(src.avatar, 'TOAST_AVATAR', (((typeof BG_BLACK !== 'undefined') ? BG_BLACK : 0) | ((typeof WHITE !== 'undefined') ? WHITE : 7)))
    };
    return colors;
}

function toastParseAttrString(str) {
    if (!str || typeof str !== 'string') return null;
    var parts = str.split('|');
    var acc = 0; var seen = false;
    for (var i = 0; i < parts.length; i++) {
        var token = parts[i];
        if (!token) continue;
        var t = token.trim();
        if (!t.length) continue;
        var val = null;
        if (/^0x[0-9a-f]+$/i.test(t)) val = parseInt(t, 16);
        else if (/^[0-9]+$/.test(t)) val = parseInt(t, 10);
        else {
            try { if (eval('typeof ' + t + ' !== "undefined"')) { var ev = eval(t); if (typeof ev === 'number') val = ev; } } catch (_) { }
        }
        if (val !== null && val !== undefined) { acc |= val; seen = true; }
    }
    return seen ? acc : null;
}

function toastAttr(key, fallback) {
    if (typeof ICSH_ATTR === 'function') {
        try { return ICSH_ATTR(key); } catch (_) { }
    }
    if (typeof ICSH_VALS !== 'undefined' && ICSH_VALS && ICSH_VALS[key] !== undefined) {
        var val = ICSH_VALS[key];
        if (typeof val === 'number') return val;
        if (val && typeof val === 'object') return (val.BG || 0) | (val.FG || 0);
    }
    var parsed = toastParseAttrString(key);
    if (parsed !== null) return parsed;
    return fallback;
}

function resolveToastAttr(optVal, key, fallback) {
    if (optVal !== undefined && optVal !== null) {
        if (typeof optVal === 'number') return optVal | 0;
        if (typeof optVal === 'string' && optVal.trim().length) {
            var parsed = toastParseAttrString(optVal.trim());
            if (parsed !== null && parsed !== undefined) return parsed;
            var themed = toastAttr(optVal.trim(), null);
            if (themed !== null && themed !== undefined) return themed;
        }
    }
    return toastAttr(key, fallback);
}

function toastStripColors(str) {
    if (!str) return '';
    return String(str).replace(TOAST_ANSI_RE, '').replace(TOAST_PIPE_RE, '').replace(TOAST_CTRL_A_RE, '');
}

function toastLongestWord(str) {
    if (!str) return 0;
    var longest = 0;
    var parts = str.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
        if (parts[i].length > longest) longest = parts[i].length;
    }
    return longest;
}

function toastFallbackWrap(str, width) {
    if (width <= 0) return [String(str)];
    var lines = [];
    var segments = String(str).replace(/\r/g, '\n').split('\n');
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        if (!seg.length) {
            lines.push('');
            continue;
        }
        while (seg.length > width) {
            lines.push(seg.substr(0, width));
            seg = seg.substr(width);
        }
        lines.push(seg);
    }
    return lines;
}

function toastWrapText(str, width) {
    if (width <= 0) return [String(str)];
    if (typeof word_wrap === 'function') {
        try {
            var wrapped = word_wrap(str, width, str.length, false);
            if (Array.isArray(wrapped)) return wrapped;
            if (typeof wrapped === 'string') return wrapped.split(/\r?\n/);
        } catch (_) { }
    }
    return toastFallbackWrap(str, width);
}
// Position keywords: 'top-left','top-right','bottom-left','bottom-right','center'
// For now we implement corner logic + center; bottom variants offset 1 row above bottom to avoid crumb bar.

function Toast(options) {
    if (!options || typeof options !== 'object') options = {};
    this._avatarData = null; /* IconShell.showToast() wraps toast instances and assigns
        a unique printable token (e.g. '~t1~'). The shell keeps a keystroke buffer
        and matches that token in processKeyboardInput(), launching/dismissing the
        toast via opts.launch/opts.action. Adjusting toast metadata? keep that
        token-based flow (see shelllib.js). */
    this.title = options.title || false;
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
    var timeout = (typeof options.timeout === 'number') ? options.timeout : DEFAULT_TOAST_TIMEOUT;
    var userOnDone = options.onDone;
    var programIconName = (typeof options.programIcon === 'string' && options.programIcon.length) ? options.programIcon : null;
    var hasAvatar = false;
    if (options.avatar && this._avatarLib) {
        if (options.avatar.netaddr === system.name) {
            var uNum = system.matchuser(options.avatar.username);
            this.avatarData = this._avatarLib.read(uNum);

        } else if (options.avatar.username && options.avatar.netaddr) {
            this.avatarData = this._avatarLib.read_netuser(options.avatar.username, options.avatar.netaddr);
        }
        if (this.avatarData) hasAvatar = true;
    }
    var hasProgramIcon = !!programIconName && !hasAvatar;
    this._programIconName = hasProgramIcon ? programIconName : null;
    this._colorOverrides = (options && typeof options.colors === 'object' && options.colors !== null) ? options.colors : {};
    this._colors = normalizeToastColors(this._colorOverrides);
    var graphicWidth = hasAvatar ? 10 : (hasProgramIcon ? 12 : 0);
    var msgOffset = graphicWidth ? graphicWidth + 2 : 0;
    var rawMessage = options.message;
    if (rawMessage === undefined || rawMessage === null) rawMessage = '';
    rawMessage = String(rawMessage);
    var cleanMessage = toastStripColors(rawMessage);
    var longestWord = toastLongestWord(cleanMessage);
    var titleText = this.title ? toastStripColors(String(this.title)) : '';
    var minWidth = Math.max(MIN_TOAST_WIDTH, 12, longestWord + 4);
    if (titleText.length) minWidth = Math.max(minWidth, titleText.length + 4);
    if (hasAvatar || hasProgramIcon) minWidth = Math.max(minWidth, 20);
    if (typeof options.width === 'number' && options.width > 0) minWidth = Math.max(minWidth, options.width);
    var targetWidth = Math.max(TARGET_TOAST_WIDTH, minWidth);
    var scrW = console.screen_columns || 80;
    var maxWidth = Math.max(10, scrW - ((hasAvatar || hasProgramIcon) ? 2 : 0));
    function computeLayout(widthCandidate) {
        var messageWrapWidthCandidate = Math.max(10, widthCandidate - (msgOffset + 2));
        var linesCandidate = toastWrapText(cleanMessage, messageWrapWidthCandidate);
        if (!linesCandidate || !linesCandidate.length) linesCandidate = [''];
        var contentHeightCandidate = linesCandidate.length;
        var minHeightCandidate = (hasAvatar || hasProgramIcon) ? 6 : 3;
        var heightCandidate = Math.max(minHeightCandidate, contentHeightCandidate + 2);
        if (typeof options.height === 'number' && options.height > heightCandidate) heightCandidate = options.height;
        if (heightCandidate < 1) heightCandidate = 1;
        if (heightCandidate > console.screen_rows) heightCandidate = console.screen_rows;
        return {
            width: widthCandidate,
            wrapWidth: messageWrapWidthCandidate,
            lines: linesCandidate,
            height: heightCandidate
        };
    }
    var initialWidth = Math.min(maxWidth, targetWidth);
    var layout = computeLayout(initialWidth);
    if (layout.height >= 7 && maxWidth > layout.width) {
        var best = layout;
        for (var w = Math.min(maxWidth, Math.max(layout.width + 2, TARGET_TOAST_WIDTH)); w <= maxWidth; w += 2) {
            var candidate = computeLayout(w);
            if (candidate.height < best.height || (candidate.height === best.height && candidate.width > best.width)) best = candidate;
            if (candidate.height <= 6) { best = candidate; break; }
        }
        layout = best;
    }
    var width = layout.width;
    var messageWrapWidth = layout.wrapWidth;
    var wrappedLines = layout.lines;
    var height = layout.height;
    var pos = options.position || 'bottom-right';
    var scrH = console.screen_rows || 24;
    var x = 1, y = 1;
    function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }
    switch (pos) {
        case 'top-right':
            x = scrW - width + 1; y = 1; break;
        case 'bottom-left':
            x = 1; y = scrH - height; break; // leave last line for crumb
        case 'bottom-right':
            x = scrW - width + 1; y = scrH - height;
            break;
        case 'center':
            x = Math.max(1, Math.floor((scrW - width) / 2) + 1);
            y = Math.max(1, Math.floor((scrH - height) / 2) + 1);
            break;
        case 'top-left':
        default:
            x = 1; y = 1; break;
    }
    x = clamp(x, 1, Math.max(1, scrW - width + 1));
    y = clamp(y, 1, Math.max(1, scrH - height + 1));
    this.avatarFrame = null;
    this.parentFrame = options.parentFrame || undefined;
    var frameAttr = this._colors.frame;
    this.toastFrame = new Frame(x, y, width, height, frameAttr, this.parentFrame);
    var msgAttr = this._colors.msg;
    this.msgContainer = new Frame(this.toastFrame.x + msgOffset, this.toastFrame.y, this.toastFrame.width - msgOffset, this.toastFrame.height, msgAttr, this.toastFrame);
    this.msgFrame = new Frame(this.msgContainer.x + 1, this.msgContainer.y + 1, this.msgContainer.width - 2, this.msgContainer.height - 2, msgAttr, this.msgContainer);
    if (typeof this.msgFrame.word_wrap !== 'undefined') this.msgFrame.word_wrap = true;
    this.toastFrame.transparent = true;
    var borderAttr = (typeof options.borderAttr === 'number') ? options.borderAttr : this._colors.border;
    var titleAttr = this._colors.title || msgAttr;
    if (typeof this.msgContainer.drawBorder === 'function') {
        this.msgContainer.drawBorder(borderAttr, !!this.title ? { x: 1, y: 1, attr: titleAttr, text: this.title } : null);
    }
    var avatarAttrInit = this._colors.avatar || msgAttr;
    if (this.avatarData) {
        // Position avatar one column to the left; width 11 to accommodate 10-col avatar with dstX offset
        this.avatarFrame = new Frame(this.toastFrame.x, this.toastFrame.y, 11, Math.min(6, this.toastFrame.height), avatarAttrInit, this.toastFrame);
        this.insertAvatarData();
    } else if (hasProgramIcon) {
        // Position program icon one column to the left to avoid being cut off by frame border
        this.programIconFrame = new Frame(this.toastFrame.x, this.toastFrame.y, 12, Math.min(6, this.toastFrame.height), avatarAttrInit, this.toastFrame);
        this._renderProgramIcon(programIconName);
    }
    this.toastFrame.draw();
    this.toastFrame.open();
    var self = this;
    (function renderLines(frame, lines) {
        if (!frame || !lines) return;
        if (typeof frame.clear === 'function') frame.clear();
        frame.home();
        for (var i = 0; i < lines.length && i < frame.height; i++) {
            frame.gotoxy(1, i + 1);
            var line = lines[i];
            if (line.length > frame.width) line = line.substr(0, frame.width);
            frame.putmsg(line);
        }
        if (typeof frame.cycle === 'function') frame.cycle();
    })(this.msgFrame, wrappedLines);

    this._dismissed = false;
    this._startTime = time();
    this._timeout = timeout;
    this._onDone = userOnDone;
    this._wrappedLines = wrappedLines;
    this._wrapWidth = messageWrapWidth;
    this._rawMessage = rawMessage;
    this._cleanMessage = cleanMessage;
    this._messageBorderAttr = borderAttr;

    this.dismiss = function (parentFrame) {
        if (self._dismissed) return;
        self._dismissed = true;
        self.toastFrame.clear();
        self.toastFrame.close();
        if (self.parentFrame && typeof self.parentFrame.cycle === 'function') self.parentFrame.cycle();
        if (typeof self._onDone === 'function') {
            try { self._onDone(self); } catch (_) { }
        }
    };
}

Toast.prototype._renderProgramIcon = function (iconName) {
    if (!this.programIconFrame || !iconName) return;
    var iconBase = 'future_shell/assets/' + iconName;
    var binPath = system.mods_dir + iconBase + '.bin';
    var ansPath = system.mods_dir + iconBase + '.ans';
    try {
        if (file_exists(binPath)) {
            this.programIconFrame.load(binPath, this.programIconFrame.width, this.programIconFrame.height);
            if (typeof this.programIconFrame.open === 'function') this.programIconFrame.open();
            if (typeof this.programIconFrame.cycle === 'function') this.programIconFrame.cycle();
            this.programIconFrame.transparent = true;
            return;
        }
        if (file_exists(ansPath)) {
            this.programIconFrame.load(ansPath, this.programIconFrame.width, this.programIconFrame.height);
            if (typeof this.programIconFrame.open === 'function') this.programIconFrame.open();
            if (typeof this.programIconFrame.cycle === 'function') this.programIconFrame.cycle();
            this.programIconFrame.transparent = true;
            return;
        }
    } catch (e) {
        try { log('Toast program icon load failed: ' + e); } catch (_) { }
    }
    try { this.programIconFrame.clear(ICSH_ATTR('TOAST_MSG')); } catch (_) { }
};

// Call this in your main loop to check for auto-dismiss
Toast.prototype.cycle = function () {
    if (this._dismissed) return;
    if (this._timeout > 0 && (time() - this._startTime) * 1000 >= this._timeout) {
        this.dismiss();
    }
};

Toast.prototype.refreshTheme = function () {
    if (!this._colorOverrides || typeof this._colorOverrides !== 'object') this._colorOverrides = {};
    var frameAttr = resolveToastAttr(this._colorOverrides.frame, 'TOAST_FRAME', ((typeof BG_BLACK !== 'undefined') ? BG_BLACK : 0) | ((typeof LIGHTGRAY !== 'undefined') ? LIGHTGRAY : 7));
    var msgAttr = resolveToastAttr(this._colorOverrides.msg, 'TOAST_MSG', ((typeof BG_MAGENTA !== 'undefined') ? BG_MAGENTA : 0) | ((typeof WHITE !== 'undefined') ? WHITE : 7));
    var avatarAttr = resolveToastAttr(this._colorOverrides.avatar, 'TOAST_AVATAR', null);
    if (avatarAttr === null || avatarAttr === undefined) {
        if (typeof ICSH_ATTR === 'function') avatarAttr = ICSH_ATTR('TOAST_AVATAR');
        else if (typeof ICSH_VALS !== 'undefined' && ICSH_VALS && ICSH_VALS.TOAST_AVATAR) {
            var avVal = ICSH_VALS.TOAST_AVATAR;
            if (typeof avVal === 'number') avatarAttr = avVal;
            else avatarAttr = (avVal.BG || 0) | (avVal.FG || 0);
        } else {
            avatarAttr = msgAttr;
        }
    }
    if (this.toastFrame) {
        this.toastFrame.attr = frameAttr;
        this.toastFrame.transparent = true;
        try { if (typeof this.toastFrame.top === 'function') this.toastFrame.top(); } catch (_) { }
        try { if (typeof this.toastFrame.cycle === 'function') this.toastFrame.cycle(); } catch (_) { }
    }
    var borderAttr = (this._messageBorderAttr !== undefined && this._messageBorderAttr !== null) ? this._messageBorderAttr : resolveToastAttr(this._colorOverrides.border, 'TOAST_BORDER', (typeof BG_BLUE !== 'undefined') ? BG_BLUE : (frameAttr & 0xF0));
    var titleAttr = resolveToastAttr(this._colorOverrides.title, 'TOAST_TITLE', (typeof WHITE !== 'undefined' && typeof BG_GREEN !== 'undefined') ? (WHITE | BG_GREEN) : msgAttr);
    if (this.msgContainer) {
        this.msgContainer.attr = msgAttr;
        try { this.msgContainer.clear(msgAttr); } catch (_) { }
        if (typeof this.msgContainer.drawBorder === 'function') {
            var titleInfo = this.title ? { x: 1, y: 1, attr: titleAttr, text: String(this.title) } : null;
            try { this.msgContainer.drawBorder(borderAttr, titleInfo); } catch (_) { }
        }
        try { if (typeof this.msgContainer.cycle === 'function') this.msgContainer.cycle(); } catch (_) { }
    }
    if (this.msgFrame) {
        this.msgFrame.attr = msgAttr;
        try { this.msgFrame.clear(msgAttr); } catch (_) { }
        this.msgFrame.home();
        var lines = this._wrappedLines || [];
        for (var i = 0; i < lines.length && i < this.msgFrame.height; i++) {
            var line = lines[i];
            if (line.length > this.msgFrame.width) line = line.substr(0, this.msgFrame.width);
            try {
                this.msgFrame.gotoxy(1, i + 1);
                this.msgFrame.putmsg(line);
            } catch (_) { }
        }
        try { if (typeof this.msgFrame.cycle === 'function') this.msgFrame.cycle(); } catch (_) { }
    }
    if (this.avatarFrame) {
        this.avatarFrame.attr = avatarAttr;
        try { this.avatarFrame.clear(avatarAttr); } catch (_) { }
        if (this.avatarData) this.insertAvatarData();
        try { if (typeof this.avatarFrame.cycle === 'function') this.avatarFrame.cycle(); } catch (_) { }
    }
    if (this.programIconFrame) {
        this.programIconFrame.attr = avatarAttr;
        try { this.programIconFrame.clear(avatarAttr); } catch (_) { }
        if (this._programIconName) this._renderProgramIcon(this._programIconName);
        try { if (typeof this.programIconFrame.cycle === 'function') this.programIconFrame.cycle(); } catch (_) { }
    }
};


Toast.prototype._blitAvatarToFrame = function (frame, binData, w, h, dstX, dstY) {
    var offset = 0; for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (offset + 1 >= binData.length) return;
            var ch = binData.substr(offset++, 1);
            var attr = ascii(binData.substr(offset++, 1));
            try {
                frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false);
            } catch (se) { }
        }
    }
};
Toast.prototype.insertAvatarData = function () {
    var avatarWidth = 10;
    var avatarHeight = 6;
    if (this.avatarData) {
        try {
            var bin = (typeof base64_decode === 'function') ? base64_decode(this.avatarData.data) : null;
            if (bin && bin.length >= avatarWidth * avatarHeight * 2) {
                var hf = this.avatarFrame;
                this._blitAvatarToFrame(hf, bin, avatarWidth, Math.min(avatarHeight, hf.height), 2, 1);
            }
        } catch (be) { log('avatar blit error: ' + be); }
    }
}

registerModuleExports({ Toast: Toast });
