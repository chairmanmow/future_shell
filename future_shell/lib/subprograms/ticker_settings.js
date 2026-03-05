// ticker_settings.js — Placeholder settings subprogram for RSS Ticker configuration
// TODO: Full implementation to let users select feeds, adjust timing, enable/disable
"use strict";

load("future_shell/lib/subprograms/subprogram.js");

function TickerSettings(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'ticker-settings', parentFrame: opts.parentFrame });
    this.id = 'ticker-settings';
    this.themeNamespace = this.id;
    this._frame = null;
    this.registerColors({
        BG: { BG: BG_BLACK, FG: LIGHTGRAY },
        TITLE: { BG: BG_BLUE, FG: WHITE },
        ACCENT: { BG: BG_BLACK, FG: YELLOW }
    });
}

extend(TickerSettings, Subprogram);

TickerSettings.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.draw();
};

TickerSettings.prototype._ensureFrames = function () {
    if (!this.parentFrame || this._frame) return;
    var attr = this.paletteAttr('BG');
    this._frame = new Frame(
        this.parentFrame.x, this.parentFrame.y,
        this.parentFrame.width, this.parentFrame.height,
        attr, this.parentFrame
    );
    this._frame.open();
};

TickerSettings.prototype.draw = function () {
    this._ensureFrames();
    if (!this._frame) return;
    this._frame.clear();

    var w = this._frame.width;
    var titleAttr = this.paletteAttr('TITLE');
    var accentAttr = this.paletteAttr('ACCENT');

    // Title bar
    this._frame.gotoxy(1, 1);
    this._frame.attr = titleAttr;
    var title = ' RSS Ticker Settings ';
    var pad = '';
    for (var p = 0; p < w; p++) pad += ' ';
    this._frame.putmsg(pad);
    this._frame.gotoxy(1, 1);
    this._frame.center(title);

    // Under construction message
    this._frame.attr = accentAttr;
    var midY = Math.max(3, Math.floor(this._frame.height / 2) - 1);

    var line1 = '\x01h\x01y*** UNDER CONSTRUCTION ***';
    var line2 = '\x01n\x01wRSS Ticker feed selection and timing';
    var line3 = '\x01n\x01wconfiguration will be available here.';
    var line4 = '\x01n\x01cPress any key to go back.';

    this._frame.gotoxy(1, midY);
    this._frame.center(line1);
    this._frame.gotoxy(1, midY + 2);
    this._frame.center(line2);
    this._frame.gotoxy(1, midY + 3);
    this._frame.center(line3);
    this._frame.gotoxy(1, midY + 5);
    this._frame.center(line4);

    this._frame.cycle();
};

TickerSettings.prototype.processKey = function (ch) {
    // Any key exits
    if (ch) {
        this.exit();
        return true;
    }
    return false;
};

TickerSettings.prototype.exit = function () {
    if (this._frame) {
        this._frame.delete();
        this._frame = null;
    }
    Subprogram.prototype.exit.call(this);
};
