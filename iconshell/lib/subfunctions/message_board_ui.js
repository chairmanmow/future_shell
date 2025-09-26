load('sbbsdefs.js');

(function (global) {
    function FrameSet(board) {
        this.board = board;
    }

    FrameSet.prototype.ensure = function () {
        var board = this.board;
        if (board.outputFrame && board.outputFrame.is_open && board.inputFrame && board.inputFrame.is_open) {
            return board.outputFrame;
        }
        var pf = board.hostFrame || board.rootFrame || null;
        var x = pf ? pf.x : 1;
        var y = pf ? pf.y : 1;
        var w = pf ? pf.width : console.screen_columns;
        var h = pf ? pf.height : console.screen_rows;
        if (board.outputFrame && !board.outputFrame.is_open) {
            try { board.outputFrame.close(); } catch (_oe) { }
            board.outputFrame = null;
        }
        if (board.inputFrame && !board.inputFrame.is_open) {
            try { board.inputFrame.close(); } catch (_ie) { }
            board.inputFrame = null;
        }
        if (!board.outputFrame) {
            board.outputFrame = new Frame(x, y, w, h - 1, BG_BLACK | LIGHTGRAY, pf);
            try { board.outputFrame.open(); board.outputFrame.clear(); } catch (_e1) { }
            if (typeof board.setBackgroundFrame === 'function') {
                try { board.setBackgroundFrame(board.outputFrame); } catch (_e2) { }
            }
        }
        if (!board.inputFrame) {
            board.inputFrame = new Frame(x, y + h - 1, w, 1, BG_BLUE | WHITE, pf);
            try { board.inputFrame.open(); board.inputFrame.clear(BG_BLUE | WHITE); } catch (_e3) { }
        }
        if (typeof board._writeStatus === 'function') {
            try { board._writeStatus('Message Boards: ' + (board.view || '')); } catch (_e4) { }
        }
        return board.outputFrame;
    };

    FrameSet.prototype.close = function () {
        var board = this.board;
        if (board.outputFrame) {
            try { board.outputFrame.close(); } catch (_e1) { }
            board.outputFrame = null;
        }
        if (board.inputFrame) {
            try { board.inputFrame.close(); } catch (_e2) { }
            board.inputFrame = null;
        }
    };

    FrameSet.prototype.writeStatus = function (text) {
        if (this.board && typeof this.board._writeStatus === 'function') {
            this.board._writeStatus(text);
        }
    };

    FrameSet.prototype.clearOutput = function () {
        var out = this.board.outputFrame;
        if (!out) return;
        try { out.clear(); out.home(); out.cycle(); } catch (_e) { }
    };

    function TransitionOverlay(board) {
        this.board = board;
        this.active = false;
        this.frame = null;
        this.label = '';
        this.frameLabel = '';
        this.framePinned = false;
        this.host = null;
        this.hostOverride = null;
    }

    TransitionOverlay.prototype.isActive = function () {
        return this.active;
    };

    TransitionOverlay.prototype.begin = function (label, opts) {
        opts = opts || {};
        if (!this.active) {
            this.active = true;
            this.label = label || 'Rendering...';
        } else if (typeof label === 'string' && label.length) {
            this.label = label;
        }
        if (opts && opts.host) {
            this.hostOverride = opts.host;
        } else if (opts && opts.resetHost) {
            this.hostOverride = null;
        }
        if (opts.defer) return;
        this.render();
        this._cycleConsole();
    };

    TransitionOverlay.prototype._frameIsUsable = function (frame) {
        if (!frame) return false;
        if (typeof frame.is_open === 'boolean' && !frame.is_open) return false;
        return true;
    };

    TransitionOverlay.prototype.render = function () {
        if (!this.active) return;
        var board = this.board;
        if (board && (board._transitionNoticeActive || board._readNoticeActive)) {
            this._closeFrame();
            this.framePinned = false;
            this.host = null;
            return;
        }
        this._closeFrame();
        this.framePinned = false;
        this.host = null;
        var host = null;
        if (this.hostOverride && this._frameIsUsable(this.hostOverride)) {
            host = this.hostOverride;
        } else {
            this.hostOverride = null;
            if (board && typeof board._getTransitionHostFrame === 'function') {
                try { host = board._getTransitionHostFrame(); } catch (_e) { host = null; }
            }
        }
        if (!host) host = (board && board.outputFrame) || board.hostFrame || board.parentFrame || board.rootFrame || null;
        if (!host) return;
        var hostWidth = (typeof host.width === 'number' && host.width > 0) ? host.width : ((typeof console !== 'undefined' && console && console.screen_columns) || 80);
        var hostHeight = (typeof host.height === 'number' && host.height > 0) ? host.height : ((typeof console !== 'undefined' && console && console.screen_rows) || 24);
        var text = this.label || 'Rendering...';
        var width = Math.max(20, Math.min(hostWidth, text.length + 6));
        var height = 3;
        var attr = (typeof BG_BLUE === 'number' ? BG_BLUE : 0) | (typeof WHITE === 'number' ? WHITE : 7);
        var originX = (typeof host.x === 'number' ? host.x : 1);
        var originY = (typeof host.y === 'number' ? host.y : 1);
        var offsetX = Math.max(0, Math.floor((hostWidth - width) / 2));
        var offsetY = Math.max(0, Math.floor((hostHeight - height) / 2));
        var parent = host.parent || host;
        var x = (parent === host) ? (offsetX + 1) : (originX + offsetX);
        var y = (parent === host) ? (offsetY + 1) : (originY + offsetY);
        try {
            var frame = new Frame(x, y, width, height, attr, parent);
            frame.open();
            frame.clear(attr);
            var msgX = Math.max(1, Math.floor((width - text.length) / 2) + 1);
            var msgY = Math.max(1, Math.floor((height + 1) / 2));
            frame.gotoxy(msgX, msgY);
            frame.putmsg(text);
            try { frame.top(); } catch (_t) { }
            try { frame.cycle(); } catch (_c) { }
            this.frame = frame;
            this.frameLabel = text;
            this.framePinned = true;
            this.host = host;
            if (host && typeof host.cycle === 'function') {
                try { host.cycle(); } catch (_h) { }
            }
        } catch (e) {
            this.frame = null;
            this.frameLabel = '';
            this.framePinned = false;
            this.host = null;
        }
    };

    TransitionOverlay.prototype.refresh = function () {
        if (!this.active) return;
        var board = this.board;
        if (board && (board._transitionNoticeActive || board._readNoticeActive)) {
            this._closeFrame();
            this.framePinned = false;
            this.host = null;
            return;
        }
        if (!this.frame || this.frameLabel !== this.label) {
            this.render();
            return;
        }
        if (this.host && typeof this.host.is_open === 'boolean' && !this.host.is_open) {
            this.render();
            return;
        }
        if (!this.framePinned) {
            try { this.frame.top(); this.framePinned = true; } catch (_topErr) { this.framePinned = false; }
        }
        try { this.frame.cycle(); } catch (_cycleErr) { }
        if (this.host && typeof this.host.cycle === 'function') {
            try { this.host.cycle(); } catch (_hostErr) { }
        }
        this._cycleConsole();
    };

    TransitionOverlay.prototype.end = function () {
        this._closeFrame();
        this.active = false;
        this.label = '';
        this.frameLabel = '';
        this.framePinned = false;
        this.host = null;
        this.hostOverride = null;
    };

    TransitionOverlay.prototype._closeFrame = function () {
        if (this.frame) {
            try { this.frame.close(); } catch (_e) { }
            this.frame = null;
        }
    };

    TransitionOverlay.prototype._cycleConsole = function () {
        if (typeof console !== 'undefined' && console && typeof console.cycle === 'function') {
            try { console.cycle(); } catch (_consoleErr) { }
        }
    };

    global.MessageBoardUI = {
        FrameSet: FrameSet,
        TransitionOverlay: TransitionOverlay
    };
})(this);
