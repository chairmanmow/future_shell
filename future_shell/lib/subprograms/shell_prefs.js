load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_e) { }
}
if (typeof JSONdb === 'undefined') {
    try { load('json-db.js'); } catch (_eJSON) { }
}

var SHELL_PREFS_VERSION = 1;
var SHELL_PREFS_VALID_STATES = { on: 'on', off: 'off', snooze: 'snooze' };
var SHELL_PREFS_DEFAULT_CATEGORIES = ['mrc', 'json-chat', 'email', 'launch_notice'];
var SHELL_PREFS_DB_FILE = 'shell_prefs.json';
var SHELL_PREFS_DB_SCOPE = 'ICSH_SHELL_PREFS';
var SHELL_PREFS_LOG_PREFIX = '[ShellPrefs] ';
var SHELL_PREFS_STATE_CYCLE = ['on', 'snooze', 'off'];

var _spDbInstance = null;
var _spDbInitialized = false;

function _spLog(message) {
    if (typeof log !== 'function') return;
    try { log(SHELL_PREFS_LOG_PREFIX + message); } catch (_e) { }
}

function _spEnsureTrailingSlash(path) {
    if (!path || typeof path !== 'string') return '';
    var last = path.charAt(path.length - 1);
    if (last === '/' || last === '\\') return path;
    return path + '/';
}

function _spEnsureDir(path) {
    if (!path) return false;
    if (file_isdir(path)) return true;
    try {
        mkdir(path);
        if (file_isdir(path)) return true;
    } catch (_e) { }
    return false;
}

function _spResolvePaths() {
    if (_spResolvePaths.cache) return _spResolvePaths.cache;
    var base = null;
    try {
        if (typeof system !== 'undefined' && system && system.mods_dir) base = system.mods_dir;
    } catch (_e) { }
    if (!base && typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
    if (!base) base = '.';
    base = _spEnsureTrailingSlash(base) + 'future_shell/';
    var data = base + 'data/';
    var prefsDir = data + 'prefs/';
    var dbFile = prefsDir + SHELL_PREFS_DB_FILE;
    _spEnsureDir(base);
    _spEnsureDir(data);
    _spEnsureDir(prefsDir);
    _spResolvePaths.cache = { base: base, data: data, prefs: prefsDir, dbFile: dbFile };
    return _spResolvePaths.cache;
}

function _spDeepClone(obj) {
    if (obj === null || obj === undefined) return obj;
    try {
        return JSON.parse(JSON.stringify(obj));
    } catch (_e) {
        return obj;
    }
}

function _spMerge(target, source) {
    if (!source) return target;
    if (!target || typeof target !== 'object' || Array.isArray(target)) target = {};
    for (var key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        var value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
            target[key] = _spMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
}

function _spRepeatChar(ch, count) {
    if (!ch || count <= 0) return '';
    var result = '';
    while (count-- > 0) result += ch;
    return result;
}

function _spTitleCase(str) {
    if (!str) return '';
    var lower = String(str).replace(/[_\s]+/g, ' ').toLowerCase();
    return lower.replace(/\b([a-z])/g, function (m, ch) { return ch.toUpperCase(); });
}

function _spDetachFrame(owner, frame) {
    if (!owner || !frame || !owner._myFrames) return;
    var list = owner._myFrames;
    var idx = list.indexOf(frame);
    if (idx !== -1) list.splice(idx, 1);
}

function _spGetDb() {
    if (_spDbInitialized) return _spDbInstance;
    _spDbInitialized = true;
    if (typeof JSONdb !== 'function') {
        _spLog('JSONdb unavailable; preferences will not persist.');
        _spDbInstance = null;
        return null;
    }
    var paths = _spResolvePaths();
    if (!paths || !paths.dbFile) {
        _spLog('Unable to resolve preferences database path.');
        _spDbInstance = null;
        return null;
    }
    try {
        _spDbInstance = new JSONdb(paths.dbFile, SHELL_PREFS_DB_SCOPE);
        if (_spDbInstance && _spDbInstance.settings) _spDbInstance.settings.KEEP_READABLE = true;
    } catch (e) {
        _spLog('Failed initializing JSONdb: ' + e);
        _spDbInstance = null;
    }
    return _spDbInstance;
}

function _spLoadUserPrefs(userKey) {
    if (!userKey) return null;
    var db = _spGetDb();
    if (!db || !db.masterData || typeof db.masterData.data !== 'object') return null;
    var payload = db.masterData.data[userKey];
    if (!payload || typeof payload !== 'object') return null;
    return _spDeepClone(payload);
}

function _spSaveUserPrefs(userKey, prefs) {
    if (!userKey || !prefs) return false;
    var db = _spGetDb();
    if (!db) return false;
    if (!db.masterData || typeof db.masterData !== 'object') db.masterData = { data: {} };
    if (!db.masterData.data || typeof db.masterData.data !== 'object') db.masterData.data = {};
    db.masterData.data[userKey] = _spDeepClone(prefs);
    try {
        db.save();
        return true;
    } catch (e) {
        _spLog('Failed saving preferences: ' + e);
        return false;
    }
}

function _spSanitizeKey(val, fallback) {
    if (!val && val !== 0) return fallback || 'default';
    var str = String(val).trim();
    if (!str.length) return fallback || 'default';
    str = str.replace(/[^A-Za-z0-9_\-\.]/g, '_');
    if (!str.length) return fallback || 'default';
    return str;
}

function _spDefaultPrefs() {
    var prefs = {
        version: SHELL_PREFS_VERSION,
        updated: 0,
        notifications: {
            globalState: 'on',
            categories: {},
            senders: {}
        }
    };
    for (var i = 0; i < SHELL_PREFS_DEFAULT_CATEGORIES.length; i++) {
        prefs.notifications.categories[SHELL_PREFS_DEFAULT_CATEGORIES[i]] = { state: 'on', updated: 0 };
    }
    return prefs;
}

function _spNormalizeState(state) {
    if (!state && state !== 0) return 'on';
    var key = String(state).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SHELL_PREFS_VALID_STATES, key)) return key;
    return 'on';
}

