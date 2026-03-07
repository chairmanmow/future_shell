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
    this._hotspotManager = opts.hotspotManager || null;
    this._hotspotLayerId = opts.hotspotLayerId || null;
    var cfg = opts.config || {};

    // Display durations (ms)
    this.bannerDurationMs = (typeof cfg.banner_duration === 'number') ? cfg.banner_duration : 8000;
    this.headlineDurationMs = (typeof cfg.headline_duration === 'number') ? cfg.headline_duration : 15000;

    // How often to re-fetch RSS data (ms) — default 5 minutes
    this.refreshIntervalMs = (typeof cfg.refresh_interval === 'number') ? cfg.refresh_interval : 900000;

    // Global config feed URLs (fallback when no per-user prefs exist)
    this._globalFeedUrls = [];
    if (Array.isArray(cfg._resolvedUrls) && cfg._resolvedUrls.length) {
        this._globalFeedUrls = cfg._resolvedUrls.slice();
    }

    // Per-user settings (loaded from JSON prefs file)
    this._randomOrder = !!(cfg.random_order);
    this._useFavorites = !!(cfg.use_favorites);

    // Feed URLs to rotate through (resolved at init / reload)
    this._feedUrls = [];

    // Enabled flag — re-evaluated after prefs load
    this._cfgEnabled = (cfg.enabled !== false);
    this.enabled = false; // set by _resolveFeeds()

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
    this._destroyed = false;      // Set true on detach to prevent use-after-free

    // Load per-user prefs and resolve feed URLs
    this._loadUserPrefs();
    this._resolveFeeds();
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
 * Detach from timer and clean up all resources.
 * Must be called before the shell exits to prevent use-after-free.
 */
ShellTicker.prototype.detach = function () {
    this._destroyed = true;
    this._clearHeadlineHotspot();
    if (this._timerEvent) {
        this._timerEvent.abort = true;
        this._timerEvent = null;
    }
    // Abandon any in-flight background fetch thread.
    // The thread will write to parent_queue and exit on its own;
    // we just stop polling so we never read from a stale queue.
    this._fetching = false;
    this._fetchQueue = null;
    this._headlines = [];
    this.shell = null;
    this._hotspotManager = null;
    this._hotspotLayerId = null;
};

// ---------------------------------------------------------------------------
// Per-user preferences
// ---------------------------------------------------------------------------

ShellTicker.prototype._userPrefsPath = function () {
    var base = '';
    try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) {}
    if (!base && typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (!base) base = '.';
    if (base.charAt(base.length - 1) !== '/' && base.charAt(base.length - 1) !== '\\') base += '/';
    var key = 'guest';
    try {
        if (typeof user === 'object' && user) {
            if (typeof user.number === 'number' && user.number > 0) key = 'user' + user.number;
            else if (user.alias) key = 'alias_' + String(user.alias).toLowerCase().replace(/[^a-z0-9]+/g, '_');
        }
    } catch (_) {}
    return base + 'future_shell/data/ticker/prefs_' + key + '.json';
};

ShellTicker.prototype._loadUserPrefs = function () {
    try {
        var path = this._userPrefsPath();
        var f = new File(path);
        if (!f.exists) return; // no per-user prefs; use global config
        if (!f.open('r')) return;
        var text = '';
        try { text = f.readAll().join('\n'); } catch (_) {}
        f.close();
        if (!text) return;
        var prefs = JSON.parse(text);
        if (!prefs || typeof prefs !== 'object') return;
        if (prefs.random_order !== undefined) this._randomOrder = !!prefs.random_order;
        if (prefs.use_favorites !== undefined) this._useFavorites = !!prefs.use_favorites;
        if (Array.isArray(prefs.feeds) && prefs.feeds.length) {
            this._userFeedUrls = [];
            for (var i = 0; i < prefs.feeds.length; i++) {
                if (prefs.feeds[i] && prefs.feeds[i].url) {
                    this._userFeedUrls.push(prefs.feeds[i].url);
                }
            }
        }
    } catch (e) {
        try { dbug('ticker: error loading user prefs: ' + e, 'ticker'); } catch (_) {}
    }
};

ShellTicker.prototype._resolveFeeds = function () {
    var urls = [];

    // Per-user feed list takes priority over global config
    if (this._userFeedUrls && this._userFeedUrls.length) {
        urls = this._userFeedUrls.slice();
    } else {
        urls = this._globalFeedUrls.slice();
    }

    // Merge in newsreader favorites if enabled
    if (this._useFavorites) {
        var favUrls = this._readNewsreaderFavorites();
        for (var i = 0; i < favUrls.length; i++) {
            if (urls.indexOf(favUrls[i]) === -1) urls.push(favUrls[i]);
        }
    }

    this._feedUrls = urls;
    this.enabled = this._cfgEnabled && (urls.length > 0);
};

ShellTicker.prototype._readNewsreaderFavorites = function () {
    var urls = [];
    try {
        var base = '';
        try { if (system && system.mods_dir) base = system.mods_dir; } catch (_) {}
        if (!base) base = '.';
        if (base.charAt(base.length - 1) !== '/') base += '/';
        var key = 'guest';
        try {
            if (typeof user === 'object' && user) {
                if (typeof user.number === 'number' && user.number > 0) key = 'user' + user.number;
                else if (user.alias) key = 'alias_' + String(user.alias).toLowerCase().replace(/[^a-z0-9]+/g, '_');
            }
        } catch (_) {}
        var path = base + 'future_shell/data/newsreader/favorites_' + key + '.json';
        var f = new File(path);
        if (!f.exists) return urls;
        if (!f.open('r')) return urls;
        var text = '';
        try { text = f.readAll().join('\n'); } catch (_) {}
        f.close();
        if (!text) return urls;
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.feeds)) return parsed.feeds;
    } catch (_) {}
    return urls;
};

