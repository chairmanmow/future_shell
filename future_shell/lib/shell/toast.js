if (typeof lazyLoadModule !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
var MAX_TOAST_WIDTH = 40;
var DEFAULT_TOAST_TIMEOUT = 30000; // 30 seconds
// Position keywords: 'top-left','top-right','bottom-left','bottom-right','center'
// For now we implement corner logic + center; bottom variants offset 1 row above bottom to avoid crumb bar.

function Toast(options) {
    if (!options || typeof options !== 'object') options = {};
    this._avatarData = null;
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
    if (options.avatar && this._avatarLib) {
        if (options.avatar.netaddr === system.name) {
            var uNum = system.matchuser(options.avatar.username);
            this.avatarData = this._avatarLib.read(uNum);

        } else if (options.avatar.username && options.avatar.netaddr) {
            this.avatarData = this._avatarLib.read_netuser(options.avatar.username, options.avatar.netaddr);
        }
    }
    var message = options.message || "";
    var timeout = (typeof options.timeout === 'number') ? options.timeout : DEFAULT_TOAST_TIMEOUT;
    var onDone = options.onDone;
    var width = Math.min(MAX_TOAST_WIDTH, Math.max(8, message.length + 4));
    if (this.avatarData) {
        width = width + 6; // avatar width
    }
    var height = this.avatarData ? 6 : options.height || 3;
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
            if (this.avatarData) {
                x = x - 7; // avatar width + padding offset frame to left;
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
    var msgX = this.avatarData ? 6 : 0;
    this.msgContainer = new Frame((2 * msgX) + this.toastFrame.x, this.toastFrame.y, this.toastFrame.width - msgX, this.toastFrame.height, ICSH_ATTR('TOAST_MSG'), this.toastFrame);
    this.msgFrame = new Frame(this.msgContainer.x + 1, this.msgContainer.y + 1, this.msgContainer.width - 2, this.msgContainer.height - 2, ICSH_ATTR('TOAST_MSG'), this.msgContainer);
    this.toastFrame.transparent = true;
    if (typeof this.msgContainer.drawBorder === 'function') {
        this.msgContainer.drawBorder(BG_BLUE, !!this.title ? { x: 1, y: 1, attr: WHITE | BG_GREEN, text: this.title } : null);
    }
    this.msgFrame.centralize(this.msgContainer)
    if (this.avatarData) {
        this.avatarFrame = new Frame(this.toastFrame.x + 1, this.toastFrame.y, 10, Math.min(6, this.toastFrame.height), ICSH_ATTR('TOAST_AVATAR'), this.toastFrame);
        this.insertAvatarData();
    }
    this.msgFrame.centralize(this.msgContainer);
    this.msgFrame.centerWrap(message);
    this.toastFrame.draw();
    this.toastFrame.open();

    this._dismissed = false;
    this._startTime = time();
    this._timeout = timeout;
    this._onDone = onDone;

    var self = this;
    this.dismiss = function (parentFrame) {
        if (self._dismissed) return;
        self._dismissed = true;
        self.toastFrame.clear();
        self.toastFrame.close();
        if (self.parentFrame && typeof self.parentFrame.cycle === 'function') self.parentFrame.cycle();
        if (typeof self._onDone === 'function') self._onDone(self);
    };
}

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