function _spEffectiveState(globalState, categoryState, senderState) {
    if (globalState === 'off') return 'off';
    if (globalState === 'snooze') return 'snooze';
    if (senderState === 'off' || senderState === 'snooze') return senderState;
    if (categoryState === 'off' || categoryState === 'snooze') return categoryState;
    if (senderState) return senderState;
    return categoryState || globalState || 'on';
}

function ShellPrefs(opts) {
    opts = opts || {};
    opts.name = opts.name || 'shell-prefs';
    Subprogram.call(this, opts);
    this.headerFrame = null;
    this.listFrame = null;
    this.helpFrame = null;
    this.selectedIndex = 0;
    this._rows = [];
    this._statusText = 'Space/Enter: toggle  ESC: close';
    this._stateCycle = SHELL_PREFS_STATE_CYCLE.slice(0);
    if (!this.themeNamespace) this.themeNamespace = this.id || 'shell-prefs';
    if (typeof this.registerColors === 'function') {
        try {
            this.registerColors({
                HEADER: { BG: BG_BLUE, FG: WHITE },
                ROW_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },
                ROW_ACTIVE: { BG: BG_BLUE, FG: WHITE },
                HELP: { BG: BG_BLACK, FG: CYAN }
            }, this.themeNamespace || this.id || 'shell-prefs');
        } catch (_eReg) { }
    }
    this.userNumber = (typeof opts.userNumber === 'number') ? opts.userNumber : null;
    this.userAlias = opts.userAlias || null;
    if (!this.userAlias && typeof user !== 'undefined' && user) {
        if (this.userNumber === null && typeof user.number === 'number') this.userNumber = user.number;
        if (!this.userAlias && user.alias) this.userAlias = user.alias;
    }
    this._paths = _spResolvePaths();
    this._db = _spGetDb();
    this._userKey = (this.userNumber !== null)
        ? ('user-' + this.userNumber)
        : ('alias-' + _spSanitizeKey(this.userAlias, 'anonymous'));
    this.preferences = _spDefaultPrefs();
    this._dirty = false;
    this._load();
    this._refreshRows();
}
if (typeof extend === 'function') extend(ShellPrefs, Subprogram);

