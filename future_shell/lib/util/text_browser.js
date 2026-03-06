// text_browser.js — Reusable modal for rendering web content on the BBS terminal
// Usage: var browser = new TextBrowser({ parentFrame: shell.view });
//        browser.open('https://example.com/article');

load('sbbsdefs.js');
load('key_defs.js');
load('frame.js');

var _tdfAvailable = false;
try {
    load('tdfonts_lib.js');
    _tdfAvailable = (typeof loadfont === 'function');
} catch (_) {}

var _extractor = load('future_shell/lib/util/text_browser/content_extractor.js');
var _renderer = load('future_shell/lib/util/text_browser/terminal_renderer.js');

var _httpLoaded = false;
function _ensureHttp() {
    if (!_httpLoaded) {
        load('http.js');
        _httpLoaded = true;
    }
}

var _USER_AGENT = 'Mozilla/5.0 (compatible; SynchronetBBS/3.21; +https://synchro.net)';

var NORMAL    = '\x01n';
var STATUS_CLR = '\x01n\x01h\x01k';
var ERROR_CLR  = '\x01n\x01h\x01r';

function TextBrowser(opts) {
    opts = opts || {};
    this._parentFrame = opts.parentFrame || null;
    this._width = opts.width || 0;
    this._height = opts.height || 0;
    this._useTdf = (opts.tdf !== false) && _tdfAvailable;
    this._frame = null;
    this._contentFrame = null;
    this._statusFrame = null;
    this._lines = [];
    this._links = [];
    this._scrollPos = 0;
    this._running = false;
}

TextBrowser.prototype.open = function (url) {
    if (!url) return;

    this._createFrames();
    this._showStatus('Fetching...');

    var html = this._fetch(url);
    if (html === null) {
        this._showError('Failed to fetch URL');
        this._waitForDismiss();
        this._destroyFrames();
        return;
    }
    if (!html || !html.length) {
        this._showError('Empty response from server');
        this._waitForDismiss();
        this._destroyFrames();
        return;
    }

    this._showStatus('Rendering...');

    var extracted = _extractor.extractContent(html);
    html = null;

    if (!extracted.tokens || !extracted.tokens.length) {
        this._showError('No readable content found');
        this._waitForDismiss();
        this._destroyFrames();
        return;
    }

    var contentWidth = this._contentFrame ? this._contentFrame.width : (this._width || 79);
    var rendered = _renderer.renderTokens(extracted.tokens, {
        width: contentWidth,
        tdf: this._useTdf
    });
    extracted.tokens = null;
    extracted = null;

    this._lines = rendered.lines;
    this._links = rendered.links;
    rendered = null;

    if (!this._lines.length) {
        this._showError('No readable content found');
        this._waitForDismiss();
        this._destroyFrames();
        return;
    }

    this._scrollPos = 0;
    this._renderContent();
    this._updateStatus();
    this._scrollLoop();
    this._destroyFrames();
};

TextBrowser.prototype._createFrames = function () {
    var w = this._width || console.screen_columns;
    var h = this._height || console.screen_rows;
    var attr = 7; // white on black
    // Create an independent root frame (no parent) like Subprogram.enter() does.
    // This avoids corrupting the shell's frame tree.
    this._frame = new Frame(1, 1, w, h, attr);
    this._frame.open();
    this._contentFrame = new Frame(1, 1, w, h - 1, attr, this._frame);
    this._contentFrame.open();
    var statusAttr = (1 << 4) | 15; // bright white on blue
    this._statusFrame = new Frame(1, h, w, 1, statusAttr, this._frame);
    this._statusFrame.open();
    this._frame.cycle();
};

TextBrowser.prototype._destroyFrames = function () {
    this._running = false;
    try { if (this._contentFrame) { this._contentFrame.clear(); this._contentFrame.close(); } } catch (_) {}
    try { if (this._statusFrame) { this._statusFrame.clear(); this._statusFrame.close(); } } catch (_) {}
    try { if (this._frame) { this._frame.clear(); this._frame.close(); } } catch (_) {}
    this._statusFrame = null;
    this._contentFrame = null;
    this._frame = null;
    this._lines = [];
    this._links = [];
};



