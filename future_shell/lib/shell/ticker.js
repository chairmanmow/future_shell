// ticker.js — RSS headline ticker for the shell header bar
// Alternates between the gradient BBS banner and news headlines
// in the top header frame on a configurable interval.
"use strict";

// Curated gradient presets for headline display.
// Each entry: { name: preset_name, text: Ctrl-A color codes for legible text }
// Selected for good contrast between gradient edges and text region.
var _TICKER_HEADLINE_STYLES = [
    { name: 'ocean',          text: '\x01n\x01h\x01w' },   // bright white on dark blues
    { name: 'cyber',          text: '\x01n\x01h\x01w' },   // bright white on magentas/cyans
    { name: 'futureland',     text: '\x01n\x01h\x01w' },   // bright white on green/blue/purple
    { name: 'deep_sea',       text: '\x01n\x01h\x01c' },   // bright cyan on deep blues
    { name: 'teal_wave',      text: '\x01n\x01h\x01w' },   // bright white on teals
    { name: 'twilight',       text: '\x01n\x01h\x01w' },   // bright white on dusky purples
    { name: 'dusk',           text: '\x01n\x01h\x01w' },   // bright white on purple/orange
    { name: 'sunset',         text: '\x01n\x01h\x01w' },   // bright white on warm oranges
    { name: 'aurora',         text: '\x01n\x01h\x01w' },   // bright white on green/purple
    { name: 'midnight',       text: '\x01n\x01h\x01c' },   // bright cyan on dark blues
    { name: 'space',          text: '\x01n\x01h\x01b' },   // bright blue on near-black
    { name: 'noir',           text: '\x01n\x01h\x01w' },   // bright white on dark grays
    { name: 'matrix',         text: '\x01n\x01h\x01g' },   // bright green on black/green
    { name: 'forest',         text: '\x01n\x01h\x01g' },   // bright green on dark greens
    { name: 'ember',          text: '\x01n\x01h\x01y' },   // bright yellow on dark reds
    { name: 'lava',           text: '\x01n\x01h\x01y' },   // bright yellow on reds/oranges
    { name: 'inferno',        text: '\x01n\x01h\x01y' },   // bright yellow on fire colors
    { name: 'magma',          text: '\x01n\x01h\x01y' },   // bright yellow on dark red/orange
    { name: 'nightclub',      text: '\x01n\x01h\x01m' },   // bright magenta on dark purples
    { name: 'grape',          text: '\x01n\x01h\x01w' },   // bright white on purples
    { name: 'blueberry',      text: '\x01n\x01h\x01w' },   // bright white on blues
    { name: 'sky',            text: '\x01n\x01h\x01w' },   // bright white on blue sky
    { name: 'tron_grid',      text: '\x01n\x01h\x01c' },   // bright cyan on dark teal
    { name: 'galaxy',         text: '\x01n\x01h\x01w' },   // bright white on dark purple
    { name: 'mystic',         text: '\x01n\x01h\x01w' },   // bright white on deep purple/cyan
    { name: 'ocean_depths',   text: '\x01n\x01h\x01c' },   // bright cyan on deep ocean
    { name: 'canyon',         text: '\x01n\x01h\x01y' },   // bright yellow on earthy browns
    { name: 'thunderstorm',   text: '\x01n\x01h\x01w' },   // bright white on storm grays
    { name: 'miami_nights',   text: '\x01n\x01h\x01w' },   // bright white on neon purples
    { name: 'aurora_borealis',text: '\x01n\x01h\x01w' },   // bright white on aurora greens
    { name: 'horizon',        text: '\x01n\x01h\x01w' },   // bright white on blue/orange
    { name: 'frost_fire',     text: '\x01n\x01h\x01w' },   // bright white on blue/fire
    { name: 'vaporwave',      text: '\x01n\x010\x01h\x01w' }, // bright white, black bg, on pastels
    { name: 'neon',           text: '\x01n\x01h\x01w' },   // bright white on neon colors
    { name: 'laser_grid',     text: '\x01n\x01h\x01w' }    // bright white on neon purple
];

/**
 * ShellTicker — manages the header ticker rotation.
 *
 * @param {Object} opts
 * @param {Object} opts.shell       - IconShell instance (for headerFrame, timer, etc.)
 * @param {Object} [opts.config]    - Ticker config from ICSH_SETTINGS.ticker
 */