ShellPrefs.prototype._load = function () {
    var stored = _spLoadUserPrefs(this._userKey);
    if (!stored || typeof stored !== 'object') {
        this.preferences = _spDefaultPrefs();
        this._touch();
        return;
    }
    var merged = _spMerge(_spDefaultPrefs(), stored);
    var storedVersion = (typeof stored.version === 'number' || typeof stored.version === 'string') ? stored.version : null;
    var changed = storedVersion !== SHELL_PREFS_VERSION;
    var storedCats = (stored.notifications && stored.notifications.categories) || {};
    for (var i = 0; i < SHELL_PREFS_DEFAULT_CATEGORIES.length && !changed; i++) {
        if (!Object.prototype.hasOwnProperty.call(storedCats, SHELL_PREFS_DEFAULT_CATEGORIES[i])) changed = true;
    }
    this.preferences = merged;
    if (!this.preferences.notifications || typeof this.preferences.notifications !== 'object') {
        this.preferences.notifications = { globalState: 'on', categories: {}, senders: {} };
    }
    if (!this.preferences.notifications.categories) this.preferences.notifications.categories = {};
    if (!this.preferences.notifications.senders) this.preferences.notifications.senders = {};
    this.preferences.version = SHELL_PREFS_VERSION;
    if (changed) {
        this._touch();
    } else {
        this._dirty = false;
        if (typeof stored.updated === 'number') this.preferences.updated = stored.updated;
    }
};

ShellPrefs.prototype._touch = function () {
    this.preferences.updated = Date.now();
    this._dirty = true;
};

ShellPrefs.prototype._ensureCategory = function (category) {
    var prefs = this.preferences.notifications;
    if (!prefs.categories) prefs.categories = {};
    if (!prefs.categories[category]) {
        prefs.categories[category] = { state: 'on', updated: 0 };
    }
    return prefs.categories[category];
};

ShellPrefs.prototype._ensureSender = function (category, sender) {
    var prefs = this.preferences.notifications;
    if (!prefs.senders) prefs.senders = {};
    if (!prefs.senders[category]) prefs.senders[category] = {};
    if (!prefs.senders[category][sender]) {
        prefs.senders[category][sender] = { state: 'on', updated: 0 };
    }
    return prefs.senders[category][sender];
};

ShellPrefs.prototype._refreshRows = function () {
    var rows = [];
    rows.push({
        type: 'global',
        key: 'global',
        label: 'All Notifications',
        state: this.getGlobalState()
    });
    var cats = this.listCategories();
    cats.sort();
    for (var i = 0; i < cats.length; i++) {
        var cat = cats[i];
        rows.push({
            type: 'category',
            key: cat,
            label: 'Category: ' + _spTitleCase(cat),
            state: this.getCategoryState(cat)
        });
    }
    this._rows = rows;
    if (this.selectedIndex >= rows.length) this.selectedIndex = rows.length - 1;
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (!rows.length) {
        this._rows = [{ type: 'empty', key: 'empty', label: 'No preferences available', state: 'on' }];
        this.selectedIndex = 0;
    }
};

ShellPrefs.prototype._currentRow = function () {
    if (!this._rows || !this._rows.length) return null;
    if (this.selectedIndex < 0 || this.selectedIndex >= this._rows.length) return null;
    return this._rows[this.selectedIndex];
};