TextBrowser.prototype._fetch = function (url) {
    try {
        _ensureHttp();
        var req = new HTTPRequest();
        req.user_agent = _USER_AGENT;
        req.follow_redirects = 5;
        var body = req.Get(url);
        return body || null;
    } catch (e) {
        try { log('TextBrowser fetch error: ' + e); } catch (_) {}
        return null;
    }
};

TextBrowser.prototype._renderContent = function () {
    if (!this._contentFrame) return;
    var frame = this._contentFrame;
    var h = frame.height;
    frame.clear();
    frame.home();
    var end = Math.min(this._scrollPos + h, this._lines.length);
    for (var i = this._scrollPos; i < end; i++) {
        frame.gotoxy(1, i - this._scrollPos + 1);
        frame.putmsg(this._lines[i]);
    }
    frame.cycle();
};

TextBrowser.prototype._updateStatus = function () {
    if (!this._statusFrame) return;
    var frame = this._statusFrame;
    var totalLines = this._lines.length;
    var viewH = this._contentFrame ? this._contentFrame.height : 1;
    var percent = totalLines <= viewH ? 100
        : Math.min(100, Math.round((this._scrollPos + viewH) / totalLines * 100));
    var left = ' ESC:Close  Up/Dn:Scroll  PgUp/PgDn  Home/End';
    var right = ' ' + percent + '% (' + (this._scrollPos + 1) + '-' +
        Math.min(this._scrollPos + viewH, totalLines) + '/' + totalLines + ') ';
    var pad = frame.width - _visibleLen(left) - _visibleLen(right);
    if (pad < 0) pad = 0;
    var spaces = '';
    for (var s = 0; s < pad; s++) spaces += ' ';
    frame.clear();
    frame.home();
    frame.putmsg(left + spaces + right);
    frame.cycle();
};

TextBrowser.prototype._showStatus = function (msg) {
    if (!this._contentFrame) return;
    var frame = this._contentFrame;
    frame.clear();
    frame.home();
    var y = Math.floor(frame.height / 2);
    frame.gotoxy(1, y);
    frame.center(STATUS_CLR + msg + NORMAL);
    frame.cycle();
};

TextBrowser.prototype._showError = function (msg) {
    if (!this._contentFrame) return;
    var frame = this._contentFrame;
    frame.clear();
    frame.home();
    var y = Math.floor(frame.height / 2);
    frame.gotoxy(1, y);
    frame.center(ERROR_CLR + msg + NORMAL);
    frame.gotoxy(1, y + 2);
    frame.center(STATUS_CLR + 'Press ESC to close' + NORMAL);
    frame.cycle();
};

TextBrowser.prototype._waitForDismiss = function () {
    while (true) {
        var ch = console.inkey(K_NONE, 500);
        if (!ch || ch === '') continue;
        if (ch === KEY_ESC || ch === 'q' || ch === 'Q' || ch === '\x08') break;
    }
};

TextBrowser.prototype._scrollLoop = function () {
    this._running = true;
    var viewH = this._contentFrame ? this._contentFrame.height : 24;
    var maxScroll = Math.max(0, this._lines.length - viewH);

    while (this._running) {
        var ch = console.inkey(K_NONE, 200);
        if (!ch || ch === '') continue;
        var oldPos = this._scrollPos;

        switch (ch) {
            case KEY_ESC:
            case 'q':
            case 'Q':
                this._running = false;
                return;
            case KEY_UP:
                if (this._scrollPos > 0) this._scrollPos--;
                break;
            case KEY_DOWN:
            case ' ':
                if (this._scrollPos < maxScroll) this._scrollPos++;
                break;
            case KEY_PAGEUP:
                this._scrollPos = Math.max(0, this._scrollPos - viewH);
                break;
            case KEY_PAGEDN:
                this._scrollPos = Math.min(maxScroll, this._scrollPos + viewH);
                break;
            case KEY_HOME:
                this._scrollPos = 0;
                break;
            case KEY_END:
                this._scrollPos = maxScroll;
                break;
            default:
                break;
        }

        if (this._scrollPos !== oldPos) {
            this._renderContent();
            this._updateStatus();
        }
    }
};

function _visibleLen(str) {
    if (!str) return 0;
    return str.replace(/\x01[^\x01]/g, '').length;
}

({ TextBrowser: TextBrowser });
