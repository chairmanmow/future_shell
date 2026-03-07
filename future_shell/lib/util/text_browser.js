// text_browser.js — Reusable modal for rendering web content on the BBS terminal
// Non-blocking: shell dispatches keys via handleKey(). No internal input loop.
// Usage: var browser = new TextBrowser();
//        browser.open('https://example.com/article');
//        // Shell dispatches keys to browser.handleKey(ch) while browser._running
//        // When browser._running becomes false, shell cleans up and repaints

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

var NORMAL     = '\x01n';
var STATUS_CLR = '\x01n\x01h\x01k';
var ERROR_CLR  = '\x01n\x01h\x01r';

function TextBrowser(opts) {
    opts = opts || {};
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
    this._errorMode = false;
    this._viewH = 0;
    this._maxScroll = 0;
}

// Non-blocking open: fetches, renders, displays content. Sets _running = true.
// The shell should then dispatch keys to handleKey() until _running becomes false.
TextBrowser.prototype.open = function (url) {
    if (!url) return;

    this._createFrames();
    this._showStatus('Fetching...');

    var html = this._fetch(url);
    if (html === null) {
        this._showError('Failed to fetch URL');
        this._errorMode = true;
        this._running = true;
        return;
    }
    if (!html || !html.length) {
        this._showError('Empty response from server');
        this._errorMode = true;
        this._running = true;
        return;
    }

    this._showStatus('Rendering...');

    var extracted = _extractor.extractContent(html);
    html = null;

    if (!extracted.tokens || !extracted.tokens.length) {
        this._showError('No readable content found');
        this._errorMode = true;
        this._running = true;
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
        this._errorMode = true;
        this._running = true;
        return;
    }

    this._viewH = this._contentFrame ? this._contentFrame.height : 24;
    this._maxScroll = Math.max(0, this._lines.length - this._viewH);
    this._scrollPos = 0;
    this._renderContent();
    this._updateStatus();
    this._running = true;
};

// Handle a single key press. Returns true if the key was consumed.
TextBrowser.prototype.handleKey = function (ch) {
    if (!this._running) return false;

    // In error mode, only dismiss keys work
    if (this._errorMode) {
        if (ch === KEY_ESC || ch === 'q' || ch === 'Q' || ch === '\x08') {
            this.close();
        }
        return true;
    }

    var oldPos = this._scrollPos;

    switch (ch) {
        case KEY_ESC:
        case 'q':
        case 'Q':
            this.close();
            return true;
        case KEY_UP:
            if (this._scrollPos > 0) this._scrollPos--;
            break;
        case KEY_DOWN:
        case ' ':
            if (this._scrollPos < this._maxScroll) this._scrollPos++;
            break;
        case KEY_PAGEUP:
            this._scrollPos = Math.max(0, this._scrollPos - this._viewH);
            break;
        case KEY_PAGEDN:
            this._scrollPos = Math.min(this._maxScroll, this._scrollPos + this._viewH);
            break;
        case KEY_HOME:
            this._scrollPos = 0;
            break;
        case KEY_END:
            this._scrollPos = this._maxScroll;
            break;
        default:
            break;
    }

    if (this._scrollPos !== oldPos) {
        this._renderContent();
        this._updateStatus();
    }
    return true;
};

// Close the browser and destroy frames. Sets _running = false.
TextBrowser.prototype.close = function () {
    this._destroyFrames();
};

TextBrowser.prototype._createFrames = function () {
    var w = this._width || console.screen_columns;
    var h = this._height || console.screen_rows;
    var attr = 7;
    this._frame = new Frame(1, 1, w, h, attr);
    this._frame.open();
    this._contentFrame = new Frame(1, 1, w, h - 1, attr, this._frame);
    this._contentFrame.open();
    var statusAttr = (1 << 4) | 15;
    this._statusFrame = new Frame(1, h, w, 1, statusAttr, this._frame);
    this._statusFrame.open();
    this._frame.cycle();
};

TextBrowser.prototype._destroyFrames = function () {
    this._running = false;
    this._errorMode = false;
    // Close only the root frame. Its children are closed recursively by frame.js.
    // Closing children first can double-close and corrupt frame/display state.
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

function _visibleLen(str) {
    if (!str) return 0;
    return str.replace(/\x01[^\x01]/g, '').length;
}

({ TextBrowser: TextBrowser });
