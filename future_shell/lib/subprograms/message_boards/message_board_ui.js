load('sbbsdefs.js');

(function (global) {
    function FrameSet(board, paletteAttr) {
        this.board = board;
        if (typeof paletteAttr === 'function') {
            this.paletteAttr = paletteAttr.bind(board);
        } else if (board && typeof board.paletteAttr === 'function') {
            this.paletteAttr = board.paletteAttr.bind(board);
        } else {
            this.paletteAttr = function (_, __, fallback) {
                if (typeof fallback === 'number') return fallback;
                if (typeof __ === 'number') return __;
                return 0;
            };
        }
    }

    FrameSet.prototype.ensure = function () {
        var board = this.board;
        if (board.outputFrame && board.outputFrame.is_open && board.inputFrame && board.inputFrame.is_open) {
            return board.outputFrame;
        }
        var pf = board.hostFrame || board.rootFrame || null;
        if (pf && typeof pf.is_open === 'function' && !pf.is_open()) return null;
        if (!pf || !pf.is_open) {
            log('FrameSet.ensure missing parent frame', {
                hasHost: !!board.hostFrame,
                hasRoot: !!board.rootFrame,
                view: board.view,
                epoch: board._epoch
            });
        }
        var x = (pf && typeof pf.x === 'number') ? pf.x : 1;
        var y = (pf && typeof pf.y === 'number') ? pf.y : 1;
        var w = (pf && typeof pf.width === 'number' && pf.width > 0)
            ? pf.width
            : ((typeof console !== 'undefined' && console && typeof console.screen_columns === 'number' && console.screen_columns > 0) ? console.screen_columns : 80);
        var h = (pf && typeof pf.height === 'number' && pf.height > 0)
            ? pf.height
            : ((typeof console !== 'undefined' && console && typeof console.screen_rows === 'number' && console.screen_rows > 0) ? console.screen_rows : 24);
        if (board.outputFrame && !board.outputFrame.is_open) {
            try { board.outputFrame.close(); } catch (_oe) { }
            board.outputFrame = null;
        }
        if (board.titleFrame && !board.titleFrame.is_open) {
            try { board.titleFrame.close(); } catch (_oe) { }
            board.titleFrame = null;
        }
        if (board.inputFrame && !board.inputFrame.is_open) {
            try { board.inputFrame.close(); } catch (_ie) { }
            board.inputFrame = null;
        }
        var titleAttr = this.paletteAttr('TITLE_FRAME');
        if (!titleAttr && typeof BG_BROWN === 'number' && typeof WHITE === 'number') titleAttr = BG_BROWN | WHITE;
        var titleWasMissing = !board.titleFrame;
        if (titleWasMissing) {
            board.titleFrame = new Frame(x, y, w, 1, titleAttr, pf);
            try { board.titleFrame.open(); } catch (_e1a) { }
        }
        var prevTitleAttr = board.titleFrame ? board.titleFrame.attr : null;
        if (board.titleFrame) board.titleFrame.attr = titleAttr;
        if (titleWasMissing || prevTitleAttr !== titleAttr) {
            try { board.titleFrame.clear(titleAttr); } catch (_e1b) { }
        }

        var outputAttr = this.paletteAttr('OUTPUT_FRAME');
        if (!outputAttr && typeof BG_BLACK === 'number' && typeof LIGHTGRAY === 'number') outputAttr = BG_BLACK | LIGHTGRAY;
        var titleHeight = 1;
        var inputHeight = 1;
        var outputHeight = Math.max(1, h - titleHeight - inputHeight);
        var outputY = y + titleHeight;
        if (board.outputFrame && (board.outputFrame.height !== outputHeight || board.outputFrame.y !== outputY || board.outputFrame.x !== x || board.outputFrame.width !== w)) {
            try { board.outputFrame.close(); } catch (_resizeClose) { }
            board.outputFrame = null;
        }
        var outputWasMissing = !board.outputFrame;
        if (!board.outputFrame) {
            board.outputFrame = new Frame(x, outputY, w, outputHeight, outputAttr, pf);
            try { board.outputFrame.open(); } catch (_e2a) { }
            if (typeof board.setBackgroundFrame === 'function') {
                try { board.setBackgroundFrame(board.outputFrame); } catch (_e2b) { }
            }
        }
        var prevOutputAttr = board.outputFrame ? board.outputFrame.attr : null;
        if (board.outputFrame) board.outputFrame.attr = outputAttr;
        if (outputWasMissing || prevOutputAttr !== outputAttr) {
            try { board.outputFrame.clear(outputAttr); } catch (_e2c) { }
        }

        var inputAttr = this.paletteAttr('INPUT_FRAME');
        if (!inputAttr && typeof BG_BROWN === 'number' && typeof WHITE === 'number') inputAttr = BG_BROWN | WHITE;
        var baseInputY = y + h - inputHeight;
        var reserveRowForRead = (board && board.view === 'read');
        if (reserveRowForRead && baseInputY - 1 >= outputY) {
            baseInputY = baseInputY - 1;
        }
        var inputY = Math.max(baseInputY, outputY);
        var maxInputY = y + h - inputHeight;
        if (inputY > maxInputY) inputY = maxInputY;
        if (board.inputFrame && (board.inputFrame.height !== 1 || board.inputFrame.y !== inputY || board.inputFrame.x !== x || board.inputFrame.width !== w)) {
            try { board.inputFrame.close(); } catch (_inputClose) { }
            board.inputFrame = null;
        }
        var inputWasMissing = !board.inputFrame;
        if (!board.inputFrame) {
            board.inputFrame = new Frame(x, inputY, w, 1, inputAttr, pf);
            try { board.inputFrame.open(); } catch (_e3a) { }
        }
        var prevInputAttr = board.inputFrame ? board.inputFrame.attr : null;
        if (board.inputFrame) board.inputFrame.attr = inputAttr;
        if (inputWasMissing || prevInputAttr !== inputAttr) {
            try { board.inputFrame.clear(inputAttr); } catch (_e3b) { }
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
        this._epoch = 0; // snapshot of board epoch when activated
    }

    TransitionOverlay.prototype.isActive = function () {
        return this.active;
    };

    TransitionOverlay.prototype.begin = function (label, opts) {
        opts = opts || {};
        var board = this.board;
        if (board && board._epoch !== undefined) this._epoch = board._epoch;
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
        if (board && board._alive === false) { this.end(); return; }
        if (board && board._epoch !== undefined && this._epoch !== board._epoch) { this.end(); return; }
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
        if (board && board._alive === false) { this.end(); return; }
        if (board && board._epoch !== undefined && this._epoch !== board._epoch) { this.end(); return; }
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