function ShellTicker(opts) {
    opts = opts || {};
    this.shell = opts.shell || null;
    var cfg = opts.config || {};

    // Display durations (ms)
    this.bannerDurationMs = (typeof cfg.banner_duration === 'number') ? cfg.banner_duration : 8000;
    this.headlineDurationMs = (typeof cfg.headline_duration === 'number') ? cfg.headline_duration : 15000;

    // How often to re-fetch RSS data (ms) — default 5 minutes
    this.refreshIntervalMs = (typeof cfg.refresh_interval === 'number') ? cfg.refresh_interval : 300000;

    // Feed URLs to rotate through; resolved from config feed keys
    this._feedUrls = [];
    if (Array.isArray(cfg._resolvedUrls) && cfg._resolvedUrls.length) {
        this._feedUrls = cfg._resolvedUrls.slice();
    }

    // Enabled flag
    this.enabled = (cfg.enabled !== false) && (this._feedUrls.length > 0);

    // State
    this._headlines = [];         // Array of { title, source }
    this._headlineIndex = 0;      // Current position in _headlines
    this._feedUrlIndex = 0;       // Current position in _feedUrls for fetching
    this._mode = 'banner';        // 'banner' | 'headline'
    this._lastSwitchTs = 0;       // Timestamp of last mode switch
    this._lastFetchTs = 0;        // Timestamp of last successful fetch
    this._fetchQueue = null;      // Queue returned by background load()
    this._fetching = false;
    this._initialized = false;
    this._timerEvent = null;
}

/**
 * Attach to the shell's Timer for periodic ticking.
 */
ShellTicker.prototype.attach = function (timer) {
    if (!timer || !this.enabled) return;
    var self = this;
    // Tick every second to check state transitions
    this._timerEvent = timer.addEvent(1000, true, function () {
        try { self._tick(); } catch (e) {
            try { dbug('ticker tick error: ' + e, 'ticker'); } catch (_) { }
        }
    });
    // Kick off first fetch immediately
    this._startFetch();
    this._lastSwitchTs = Date.now();
    this._initialized = true;
};

/**
 * Detach from timer (cleanup).
 */
ShellTicker.prototype.detach = function () {
    if (this._timerEvent) {
        this._timerEvent.abort = true;
        this._timerEvent = null;
    }
};

/**
 * Main tick — called every ~1 second by the timer.
 */
ShellTicker.prototype._tick = function () {
    if (!this.enabled || !this.shell) return;

    var now = Date.now();

    // Poll for background fetch results (non-blocking) — always poll even if subprogram active
    this._pollFetchResult();

    // Check if it's time to re-fetch
    if (!this._fetching && this._lastFetchTs > 0 && (now - this._lastFetchTs) >= this.refreshIntervalMs) {
        this._advanceFeedUrl();
        this._startFetch();
    }

    // Don't switch the header display while a subprogram owns the screen
    var sub = this.shell.activeSubprogram;
    if (sub && sub.running) return;

    // Check if it's time to switch display mode
    var duration = (this._mode === 'banner') ? this.bannerDurationMs : this.headlineDurationMs;
    if ((now - this._lastSwitchTs) >= duration) {
        this._switchMode(now);
    }
};

/**
 * Switch between banner and headline display.
 */
ShellTicker.prototype._switchMode = function (now) {
    if (this._mode === 'banner') {
        // Try to show a headline
        if (this._headlines.length > 0) {
            this._mode = 'headline';
            this._renderHeadline();
        }
        // If no headlines yet, stay on banner (will retry next tick)
    } else {
        // Switch back to banner, advance headline index
        this._headlineIndex++;
        if (this._headlineIndex >= this._headlines.length) {
            this._headlineIndex = 0;
        }
        this._mode = 'banner';
        this._renderBanner();
    }
    this._lastSwitchTs = now || Date.now();
};

/**
/**
 * Render the standard gradient BBS banner into the header frame.
 */
ShellTicker.prototype._renderBanner = function () {
    var shell = this.shell;
    if (!shell || !shell.headerFrame) return;
    // Delegate to the shell's existing header refresh
    if (typeof shell._refreshHeaderFrame === 'function') {
        shell._refreshHeaderFrame();
    }
};

/**
 * Render a headline into the header frame using gradient styling.
 * Picks from curated headline-safe gradient presets and applies
 * explicit high-contrast text coloring for legibility.
 */