/**
 * Reload per-user preferences (called by ticker_settings after saving).
 * Refreshes feed URLs and settings without restarting the timer.
 */
ShellTicker.prototype.reloadPrefs = function () {
    if (this._destroyed) return;
    this._userFeedUrls = null;
    this._loadUserPrefs();
    this._resolveFeeds();

    // If feeds changed, reset fetch state so we re-fetch
    this._feedUrlIndex = 0;
    this._lastFetchTs = 0;
    if (!this._fetching) this._startFetch();

    try { dbug('ticker: prefs reloaded, ' + this._feedUrls.length + ' feeds, random=' + this._randomOrder, 'ticker'); } catch (_) {}
};

/**
 * Main tick — called every ~1 second by the timer.
 */
ShellTicker.prototype._tick = function () {
    if (this._destroyed || !this.enabled || !this.shell) return;

    var now = Date.now();

    // Poll for background fetch results (non-blocking) — always poll even if subprogram active
    this._pollFetchResult();

    // Check if it's time to re-fetch (skip while subprogram active to avoid wasting threads)
    if (!this._fetching && this._lastFetchTs > 0 && (now - this._lastFetchTs) >= this.refreshIntervalMs) {
        var sub = this.shell.activeSubprogram;
        if (!sub || !sub.running) {
            this._advanceFeedUrl();
            this._startFetch();
        }
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
        if (this._randomOrder && this._headlines.length > 1) {
            // Pick a random headline different from the current one
            var prev = this._headlineIndex;
            this._headlineIndex = Math.floor(Math.random() * this._headlines.length);
            if (this._headlineIndex === prev) {
                this._headlineIndex = (prev + 1) % this._headlines.length;
            }
        } else {
            this._headlineIndex++;
            if (this._headlineIndex >= this._headlines.length) {
                this._headlineIndex = 0;
            }
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
    if (this._destroyed) return;
    var shell = this.shell;
    if (!shell || !shell.headerFrame) return;
    // Guard against writing to a disposed/closed frame
    if (typeof shell.headerFrame.is_open !== 'undefined' && !shell.headerFrame.is_open) return;
    if (typeof shell._refreshHeaderFrame === 'function') {
        shell._refreshHeaderFrame();
    }
    this._clearHeadlineHotspot();
};

/**
 * Render a headline into the header frame using gradient styling.
 * Picks from curated headline-safe gradient presets and applies
 * explicit high-contrast text coloring for legibility.
 */
ShellTicker.prototype._renderHeadline = function () {
    if (this._destroyed) return;
    var shell = this.shell;
    if (!shell || !shell.headerFrame) return;
    var frame = shell.headerFrame;
    // Guard against writing to a disposed/closed frame (use-after-free)
    if (typeof frame.is_open !== 'undefined' && !frame.is_open) return;
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

    // Register clickable hotspot on the header row (reuses CTRL-B cmd)
    // Must go via HotSpotManager so it survives grid redraws (which clear_hotspots + re-apply).
    // Coordinates are 0-based (terminal internal row/column), NOT 1-based gotoxy.
    if (headline.link) {
        if (this._hotspotManager && this._hotspotLayerId) {
            try {
                this._hotspotManager.setLayerHotspots(this._hotspotLayerId, [
                    { key: '\x02', swallow: false, x1: 0, x2: width - 1, y1: 0 }
                ]);
                this._headlineHotspotActive = true;
            } catch (_hsErr) { }
        } else if (typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
            try {
                console.add_hotspot('\x02', false, 0, width - 1, 0);
                this._headlineHotspotActive = true;
            } catch (_hsErr) { }
        }
    }
};

/**
 * Start a background RSS fetch for the current feed URL.
 */
ShellTicker.prototype._startFetch = function () {
    if (this._destroyed || this._fetching) return;
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
    if (this._destroyed || !this._fetching || !this._fetchQueue) return;
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
        // Hint GC to reclaim background thread memory
        try { js.gc(false); } catch (_) {}
        try { dbug('ticker: loaded ' + result.headlines.length + ' headlines', 'ticker'); } catch (_) { }
    }
};

/**
 * Get the link URL for the currently displayed headline.
 * Returns the URL string, or null if no headline is active.
 */
ShellTicker.prototype.getCurrentHeadlineLink = function () {
    var headline = this._headlines[this._headlineIndex];
    return (headline && headline.link) ? headline.link : null;
};

/**
 * Remove the header-row clickable hotspot (when switching to banner or detaching).
 */
ShellTicker.prototype._clearHeadlineHotspot = function () {
    if (!this._headlineHotspotActive) return;
    this._headlineHotspotActive = false;
    if (this._hotspotManager && this._hotspotLayerId) {
        try { this._hotspotManager.clearLayer(this._hotspotLayerId); } catch (_) { }
    }
};

/**
 * Advance to the next feed URL (round-robin across configured feeds).
 */
ShellTicker.prototype._advanceFeedUrl = function () {
    if (this._feedUrls.length <= 1) return;
    this._feedUrlIndex = (this._feedUrlIndex + 1) % this._feedUrls.length;
};
