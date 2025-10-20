if (typeof lazyLoadModule !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
var MAX_TOAST_WIDTH = 40;
var DEFAULT_TOAST_TIMEOUT = 30000; // 30 seconds
var TOAST_PIPE_RE = /\|[0-9A-Za-z]{2}/g;
var TOAST_CTRL_A_RE = /\x01./g;
var TOAST_ANSI_RE = /\x1B\[[0-?]*[ -\/]*[@-~]/g;

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
            } catch (e) { try { log('[Chat] avatar_lib miss ' + path + ': ' + e); } catch (_) { } }
            return null;
        }
        var candidates = ['avatar_lib.js', '../exec/load/avatar_lib.js', '../../exec/load/avatar_lib.js'];
        for (var i = 0; i < candidates.length; i++) {
            var lib = attempt(candidates[i], 'avatar_lib.chat:' + i);
            if (lib) { try { log('[Chat] avatar_lib loaded from ' + candidates[i]); } catch (_) { } return lib; }
        }
        try { log('[Chat] avatar_lib unavailable after attempts: ' + candidates.join(', ')); } catch (_) { }
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
    var rawMessage = options.message;
    if (rawMessage === undefined || rawMessage === null) rawMessage = '';
    rawMessage = String(rawMessage);
    var cleanMessage = toastStripColors(rawMessage);
    var longestWord = toastLongestWord(cleanMessage);
    var titleText = this.title ? toastStripColors(String(this.title)) : '';
    var minWidth = Math.max(12, longestWord + 4);
    if (titleText.length) minWidth = Math.max(minWidth, titleText.length + 4);
    if (hasAvatar || hasProgramIcon) minWidth = Math.max(minWidth, 20);
    if (typeof options.width === 'number' && options.width > 0) minWidth = Math.max(minWidth, options.width);
    var width = Math.min(MAX_TOAST_WIDTH, minWidth);
    var messageWrapWidth = Math.max(10, width - ((hasAvatar || hasProgramIcon) ? 8 : 2));
    var wrappedLines = toastWrapText(cleanMessage, messageWrapWidth);
    if (!wrappedLines || !wrappedLines.length) wrappedLines = [''];
    var contentHeight = wrappedLines.length;
    var minHeight = (hasAvatar || hasProgramIcon) ? 6 : 3;
    var height = Math.max(minHeight, contentHeight + 2);
    if (typeof options.height === 'number' && options.height > height) height = options.height;
    if (height < 1) height = 1;
    if (height > console.screen_rows) height = console.screen_rows;
    var pos = options.position || 'bottom-right';
    var scrW = console.screen_columns || 80;
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
            if (hasAvatar || hasProgramIcon) {
                x = x - 7; // left graphic width + padding offset frame to left;
            }
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
    this.toastFrame = new Frame(x, y, width, height, ICSH_VALS.TOAST_FRAME.BG | ICSH_VALS.TOAST_FRAME.FG, this.parentFrame);
    var msgX = (hasAvatar || hasProgramIcon) ? 6 : 0;
    this.msgContainer = new Frame((2 * msgX) + this.toastFrame.x, this.toastFrame.y, this.toastFrame.width - msgX, this.toastFrame.height, ICSH_ATTR('TOAST_MSG'), this.toastFrame);
    this.msgFrame = new Frame(this.msgContainer.x + 1, this.msgContainer.y + 1, this.msgContainer.width - 2, this.msgContainer.height - 2, ICSH_ATTR('TOAST_MSG'), this.msgContainer);
    this.toastFrame.transparent = true;
    if (typeof this.msgContainer.drawBorder === 'function') {
        this.msgContainer.drawBorder(BG_BLUE, !!this.title ? { x: 1, y: 1, attr: WHITE | BG_GREEN, text: this.title } : null);
    }
    if (this.avatarData) {
        this.avatarFrame = new Frame(this.toastFrame.x + 1, this.toastFrame.y, 10, Math.min(6, this.toastFrame.height), ICSH_ATTR('TOAST_AVATAR'), this.toastFrame);
        this.insertAvatarData();
    } else if (hasProgramIcon) {
        this.programIconFrame = new Frame(this.toastFrame.x + 1, this.toastFrame.y, 12, Math.min(6, this.toastFrame.height), ICSH_ATTR('TOAST_AVATAR'), this.toastFrame);
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