ShellPrefs.prototype._ensureFrames = function () {
    if (!this.hostFrame) return;
    var host = this.hostFrame;
    var listHeight = Math.max(1, host.height - 2);
    if (this.headerFrame && (this.headerFrame.width !== host.width || this.headerFrame.height !== 1)) {
        try { this.headerFrame.close(); } catch (_eHF) { }
        _spDetachFrame(this, this.headerFrame);
        this.headerFrame = null;
    }
    if (this.listFrame && (this.listFrame.width !== host.width || this.listFrame.height !== listHeight)) {
        try { this.listFrame.close(); } catch (_eLF) { }
        _spDetachFrame(this, this.listFrame);
        this.listFrame = null;
    }
    if (this.helpFrame && (this.helpFrame.width !== host.width || this.helpFrame.height !== 1)) {
        try { this.helpFrame.close(); } catch (_eFF) { }
        _spDetachFrame(this, this.helpFrame);
        this.helpFrame = null;
    }
    if (!this.headerFrame) {
        this.headerFrame = new Frame(host.x, host.y, host.width, 1, this.paletteAttr('HEADER'), host);
        this.headerFrame.open();
        this.registerFrame(this.headerFrame);
    }
    if (!this.listFrame) {
        this.listFrame = new Frame(host.x, host.y + 1, host.width, listHeight, this.paletteAttr('ROW_NORMAL'), host);
        this.listFrame.open();
        this.listFrame.word_wrap = false;
        this.registerFrame(this.listFrame);
    }
    if (!this.helpFrame) {
        this.helpFrame = new Frame(host.x, host.y + host.height - 1, host.width, 1, this.paletteAttr('HELP'), host);
        this.helpFrame.open();
        this.helpFrame.word_wrap = false;
        this.registerFrame(this.helpFrame);
    }
};

ShellPrefs.prototype._renderHeader = function () {
    if (!this.headerFrame) return;
    try {
        this.headerFrame.clear();
        this.headerFrame.gotoxy(1, 1);
        var title = 'Future Shell Preferences';
        if (title.length > this.headerFrame.width) title = title.substr(0, this.headerFrame.width);
        this.headerFrame.putmsg(title);
        this.headerFrame.cycle();
    } catch (_e) { }
};

ShellPrefs.prototype._renderHelp = function () {
    if (!this.helpFrame) return;
    try {
        var msg = this._statusText || '';
        if (!msg.length) msg = 'Space/Enter: toggle  ESC: close';
        if (msg.length > this.helpFrame.width) msg = msg.substr(0, this.helpFrame.width);
        this.helpFrame.clear();
        this.helpFrame.gotoxy(1, 1);
        this.helpFrame.putmsg(msg);
        this.helpFrame.cycle();
    } catch (_e) { }
};

ShellPrefs.prototype._formatRowText = function (row) {
    if (!row) return '';
    var label = row.label || row.key || '';
    var state = '[' + String(row.state || '').toUpperCase() + ']';
    var width = this.listFrame ? this.listFrame.width : 60;
    var maxLabel = Math.max(0, width - state.length - 1);
    if (label.length > maxLabel) label = label.substr(0, maxLabel);
    var padding = Math.max(1, width - label.length - state.length);
    return label + _spRepeatChar(' ', padding) + state;
};

ShellPrefs.prototype._renderList = function () {
    if (!this.listFrame) return;
    var rows = this._rows || [];
    try {
        this.listFrame.clear();
        for (var i = 0; i < rows.length && i < this.listFrame.height; i++) {
            var row = rows[i];
            var attr = (i === this.selectedIndex)
                ? this.paletteAttr('ROW_ACTIVE', this.paletteAttr('ROW_NORMAL'))
                : this.paletteAttr('ROW_NORMAL');
            this.listFrame.attr = attr;
            this.listFrame.gotoxy(1, i + 1);
            this.listFrame.putmsg(this._formatRowText(row));
        }
        this.listFrame.cycle();
    } catch (_e) { }
};

ShellPrefs.prototype._updateStatus = function (text) {
    if (text && text.length) this._statusText = text;
    this._renderHelp();
};

ShellPrefs.prototype._moveSelection = function (delta) {
    if (!this._rows || !this._rows.length) return;
    var len = this._rows.length;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
    this._renderList();
    var current = this._currentRow();
    if (current) this._updateStatus('Selected: ' + current.label);
};

