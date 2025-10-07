// Digital Clock Subprogram (ported)
// Displays stylized HH:MM:SS with day & date. Updates every second.
// Keys: Q/ESC exit. Any other key exits (optional minimal interaction).

load('iconshell/lib/subprograms/subprogram.js');

function ClockSub(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'clock', parentFrame: opts.parentFrame });
    this.width = 17;
    this.height = 6;
    this.bg = BG_BLACK;
    this.fg = BLUE;
    this.lastSecond = -1;
    this.hidden = false;
    this.digits = [];
    this.days = ['Sun', 'Mon', 'Tues', 'Weds', 'Thurs', 'Fri', 'Sat'];
    this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    this._ensureFrames = false;
    this.frame = null;
    this.shell = opts.shell; // reference to IconShell (has timer) if provided
    this._timerEvent = null;
    this.loadDigits();
}
extend(ClockSub, Subprogram);

ClockSub.prototype.loadDigits = function () {
    // Rebuild digit glyphs using String.fromCharCode to avoid reliance on ascii().
    // CP437 codes: 218┌ 191┐ 192└ 217┘ 179│ 195├ 180┤ 196─ 194┬ 193┴ 250· 223▀ 220▄
    // TODO : make work in Syncterm
    function ch(n) { return String.fromCharCode(n); }
    function p(a, b) { return ch(a) + ch(b); }
    this.digits[0] = [p(218, 191), p(179, 179), p(192, 217)]; // 0
    this.digits[1] = [' ' + ch(191), ' ' + ch(179), ' ' + ch(217)]; // 1
    this.digits[2] = [p(218, 191), p(218, 217), p(192, 217)]; // 2
    this.digits[3] = [p(218, 191), ' ' + ch(180), p(192, 217)]; // 3
    this.digits[4] = [p(179, 191), p(192, 180), ' ' + ch(217)]; // 4
    this.digits[5] = [p(218, 191), p(192, 191), p(192, 217)]; // 5
    this.digits[6] = [p(218, 191), p(195, 191), p(192, 217)]; // 6
    this.digits[7] = [p(218, 191), ' ' + ch(179), ' ' + ch(217)]; // 7
    this.digits[8] = [p(218, 191), p(195, 180), p(192, 217)]; // 8
    this.digits[9] = [p(218, 191), p(192, 180), ' ' + ch(217)]; // 9
    // Cached glyphs
    this._colonGlyph = ch(250); // small dot
    this._topFill = ch(223);    // upper half block
    this._bottomFill = ch(220); // lower half block
};

ClockSub.prototype.enter = function (done) {
    var self = this;
    Subprogram.prototype.enter.call(this, done);
    // If shell has a Timer use it; else create a private one.
    try {
        if (this.shell && this.shell.timer) {
            this._timerEvent = this.shell.timer.addEvent(1000, true, function () { self.draw(); });
        } else if (typeof Timer === 'function') {
            this._ownTimer = new Timer();
            this._timerEvent = this._ownTimer.addEvent(1000, true, function () { self.draw(); });
        }
    } catch (e) { }
    this.draw();
};

ClockSub.prototype.ensureFrame = function () {
    if (!this.parentFrame) return;
    if (!this.frame) {
        var w = Math.min(this.parentFrame.width, this.width + 2);
        var h = Math.min(this.parentFrame.height, this.height + 2);
        var x = this.parentFrame.x + Math.floor((this.parentFrame.width - w) / 2);
        var y = this.parentFrame.y + Math.floor((this.parentFrame.height - h) / 2);
        this.frame = new Frame(x, y, w, h, this.bg | this.fg, this.parentFrame); this.frame.open();
    }
};

ClockSub.prototype.draw = function () {
    this.ensureFrame(); if (!this.frame) return;
    var now = new Date();
    var sec = now.getSeconds();
    if (sec === this.lastSecond) { this.parentFrame && this.parentFrame.cycle(); return; }
    this.lastSecond = sec;
    this.frame.clear();
    // Force consistent HH:MM:SS (24h) to avoid locale AM/PM letters breaking digit parsing
    var h = now.getHours(), m = now.getMinutes();
    var timestr = (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
    // top border
    this.frame.attr = this.bg | BLACK; // pad color
    this.frame.gotoxy(1, 1); this.frame.putmsg(padFill('', this.width, this._topFill));
    // digits rows
    var gap = this.width - 14; if (gap < 0) gap = 0; var offset = (gap / 2) | 0;
    for (var row = 0; row < 3; row++) {
        this.frame.gotoxy(1, 2 + row);
        this.frame.putmsg(padFill('', offset, ' '));
        for (var i = 0; i < timestr.length; i++) {
            var ch = timestr.charAt(i);
            if (ch === ':') {
                this.frame.putmsg(row === 1 ? ' ' : this._colonGlyph);
                continue;
            }
            var d = ch.charCodeAt(0) - 48; // fast digit parse
            if (d < 0 || d > 9 || !this.digits[d]) { this.frame.putmsg('  '); continue; }
            this.frame.putmsg(this.digits[d][row]);
        }
    }
    // date line
    this.frame.gotoxy(1, 5);
    var dayStr = ' ' + this.days[now.getDay()] + ',';
    var dateStr = this.months[now.getMonth()] + '. ' + now.getDate() + ' ';
    var combined = padSplit(dayStr, dateStr, this.width);
    this.frame.putmsg(combined);
    // bottom border
    this.frame.gotoxy(1, 6); this.frame.putmsg(padFill('', this.width, this._bottomFill));
    this.parentFrame.cycle();
};

// Helpers replicating legacy helpers (simplified)
function padFill(str, len, ch) { if (ch === undefined) ch = ' '; while (str.length < len) str += ch; if (str.length > len) return str.substr(0, len); return str; }
function padSplit(left, right, width) {
    var middle = width - left.length - right.length;
    if (middle < 0) middle = 1;
    return left + padFill('', middle, ' ') + right;
}

ClockSub.prototype.handleKey = function (k) { if (!k) return; if (k === '\x1B' || k === 'Q' || k === 'q') { this.exit(); return; } };

ClockSub.prototype.cleanup = function () {
    try { if (this._timerEvent) this._timerEvent.abort = true; } catch (e) { }
    try { if (this._ownTimer) this._ownTimer.cycle(); } catch (e) { }
    try { if (this.frame) this.frame.close(); } catch (e) { }
    this.frame = null;
    Subprogram.prototype.cleanup.call(this);
};

this.ClockSub = ClockSub;