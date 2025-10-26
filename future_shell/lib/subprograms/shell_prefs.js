load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_e) { }
}
if (typeof JSONdb === 'undefined') {
    try { load('json-db.js'); } catch (_eJSON) { }
}
try { if (typeof Button !== 'function') load('future_shell/lib/util/layout/button.js'); } catch (_eBtn) { }
try { if (typeof SubprogramHotspotHelper !== 'function') load('future_shell/lib/subprograms/subprogram_hotspots.js'); } catch (_eHs) { }

var SHELL_PREFS_VERSION = 2;
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

function _spFormatLabelValue(label, value, width) {
    label = label || '';
    value = value || '';
    if (width <= 0) return label + ' ' + value;
    var available = Math.max(0, width - (value.length + 1));
    if (label.length > available) label = label.substr(0, available);
    var padding = Math.max(1, width - label.length - value.length);
    return label + _spRepeatChar(' ', padding) + value;
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

function _spClampTimeout(seconds) {
    if (seconds === undefined || seconds === null) return 180;
    var n = parseInt(seconds, 10);
    if (isNaN(n)) return 180;
    if (n <= 0) return -1;
    if (n < 30) return 30;
    return n;
}

function _spClampSwitch(seconds) {
    if (seconds === undefined || seconds === null) return 90;
    var n = parseInt(seconds, 10);
    if (isNaN(n) || n <= 0) return 30;
    if (n < 5) return 5;
    return n;
}

function _spDefaultScreensaverPrefs() {
    var cfg = {
        timeoutSeconds: 180,
        switchIntervalSeconds: 90,
        randomOrder: true,
        order: [],
        enabled: {}
    };
    try {
        if (typeof ICSH_SETTINGS === 'object' && ICSH_SETTINGS) {
            if (typeof ICSH_SETTINGS.inactivitySeconds === 'number') {
                cfg.timeoutSeconds = _spClampTimeout(ICSH_SETTINGS.inactivitySeconds);
            }
            if (ICSH_SETTINGS.screensaver && typeof ICSH_SETTINGS.screensaver === 'object') {
                var ss = ICSH_SETTINGS.screensaver;
                if (ss.switch_interval !== undefined) cfg.switchIntervalSeconds = _spClampSwitch(ss.switch_interval);
                if (ss.random !== undefined) cfg.randomOrder = !!ss.random;
                if (Array.isArray(ss.animations)) {
                    var arr = [];
                    for (var i = 0; i < ss.animations.length; i++) {
                        var name = _spSanitizeKey(ss.animations[i], '').toLowerCase();
                        if (name && arr.indexOf(name) === -1) arr.push(name);
                    }
                    if (arr.length) cfg.order = arr;
                }
            }
        }
    } catch (_eCfg) { }
    return cfg;
}

function _spDefaultPrefs() {
    var prefs = {
        version: SHELL_PREFS_VERSION,
        updated: 0,
        notifications: {
            globalState: 'on',
            categories: {},
            senders: {}
        },
        screensaver: _spDefaultScreensaverPrefs()
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
    this.hotspots = (typeof SubprogramHotspotHelper === 'function')
        ? new SubprogramHotspotHelper({ shell: this.shell, owner: 'shell-prefs', layerName: 'shell-prefs', priority: 80 })
        : null;
    this.headerFrame = null;
    this.listFrame = null;
    this.helpFrame = null;
    this.selectedIndex = 0;
    this._rows = [];
    this._rowRenderMeta = [];
    this._saverList = [];
    this._availableSavers = [];
    this._screensaverStartIndex = -1;
    this._buttonRowIndex = -1;
    this._buttonSpacerIndex = -1;
    this._moveUpButton = null;
    this._moveDownButton = null;
    this._editor = null;
    this._hotspotCommandMap = {};
    this._hotspotSeq = 0;
    this._moveUpHotKey = '[';
    this._moveDownHotKey = ']';
    this._statusText = 'Enter/Space: toggle  [ / ]: reorder  ESC: close';
    this._stateCycle = SHELL_PREFS_STATE_CYCLE.slice(0);
    if (!this.themeNamespace) this.themeNamespace = this.id || 'shell-prefs';
    if (typeof this.registerColors === 'function') {
        try {
            this.registerColors({
                HEADER: { BG: BG_BLUE, FG: WHITE },
                ROW_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },
                ROW_ACTIVE: { BG: BG_BLUE, FG: WHITE },
                HELP: { BG: BG_BLACK, FG: CYAN },
                DIVIDER: { BG: BG_BLUE, FG: YELLOW },
                NUMBER_ROW: { BG: BG_BLACK, FG: CYAN },
                NUMBER_ROW_ACTIVE: { BG: BG_CYAN, FG: BLACK },
                TOGGLE_ROW: { BG: BG_BLACK, FG: LIGHTGREEN },
                TOGGLE_ROW_ACTIVE: { BG: BG_GREEN, FG: BLACK },
                SAVER_ROW_ENABLED: { BG: BG_BLACK, FG: LIGHTGRAY },
                SAVER_ROW_DISABLED: { BG: BG_BLACK, FG: DARKGRAY },
                SAVER_ROW_ACTIVE: { BG: BG_BLUE, FG: WHITE },
                BUTTON_ROW: { BG: BG_BLACK, FG: LIGHTGRAY },
                BUTTON: { BG: BG_CYAN, FG: BLACK },
                BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },
                BUTTON_DISABLED: { BG: BG_BLACK, FG: DARKGRAY }
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
        this._initializeScreensaverState();
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
    this._initializeScreensaverState();
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

ShellPrefs.prototype._initializeScreensaverState = function () {
    if (!this.preferences.screensaver || typeof this.preferences.screensaver !== 'object') {
        this.preferences.screensaver = _spDefaultScreensaverPrefs();
        this._touch();
    }
    var prefs = this.preferences.screensaver;
    prefs.timeoutSeconds = _spClampTimeout(prefs.timeoutSeconds);
    prefs.switchIntervalSeconds = _spClampSwitch(prefs.switchIntervalSeconds);
    prefs.randomOrder = !!prefs.randomOrder;
    if (!Array.isArray(prefs.order)) prefs.order = [];
    if (!prefs.enabled || typeof prefs.enabled !== 'object') prefs.enabled = {};
    this._disabledSaverMap = this._resolveDisabledSavers();
    this._loadAvailableScreensavers();
    this._reconcileScreensaverOrder();
};

ShellPrefs.prototype._resolveDisabledSavers = function () {
    var list = [];
    try {
        if (typeof ICSH_SETTINGS === 'object' && ICSH_SETTINGS && ICSH_SETTINGS.screensaver && Array.isArray(ICSH_SETTINGS.screensaver.disabled)) {
            list = ICSH_SETTINGS.screensaver.disabled.slice();
        }
    } catch (_) { }
    var map = {};
    var normalized = [];
    for (var i = 0; i < list.length; i++) {
        var raw = list[i];
        if (raw === undefined || raw === null) continue;
        var key = String(raw).trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '').replace(/-/g, '_');
        if (!key) continue;
        if (map[key]) continue;
        map[key] = true;
        normalized.push(key);
    }
    this._disabledSaverList = normalized;
    return map;
};

ShellPrefs.prototype._loadAvailableScreensavers = function () {
    var registry = null;
    if (this.shell && this.shell._screenSaver && this.shell._screenSaver.registry) {
        registry = this.shell._screenSaver.registry;
    } else {
        try { load('future_shell/lib/effects/screensaver.js'); } catch (_eSaver) { }
        if (typeof ShellScreenSaver === 'function') {
            try {
                var tmp = new ShellScreenSaver({ getFrame: function () { return null; }, config: {} });
                registry = tmp && tmp.registry ? tmp.registry : null;
            } catch (_eTmp) { registry = null; }
        }
    }
    var list = [];
    var disabledMap = this._disabledSaverMap || {};
    if (registry) {
        for (var key in registry) {
            if (!Object.prototype.hasOwnProperty.call(registry, key)) continue;
            list.push({ name: key, label: _spTitleCase(String(key).replace(/_/g, ' ')), disabled: !!disabledMap[key] });
        }
    }
    if (!list.length) list.push({ name: 'matrix_rain', label: 'Matrix Rain', disabled: !!disabledMap['matrix_rain'] });
    list.sort(function (a, b) {
        if (!!a.disabled !== !!b.disabled) return a.disabled ? 1 : -1;
        var A = a.label.toLowerCase();
        var B = b.label.toLowerCase();
        if (A === B) return 0;
        return (A < B) ? -1 : 1;
    });
    this._availableSavers = list;
};

ShellPrefs.prototype._reconcileScreensaverOrder = function () {
    var prefs = this.preferences.screensaver || {};
    var available = this._availableSavers || [];
    var names = [];
    var disabledItems = [];
    for (var i = 0; i < available.length; i++) {
        var item = available[i];
        if (item.disabled) disabledItems.push(item);
        else names.push(item.name);
    }
    if (!prefs.order.length) {
        prefs.order = names.slice(0);
    } else {
        var filtered = [];
        for (var j = 0; j < prefs.order.length; j++) {
            var nm = prefs.order[j];
            if (names.indexOf(nm) !== -1 && filtered.indexOf(nm) === -1) filtered.push(nm);
        }
        for (var k = 0; k < names.length; k++) {
            if (filtered.indexOf(names[k]) === -1) filtered.push(names[k]);
        }
        prefs.order = filtered;
    }
    var enabledMap = prefs.enabled || {};
    for (var n = 0; n < prefs.order.length; n++) {
        var id = prefs.order[n];
        if (!Object.prototype.hasOwnProperty.call(enabledMap, id)) enabledMap[id] = true;
    }
    for (var d = 0; d < disabledItems.length; d++) {
        enabledMap[disabledItems[d].name] = false;
    }
    prefs.enabled = enabledMap;
    this._saverList = [];
    for (var s = 0; s < prefs.order.length; s++) {
        var name = prefs.order[s];
        this._saverList.push({
            name: name,
            label: this._labelForSaver(name),
            enabled: prefs.enabled[name] !== false,
            disabled: false,
            index: s
        });
    }
    var baseCount = this._saverList.length;
    for (var di = 0; di < disabledItems.length; di++) {
        var item = disabledItems[di];
        this._saverList.push({
            name: item.name,
            label: item.label,
            enabled: false,
            disabled: true,
            index: baseCount + di
        });
    }
};

ShellPrefs.prototype._labelForSaver = function (name) {
    for (var i = 0; i < this._availableSavers.length; i++) {
        if (this._availableSavers[i].name === name) return this._availableSavers[i].label;
    }
    return _spTitleCase(String(name || '').replace(/_/g, ' '));
};

ShellPrefs.prototype.getScreensaverConfig = function () {
    var prefs = this.preferences && this.preferences.screensaver ? this.preferences.screensaver : _spDefaultScreensaverPrefs();
    var out = {
        timeoutSeconds: _spClampTimeout(prefs.timeoutSeconds),
        switchIntervalSeconds: _spClampSwitch(prefs.switchIntervalSeconds),
        randomOrder: !!prefs.randomOrder,
        order: Array.isArray(prefs.order) ? prefs.order.slice(0) : [],
        enabled: {}
    };
    if (prefs.enabled && typeof prefs.enabled === 'object') {
        for (var key in prefs.enabled) {
            if (Object.prototype.hasOwnProperty.call(prefs.enabled, key)) {
                out.enabled[key] = !!prefs.enabled[key];
            }
        }
    }
    return out;
};

ShellPrefs.prototype._refreshRows = function () {
    var rows = [];
    this._buttonRowIndex = -1;
    this._buttonSpacerIndex = -1;
    rows.push({
        type: 'global',
        key: 'global',
        label: 'All Notifications',
        state: this.getGlobalState(),
        selectable: true
    });
    var cats = this.listCategories();
    cats.sort();
    for (var i = 0; i < cats.length; i++) {
        var cat = cats[i];
        rows.push({
            type: 'category',
            key: cat,
            label: 'Category: ' + _spTitleCase(cat),
            state: this.getCategoryState(cat),
            selectable: true
        });
    }
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    rows.push({
        type: 'divider',
        key: 'divider',
        label: 'Screensaver Settings',
        selectable: false
    });
    rows.push({
        type: 'number',
        key: 'timeout',
        label: 'Inactivity Timeout (seconds)',
        value: prefs.timeoutSeconds,
        selectable: true
    });
    rows.push({
        type: 'number',
        key: 'switch_interval',
        label: 'Switch Interval (seconds)',
        value: prefs.switchIntervalSeconds,
        selectable: true
    });
    rows.push({
        type: 'toggle',
        key: 'random_order',
        label: 'Random Order',
        value: !!prefs.randomOrder,
        selectable: true
    });
    rows.push({
        type: 'button_row',
        key: 'button_row',
        label: '',
        selectable: false
    });
    this._buttonRowIndex = rows.length - 1;
    rows.push({
        type: 'button_spacer',
        key: 'button_spacer',
        label: '',
        selectable: false
    });
    this._buttonSpacerIndex = rows.length - 1;
    this._screensaverStartIndex = rows.length;
    for (var s = 0; s < this._saverList.length; s++) {
        var saver = this._saverList[s];
        rows.push({
            type: 'saver',
            key: saver.name,
            label: saver.label,
            enabled: !!saver.enabled,
            order: saver.disabled ? null : s,
            selectable: !saver.disabled,
            disabled: !!saver.disabled
        });
    }
    if (!rows.length) {
        rows = [{ type: 'empty', key: 'empty', label: 'No preferences available', state: 'on', selectable: false }];
    }
    this._rows = rows;
    if (!rows[this.selectedIndex] || rows[this.selectedIndex].selectable === false) {
        this.selectedIndex = this._findNextSelectable(this.selectedIndex, 1);
    }
    if (this.selectedIndex < 0) this.selectedIndex = this._findNextSelectable(rows.length - 1, -1);
    if (this.selectedIndex < 0) this.selectedIndex = 0;
};

ShellPrefs.prototype._findNextSelectable = function (start, step) {
    var rows = this._rows || [];
    if (!rows.length) return -1;
    if (!step) step = 1;
    var idx = start;
    for (var i = 0; i < rows.length; i++) {
        idx = (idx + step + rows.length) % rows.length;
        var row = rows[idx];
        if (row && row.selectable !== false) return idx;
    }
    return -1;
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
        if (!msg.length) msg = 'Enter/Space: toggle  [ / ]: reorder  ESC: close';
        if (msg.length > this.helpFrame.width) msg = msg.substr(0, this.helpFrame.width);
        this.helpFrame.clear();
        this.helpFrame.gotoxy(1, 1);
        this.helpFrame.putmsg(msg);
        this.helpFrame.cycle();
    } catch (_e) { }
};

ShellPrefs.prototype._formatRowText = function (row, isSelected) {
    if (!row) return '';
    var width = this.listFrame ? this.listFrame.width : 60;
    if (row.type === 'number' && row.editing) {
        var buf = (row.editBuffer !== undefined && row.editBuffer !== null) ? String(row.editBuffer) : '';
        var placeholder = buf.length ? buf : (row.key === 'timeout' ? 'NEVER' : '');
        var value = '> ' + placeholder + '_';
        return _spFormatLabelValue(row.label || row.key || '', value, width);
    }
    switch (row.type) {
        case 'divider': {
            var label = ' ' + (row.label || '') + ' ';
            if (label.length > width) label = label.substr(0, width);
            var filler = Math.max(0, width - label.length);
            var left = Math.floor(filler / 2);
            var right = filler - left;
            return _spRepeatChar('-', left) + label + _spRepeatChar('-', right);
        }
        case 'number': {
            var value = (row.value === -1) ? '[NEVER]' : '[' + row.value + ']';
            return _spFormatLabelValue(row.label || row.key || '', value, width);
        }
        case 'toggle': {
            var toggleVal = row.value ? '[ON]' : '[OFF]';
            return _spFormatLabelValue(row.label || row.key || '', toggleVal, width);
        }
        case 'button_row':
        case 'button_spacer':
            return _spRepeatChar(' ', width);
        case 'saver': {
            if (row.disabled) {
                var disabledLabel = '[DISABLED BY SYSOP] ' + (row.label || row.key || '');
                if (disabledLabel.length > width) disabledLabel = disabledLabel.substr(0, width);
                return disabledLabel;
            }
            var prefix = row.enabled ? '[ON] ' : '[OFF] ';
            var orderText = '(' + (row.order + 1) + ') ';
            var textLabel = prefix + orderText + (row.label || row.key || '');
            if (textLabel.length > width) textLabel = textLabel.substr(0, width);
            return textLabel;
        }
        case 'empty':
            return row.label || '';
        case 'global':
        case 'category':
        default: {
            var state = '[' + String(row.state || '').toUpperCase() + ']';
            return _spFormatLabelValue(row.label || row.key || '', state, width);
        }
    }
};

ShellPrefs.prototype._resolveRowAttr = function (row, isSelected) {
    var base = this.paletteAttr('ROW_NORMAL');
    if (!row) return isSelected ? this.paletteAttr('ROW_ACTIVE', base) : base;
    switch (row.type) {
        case 'divider':
            return this.paletteAttr('DIVIDER', base);
        case 'number':
            if (row.editing) return this.paletteAttr('NUMBER_ROW_ACTIVE', base);
            return this.paletteAttr(isSelected ? 'NUMBER_ROW_ACTIVE' : 'NUMBER_ROW', base);
        case 'toggle':
            return this.paletteAttr(isSelected ? 'TOGGLE_ROW_ACTIVE' : 'TOGGLE_ROW', base);
        case 'saver':
            if (row.disabled) return this.paletteAttr('SAVER_ROW_DISABLED', base);
            if (isSelected) return this.paletteAttr('SAVER_ROW_ACTIVE', base);
            return this.paletteAttr(row.enabled ? 'SAVER_ROW_ENABLED' : 'SAVER_ROW_DISABLED', base);
        case 'button_row':
        case 'button_spacer':
            return this.paletteAttr('BUTTON_ROW', base);
        case 'global':
        case 'category':
            return this.paletteAttr(isSelected ? 'ROW_ACTIVE' : 'ROW_NORMAL', base);
        default:
            return this.paletteAttr(isSelected ? 'ROW_ACTIVE' : 'ROW_NORMAL', base);
    }
};

ShellPrefs.prototype._renderList = function () {
    if (!this.listFrame) return;
    var rows = this._rows || [];
    this._rowRenderMeta = [];
    try {
        this.listFrame.clear(this.paletteAttr('ROW_NORMAL'));
        for (var i = 0; i < rows.length && i < this.listFrame.height; i++) {
            var row = rows[i];
            var isSelected = (i === this.selectedIndex);
            var attr = this._resolveRowAttr(row, isSelected);
            this.listFrame.attr = attr;
            this.listFrame.gotoxy(1, i + 1);
            this.listFrame.putmsg(this._formatRowText(row, isSelected) + '\x01n');
            this._rowRenderMeta.push({
                index: i,
                row: row,
                y: i + 1,
                height: 1,
                selected: isSelected
            });
        }
        this.listFrame.cycle();
    } catch (_e) { }
    this._renderMoveButtons();
    this._updateHotspots();
};

ShellPrefs.prototype._ensureMoveButton = function (dir, x, y, width) {
    var parent = this.listFrame;
    var frameWidth = parent ? parent.width : 40;
    var buttonWidth = Math.max(6, Math.min(width || frameWidth - 2, frameWidth - 2));
    if (buttonWidth > frameWidth) buttonWidth = frameWidth;
    var attr = this.paletteAttr('BUTTON', this.paletteAttr('ROW_ACTIVE'));
    var focusAttr = this.paletteAttr('BUTTON_FOCUS', attr);
    var disabledAttr = this.paletteAttr('BUTTON_DISABLED', attr);
    var label = dir === 'up' ? 'Move Up' : 'Move Dn';
    var self = this;
    if (dir === 'up') {
        if (!this._moveUpButton) {
            this._moveUpButton = new Button({
                parentFrame: parent,
                x: x,
                y: y,
                width: buttonWidth,
                label: label,
                attr: attr,
                focusAttr: focusAttr,
                disabledAttr: disabledAttr,
                onClick: function () { self._moveSelectedSaver(-1); }
            });
        } else {
            this._moveUpButton.parentFrame = parent;
            this._moveUpButton.x = x;
            this._moveUpButton.y = y;
            this._moveUpButton.width = buttonWidth;
            this._moveUpButton.setLabel(label);
            this._moveUpButton.attr = attr;
            this._moveUpButton.focusAttr = focusAttr;
            this._moveUpButton.disabledAttr = disabledAttr;
            if (this._moveUpButton.frame) {
                this._moveUpButton.frame.parent = parent;
                if (typeof this._moveUpButton.frame.moveTo === 'function') {
                    try { this._moveUpButton.frame.moveTo(x, y); } catch (_) { this._moveUpButton.frame.x = x; this._moveUpButton.frame.y = y; }
                } else {
                    this._moveUpButton.frame.x = x;
                    this._moveUpButton.frame.y = y;
                }
                this._moveUpButton.frame.width = buttonWidth;
                this._moveUpButton.frame.height = 2;
            }
            this._moveUpButton.render();
        }
    } else {
        if (!this._moveDownButton) {
            this._moveDownButton = new Button({
                parentFrame: parent,
                x: x,
                y: y,
                width: buttonWidth,
                label: label,
                attr: attr,
                focusAttr: focusAttr,
                disabledAttr: disabledAttr,
                onClick: function () { self._moveSelectedSaver(1); }
            });
        } else {
            this._moveDownButton.parentFrame = parent;
            this._moveDownButton.x = x;
            this._moveDownButton.y = y;
            this._moveDownButton.width = buttonWidth;
            this._moveDownButton.setLabel(label);
            this._moveDownButton.attr = attr;
            this._moveDownButton.focusAttr = focusAttr;
            this._moveDownButton.disabledAttr = disabledAttr;
            if (this._moveDownButton.frame) {
                this._moveDownButton.frame.parent = parent;
                if (typeof this._moveDownButton.frame.moveTo === 'function') {
                    try { this._moveDownButton.frame.moveTo(x, y); } catch (_) { this._moveDownButton.frame.x = x; this._moveDownButton.frame.y = y; }
                } else {
                    this._moveDownButton.frame.x = x;
                    this._moveDownButton.frame.y = y;
                }
                this._moveDownButton.frame.width = buttonWidth;
                this._moveDownButton.frame.height = 2;
            }
            this._moveDownButton.render();
        }
    }
};

ShellPrefs.prototype._destroyMoveButtons = function () {
    if (this._moveUpButton) {
        try { this._moveUpButton.destroy(); } catch (_) { }
    }
    if (this._moveDownButton) {
        try { this._moveDownButton.destroy(); } catch (_) { }
    }
    this._moveUpButton = null;
    this._moveDownButton = null;
};

ShellPrefs.prototype._renderMoveButtons = function () {
    if (!this.listFrame) {
        this._destroyMoveButtons();
        return;
    }
    var saverRows = [];
    var buttonMeta = null;
    for (var i = 0; i < this._rowRenderMeta.length; i++) {
        var meta = this._rowRenderMeta[i];
        if (!meta || !meta.row) continue;
        if (meta.row.type === 'saver') saverRows.push(meta);
        if (meta.row.type === 'button_row') buttonMeta = meta;
    }
    if (!saverRows.length || !buttonMeta) {
        this._destroyMoveButtons();
        return;
    }
    var availableWidth = this.listFrame.width;
    var buttonWidth = Math.max(8, Math.min(18, Math.floor((availableWidth - 6) / 2)));
    if ((buttonWidth * 2) + 6 > availableWidth) {
        buttonWidth = Math.max(6, Math.floor((availableWidth - 4) / 2));
    }
    var gap = Math.max(2, Math.floor((availableWidth - (buttonWidth * 2)) / 3));
    if (gap < 2) gap = 2;
    var firstX = Math.max(1, gap);
    var secondX = firstX + buttonWidth + gap;
    if (secondX + buttonWidth - 1 > availableWidth) {
        secondX = availableWidth - buttonWidth + 1;
        if (secondX <= firstX) secondX = firstX + buttonWidth + 2;
    }
    var buttonY = Math.max(1, buttonMeta.y);
    if (buttonY + 1 > this.listFrame.height) buttonY = Math.max(1, this.listFrame.height - 1);
    this._ensureMoveButton('up', firstX, buttonY, buttonWidth);
    this._ensureMoveButton('down', secondX, buttonY, buttonWidth);
    var current = this._currentRow();
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    var canReorder = current && current.type === 'saver' && !prefs.randomOrder;
    var index = (current && current.type === 'saver') ? current.order : -1;
    if (this._moveUpButton) this._moveUpButton.setEnabled(canReorder && index > 0);
    if (this._moveDownButton) this._moveDownButton.setEnabled(canReorder && index >= 0 && index < this._saverList.length - 1);
};

ShellPrefs.prototype._nextHotspotKey = function () {
    var alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var idx = this._hotspotSeq || 0;
    var key = (idx < alphabet.length) ? alphabet.charAt(idx) : 'z';
    this._hotspotSeq = idx + 1;
    return key;
};

ShellPrefs.prototype._resolveAbsoluteRect = function (frame) {
    if (!frame) return null;
    var x = frame.x || 1;
    var y = frame.y || 1;
    var p = frame.parent;
    while (p) {
        x += (p.x || 1) - 1;
        y += (p.y || 1) - 1;
        p = p.parent;
    }
    return { x1: x, y1: y, x2: x + Math.max(1, frame.width || 1) - 1, y2: y + Math.max(1, frame.height || 1) - 1 };
};

ShellPrefs.prototype._updateHotspots = function () {
    if (!this.hotspots) return;
    this._hotspotSeq = 0;
    this._hotspotCommandMap = {};
    var defs = [];
    if (!this.listFrame) {
        this.hotspots.clear();
        return;
    }
    var baseX = this.listFrame.x;
    var baseY = this.listFrame.y;
    var frameWidth = this.listFrame.width;
    for (var i = 0; i < this._rowRenderMeta.length; i++) {
        var meta = this._rowRenderMeta[i];
        if (!meta || !meta.row) continue;
        var row = meta.row;
        if (row.type === 'divider' || row.selectable === false) continue;
        var key = this._nextHotspotKey();
        var def = {
            key: key,
            x1: baseX,
            x2: baseX + frameWidth - 1,
            y1: baseY + meta.y - 1,
            y2: baseY + meta.y - 1,
            swallow: false,
            owner: 'shell-prefs:row',
            data: { type: row.type, key: row.key }
        };
        defs.push(def);
        this._hotspotCommandMap[key] = def.data;
    }
    if (this._moveUpButton && this._moveUpButton.enabled) {
        var upRect = this._resolveAbsoluteRect(this._moveUpButton.frame);
        if (upRect) {
            defs.push({
                key: this._moveUpHotKey,
                x1: upRect.x1,
                x2: upRect.x2,
                y1: upRect.y1,
                y2: upRect.y2,
                swallow: false,
                owner: 'shell-prefs:btn',
                data: { type: 'move_up' }
            });
            this._hotspotCommandMap[this._moveUpHotKey] = { type: 'move_up' };
        }
    }
    if (this._moveDownButton && this._moveDownButton.enabled) {
        var downRect = this._resolveAbsoluteRect(this._moveDownButton.frame);
        if (downRect) {
            defs.push({
                key: this._moveDownHotKey,
                x1: downRect.x1,
                x2: downRect.x2,
                y1: downRect.y1,
                y2: downRect.y2,
                swallow: false,
                owner: 'shell-prefs:btn',
                data: { type: 'move_down' }
            });
            this._hotspotCommandMap[this._moveDownHotKey] = { type: 'move_down' };
        }
    }
    if (defs.length) this.hotspots.set(defs);
    else this.hotspots.clear();
};

ShellPrefs.prototype._moveSelectedSaver = function (delta) {
    if (!delta) return;
    var row = this._currentRow();
    if (!row || row.type !== 'saver') return;
    if (row.disabled) {
        this._updateStatus((row.label || row.key || 'This screensaver') + ' is disabled.');
        return;
    }
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    if (prefs.randomOrder) {
        this._updateStatus('Disable random order to reorder screensavers.');
        return;
    }
    var order = prefs.order || [];
    var idx = row.order;
    var newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) {
        this._updateStatus(delta < 0 ? 'Already at the top.' : 'Already at the bottom.');
        return;
    }
    var name = order[idx];
    order.splice(idx, 1);
    order.splice(newIdx, 0, name);
    this._reconcileScreensaverOrder();
    this._refreshRows();
    this._focusRowByKey(name);
    this._renderList();
    this._touch();
    this._updateStatus('Moved ' + this._labelForSaver(name) + ' to position ' + (newIdx + 1) + '.');
};

ShellPrefs.prototype._focusRowByKey = function (key) {
    if (!this._rows || !this._rows.length) return false;
    for (var i = 0; i < this._rows.length; i++) {
        if (this._rows[i] && this._rows[i].key === key) {
            this.selectedIndex = i;
            return true;
        }
    }
    return false;
};

ShellPrefs.prototype._toggleRandomOrder = function () {
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    prefs.randomOrder = !prefs.randomOrder;
    this._touch();
    this._refreshRows();
    this._focusRowByKey('random_order');
    this._renderList();
    this._updateStatus('Random order ' + (prefs.randomOrder ? 'enabled' : 'disabled') + '.');
};

ShellPrefs.prototype._toggleSaver = function (name) {
    if (!name) return;
    if (this._disabledSaverMap && this._disabledSaverMap[name]) {
        this._updateStatus(this._labelForSaver(name) + ' is disabled and cannot be toggled.');
        return;
    }
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    if (!prefs.enabled || typeof prefs.enabled !== 'object') prefs.enabled = {};
    var currentlyEnabled = prefs.enabled[name] !== false;
    if (currentlyEnabled) {
        var enabledCount = 0;
        for (var i = 0; i < this._saverList.length; i++) if (this._saverList[i].enabled) enabledCount++;
        if (enabledCount <= 1) {
            this._updateStatus('At least one screensaver must remain enabled.');
            return;
        }
        prefs.enabled[name] = false;
    } else {
        prefs.enabled[name] = true;
    }
    this._reconcileScreensaverOrder();
    this._refreshRows();
    this._focusRowByKey(name);
    this._renderList();
    this._touch();
    this._updateStatus(this._labelForSaver(name) + ' ' + (prefs.enabled[name] !== false ? 'enabled' : 'disabled') + '.');
};

ShellPrefs.prototype._setNumberPreference = function (key, value) {
    var prefs = this.preferences.screensaver || _spDefaultScreensaverPrefs();
    if (key === 'timeout') prefs.timeoutSeconds = value;
    else if (key === 'switch_interval') prefs.switchIntervalSeconds = value;
    this._touch();
    this._reconcileScreensaverOrder();
    this._refreshRows();
    this._focusRowByKey(key);
    this._renderList();
};

ShellPrefs.prototype._startNumberEditor = function (row) {
    if (!row || row.type !== 'number') return;
    var buffer = (row.value === -1) ? '' : String(row.value || '');
    row.editing = true;
    row.editBuffer = buffer;
    this._editor = {
        type: 'number',
        rowKey: row.key,
        buffer: buffer,
        allowNever: (row.key === 'timeout')
    };
    this._renderList();
    this._updateStatus('Enter value then press Enter to save (ESC to cancel).');
};

ShellPrefs.prototype._cancelEditor = function () {
    if (!this._editor) return;
    var row = this._currentRow();
    if (row) {
        delete row.editing;
        delete row.editBuffer;
    }
    this._editor = null;
    this._renderList();
    this._updateStatus('Edit cancelled.');
};

ShellPrefs.prototype._commitEditor = function () {
    if (!this._editor) return;
    var data = this._editor;
    var row = this._currentRow();
    var buffer = data.buffer || '';
    var trimmed = buffer.trim();
    if (row) {
        delete row.editing;
        delete row.editBuffer;
    }
    this._editor = null;
    if (data.type === 'number') {
        if (data.rowKey === 'timeout') {
            var lower = trimmed.toLowerCase();
            var timeout = 0;
            if (!trimmed.length || lower === 'never') timeout = -1;
            else timeout = _spClampTimeout(trimmed);
            this._setNumberPreference('timeout', timeout);
            this._updateStatus('Timeout set to ' + (timeout === -1 ? 'Never' : timeout + ' seconds') + '.');
        } else if (data.rowKey === 'switch_interval') {
            if (!trimmed.length) {
                this._updateStatus('Switch interval unchanged.');
                this._renderList();
                return;
            }
            var interval = _spClampSwitch(trimmed);
            this._setNumberPreference('switch_interval', interval);
            this._updateStatus('Switch interval set to ' + interval + ' seconds.');
        }
    }
};

ShellPrefs.prototype._handleEditorKey = function (key) {
    if (!this._editor) return false;
    if (key === '\u001b' || key === 'KEY_ESC' || (typeof KEY_ESC !== 'undefined' && key === KEY_ESC)) {
        this._cancelEditor();
        return true;
    }
    if (key === '\r' || key === '\n' || (typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER)) {
        this._commitEditor();
        return true;
    }
    if (key === '\b' || key === '\u0008' || key === '\u007f' || key === 'KEY_BACKSPACE') {
        var buff = this._editor.buffer || '';
        this._editor.buffer = buff.length ? buff.substr(0, buff.length - 1) : '';
    } else if (typeof key === 'string' && key.length === 1) {
        if (/[0-9]/.test(key)) {
            this._editor.buffer = (this._editor.buffer || '') + key;
        } else if (this._editor.allowNever && /[nN]/.test(key)) {
            this._editor.buffer = '';
        } else {
            return true;
        }
    } else {
        return false;
    }
    var row = this._currentRow();
    if (row && row.type === 'number') {
        row.editBuffer = this._editor.buffer;
    }
    this._renderList();
    return true;
};

ShellPrefs.prototype._updateStatus = function (text) {
    if (text && text.length) this._statusText = text;
    this._renderHelp();
};

ShellPrefs.prototype._moveSelection = function (delta) {
    if (!this._rows || !this._rows.length) return;
    if (!delta) delta = 1;
    var direction = delta > 0 ? 1 : -1;
    var next = this._findNextSelectable(this.selectedIndex, direction);
    if (next !== -1) this.selectedIndex = next;
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
    if (row.selectable === false) {
        this._updateStatus('No settings to change.');
        return;
    }
    switch (row.type) {
        case 'global': {
            var nextGlobal = this._cycleState(this.getGlobalState());
            if (this.setGlobalState(nextGlobal)) {
                this._refreshRows();
                this._focusRowByKey('global');
                this._renderList();
                this._updateStatus('All Notifications -> ' + nextGlobal.toUpperCase());
            }
            break;
        }
        case 'category': {
            var nextState = this._cycleState(this.getCategoryState(row.key));
            if (this.setCategoryState(row.key, nextState)) {
                this._refreshRows();
                this._focusRowByKey(row.key);
                this._renderList();
                this._updateStatus(row.label + ' -> ' + nextState.toUpperCase());
            }
            break;
        }
        case 'number':
            this._startNumberEditor(row);
            break;
        case 'toggle':
            if (row.key === 'random_order') this._toggleRandomOrder();
            break;
        case 'saver':
            if (row.disabled) {
                this._updateStatus((row.label || row.key || 'This screensaver') + ' is disabled for this system.');
                break;
            }
            this._toggleSaver(row.key);
            break;
        default:
            this._updateStatus('No action available for this item.');
            break;
    }
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
    this._statusText = 'Enter/Space: toggle  [ / ]: reorder  ESC: close';
    if (this._dirty) {
        try { this.save(); } catch (_eSave) { }
    }
    Subprogram.prototype.enter.call(this, done);
    this._updateStatus(this._statusText);
    return true;
};

ShellPrefs.prototype._handleKey = function (key) {
    if (key === null || key === undefined) return false;

    if (this._editor) return this._handleEditorKey(key);

    var strKey = (typeof key === 'string') ? key : null;
    if (strKey && this._hotspotCommandMap && this._hotspotCommandMap[strKey]) {
        var meta = this._hotspotCommandMap[strKey];
        if (meta.type === 'move_up') { this._moveSelectedSaver(-1); return true; }
        if (meta.type === 'move_down') { this._moveSelectedSaver(1); return true; }
        if (meta.type === 'saver' || meta.type === 'number' || meta.type === 'toggle' || meta.type === 'global' || meta.type === 'category') {
            if (this._focusRowByKey(meta.key)) {
                this._renderList();
                if (meta.type === 'number') this._startNumberEditor(this._currentRow());
                else if (meta.type === 'toggle' && meta.key === 'random_order') this._toggleRandomOrder();
                else if (meta.type === 'saver') this._toggleSaver(meta.key);
                else if (meta.type === 'global' || meta.type === 'category') this._toggleSelection();
            }
            return true;
        }
    }

    var isUp = false;
    var isDown = false;
    if (typeof KEY_UP !== 'undefined' && key === KEY_UP) isUp = true;
    if (typeof KEY_DOWN !== 'undefined' && key === KEY_DOWN) isDown = true;
    if (strKey === '\x1B[A' || strKey === '\x1BOA' || strKey === 'KEY_UP' || strKey === '\x1E') isUp = true;
    if (strKey === '\x1B[B' || strKey === '\x1BOB' || strKey === 'KEY_DOWN' || strKey === '\x1F') isDown = true;

    if (isUp) {
        this._moveSelection(-1);
        return true;
    }
    if (isDown || strKey === '\n') {
        this._moveSelection(1);
        return true;
    }

    if ((typeof KEY_HOME !== 'undefined' && key === KEY_HOME) || strKey === '\x1B[H' || strKey === '\x1BOH' || strKey === 'KEY_HOME') {
        this.selectedIndex = 0;
        if (this._rows[0] && this._rows[0].selectable === false) {
            var next = this._findNextSelectable(0, 1);
            if (next !== -1) this.selectedIndex = next;
        }
        this._renderList();
        this._updateStatus('Selected: ' + (this._currentRow() ? this._currentRow().label : ''));
        return true;
    }

    if ((typeof KEY_END !== 'undefined' && key === KEY_END) || strKey === '\x1B[F' || strKey === '\x1BOF' || strKey === 'KEY_END') {
        if (this._rows && this._rows.length) {
            this.selectedIndex = this._rows.length - 1;
            if (this._rows[this.selectedIndex] && this._rows[this.selectedIndex].selectable === false) {
                var prev = this._findNextSelectable(this.selectedIndex, -1);
                if (prev !== -1) this.selectedIndex = prev;
            }
            this._renderList();
            this._updateStatus('Selected: ' + (this._currentRow() ? this._currentRow().label : ''));
        }
        return true;
    }

    if ((typeof KEY_ENTER !== 'undefined' && key === KEY_ENTER) || strKey === '\r' || strKey === ' ') {
        this._toggleSelection();
        return true;
    }

    if (strKey === 'g' || strKey === 'G') {
        this.selectedIndex = 0;
        this._renderList();
        this._updateStatus('Selected: All Notifications');
        return true;
    }

    if (strKey === 's' || strKey === 'S') {
        this.save();
        this._updateStatus('Preferences saved.');
        return true;
    }

    if (strKey === 'r' || strKey === 'R') {
        this._toggleRandomOrder();
        return true;
    }

    if (strKey === '[') {
        this._moveSelectedSaver(-1);
        return true;
    }
    if (strKey === ']') {
        this._moveSelectedSaver(1);
        return true;
    }

    if (strKey === '\x1B' || strKey === 'KEY_ESC' || (typeof KEY_ESC !== 'undefined' && key === KEY_ESC) || strKey === 'q' || strKey === 'Q') {
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
    this._destroyMoveButtons();
    if (this.hotspots && typeof this.hotspots.dispose === 'function') {
        try { this.hotspots.dispose(); } catch (_) { }
    }
    this._editor = null;
    this._rowRenderMeta = [];
};

ShellPrefs.loadForUser = function (details) {
    details = details || {};
    return new ShellPrefs(details);
};

if (typeof registerModuleExports === 'function') {
    registerModuleExports({ ShellPrefs: ShellPrefs });
}