ShellPrefs.prototype._cycleState = function (state) {
    var normalized = _spNormalizeState(state);
    var seq = this._stateCycle.length ? this._stateCycle : SHELL_PREFS_STATE_CYCLE;
    var idx = seq.indexOf(normalized);
    if (idx === -1) idx = 0;
    return seq[(idx + 1) % seq.length];
};

ShellPrefs.prototype._applyRowState = function (row, state) {
    if (!row) return false;
    if (row.type === 'global') return this.setGlobalState(state);
    if (row.type === 'category') return this.setCategoryState(row.key, state);
    return false;
};

ShellPrefs.prototype._toggleSelection = function () {
    var row = this._currentRow();
    if (!row) return;
    if (row.type === 'empty') {
        this._updateStatus('No settings to change.');
        return;
    }
    var next = this._cycleState(row.state);
    if (!this._applyRowState(row, next)) return;
    row.state = next;
    this._refreshRows();
    this._renderList();
    this._updateStatus(row.label + ' -> ' + next.toUpperCase());
};

ShellPrefs.prototype.draw = function () {
    this._ensureFrames();
    this._renderHeader();
    this._renderList();
    this._renderHelp();
};

ShellPrefs.prototype.listCategories = function () {
    var cats = [];
    var prefs = this.preferences.notifications;
    if (prefs && prefs.categories) {
        for (var key in prefs.categories) {
            if (Object.prototype.hasOwnProperty.call(prefs.categories, key)) cats.push(key);
        }
    }
    return cats;
};

ShellPrefs.prototype.getCategoryState = function (category) {
    if (!category) return 'on';
    var prefs = this.preferences.notifications;
    if (!prefs || !prefs.categories || !prefs.categories[category]) return 'on';
    return _spNormalizeState(prefs.categories[category].state);
};

ShellPrefs.prototype.setCategoryState = function (category, state) {
    if (!category) return false;
    var normalized = _spNormalizeState(state);
    var entry = this._ensureCategory(category);
    if (entry.state === normalized) return true;
    entry.state = normalized;
    entry.updated = Date.now();
    this._touch();
    this._refreshRows();
    this._renderList();
    return true;
};

ShellPrefs.prototype.getSenderState = function (category, sender) {
    if (!category || !sender) return null;
    var prefs = this.preferences.notifications;
    if (!prefs || !prefs.senders || !prefs.senders[category] || !prefs.senders[category][sender]) return null;
    return _spNormalizeState(prefs.senders[category][sender].state);
};

ShellPrefs.prototype.setSenderState = function (category, sender, state) {
    if (!category || !sender) return false;
    var normalized = _spNormalizeState(state);
    var entry = this._ensureSender(category, sender);
    if (entry.state === normalized) return true;
    entry.state = normalized;
    entry.updated = Date.now();
    this._touch();
    this._refreshRows();
    this._renderList();
    return true;
};

ShellPrefs.prototype.getGlobalState = function () {
    var prefs = this.preferences.notifications;
    if (!prefs) return 'on';
    return _spNormalizeState(prefs.globalState);
};

ShellPrefs.prototype.setGlobalState = function (state) {
    var normalized = _spNormalizeState(state);
    var prefs = this.preferences.notifications;
    if (!prefs) {
        this.preferences.notifications = { globalState: normalized, categories: {}, senders: {} };
        this._touch();
        return true;
    }
    if (prefs.globalState === normalized) return true;
    prefs.globalState = normalized;
    this._touch();
    this._refreshRows();
    this._renderList();
    return true;
};

ShellPrefs.prototype.getNotificationState = function (category, sender) {
    var globalState = this.getGlobalState();
    var catState = category ? this.getCategoryState(category) : 'on';
    var senderState = (category && sender) ? this.getSenderState(category, sender) : null;
    return _spEffectiveState(globalState, catState, senderState);
};

ShellPrefs.prototype.shouldDisplayNotification = function (category, sender) {
    var state = this.getNotificationState(category, sender);
    return state !== 'off' && state !== 'snooze';
};