ShellTicker.prototype._renderHeadline = function () {
    var shell = this.shell;
    if (!shell || !shell.headerFrame) return;
    var frame = shell.headerFrame;
    var width = frame.width || 80;

    var headline = this._headlines[this._headlineIndex];
    if (!headline) {
        this._renderBanner();
        return;
    }

    // Just the headline title — no source prefix
    var text = headline.title || '';
    text = text.replace(/[\x00-\x1F]/g, '');
    if (text.length > width - 6) {
        text = text.substr(0, width - 9) + '...';
    }
    // Pad with spaces for visual breathing room
    text = ' ' + text + ' ';

    var headerAttr = (typeof shell.paletteAttr === 'function')
        ? shell.paletteAttr('HEADER_BAR', ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7)))
        : ((typeof BG_BLUE !== 'undefined' ? BG_BLUE : (1 << 4)) | (typeof WHITE !== 'undefined' ? WHITE : 7));

    frame.attr = headerAttr;
    frame.clear(headerAttr);
    frame.home();

    if (typeof Gradient !== 'undefined' && Gradient && typeof Gradient.get === 'function' && _TICKER_HEADLINE_STYLES.length) {
        try {
            // Pick a random curated style
            var style = _TICKER_HEADLINE_STYLES[Math.floor(Math.random() * _TICKER_HEADLINE_STYLES.length)];
            var padTotal = Math.max(0, width - text.length);
            var padLeft = Math.floor(padTotal / 2);
            var padRight = padTotal - padLeft;

            // Build: left_gradient + colored_text + right_gradient
            var left = (padLeft > 0) ? Gradient.get(style.name, padLeft, 'l', { glyph: 'mix', reset: false }) : '';
            var right = (padRight > 0) ? Gradient.get(style.name, padRight, 'r', { glyph: 'mix', reset: false }) : '';
            var coloredText = style.text + text + '\x01n';
            var output = left + coloredText + right + '\x01n';

            frame.gotoxy(1, 1);
            frame.putmsg(output);
        } catch (gErr) {
            frame.center(text);
            try { dbug('ticker gradient error: ' + gErr, 'ticker'); } catch (_) { }
        }
    } else {
        frame.center(text);
    }
    frame.cycle();
};

/**
 * Start a background RSS fetch for the current feed URL.
 */
ShellTicker.prototype._startFetch = function () {
    if (this._fetching) return;
    var url = this._feedUrls[this._feedUrlIndex];
    if (!url) return;
    try {
        this._fetchQueue = load(true, 'future_shell/lib/shell/ticker_fetch.js', url);
        this._fetching = true;
        try { dbug('ticker: fetching ' + url, 'ticker'); } catch (_) { }
    } catch (e) {
        this._fetching = false;
        try { dbug('ticker: fetch spawn error: ' + e, 'ticker'); } catch (_) { }
    }
};

/**
 * Non-blocking poll for background fetch results.
 */
ShellTicker.prototype._pollFetchResult = function () {
    if (!this._fetching || !this._fetchQueue) return;
    // poll(0) = non-blocking check for data
    var hasData = false;
    try { hasData = this._fetchQueue.poll(0); } catch (e) { return; }
    if (!hasData && hasData !== true) {
        // Check if the background thread orphaned (crashed/finished without writing)
        if (this._fetchQueue.orphan) {
            this._fetching = false;
            this._fetchQueue = null;
            try { dbug('ticker: fetch thread orphaned', 'ticker'); } catch (_) { }
        }
        return;
    }
    var result = null;
    try { result = this._fetchQueue.read(0); } catch (e) {
        this._fetching = false;
        this._fetchQueue = null;
        return;
    }
    this._fetching = false;
    this._fetchQueue = null;

    if (!result) return;
    if (result.error) {
        try { dbug('ticker: fetch error: ' + (result.message || 'unknown'), 'ticker'); } catch (_) { }
        return;
    }
    if (Array.isArray(result.headlines) && result.headlines.length) {
        this._headlines = result.headlines;
        this._headlineIndex = 0;
        this._lastFetchTs = Date.now();
        try { dbug('ticker: loaded ' + result.headlines.length + ' headlines', 'ticker'); } catch (_) { }
    }
};

/**
 * Advance to the next feed URL (round-robin across configured feeds).
 */
ShellTicker.prototype._advanceFeedUrl = function () {
    if (this._feedUrls.length <= 1) return;
    this._feedUrlIndex = (this._feedUrlIndex + 1) % this._feedUrls.length;
};