ShellPrefs.prototype.updateFromObject = function (partial) {
    if (!partial || typeof partial !== 'object') return false;
    var merged = _spMerge(_spDeepClone(this.preferences), partial);
    if (!merged.notifications || typeof merged.notifications !== 'object') {
        merged.notifications = { globalState: 'on', categories: {}, senders: {} };
    }
    if (!merged.notifications.categories) merged.notifications.categories = {};
    if (!merged.notifications.senders) merged.notifications.senders = {};
    this.preferences = merged;
    this._touch();
    this._refreshRows();
    this._renderList();
    return true;
};

ShellPrefs.prototype.save = function () {
    if (!this._dirty) return true;
    this.preferences.version = SHELL_PREFS_VERSION;
    this.preferences.user = {
        number: this.userNumber,
        alias: this.userAlias || null,
        key: this._userKey
    };
    if (typeof this.preferences.updated !== 'number' || this.preferences.updated <= 0) {
        this.preferences.updated = Date.now();
    }
    var ok = _spSaveUserPrefs(this._userKey, this.preferences);
    if (ok) {
        this._dirty = false;
        if (this.shell && typeof this.shell.onShellPrefsSaved === 'function') {
            try { this.shell.onShellPrefsSaved(this); } catch (_notifyErr) { }
        }
    }
    return ok;
};

ShellPrefs.prototype.flush = function () {
    return this.save();
};

ShellPrefs.prototype.toJSON = function () {
    return _spDeepClone(this.preferences);
};

ShellPrefs.prototype.enter = function (done) {
    this._refreshRows();
    this.selectedIndex = this.selectedIndex || 0;
    this._statusText = 'Space/Enter: toggle  ESC: close';
    if (this._dirty) {
        try { this.save(); } catch (_eSave) { }
    }
    Subprogram.prototype.enter.call(this, done);
    this._updateStatus(this._statusText);
    return true;
};

ShellPrefs.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;

    var isUp = false;
    var isDown = false;

    if (typeof KEY_UP !== 'undefined' && key === KEY_UP) isUp = true;
    if (typeof KEY_DOWN !== 'undefined' && key === KEY_DOWN) isDown = true;

    if (key === '\x1B[A' || key === '\x1BOA' || key === 'KEY_UP' || key === '\x1E') isUp = true;
    if (key === '\x1B[B' || key === '\x1BOB' || key === 'KEY_DOWN' || key === '\x1F' || key === '\n') isDown = true;

    if (isUp) {
        this._moveSelection(-1);
        return true;
    }

    if (isDown) {
        this._moveSelection(1);
        return true;
    }

    if ((typeof KEY_HOME !== 'undefined' && key === KEY_HOME) || key === '\x1B[H' || key === '\x1BOH' || key === 'KEY_HOME') {
        this.selectedIndex = 0;
        this._renderList();
        this._updateStatus('Selected: ' + (this._currentRow() ? this._currentRow().label : ''));
        return true;
    }

    if ((typeof KEY_END !== 'undefined' && key === KEY_END) || key === '\x1B[F' || key === '\x1BOF' || key === 'KEY_END') {
        if (this._rows && this._rows.length) {
            this.selectedIndex = this._rows.length - 1;
            this._renderList();
            this._updateStatus('Selected: ' + (this._currentRow() ? this._currentRow().label : ''));
        }
        return true;
    }

    if ((typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER) || key === '\r' || key === ' ') {
        this._toggleSelection();
        return true;
    }

    if (key === 'g' || key === 'G') {
        this.selectedIndex = 0;
        this._renderList();
        this._updateStatus('Selected: All Notifications');
        return true;
    }

    if (key === 's' || key === 'S') {
        this.save();
        this._updateStatus('Preferences saved.');
        return true;
    }

    if (key === '\x1B' || key === 'q' || key === 'Q') {
        this.exit();
        return true;
    }

    return false;
};

ShellPrefs.prototype._cleanup = function () {
    try { this.save(); } catch (_e) { }
    this.headerFrame = null;
    this.listFrame = null;
    this.helpFrame = null;
};

ShellPrefs.loadForUser = function (details) {
    details = details || {};
    return new ShellPrefs(details);
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ ShellPrefs: ShellPrefs });
}
