load('sbbsdefs.js');
load("future_shell/lib/subprograms/subprogram.js");
load("future_shell/lib/util/debug.js");
load('future_shell/lib/subprograms/message_boards/message_board_ui.js');
load('future_shell/lib/subprograms/message_boards/message_board_views.js');
load('future_shell/lib/util/layout/button.js');
load('future_shell/lib/subprograms/subprogram_hotspots.js');
if (typeof lazyLoadModule !== 'function' || typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
// Load dissolve animation function
try { load('future_shell/lib/effects/eye_candy.js'); } catch (e) { /* dissolve optional */ }
if (typeof KEY_ENTER === 'undefined') var KEY_ENTER = '\r';
if (typeof KEY_ESC === 'undefined') var KEY_ESC = '\x1b';
if (typeof KEY_BACKSPACE === 'undefined') var KEY_BACKSPACE = '\b';
if (typeof KEY_DEL === 'undefined') var KEY_DEL = '\x7f';
// Thread tree dependency (for + / - expansion UI similar to ecReader)
// We lazily load tree.js only when entering the threads view to avoid cost if user never opens threads.
// But ensure symbol available for early reference if previously loaded elsewhere.
var _TreeLibLoaded = false;


// For now let's use two types of icons until we can be expicity about more definitions
var BOARD_ICONS = {
    'group': 'folder',
    'sub': 'bulletin_board',
    'groups': 'back',
    'quit': 'logoff',
    'search': 'search'
}

var _MB_ICON_ALIAS_CACHE = null;

var _CTRL_A_EXPANDER = undefined;
function _ensureCtrlAExpander() {
    if (_CTRL_A_EXPANDER !== undefined) return _CTRL_A_EXPANDER;
    var expander = null;
    if (typeof require === 'function') {
        try {
            expander = require('ansiterm_lib.js', 'expand_ctrl_a');
        } catch (e1) {
            dbug('MessageBoard: require ansiterm_lib.js failed (' + e1 + ')', 'messageboard');
        }
    }
    if (!expander && typeof load === 'function' && typeof system !== 'undefined' && system.exec_dir) {
        var path = system.exec_dir;
        if (path.substr(path.length - 1) !== '/') path += '/';
        path += 'load/ansiterm_lib.js';
        try {
            var loaded = lazyLoadModule(path, { cacheKey: 'ansiterm_lib:' + path, suppressErrors: true });
            if (loaded && typeof loaded.expand_ctrl_a === 'function') expander = loaded.expand_ctrl_a;
        } catch (e2) {
            dbug('MessageBoard: load ansiterm_lib.js failed (' + e2 + ')', 'messageboard');
        }
    }
    if (!expander) {
        _CTRL_A_EXPANDER = null;
        throw new Error('expand_ctrl_a unavailable; cannot render Ctrl-A colours');
    }
    if (typeof expander === 'function') {
        _CTRL_A_EXPANDER = expander;
    } else if (expander && typeof expander.expand_ctrl_a === 'function') {
        _CTRL_A_EXPANDER = expander.expand_ctrl_a;
    } else {
        _CTRL_A_EXPANDER = null;
        throw new Error('expand_ctrl_a export invalid');
    }
    return _CTRL_A_EXPANDER;
}

function _expandCtrlA(text) {
    if (!text || text.indexOf('\x01') === -1) return text;
    var expand = _ensureCtrlAExpander();
    if (typeof expand !== 'function') return text;
    return expand(text);
}

function _mbBuildNameVariants(name) {
    var variants = [];
    if (typeof name === 'undefined' || name === null) return variants;
    var base = ('' + name).trim();
    if (!base.length) return variants;
    variants.push(base);
    var lower = base.toLowerCase();
    if (variants.indexOf(lower) === -1) variants.push(lower);
    var spaceHyphen = lower.replace(/\s+/g, '-');
    if (spaceHyphen.length && variants.indexOf(spaceHyphen) === -1) variants.push(spaceHyphen);
    var spaceUnderscore = lower.replace(/\s+/g, '_');
    if (spaceUnderscore.length && variants.indexOf(spaceUnderscore) === -1) variants.push(spaceUnderscore);
    var asciiHyphen = lower.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (asciiHyphen.length && variants.indexOf(asciiHyphen) === -1) variants.push(asciiHyphen);
    var asciiUnderscore = lower.replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (asciiUnderscore.length && variants.indexOf(asciiUnderscore) === -1) variants.push(asciiUnderscore);
    var alnum = lower.replace(/[^a-z0-9]+/g, '');
    if (alnum.length && variants.indexOf(alnum) === -1) variants.push(alnum);
    return variants;
}

function _mbAddIconAlias(map, key, base) {
    if (!key) return;
    var normalized = ('' + key).toLowerCase();
    if (!normalized.length) return;
    if (!map.hasOwnProperty(normalized)) map[normalized] = base;
}

function _mbLoadIconAliasMap() {
    if (_MB_ICON_ALIAS_CACHE) return _MB_ICON_ALIAS_CACHE;
    _MB_ICON_ALIAS_CACHE = {};
    return _MB_ICON_ALIAS_CACHE;
}

function _mbFindIconBase(name) {
    if (!name) return null;
    var variants = _mbBuildNameVariants(name);
    variants.push(name);
    var aliases = _mbLoadIconAliasMap();
    // Reuse previously memoized result first
    for (var i = 0; i < variants.length; i++) {
        var key = variants[i];
        if (!key) continue;
        key = key.toLowerCase();
        if (aliases.hasOwnProperty(key)) return aliases[key];
    }
    var iconDir = system.mods_dir;
    if (iconDir && iconDir.slice(-1) !== '/' && iconDir.slice(-1) !== '\\') iconDir += '/';
    iconDir += "future_shell/assets/";
    var exts = ['.ans', '.bin'];
    for (var v = 0; v < variants.length; v++) {
        var variant = variants[v];
        if (!variant) continue;
        var baseCandidate = variant;
        for (var e = 0; e < exts.length; e++) {
            var path = iconDir + baseCandidate + exts[e];
            try {
                if (file_exists(path)) {
                    for (var a = 0; a < variants.length; a++) _mbAddIconAlias(aliases, variants[a], baseCandidate);
                    return baseCandidate;
                }
            } catch (_e) { }
        }
    }
    return null;
}

var GROUPING_PREFIXES = ['RE: ', 'Re: ', 'FW: ', 'FWD: '];

function _renderAnsiIntoFrame(frame, contents, widthOverride, heightOverride, options) {
    if (!frame || typeof contents !== 'string') return false;
    if (typeof Char !== 'function') return false;
    var width = (typeof widthOverride === 'number' && widthOverride > 0) ? widthOverride : frame.width;
    var height = (typeof heightOverride === 'number' && heightOverride > 0) ? heightOverride : frame.height;
    try { frame.clear(frame.attr); } catch (_clearErr) { }
    if (frame.__properties__) {
        frame.__properties__.data = [];
        frame.__position__.offset.x = 0;
        frame.__position__.offset.y = 0;
    }
    if (typeof frame.home === 'function') frame.home();

    var lines = contents.split(/\r\n|\n|\r/);
    var opts = options || {};
    var board = opts.board || null;
    if (board && typeof board.paletteAttr !== 'function' && typeof this.paletteAttr === 'function') {
        board.paletteAttr = this.paletteAttr;
    }
    var highlightQuotes = !!(opts.highlightQuotes && board && typeof board._quoteColorAttrFor === 'function');
    var attr = (typeof frame.attr === 'number') ? frame.attr : ((typeof BG_BLACK === 'number' ? BG_BLACK : 0) | (typeof LIGHTGRAY === 'number' ? LIGHTGRAY : 7));
    var bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
    var fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
    var hi = 0;
    var y = 0;
    var saved = { x: 0, y: 0 };
    var maxRow = -1;
    var wroteChar = false;

    function fgAttr(code) {
        switch (code) {
            case 30: return (typeof BLACK === 'number') ? BLACK : 0;
            case 31: return (typeof RED === 'number') ? RED : 4;
            case 32: return (typeof GREEN === 'number') ? GREEN : 2;
            case 33: return (typeof BROWN === 'number') ? BROWN : 6;
            case 34: return (typeof BLUE === 'number') ? BLUE : 1;
            case 35: return (typeof MAGENTA === 'number') ? MAGENTA : 5;
            case 36: return (typeof CYAN === 'number') ? CYAN : 3;
            case 37: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
            default: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
        }
    }

    function bgAttr(code) {
        switch (code) {
            case 40: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
            case 41: return (typeof BG_RED === 'number') ? BG_RED : 0;
            case 42: return (typeof BG_GREEN === 'number') ? BG_GREEN : 0;
            case 43: return (typeof BG_BROWN === 'number') ? BG_BROWN : 0;
            case 44: return (typeof BG_BLUE === 'number') ? BG_BLUE : 0;
            case 45: return (typeof BG_MAGENTA === 'number') ? BG_MAGENTA : 0;
            case 46: return (typeof BG_CYAN === 'number') ? BG_CYAN : 0;
            case 47: return (typeof BG_LIGHTGRAY === 'number') ? BG_LIGHTGRAY : 0;
            default: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
        }
    }

    while (lines.length > 0) {
        var line = lines.shift();
        var x = 0;
        var plainIndex = 0;
        var highlightState = null;
        var highlightMap = null;
        if (highlightQuotes) {
            highlightMap = {};
            var quotePattern = /(^|\s)([A-Za-z]{2})(>)/g;
            var quoteMatch;
            while ((quoteMatch = quotePattern.exec(line)) !== null) {
                var leadLen = quoteMatch[1] ? quoteMatch[1].length : 0;
                var token = (quoteMatch[2] || '').toUpperCase();
                if (!token) continue;
                var userStart = quoteMatch.index + leadLen;
                var userLen = quoteMatch[2].length;
                var caretStart = userStart + userLen;
                var userAttr = board._quoteColorAttrFor(token, 0, attr);
                var caretAttr = board._quoteColorAttrFor(token, 17, attr);
                if (typeof userAttr === 'number' && userLen > 0) highlightMap[userStart] = { length: userLen, attr: userAttr };
                if (typeof caretAttr === 'number') highlightMap[caretStart] = { length: 1, attr: caretAttr };
            }
        }
        if (frame.__properties__ && !frame.__properties__.data[y]) frame.__properties__.data[y] = [];
        while (line.length > 0) {
            var attrMatch = line.match(/^\x1b\[((?:[0-9]{1,3};?)*)([0-9]{0,3})m/);
            if (attrMatch !== null) {
                line = line.substr(attrMatch[0].length);
                var paramsStr = attrMatch[1];
                var lastParam = attrMatch[2];
                var params = [];
                if (paramsStr && paramsStr.length) params = paramsStr.split(';');
                if (lastParam && lastParam.length) params.push(lastParam);
                if (!params.length) params = ['0'];
                for (var pi = 0; pi < params.length; pi++) {
                    var codeStr = params[pi];
                    if (!codeStr.length) codeStr = '0';
                    var num = Number(codeStr);
                    if (num === 0) {
                        bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
                        fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
                        hi = 0;
                        continue;
                    }
                    if (num === 1) {
                        hi |= (typeof HIGH === 'number') ? HIGH : 0x08;
                        continue;
                    }
                    if (num === 2 || num === 21 || num === 22) {
                        hi &= ~((typeof HIGH === 'number') ? HIGH : 0x08);
                        continue;
                    }
                    if (num === 5) {
                        hi |= (typeof BLINK === 'number') ? BLINK : 0x80;
                        continue;
                    }
                    if (num === 25) {
                        hi &= ~((typeof BLINK === 'number') ? BLINK : 0x80);
                        continue;
                    }
                    if (num === 39) {
                        fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
                        continue;
                    }
                    if (num === 49) {
                        bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
                        continue;
                    }
                    if (num >= 40 && num <= 47) {
                        bg = bgAttr(num);
                        continue;
                    }
                    if (num >= 100 && num <= 107) {
                        bg = bgAttr(num - 60);
                        continue;
                    }
                    if (num >= 30 && num <= 37) {
                        fg = fgAttr(num);
                        continue;
                    }
                    if (num >= 90 && num <= 97) {
                        fg = fgAttr(num - 60);
                        hi |= (typeof HIGH === 'number') ? HIGH : 0x08;
                        continue;
                    }
                    if ((num === 38 || num === 48) && params.length > pi + 1) {
                        var mode = parseInt(params[pi + 1], 10);
                        if (mode === 5 && params.length > pi + 2) {
                            pi += 2;
                        } else if (mode === 2 && params.length > pi + 4) {
                            pi += 4;
                        }
                        continue;
                    }
                }
                attr = bg + fg + hi;
                continue;
            }

            var posMatch = line.match(/^\x1b\[(\d*);?(\d*)[Hf]/);
            if (posMatch !== null) {
                line = line.substr(posMatch.shift().length);
                if (posMatch.length === 0) {
                    x = 0; y = 0;
                } else {
                    if (posMatch[0]) y = Math.max(0, Number(posMatch.shift()) - 1);
                    if (posMatch[0]) x = Math.max(0, Number(posMatch.shift()) - 1);
                }
                continue;
            }

            var upMatch = line.match(/^\x1b\[(\d*)A/);
            if (upMatch !== null) {
                line = line.substr(upMatch.shift().length);
                var up = Number(upMatch.shift() || 1);
                y = Math.max(0, y - up);
                continue;
            }

            var downMatch = line.match(/^\x1b\[(\d*)B/);
            if (downMatch !== null) {
                line = line.substr(downMatch.shift().length);
                var down = Number(downMatch.shift() || 1);
                y += down;
                continue;
            }

            var rightMatch = line.match(/^\x1b\[(\d*)C/);
            if (rightMatch !== null) {
                line = line.substr(rightMatch.shift().length);
                var right = Number(rightMatch.shift() || 1);
                x += right;
                continue;
            }

            var leftMatch = line.match(/^\x1b\[(\d*)D/);
            if (leftMatch !== null) {
                line = line.substr(leftMatch.shift().length);
                var left = Number(leftMatch.shift() || 1);
                x = Math.max(0, x - left);
                continue;
            }

            var clearMatch = line.match(/^\x1b\[2J/);
            if (clearMatch !== null) {
                line = line.substr(clearMatch.shift().length);
                try { frame.clear(frame.attr); } catch (_ignoreClear) { }
                if (frame.__properties__) frame.__properties__.data = [];
                x = 0; y = 0;
                continue;
            }

            var saveMatch = line.match(/^\x1b\[s/);
            if (saveMatch !== null) {
                line = line.substr(saveMatch.shift().length);
                saved.x = x; saved.y = y;
                continue;
            }

            var restoreMatch = line.match(/^\x1b\[u/);
            if (restoreMatch !== null) {
                line = line.substr(restoreMatch.shift().length);
                x = saved.x || 0; y = saved.y || 0;
                continue;
            }

            var ch = line.charAt(0);
            line = line.substr(1);
            if (highlightState && highlightState.remaining <= 0) {
                highlightState = null;
            }
            if (highlightMap && highlightMap.hasOwnProperty(plainIndex)) {
                var entry = highlightMap[plainIndex];
                if (entry && typeof entry.attr === 'number' && entry.length > 0) {
                    highlightState = { remaining: entry.length, attr: entry.attr };
                }
            }
            if (y < 0) y = 0;
            if (x < 0) x = 0;
            if (x >= width) {
                x = 0; y += 1;
                if (frame.__properties__ && !frame.__properties__.data[y]) frame.__properties__.data[y] = [];
            }
            var baseAttr = attr;
            var writeAttr = baseAttr;
            if (highlightState && typeof highlightState.attr === 'number') writeAttr = highlightState.attr;
            if (frame.__properties__) {
                if (!frame.__properties__.data[y]) frame.__properties__.data[y] = [];
                frame.__properties__.data[y][x] = new Char(ch, writeAttr);
            }
            if (y > maxRow) maxRow = y;
            wroteChar = true;
            x++;
            if (highlightState) {
                highlightState.remaining--;
                if (highlightState.remaining <= 0) highlightState = null;
            }
            plainIndex++;
        }
        highlightState = null;
        y++;
    }

    var totalRows = wroteChar ? (maxRow + 1) : 0;
    frame.data_height = totalRows;
    if (frame.__properties__) frame.__properties__.data_height = totalRows;

    if (typeof frame.refresh === 'function') frame.refresh();
    try { frame.cycle(); } catch (_cycleErr) { }
    return true;
}
if (typeof Frame !== 'undefined' && typeof Frame.prototype.loadAnsiString !== 'function') {
    (function () {
        function ansiBgToAttr(code) {
            switch (code) {
                case 40: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
                case 41: return (typeof BG_RED === 'number') ? BG_RED : 0;
                case 42: return (typeof BG_GREEN === 'number') ? BG_GREEN : 0;
                case 43: return (typeof BG_BROWN === 'number') ? BG_BROWN : 0;
                case 44: return (typeof BG_BLUE === 'number') ? BG_BLUE : 0;
                case 45: return (typeof BG_MAGENTA === 'number') ? BG_MAGENTA : 0;
                case 46: return (typeof BG_CYAN === 'number') ? BG_CYAN : 0;
                case 47: return (typeof BG_LIGHTGRAY === 'number') ? BG_LIGHTGRAY : 0;
                default: return (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
            }
        }

        function ansiFgToAttr(code) {
            switch (code) {
                case 30: return (typeof BLACK === 'number') ? BLACK : 0;
                case 31: return (typeof RED === 'number') ? RED : 4;
                case 32: return (typeof GREEN === 'number') ? GREEN : 2;
                case 33: return (typeof BROWN === 'number') ? BROWN : 6;
                case 34: return (typeof BLUE === 'number') ? BLUE : 1;
                case 35: return (typeof MAGENTA === 'number') ? MAGENTA : 5;
                case 36: return (typeof CYAN === 'number') ? CYAN : 3;
                case 37: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
                default: return (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
            }
        }

        function parseAnsiIntoFrame(frame, contents, width) {
            if (!frame || typeof contents !== 'string') return false;
            if (typeof Char !== 'function') return false;
            width = (typeof width === 'number' && width > 0) ? width : frame.width;
            try { frame.clear(frame.attr); } catch (_clearErr) { }
            if (frame.__properties__) {
                frame.__properties__.data = [];
                frame.__position__.offset.x = 0;
                frame.__position__.offset.y = 0;
            }
            if (typeof frame.home === 'function') frame.home();

            var lines = contents.split(/\r\n|\n|\r/);
            var attr = (typeof frame.attr === 'number') ? frame.attr : ((typeof BG_BLACK === 'number' ? BG_BLACK : 0) | (typeof LIGHTGRAY === 'number' ? LIGHTGRAY : 7));
            var bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
            var fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
            var hi = 0;
            var y = 0;
            var saved = { x: 0, y: 0 };

            while (lines.length > 0) {
                var line = lines.shift();
                var x = 0;
                while (line.length > 0) {
                    var attrMatch = line.match(/^\x1b\[((?:[0-9]{1,3};?)*)([0-9]{0,3})m/);
                    if (attrMatch !== null) {
                        line = line.substr(attrMatch[0].length);
                        var paramsStr = attrMatch[1];
                        var lastParam = attrMatch[2];
                        var params = [];
                        if (paramsStr && paramsStr.length) params = paramsStr.split(';');
                        if (lastParam && lastParam.length) params.push(lastParam);
                        if (!params.length) params = ['0'];
                        for (var pi = 0; pi < params.length; pi++) {
                            var codeStr = params[pi];
                            if (!codeStr.length) codeStr = '0';
                            var num = Number(codeStr);
                            if (num === 0) {
                                bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
                                fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
                                hi = 0;
                                continue;
                            }
                            if (num === 1) {
                                hi |= (typeof HIGH === 'number') ? HIGH : 0x08;
                                continue;
                            }
                            if (num === 2 || num === 21 || num === 22) {
                                hi &= ~((typeof HIGH === 'number') ? HIGH : 0x08);
                                continue;
                            }
                            if (num === 5) {
                                hi |= (typeof BLINK === 'number') ? BLINK : 0x80;
                                continue;
                            }
                            if (num === 25) {
                                hi &= ~((typeof BLINK === 'number') ? BLINK : 0x80);
                                continue;
                            }
                            if (num === 39) {
                                fg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
                                continue;
                            }
                            if (num === 49) {
                                bg = (typeof BG_BLACK === 'number') ? BG_BLACK : 0;
                                continue;
                            }
                            if (num >= 40 && num <= 47) {
                                bg = ansiBgToAttr(num);
                                continue;
                            }
                            if (num >= 100 && num <= 107) {
                                bg = ansiBgToAttr(num - 60);
                                continue;
                            }
                            if (num >= 30 && num <= 37) {
                                fg = ansiFgToAttr(num);
                                continue;
                            }
                            if (num >= 90 && num <= 97) {
                                fg = ansiFgToAttr(num - 60);
                                hi |= (typeof HIGH === 'number') ? HIGH : 0x08;
                                continue;
                            }
                            if ((num === 38 || num === 48) && params.length > pi + 1) {
                                var mode = parseInt(params[pi + 1], 10);
                                if (mode === 5 && params.length > pi + 2) {
                                    pi += 2;
                                    continue;
                                }
                                if (mode === 2 && params.length > pi + 4) {
                                    pi += 4;
                                    continue;
                                }
                            }
                        }
                        attr = bg + fg + hi;
                        continue;
                    }

                    var posMatch = line.match(/^\x1b\[(\d*);?(\d*)[Hf]/);
                    if (posMatch !== null) {
                        line = line.substr(posMatch.shift().length);
                        if (posMatch.length === 0) {
                            x = 0; y = 0;
                        } else {
                            if (posMatch[0]) y = Math.max(0, Number(posMatch.shift()) - 1);
                            if (posMatch[0]) x = Math.max(0, Number(posMatch.shift()) - 1);
                        }
                        continue;
                    }

                    var upMatch = line.match(/^\x1b\[(\d*)A/);
                    if (upMatch !== null) {
                        line = line.substr(upMatch.shift().length);
                        var up = Number(upMatch.shift() || 1);
                        y = Math.max(0, y - up);
                        continue;
                    }
                    var downMatch = line.match(/^\x1b\[(\d*)B/);
                    if (downMatch !== null) {
                        line = line.substr(downMatch.shift().length);
                        var down = Number(downMatch.shift() || 1);
                        y += down;
                        continue;
                    }
                    var rightMatch = line.match(/^\x1b\[(\d*)C/);
                    if (rightMatch !== null) {
                        line = line.substr(rightMatch.shift().length);
                        var right = Number(rightMatch.shift() || 1);
                        x += right;
                        continue;
                    }
                    var leftMatch = line.match(/^\x1b\[(\d*)D/);
                    if (leftMatch !== null) {
                        line = line.substr(leftMatch.shift().length);
                        var left = Number(leftMatch.shift() || 1);
                        x = Math.max(0, x - left);
                        continue;
                    }

                    var clearMatch = line.match(/^\x1b\[2J/);
                    if (clearMatch !== null) {
                        line = line.substr(clearMatch.shift().length);
                        try { frame.clear(frame.attr); } catch (_ignoreClear) { }
                        if (frame.__properties__) frame.__properties__.data = [];
                        x = 0; y = 0;
                        continue;
                    }

                    var saveMatch = line.match(/^\x1b\[s/);
                    if (saveMatch !== null) {
                        line = line.substr(saveMatch.shift().length);
                        saved.x = x; saved.y = y;
                        continue;
                    }

                    var restoreMatch = line.match(/^\x1b\[u/);
                    if (restoreMatch !== null) {
                        line = line.substr(restoreMatch.shift().length);
                        x = saved.x || 0; y = saved.y || 0;
                        continue;
                    }

                    var ch = line.charAt(0);
                    line = line.substr(1);
                    if (y < 0) y = 0;
                    if (x < 0) x = 0;
                    if (x >= width) {
                        x = 0; y += 1;
                    }
                    if (frame.__properties__) {
                        if (!frame.__properties__.data[y]) frame.__properties__.data[y] = [];
                        frame.__properties__.data[y][x] = new Char(ch, attr);
                    }
                    x++;
                }
                y++;
            }
            if (typeof frame.refresh === 'function') frame.refresh();
            try { frame.cycle(); } catch (_cycleErr) { }
            return true;
        }

        Frame.prototype.loadAnsiString = function (contents, width, height) {
            return parseAnsiIntoFrame(this, contents, width);
        };
    })();
}

// Extend Frame with an in-memory ANSI loader when available. We avoid touching
// the core exec frame implementation by installing a helper locally.
// (Temporarily removed per instruction to rely on shipped implementation.)

function MessageBoard(opts) {
    opts = opts || {};
    this.blockScreenSaver = false;
    this.frameSet = null;
    this.overlay = null;
    // Modal-based notice replacements (legacy frame variant removed)
    this._readNoticeModal = null;
    this._transitionNoticeModal = null;
    // Lifecycle guards: _alive toggled true between enter() and final exit/cleanup.
    // _epoch increments on each (re)initialization so async callbacks can bail out
    // if they captured stale references (e.g. frame cycle timer firing after post editor).
    this._alive = true;
    this._epoch = 0;
    // Track the currently displayed full message header/body for reliable reply quoting
    this.currentMessageHeader = null;
    this.currentMessageBody = '';
    this.currentMessageRawBody = '';
    this.id = "message_board";
    this._threadPaletteLogged = false;
    this.registerColors({
        TITLE_FRAME: { BG: BG_BROWN, FG: WHITE },
        OUTPUT_FRAME: { BG: BG_BLACK, FG: LIGHTGRAY },
        INPUT_FRAME: { BG: BG_BROWN, FG: WHITE },
        READ_HEADER: { BG: BG_BLUE, FG: WHITE },
        THREAD_CONTROLS: { BG: BG_MAGENTA, FG: LIGHTGRAY },
        THREAD_LIST: { BG: BG_BLACK, FG: LIGHTGRAY },
        THREAD_SEARCH_BUTTON: { BG: BG_BLACK, FG: LIGHTGRAY },
        THREAD_SEARCH_BUTTON_FOCUS: { BG: LIGHTGRAY, FG: BLACK },
        THREAD_BACK_BUTTON: { BG: BG_RED, FG: WHITE },
        THREAD_BACK_BUTTON_FOCUS: { BG: BG_RED, FG: WHITE },
        THREAD_TOGGLE_BUTTON: { BG: BG_BLACK, FG: LIGHTGRAY },
        THREAD_TOGGLE_BUTTON_FOCUS: { BG: LIGHTGRAY, FG: BLACK },
        THREAD_STATUS_GROUP: { BG: BG_BLACK, FG: CYAN },
        THREAD_STATUS_SEPARATOR: { BG: BG_BLACK, FG: WHITE },
        THREAD_STATUS_SUB: { BG: BG_BLACK, FG: LIGHTCYAN }
    });
    this.parentFrame = opts.parentFrame || null;
    Subprogram.call(this, {
        id: 'message_board',
        name: 'message-board',
        parentFrame: opts.parentFrame,
        shell: opts.shell,
        timer: opts.timer
    });
    this._pendingHotspotDefs = [];
    try {
        this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'message-board', layerName: 'message-board', priority: 75 });
    } catch (_hotspotErr) {
        this.hotspots = null;
    }
    this._init();
}

extend(MessageBoard, Subprogram);

MessageBoard.prototype.enter = function (done) {
    var self = this;
    this._done = (typeof done === 'function') ? done : function () { };
    // Reset state before base enter so initial draw uses fresh data
    this._init(true);
    Subprogram.prototype.enter.call(this, function () { if (typeof done === 'function') done(); });
    if (this.autoCycle) {
        try { this.cycle(); } catch (e) { }
    }
};

MessageBoard.prototype._beginInlineSearchPrompt = function (code, returnView, searchScope) {
    if (!this.inputFrame) {
        this._ensureFrames();
        if (!this.inputFrame) return false;
    }
    this._navSearchActive = true;
    this._navSearchBuffer = '';
    this._navSearchCode = code;
    this._navSearchScope = searchScope || null;
    this._navSearchReturnView = returnView || this.view;
    this._searchReturnView = this._navSearchReturnView;
    this._navSearchPlaceholder = '[type to search, ENTER=run, ESC=cancel]';
    if (this.view === 'group' || this.view === 'sub') {
        var searchIndex = this._findMenuIndexByType('search');
        if (searchIndex !== -1) {
            this._navSearchPrevSelection = this.selection;
            this.selection = searchIndex;
            this._paintIconGrid();
        }
    }
    this._paintInlineSearchPrompt();
    return true;
};

MessageBoard.prototype._paintInlineSearchPrompt = function (message) {
    if (!this.inputFrame) return;
    var code = this._navSearchCode;
    var scope = this._navSearchScope;
    var targetName = '';

    // Determine search target display based on scope
    if (scope === 'all') {
        targetName = 'All Groups';
    } else if (scope === 'group') {
        var grpName = (msg_area && msg_area.grp_list && typeof this.curgrp === 'number' && msg_area.grp_list[this.curgrp]) ? msg_area.grp_list[this.curgrp].name : 'Current Group';
        targetName = grpName;
    } else {
        targetName = this._getSubNameByCode(code) || code || '';
    }

    var prompt = 'Search ' + (targetName ? targetName : '') + ': ';
    var buffer = (typeof message === 'string') ? message : this._navSearchBuffer;
    var isPlaceholder = false;
    if (!buffer || !buffer.length) {
        buffer = this._navSearchPlaceholder || '';
        isPlaceholder = true;
    }
    if (!isPlaceholder && this._navSearchActive) buffer = buffer + '_';
    try {
        this.inputFrame.clear(this.paletteAttr('INPUT_FRAME'));
        this.inputFrame.home();
        var text = prompt + buffer;
        if (text.length > this.inputFrame.width) text = text.substr(text.length - this.inputFrame.width);
        this.inputFrame.putmsg(text);
        this.inputFrame.cycle();
    } catch (e) { }
};

MessageBoard.prototype._endInlineSearchPrompt = function (statusMsg) {
    this._navSearchActive = false;
    this._navSearchBuffer = '';
    this._navSearchCode = null;
    this._navSearchScope = null;
    this._navSearchReturnView = null;
    this._navSearchPlaceholder = '';
    this._activeSearchModal = null;

    this._navSearchPrevSelection = -1;
    var hasStatus = (typeof statusMsg === 'string' && statusMsg.length);
    if (this.view === 'group' || this.view === 'sub') {
        var searchIndex = this._findMenuIndexByType('search');
        if (searchIndex !== -1) {
            this.selection = searchIndex;
            this._paintIconGrid();
        }
    }
    if (hasStatus) this._writeStatus(statusMsg);
};

MessageBoard.prototype._handleInlineSearchKey = function (key) {
    if (!this._navSearchActive) return true;
    if (key === null || typeof key === 'undefined') return false;
    if (key === KEY_ESC || key === '\x1b') {
        this._endInlineSearchPrompt('SEARCH cancelled');
        return false;
    }
    if (key === '\r' || key === '\n' || key === KEY_ENTER) {
        var term = (this._navSearchBuffer || '').trim();
        if (!term.length) {
            this._navSearchPlaceholder = '[enter search term]';
            this._paintInlineSearchPrompt();
            return false;
        }
        var code = this._navSearchCode;
        var scope = this._navSearchScope;
        var retView = this._navSearchReturnView || this.view;
        this._endInlineSearchPrompt();
        this._searchReturnView = retView;
        this._writeStatus('SEARCH: searching...');
        this._executeSearch(code, term, scope);
        return false;
    }
    if (key === KEY_BACKSPACE || key === KEY_DEL || key === '\b' || key === '\x7f') {
        if (this._navSearchBuffer && this._navSearchBuffer.length) {
            this._navSearchBuffer = this._navSearchBuffer.substr(0, this._navSearchBuffer.length - 1);
        } else {
            this._navSearchBuffer = '';
        }
        this._paintInlineSearchPrompt();
        return false;
    }
    if (typeof key === 'number') {
        if (key >= 32 && key <= 126) {
            this._navSearchBuffer += String.fromCharCode(key);
            this._paintInlineSearchPrompt();
        }
        return false;
    }
    if (typeof key === 'string' && key.length === 1 && key >= ' ') {
        this._navSearchBuffer += key;
        this._paintInlineSearchPrompt();
        return false;
    }
    // Swallow all other keys while search prompt active
    return false;
};

// Main loop (called externally by shell or could be invoked after enter)
MessageBoard.prototype.cycle = function () {
    if (!this.running) return;
    this._startFrameCycle();
};

MessageBoard.prototype._startFrameCycle = function () {
    this._pumpFrameCycle();
    if (!this.timer || typeof this.timer.addEvent !== 'function') return;
    if (this._frameCycleEvent) return;
    var self = this;
    this._frameCycleEvent = this.timer.addEvent(120, true, function () {
        if (!self.running) {
            self._cancelFrameCycle();
            return;
        }
        self._pumpFrameCycle();
    });
};

MessageBoard.prototype._pumpFrameCycle = function () {
    if (!this._alive) return; // guard after exit
    var currentEpoch = this._epoch;
    try { if (this.outputFrame && this._epoch === currentEpoch) this.outputFrame.cycle(); } catch (e) { }
    try { if (this.inputFrame && this._epoch === currentEpoch) this.inputFrame.cycle(); } catch (e) { }
    try { if (this.titleFrame && this._epoch === currentEpoch) this.titleFrame.cycle(); } catch (e) { }

};

MessageBoard.prototype._cancelFrameCycle = function () {
    if (!this._frameCycleEvent) return;
    try { this._frameCycleEvent.abort = true; } catch (e) { }
    this._frameCycleEvent = null;
};

MessageBoard.prototype._ensureFrames = function () {
    this._ensureHostFrame();
    if (this.frameSet) {
        this.frameSet.ensure();
        this._framesInitialized = true;
        return;
    }
    if (typeof MessageBoardUI !== 'undefined' && MessageBoardUI && MessageBoardUI.FrameSet) {
        var self = this;
        this.frameSet = new MessageBoardUI.FrameSet(this,
            function (namespace, key) { return self.paletteAttr(namespace, key); });
        this.frameSet.ensure();
        this._framesInitialized = true;
        return;
    }
    // Fallback to legacy behaviour if FrameSet unavailable
    if (this.outputFrame && this.outputFrame.is_open) return;
    var pf = this.hostFrame || this.rootFrame || null;
    var x = pf ? pf.x : 1;
    var y = pf ? pf.y : 1;
    var w = pf ? pf.width : console.screen_columns;
    var h = pf ? pf.height : console.screen_rows;
    this.titleFrame = new Frame(1, 1, w, 1, this.paletteAttr('TITLE_FRAME'), pf);
    this.outputFrame = new Frame(x, 2, w, h - 2, this.paletteAttr('OUTPUT_FRAME'), pf);
    this.setBackgroundFrame(this.outputFrame);
    this.inputFrame = new Frame(x, y + h - 1, w, 1, this.paletteAttr('INPUT_FRAME'), pf);
    this.titleFrame.center("Message Boards")
    this.titleFrame.open();
    this.outputFrame.open();
    this.inputFrame.open();
    this.headerFrame.open();
    if (typeof ICSH_PERF_TAG !== 'undefined') {
        try { this.outputFrame.__perfTag = 'mb-output'; } catch (_pt1) { }
        try { this.inputFrame.__perfTag = 'mb-input'; } catch (_pt2) { }
    }
    this._writeStatus('Message Boards: ' + this.view);
    this._framesInitialized = true;
};

MessageBoard.prototype._ensureViewControllers = function () {
    if (this._viewControllers && this._viewControllersOwner === this) return this._viewControllers;
    var map = {};
    if (typeof MessageBoardViews !== 'undefined' && MessageBoardViews) {
        try {
            if (typeof MessageBoardViews.createViewMap === 'function') {
                map = MessageBoardViews.createViewMap(this) || {};
            } else if (typeof MessageBoardViews.createLegacyViewMap === 'function') {
                map = MessageBoardViews.createLegacyViewMap(this) || {};
            }
        } catch (_createErr) { map = {}; }
    }
    this._viewControllers = map;
    this._viewControllersOwner = this;
    return this._viewControllers;
};

MessageBoard.prototype._getViewController = function (viewId) {
    if (!viewId) return null;
    var map = this._ensureViewControllers();
    if (!map) return null;
    if (map.hasOwnProperty(viewId)) return map[viewId];
    return null;
};

MessageBoard.prototype._deactivateActiveViewController = function (context) {
    if (!this._activeViewController) return;
    try {
        if (typeof this._activeViewController.exit === 'function') {
            this._activeViewController.exit(context || {});
        }
    } catch (_exitErr) { }
    this._activeViewController = null;
    this._activeViewId = null;
};

MessageBoard.prototype._activateViewController = function (viewId, args) {
    var controller = this._getViewController(viewId);
    if (!controller) return null;
    if (this._activeViewController && this._activeViewController !== controller) {
        try {
            if (typeof this._activeViewController.exit === 'function') {
                this._activeViewController.exit({ next: viewId, args: args });
            }
        } catch (_switchErr) { }
    }
    if (this._activeViewController !== controller) {
        this._activeViewController = controller;
        this._activeViewId = controller.id || viewId;
    }
    return controller;
};

MessageBoard.prototype.draw = function () {
    if (this.overlay && this.overlay.isActive()) {
        this.overlay.refresh();
        return;
    }
    this._renderCurrentView(this.view);
};

MessageBoard.prototype._drawInput = function () {
};

// Guarded exit override (ensures done callback only fires once through base implementation)
MessageBoard.prototype.exit = function () {
    if (!this.running) return; // already exited
    this._cancelFrameCycle();
    this._releaseHotspots();
    this._alive = false;
    try { this._epoch++; } catch (_eEpoch2) { this._epoch = (this._epoch || 0) + 1; }
    Subprogram.prototype.exit.call(this);
    this._cleanup();
};

MessageBoard.prototype._handleKey = function (key) {
    if (this.overlay && this.overlay.isActive()) {
        if (typeof dbug === 'function') { try { dbug('MB:_handleKey blocked by overlay key=' + JSON.stringify(key), 'messageboard'); } catch (_e1) { } }
        return false;
    }
    if (this._navigationLock) {
        if (typeof dbug === 'function') { try { dbug('MB:_handleKey navigationLock active key=' + JSON.stringify(key), 'messageboard'); } catch (_e2) { } }
        return true;
    }
    if (!key) {
        if (typeof dbug === 'function') { try { dbug('MB:_handleKey empty/undefined key ignored', 'messageboard'); } catch (_e3) { } }
        return true;
    }
    // Diagnostics
    if (typeof dbug === 'function') { try { dbug('MB:_handleKey view=' + this.view + ' key=' + JSON.stringify(key), 'messageboard'); } catch (_eDbgHK) { } }
    // Auto-correct view if we have read frames but view flag not set
    if (this.view !== 'read' && this.lastReadMsg && (this._readBodyFrame || this._readBodyCanvas || this._readHeaderFrame)) {
        if (typeof dbug === 'function') { try { dbug('MB: correcting view to read (was ' + this.view + ')', 'messageboard'); } catch (_eDbgCV) { } }
        this.view = 'read';
    }
    if (this.view === 'read' && this._consumeReadNoticeKey && this._consumeReadNoticeKey(key)) {
        if (typeof dbug === 'function') { try { dbug('MB:_handleKey consumed by readNotice key=' + JSON.stringify(key), 'messageboard'); } catch (_e4) { } }
        return true;
    }
    if (this._navSearchActive) {
        if (typeof dbug === 'function') { try { dbug('MB:_handleKey routing to inline search key=' + JSON.stringify(key), 'messageboard'); } catch (_e5) { } }
        return this._handleInlineSearchKey(key);
    }
    // ESC now routes to first special cell (Quit or Groups) instead of unconditional exit
    if (key === '\x1b') {
        if (this.view === 'group') {
            if (this.items.length && this.items[0].type === 'quit') {
                this.selection = 0; // highlight quit
                this.exit();
                return false;
            }
            // Fallback if special not present
            this.exit();
            return false;
        } else if (this.view === 'sub') {
            if (this.items.length && this.items[0].type === 'groups') {
                this.selection = 0; // highlight groups pseudo-item
            }
            this._renderGroupView();
            return false;
        } else if (this.view === 'threads') {
            this._renderSubView(this.curgrp); return false;
        } else if (this.view === 'flat') {
            this._renderSubView(this.curgrp); return false;
        } else if (this.view === 'read') {
            var targetView = this._readReturnView || 'sub';
            var anchor = this._readReturnAnchor || (this.lastReadMsg && this.lastReadMsg.number ? this.lastReadMsg.number : null);
            this._readReturnView = null;
            this._readReturnAnchor = null;
            if (targetView === 'flat') {
                if (this._readThreadContext && typeof this._completeThreadRead === 'function') {
                    if (this._completeThreadRead()) return false;
                }
                this._renderFlatView({ anchorNumber: anchor });
            } else if (targetView === 'threads') {
                this._readThreadContext = null;
                this._renderThreadsView(this.cursub);
            } else if (targetView === 'search') {
                this._readThreadContext = null;
                this._exitSearchResults();
            } else {
                this._readThreadContext = null;
                this._renderSubView(this.curgrp);
            }
            return false;
        } else if (this.view === 'search') {
            this._exitSearchResults();
            return false;
        } else if (this.view === 'post') {
            if (this.lastReadMsg) {
                this._renderReadView(this.lastReadMsg);
            } else {
                this._renderSubView(this.curgrp);
            }
            return false;
        } else {
            this.exit(); return false;
        }
    }
    if (this.view === 'threads' && (key === '/' || key === 's' || key === 'S')) {
        this._promptSearch(this.cursub || this._lastActiveSubCode || null, 'threads');
        return false;
    }
    // Hotspot key interception (0-9 then A-Z)
    if (this._hotspotMap && this._hotspotMap.hasOwnProperty(key)) {
        var idx = this._hotspotMap[key];
        if (typeof idx === 'string' && idx.indexOf('search-result:') === 0) {
            var rowIndex = parseInt(idx.substr('search-result:'.length), 10);
            if (!isNaN(rowIndex)) {
                this._searchSelection = Math.max(0, Math.min(rowIndex, (this._searchResults || []).length - 1));
                this._handleSearchKey('\r');
            }
            return false;
        }
        if (idx === 'threads-search') {
            var searchReturn = (this.view === 'flat') ? 'flat' : 'threads';
            this._promptSearch(this.cursub || this._lastActiveSubCode || null, searchReturn);
            return false;
        }
        if (idx === 'threads-back') {
            return this._handleKey('\x1b');
        }
        if (idx === 'threads-toggle') {
            this._toggleThreadFlatView();
            return false;
        }
        if (idx === 'read-group-icon') {
            this._renderSubView(this.curgrp);
            return false;
        }
        if (idx === 'read-sub-icon') {
            var targetSub = this.cursub || this._lastActiveSubCode || this._cachedSubCode || null;
            if (targetSub) this._renderFlatView({ subCode: targetSub });
            else this._renderFlatView();
            return false;
        }
        if (typeof idx === 'number') {
            if (this.view === 'group' || this.view === 'sub') {
                this.selection = idx;
                if (this.view === 'group') {
                    var it = this.items[this.selection];
                    if (it) {
                        if (it.action && typeof it.action === 'function') {
                            it.action();
                            return false;
                        }
                        if (typeof it.groupIndex !== 'undefined') {
                            // Dissolve animation on group selection
                            try {
                                if (this._iconCells && typeof this.scrollOffset !== 'undefined') {
                                    var localIdx = this.selection - this.scrollOffset;
                                    if (localIdx >= 0 && localIdx < this._iconCells.length && this._iconCells[localIdx] && this._iconCells[localIdx].icon) {
                                        var cell = this._iconCells[localIdx];
                                        cell.icon.transparent = false;
                                        var dissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
                                        try {
                                            dissolve(cell.icon, dissolveColor, 5);
                                        } catch (e) {
                                            // dissolve optional
                                        }
                                    }
                                }
                            } catch (e) {
                                // silence errors
                            }
                            this._renderSubView(it.groupIndex);
                            return false;
                        }
                    }
                } else if (this.view === 'sub') {
                    var it2 = this.items[this.selection];
                    if (it2) {
                        if (it2.action && typeof it2.action === 'function') {
                            it2.action();
                            return false;
                        }
                        if (it2.subCode) {
                            // Dissolve animation on sub selection
                            try {
                                if (this._iconCells && typeof this.scrollOffset !== 'undefined') {
                                    var localIdx = this.selection - this.scrollOffset;
                                    if (localIdx >= 0 && localIdx < this._iconCells.length && this._iconCells[localIdx] && this._iconCells[localIdx].icon) {
                                        var cell = this._iconCells[localIdx];
                                        cell.icon.transparent = false;
                                        var dissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
                                        try {
                                            dissolve(cell.icon, dissolveColor, 5);
                                        } catch (e) {
                                            // dissolve optional
                                        }
                                    }
                                }
                            } catch (e) {
                                // silence errors
                            }
                            var hasUnread = this._subHasUnread ? this._subHasUnread(it2.subCode, it2._messageCount) : ((it2._unreadCount || 0) > 0);
                            if (hasUnread) this._openSubReader(it2.subCode);
                            else this._renderFlatView({ subCode: it2.subCode });
                            return false;
                        }
                    }
                }
            } else if (this.view === 'threads' && (!this.threadTree || !this.threadNodeIndex || !this.threadNodeIndex.length)) {
                var headers = this._getThreadViewHeaders ? this._getThreadViewHeaders() : this.threadHeaders;
                if (!headers || !headers.length) return true;
                this.threadSelection = Math.max(0, Math.min(idx, headers.length - 1));
                this.threadScrollOffset = Math.max(0, Math.min(this.threadScrollOffset, this.threadSelection));
                if (typeof this._paintThreadList === 'function') this._paintThreadList();
                var listHdr = headers[this.threadSelection];
                if (listHdr) {
                    if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                    this._readReturnView = 'threads';
                    this._readReturnAnchor = listHdr.number || null;
                    if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(listHdr);
                    this._renderReadView(listHdr);
                    return false;
                }
                return true;
            } else if (this.view === 'threads' && this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
                // Map hotspot selection to thread tree selection
                this.threadTreeSelection = Math.min(idx, this.threadNodeIndex.length - 1);
                var node = this.threadNodeIndex[this.threadTreeSelection];
                if (node) {
                    if (node.__isTree) {
                        // Toggle expand/collapse
                        if (node.status & node.__flags__.CLOSED) node.open(); else node.close();
                        this._paintThreadTree();
                    } else if (node.__msgHeader) {
                        // Open read view directly for leaf
                        if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                        this._readReturnView = 'threads';
                        this._readReturnAnchor = node.__msgHeader.number || null;
                        if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(node.__msgHeader);
                        this._renderReadView(node.__msgHeader);
                        return false; // consumed navigation
                    } else {
                        this._paintThreadTree();
                    }
                } else {
                    this._paintThreadTree();
                }
            } else if (this.view === 'flat') {
                if (!this.flatHeaders || !this.flatHeaders.length) return true;
                this.flatSelection = Math.max(0, Math.min(idx, this.flatHeaders.length - 1));
                this.flatScrollOffset = Math.max(0, Math.min(this.flatScrollOffset, this.flatSelection));
                this._paintFlatList();
                var flatHdr = this.flatHeaders[this.flatSelection];
                if (flatHdr) {
                    if (typeof this._setReadMode === 'function') this._setReadMode('flat');
                    this._readThreadContext = null;
                    this._readReturnView = 'flat';
                    this._readReturnAnchor = flatHdr.number || null;
                    this._renderReadView(flatHdr);
                    return false;
                }
            }
            return true;
        }
    }
    var controller = this._getViewController(this.view);
    dbug("_processKeyInput: view=" + this.view + " controller=" + (controller ? controller.constructor.name : 'null') + " hasHandleKey=" + (controller && typeof controller.handleKey === 'function'), "view");
    if (controller && typeof controller.handleKey === 'function') {
        try {
            dbug("_processKeyInput: calling controller.handleKey for view=" + this.view + " handleKey=" + (typeof controller.handleKey), "view");
            var handled = controller.handleKey.call(controller, key);
            dbug("_processKeyInput: after handleKey call, handled=" + handled, "view");
            if (typeof handled !== 'undefined') return handled;
        } catch (keyHandleErr) {
            dbug("_processKeyInput: EXCEPTION in handleKey: " + keyHandleErr, "view");
        }
    }
    switch (this.view) {
        case 'group': return this._handleGroupKey(key);
        case 'sub': return this._handleSubKey(key);
        case 'threads':
            return true;
        case 'search': return this._handleSearchKey(key);
        case 'read': return this._handleReadKey(key);
        default: return true;
    }
};

MessageBoard.prototype._cleanup = function () {
    this._endViewTransition();
    this._deactivateActiveViewController({ reason: 'cleanup' });
    this._viewControllersOwner = null;
    this._viewControllers = null;
    this._hideTransitionNotice({ skipRepaint: true });
    try { this._destroyReadFrames && this._destroyReadFrames(); } catch (e) { }
    this._destroyThreadUI();
    this._hideReadNotice({ skipRepaint: true });
    this._cancelFrameCycle();
    try { this._clearIconGrid && this._clearIconGrid(); } catch (e) { }
    if (this.frameSet && typeof this.frameSet.close === 'function') {
        this.frameSet.close();
    } else {
        try { if (this.outputFrame) this.outputFrame.close(); } catch (e) { }
        try { if (this.inputFrame) this.inputFrame.close(); } catch (e) { }
        try { if (this.titleFrame) this.titleFrame.close(); } catch (e) { }
        this.outputFrame = null;
        this.inputFrame = null;
        this.titleFrame = null;
    }
    this._resetState();
};

MessageBoard.prototype._resetState = function () {
    this._endViewTransition();
    this._hideTransitionNotice({ skipRepaint: true });
    this.outputFrame = null;
    this.inputFrame = null;
    this.titleFrame = null;
    this.view = 'group';
    this._activeViewController = null;
    this._activeViewId = null;
    this._navigationLock = false;
    this.selection = 0; this.scrollOffset = 0;
    this.items = [];
    this._hotspotMap = {};
    this._pendingHotspotDefs = [];
    this.threadHeaders = [];
    this.threadSelection = 0; this.threadScrollOffset = 0;
    this.threadTree = null; this.threadNodeIndex = []; this.threadTreeSelection = 0;
    this._subIndex = null;
    this._threadSearchFrame = null;
    this._threadContentFrame = null;
    this._threadControlsFrame = null;
    this._threadListFrame = null;
    this._threadSearchButton = null;
    this._threadBackButton = null;
    this._threadToggleButton = null;
    this.flatHeaders = [];
    this.flatSelection = 0;
    this.flatScrollOffset = 0;
    this.flatSortOrder = 'asc';
    this._flatHeadersSub = null;
    this._flatHeadersSort = null;
    this._threadSortOrder = 'asc';
    this._threadViewHeaders = null;
    this._threadViewHeadersSource = null;
    this._threadViewHeadersLength = 0;
    this._threadSortOrder = 'asc';
    this._threadViewHeaders = null;
    this._threadViewHeadersSource = null;
    this._threadViewHeadersLength = 0;
    this._threadSortOrder = 'asc';
    this._threadViewHeaders = null;
    this._threadViewHeadersSource = null;
    this._threadViewHeadersLength = 0;
    this._lastActiveSubCode = null;
    this._searchResults = [];
    this._searchSelection = 0;
    this._searchScrollOffset = 0;
    this._searchQuery = '';
    this._searchReturnView = null;
    this._navSearchActive = false;
    this._navSearchBuffer = '';
    this._navSearchCode = null;
    this._navSearchReturnView = null;
    this._navSearchPlaceholder = '';
    this._navSearchPrevSelection = -1;
    if (this._activeSearchModal && typeof this._activeSearchModal.close === 'function') {
        try { this._activeSearchModal.close(); } catch (_eCloseModal) { }
    }
    this._activeSearchModal = null;
    this._readReturnView = null;
    this._readReturnAnchor = null;
    this._readThreadContext = null;
    this._readMode = null;
    this._fullHeaders = {};
    this._threadSequenceCache = {};
    this._cachedSubCode = null;
    this._threadHeadersCache = {};
    this._readScroll = 0;
    this._readGroupIconFrame = null;
    this._readGroupIconHotspotKey = '!';
    this._readSubIconFrame = null;
    this._readSubIconHotspotKey = '@';
    this._scanInProgress = false;
    this._lastScanTimestamp = 0;
    this._lastScanTimestamp = 0;
    this._readBodyText = '';
    this._readBodyLineCache = null;
    this._readBodyLineCacheWidth = 0;
    this._frameCycleEvent = null;
    // Legacy frame-based notice properties removed; using Modal-only path
    this._readNoticeModal = null; // spinner modal instance
    this._readNoticeEvent = null; // timer/callback reference for auto-hide
    this._readNoticeActive = false;
    this._subUnreadCounts = {};
    this._readMessageMetadata = null;
    this._transitionNoticeModal = null; // spinner modal instance
    this._transitionNoticeActive = false;
};

MessageBoard.prototype._releaseHotspots = function () {
    this._hotspotMap = {};
    this._pendingHotspotDefs = [];
    if (this.hotspots && typeof this.hotspots.clear === 'function') this.hotspots.clear();
    else if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
};

MessageBoard.prototype._addHotspotArea = function (key, swallow, minX, maxX, startY, endY, opts) {
    if (key === undefined || key === null) return;
    if (typeof minX !== 'number' || typeof maxX !== 'number' || typeof startY !== 'number') return;
    if (typeof endY !== 'number') endY = startY;
    if (maxX < minX) {
        var tmpX = minX; minX = maxX; maxX = tmpX;
    }
    if (endY < startY) {
        var tmpY = startY; startY = endY; endY = tmpY;
    }
    if (!this._pendingHotspotDefs) this._pendingHotspotDefs = [];
    this._pendingHotspotDefs.push({
        key: key,
        x: minX,
        y: startY,
        width: Math.max(1, Math.floor(maxX - minX + 1)),
        height: Math.max(1, Math.floor(endY - startY + 1)),
        swallow: !!swallow,
        owner: (opts && opts.owner) || 'message-board',
        data: opts && opts.data || null
    });
};

MessageBoard.prototype._applyPendingHotspots = function () {
    if (!this._pendingHotspotDefs) this._pendingHotspotDefs = [];
    if (this.hotspots && typeof this.hotspots.set === 'function') {
        this.hotspots.set(this._pendingHotspotDefs);
    } else if (typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
        // Fallback if helper unavailable
        for (var i = 0; i < this._pendingHotspotDefs.length; i++) {
            var def = this._pendingHotspotDefs[i];
            if (!def) continue;
            var key = def.key;
            var swallow = !!def.swallow;
            var startX = def.x;
            var startY = def.y;
            var endX = startX + Math.max(1, def.width || 1) - 1;
            var endY = startY + Math.max(1, def.height || 1) - 1;
            for (var y = startY; y <= endY; y++) {
                try { console.add_hotspot(key, swallow, startX, endX, y); } catch (_) { }
            }
        }
    }
};

MessageBoard.prototype._init = function (reentry) {
    this._ensureHostFrame();
    // New lifecycle instance: bump epoch so any stale async callbacks can bail.
    try { this._epoch++; } catch (_eEpoch) { this._epoch = (this._epoch || 0) + 1; }
    this._alive = true;
    if (!this.frameSet && typeof MessageBoardUI !== 'undefined' && MessageBoardUI && MessageBoardUI.FrameSet) {
        var self = this;
        this.frameSet = new MessageBoardUI.FrameSet(this, function (namespace, key) { return self.paletteAttr(namespace, key); });
    }
    if (!this.overlay && typeof MessageBoardUI !== 'undefined' && MessageBoardUI && MessageBoardUI.TransitionOverlay) {
        this.overlay = new MessageBoardUI.TransitionOverlay(this);
    }
    this._endViewTransition();
    if (reentry) this._cancelFrameCycle();
    this._hideReadNotice({ skipRepaint: true });
    this.outputFrame = null;
    this.inputFrame = null;
    this._navigationLock = false;
    this.cursub = bbs.cursub_code;
    this.curgrp = bbs.curgrp;
    this.view = 'group';
    this.lastReadMsg = 0;
    this.msgList = [];
    this.selection = 0; this.scrollOffset = 0; this.items = [];
    this.grid = null; this.iconShellUtil = null; this.perPage = 0;
    this.hotspotsEnabled = false; this._hotspotMap = {};
    this._pendingHotspotDefs = [];
    this.threadHeaders = []; this.threadSelection = 0; this.threadScrollOffset = 0;
    this.threadTree = null; this.threadNodeIndex = []; this.threadTreeSelection = 0; this._threadFrame = null;
    this._iconCells = [];
    this._subIndex = null;
    this._threadSearchFrame = null;
    this._threadContentFrame = null;
    this._threadControlsFrame = null;
    this._threadListFrame = null;
    this._threadSearchButton = null;
    this._threadBackButton = null;
    this.flatHeaders = [];
    this.flatSelection = 0;
    this.flatScrollOffset = 0;
    this.flatSortOrder = 'asc';
    this._flatHeadersSub = null;
    this._flatHeadersSort = null;
    this._lastActiveSubCode = null;
    this._searchResults = [];
    this._searchSelection = 0;
    this._searchScrollOffset = 0;
    this._searchQuery = '';
    this._searchReturnView = null;
    this._navSearchActive = false;
    this._navSearchBuffer = '';
    this._navSearchCode = null;
    this._navSearchScope = null;
    this._navSearchReturnView = null;
    this._navSearchPlaceholder = '';
    this._readReturnView = null;
    this._readReturnAnchor = null;
    this._readThreadContext = null;
    this._fullHeaders = {};
    this._threadSequenceCache = {};
    this._cachedSubCode = null;
    this._threadHeadersCache = {};
    this._subMessageCounts = {};
    this._subUnreadCounts = {};
    // Legacy notice frame properties removed; state now tracked via _readNoticeModal/_transitionNoticeModal
    this._readNoticeEvent = null;
    this._readNoticeActive = false;
    this._transitionNoticeActive = false;
    this._setReadBodyText('');
    this._readScroll = 0;
    this._readGroupIconFrame = null;
    this._readGroupIconHotspotKey = '!';
    this._readSubIconFrame = null;
    this._readSubIconHotspotKey = '@';
    this._scanInProgress = false;
    this._lastScanTimestamp = 0;
    this._lastScanTimestamp = 0;
    this._readBodyCanvas = null;
    this._readBodyTotalLines = 0;
    this._readBodyHasAnsi = false;
    this.currentMessageHeader = null;
    this.currentMessageBody = '';
    this.currentMessageRawBody = '';
    // Build comprehensive hotspot character set (single-key tokens only)
    this._buildHotspotCharSet();
    // Default to no artificial cap; hotspot mapping handles visible rows only
    this.threadHeaderLimit = 0;
    if (reentry) this._deactivateActiveViewController({ reason: 'reinit' });
    this._viewControllersOwner = null;
    this._viewControllers = null;
    this._ensureViewControllers();
    if (reentry) this._releaseHotspots();
};

MessageBoard.prototype._buildHotspotCharSet = function () {
    // Order preference: digits, uppercase, lowercase, selected punctuation, then remaining safe ASCII
    var used = {};
    function push(arr, ch) { if (!used[ch]) { arr.push(ch); used[ch] = true; } }
    var chars = [];
    var digits = '0123456789'; for (var i = 0; i < digits.length; i++) push(chars, digits[i]);
    var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; for (i = 0; i < upper.length; i++) push(chars, upper[i]);
    var lower = 'abcdefghijklmnopqrstuvwxyz'; for (i = 0; i < lower.length; i++) push(chars, lower[i]);
    // Punctuation set (exclude ESC, control chars, space, DEL). Avoid characters likely to conflict with terminal sequences: '[' '\' ']' '^' '_' '`' maybe okay but include; skip '\x1b'
    var punct = "~!@#$%^&*()-_=+[{]}|;:'\",<.>?"; // backslash escaped
    for (i = 0; i < punct.length; i++) push(chars, punct[i]);
    // Optionally add control-key markers? We'll skip non-printable for safety.
    this._hotspotChars = chars; // potentially >90 chars
};

MessageBoard.prototype._changeSub = function (sub) {
    this.cursub = sub;
}

MessageBoard.prototype._changeGroup = function (group) {
    this.curgrp = group;
}

MessageBoard.prototype._renderCurrentView = function (view) {
    if (!view) view = this.view || 'group';

    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var controller = this._activateViewController(view, args);
    if (controller && typeof controller.enter === 'function') {
        this._navigationLock = true;
        try {
            return controller.enter.apply(controller, args);
        } finally {
            this._navigationLock = false;
        }
    }
    return undefined;
};

MessageBoard.prototype._renderThreadsView = function () {
    var controller = this._getViewController('threads');
    if (controller && typeof controller.enter === 'function') {
        this._readThreadContext = null;
        return controller.enter.apply(controller, arguments);
    }
    return undefined;
};

MessageBoard.prototype._renderTitleFrame = function () {
    if (this.titleFrame) {
        this.titleFrame.clear();
        var viewLabel = (this.view || 'group').toUpperCase();
        if (this.view === 'read') {
            var msgNum = (this.lastReadMsg && typeof this.lastReadMsg.number === 'number') ? (' #' + this.lastReadMsg.number) : '';
            var ctx = this._readThreadContext;
            if (ctx && ctx.numbers) {
                var total = ctx.numbers.length;
                var idx = -1;
                if (typeof ctx.currentNumber === 'number') {
                    if (ctx.numberIndexMap && typeof ctx.numberIndexMap[ctx.currentNumber] === 'number') idx = ctx.numberIndexMap[ctx.currentNumber];
                    if (idx === -1) idx = ctx.numbers.indexOf(ctx.currentNumber);
                }
                var label = (this.lastReadMsg && this.lastReadMsg.subject) ? this.lastReadMsg.subject : '(thread)';
                if (idx >= 0) viewLabel = 'THREAD ' + (idx + 1) + '/' + total + ' - ' + label + msgNum;
                else viewLabel = 'THREAD (' + total + ' messages) - ' + label + msgNum;
            } else {
                viewLabel = 'READING IN ORDER' + msgNum;
            }
        }
        this.titleFrame.center('Message Boards - ' + viewLabel);
        this.titleFrame.cycle();
    }
};

MessageBoard.prototype._openSubReader = function (subCode, options) {
    options = options || {};
    var candidateCode = subCode || null;
    if (!candidateCode && this.items && typeof this.selection === 'number') {
        var currentItem = this.items[this.selection];
        if (currentItem && currentItem.subCode) candidateCode = currentItem.subCode;
    }
    if (!candidateCode) candidateCode = this.cursub || this._lastActiveSubCode || (bbs && bbs.cursub_code) || null;
    if (!candidateCode) return false;

    var resolved = this._syncSubState ? this._syncSubState(candidateCode) : { code: candidateCode };
    var code = (resolved && resolved.code) ? resolved.code : candidateCode;
    if (!code) return false;

    this._lastActiveSubCode = code;

    var subName = this._getSubNameByCode ? this._getSubNameByCode(code) : code;
    var mb = new MsgBase(code);
    if (!mb.open()) {
        this._writeStatus('READ: Unable to open ' + subName);
        return false;
    }

    var header = null;
    var chosenNumber = null;
    try {
        var first = (typeof mb.first_msg === 'number' && mb.first_msg > 0) ? mb.first_msg : 1;
        var last = (typeof mb.last_msg === 'number' && mb.last_msg >= first) ? mb.last_msg : 0;
        if (!last || last < first) {
            this._writeStatus('READ: No messages in ' + subName);
            return false;
        }

        var pointerStats = this._getSubPointers ? this._getSubPointers(code) : { pointer: 0 };
        var pointer = pointerStats && typeof pointerStats.pointer === 'number' ? pointerStats.pointer : 0;

        var candidateList = [];
        function addCandidate(num) {
            if (typeof num !== 'number' || !isFinite(num)) return;
            var value = Math.floor(num);
            if (value < first || value > last) return;
            if (candidateList.indexOf(value) === -1) candidateList.push(value);
        }

        addCandidate(options && typeof options.number === 'number' ? options.number : null);

        var firstUnread = pointer + 1;
        if (firstUnread < first) firstUnread = first;
        if (pointer < last) addCandidate(firstUnread);

        if (pointer >= first) addCandidate(pointer);

        if (options.preferNewest || firstUnread > last) addCandidate(last);

        addCandidate(last);
        addCandidate(first);

        for (var ui = 0; ui < candidateList.length; ui++) {
            var candidate = candidateList[ui];
            if (this._fullHeaders && this._fullHeaders[candidate]) {
                header = this._fullHeaders[candidate];
                chosenNumber = candidate;
                break;
            }
            try {
                header = mb.get_msg_header(false, candidate, true);
            } catch (_hdrErr) {
                header = null;
            }
            if (header) {
                chosenNumber = candidate;
                break;
            }
        }

        if (!header) {
            this._writeStatus('READ: Unable to locate a message in ' + subName);
            return false;
        }

        if (typeof header.number !== 'number') header.number = chosenNumber;
        if (!header.sub) header.sub = code;
        if (typeof this._storeFullHeader === 'function') this._storeFullHeader(header);
    } finally {
        try { mb.close(); } catch (_closeErr) { }
    }

    if (typeof this._destroyThreadUI === 'function') {
        try { this._destroyThreadUI(); } catch (_dtErr) { }
    }
    if (typeof this._releaseHotspots === 'function') {
        try { this._releaseHotspots(); } catch (_rhErr) { }
    }
    if (typeof this._clearIconGrid === 'function') {
        try { this._clearIconGrid(); } catch (_cgErr) { }
    }

    var returnView = (options && options.returnView) ? options.returnView : 'flat';
    this._readReturnView = returnView;
    this._readReturnAnchor = (header && typeof header.number === 'number') ? header.number : null;
    if (typeof this._setReadMode === 'function') this._setReadMode(returnView === 'flat' ? 'flat' : 'thread');
    if (returnView === 'flat') this._readThreadContext = null;

    this._renderReadView(header);
    if (typeof this._ensureReadThreadData === 'function') this._ensureReadThreadData(true);
    return true;
};


MessageBoard.prototype._subHasUnread = function (code, totalHint) {
    if (!code) return false;
    var stats = this._getSubPointers ? this._getSubPointers(code) : { pointer: 0, total: 0 };
    var pointer = stats && typeof stats.pointer === 'number' ? stats.pointer : 0;
    var range = this._getSubMessageRange ? this._getSubMessageRange(code) : { last: 0 };
    var total = (typeof totalHint === 'number' && totalHint > range.last) ? totalHint : range.last;
    if (!total) total = stats && typeof stats.total === 'number' ? stats.total : 0;
    if (!total) return false;
    return pointer < total;
};

MessageBoard.prototype._getSubMessageRange = function (code) {
    var first = 1;
    var last = 0;
    if (!code || typeof MsgBase !== 'function') return { first: first, last: last };
    var mb = new MsgBase(code);
    if (mb.open()) {
        try {
            if (typeof mb.first_msg === 'number' && mb.first_msg > 0) first = mb.first_msg;
            if (typeof mb.last_msg === 'number' && mb.last_msg >= first) last = mb.last_msg;
        } finally {
            try { mb.close(); } catch (_closeRng) { }
        }
    }
    if (!last && this._getSubPointers) {
        var stats = this._getSubPointers(code);
        if (stats && typeof stats.total === 'number' && stats.total > last) last = stats.total;
    }
    return { first: first, last: last };
};

MessageBoard.prototype._ensureReadThreadData = function (forceReload) {
    var code = this.cursub || this._lastActiveSubCode || (bbs && bbs.cursub_code) || null;
    if (!code || typeof this._loadThreadHeaders !== 'function') return;
    var needs = forceReload || !this.threadHeaders || !this.threadHeaders.length;
    if (!needs) return;
    try { this._loadThreadHeaders(); } catch (_loadErr) { }
};

MessageBoard.prototype._renderReadView = function () {
    var controller = this._getViewController('read');
    if (controller && typeof controller.enter === 'function') {
        return controller.enter.apply(controller, arguments);
    }
    return undefined;
};

MessageBoard.prototype._setReadBodyText = function (text) {
    this._readBodyText = text || '';
    this._readBodyLineCache = null;
    this._readBodyLineCacheWidth = 0;
};

MessageBoard.prototype._ensureReadBodyCanvas = function () {
    var bodyFrame = this._readBodyFrame;
    if (!bodyFrame) {
        if (this._readBodyCanvas) {
            try { this._readBodyCanvas.close(); } catch (_e) { }
        }
        this._readBodyCanvas = null;
        return null;
    }
    var desiredWidth = Math.min(80, bodyFrame.width || 80);
    var desiredHeight = Math.max(1, bodyFrame.height || 1);
    var offsetX = Math.max(0, Math.floor((bodyFrame.width - desiredWidth) / 2));
    var parentFrame = bodyFrame.parent || bodyFrame;
    var originX = (parentFrame === bodyFrame) ? (offsetX + 1) : (bodyFrame.x + offsetX);
    var originY = (parentFrame === bodyFrame) ? 1 : bodyFrame.y;
    var needsRebuild = !this._readBodyCanvas
        || this._readBodyCanvas.parent !== parentFrame
        || this._readBodyCanvas.x !== originX
        || this._readBodyCanvas.y !== originY
        || this._readBodyCanvas.width !== desiredWidth
        || this._readBodyCanvas.height !== desiredHeight;
    if (needsRebuild) {
        if (this._readBodyCanvas) {
            try { this._readBodyCanvas.close(); } catch (_closeErr) { }
        }
        var canvas;
        try {
            canvas = new Frame(originX, originY, desiredWidth, desiredHeight, bodyFrame.attr, parentFrame);
            if (typeof ICSH_PERF_TAG !== 'undefined') { try { canvas.__perfTag = 'mb-read-canvas'; } catch (_ptRC) { } }
            canvas.v_scroll = true;
            canvas.h_scroll = false;
            if (canvas.__settings__) {
                canvas.__settings__.word_wrap = false;
                canvas.__settings__.lf_strict = true;
            }
            canvas.transparent = false;
            canvas.open();
            canvas.clear(bodyFrame.attr);
            canvas.attr = bodyFrame.attr;
        } catch (_canvasErr) {
            canvas = null;
        }
        this._readBodyCanvas = canvas;
    }
    return this._readBodyCanvas;
};

MessageBoard.prototype._renderReadBodyContent = function (text) {
    var canvas = this._ensureReadBodyCanvas();
    this._readBodyTotalLines = 0;
    this._readBodyHasAnsi = false;
    if (!canvas) return;
    if (this._readBodyFrame) {
        try { this._readBodyFrame.clear(this._readBodyFrame.attr); } catch (_bodyClearErr) { }
    }
    var bodyText = (typeof text === 'string') ? text : '';
    var renderText = this._preprocessMessageForReadability(bodyText);
    var metadata = this._readMessageMetadata || null;
    if (metadata) {
        var metaLines = [];
        function appendLines(arr) {
            if (arr && arr.length) {
                for (var i = 0; i < arr.length; i++) metaLines.push(arr[i]);
            }
        }
        appendLines(metadata.kludges);
        appendLines(metadata.tearLines);
        appendLines(metadata.originLines);
        appendLines(metadata.seenBy);
        appendLines(metadata.path);
        if (metaLines.length) {
            var needsTerminator = !(/\r\n|\n|\r$/.test(renderText));
            if (renderText.length && needsTerminator) renderText += '\r\n';
            if (renderText.length) renderText += '\r\n';
            renderText += '-- Metadata --\r\n' + metaLines.join('\r\n');
        }
    }
    var attr = (typeof canvas.attr === 'number') ? canvas.attr : ((typeof BG_BLACK === 'number' ? BG_BLACK : 0) | (typeof LIGHTGRAY === 'number' ? LIGHTGRAY : 7));
    var defaultFg = (typeof LIGHTGRAY === 'number') ? LIGHTGRAY : 7;
    if ((attr & 0x0F) === 0) attr = (attr & 0xF0) | defaultFg;
    canvas.attr = attr;
    try { canvas.clear(attr); } catch (_clearErr) { }
    if (canvas.__properties__) {
        canvas.__properties__.data = [];
        canvas.__position__.offset.x = 0;
        canvas.__position__.offset.y = 0;
        canvas.__properties__.ctrl_a = false;
    }
    if (typeof canvas.home === 'function') canvas.home();
    var ansiPattern = /\x1b\[[0-9;?]*[@-~]/;
    var hasAnsi = ansiPattern.test(renderText);
    if (renderText.indexOf('\x01') !== -1) {
        var expanded = _expandCtrlA(renderText);
        if (expanded !== renderText) {
            renderText = expanded;
            hasAnsi = ansiPattern.test(renderText) || hasAnsi;
        }
    }
    var rendered = _renderAnsiIntoFrame(canvas, renderText, canvas.width, canvas.height, {
        board: this,
        highlightQuotes: !hasAnsi
    });
    this._readBodyHasAnsi = hasAnsi;
    if (!rendered) {
        throw new Error('ANSI render failed for message body.');
    }
    try { canvas.home(); } catch (_homeErr) { }
    try { canvas.scrollTo(0, 0); } catch (_scrollErr) { }
    this._readBodyTotalLines = canvas.data_height || 0;
    this._readBodyLineCache = null;
    this._readBodyLineCacheWidth = 0;
    try { canvas.cycle(); } catch (_cycleErr) { }
    if (canvas.parent) {
        try { canvas.parent.cycle(); } catch (_parentCycleErr) { }
    }
};

MessageBoard.prototype._getReadLines = function () {
    var frame = this._readBodyFrame || this.outputFrame || null;
    var wrapWidth = 80;
    if (frame && typeof frame.width === 'number' && frame.width > 0) {
        wrapWidth = Math.min(80, Math.max(10, frame.width));
    }
    if (this._readBodyLineCache && this._readBodyLineCacheWidth === wrapWidth) return this._readBodyLineCache;
    var raw = this._readBodyText || '';
    var baseLines = raw.length ? raw.split(/\r?\n/) : [];
    var wrapped = [];
    for (var i = 0; i < baseLines.length; i++) {
        var line = baseLines[i];
        if (!line || !line.length) {
            wrapped.push('');
            continue;
        }
        if (typeof word_wrap === 'function') {
            try {
                var wrappedStr = word_wrap(line, wrapWidth, null, false);
                if (typeof wrappedStr === 'string' && wrappedStr.length) {
                    var parts = wrappedStr.replace(/\r/g, '').split('\n');
                    for (var p = 0; p < parts.length; p++) {
                        if (parts[p] === '' && p === parts.length - 1) continue;
                        wrapped.push(parts[p]);
                    }
                    continue;
                }
            } catch (e) { }
        }
        if (line.length > wrapWidth) {
            var chunked = line.match(new RegExp('.{1,' + wrapWidth + '}', 'g'));
            if (chunked && chunked.length) {
                for (var c = 0; c < chunked.length; c++) wrapped.push(chunked[c]);
                continue;
            }
        }
        wrapped.push(line);
    }
    this._readBodyLineCache = wrapped;
    this._readBodyLineCacheWidth = wrapWidth;
    return this._readBodyLineCache;
};

MessageBoard.prototype._ensureQuoteColorPalette = function () {
    if (this._quoteColorPalette && this._quoteColorPalette.length) return this._quoteColorPalette;
    var palette = [];
    var candidates = [
        (typeof BLUE === 'number' ? BLUE : undefined),
        (typeof GREEN === 'number' ? GREEN : undefined),
        (typeof CYAN === 'number' ? CYAN : undefined),
        (typeof RED === 'number' ? RED : undefined),
        (typeof MAGENTA === 'number' ? MAGENTA : undefined),
        (typeof BROWN === 'number' ? BROWN : undefined),
        (typeof LIGHTBLUE === 'number' ? LIGHTBLUE : undefined),
        (typeof LIGHTGREEN === 'number' ? LIGHTGREEN : undefined),
        (typeof LIGHTCYAN === 'number' ? LIGHTCYAN : undefined),
        (typeof LIGHTRED === 'number' ? LIGHTRED : undefined),
        (typeof LIGHTMAGENTA === 'number' ? LIGHTMAGENTA : undefined),
        (typeof YELLOW === 'number' ? YELLOW : undefined),
        (typeof WHITE === 'number' ? WHITE : undefined)
    ];
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (typeof c !== 'number') continue;
        if (typeof BLACK === 'number' && c === BLACK) continue;
        if (typeof DARKGRAY === 'number' && c === DARKGRAY) continue;
        if (palette.indexOf(c) === -1) palette.push(c);
    }
    if (!palette.length && typeof WHITE === 'number') palette.push(WHITE);
    this._quoteColorPalette = palette;
    return palette;
};

MessageBoard.prototype._quoteColorAttrFor = function (token, salt, baseAttr) {
    var palette = this._ensureQuoteColorPalette();
    if (!palette.length) return (typeof WHITE === 'number' ? WHITE : 7) | (typeof BG_BLACK === 'number' ? BG_BLACK : 0);
    var str = (token || '').toUpperCase();
    var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    hash += salt || 0;
    var idx = Math.abs(hash) % palette.length;
    var color = palette[idx];
    if (typeof color !== 'number') color = (typeof WHITE === 'number') ? WHITE : 7;
    var attr = color & 0x0F;
    var base = (typeof baseAttr === 'number') ? baseAttr : 0;
    attr |= (base & 0x70);
    attr |= (base & 0x80);
    return attr;
};

MessageBoard.prototype._writeReadLineWithQuoteColors = function (frame, text) {
    if (!frame) { return; }
    if (typeof text !== 'string' || !text.length) { frame.putmsg(text || ''); return; }
    var pattern = /(^|\s)([A-Za-z]{2})(>)/g;
    var lastIndex = 0;
    var currentAttr = frame.attr;
    var self = this;
    function writeDefault(segment) {
        if (!segment) return;
        frame.attr = currentAttr;
        frame.putmsg(segment);
        currentAttr = frame.attr;
    }
    function writeHighlight(segment, attr) {
        if (!segment) return;
        var restore = currentAttr;
        frame.attr = attr;
        frame.putmsg(segment);
        frame.attr = restore;
        currentAttr = restore;
    }
    var match;
    while ((match = pattern.exec(text)) !== null) {
        var start = match.index;
        if (start > lastIndex) {
            writeDefault(text.substring(lastIndex, start));
        }
        var leading = match[1] || '';
        var user = match[2] || '';
        var caret = match[3] || '';
        var start = match.index;
        var leadEnd = start + leading.length;
        if (leadEnd > lastIndex) {
            writeDefault(text.substring(lastIndex, leadEnd));
        }
        var token = user.toUpperCase();
        var baseAttr = currentAttr;
        var userAttr = self._quoteColorAttrFor(token, 0, baseAttr);
        writeHighlight(user, userAttr);
        var caretAttr = self._quoteColorAttrFor(token, 17, baseAttr);
        writeHighlight(caret, caretAttr);
        lastIndex = leadEnd + user.length + caret.length;
    }
    if (lastIndex < text.length) {
        writeDefault(text.substring(lastIndex));
    }
    frame.attr = currentAttr;
};

MessageBoard.prototype._readMessageBody = function (msgbase, header) {
    if (!msgbase || !header) return '';
    var body = '';
    var msgNumber = (typeof header.number === 'number') ? header.number : null;
    try {
        body = msgbase.get_msg_body(header) || '';
    } catch (e) { body = ''; }
    if (!body && msgNumber !== null) {
        try {
            body = msgbase.get_msg_body(msgNumber) || '';
        }
        catch (e) { body = ''; }
    }
    if (!body && msgNumber !== null) {
        try {
            var idx = msgbase.get_msg_index(msgNumber);
            var offset = null;
            if (typeof idx === 'object' && idx !== null && typeof idx.offset === 'number') offset = idx.offset;
            else if (typeof idx === 'number' && idx >= 0) offset = idx;
            if (offset !== null) body = msgbase.get_msg_body(true, offset) || '';
        } catch (e) { body = ''; }
    }
    if (!body) {
        dbug('MessageBoard: empty body for msg #' + (msgNumber === null ? '?' : msgNumber) + ' offset=' + (header.offset === undefined ? 'n/a' : header.offset), 'messageboard');
    }
    return body || '';
};

/**
 * Get quote color for initials using simple hash-based selection
 */
function getQuoteColorForInitials(initials) {
    // Simple hash function to get consistent color per initials
    var hash = 0;
    for (var i = 0; i < initials.length; i++) {
        hash = ((hash << 5) - hash + initials.charCodeAt(i)) & 0xFFFFFFFF;
    }

    // Select from available colors (avoid black/white for readability)
    var colors = [
        '\x01c',  // CYAN
        '\x01g',  // GREEN  
        '\x01y',  // YELLOW
        '\x01r',  // RED
        '\x01m',  // MAGENTA
        '\x01b'   // BLUE
    ];

    return colors[Math.abs(hash) % colors.length];
}

MessageBoard.prototype._preprocessMessageForReadability = function (text) {
    if (!text || typeof text !== 'string') return text || '';

    var lines = text.split(/\r\n|\n|\r/);
    var processedLines = [];
    var inMetadata = false;

    // (1) Add blank line at start for padding between header
    processedLines.push('');

    // Check if we have existing color codes to respect them
    var hasExistingColors = /\x1b\[[0-9;]*m|\x01[0-9a-fA-FghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ]/.test(text);

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var originalLine = line;

        // Check for metadata section
        if (line.indexOf('-- Metadata --') !== -1) {
            inMetadata = true;
        }

        // Skip if line already has color codes - respect existing colors (5)
        if (hasExistingColors && (/\x1b\[[0-9;]*m|\x01[0-9a-fA-FghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ]/.test(line))) {
            processedLines.push(line);
            continue;
        }

        // If in metadata section, use dark gray
        if (inMetadata) {
            processedLines.push('\x01k' + line + '\x01n'); // Dark gray
            continue;
        }

        // (2) Style "Re: ..." and "By: ..." lines at beginning with LIGHTBLUE/LIGHTCYAN pattern
        if (i === 0 || i === 1) {
            var trimmed = line.trim();
            if (trimmed.match(/^Re:\s/i)) {
                // LIGHTBLUE for "Re: " prefix, LIGHTCYAN for rest
                line = '\x01h\x01b' + 'Re: ' + '\x01h\x01c' + trimmed.substring(4) + '\x01n';
                processedLines.push(line);
                continue;
            } else if (trimmed.match(/^By:\s/i)) {
                // Parse "By: user to other_user on date" pattern
                line = formatByLine(trimmed);
                processedLines.push(line);
                continue;
            }
        }

        // Check if line is a quote and colorize appropriately
        var isQuote = false;
        var trimmedLine = line.trim();

        // Simple quote check - starts with ">"
        if (trimmedLine.charAt(0) === '>') {
            isQuote = true;
            // Simple quotes stay normal gray
            processedLines.push('\x01n' + line + '\x01n');
        }
        // Complex quote check - matches "Ab>" pattern  
        else if (/^\s*([A-Za-z]{2})>\s/.test(line)) {
            isQuote = true;
            // Extract initials for colorization
            var match = line.match(/^(\s*)([A-Za-z]{2})(>\s?)(.*)/);
            if (match) {
                var leading = match[1];
                var initials = match[2];
                var caret = match[3];
                var rest = match[4];

                // Get color for initials - use simple hash-based color selection
                var color = getQuoteColorForInitials(initials);
                processedLines.push(leading + color + initials + caret + '\x01n' + rest + '\x01n');
            } else {
                // Fallback
                processedLines.push('\x01n' + line + '\x01n');
            }
        }

        if (!isQuote) {
            // (4) Make non-quoted text bright WHITE - just use \x01h (high intensity)
            processedLines.push('\x01h' + line + '\x01n');
        }
    }

    return processedLines.join('\r\n');
};

function formatByLine(line) {
    // Parse patterns like "By: user to other_user on date"
    // LIGHTBLUE for keywords, LIGHTCYAN for values
    var result = line;

    // Handle "By: user" part - capture until " to " or " on " or end of string
    result = result.replace(/^(By:\s+)([^]+?)(\s+(?:to|on)\s|$)/, function (match, prefix, name, suffix) {
        return '\x01h\x01b' + prefix + '\x01h\x01c' + name + '\x01n' + suffix;
    });

    // Handle " to user" part if present - capture until " on " or end
    result = result.replace(/(\s+to\s+)([^]+?)(\s+on\s|$)/, function (match, prefix, name, suffix) {
        return '\x01h\x01b' + prefix + '\x01h\x01c' + name + '\x01n' + suffix;
    });

    // Handle " on date" part if present - capture rest of line
    result = result.replace(/(\s+on\s+)(.+)$/, '\x01h\x01b$1\x01h\x01c$2\x01n');

    return result;
}

MessageBoard.prototype._sanitizeFtnBody = function (text) {
    var metadata = {
        kludges: [],
        tearLines: [],
        originLines: [],
        seenBy: [],
        path: []
    };
    if (!text || !text.length) return { text: text || '', metadata: metadata };
    var endsWithNewline = /(\r\n|\n|\r)$/.test(text);
    var lines = text.split(/\r\n|\n|\r/);
    var bodyLines = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.length) {
            bodyLines.push(line);
            continue;
        }
        var first = line.charCodeAt(0);
        if (first === 1) {
            metadata.kludges.push(line);
            continue;
        }
        var trimmed = line.replace(/^\s+/, '');
        var upper = trimmed.toUpperCase();
        if (upper.indexOf('SEEN-BY') === 0) {
            metadata.seenBy.push(line);
            continue;
        }
        if (upper.indexOf('PATH') === 0) {
            metadata.path.push(line);
            continue;
        }
        if (/^---/.test(trimmed)) {
            metadata.tearLines.push(line);
            continue;
        }
        if (/^\* +ORIGIN:/i.test(trimmed)) {
            metadata.originLines.push(line);
            continue;
        }
        bodyLines.push(line);
    }
    var sanitized = bodyLines.join('\r\n');
    if (endsWithNewline && (bodyLines.length || text.length)) sanitized += '\r\n';
    return { text: sanitized, metadata: metadata };
};

MessageBoard.prototype._updateScanPointer = function (header) {
    if (!header || typeof header.number !== 'number') return;
    var code = this.cursub || header.sub || header.sub_code || bbs.cursub_code || null;
    if (!code) return;
    var number = header.number;
    var apply = function (obj) {
        if (!obj) return;
        if (typeof obj.scan_ptr !== 'number' || number > obj.scan_ptr) obj.scan_ptr = number;
        if (typeof obj.last_read !== 'number' || number > obj.last_read) obj.last_read = number;
    };
    if (msg_area) {
        if (typeof this.curgrp === 'number' && msg_area[this.curgrp] && msg_area[this.curgrp][code]) apply(msg_area[this.curgrp][code]);
        if (msg_area.sub && msg_area.sub[code]) apply(msg_area.sub[code]);
        var idx = this._ensureSubIndex();
        if (idx && idx[code] && msg_area.grp_list && msg_area.grp_list[idx[code].groupIndex]) {
            apply(msg_area.grp_list[idx[code].groupIndex].sub_list[idx[code].subIndex]);
        }
    }
    if (this._subUnreadCounts && this._subUnreadCounts.hasOwnProperty(code)) delete this._subUnreadCounts[code];
};

MessageBoard.prototype._renderGroupView = function () {
    var controller = this._getViewController('group');
    if (controller && typeof controller.enter === 'function') {
        return controller.enter.apply(controller, arguments);
    }
    return undefined;
};

MessageBoard.prototype._renderSubView = function () {
    var controller = this._getViewController('sub');
    if (controller && typeof controller.enter === 'function') {
        return controller.enter.apply(controller, arguments);
    }
    return undefined;
};

MessageBoard.prototype._paintRead = function () {
    if (this.view !== 'read') return;
    var canvas = this._readBodyCanvas;
    if (canvas) {
        var totalLines = canvas.data_height || 0;
        var maxVisible = canvas.height || 0;
        if (maxVisible <= 0) maxVisible = this._readBodyFrame ? this._readBodyFrame.height : 0;
        if (maxVisible > 0) maxVisible = Math.max(1, Math.min(maxVisible, canvas.height || maxVisible));
        var start = this._readScroll || 0;
        var maxStart = (totalLines > maxVisible && maxVisible > 0) ? totalLines - maxVisible : 0;
        if (start < 0) start = 0;
        if (start > maxStart) start = maxStart;
        this._readScroll = start;
        try { canvas.scrollTo(0, start); } catch (_scrollErr) { }
        try { canvas.cycle(); } catch (_cycleErr) { }
        if (this._readHeaderFrame) { try { this._readHeaderFrame.cycle(); } catch (_headerCycleErr) { } }
        var dispStart = totalLines ? (start + 1) : 0;
        var dispEnd = totalLines ? Math.min(totalLines, start + (maxVisible || 0)) : 0;
        this._writeStatus(this._formatReadStatus(dispStart, dispEnd, totalLines));
        return;
    }
    var f = this._readBodyFrame || this.outputFrame; if (!f) return; f.clear();
    var usable = f.height - 1; if (usable < 1) usable = f.height;
    var start = this._readScroll || 0;
    var lines = this._getReadLines();
    var totalLines = lines.length;
    if (start < 0) start = 0;
    if (start >= totalLines) start = Math.max(0, totalLines - usable);
    var end = Math.min(totalLines, start + usable);
    var lineY = 1;
    for (var i = start; i < end; i++) {
        var line = lines[i] || '';
        if (line.length && line.indexOf('\x00') !== -1) line = line.replace(/\x00+/g, '');
        if (line.length > f.width) line = line.substr(0, f.width);
        try {
            f.gotoxy(1, lineY);
            this._writeReadLineWithQuoteColors(f, line);
        } catch (e) {
            var err = (e && e.message) ? e.message : e;
            dbug('MessageBoard: paintRead putmsg error ' + err, 'messageboard');
        }
        lineY++;
        if (lineY > f.height) break;
    }
    var dispStart = totalLines ? (start + 1) : 0;
    var dispEnd = totalLines ? end : 0;
    this._writeStatus(this._formatReadStatus(dispStart, dispEnd, totalLines));
    try { f.cycle(); if (this._readHeaderFrame) this._readHeaderFrame.cycle(); } catch (e) { }
};

MessageBoard.prototype._formatReadStatus = function (dispStart, dispEnd, totalLines) {
    var status = '[ENTER]=Scroll/NextMsg  [Bksp/Del]=PrevMsg (Arrows: [Up]/[Down]=Scroll - [Right]/[Left]=Thread+/-) [ESC]=Subs  ' + dispStart + '-' + dispEnd + '/' + totalLines;
    var ctx = this._readThreadContext;
    if (ctx && ctx.numbers && ctx.numbers.length) {
        var total = ctx.numbers.length;
        var idx = -1;
        if (typeof ctx.currentNumber === 'number') {
            if (ctx.numberIndexMap && typeof ctx.numberIndexMap[ctx.currentNumber] === 'number') idx = ctx.numberIndexMap[ctx.currentNumber];
            if (idx === -1) idx = ctx.numbers.indexOf(ctx.currentNumber);
        }
        if (idx !== -1) status += ' | THREAD ' + (idx + 1) + '/' + total;
        else status += ' | THREAD ' + total + ' messages';
    }
    // Add J command hint for flat/ordered reading mode
    var readMode = (typeof this._getReadMode === 'function') ? this._getReadMode() : null;
    if (readMode === 'flat' && totalLines > 0) {
        status += '  [J]=Jump to #';
    }
    return status;
};

MessageBoard.prototype._jumpToThreadViewFromRead = function () {
    if (this.view !== 'read') return false;
    var msg = this.lastReadMsg || null;
    if (!msg) {
        this._writeStatus('THREAD: No active message');
        return false;
    }
    var rootId = msg.thread_id || msg.number;
    if (!rootId) {
        this._writeStatus('THREAD: Message not part of a thread');
        return false;
    }
    var ctx = this._createThreadContext(rootId, msg.number, 'thread');
    if (!ctx) {
        this._writeStatus('THREAD: No additional messages in thread');
        return false;
    }
    this._readThreadContext = null;
    this._readReturnAnchor = msg.number || null;
    this._readReturnView = null;
    try { if (this._destroyReadFrames) this._destroyReadFrames(); } catch (_eDestroy) { }
    try { this._releaseHotspots(); } catch (_eHS) { }
    this._renderThreadsView(this.cursub);
    this._writeStatus('THREADS: Viewing thread (' + ctx.numbers.length + ' messages)');
    return true;
};

MessageBoard.prototype._handleReadKey = function (key) {
    // First allow legacy controller to act; only fall back if it returns undefined (explicit contract)
    var controller = this._getViewController('read');
    if (key === 'R' || key === 'r') {
        // replyCurrentMessage returns true if it performed the reply. We return false (consumed) when it succeeds.
        var did = this.replyCurrentMessage && this.replyCurrentMessage();
        return did ? false : true; // if we could not reply, allow other handlers (return true = not consumed)
    }
    if (key === KEY_ESC || key === '\x1b') {
        // ESC: Go back to the return view (typically 'sub' or 'threads')
        var returnView = this._readReturnView || 'sub';
        this._readReturnView = null;
        if (returnView === 'threads') {
            if (typeof this._renderThreadsView === 'function') this._renderThreadsView(this.cursub);
            else this._renderSubView(this.curgrp);
        } else if (returnView === 'flat') {
            this._renderFlatView();
        } else {
            // Default to sub view
            this._renderSubView(this.curgrp);
        }
        return false; // consumed
    }
    if (key === 'J' || key === 'j') {
        // J: Jump to message number in flat/ordered mode
        var readMode = this._getReadMode ? this._getReadMode() : 'thread';
        if (readMode === 'flat') {
            if (this._ensureFlatHeaders) {
                var headers = this._ensureFlatHeaders();
                if (headers && headers.length > 0) {
                    var self = this;
                    // Try to use Modal if available
                    if (typeof Modal === 'undefined') {
                        try { load('future_shell/lib/util/layout/modal.js'); } catch (_modalLoadErr) { }
                    }
                    var parent = this.parentFrame || this.hostFrame || this.inputFrame || this.outputFrame;
                    if (this.view === 'read' && this._readBodyFrame) {
                        parent = this._readBodyFrame;
                    }
                    if (typeof Modal === 'function' && parent) {
                        // Use Modal for a nice prompt
                        var modal = new Modal({
                            parentFrame: parent,
                            overlay: false,
                            type: 'prompt',
                            title: 'Jump to Message',
                            message: 'Enter message number (1-' + headers.length + ')',
                            okLabel: 'Jump',
                            cancelLabel: 'Cancel',
                            defaultValue: '',
                            onSubmit: function (value) {
                                var input = (value || '').trim();
                                if (!input.length) {
                                    self._writeStatus('JUMP: Enter a message number');
                                    return;
                                }
                                var msgNum = parseInt(input, 10);
                                if (isNaN(msgNum) || msgNum < 1 || msgNum > 65535) {
                                    self._writeStatus('JUMP: Invalid message number');
                                    return;
                                }
                                // First, look for exact match
                                var idx = -1;
                                for (var i = 0; i < headers.length; i++) {
                                    if (headers[i] && headers[i].number === msgNum) {
                                        idx = i;
                                        break;
                                    }
                                }
                                // If not found, search forward for next available message
                                if (idx === -1) {
                                    for (var i = 0; i < headers.length; i++) {
                                        if (headers[i] && headers[i].number > msgNum) {
                                            idx = i;
                                            msgNum = headers[i].number; // update to show which one we're jumping to
                                            break;
                                        }
                                    }
                                }
                                // If still not found, search backward for previous available message
                                if (idx === -1) {
                                    for (var i = headers.length - 1; i >= 0; i--) {
                                        if (headers[i] && headers[i].number < msgNum) {
                                            idx = i;
                                            msgNum = headers[i].number; // update to show which one we're jumping to
                                            break;
                                        }
                                    }
                                }
                                // Still nothing found
                                if (idx === -1) {
                                    self._writeStatus('JUMP: No messages near number ' + input);
                                    return;
                                }
                                self.flatSelection = idx;
                                if (self.flatSelection < self.flatScrollOffset) self.flatScrollOffset = self.flatSelection;
                                var usable = self._threadContentFrame ? Math.max(1, self._threadContentFrame.height - 2) : headers.length;
                                if (self.flatSelection >= self.flatScrollOffset + usable) self.flatScrollOffset = Math.max(0, self.flatSelection - usable + 1);
                                if (headers[idx]) {
                                    self._renderReadView(headers[idx]);
                                }
                            },
                            onCancel: function () {
                                self._writeStatus('JUMP cancelled');
                            }
                        });
                        return false; // consumed
                    }
                }
            }
        }
        return true; // not consumed if not in flat mode or no headers
    }
    if (controller && typeof controller.handleKey === 'function') {
        var handled = controller.handleKey.call(controller, key);
        if (typeof handled !== 'undefined') return handled; // honor explicit true/false
    }

    return true; // not consumed
};

// Open previous/next thread container based on threadTreeSelection delta (-1 or +1)
MessageBoard.prototype._openAdjacentThread = function (delta) {
    if (!this.lastReadMsg) return false;
    if (typeof delta !== 'number' || !delta) return false;
    if (this._readThreadContext && this._readThreadContext.mode === 'flat') return false;

    if (typeof this._ensureReadThreadData === 'function') this._ensureReadThreadData();

    if (this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
        // Find current container node for lastReadMsg
        var currentMsgNum = this.lastReadMsg && this.lastReadMsg.number;
        var currentRootId = this.lastReadMsg ? (this.lastReadMsg.thread_id || this.lastReadMsg.number) : null;
        var containerIndex = -1;
        for (var i = 0; i < this.threadNodeIndex.length; i++) {
            var node = this.threadNodeIndex[i];
            if (!node) continue;
            if (node.__isTree && node.items) {
                for (var m = 0; m < node.items.length; m++) {
                    var itm = node.items[m];
                    if (itm.__msgHeader && itm.__msgHeader.number === currentMsgNum) {
                        containerIndex = i;
                        break;
                    }
                }
                if (containerIndex !== -1) break;
            } else if (node.__msgHeader && node.__msgHeader.number === currentMsgNum) {
                // Single-message thread rendered as top-level item
                if (!node.parent || node.parent === this.threadTree || (node.__threadRootId && node.__threadRootId === currentRootId)) {
                    containerIndex = i;
                    break;
                }
            }
        }
        if (containerIndex !== -1) {
            var target = containerIndex + delta;
            // Seek next/prev container (__isTree) skipping non-container nodes
            while (target >= 0 && target < this.threadNodeIndex.length) {
                var candidate = this.threadNodeIndex[target];
                if (candidate && (candidate.__isTree || (candidate.__msgHeader && candidate.parent === this.threadTree))) break;
                target += (delta > 0 ? 1 : -1);
            }
            if (target >= 0 && target < this.threadNodeIndex.length) {
                var targetNode = this.threadNodeIndex[target];
                if (targetNode) {
                    var noticeKeyTree = delta > 0 ? 'next-thread' : 'prev-thread';
                    if (targetNode.__isTree && targetNode.items && targetNode.items.length) {
                        try { if (targetNode.status & targetNode.__flags__.CLOSED) targetNode.open(); } catch (e) { }
                        var first = targetNode.items[0];
                        if (first && first.__msgHeader) {
                            this._readReturnView = 'threads';
                            this._readReturnAnchor = first.__msgHeader.number || null;
                            if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(first.__msgHeader);
                            if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                            this._renderReadView(first.__msgHeader);
                            this._showReadNotice(noticeKeyTree);
                            return true;
                        }
                    } else if (targetNode.__msgHeader && targetNode.parent === this.threadTree) {
                        this._readReturnView = 'threads';
                        this._readReturnAnchor = targetNode.__msgHeader.number || null;
                        if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(targetNode.__msgHeader);
                        if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                        this._renderReadView(targetNode.__msgHeader);
                        this._showReadNotice(noticeKeyTree);
                        return true;
                    }
                }
            }
        }
    }

    var code = this.cursub || (this.lastReadMsg && (this.lastReadMsg.sub || this.lastReadMsg.sub_code)) || (bbs && bbs.cursub_code) || null;
    if (!code || typeof MsgBase !== 'function') return false;
    var noticeKey = delta > 0 ? 'next-thread' : 'prev-thread';
    var currentRoot = this.lastReadMsg.thread_id || this.lastReadMsg.number;
    var startNum = this.lastReadMsg.number;
    if (typeof startNum !== 'number') return false;

    var mb = new MsgBase(code);
    if (!mb.open()) return false;
    try {
        var last = (typeof mb.last_msg === 'number') ? mb.last_msg : 0;
        var first = (typeof mb.first_msg === 'number' && mb.first_msg > 0) ? mb.first_msg : 1;
        var step = (delta > 0) ? 1 : -1;
        var num = startNum + step;
        while (num >= first && num <= last) {
            var hdr = null;
            try { hdr = mb.get_msg_header(false, num, true); } catch (_hdrFetch) { hdr = null; }
            if (hdr) {
                if (typeof hdr.number !== 'number') hdr.number = num;
                if (!hdr.sub) hdr.sub = code;
                var rootId = hdr.thread_id || hdr.number;
                if (rootId !== currentRoot) {
                    var seq = this._buildThreadSequence(rootId) || [];
                    var targetHdr = seq && seq.length ? seq[0] : hdr;
                    if (targetHdr && typeof targetHdr.number !== 'number') targetHdr.number = hdr.number;
                    if (targetHdr && !targetHdr.sub) targetHdr.sub = code;
                    if (targetHdr && targetHdr !== hdr && typeof this._storeFullHeader === 'function') this._storeFullHeader(targetHdr);
                    this._storeFullHeader && this._storeFullHeader(hdr);
                    this._readReturnView = 'threads';
                    this._readReturnAnchor = targetHdr && targetHdr.number ? targetHdr.number : hdr.number || null;
                    if (typeof this._ensureThreadReadContextFromThreads === 'function' && targetHdr) this._ensureThreadReadContextFromThreads(targetHdr);
                    if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                    this._renderReadView(targetHdr || hdr);
                    if (typeof this._ensureReadThreadData === 'function') this._ensureReadThreadData(true);
                    this._showReadNotice(noticeKey);
                    return true;
                }
            }
            num += step;
        }
    } finally {
        try { mb.close(); } catch (_closeErr) { }
    }
    return false;
};

// Move within current thread's message list (dir = +1/-1)
MessageBoard.prototype._openRelativeInThread = function (dir) {
    if (!this.lastReadMsg) return false;
    if (typeof dir !== 'number' || !dir) return false;
    var currentMsgNum = this.lastReadMsg.number;
    if (typeof currentMsgNum !== 'number') return false;

    if (typeof this._ensureReadThreadData === 'function') this._ensureReadThreadData();

    var ctx = this._readThreadContext || null;
    if (ctx && ctx.rootId) {
        var seq = this._buildThreadSequence(ctx.rootId) || [];
        if (seq.length) {
            var idx = (ctx.numberIndexMap && typeof ctx.numberIndexMap[currentMsgNum] === 'number') ? ctx.numberIndexMap[currentMsgNum] : -1;
            if (idx === -1) {
                for (var si = 0; si < seq.length; si++) {
                    if (seq[si] && seq[si].number === currentMsgNum) { idx = si; break; }
                }
            }
            if (idx !== -1) {
                var targetIdx = idx + dir;
                if (targetIdx >= 0 && targetIdx < seq.length) {
                    var targetHdr = seq[targetIdx];
                    if (targetHdr) {
                        if (ctx.mode === 'thread') {
                            this._readReturnView = 'threads';
                            this._readReturnAnchor = targetHdr.number || null;
                            if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(targetHdr);
                        }
                        if (typeof this._setReadMode === 'function') this._setReadMode(ctx.mode === 'flat' ? 'flat' : 'thread');
                        this._renderReadView(targetHdr);
                        this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                        return true;
                    }
                } else if (ctx.mode === 'flat') {
                    return false;
                }
            }
        } else if (ctx.mode === 'flat') {
            return false;
        }
        if (ctx.mode === 'flat') return false;
    }

    if (this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
        var container = null; var msgs = []; var idx = -1;
        // Locate container and index
        for (var i = 0; i < this.threadNodeIndex.length; i++) {
            var node = this.threadNodeIndex[i];
            if (node && node.__isTree && node.items) {
                for (var m = 0; m < node.items.length; m++) {
                    var itm = node.items[m];
                    if (itm.__msgHeader && itm.__msgHeader.number === currentMsgNum) { container = node; msgs = node.items; idx = m; break; }
                }
                if (idx !== -1) break;
            }
        }
        if (container && idx !== -1) {
            var nidx = idx + dir;
            if (nidx >= 0 && nidx < msgs.length) {
                var target = msgs[nidx];
                if (target && target.__msgHeader) {
                    this._readReturnView = 'threads';
                    this._readReturnAnchor = target.__msgHeader.number || null;
                    if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(target.__msgHeader);
                    if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                    this._renderReadView(target.__msgHeader);
                    this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                    return true;
                }
            }
        }
    }

    if (typeof this._buildThreadSequence === 'function') {
        var seq = this._buildThreadSequence(this.lastReadMsg.thread_id || this.lastReadMsg.number);
        if (seq && seq.length) {
            for (var s = 0; s < seq.length; s++) {
                if (seq[s].number === currentMsgNum) {
                    var targetIndex = s + dir;
                    if (targetIndex >= 0 && targetIndex < seq.length) {
                        var next = seq[targetIndex];
                        if (next) {
                            this._readReturnView = 'threads';
                            this._readReturnAnchor = next.number || null;
                            if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(next);
                            if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                            this._renderReadView(next);
                            this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                            return true;
                        }
                    }
                    break;
                }
            }
        }
    }

    var code = this.cursub || this._lastActiveSubCode || this._cachedSubCode || (bbs && bbs.cursub_code) || null;
    if (code && typeof MsgBase === 'function') {
        var range = this._getSubMessageRange ? this._getSubMessageRange(code) : { first: 1, last: 0 };
        if (range.last) {
            var mbScan = new MsgBase(code);
            if (mbScan.open()) {
                try {
                    var step = dir > 0 ? 1 : -1;
                    for (var num = currentMsgNum + step; num >= range.first && num <= range.last; num += step) {
                        var hdr = null;
                        try { hdr = mbScan.get_msg_header(false, num, true); } catch (_hdrScan) { hdr = null; }
                        if (!hdr) continue;
                        if (typeof hdr.number !== 'number') hdr.number = num;
                        if (!hdr.sub) hdr.sub = code;
                        if (typeof this._storeFullHeader === 'function') this._storeFullHeader(hdr);
                        this._readReturnView = 'threads';
                        this._readReturnAnchor = hdr.number || null;
                        if (typeof this._ensureThreadReadContextFromThreads === 'function') this._ensureThreadReadContextFromThreads(hdr);
                        if (typeof this._setReadMode === 'function') this._setReadMode('thread');
                        this._renderReadView(hdr);
                        this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                        return true;
                    }
                } finally {
                    try { mbScan.close(); } catch (_closeScan) { }
                }
            }
        }
    }
    return false;
};

MessageBoard.prototype._consumeReadNoticeKey = function (key) {
    if (!this._readNoticeActive) return false;
    this._hideReadNotice();
    if (key === '\x1b' || key === '\x08' || key === KEY_ESC || key === KEY_BACKSPACE) return false;
    return true;
};

MessageBoard.prototype._showReadNotice = function (kind) {
    if (this.view !== 'read') return;
    if (!kind) return;
    if (typeof Modal === 'undefined') { try { load('future_shell/lib/util/layout/modal.js'); } catch (_mErr) { } }
    var labelMapModal = {
        'next-message': 'Showing next message',
        'prev-message': 'Showing previous message',
        'next-thread': 'Showing next thread',
        'prev-thread': 'Showing previous thread',
        'end-of-sub': 'All messages read. Returning to sub selection',
        'end-of-flat': 'End of messages; returning to flat list',
        'thread-start': 'Reading entire thread',
        'thread-complete': 'Thread complete; resuming flat view'
    };
    var msg = labelMapModal[kind] || labelMapModal['next-message'];
    if (this._readNoticeModal) { try { this._readNoticeModal.close(); } catch (_) { } this._readNoticeModal = null; }
    var hostFrame = this.hostFrame || this.rootFrame || this.outputFrame || this.parentFrame || this._readBodyFrame;
    // Guard: if hostFrame missing or has invalid dimensions, skip showing notice to avoid coordinate errors
    if (!hostFrame || !hostFrame.width || !hostFrame.height || hostFrame.width < 4 || hostFrame.height < 3) return;
    var self = this;
    // this._readNoticeModal = new Modal({
    //     type: 'spinner',
    //     title: '',
    //     message: msg,
    //     parentFrame: hostFrame,
    //     overlay: false,
    //     width: Math.min(40, Math.max(18, msg.length + 8)),
    //     height: 7,
    //     buttons: [],
    //     spinnerFrames: ['.', 'o', 'O', 'o'],
    //     spinnerInterval: 130,
    //     timeout: 2200,
    //     onClose: function () { self._readNoticeModal = null; }
    // });
};

MessageBoard.prototype._hideReadNotice = function () {
    if (this._readNoticeEvent) {
        try { this._readNoticeEvent.abort = true; } catch (e) { }
        this._readNoticeEvent = null;
    }
    if (this._readNoticeModal) { try { this._readNoticeModal.close(); } catch (_) { } this._readNoticeModal = null; }
    this._readNoticeActive = false;
};

// _createNoticeFrames removed: legacy frame-based notice system fully deprecated in favor of Modal spinner notices.

MessageBoard.prototype._showTransitionNotice = function (text) {
    text = text || 'Loading...';
    if (typeof Modal === 'undefined') { try { load('future_shell/lib/util/layout/modal.js'); } catch (_mErr2) { } }
    if (this._transitionNoticeModal) { try { this._transitionNoticeModal.close(); } catch (_) { } this._transitionNoticeModal = null; }
    var host2 = this.hostFrame || this.rootFrame || this.outputFrame || this.parentFrame || null;
    if (!host2 || !host2.width || !host2.height || host2.width < 4 || host2.height < 3) return false;
    var self = this;
    // this._transitionNoticeModal = new Modal({
    //     type: 'spinner',
    //     title: '',
    //     message: text,
    //     parentFrame: host2,
    //     overlay: true,
    //     width: Math.min(50, Math.max(20, text.length + 10)),
    //     height: 8,
    //     spinnerFrames: ['|', '/', '-', '\\'],
    //     spinnerInterval: 120,
    //     timeout: 3000,
    //     buttons: [],
    //     onClose: function () { self._transitionNoticeModal = null; }
    // });
    this._transitionNoticeActive = true;
    return true;
};

MessageBoard.prototype._hideTransitionNotice = function () {
    if (this._transitionNoticeModal) { try { this._transitionNoticeModal.close(); } catch (_) { } this._transitionNoticeModal = null; }
    this._transitionNoticeActive = false;
};

MessageBoard.prototype._renderTransitionOverlay = function () {
    if (this.overlay && typeof this.overlay.render === 'function') {
        this.overlay.render();
    }
};

MessageBoard.prototype._beginViewTransition = function (label, opts) {
    if (this.overlay && typeof this.overlay.begin === 'function') {
        this.overlay.begin(label, opts);
    }
};

MessageBoard.prototype._getTransitionHostFrame = function () {
    if (this.view === 'read') {
        if (this._readBodyFrame && this._readBodyFrame.is_open) return this._readBodyFrame;
        if (this._readHeaderFrame && this._readHeaderFrame.is_open) return this._readHeaderFrame;
    }
    if (this.view === 'threads') {
        if (this._threadContentFrame && this._threadContentFrame.is_open) return this._threadContentFrame;
    }
    if (this.view === 'search') {
        if (this.outputFrame && this.outputFrame.is_open) return this.outputFrame;
    }
    if (this.view === 'sub' || this.view === 'group' || this.view === 'post') {
        if (this.outputFrame && this.outputFrame.is_open) return this.outputFrame;
    }
    if (this.outputFrame && this.outputFrame.is_open) return this.outputFrame;
    if (this.hostFrame && this.hostFrame.is_open) return this.hostFrame;
    if (this.parentFrame && this.parentFrame.is_open) return this.parentFrame;
    if (this.rootFrame && this.rootFrame.is_open) return this.rootFrame;
    return null;
};

MessageBoard.prototype._refreshTransitionOverlay = function () {
    if (this.overlay && typeof this.overlay.refresh === 'function') {
        this.overlay.refresh();
    }
};

MessageBoard.prototype._endViewTransition = function () {
    if (this.overlay && typeof this.overlay.end === 'function') {
        this.overlay.end();
    }
};

MessageBoard.prototype._renderPostViewCore = function (postOptions) {
    // Delegate to built-in editor only. postOptions.replyTo (header) indicates reply.
    var sub = this.cursub || (bbs && bbs.cursub_code) || null;
    if (!sub) { this._writeStatus('POST: No sub selected'); return; }
    // Do NOT destroy read frames yet; keep context until after editor returns (mirrors ecReader behavior)
    var activeHeader = this.currentMessageHeader || this.lastReadMsg || null;
    var activeRawBody = this.currentMessageRawBody || '';
    var replyNum = null;
    if (postOptions && typeof postOptions.replyTo !== 'undefined' && postOptions.replyTo !== null) {
        if (typeof postOptions.replyTo === 'number') replyNum = postOptions.replyTo;
        else if (typeof postOptions.replyTo === 'object' && typeof postOptions.replyTo.number === 'number') replyNum = postOptions.replyTo.number;
    }
    try {
        if (typeof replyNum === 'number') {
            this._writeStatus('Replying to #' + replyNum + '...');
            // Always refetch a fresh full header with extended info to ensure thread fields present
            var fullHeader = null;
            try {
                var mbFetch = new MsgBase(sub);
                if (mbFetch.open()) {
                    fullHeader = mbFetch.get_msg_header(false, replyNum, true) || null;
                    if (fullHeader) fullHeader.number = replyNum;
                    if (!activeRawBody || !activeRawBody.length) {
                        // Only fetch body if we have no cached raw body
                        try { activeRawBody = mbFetch.get_msg_body(fullHeader) || ''; } catch (_bErr) { }
                    }
                    mbFetch.close();
                }
            } catch (_fhErr) { fullHeader = null; }
            if (!fullHeader) {
                this._writeStatus('Reply aborted: original message missing');
                return;
            }
            // Write QUOTES.TXT from raw body only (no sanitization)
            if (activeRawBody && activeRawBody.length) {
                try {
                    var qFile2 = system.node_dir + 'QUOTES.TXT';
                    var qf2 = new File(qFile2);
                    if (qf2.open('w')) { qf2.write(activeRawBody); qf2.close(); }
                    if (typeof dbug === 'function') dbug('MB: QUOTES.TXT bytes=' + activeRawBody.length, 'messageboard');
                } catch (_qErr2) { if (typeof dbug === 'function') dbug('MB: QUOTES write error ' + _qErr2, 'messageboard'); }
            }
            if (typeof dbug === 'function') dbug('MB: post reply WM_QUOTE header#' + replyNum, 'messageboard');
            bbs.post_msg(sub, WM_QUOTE, fullHeader);

        } else {
            this._writeStatus('Posting...');
            if (typeof dbug === 'function') dbug('MB: post new message', 'messageboard');
            bbs.post_msg(sub, WM_NONE);
        }
    } catch (e) {
        var err = (e && e.message) ? e.message : e;
        if (typeof dbug === 'function') dbug('MB: post_msg error ' + err, 'messageboard');
        this._writeStatus('Post error: ' + err);
    }
    // Now teardown read frames (if any) and refresh threads AFTER editor returns
    try { this._destroyReadFrames && this._destroyReadFrames(); } catch (_dr2) { }
    this._openSubReader(sub, { preferNewest: true });
}

// Explicit reply helper (avoids embedding logic in generic key handler)
MessageBoard.prototype.replyCurrentMessage = function () {
    log("REPLY CURRENT MESSAGE");
    if (this.view !== 'read') return false;
    var hdr = this.lastReadMsg;
    if (!hdr || typeof hdr.number !== 'number') {
        this._writeStatus('REPLY: No current message');
        return false;
    }
    if (this._navigationLock) return false;
    this._navigationLock = true;
    try {
        this._renderPostView({ replyTo: hdr.number });
    } finally {
        this._navigationLock = false;
    }
    return true;
};

MessageBoard.prototype._renderPostView = function () {
    var controller = this._getViewController('post');
    if (controller && typeof controller.enter === 'function') {
        return controller.enter.apply(controller, arguments);
    }
    if (typeof this._renderPostViewCore === 'function') {
        return this._renderPostViewCore.apply(this, arguments);
    }
    return undefined;
};

MessageBoard.prototype._paintReadHeader = function (msg) {
    if (!this._readHeaderFrame || !msg) return;
    var self = this;
    var hf = this._readHeaderFrame;
    hf.clear(BG_BLUE | WHITE);
    if (this._readGroupIconFrame) { try { this._readGroupIconFrame.close(); } catch (e0) { } }
    this._readGroupIconFrame = null;
    if (this._readSubIconFrame) { try { this._readSubIconFrame.close(); } catch (e1) { } }
    this._readSubIconFrame = null;

    var iconW = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_W : 12;
    var iconH = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_H : 6;
    var iconMaxWidth = Math.min(iconW, hf.width);
    var iconHeight = Math.min(iconH, hf.height);
    var iconSpacingCols = 1;
    var nextIconCol = 1;

    var subCode = this.cursub || msg.sub || msg.sub_code || this._lastActiveSubCode || bbs.cursub_code;
    var subDisplayName = subCode || this._getCurrentSubName() || 'unknown';

    var subIndexMap = (typeof this._ensureSubIndex === 'function') ? this._ensureSubIndex() : null;
    var groupIndex = null;
    if (subIndexMap && subCode && subIndexMap[subCode] && typeof subIndexMap[subCode].groupIndex === 'number') {
        groupIndex = subIndexMap[subCode].groupIndex;
    }
    if (typeof groupIndex !== 'number' || groupIndex < 0) groupIndex = this.curgrp;
    var groupName = '';
    var groupHint = 'groups';
    if (typeof groupIndex === 'number' && msg_area && msg_area.grp_list && msg_area.grp_list[groupIndex]) {
        var grp = msg_area.grp_list[groupIndex];
        groupName = (grp && grp.name) || '';
        groupHint = (grp && (grp.code || grp.name)) || groupHint;
    }

    var groupIconBase = this._resolveBoardIcon(groupHint || groupName || 'groups', 'group');
    var subIconBase = this._resolveBoardIcon(subCode || subDisplayName, 'sub');

    function ensureIconLib() {
        if (self._Icon) return true;
        try { self._Icon = load('future_shell/lib/shell/icon.js').Icon || Icon; }
        catch (eA) { try { load('future_shell/lib/shell/icon.js'); self._Icon = Icon; } catch (eB) { self._Icon = null; } }
        return !!self._Icon;
    }

    function renderIcon(base) {
        if (!base) return null;
        if (!ensureIconLib()) return null;
        var available = hf.width - nextIconCol + 1;
        if (available <= 0) return null;
        var width = Math.min(iconMaxWidth, available);
        if (width <= 0) return null;
        var iconFrame = null;
        var labelFrame = null;
        try {
            iconFrame = new Frame(hf.x + nextIconCol - 1, hf.y, width, iconHeight, hf.attr, hf.parent);
            iconFrame.open();
            labelFrame = new Frame(iconFrame.x, iconFrame.y + iconFrame.height, iconFrame.width, 1, hf.attr, hf.parent);
            labelFrame.open();
            labelFrame.clear();
            var iconObj = new self._Icon(iconFrame, labelFrame, { iconFile: base, label: '' });
            iconObj.render();
            nextIconCol += width + iconSpacingCols;
            return iconFrame;
        } catch (e) {
            if (iconFrame) { try { iconFrame.close(); } catch (_eClose) { } }
            return null;
        } finally {
            if (labelFrame) { try { labelFrame.close(); } catch (_lfClose) { } }
        }
    }

    var groupIconFrame = renderIcon(groupIconBase);
    if (groupIconFrame) {
        this._readGroupIconFrame = groupIconFrame;
        try { groupIconFrame.cycle(); } catch (_gCycle) { }
    }

    var subIconFrame = renderIcon(subIconBase);
    if (subIconFrame) {
        this._readSubIconFrame = subIconFrame;
        try { subIconFrame.cycle(); } catch (_sCycle) { }
    }

    var textStartCol = Math.min(Math.max(1, nextIconCol), hf.width);

    var from = (msg.from || msg.from_net || 'unknown');
    var toField = msg.to || msg.to_net || msg.to_net_addr || msg.replyto || msg.reply_to || '';
    var subj = (msg.subject || '(no subject)');
    var when = msg.when_written_time || msg.when_written || msg.when_imported_time || 0;
    var dateStr = 'Unknown';
    try { if (when) dateStr = strftime('%Y-%m-%d %H:%M', when); } catch (e) { }
    var avatarWidth = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.width) || 10;
    var avatarHeight = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.height) || 6;
    var avatarInfo = null;
    if (this._avatarLib) {
        try { avatarInfo = this._fetchAvatarForMessage ? this._fetchAvatarForMessage(msg) : null; } catch (e) { log('avatar fetch error: ' + e); }
    }
    var haveAvatar = avatarInfo && avatarInfo.obj && avatarInfo.obj.data;
    var textStartX = Math.min(textStartCol, hf.width);
    var textEndX = hf.width;
    var avatarStartX = hf.width - avatarWidth + 1;
    if (haveAvatar && avatarStartX > textStartX) {
        textEndX = Math.max(textStartX, avatarStartX - 2);
    }
    var lines = [];
    lines.push({ label: null, value: '\x01h\x01g' + subDisplayName.toUpperCase() });
    lines.push({ label: 'Date', value: dateStr });
    lines.push({ label: 'From', value: '\x01h\x01r' + from });
    if (toField && toField.length) lines.push({ label: 'To', value: '\x01h\x01m' + toField });
    if (msg.replyto && msg.replyto.length && (!toField || toField.toLowerCase() !== msg.replyto.toLowerCase())) {
        lines.push({ label: 'Reply-To', value: msg.replyto });
    }
    lines.push({ label: 'Subj', value: '\x01h\x01y' + subj });
    var textWidth = Math.max(1, textEndX - textStartX + 1);
    for (var i = 0; i < lines.length && i < hf.height; i++) {
        var info = lines[i];
        var label = !!info.label ? '\x01h\x01c' + info.label + ':\x01n ' : '';
        var value = info.value || '';
        var text = label + value;
        if (text.length > textWidth) text = text.substr(0, textWidth);
        try { hf.gotoxy(textStartX, i + 1); hf.putmsg(text); } catch (e) { }
    }
    if (haveAvatar) {
        try {
            var bin = (typeof base64_decode === 'function') ? base64_decode(avatarInfo.obj.data) : null;
            if (bin && bin.length >= avatarWidth * avatarHeight * 2) {
                if (!this._blitAvatarToFrame) {
                    this._blitAvatarToFrame = function (frame, binData, w, h, dstX, dstY) {
                        var offset = 0; for (var y = 0; y < h; y++) { for (var x = 0; x < w; x++) { if (offset + 1 >= binData.length) return; var ch = binData.substr(offset++, 1); var attr = ascii(binData.substr(offset++, 1)); try { frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); } catch (se) { } } }
                    };
                }
                var drawWidth = Math.min(avatarWidth, hf.width);
                var drawHeight = Math.min(avatarHeight, hf.height);
                var startX = Math.max(textStartX, hf.width - drawWidth + 1);
                this._blitAvatarToFrame(hf, bin, drawWidth, drawHeight, startX, 1);
            }
        } catch (be) { }
    }
    if (this._readGroupIconFrame && this._readGroupIconHotspotKey) {
        try { this._readGroupIconFrame.cycle(); } catch (_grpCycle) { }
        this._hotspotMap = this._hotspotMap || {};
        this._hotspotMap[this._readGroupIconHotspotKey] = 'read-group-icon';
        if (this._readGroupIconHotspotKey.length === 1) {
            var lowerGroupHot = this._readGroupIconHotspotKey.toLowerCase();
            if (lowerGroupHot !== this._readGroupIconHotspotKey) this._hotspotMap[lowerGroupHot] = 'read-group-icon';
        }
        var gMinX = this._readGroupIconFrame.x;
        var gMaxX = this._readGroupIconFrame.x + this._readGroupIconFrame.width - 1;
        for (var gy = 0; gy < this._readGroupIconFrame.height; gy++) {
            this._addHotspotArea(this._readGroupIconHotspotKey, false, gMinX, gMaxX, this._readGroupIconFrame.y + gy);
        }
        if (this._readGroupIconHotspotKey.length === 1) {
            var lowerGroupHotspot = this._readGroupIconHotspotKey.toLowerCase();
            if (lowerGroupHotspot !== this._readGroupIconHotspotKey) {
                for (var gy2 = 0; gy2 < this._readGroupIconFrame.height; gy2++) {
                    this._addHotspotArea(lowerGroupHotspot, false, gMinX, gMaxX, this._readGroupIconFrame.y + gy2);
                }
            }
        }
    }
    if (this._readSubIconFrame && this._readSubIconHotspotKey) {
        try { this._readSubIconFrame.cycle(); } catch (_subCycle) { }
        this._hotspotMap = this._hotspotMap || {};
        this._hotspotMap[this._readSubIconHotspotKey] = 'read-sub-icon';
        if (this._readSubIconHotspotKey.length === 1) {
            var lowerHot = this._readSubIconHotspotKey.toLowerCase();
            if (lowerHot !== this._readSubIconHotspotKey) this._hotspotMap[lowerHot] = 'read-sub-icon';
        }
        var minX = this._readSubIconFrame.x;
        var maxX = this._readSubIconFrame.x + this._readSubIconFrame.width - 1;
        for (var sy = 0; sy < this._readSubIconFrame.height; sy++) {
            this._addHotspotArea(this._readSubIconHotspotKey, false, minX, maxX, this._readSubIconFrame.y + sy);
        }
        if (this._readSubIconHotspotKey.length === 1) {
            var lowerHotspot = this._readSubIconHotspotKey.toLowerCase();
            if (lowerHotspot !== this._readSubIconHotspotKey) {
                for (var sy2 = 0; sy2 < this._readSubIconFrame.height; sy2++) {
                    this._addHotspotArea(lowerHotspot, false, minX, maxX, this._readSubIconFrame.y + sy2);
                }
            }
        }
    }
    try { hf.cycle(); } catch (e) { }
    this._applyPendingHotspots();
};

// Fetch avatar for a message without rendering. Returns {obj, attempts:[{netaddr,username,ok,reason}], chosen:{...}}
MessageBoard.prototype._fetchAvatarForMessage = function (msg) {
    if (!this._avatarLib || !msg) return null; var full = msg;
    // Re-fetch full header if needed
    if (!full.from_net_addr && full.number && this.cursub) {
        try { var mb = new MsgBase(this.cursub); if (mb.open()) { var fh = mb.get_msg_header(false, full.number, true); if (fh) { fh.number = full.number; full = fh; } mb.close(); } } catch (e) { log('avatar refetch header error: ' + e); }
    }
    if (!this._deriveAvatarCandidates) {
        this._deriveAvatarCandidates = function (h) {
            var cands = []; if (!h) return cands; var uname = h.from || h.from_net || 'unknown';
            function push(addr, reason) { if (!addr) return; addr = '' + addr; for (var i = 0; i < cands.length; i++) { if (cands[i].netaddr === addr) return; } cands.push({ username: uname, netaddr: addr, reason: reason }); }
            if (h.from_net_addr) push(h.from_net_addr, 'from_net_addr');
            if (h.from_org) push(h.from_org, 'from_org');
            function hostToQWK(idstr) { if (!idstr) return; var m = idstr.match(/<[^@]+@([^>]+)>/); if (!m) return; var host = m[1]; var first = host.split('.')[0]; if (!first) return; first = first.replace(/[^A-Za-z0-9_-]/g, ''); if (!first.length) return; var q = first.toUpperCase(); if (q.length > 8) q = q.substr(0, 8); if (!/^[A-Z][A-Z0-9_-]{1,7}$/.test(q)) return; return q; }
            var q1 = hostToQWK(h.id); if (q1) push(q1, 'id-host');
            var q2 = hostToQWK(h.reply_id); if (q2) push(q2, 'reply-id-host');
            return cands;
        };
    }
    var candidates = this._deriveAvatarCandidates(full);
    var attempts = []; var chosen = null; var avatarObj = null;
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i]; var obj = null; var ok = false;
        try { obj = this._avatarLib.read_netuser(c.username, c.netaddr); ok = !!(obj && obj.data); } catch (e) { obj = false; }
        attempts.push({ netaddr: c.netaddr, username: c.username, ok: ok, reason: c.reason });
        if (ok) { chosen = c; avatarObj = obj; break; }
    }
    this._lastAvatarObj = avatarObj || null;
    return { obj: avatarObj, attempts: attempts, chosen: chosen, msg: full };
};

MessageBoard.prototype._destroyReadFrames = function () {
    this._hideReadNotice({ skipRepaint: true });
    if (this._readGroupIconFrame) { try { this._readGroupIconFrame.close(); } catch (e) { } this._readGroupIconFrame = null; }
    if (this._readHeaderFrame) { try { this._readHeaderFrame.close(); } catch (e) { } this._readHeaderFrame = null; }
    if (this._readBodyFrame) { try { this._readBodyFrame.close(); } catch (e) { } this._readBodyFrame = null; }
    if (this._readBodyCanvas) { try { this._readBodyCanvas.close(); } catch (e) { } this._readBodyCanvas = null; }
    if (this._readSubIconFrame) { try { this._readSubIconFrame.close(); } catch (e) { } this._readSubIconFrame = null; }
    // Preserve currentMessageBody for quoting if a reply initiates immediately after frame teardown
    this._setReadBodyText('');
    this._readScroll = 0;
    this._readBodyTotalLines = 0;
    this._readBodyHasAnsi = false;
    this._readMessageMetadata = null;
};

MessageBoard.prototype._destroyThreadUI = function () {
    if (this._threadSearchButton && typeof this._threadSearchButton.destroy === 'function') {
        try { this._threadSearchButton.destroy(); } catch (_btnErr) { }
    }
    this._threadSearchButton = null;
    if (this._threadToggleButton && typeof this._threadToggleButton.destroy === 'function') {
        try { this._threadToggleButton.destroy(); } catch (_toggleErr) { }
    }
    this._threadToggleButton = null;
    if (this._threadControlsFrame) {
        try { this._threadControlsFrame.close(); } catch (_ctrlErr) { }
    }
    if (this._threadListFrame && this._threadListFrame !== this.outputFrame) {
        try { this._threadListFrame.close(); } catch (_listErr) { }
    }
    if (this._threadContentFrame && this._threadContentFrame !== this.outputFrame && this._threadContentFrame !== this._threadListFrame) {
        try { this._threadContentFrame.close(); } catch (_contentErr) { }
    }
    if (this._threadSearchFrame && this._threadSearchFrame !== this.outputFrame) {
        try { this._threadSearchFrame.close(); } catch (_searchErr) { }
    }
    this._threadControlsFrame = null;
    this._threadListFrame = null;
    this._threadContentFrame = null;
    this._threadSearchFrame = null;
};

MessageBoard.prototype._storeFullHeader = function (hdr) {
    if (!hdr || typeof hdr.number === 'undefined' || hdr.number === null) return;
    if (!this._fullHeaders) this._fullHeaders = {};
    this._fullHeaders[hdr.number] = hdr;
    if (this._threadSequenceCache) {
        var rootId = hdr.thread_id || hdr.number;
        if (rootId) {
            var code = this.cursub || this._lastActiveSubCode || bbs.cursub_code || '';
            var cacheKey = code + ':' + rootId;
            if (this._threadSequenceCache.hasOwnProperty(cacheKey)) delete this._threadSequenceCache[cacheKey];
        }
    }
};

MessageBoard.prototype._ensureThreadContentFrame = function () {
    if (!this.outputFrame) return;
    var base = this.outputFrame;
    var parent = base.parent || base;
    var controlsHeight = 3;
    var marginHeight = 0;
    var totalReserved = controlsHeight + marginHeight;
    if (base.height <= controlsHeight) {
        controlsHeight = Math.max(1, Math.min(base.height - 1, controlsHeight));
        marginHeight = Math.max(0, Math.min(base.height - controlsHeight - 1, marginHeight));
        totalReserved = Math.max(0, controlsHeight + marginHeight);
    }
    var listHeight = Math.max(1, base.height - totalReserved);
    var controlsAttr = this.paletteAttr('THREAD_CONTROLS', BG_BLACK | LIGHTGRAY);
    var listAttr = this.paletteAttr('THREAD_LIST', base.attr || (BG_BLACK | LIGHTGRAY));
    var searchButtonAttr = this.paletteAttr('THREAD_SEARCH_BUTTON', controlsAttr);
    var searchButtonFocusAttr = this.paletteAttr('THREAD_SEARCH_BUTTON_FOCUS', BG_LIGHTGRAY | BLACK);
    var backButtonAttr = this.paletteAttr('THREAD_BACK_BUTTON', controlsAttr);
    var backButtonFocusAttr = this.paletteAttr('THREAD_BACK_BUTTON_FOCUS', BG_LIGHTGRAY | BLACK);
    var toggleButtonAttr = this.paletteAttr('THREAD_TOGGLE_BUTTON', controlsAttr);
    var toggleButtonFocusAttr = this.paletteAttr('THREAD_TOGGLE_BUTTON_FOCUS', BG_LIGHTGRAY | BLACK);
    var statusGroupAttr = this.paletteAttr('THREAD_STATUS_GROUP', controlsAttr);
    var statusSepAttr = this.paletteAttr('THREAD_STATUS_SEPARATOR', controlsAttr);
    var statusSubAttr = this.paletteAttr('THREAD_STATUS_SUB', controlsAttr);

    var controlsX = base.x;
    var controlsY = base.y;
    var listY = base.y + totalReserved;
    var maxListY = base.y + base.height - listHeight;
    if (listY > maxListY) listY = maxListY;
    if (listY < base.y) listY = base.y;

    var controlsChanged = !this._threadControlsFrame
        || this._threadControlsFrame.width !== base.width
        || this._threadControlsFrame.height !== controlsHeight
        || this._threadControlsFrame.x !== controlsX
        || this._threadControlsFrame.y !== controlsY;
    if (controlsChanged) {
        if (this._threadControlsFrame) {
            try { this._threadControlsFrame.close(); } catch (_ctrlCloseErr) { }
        }
        this._threadControlsFrame = new Frame(controlsX, controlsY, base.width, controlsHeight, controlsAttr, parent);
        try { this._threadControlsFrame.open(); } catch (_ctrlOpenErr) { }
    }
    if (this._threadControlsFrame) {
        this._threadControlsFrame.attr = controlsAttr;
        try { this._threadControlsFrame.clear(controlsAttr); } catch (_ctrlClrErr) { }
    }

    var listChanged = !this._threadListFrame
        || this._threadListFrame.width !== base.width
        || this._threadListFrame.height !== listHeight
        || this._threadListFrame.x !== controlsX
        || this._threadListFrame.y !== listY;
    if (listChanged) {
        if (this._threadListFrame && this._threadListFrame !== this.outputFrame) {
            try { this._threadListFrame.close(); } catch (_listCloseErr) { }
        }
        this._threadListFrame = new Frame(controlsX, listY, base.width, listHeight, listAttr, parent);
        try { this._threadListFrame.open(); } catch (_listOpenErr) { }
    }
    if (this._threadListFrame) {
        this._threadListFrame.attr = listAttr;
    }

    if (this._threadSearchButton && typeof this._threadSearchButton.destroy === 'function') {
        try { this._threadSearchButton.destroy(); } catch (_btnDestroyErr) { }
    }
    if (this._threadBackButton && typeof this._threadBackButton.destroy === 'function') {
        try { this._threadBackButton.destroy(); } catch (_backDestroyErr) { }
    }
    if (this._threadToggleButton && typeof this._threadToggleButton.destroy === 'function') {
        try { this._threadToggleButton.destroy(); } catch (_toggleDestroyErr) { }
    }
    this._threadSearchButton = null;
    this._threadBackButton = null;
    this._threadToggleButton = null;

    if (this._threadControlsFrame && this._threadControlsFrame.width >= 4 && this._threadControlsFrame.height >= 2) {
        var self = this;
        var rowY = Math.min(this._threadControlsFrame.height, 3);
        if (rowY <= 1) rowY = Math.min(this._threadControlsFrame.height, 2);
        var frameWidth = this._threadControlsFrame.width;
        var leftMargin = 2;
        var rightMargin = 1;
        var gap = 2;
        var backLabel = 'Back';
        var toggleLabel = this._computeThreadToggleLabel();
        var searchLabel = '[S] Search';
        var maxToggleLabelLen = 0;
        var toggleSamples = ['[F] Flat View', '[T] Thread View', 'Toggle View'];
        for (var ts = 0; ts < toggleSamples.length; ts++) {
            if (toggleSamples[ts].length > maxToggleLabelLen) maxToggleLabelLen = toggleSamples[ts].length;
        }
        function calcButtonWidth(label, minWidth) {
            return Math.max(minWidth, Math.min(frameWidth, label.length + 2));
        }
        var backWidthMin = Math.max(6, backLabel.length + 2);
        var toggleWidthMin = Math.max(10, maxToggleLabelLen + 2);
        var searchWidthMin = Math.max(8, searchLabel.length + 2);
        var backWidth = calcButtonWidth(backLabel, backWidthMin);
        var toggleWidth = calcButtonWidth(toggleLabel, toggleWidthMin);
        var searchWidth = calcButtonWidth(searchLabel, searchWidthMin);
        var backX = leftMargin;
        var toggleX = backX + backWidth + gap;
        var searchX = frameWidth - rightMargin - searchWidth + 1;
        var minStatusWidth = 12;
        var groupName = this._getCurrentGroupDisplayName ? this._getCurrentGroupDisplayName() : '';
        var subName = this._getCurrentSubDisplayName ? this._getCurrentSubDisplayName() : '';
        var statusTextLen = 0;
        if (groupName) statusTextLen += groupName.length;
        if (subName) statusTextLen += (statusTextLen ? 3 : 0) + subName.length;
        if (statusTextLen) minStatusWidth = Math.max(minStatusWidth, statusTextLen + 4);
        var ensureStatusGap = function () {
            var statusWidth = searchX - (toggleX + toggleWidth) - gap;
            return statusWidth;
        };
        var statusWidth = ensureStatusGap();
        if (statusWidth < minStatusWidth) {
            var needed = minStatusWidth - statusWidth;
            var shrinkSearch = Math.min(needed, Math.max(0, searchWidth - searchWidthMin));
            if (shrinkSearch > 0) {
                searchWidth -= shrinkSearch;
                searchX = frameWidth - rightMargin - searchWidth + 1;
                needed -= shrinkSearch;
                statusWidth = ensureStatusGap();
            }
            if (needed > 0) {
                var shrinkToggle = Math.min(needed, Math.max(0, toggleWidth - toggleWidthMin));
                if (shrinkToggle > 0) {
                    toggleWidth -= shrinkToggle;
                    toggleX = backX + backWidth + gap;
                    needed -= shrinkToggle;
                }
                statusWidth = ensureStatusGap();
            }
            if (needed > 0) {
                var shrinkBack = Math.min(needed, Math.max(0, backWidth - backWidthMin));
                if (shrinkBack > 0) {
                    backWidth -= shrinkBack;
                    toggleX = backX + backWidth + gap;
                    searchX = frameWidth - rightMargin - searchWidth + 1;
                }
                statusWidth = ensureStatusGap();
            }
        }
        statusWidth = ensureStatusGap();

        this._threadBackButton = new Button({
            parentFrame: this._threadControlsFrame,
            x: backX,
            y: rowY,
            width: backWidth,
            height: Math.min(2, this._threadControlsFrame.height - rowY + 1),
            attr: backButtonAttr,
            focusAttr: backButtonFocusAttr,
            label: 'Back',
            onClick: function () {
                self._handleKey('\x1b');
            }
        });

        this._threadToggleButton = new Button({
            parentFrame: this._threadControlsFrame,
            x: toggleX,
            y: rowY,
            width: toggleWidth,
            height: Math.min(2, this._threadControlsFrame.height - rowY + 1),
            attr: toggleButtonAttr,
            focusAttr: toggleButtonFocusAttr,
            label: toggleLabel,
            onClick: function () {
                self._toggleThreadFlatView();
            }
        });

        this._threadSearchButton = new Button({
            parentFrame: this._threadControlsFrame,
            x: searchX,
            y: rowY,
            width: searchWidth,
            height: Math.min(2, this._threadControlsFrame.height - rowY + 1),
            attr: searchButtonAttr,
            focusAttr: searchButtonFocusAttr,
            label: '[S] Search',
            onClick: function () {
                self._promptSearch(self.cursub || self._lastActiveSubCode || null, 'threads');
            }
        });

        if (this._threadBackButton && this._threadBackButton.frame && typeof this._threadBackButton.frame.cycle === 'function') {
            try { this._threadBackButton.frame.cycle(); } catch (_backCycleErr) { }
        }
        if (this._threadToggleButton && this._threadToggleButton.frame && typeof this._threadToggleButton.frame.cycle === 'function') {
            try { this._threadToggleButton.frame.cycle(); } catch (_toggleCycleErr) { }
        }
        if (this._threadSearchButton && this._threadSearchButton.frame && typeof this._threadSearchButton.frame.cycle === 'function') {
            try { this._threadSearchButton.frame.cycle(); } catch (_btnCycleErr2) { }
        }

        this._renderThreadControlsStatus({
            row: Math.max(1, rowY - 1),
            leftBound: toggleX + toggleWidth - 1,
            rightBound: searchX,
            baseAttr: controlsAttr,
            preferredCenter: Math.floor((this._threadControlsFrame.width + 1) / 2),
            groupAttr: statusGroupAttr,
            separatorAttr: statusSepAttr,
            subAttr: statusSubAttr
        });

        this._updateThreadToggleButtonLabel();
    }

    if (this._threadControlsFrame) {
        try { this._threadControlsFrame.cycle(); } catch (_ctrlCycleErr) { }
    }

    this._threadSearchFrame = null;
    this._threadContentFrame = this._threadListFrame || this.outputFrame;
    this._registerThreadSearchHotspot();
    this._updateThreadToggleButtonLabel();
};

MessageBoard.prototype._registerThreadSearchHotspot = function () {
    var frame = null;
    var frames = [];
    if (this._threadSearchButton && this._threadSearchButton.frame) frames.push({ frame: this._threadSearchButton.frame, type: 'threads-search', keys: ['/'] });
    if (this._threadBackButton && this._threadBackButton.frame) frames.push({ frame: this._threadBackButton.frame, type: 'threads-back', keys: ['\x1b'] });
    if (this._threadToggleButton && this._threadToggleButton.frame) {
        var toggleKeys = [];
        if (this.view === 'threads') toggleKeys = ['F', 'f'];
        else if (this.view === 'flat') toggleKeys = ['T', 't'];
        else toggleKeys = ['F', 'f'];
        frames.push({ frame: this._threadToggleButton.frame, type: 'threads-toggle', keys: toggleKeys });
    }
    if (!frames.length && this._threadControlsFrame) frames.push({ frame: this._threadControlsFrame, type: 'threads-search', keys: ['/'] });
    if (!frames.length) return;
    if (!this._hotspotMap) this._hotspotMap = {};
    for (var fIdx = 0; fIdx < frames.length; fIdx++) {
        var entry = frames[fIdx];
        var fr = entry.frame;
        if (!fr) continue;
        var minX = fr.x;
        var maxX = fr.x + fr.width - 1;
        var minY = fr.y - 1;
        if (minY < 1) minY = 1;
        var maxY = fr.y + fr.height - 1;
        if (maxX < minX || maxY < minY) continue;
        var hotKeys = entry.keys || [];
        for (var hk = 0; hk < hotKeys.length; hk++) {
            this._hotspotMap[hotKeys[hk]] = entry.type;
        }
        for (var y = minY; y <= maxY; y++) {
            for (var hk2 = 0; hk2 < hotKeys.length; hk2++) {
                this._addHotspotArea(hotKeys[hk2], false, minX, maxX, y);
            }
        }
    }
    this._applyPendingHotspots();
};

MessageBoard.prototype._renderThreadControlsStatus = function (opts) {
    if (!opts) opts = {};
    var frame = this._threadControlsFrame;
    if (!frame) return;
    var row = typeof opts.row === 'number' ? opts.row : 2;
    if (row < 1 || row > frame.height) row = Math.min(frame.height, Math.max(1, row));
    var leftBound = (typeof opts.leftBound === 'number') ? opts.leftBound : 0;
    var rightBound = (typeof opts.rightBound === 'number') ? opts.rightBound : frame.width + 1;
    var baseAttr = (typeof opts.baseAttr === 'number') ? opts.baseAttr : frame.attr;
    var groupAttr = (typeof opts.groupAttr === 'number') ? opts.groupAttr : baseAttr;
    var separatorAttr = (typeof opts.separatorAttr === 'number') ? opts.separatorAttr : baseAttr;
    var subAttr = (typeof opts.subAttr === 'number') ? opts.subAttr : baseAttr;

    var startCol = Math.max(1, leftBound + 1);
    var endCol = Math.min(frame.width, rightBound - 1);
    if (endCol <= startCol) return;
    var available = endCol - startCol + 1;
    if (available < 3) return;

    var groupName = this._getCurrentGroupDisplayName();
    var subName = this._getCurrentSubDisplayName();
    if (!groupName && !subName) return;
    var separator = (groupName && subName) ? ' - ' : '';
    var groupText = groupName || '';
    var subText = subName || '';

    var totalLen = groupText.length + separator.length + subText.length;
    if (!totalLen) return;
    if (totalLen > available) {
        var target = available;
        if (separator.length && available < separator.length + 2) separator = '';
        while (groupText.length + separator.length + subText.length > target) {
            if (subText.length > groupText.length && subText.length > 1) subText = subText.substr(0, subText.length - 1);
            else if (groupText.length > 1) groupText = groupText.substr(0, groupText.length - 1);
            else {
                if (subText.length > 0) subText = subText.substr(0, Math.max(0, target - separator.length));
                break;
            }
        }
        totalLen = groupText.length + separator.length + subText.length;
        if (!totalLen || totalLen > available) return;
    }
    var preferredCenter = (typeof opts.preferredCenter === 'number') ? opts.preferredCenter : Math.floor((frame.width + 1) / 2);
    if (preferredCenter < startCol) preferredCenter = startCol;
    if (preferredCenter > endCol) preferredCenter = endCol;
    var start = preferredCenter - Math.floor(totalLen / 2);
    if (start < startCol) start = startCol;
    if (start + totalLen - 1 > endCol) start = Math.max(startCol, endCol - totalLen + 1);
    var cursor = start;

    try {
        frame.attr = baseAttr;
        frame.gotoxy(startCol, row);
        frame.putmsg(new Array(available + 1).join(' '));
    } catch (_clearErr) { }

    var self = this;
    function writeSegment(text, colorKey, attrFallback) {
        if (!text || !text.length) return;
        var maxLen = endCol - cursor + 1;
        if (maxLen <= 0) return;
        var segment = text;
        if (segment.length > maxLen) segment = segment.substr(0, maxLen);
        try {
            frame.gotoxy(cursor, row);
            var colored = (colorKey && typeof self.colorize === 'function')
                ? self.colorize(colorKey, segment, { reset: false })
                : segment;
            if (colored === segment && typeof attrFallback === 'number') {
                frame.attr = attrFallback;
                frame.putmsg(segment);
            } else {
                frame.putmsg(colored);
            }
        } catch (_segErr) { }
        cursor += segment.length;
    }

    writeSegment(groupText, 'THREAD_STATUS_GROUP', groupAttr);
    writeSegment(separator, 'THREAD_STATUS_SEPARATOR', separatorAttr);
    writeSegment(subText, 'THREAD_STATUS_SUB', subAttr);
    try {
        frame.putmsg(this.colorReset());
        frame.attr = baseAttr;
    } catch (_resetErr) { }
    frame.attr = baseAttr;
};

// Export constructor globally
// Static convenience launcher so shell code can do: MessageBoard.launch(shell, cb)
MessageBoard.launch = function (shell, cb, opts) {
    opts = opts || {};
    var createdParent = null;
    if (!opts.parentFrame && shell && shell.root) {
        var root = shell.root;
        if (root && typeof root.width === 'number' && typeof root.height === 'number') {
            var attr = (typeof root.attr === 'number') ? root.attr
                : ((typeof ICSH_VALS !== 'undefined' && ICSH_VALS.VIEW && typeof ICSH_VALS.VIEW.BG === 'number' && typeof ICSH_VALS.VIEW.FG === 'number')
                    ? (ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG)
                    : ((typeof BG_BLACK !== 'undefined' && typeof LIGHTGRAY !== 'undefined') ? (BG_BLACK | LIGHTGRAY) : 0));
            try {
                createdParent = new Frame(root.x, root.y, root.width, root.height, attr, root);
                createdParent.open();
                opts.parentFrame = createdParent;
            } catch (_createParentErr) {
                if (createdParent && typeof createdParent.close === 'function') {
                    try { createdParent.close(); } catch (_closeErr) { }
                }
                createdParent = null;
            }
        }
    }
    if (!opts.parentFrame) opts.parentFrame = (shell && shell.subFrame) || (shell && shell.root) || null;
    opts.shell = shell || opts.shell;
    var mb;
    try {
        mb = new MessageBoard(opts);
    } catch (err) {
        if (createdParent && typeof createdParent.close === 'function') {
            try { createdParent.close(); } catch (_cleanupErr) { }
        }
        throw err;
    }
    if (createdParent) {
        mb._ownsParentFrame = true; // ensure cleanup closes our custom parent frame
    }
    mb.enter(function () { if (typeof cb === 'function') cb(); });
    if (opts.autoCycle) mb.autoCycle = true;
    if (mb.autoCycle) mb.cycle();
    return mb;
};

// ---- Internal helpers (private-ish) ----
MessageBoard.prototype._writeStatus = function (msg) {
    if (!this.inputFrame) return;
    if (this._navSearchActive) {
        this._paintInlineSearchPrompt();
        return;
    }
    var prefix = this._getCurrentSubName();
    var text = msg || '';
    if (prefix && prefix.length) text = prefix + ' | ' + text;
    this.inputFrame.clear(this.paletteAttr('INPUT_FRAME')); this.inputFrame.home();
    this.inputFrame.putmsg(truncsp(text).substr(0, this.inputFrame.width));
    this._renderTitleFrame();
};

MessageBoard.prototype._calcGridMetrics = function () {
    var w = this.outputFrame.width, h = this.outputFrame.height;
    var iconW = ICSH_CONSTANTS ? ICSH_CONSTANTS.ICON_W : 10;
    var iconH = ICSH_CONSTANTS ? ICSH_CONSTANTS.ICON_H : 6;
    var cellW = iconW + 2; var cellH = iconH + 1 + 2; // +label +padding
    var topPadding = 1; // leave one row blank above the grid for visual breathing room
    var usableHeight = Math.max(0, h - topPadding);
    var cols = Math.max(1, Math.floor(w / cellW));
    var rows = Math.max(1, Math.floor(usableHeight / cellH));
    return {
        iconW: iconW,
        iconH: iconH,
        cols: cols,
        rows: rows,
        cellW: cellW,
        cellH: cellH,
        topPadding: topPadding
    };
};

MessageBoard.prototype._ensureSubIndex = function () {
    if (this._subIndex) return this._subIndex;
    var map = {};
    if (msg_area && msg_area.grp_list) {
        for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
            var grp = msg_area.grp_list[gi];
            if (!grp || !grp.sub_list) continue;
            for (var si = 0; si < grp.sub_list.length; si++) {
                var sub = grp.sub_list[si];
                if (!sub || !sub.code) continue;
                map[sub.code] = { name: sub.name || sub.code, groupIndex: gi, subIndex: si };
            }
        }
    }
    this._subIndex = map;
    return map;
};

MessageBoard.prototype._getSubNameByCode = function (code) {
    if (!code) return '';
    var idx = this._ensureSubIndex();
    if (idx && idx.hasOwnProperty(code)) return idx[code].name || code;
    return '';
};

MessageBoard.prototype._getCurrentSubName = function () {
    var code = this.cursub || bbs.cursub_code || this._lastActiveSubCode || null;
    if (!code) return '';
    return this._getSubNameByCode(code);
};

MessageBoard.prototype._resolveGroupByIndex = function (index) {
    if (typeof index !== 'number' || index < 0) return null;
    if (!msg_area || !msg_area.grp_list || index >= msg_area.grp_list.length) return null;
    return msg_area.grp_list[index] || null;
};

MessageBoard.prototype._resolveSubByCode = function (code) {
    if (!code) return null;
    var map = this._ensureSubIndex();
    if (!map || !map.hasOwnProperty(code)) return null;
    var entry = map[code];
    if (!entry) return null;
    var grp = this._resolveGroupByIndex(entry.groupIndex);
    if (!grp || !grp.sub_list || typeof entry.subIndex !== 'number') return null;
    if (entry.subIndex < 0 || entry.subIndex >= grp.sub_list.length) return null;
    return grp.sub_list[entry.subIndex] || null;
};

MessageBoard.prototype._getCurrentGroupDisplayName = function () {
    var grpIndex = (typeof this.curgrp === 'number') ? this.curgrp : null;
    if (grpIndex === null && typeof bbs !== 'undefined' && typeof bbs.curgrp === 'number') grpIndex = bbs.curgrp;
    var grp = this._resolveGroupByIndex(grpIndex);
    if (!grp) return '';
    return (grp.description || grp.desc || grp.name || grp.code || '').trim();
};

MessageBoard.prototype._getCurrentSubDisplayName = function () {
    var code = this.cursub || bbs.cursub_code || this._lastActiveSubCode || null;
    var sub = this._resolveSubByCode(code);
    if (!sub) return '';
    return (sub.description || sub.desc || sub.name || sub.code || '').trim();
};

MessageBoard.prototype._highlightQuery = function (text, query, resume) {
    if (!text || !query) return text || '';
    resume = resume || ''; // already handles reset codes outside
    var pattern;
    try {
        var esc = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        pattern = new RegExp(esc, 'ig');
    } catch (e) { return text; }
    return ('' + text).replace(pattern, function (match) { return '\x01h\x01y' + match + resume; });
};

MessageBoard.prototype._syncSubState = function (code) {
    if (!code) return null;
    var changed = (this._cachedSubCode && this._cachedSubCode !== code);
    this.cursub = code;
    try { if (bbs && typeof bbs.cursub_code !== 'undefined') bbs.cursub_code = code; } catch (e) { }
    try { if (user && typeof user.cursub !== 'undefined') user.cursub = code; } catch (e) { }
    var subIndex = null;
    var groupIndex = this.curgrp;
    var map = this._ensureSubIndex();
    if (map && map.hasOwnProperty(code)) {
        var entry = map[code];
        if (entry) {
            if (typeof entry.subIndex === 'number') subIndex = entry.subIndex;
            if (typeof entry.groupIndex === 'number') groupIndex = entry.groupIndex;
        }
    }
    if (typeof groupIndex === 'number' && groupIndex >= 0) {
        this.curgrp = groupIndex;
        try { if (bbs && typeof bbs.curgrp !== 'undefined') bbs.curgrp = groupIndex; } catch (e) { }
    }
    if (typeof subIndex === 'number' && subIndex >= 0) {
        try { if (bbs && typeof bbs.cursub !== 'undefined') bbs.cursub = subIndex; } catch (e) { }
    }
    if (changed) {
        this._fullHeaders = {};
        this._threadSequenceCache = {};
    }
    this._cachedSubCode = code;
    return { code: code, groupIndex: groupIndex, subIndex: subIndex };
};

MessageBoard.prototype._getIconAliasMap = function () {
    if (!this._iconAliasMap) this._iconAliasMap = _mbLoadIconAliasMap();
    return this._iconAliasMap;
};

MessageBoard.prototype._resolveBoardIcon = function (name, type) {
    var fallback = BOARD_ICONS[type];
    if (!fallback) fallback = (type === 'group') ? 'folder' : 'bulletin_board';
    var resolved = _mbFindIconBase(name);
    if (resolved) return resolved;
    // Try resolving on type as secondary hint before falling back
    if (type && type !== name) {
        resolved = _mbFindIconBase(type);
        if (resolved) return resolved;
    }
    return fallback;
};

MessageBoard.prototype._promptSearch = function (preferredCode, returnView, searchScope) {
    this._ensureFrames();
    // For multi-scope searches, we don't need a specific code upfront
    var code = preferredCode || (searchScope !== 'all' && searchScope !== 'group' ? (this.cursub || this._lastActiveSubCode || bbs.cursub_code) : null) || null;
    var needsCode = (searchScope !== 'all' && searchScope !== 'group');
    if (needsCode && !code) {
        this._writeStatus('SEARCH: Select a sub first');
        return;
    }
    if (code) this._lastActiveSubCode = code;
    if (typeof Modal === 'undefined') {
        try { load('future_shell/lib/util/layout/modal.js'); } catch (_modalLoadErr) { }
    }
    var parent = this.parentFrame || this.hostFrame || this.inputFrame || this.outputFrame;
    if (this.view === 'threads' && this._threadContentFrame) {
        parent = this._threadContentFrame;
    }
    if (typeof Modal === 'function' && parent) {
        if (this._activeSearchModal && typeof this._activeSearchModal.close === 'function') {
            try { this._activeSearchModal.close(); } catch (_eCloseExisting) { }
        }
        var self = this;
        var searchLabel = '';
        log('[SEARCH DEBUG] searchScope=' + JSON.stringify(searchScope) + ' code=' + JSON.stringify(code) + ' curgrp=' + JSON.stringify(this.curgrp));
        if (searchScope === 'all') {
            searchLabel = 'All Groups';
        } else if (searchScope === 'group') {
            var grpName = (msg_area && msg_area.grp_list && typeof this.curgrp === 'number' && msg_area.grp_list[this.curgrp]) ? msg_area.grp_list[this.curgrp].name : 'Current Group';
            searchLabel = grpName;
            log('[SEARCH DEBUG] group search: grpName=' + JSON.stringify(grpName));
        } else {
            searchLabel = this._getSubNameByCode(code) || code || '';
            log('[SEARCH DEBUG] single sub search: searchLabel=' + JSON.stringify(searchLabel));
        }
        var modal = new Modal({
            parentFrame: parent,
            overlay: false,
            type: 'prompt',
            title: 'Search Messages',
            message: searchLabel ? ('Search ' + searchLabel) : 'Search',
            okLabel: 'Search',
            cancelLabel: 'Cancel',
            defaultValue: (this._searchQuery && (!code || this._lastActiveSubCode === code)) ? this._searchQuery : '',
            onSubmit: function (value) {
                var term = (value || '').trim();
                if (!term.length) {
                    self._writeStatus('SEARCH: Enter a search term');
                    return;
                }
                self._searchReturnView = returnView || self.view;
                self._writeStatus('SEARCH: searching...');
                try { modal.close(); } catch (_eModalClose) { }
                self._executeSearch(code, term, searchScope);
            },
            onCancel: function () {
                self._searchReturnView = null;
                self._writeStatus('SEARCH cancelled');
                try { self._rebuildActiveHotspots(); } catch (_eReHotspot) { try { self.draw(); } catch (_eRedraw) { } }
            },
            onClose: function () {
                self._activeSearchModal = null;
                try { self._rebuildActiveHotspots(); } catch (_eReHotspot) { try { self.draw(); } catch (_eRedraw) { } }
            }
        });
        this._activeSearchModal = modal;
        return;
    }
    if (this._beginInlineSearchPrompt(code, returnView, searchScope)) return;
    var subName = this._getSubNameByCode(code) || code;
    this._writeStatus('SEARCH: Unable to open inline prompt for ' + subName);
};

MessageBoard.prototype._scanMessagesAddressedToUser = function (opts) {
    opts = opts || {};
    var now = 0;
    if (typeof Date !== 'undefined' && Date.now) now = Date.now();
    else if (typeof time === 'function') now = time() * 1000;
    if (this._scanInProgress) {
        this._writeStatus('SCAN: Already in progress...');
        return;
    }
    if (this._lastScanTimestamp && now && (now - this._lastScanTimestamp) < 750) {
        this._writeStatus('SCAN: Please wait...');
        return;
    }
    if (typeof bbs === 'undefined' || typeof bbs.scan_subs !== 'function') {
        this._writeStatus('SCAN: Feature unavailable');
        return;
    }
    this._scanInProgress = true;
    var mode = 0;
    if (typeof SCAN_TOYOU !== 'undefined') mode |= SCAN_TOYOU;
    if (typeof SCAN_UNREAD !== 'undefined') mode |= SCAN_UNREAD;
    if (!mode && typeof SCAN_NEW !== 'undefined') mode |= SCAN_NEW;
    try {
        if (typeof console !== 'undefined' && typeof console.clear === 'function') console.clear();
        if (mode) bbs.scan_subs(mode, true);
        else bbs.scan_subs(undefined, true);
        console.pause();
    } catch (e) {
        this._writeStatus('SCAN: Unable to start scan');
    } finally {
        this._scanInProgress = false;
        if (now) this._lastScanTimestamp = now;
        try { this._writeStatus('Scan complete'); } catch (_) { }
        if (opts.refreshView !== false) {
            try {
                if (typeof this._renderCurrentView === 'function') this._renderCurrentView(this.view || 'group');
                else if (typeof this.draw === 'function') this.draw();
            } catch (_) { }
        }
    }
};


MessageBoard.prototype._executeSearch = function (code, query, searchScope) {
    // searchScope: undefined/null (single sub), 'group' (all subs in current group), 'all' (all groups/subs)
    var results = [];
    var codes = [];
    var self = this;

    // Determine which sub codes to search
    if (searchScope === 'all' && msg_area && msg_area.grp_list) {
        // Search all groups and subs
        for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
            var grp = msg_area.grp_list[gi];
            if (grp && grp.sub_list) {
                for (var si = 0; si < grp.sub_list.length; si++) {
                    var sub = grp.sub_list[si];
                    if (sub && sub.code) codes.push(sub.code);
                }
            }
        }
    } else if (searchScope === 'group' && msg_area && msg_area.grp_list && typeof this.curgrp === 'number') {
        // Search all subs in the current group
        var grp = msg_area.grp_list[this.curgrp];
        if (grp && grp.sub_list) {
            for (var si = 0; si < grp.sub_list.length; si++) {
                var sub = grp.sub_list[si];
                if (sub && sub.code) codes.push(sub.code);
            }
        }
    } else {
        // Search single sub
        if (code) codes.push(code);
    }

    // Search all applicable codes
    for (var ci = 0; ci < codes.length; ci++) {
        var searchCode = codes[ci];
        if (!searchCode) continue;
        if (ci === 0) this._lastActiveSubCode = searchCode;

        var mb = new MsgBase(searchCode);
        if (!mb.open()) continue;

        try {
            var total = mb.total_msgs || 0;
            for (var n = 1; n <= total; n++) {
                var hdr = mb.get_msg_header(false, n, true);
                if (!hdr) continue;
                var matched = false;
                var fields = [hdr.subject, hdr.from, hdr.to, hdr.from_net, hdr.to_net, hdr.id, hdr.reply_id];
                var lowered = query.toLowerCase();
                for (var i = 0; i < fields.length && !matched; i++) {
                    var val = fields[i];
                    if (val && String(val).toLowerCase().indexOf(lowered) !== -1) matched = true;
                }
                var body = null;
                if (!matched) {
                    try { body = this._readMessageBody(mb, hdr); } catch (e) { body = null; }
                    if (body && body.toLowerCase().indexOf(lowered) !== -1) matched = true;
                }
                if (!matched) continue;
                if (body === null) {
                    try { body = this._readMessageBody(mb, hdr); } catch (e) { body = ''; }
                }
                var snippet = '';
                if (body) {
                    var clean = body.replace(/\r?\n/g, ' ');
                    var idx = clean.toLowerCase().indexOf(lowered);
                    if (idx !== -1) {
                        var start = Math.max(0, idx - 30);
                        var end = Math.min(clean.length, idx + query.length + 30);
                        snippet = clean.substring(start, end).replace(/\s+/g, ' ');
                        if (start > 0) snippet = '...' + snippet;
                        if (end < clean.length) snippet += '...';
                    }
                }
                if (!snippet && hdr.subject) snippet = hdr.subject;
                results.push({
                    code: searchCode,
                    header: hdr,
                    number: hdr.number,
                    subject: hdr.subject || '(no subject)',
                    from: hdr.from || hdr.from_net || 'unknown',
                    snippet: snippet
                });
            }
        } finally {
            try { mb.close(); } catch (e) { }
        }
    }
    if (!results.length) {
        this._writeStatus('SEARCH: No matches for "' + query + '"');
        var ret = this._searchReturnView || 'group';
        this._searchReturnView = null;
        if (ret === 'sub') {
            this._renderSubView(this.curgrp);
        } else if (ret === 'read') {
            if (this.lastReadMsg) this._renderReadView(this.lastReadMsg);
            else this._openSubReader(this.cursub);
        } else {
            this._renderGroupView();
        }
        return;
    }
    this._searchResults = results;
    this._searchSelection = 0;
    this._searchScrollOffset = 0;
    this._searchQuery = query;
    this.view = 'search';
    this._renderSearchResults();
};

MessageBoard.prototype._renderSearchResults = function () {
    var controller = this._getViewController('search');
    if (controller && typeof controller.enter === 'function') {
        return controller.enter.apply(controller, arguments);
    }
    return undefined;
};

MessageBoard.prototype._exitSearchResults = function () {
    this._releaseHotspots();
    var ret = this._searchReturnView || 'group';
    this._searchReturnView = null;
    if (ret === 'read') {
        if (this.lastReadMsg) this._renderReadView(this.lastReadMsg);
        else this._openSubReader(this.cursub);
    } else if (ret === 'sub') {
        this._renderSubView(this.curgrp);
    } else if (ret === 'threads') {
        if (typeof this._renderThreadsView === 'function') this._renderThreadsView(this.cursub);
        else this._openSubReader(this.cursub);
    } else {
        this._renderGroupView();
    }
};

MessageBoard.prototype._paintSearchResults = function () {
    var f = this.outputFrame; if (!f) return;
    try { f.clear(); } catch (e) { }
    // Check if results span multiple subs
    var multiSub = false;
    var resultCodes = {};
    if (this._searchResults && this._searchResults.length > 0) {
        for (var j = 0; j < this._searchResults.length; j++) {
            if (this._searchResults[j] && this._searchResults[j].code) {
                resultCodes[this._searchResults[j].code] = true;
            }
        }
        multiSub = Object.keys(resultCodes).length > 1;
    }
    var headerScope = multiSub ? 'multiple subs' : (this._getCurrentSubName() || '');
    var header = '\x01h\x01cSearch \x01h\x01y"' + this._searchQuery + '"\x01h\x01c in \x01h\x01y' + headerScope + '\x01h\x01c (' + this._searchResults.length + ' results)\x01n';
    if (header.length > f.width) header = header.substr(0, f.width);
    try { f.gotoxy(1, 1); f.putmsg(header); } catch (e) { }
    var usable = Math.max(1, f.height - 2);
    if (this._searchSelection < this._searchScrollOffset) this._searchScrollOffset = this._searchSelection;
    if (this._searchSelection >= this._searchScrollOffset + usable) this._searchScrollOffset = Math.max(0, this._searchSelection - usable + 1);
    var end = Math.min(this._searchResults.length, this._searchScrollOffset + usable);
    this._releaseHotspots();
    if (!this._hotspotMap) this._hotspotMap = {};
    var hotspotChars = this._hotspotChars || [];
    var usedHotspots = 0;
    for (var i = this._searchScrollOffset; i < end; i++) {
        var res = this._searchResults[i];
        var lineY = 2 + (i - this._searchScrollOffset);
        if (lineY > f.height) break;
        // Include sub code in display if results span multiple subs
        var line = this._padLeft('' + res.number, 5, ' ') + ' ' + this._padRight((res.from || '').substr(0, 12), 12, ' ') + ' ' + (res.subject || '');
        if (multiSub && res.code) {
            var subName = this._getSubNameByCode(res.code) || res.code;
            line = this._padRight(subName, 10, ' ') + ' ' + line;
        }
        if (res.snippet) line += ' - ' + res.snippet.replace(/\s+/g, ' ');
        if (line.length > f.width) line = line.substr(0, f.width - 3) + '...';
        var selected = (i === this._searchSelection);
        var resume = selected ? '\x01n\x01h' : '\x01n';
        line = this._highlightQuery(line, this._searchQuery, resume);
        if (selected) line = '\x01n\x01h' + line; else line = '\x01n' + line;
        try { f.gotoxy(1, lineY); f.putmsg(line); } catch (e) { }
        var cmd = null;
        if (usedHotspots < hotspotChars.length) {
            cmd = hotspotChars[usedHotspots++];
        }
        if (cmd) {
            this._hotspotMap[cmd] = 'search-result:' + i;
            this._addHotspotArea(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1);
        }
    }
    try { f.cycle(); } catch (e) { }
    this._writeStatus('SEARCH: Enter=Read  ESC/Bksp=Back  ' + (this._searchSelection + 1) + '/' + this._searchResults.length);
    this._applyPendingHotspots();
};

MessageBoard.prototype._handleSearchKey = function (key) {
    var controller = this._getViewController('search');
    if (controller && typeof controller.handleKey === 'function') {
        var handled = controller.handleKey.call(controller, key);
        if (typeof handled !== 'undefined') return handled;
    }
    // (Search view specific keys handled elsewhere; fall through preserves existing behaviour)
    return true;
};

MessageBoard.prototype._paintIconGrid = function () {
    if (!this.items.length) {
        this._clearIconGrid();
        this.outputFrame.clear();
        this._releaseHotspots();
        this.outputFrame.putmsg('No items');
        return;
    }

    // Lazy load Icon and reuse existing icon infrastructure
    if (!this._Icon) { try { this._Icon = load('future_shell/lib/shell/icon.js').Icon || Icon; } catch (e) { try { load('future_shell/lib/shell/icon.js'); this._Icon = Icon; } catch (e2) { } } }
    var metrics = this._calcGridMetrics();
    var maxVisible = metrics.cols * metrics.rows;

    // Check if scroll offset will change
    var previousScrollOffset = this.scrollOffset;
    if (this.selection < this.scrollOffset) this.scrollOffset = this.selection;
    if (this.selection >= this.scrollOffset + maxVisible) this.scrollOffset = Math.max(0, this.selection - maxVisible + 1);

    // If scroll didn't change, do selective border update only
    var scrollChanged = (previousScrollOffset !== this.scrollOffset);
    if (!scrollChanged && this._iconCells && this._iconCells.length) {
        // Just update borders for same-page navigation
        if (this._lastSelectedIndex !== undefined && this._lastSelectedIndex !== this.selection) {
            var oldLocal = this._lastSelectedIndex - this.scrollOffset;
            var newLocal = this.selection - this.scrollOffset;
            if (oldLocal >= 0 && oldLocal < this._iconCells.length) {
                this.clearCellBorder(this._iconCells[oldLocal]);
            }
            if (newLocal >= 0 && newLocal < this._iconCells.length) {
                this.drawCellBorder(this._iconCells[newLocal]);
            }
        }
        this._lastSelectedIndex = this.selection;
        return;
    }

    // Full redraw needed (scroll changed or first render)
    this._clearIconGrid();
    this.outputFrame.clear();
    this._releaseHotspots();
    var end = Math.min(this.items.length, this.scrollOffset + maxVisible);
    var visible = this.items.slice(this.scrollOffset, end);
    // Build and render each visible icon
    var idx = 0;
    for (var v = 0; v < visible.length; v++) {
        var globalIndex = this.scrollOffset + v;
        var col = idx % metrics.cols; var row = Math.floor(idx / metrics.cols);
        var topPad = metrics.topPadding || 0;
        var x = (col * metrics.cellW) + 2;
        var y = topPad + (row * metrics.cellH) + 1;
        var itemData = visible[v];
        var inSubView = (this.view === 'sub');
        var isSubIcon = (inSubView && itemData.type === 'sub');
        var baseX = this.outputFrame.x + x - 1;
        var baseY = this.outputFrame.y + y - 1;
        // we add an extra pixel of Y offset when in sub-view to account for the title row above the icons
        var iconYOffset = inSubView ? 1 : 0;
        var iconFrame = new Frame(baseX, baseY + iconYOffset, metrics.iconW, metrics.iconH, (itemData.iconBg || 0) | (itemData.iconFg || 0), this.outputFrame);
        if (typeof ICSH_PERF_TAG !== 'undefined') { try { iconFrame.__perfTag = 'mb-icon'; } catch (_ptI) { } }
        var labelFrame = new Frame(iconFrame.x, iconFrame.y + metrics.iconH, metrics.iconW, 1, BG_BLACK | LIGHTGRAY, this.outputFrame);
        if (typeof ICSH_PERF_TAG !== 'undefined') { try { labelFrame.__perfTag = 'mb-icon-label'; } catch (_ptIL) { } }

        var iconTitleFrame = null;
        if (inSubView) {
            var titleColor = (typeof LIGHTCYAN !== 'undefined') ? LIGHTCYAN : (typeof CYAN !== 'undefined' ? CYAN : WHITE);
            iconTitleFrame = new Frame(iconFrame.x, iconFrame.y - 1, metrics.iconW, 1, BG_BLACK | titleColor, this.outputFrame);
            if (typeof ICSH_PERF_TAG !== 'undefined') { try { iconTitleFrame.__perfTag = 'mb-icon-title'; } catch (_ptIT) { } }
            iconTitleFrame.transparent = false;
            if (typeof iconTitleFrame.word_wrap !== 'undefined') iconTitleFrame.word_wrap = false;
            try { iconTitleFrame.open(); } catch (_ignoredOpen) { }
        }

        // Create border frame for selection highlighting (adjust for title frame in sub-view)
        var borderY = inSubView ? (iconFrame.y - 2) : (iconFrame.y - 1);
        var borderH = inSubView ? (1 + metrics.iconH + 1 + 2) : (metrics.iconH + 1 + 2);
        var borderFrame = new Frame(iconFrame.x - 1, borderY, metrics.iconW + 2, borderH, CYAN, this.outputFrame);
        borderFrame.transparent = true;
        if (typeof borderFrame.open === 'function') borderFrame.open();
        if (typeof ICSH_PERF_TAG !== 'undefined') { try { borderFrame.__perfTag = 'mb-icon-border'; } catch (_ptB) { } }
        if (itemData.type === 'sub' && itemData.subCode) {
            var updated = this._getSubMessageCount(itemData.subCode);
            itemData._messageCount = updated;
            var baseName = itemData._labelBase || (itemData.label || '');
            var unread = this._getSubUnreadCount ? this._getSubUnreadCount(itemData.subCode, updated) : (itemData._unreadCount || 0);
            itemData._unreadCount = unread;
            var refreshed = this._formatSubLabel(baseName, updated, unread);
            itemData.label = refreshed.text;
            itemData._labelSegments = refreshed.segments;
        }
        var iconObj = new this._Icon(iconFrame, labelFrame, itemData);
        iconObj.render();
        var isSelected = (globalIndex === this.selection);
        if (iconTitleFrame) {
            try {
                var titleAttr = isSelected
                    ? ((typeof WHITE !== 'undefined') ? WHITE : ((typeof LIGHTGRAY !== 'undefined') ? LIGHTGRAY : LIGHTCYAN))
                    : ((typeof LIGHTCYAN !== 'undefined') ? LIGHTCYAN : ((typeof CYAN !== 'undefined') ? CYAN : WHITE));
                var titleText = '';
                if (itemData.type === 'sub') titleText = itemData._labelBase || itemData.title || itemData.label || '';
                else titleText = itemData.title || itemData.label || '';
                iconTitleFrame.clear(BG_BLACK | titleAttr);
                iconTitleFrame.attr = BG_BLACK | titleAttr;
                iconTitleFrame.gotoxy(1, 1);
                if (this._center) titleText = this._center(titleText, iconTitleFrame.width);
                else if (titleText.length > iconTitleFrame.width) titleText = titleText.substr(0, iconTitleFrame.width);
                var colorSeq = isSelected
                    ? '\x01n\x01h\x01w'
                    : '\x01n\x01h\x01c';
                iconTitleFrame.putmsg(colorSeq + titleText + '\x01n');
                try { iconTitleFrame.cycle(); } catch (_ignoredCycle) { }
            } catch (_ignoredTitle) { }
        }
        this._iconCells.push({ icon: iconFrame, label: labelFrame, title: iconTitleFrame, item: itemData, iconObj: iconObj, borderFrame: borderFrame });
        try {
            this._renderIconLabel(labelFrame, itemData, isSelected, metrics.iconW);
        } catch (e) { }
        // Hotspot mapping: ESC for special first cell; numbering starts at 1 for others (1-9 then A-Z)
        var item = itemData;
        var cmd = null;
        if (item.type === 'quit' || item.type === 'groups') {
            cmd = '\x1b'; // ESC
        } else if (item.type === 'search') {
            cmd = (item.hotkey && item.hotkey.length) ? item.hotkey[0] : 'S';
            cmd = cmd.toUpperCase();
        } else if (this._nonSpecialOrdinals && typeof this._nonSpecialOrdinals[globalIndex] === 'number') {
            var ord = this._nonSpecialOrdinals[globalIndex]; // 1-based
            if (ord <= 9) cmd = String(ord);
            else {
                var alphaIndex = ord - 10; // 0-based for A
                if (alphaIndex < 26) cmd = String.fromCharCode('A'.charCodeAt(0) + alphaIndex);
            }
        }
        if (cmd) {
            var commands = [cmd];
            if (cmd.length === 1) {
                var lowerCmd = cmd.toLowerCase();
                if (lowerCmd !== cmd) commands.push(lowerCmd);
            }
            for (var cIdx = 0; cIdx < commands.length; cIdx++) {
                var mappedCmd = commands[cIdx];
                this._hotspotMap[mappedCmd] = globalIndex;
                for (var hy = 0; hy < metrics.iconH; hy++) {
                    this._addHotspotArea(mappedCmd, false, iconFrame.x, iconFrame.x + iconFrame.width - 1, iconFrame.y + hy);
                }
                this._addHotspotArea(mappedCmd, false, labelFrame.x, labelFrame.x + labelFrame.width - 1, labelFrame.y);
            }
        }
        idx++;
    }

    // Draw border on currently selected visible item
    if (this._iconCells && this.scrollOffset !== undefined) {
        var localIdx = this.selection - this.scrollOffset;
        if (localIdx >= 0 && localIdx < this._iconCells.length) {
            this.drawCellBorder(this._iconCells[localIdx]);
        }
    }

    // Track last selection for next navigation
    this._lastSelectedIndex = this.selection;

    var baseHelp;
    if (this.view === 'group') baseHelp = 'Enter=Open  S=Search  ESC=Quit ';
    else if (this.view === 'sub') baseHelp = 'Enter=Open  S=Search  ESC=Groups  Backspace=Groups ';
    else baseHelp = '';
    this._writeStatus(this.view.toUpperCase() + ': ' + (this.selection + 1) + '/' + this.items.length + ' PgUp/PgDn Navigate ' + baseHelp);
    this._applyPendingHotspots();
};

MessageBoard.prototype._clearIconGrid = function () {
    if (!this._iconCells) return;
    for (var i = 0; i < this._iconCells.length; i++) {
        var c = this._iconCells[i];
        try { c.borderFrame && c.borderFrame.close(); } catch (e) { }
        try { c.icon && c.icon.close(); } catch (e) { }
        try { c.label && c.label.close(); } catch (e) { }
        try { c.title && c.title.close(); } catch (e) { }
    }
    this._iconCells = [];
};

MessageBoard.prototype.drawCellBorder = function (cell) {
    if (!cell || !cell.borderFrame) return;
    var borderColor = (typeof CYAN !== 'undefined' ? CYAN : 6);
    try {
        cell.borderFrame.drawBorder(borderColor);
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('drawCellBorder error: ' + e, 'messageboard');
    }
};

MessageBoard.prototype.clearCellBorder = function (cell) {
    if (!cell || !cell.borderFrame) return;
    try {
        cell.borderFrame.clear();
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('clearCellBorder error: ' + e, 'messageboard');
    }
};

// ---- Threads View ----
MessageBoard.prototype._loadThreadHeaders = function (limit) {
    // If caller specifies limit, respect it; otherwise load full message list
    limit = limit || this.threadHeaderLimit;
    if (limit && limit > 0) limit = Math.min(limit, this.threadHeaderLimit);
    this.threadHeaders = [];
    var code = this.cursub || (this.items[this.selection] && this.items[this.selection].subCode) || bbs.cursub_code;
    if (!code) return;
    if (!this._threadHeadersCache) this._threadHeadersCache = {};
    var cacheKey = code + ':' + limit;
    var cached = this._threadHeadersCache[cacheKey] || null;
    var mb = new MsgBase(code);
    if (!mb.open()) { return; }
    try {
        var total = mb.total_msgs;
        if (!total) return;
        var nowTs = (typeof Date !== 'undefined' && Date.now) ? Date.now() : (time() * 1000);
        if (!this._subMessageCounts) this._subMessageCounts = {};
        this._subMessageCounts[code] = { total: Math.max(0, parseInt(total, 10) || 0), ts: nowTs };
        if (cached && cached.total === total && cached.headers) {
            this.threadHeaders = cached.headers.slice();
            if (cached.fullHeaders) {
                if (!this._fullHeaders) this._fullHeaders = {};
                for (var num in cached.fullHeaders) {
                    if (cached.fullHeaders.hasOwnProperty(num)) this._fullHeaders[num] = cached.fullHeaders[num];
                }
            }
            return;
        }
        var start = 1;
        var endNum = total;
        if (limit && limit > 0) {
            start = Math.max(1, total - limit + 1);
        }
        for (var n = start; n <= endNum; n++) {
            var hdr = mb.get_msg_header(false, n, true);
            if (!hdr) continue;
            this._storeFullHeader(hdr);
            this.threadHeaders.push({
                number: n,
                id: hdr.id,
                reply_id: hdr.reply_id,
                subject: hdr.subject || '(no subject)',
                from: hdr.from || hdr.from_net || 'unknown',
                when: hdr.when_written_time || hdr.when_written || 0
            });
        }
    } catch (e) { /* swallow */ }
    finally { try { mb.close(); } catch (e2) { } }
    // Basic chronological sort (oldest first). For threads we might group later.
    this.threadHeaders.sort(function (a, b) { return a.number - b.number; });
    // Cache headers and associated full header details for reuse
    var cacheHeaders = this.threadHeaders.slice();
    var cacheFull = {};
    if (this._fullHeaders) {
        for (var i = 0; i < cacheHeaders.length; i++) {
            var num = cacheHeaders[i].number;
            if (this._fullHeaders[num]) cacheFull[num] = this._fullHeaders[num];
        }
    }
    this._threadHeadersCache[cacheKey] = { total: total, headers: cacheHeaders, fullHeaders: cacheFull };
    this._threadViewHeaders = null;
    this._threadViewHeadersSource = null;
    this._threadViewHeadersLength = 0;
    var stats = this._getSubPointers(code);
    var pointer = stats.pointer || 0;
    var unread = 0;
    for (var j = 0; j < this.threadHeaders.length; j++) {
        if (this.threadHeaders[j].number > pointer) unread++;
    }
    if (!this._subUnreadCounts) this._subUnreadCounts = {};
    this._subUnreadCounts[code] = { unread: unread, ts: nowTs };
};

MessageBoard.prototype._invalidateThreadViewOrder = function () {
    this._threadViewHeaders = null;
    this._threadViewHeadersSource = null;
    this._threadViewHeadersLength = 0;
};

MessageBoard.prototype._getThreadViewHeaders = function () {
    var base = this.threadHeaders || [];
    var order = this._threadSortOrder || 'asc';
    if (!this._threadViewHeaders || this._threadViewHeadersSource !== order || this._threadViewHeadersLength !== base.length) {
        if (order === 'desc') this._threadViewHeaders = base.slice().reverse(); else this._threadViewHeaders = base.slice();
        this._threadViewHeadersSource = order;
        this._threadViewHeadersLength = base.length;
    }
    return this._threadViewHeaders;
};

MessageBoard.prototype._findThreadViewIndexByNumber = function (number) {
    if (typeof number !== 'number') return -1;
    var headers = this._getThreadViewHeaders();
    for (var i = 0; i < headers.length; i++) {
        if (headers[i] && headers[i].number === number) return i;
    }
    return -1;
};

MessageBoard.prototype._findThreadTreeIndexByNumber = function (number) {
    if (typeof number !== 'number' || !this.threadNodeIndex) return -1;
    for (var i = 0; i < this.threadNodeIndex.length; i++) {
        var node = this.threadNodeIndex[i];
        if (!node) continue;
        if (node.__msgHeader && node.__msgHeader.number === number) return i;
    }
    return -1;
};

MessageBoard.prototype._ensureFlatHeaders = function () {
    var code = this.cursub || this._lastActiveSubCode || (bbs && bbs.cursub_code) || null;
    if (!code) {
        this.flatHeaders = [];
        this._flatHeadersSub = null;
        return this.flatHeaders;
    }
    if (this._flatHeadersSub !== code) {
        this._flatHeadersSort = null;
        this.flatHeaders = [];
        this.threadHeaders = [];
    }
    if (!this.threadHeaders || !this.threadHeaders.length) {
        if (typeof this._loadThreadHeaders === 'function') this._loadThreadHeaders();
    }
    var sort = this.flatSortOrder || 'asc';
    var expectedLength = this.threadHeaders ? this.threadHeaders.length : 0;
    var needsRebuild = this._flatHeadersSub !== code
        || this._flatHeadersSort !== sort
        || !this.flatHeaders
        || this.flatHeaders.length !== expectedLength;
    if (needsRebuild) {
        var base = this.threadHeaders ? this.threadHeaders.slice() : [];
        if (sort === 'desc') base.reverse();
        this.flatHeaders = base;
        this._flatHeadersSub = code;
        this._flatHeadersSort = sort;
    }
    return this.flatHeaders;
};

MessageBoard.prototype._findFlatIndexByNumber = function (number) {
    if (!this.flatHeaders) return -1;
    for (var i = 0; i < this.flatHeaders.length; i++) {
        if (this.flatHeaders[i] && this.flatHeaders[i].number === number) return i;
    }
    return -1;
};

MessageBoard.prototype._paintFlatList = function () {
    var f = this._threadContentFrame || this.outputFrame;
    if (!f) return;
    try { f.clear(); } catch (_clearFlat) { }
    var headers = this._ensureFlatHeaders();
    if (!headers.length) {
        try { f.putmsg('No messages'); } catch (_noMsgErr) { }
        this._registerThreadSearchHotspot();
        return;
    }
    var usable = Math.max(1, f.height - 2);
    if (this.flatSelection < 0) this.flatSelection = 0;
    if (this.flatSelection >= headers.length) this.flatSelection = headers.length - 1;
    if (this.flatSelection < this.flatScrollOffset) this.flatScrollOffset = this.flatSelection;
    if (this.flatSelection >= this.flatScrollOffset + usable) this.flatScrollOffset = Math.max(0, this.flatSelection - usable + 1);
    var end = Math.min(headers.length, this.flatScrollOffset + usable);
    var pointerStats = this._getSubPointers ? this._getSubPointers(this.cursub || this._lastActiveSubCode) : { pointer: 0 };
    var pointer = pointerStats && typeof pointerStats.pointer === 'number' ? pointerStats.pointer : 0;
    try {
        f.gotoxy(1, 1);
        var orderLabel = (this.flatSortOrder === 'desc') ? 'Newest first' : 'Oldest first';
        f.putmsg('Messages (Flat ' + orderLabel + ') ' + '(' + headers.length + ')');
    } catch (_hdrErr) { }
    this._releaseHotspots();
    var hotspotChars = this._hotspotChars || [];
    var usedHotspots = 0;
    for (var i = this.flatScrollOffset; i < end; i++) {
        var hdr = headers[i];
        var lineY = 2 + (i - this.flatScrollOffset);
        if (lineY > f.height) break;
        var isSelected = (i === this.flatSelection);
        var mark = (hdr.number > pointer) ? '*' : ' ';
        var numStr = this._padLeft('' + hdr.number, 6, ' ');
        var from = (hdr.from || 'unknown').substr(0, 12);
        var subj = (hdr.subject || '(no subject)').replace(/\s+/g, ' ');
        var dateStr = '';
        try { if (hdr.when) dateStr = strftime('%m-%d %H:%M', hdr.when); } catch (_dateErr) { }
        var chunk = numStr + ' ' + this._padRight(from, 12, ' ') + ' ' + subj;
        if (chunk.length > f.width - 4) chunk = chunk.substr(0, f.width - 7) + '...';
        var text = mark + ' ' + chunk;
        if (text.length < f.width) text += Array(f.width - text.length + 1).join(' ');
        text = (isSelected ? '\x01n\x01h' : '\x01n') + text;
        try {
            f.gotoxy(1, lineY);
            f.putmsg(text.substr(0, f.width));
        } catch (_lineErr) { }
        if (dateStr && f.width >= 20) {
            var datePos = Math.max(1, f.width - 10);
            try { f.gotoxy(datePos, lineY); f.putmsg((isSelected ? '\x01n\x01h' : '\x01n') + dateStr); } catch (_datePosErr) { }
        }
        if (usedHotspots < hotspotChars.length) {
            var cmd = hotspotChars[usedHotspots++];
            this._hotspotMap[cmd] = i;
            this._addHotspotArea(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1);
        }
    }
    this._writeStatus('FLAT: Enter=Read  P=Post  O=Order  Backspace=Threads  ESC=Subs  ' + (this.flatSelection + 1) + '/' + headers.length);
    this._registerThreadSearchHotspot();
};

MessageBoard.prototype._renderFlatView = function (options) {
    options = options || {};
    var anchorNumber = (typeof options.anchorNumber === 'number') ? options.anchorNumber : null;
    var requestedSub = options.subCode || options.sub || options.code || null;
    var previousSub = this.cursub || this._lastActiveSubCode || this._cachedSubCode || (bbs && bbs.cursub_code) || null;
    var targetSub = requestedSub || previousSub || null;
    if (targetSub && typeof this._syncSubState === 'function') {
        var syncState = this._syncSubState(targetSub);
        if (syncState && syncState.code) targetSub = syncState.code;
    }
    if (!targetSub) {
        this._writeStatus('FLAT: Select a sub first');
        return;
    }
    var subChanged = (previousSub !== targetSub);
    this.cursub = targetSub;
    this._lastActiveSubCode = targetSub;
    if (subChanged) {
        this.flatSelection = 0;
        this.flatScrollOffset = 0;
        this._flatHeadersSub = null;
    }
    this._readThreadContext = null;
    this._beginViewTransition('Rendering flat view...');
    try {
        this._ensureFrames();
        try { if (this._destroyReadFrames) this._destroyReadFrames(); } catch (_drFlat) { }
        try { this._clearIconGrid && this._clearIconGrid(); } catch (_cgFlat) { }
        this._releaseHotspots();
        this.view = 'flat';
        if (typeof this._ensureThreadContentFrame === 'function') this._ensureThreadContentFrame();
        var headers = this._ensureFlatHeaders();
        if (!headers.length) {
            var contentFrame = this._threadContentFrame || this.outputFrame;
            if (contentFrame) {
                try { contentFrame.clear(); contentFrame.putmsg('No messages available.'); } catch (_noFlatMsg) { }
            }
            this._updateThreadToggleButtonLabel();
            this._writeStatus('FLAT: No messages');
            return;
        }
        if (anchorNumber !== null) {
            var idx = this._findFlatIndexByNumber(anchorNumber);
            if (idx !== -1) this.flatSelection = idx;
        }
        if (this.flatSelection < 0) this.flatSelection = 0;
        if (this.flatSelection >= headers.length) this.flatSelection = headers.length - 1;
        this.flatScrollOffset = Math.max(0, Math.min(this.flatScrollOffset, this.flatSelection));
        this._paintFlatList();
        this._updateThreadToggleButtonLabel();
    } finally {
        this._endViewTransition();
    }
};

MessageBoard.prototype._setReadMode = function (mode) {
    this._readMode = (mode === 'flat') ? 'flat' : 'thread';
};

MessageBoard.prototype._getReadMode = function () {
    if (this._readMode === 'flat') return 'flat';
    if (this._readMode === 'thread') return 'thread';
    if (this._readThreadContext && this._readThreadContext.mode === 'flat') return 'flat';
    return 'thread';
};

MessageBoard.prototype._updateFlatSelectionFromNumber = function (number) {
    if (!this._findFlatIndexByNumber) return;
    var headers = this._ensureFlatHeaders ? this._ensureFlatHeaders() : this.flatHeaders;
    if (!headers || !headers.length) return;
    var idx = this._findFlatIndexByNumber(number);
    if (idx === -1) return;
    this.flatSelection = idx;
    var frame = this._threadContentFrame || this.outputFrame;
    var usable = frame ? Math.max(1, frame.height - 2) : headers.length;
    if (this.flatSelection < this.flatScrollOffset) this.flatScrollOffset = this.flatSelection;
    if (this.flatSelection >= this.flatScrollOffset + usable) this.flatScrollOffset = Math.max(0, this.flatSelection - usable + 1);
};

MessageBoard.prototype._computeThreadToggleLabel = function () {
    if (this.view === 'threads') return '[F] Flat View';
    if (this.view === 'flat') return '[T] Thread View';
    return 'Toggle View';
};

MessageBoard.prototype._updateThreadToggleButtonLabel = function () {
    if (!this._threadToggleButton || typeof this._threadToggleButton.setLabel !== 'function') return;
    var label = this._computeThreadToggleLabel();
    this._threadToggleButton.setLabel(label);
};

MessageBoard.prototype._toggleThreadFlatView = function () {
    if (this.view === 'threads') {
        var anchor = null;
        if (this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
            var treeIdx = Math.max(0, Math.min(this.threadTreeSelection || 0, this.threadNodeIndex.length - 1));
            var node = this.threadNodeIndex[treeIdx];
            if (node && node.__msgHeader && typeof node.__msgHeader.number === 'number') anchor = node.__msgHeader.number;
            else if (node && node.items && node.items.length) {
                for (var ni = 0; ni < node.items.length; ni++) {
                    var child = node.items[ni];
                    if (child && child.__msgHeader && typeof child.__msgHeader.number === 'number') {
                        anchor = child.__msgHeader.number;
                        break;
                    }
                }
            }
        } else {
            var headers = this._getThreadViewHeaders ? this._getThreadViewHeaders() : this.threadHeaders;
            if (headers && headers.length) {
                var sel = Math.max(0, Math.min(this.threadSelection || 0, headers.length - 1));
                var hdr = headers[sel];
                if (hdr && typeof hdr.number === 'number') anchor = hdr.number;
            }
        }
        this._renderFlatView(anchor !== null ? { anchorNumber: anchor } : {});
        return true;
    }
    if (this.view === 'flat') {
        this._renderThreadsView(this.cursub);
        return true;
    }
    return false;
};

MessageBoard.prototype._advanceFlatRead = function (dir) {
    if (!this.lastReadMsg || typeof this.lastReadMsg.number !== 'number') return false;
    if (typeof dir !== 'number' || !dir) dir = 1;
    var code = this.cursub || this._lastActiveSubCode || this._cachedSubCode || (bbs && bbs.cursub_code) || this.lastReadMsg.sub || this.lastReadMsg.sub_code || null;
    if (!code || typeof MsgBase !== 'function') return false;
    var range = this._getSubMessageRange ? this._getSubMessageRange(code) : { first: 1, last: 0 };
    if (!range || typeof range.first !== 'number' || typeof range.last !== 'number') return false;
    var mb = new MsgBase(code);
    if (!mb.open()) return false;
    var step = dir > 0 ? 1 : -1;
    var start = this.lastReadMsg.number + step;
    try {
        for (var num = start; dir > 0 ? num <= range.last : num >= range.first; num += step) {
            var hdr = null;
            try { hdr = mb.get_msg_header(false, num, true); } catch (_hdrErr) { hdr = null; }
            if (!hdr) continue;
            if (typeof hdr.number !== 'number') hdr.number = num;
            if (!hdr.sub) hdr.sub = code;
            if (typeof this._storeFullHeader === 'function') this._storeFullHeader(hdr);
            this._setReadMode('flat');
            this._readThreadContext = null;
            this._readReturnView = 'flat';
            this._readReturnAnchor = hdr.number || null;
            if (typeof this._ensureFlatHeaders === 'function') this._ensureFlatHeaders();
            this._updateFlatSelectionFromNumber(hdr.number);
            this._renderReadView(hdr);
            if (typeof this._showReadNotice === 'function') this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
            return true;
        }
    } finally {
        try { mb.close(); } catch (_closeErr) { }
    }
    return false;
};

MessageBoard.prototype._toggleFlatSortOrder = function () {
    this.flatSortOrder = (this.flatSortOrder === 'desc') ? 'asc' : 'desc';
    this._flatHeadersSort = null;
    var headers = this.threadHeaders || [];
    var targetAnchor = null;
    if (this.flatSortOrder === 'desc') {
        if (headers.length) targetAnchor = headers[headers.length - 1].number;
    } else {
        if (headers.length) targetAnchor = headers[0].number;
    }
    this.flatSelection = 0;
    this.flatScrollOffset = 0;
    this._renderFlatView({ anchorNumber: targetAnchor });
};

MessageBoard.prototype._toggleThreadSortOrder = function () {
    var headers = this._getThreadViewHeaders();
    var anchor = (headers && headers[this.threadSelection] && headers[this.threadSelection].number) || null;
    this._threadSortOrder = (this._threadSortOrder === 'desc') ? 'asc' : 'desc';
    this._invalidateThreadViewOrder();
    if (this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
        if (typeof this._buildThreadTree === 'function') this._buildThreadTree();
        if (anchor !== null && this.threadNodeIndex && this.threadNodeIndex.length) {
            for (var ti = 0; ti < this.threadNodeIndex.length; ti++) {
                var node = this.threadNodeIndex[ti];
                if (!node) continue;
                if (node.__msgHeader && node.__msgHeader.number === anchor) {
                    this.threadTreeSelection = ti;
                    break;
                }
                if (node.__isTree && node.items) {
                    for (var ci = 0; ci < node.items.length; ci++) {
                        var child = node.items[ci];
                        if (child && child.__msgHeader && child.__msgHeader.number === anchor) {
                            this.threadTreeSelection = ti;
                            break;
                        }
                    }
                }
            }
        } else {
            this.threadTreeSelection = 0;
        }
        this.threadScrollOffset = 0;
        if (typeof this._paintThreadTree === 'function') this._paintThreadTree();
    } else {
        var viewHeaders = this._getThreadViewHeaders();
        if (anchor !== null) {
            var idx = this._findThreadViewIndexByNumber(anchor);
            this.threadSelection = (idx !== -1) ? idx : 0;
        } else {
            this.threadSelection = 0;
        }
        this.threadScrollOffset = 0;
        if (typeof this._paintThreadList === 'function') this._paintThreadList();
    }
};

MessageBoard.prototype._createThreadContext = function (rootId, startNumber, mode) {
    if (!rootId) return null;
    var seq = this._buildThreadSequence(rootId) || [];
    if (!seq.length) return null;
    var numbers = [];
    var numberSet = {};
    var numberIndexMap = {};
    for (var i = 0; i < seq.length; i++) {
        var hdr = seq[i];
        if (!hdr || typeof hdr.number !== 'number') continue;
        if (numberSet[hdr.number]) continue;
        numberSet[hdr.number] = true;
        numberIndexMap[hdr.number] = numbers.length;
        numbers.push(hdr.number);
    }
    if (numbers.length <= 1) return null;
    var ctx = {
        rootId: rootId,
        numbers: numbers,
        numberSet: numberSet,
        numberIndexMap: numberIndexMap,
        mode: mode || 'thread',
        currentNumber: startNumber || numbers[0],
        currentIndex: (typeof numberIndexMap[startNumber] === 'number') ? numberIndexMap[startNumber] : 0
    };
    return ctx;
};

MessageBoard.prototype._startThreadReadFromCurrent = function () {
    if (this.view !== 'read') return false;
    if (this._readReturnView !== 'flat') {
        this._writeStatus('THREAD: Not available in this view');
        return false;
    }
    var msg = this.lastReadMsg || null;
    if (!msg) {
        this._writeStatus('THREAD: No active message');
        return false;
    }
    var rootId = msg.thread_id || msg.number;
    if (!rootId) {
        this._writeStatus('THREAD: Message not part of a thread');
        return false;
    }
    var ctx = this._createThreadContext(rootId, msg.number, 'flat');
    if (!ctx) {
        this._writeStatus('THREAD: No additional messages in thread');
        return false;
    }
    if (typeof this._ensureFlatHeaders === 'function') this._ensureFlatHeaders();
    var flatIndex = this._findFlatIndexByNumber ? this._findFlatIndexByNumber(msg.number) : -1;
    ctx.sortOrder = this.flatSortOrder || 'asc';
    ctx.direction = (this.flatSortOrder === 'desc') ? -1 : 1;
    ctx.flatIndex = flatIndex;
    ctx.currentFlatIndex = flatIndex;
    ctx.visited = {};
    ctx.visited[msg.number] = true;
    this._readThreadContext = ctx;
    this._writeStatus('THREAD: ' + ctx.numbers.length + ' messages (started at #' + msg.number + ')');
    if (typeof this._showReadNotice === 'function') this._showReadNotice('thread-start');
    return true;
};

MessageBoard.prototype._ensureThreadReadContextFromThreads = function (msg) {
    if (!msg) {
        this._readThreadContext = null;
        return;
    }
    if (this._readThreadContext && this._readThreadContext.mode === 'flat') {
        return;
    }
    var rootId = msg.thread_id || msg.number;
    if (!rootId) {
        this._readThreadContext = null;
        return;
    }
    if (this._readThreadContext && this._readThreadContext.mode === 'thread' && this._readThreadContext.rootId === rootId) {
        this._readThreadContext.currentNumber = msg.number;
        if (this._readThreadContext.numberIndexMap && typeof this._readThreadContext.numberIndexMap[msg.number] === 'number') {
            this._readThreadContext.currentIndex = this._readThreadContext.numberIndexMap[msg.number];
        }
        return;
    }
    var ctx = this._createThreadContext(rootId, msg.number, 'thread');
    this._readThreadContext = ctx;
};

MessageBoard.prototype._updateThreadContextAfterRead = function (msg) {
    if (!this._readThreadContext) return;
    if (!msg || typeof msg.number !== 'number') {
        this._readThreadContext = null;
        return;
    }
    var ctx = this._readThreadContext;
    if (!ctx.numberSet || !ctx.numberSet[msg.number]) {
        this._readThreadContext = null;
        return;
    }
    ctx.currentNumber = msg.number;
    if (ctx.numberIndexMap && typeof ctx.numberIndexMap[msg.number] === 'number') {
        ctx.currentIndex = ctx.numberIndexMap[msg.number];
    }
    var flatIdx = this._findFlatIndexByNumber ? this._findFlatIndexByNumber(msg.number) : -1;
    if (flatIdx !== -1) ctx.currentFlatIndex = flatIdx;
    if (ctx.visited) ctx.visited[msg.number] = true;
};

MessageBoard.prototype._completeThreadRead = function () {
    var ctx = this._readThreadContext;
    if (!ctx || ctx.mode !== 'flat') return false;
    this._readThreadContext = null;
    var headers = this._ensureFlatHeaders();
    if (!headers.length) {
        this._renderFlatView();
        return true;
    }
    var idx = (typeof ctx.currentFlatIndex === 'number' && ctx.currentFlatIndex >= 0)
        ? ctx.currentFlatIndex
        : (this._findFlatIndexByNumber ? this._findFlatIndexByNumber(ctx.currentNumber || (this.lastReadMsg && this.lastReadMsg.number)) : -1);
    if (idx < 0) idx = ctx.flatIndex || 0;
    var direction = ctx.direction || 1;
    var nextIdx = idx + direction;
    while (nextIdx >= 0 && nextIdx < headers.length && ctx.numberSet && ctx.numberSet[headers[nextIdx].number]) {
        nextIdx += direction;
    }
    var anchor = null;
    if (nextIdx >= 0 && nextIdx < headers.length) {
        anchor = headers[nextIdx].number;
    }
    this._renderFlatView(anchor !== null ? { anchorNumber: anchor } : {});
    if (typeof this._showReadNotice === 'function') this._showReadNotice('thread-complete');
    if (anchor === null) {
        this._writeStatus('FLAT: Thread complete; end of list');
    } else {
        this._writeStatus('FLAT: Thread complete; resuming at #' + anchor);
    }
    return true;
};

MessageBoard.prototype._handleFlatKey = function (key) {
    var headers = this.flatHeaders || [];
    if (key === '\x1b') {
        this._renderSubView(this.curgrp);
        return false;
    }
    if (key === '\x08') {
        this._renderThreadsView(this.cursub);
        return false;
    }
    if (!headers.length) {
        if (key === 'P' || key === 'p') { this._renderPostView(); return false; }
        return true;
    }
    var frame = this._threadContentFrame || this.outputFrame;
    var usable = frame ? Math.max(1, frame.height - 2) : headers.length;
    var oldSel = this.flatSelection;
    switch (key) {
        case KEY_UP: this.flatSelection = Math.max(0, this.flatSelection - 1); break;
        case KEY_DOWN: this.flatSelection = Math.min(headers.length - 1, this.flatSelection + 1); break;
        case KEY_PAGEUP: this.flatSelection = Math.max(0, this.flatSelection - usable); break;
        case KEY_PAGEDN: this.flatSelection = Math.min(headers.length - 1, this.flatSelection + usable); break;
        case KEY_HOME: this.flatSelection = 0; break;
        case KEY_END: this.flatSelection = headers.length - 1; break;
        case 'O': case 'o': {
            this._toggleFlatSortOrder();
            return false;
        }
        case 'T': case 't':
            this._renderThreadsView(this.cursub);
            return false;
        case 'P': case 'p':
            this._renderPostView();
            return false;
        case '/': case 'S': case 's':
            this._promptSearch(this.cursub || this._lastActiveSubCode || null, 'flat');
            return false;
        case '\r': case '\n': case KEY_ENTER: {
            var hdr = headers[this.flatSelection];
            if (hdr) {
                this._readThreadContext = null;
                this._setReadMode('flat');
                this._readReturnView = 'flat';
                this._readReturnAnchor = hdr.number || null;
                this._renderReadView(hdr);
            }
            return false;
        }
        default:
            return true;
    }
    if (this.flatSelection < this.flatScrollOffset) this.flatScrollOffset = this.flatSelection;
    if (this.flatSelection >= this.flatScrollOffset + usable) this.flatScrollOffset = Math.max(0, this.flatSelection - usable + 1);
    if (this.flatSelection !== oldSel) this._paintFlatList();
    return true;
};
MessageBoard.prototype._paintThreadList = function () {
    var f = this._threadContentFrame || this.outputFrame; if (!f) return; f.clear();
    var headers = this._getThreadViewHeaders();
    if (!headers.length) {
        f.putmsg('No messages');
        this._registerThreadSearchHotspot();
        return;
    }
    var h = f.height; var usable = h - 2; // leave top line for header maybe
    if (usable < 3) usable = h; // fallback
    // pagination
    if (this.threadSelection < 0) this.threadSelection = 0;
    if (this.threadSelection >= headers.length) this.threadSelection = headers.length - 1;
    if (this.threadSelection < this.threadScrollOffset) this.threadScrollOffset = this.threadSelection;
    if (this.threadSelection >= this.threadScrollOffset + usable) this.threadScrollOffset = Math.max(0, this.threadSelection - usable + 1);
    var end = Math.min(headers.length, this.threadScrollOffset + usable);
    f.gotoxy(1, 1);
    var orderLabel = (this._threadSortOrder === 'desc') ? 'Newest first' : 'Oldest first';
    f.putmsg('Messages in ' + (this.cursub || '') + ' (' + headers.length + ', ' + orderLabel + ')');
    var row = 0;
    var self = this;
    this._releaseHotspots();
    var hotspotChars = this._hotspotChars || [];
    var usedHotspots = 0;
    for (var i = this.threadScrollOffset; i < end; i++) {
        var hdr = headers[i];
        var lineY = 2 + row; if (lineY > f.height) break;
        var sel = (i === this.threadSelection);
        try { f.gotoxy(1, lineY); } catch (e) { }
        var subj = hdr.subject.replace(/\s+/g, ' ');
        if (subj.length > f.width - 25) subj = subj.substr(0, f.width - 28) + '...';
        var from = hdr.from.substr(0, 12);
        var numStr = this._padLeft('' + hdr.number, 5, ' ');
        var dateStr = '';
        try { if (hdr.when) dateStr = strftime('%m-%d %H:%M', hdr.when); } catch (e) { }
        var text = numStr + ' ' + this._padRight(from, 12, ' ') + ' ' + subj;
        if (text.length < f.width) text += Array(f.width - text.length + 1).join(' ');
        if (sel) text = '\x01n\x01h' + text; else text = '\x01n' + text;
        f.putmsg(text.substr(0, f.width));
        if (usedHotspots < hotspotChars.length) {
            var cmd = hotspotChars[usedHotspots++];
            this._hotspotMap[cmd] = i;
            this._addHotspotArea(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1);
        }
        row++;
    }
    this._writeStatus('THREADS: Enter=Read  O=Order  P=Post  S=Search  Backspace=Subs  ' + (this.threadSelection + 1) + '/' + headers.length);
    this._registerThreadSearchHotspot();
};

// ---- Thread Tree (using tree.js) ----
MessageBoard.prototype._ensureTreeLib = function () {
    if (_TreeLibLoaded) return;
    try { load('tree.js'); _TreeLibLoaded = true; } catch (e) { /* ignore */ }
};

MessageBoard.prototype._buildThreadTree = function () {
    this.threadTree = null; this.threadNodeIndex = [];
    var frame = this._threadContentFrame || this.outputFrame;
    if (!frame) return;
    if (typeof Tree === 'undefined') { return; }

    if (!this._fullHeaders) this._fullHeaders = {};
    var rootMap = {};
    var self = this;
    function recordRoot(h) {
        if (!h) return;
        var rid = h.thread_id || h.number;
        if (rid) rootMap[rid] = true;
    }
    for (var num in self._fullHeaders) { if (self._fullHeaders.hasOwnProperty(num)) recordRoot(self._fullHeaders[num]); }
    for (var i = 0; i < self.threadHeaders.length; i++) recordRoot(self._fullHeaders[self.threadHeaders[i].number] || null);
    var rootList = Object.keys(rootMap).map(function (v) { return parseInt(v, 10); }).filter(function (n) { return n > 0; });
    if (!rootList.length) rootList = self.threadHeaders.map(function (h) { return h.number; });
    rootList.sort(function (a, b) { return a - b; });
    if (this._threadSortOrder === 'desc') rootList.reverse();

    var treeRoot = new Tree(frame, '');
    treeRoot.colors.bg = BG_BLACK; treeRoot.colors.fg = LIGHTGRAY;
    treeRoot.colors.lbg = BG_BLUE; treeRoot.colors.lfg = WHITE;
    treeRoot.colors.cbg = BG_BLUE; treeRoot.colors.cfg = WHITE;
    treeRoot.colors.hfg = LIGHTCYAN; treeRoot.colors.tfg = LIGHTGRAY;
    treeRoot.colors.xfg = CYAN;

    var dateWidth = 12;
    var fromWidth = 16;

    function ensureHeader(num) {
        if (!num) return null;
        if (self._fullHeaders && self._fullHeaders[num]) return self._fullHeaders[num];
        var code = self.cursub || self._lastActiveSubCode || bbs.cursub_code;
        if (!code) return null;
        try {
            var mb = new MsgBase(code);
            if (!mb.open()) return null;
            var hdr = mb.get_msg_header(false, num, true);
            try { mb.close(); } catch (e) { }
            if (hdr) { self._storeFullHeader(hdr); return hdr; }
        } catch (e) { }
        return self._fullHeaders[num] || null;
    }

    function fmtDate(msg) {
        var t = msg.when_written_time || msg.when_written || msg.when_imported_time || 0;
        if (!t) return '--/-- --:--';
        try { return strftime('%m-%d %H:%M', t); } catch (e) { return '--/-- --:--'; }
    }

    function fmtFrom(msg) { return (msg.from || msg.from_net || 'unknown'); }

    function buildThreadLabel(rootHdr, count, width) {
        var subjectWidth = Math.max(12, width - (dateWidth + fromWidth + 12));
        var label = '[' + self._padLeft('' + (rootHdr.number || '?'), 4, ' ') + '] ';
        label += self._padRight(fmtDate(rootHdr), dateWidth, ' ') + '  ';
        label += self._padRight(fmtFrom(rootHdr).substr(0, fromWidth), fromWidth, ' ') + '  ';
        var subj = rootHdr.subject || '(no subject)';
        if (subj.length > subjectWidth) subj = subj.substr(0, subjectWidth - 3) + '...';
        label += subj + '  (' + count + ' msg' + (count === 1 ? '' : 's') + ')';
        if (label.length > width) label = label.substr(0, width);
        return label;
    }

    function buildItemLabel(msg, width) {
        var subjectWidth = Math.max(12, width - (dateWidth + fromWidth + 6));
        var label = self._padRight(fmtDate(msg), dateWidth, ' ') + '  ';
        label += self._padRight(fmtFrom(msg).substr(0, fromWidth), fromWidth, ' ') + '  ';
        var subj = msg.subject || '(no subject)';
        if (subj.length > subjectWidth) subj = subj.substr(0, subjectWidth - 3) + '...';
        label += subj;
        if (label.length > width) label = label.substr(0, width);
        return label;
    }

    for (var r = 0; r < rootList.length; r++) {
        var rootId = rootList[r];
        var seq = self._buildThreadSequence(rootId);
        if (!seq || !seq.length) {
            var rootHdr = ensureHeader(rootId);
            if (rootHdr) seq = [rootHdr]; else continue;
        }
        var rootHdr = seq[0];
        if (seq.length === 1) {
            var solo = treeRoot.addItem(buildThreadLabel(rootHdr, 1, frame.width), (function (h) { return function () { return h; }; })(rootHdr));
            solo.__msgHeader = rootHdr;
            solo.__threadRootId = rootId;
        } else {
            var threadNode = treeRoot.addTree(buildThreadLabel(rootHdr, seq.length, frame.width));
            threadNode.__msgHeader = rootHdr;
            threadNode.__isTree = true;
            threadNode.__threadRootId = rootId;
            for (var i = 0; i < seq.length; i++) {
                var msg = seq[i];
                if (!msg) continue;
                var item = threadNode.addItem(buildItemLabel(msg, frame.width), (function (h) { return function () { return h; }; })(msg));
                item.__msgHeader = msg;
            }
        }
    }

    treeRoot.open();
    this.threadTree = treeRoot;
    this._indexThreadTree();
    treeRoot.refresh();
    dbug('MessageBoard: buildThreadTree done nodes=' + this.threadNodeIndex.length, 'messageboard');
};
MessageBoard.prototype._buildThreadSequence = function (rootId) {
    if (!rootId && this.lastReadMsg) rootId = this.lastReadMsg.thread_id || this.lastReadMsg.number;
    var code = this.cursub || this._lastActiveSubCode || bbs.cursub_code;
    if (!rootId || !code) return [];
    if (!this._threadSequenceCache) this._threadSequenceCache = {};
    var cacheKey = code + ':' + rootId;
    if (this._threadSequenceCache[cacheKey]) return this._threadSequenceCache[cacheKey];

    var self = this;
    if (!this._fullHeaders) this._fullHeaders = {};
    var mb = null;

    function ensureHeader(num) {
        if (!num) return null;
        if (self._fullHeaders && self._fullHeaders[num]) return self._fullHeaders[num];
        try {
            if (!mb) {
                mb = new MsgBase(code);
                if (!mb.open()) {
                    mb = null;
                    return null;
                }
            }
            var hdr = mb.get_msg_header(false, num, true);
            if (hdr) {
                self._storeFullHeader(hdr);
                return hdr;
            }
        } catch (e) { }
        return self._fullHeaders[num] || null;
    }

    var root = ensureHeader(rootId);
    if (!root) {
        if (mb) { try { mb.close(); } catch (e) { } }
        return [];
    }

    var sequence = [];
    var visited = {};
    function traverseThreadLinks(node) {
        if (!node || visited[node.number]) return;
        visited[node.number] = true;
        sequence.push(node);
        var childNum = node.thread_first;
        while (childNum) {
            if (visited[childNum]) break;
            var child = ensureHeader(childNum);
            if (!child) break;
            traverseThreadLinks(child);
            var nextNum = child.thread_next;
            if (!nextNum || visited[nextNum]) break;
            childNum = nextNum;
        }
    }

    traverseThreadLinks(root);

    if (sequence.length <= 1) {
        var fallback = this._buildThreadSequenceByReplies(root, ensureHeader);
        if (fallback && fallback.length > sequence.length) sequence = fallback;
    }

    if (mb) { try { mb.close(); } catch (e) { } }
    if (!sequence.length) return [];
    sequence.sort(function (a, b) {
        var an = (a && typeof a.number === 'number') ? a.number : 0;
        var bn = (b && typeof b.number === 'number') ? b.number : 0;
        return an - bn;
    });
    this._threadSequenceCache[cacheKey] = sequence;
    return sequence;
};




MessageBoard.prototype._buildThreadSequenceByReplies = function (root, ensureHeader) {
    if (!root || typeof ensureHeader !== 'function') return [];
    var self = this;
    var headerList = (this.threadHeaders && this.threadHeaders.length) ? this.threadHeaders : [];
    var registered = {};
    var childrenById = {};
    var childrenByNum = {};

    function addChild(map, key, hdr) {
        if (!key || !hdr) return;
        if (!map[key]) map[key] = [];
        if (map[key].indexOf(hdr) === -1) map[key].push(hdr);
    }

    function registerHeader(hdr) {
        if (!hdr || typeof hdr.number !== 'number' || registered[hdr.number]) return;
        registered[hdr.number] = true;
        var replyIds = self._extractReplyIds(hdr);
        for (var i = 0; i < replyIds.length; i++) addChild(childrenById, replyIds[i], hdr);
        var replyNums = self._extractReplyNumbers(hdr);
        for (var j = 0; j < replyNums.length; j++) addChild(childrenByNum, replyNums[j], hdr);
    }

    for (var idx = 0; idx < headerList.length; idx++) {
        var num = headerList[idx] && headerList[idx].number;
        if (!num || registered[num]) continue;
        var hdr = ensureHeader(num);
        if (hdr) registerHeader(hdr);
    }
    registerHeader(root);

    var sequence = [];
    var visited = {};

    function collectChildren(node) {
        var candidates = [];
        var ids = self._extractMessageIds(node);
        for (var n = 0; n < ids.length; n++) {
            var list = childrenById[ids[n]];
            if (list && list.length) candidates = candidates.concat(list);
        }
        var numeric = childrenByNum[node.number];
        if (numeric && numeric.length) candidates = candidates.concat(numeric);
        if (!candidates.length) return [];
        var unique = [];
        var seen = {};
        for (var c = 0; c < candidates.length; c++) {
            var cand = candidates[c];
            if (!cand || typeof cand.number !== 'number') continue;
            if (visited[cand.number]) continue;
            if (seen[cand.number]) continue;
            seen[cand.number] = true;
            unique.push(cand);
        }
        unique.sort(function (a, b) { return self._threadSortValue(a) - self._threadSortValue(b); });
        return unique;
    }

    function walk(node) {
        if (!node || visited[node.number]) return;
        visited[node.number] = true;
        sequence.push(node);
        var kids = collectChildren(node);
        for (var k = 0; k < kids.length; k++) walk(kids[k]);
    }

    walk(root);
    return sequence;
};

MessageBoard.prototype._normalizeMessageId = function (value) {
    if (value === null || typeof value === 'undefined') return null;
    var str = ('' + value).trim();
    if (!str.length) return null;
    if (str.charAt(0) === '<' && str.charAt(str.length - 1) === '>') str = str.substring(1, str.length - 1).trim();
    if (!str.length) return null;
    return str.toLowerCase();
};

MessageBoard.prototype._extractMessageIds = function (hdr) {
    var ids = [];
    if (!hdr) return ids;
    var fields = ['id', 'message_id', 'msgid'];
    for (var i = 0; i < fields.length; i++) {
        var val = hdr[fields[i]];
        if (!val) continue;
        if (val instanceof Array) {
            for (var j = 0; j < val.length; j++) {
                var norm = this._normalizeMessageId(val[j]);
                if (norm && ids.indexOf(norm) === -1) ids.push(norm);
            }
        } else {
            var norm = this._normalizeMessageId(val);
            if (norm && ids.indexOf(norm) === -1) ids.push(norm);
        }
    }
    return ids;
};

MessageBoard.prototype._extractReplyIds = function (hdr) {
    var ids = [];
    var self = this;
    function push(val) {
        if (!val) return;
        if (val instanceof Array) {
            for (var x = 0; x < val.length; x++) push(val[x]);
            return;
        }
        var str = ('' + val);
        if (!str.length) return;
        var matches = str.match(/<[^>]+>/g);
        if (matches && matches.length) {
            for (var m = 0; m < matches.length; m++) {
                var norm = self._normalizeMessageId(matches[m]);
                if (norm && ids.indexOf(norm) === -1) ids.push(norm);
            }
            return;
        }
        var norm = self._normalizeMessageId(str);
        if (norm && ids.indexOf(norm) === -1) ids.push(norm);
    }
    if (!hdr) return ids;
    var fields = ['reply_id', 'replyid', 'in_reply_to', 'references', 'reply_msgid'];
    for (var i = 0; i < fields.length; i++) push(hdr[fields[i]]);
    return ids;
};

MessageBoard.prototype._extractReplyNumbers = function (hdr) {
    var nums = [];
    function push(val) {
        if (val === null || typeof val === 'undefined') return;
        if (val instanceof Array) {
            for (var x = 0; x < val.length; x++) push(val[x]);
            return;
        }
        var str = ('' + val).trim();
        if (!str.length) return;
        if (!/^-?\d+$/.test(str)) return;
        var num = parseInt(str, 10);
        if (isNaN(num) || num <= 0) return;
        if (nums.indexOf(num) === -1) nums.push(num);
    }
    if (!hdr) return nums;
    var fields = ['reply_to', 'replyto', 'reply_num', 'reply', 'thread_back', 'thread_parent'];
    for (var i = 0; i < fields.length; i++) push(hdr[fields[i]]);
    return nums;
};

MessageBoard.prototype._threadSortValue = function (hdr) {
    if (!hdr) return 0;
    var fields = ['when_written_time', 'when_written', 'when_imported_time', 'when_imported', 'when_saved_time', 'when_saved'];
    for (var i = 0; i < fields.length; i++) {
        var val = hdr[fields[i]];
        if (typeof val === 'number' && !isNaN(val)) return val;
        if (typeof val === 'string' && val.length) {
            var num = parseInt(val, 10);
            if (!isNaN(num)) return num;
        }
    }
    if (typeof hdr.number === 'number') return hdr.number;
    var n = parseInt(hdr.number, 10);
    return isNaN(n) ? 0 : n;
};

MessageBoard.prototype._indexThreadTree = function () {
    this.threadNodeIndex = [];
    if (!this.threadTree) return;
    // We traverse treeTree.items recursively respecting open/closed status to build flat visible list
    function traverse(tree) {
        if (!tree || !tree.items) return;
        for (var i = 0; i < tree.items.length; i++) {
            var node = tree.items[i];
            if (node instanceof Tree) {
                // push the subtree itself (its heading line)
                if (!(node.status & node.__flags__.HIDDEN)) {
                    // Only include if parent root or visible
                    // tree.generate already handles open/closed marks
                    // We'll rely on refresh for drawing
                    // Mark a synthetic entry representing subtree header
                    node.__isTree = true;
                    this.threadNodeIndex.push(node);
                    if (!(node.status & node.__flags__.CLOSED)) traverse.call(this, node);
                }
            } else { // TreeItem
                if (!(node.status & node.__flags__.HIDDEN)) this.threadNodeIndex.push(node);
            }
        }
    }
    traverse.call(this, this.threadTree);
    // Assign 1-based absolute row indices matching Tree.generate() line usage
    for (var r = 0; r < this.threadNodeIndex.length; r++) this.threadNodeIndex[r].__row = r + 1; // 1-based logical row
};

MessageBoard.prototype._paintThreadTree = function () {
    var f = this._threadContentFrame || this.outputFrame; if (!f) return; f.clear();
    if (!this.threadTree) {
        f.putmsg('Loading thread tree...');
        this._registerThreadSearchHotspot();
        return;
    }
    dbug('MessageBoard: paintThreadTree selection=' + this.threadTreeSelection, 'messageboard');
    // Ensure tree frame matches output frame dims
    this.threadTree.refresh();
    // Highlight selection manually by manipulating tree indices
    // Simpler approach: map selection to actual tree internal index by replay traversal; easier: redraw after adjusting tree.index
    this._indexThreadTree();
    if (!this.threadNodeIndex.length) {
        f.putmsg('No messages');
        this._registerThreadSearchHotspot();
        return;
    }
    if (this.threadTreeSelection >= this.threadNodeIndex.length) this.threadTreeSelection = this.threadNodeIndex.length - 1;
    var targetNode = this.threadNodeIndex[this.threadTreeSelection];
    // Set current indices along ancestry chain
    function setCurrent(node) {
        if (!node) return;
        if (node.parent) {
            // ensure parent open to reveal
            if (node.parent.status & node.parent.__flags__.CLOSED) node.parent.open();
            node.parent.index = node.parent.items.indexOf(node);
            setCurrent(node.parent);
        }
    }
    setCurrent(targetNode);
    this.threadTree.refresh();
    var orderLabelTree = (this._threadSortOrder === 'desc') ? 'Newest first' : 'Oldest first';
    this._writeStatus('THREADS (tree ' + orderLabelTree + '): Enter=Expand/Read  Space=Expand/Collapse  S=Search  Backspace=Subs  ' + (this.threadTreeSelection + 1) + '/' + this.threadNodeIndex.length);
    try { f.cycle(); } catch (e) { }
    // Add hotspots for visible nodes (excluding beyond 36)
    this._releaseHotspots();
    var chars = this._hotspotChars || [];
    var offset = (this.threadTree && typeof this.threadTree.offset === 'number') ? this.threadTree.offset : 0; // tree internal scroll offset (0-based)
    var visibleHeight = f.height; // number of rows available
    var mappedCount = 0;
    var overflow = false;
    // Iterate nodes, only map those within visible window (row > offset && row <= offset+visibleHeight)
    for (var i = 0; i < this.threadNodeIndex.length && mappedCount < chars.length; i++) {
        var node = this.threadNodeIndex[i];
        var absRow = (typeof node.__row === 'number') ? node.__row : (i + 1); // 1-based
        if (absRow <= offset) continue; // above window
        if (absRow > offset + visibleHeight) { overflow = true; break; } // below window
        var visibleRow = absRow - offset; // 1..visibleHeight
        var cmd = chars[mappedCount];
        this._hotspotMap[cmd] = i; // map to node index
        var min_x = f.x; var max_x = f.x + f.width - 1; var y = f.y + visibleRow - 1;
        this._addHotspotArea(cmd, false, min_x, max_x, y - 1);
        mappedCount++;
    }
    // If there are still nodes beyond the visible window or beyond hotspot char capacity, mark overflow
    if (!overflow && (this.threadNodeIndex.length > 0)) {
        var lastVisibleAbs = offset + visibleHeight;
        if (this.threadNodeIndex.length && (this.threadNodeIndex[this.threadNodeIndex.length - 1].__row > lastVisibleAbs)) overflow = true;
        if (mappedCount >= chars.length && this.threadNodeIndex.length > mappedCount) overflow = true;
    }
    if (overflow) this._writeStatus('THREADS (tree ' + orderLabelTree + '): Enter=Expand/Read  Space=Expand/Collapse  S=Search  Backspace=Subs  ' + (this.threadTreeSelection + 1) + '/' + this.threadNodeIndex.length + ' (Scroll / hotspots ' + mappedCount + '/' + chars.length + ')');
    this._registerThreadSearchHotspot();
    this._applyPendingHotspots();
};


MessageBoard.prototype._handleGroupKey = function (key) {
    var controller = this._getViewController('group');
    if (controller && typeof controller.handleKey === 'function') {
        var handled = controller.handleKey.call(controller, key);
        if (typeof handled !== 'undefined') return handled;
    }
    return true;
};

MessageBoard.prototype._handleSubKey = function (key) {
    var controller = this._getViewController('sub');
    if (controller && typeof controller.handleKey === 'function') {
        var handled = controller.handleKey.call(controller, key);
        if (typeof handled !== 'undefined') return handled;
    }
    return true;
};

// TODO: Mouse support
// We'll mirror the approach in whosonline.js: build a stable mapping of commands -> indices
// per repaint, using digits 0-9 then A-Z (up to 36) and store in this._hotspotMap.
// A separate method (e.g. processMouseKey) will intercept those keys in _handleKey before view logic.

MessageBoard.prototype._renderIconLabel = function (frame, item, isSelected, widthOverride) {
    if (!frame) return;
    var baseAttr = isSelected ? (BG_LIGHTGRAY | BLACK) : (BG_BLACK | LIGHTGRAY);
    try { frame.clear(baseAttr); frame.home(); } catch (e) { }
    var width = widthOverride || frame.width || 0;
    if (width <= 0) return;
    var segments = (item && item._labelSegments && item._labelSegments.length) ? item._labelSegments : null;
    var text = (item && item.label) ? item.label : '';
    function repeatSpaces(count) { return (count > 0) ? new Array(count + 1).join(' ') : ''; }
    if (!segments) {
        if (text.length > width) text = text.substr(0, width);
        var left = Math.max(0, Math.floor((width - text.length) / 2));
        var written = 0;
        var padLeft = repeatSpaces(left);
        if (padLeft) { frame.attr = baseAttr; frame.putmsg(padLeft); written += padLeft.length; }
        if (text) { frame.attr = baseAttr; frame.putmsg(text); written += text.length; }
        if (written < width) { frame.attr = baseAttr; frame.putmsg(repeatSpaces(width - written)); }
        return;
    }
    var truncated = [];
    var visible = 0;
    for (var i = 0; i < segments.length; i++) {
        var seg = segments[i];
        var segText = seg && seg.text ? String(seg.text) : '';
        if (!segText.length && segText !== '0') continue;
        var remaining = width - visible;
        if (remaining <= 0) break;
        if (segText.length > remaining) segText = segText.substr(0, remaining);
        truncated.push({ text: segText, color: seg ? seg.color : null });
        visible += segText.length;
    }
    if (!truncated.length) {
        frame.attr = baseAttr;
        frame.putmsg(repeatSpaces(width));
        return;
    }
    var leftPad = Math.max(0, Math.floor((width - visible) / 2));
    var writtenTotal = 0;
    var bg = baseAttr & 0xF0;
    var pad = repeatSpaces(Math.min(leftPad, width));
    if (pad) { frame.attr = baseAttr; frame.putmsg(pad); writtenTotal += pad.length; }
    for (var j = 0; j < truncated.length && writtenTotal < width; j++) {
        var segPart = truncated[j];
        var attr = (segPart.color !== null && typeof segPart.color === 'number') ? (bg | segPart.color) : baseAttr;
        frame.attr = attr;
        frame.putmsg(segPart.text);
        writtenTotal += segPart.text.length;
    }
    if (writtenTotal < width) {
        frame.attr = baseAttr;
        frame.putmsg(repeatSpaces(width - writtenTotal));
    }
};

MessageBoard.prototype._getSubMessageCount = function (code) {
    if (!code || typeof MsgBase !== 'function') return 0;
    if (!this._subMessageCounts) this._subMessageCounts = {};
    var entry = this._subMessageCounts[code];
    var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : (time() * 1000);
    if (entry && (now - entry.ts) < 5000) return entry.total;
    var total = 0;
    var mb = new MsgBase(code);
    if (mb.open()) {
        try {
            total = Math.max(0, parseInt(mb.total_msgs, 10) || 0);
        } catch (e) { total = 0; }
        finally { mb.close(); }
    }
    if (!total) {
        var stats = this._getSubPointers(code);
        if (stats.total) total = stats.total;
    }
    this._subMessageCounts[code] = { total: total, ts: now };
    return total;
};

MessageBoard.prototype._getSubPointers = function (code) {
    var pointer = 0;
    var total = 0;
    if (!code || !msg_area) return { pointer: pointer, total: total };
    var merge = function (subObj) {
        if (!subObj) return;
        if (typeof subObj.scan_ptr === 'number') pointer = Math.max(pointer, parseInt(subObj.scan_ptr, 10) || 0);
        if (typeof subObj.last_read === 'number') pointer = Math.max(pointer, parseInt(subObj.last_read, 10) || 0);
        if (typeof subObj.posts === 'number') total = Math.max(total, parseInt(subObj.posts, 10) || 0);
    };
    if (msg_area.sub && msg_area.sub[code]) merge(msg_area.sub[code]);
    var idx = this._ensureSubIndex();
    if (idx && idx[code] && msg_area.grp_list && msg_area.grp_list[idx[code].groupIndex]) {
        merge(msg_area.grp_list[idx[code].groupIndex].sub_list[idx[code].subIndex]);
    }
    if (typeof this.curgrp === 'number' && msg_area[this.curgrp]) {
        var map = msg_area[this.curgrp];
        if (map && map[code]) merge(map[code]);
    }
    return { pointer: pointer, total: total };
};

MessageBoard.prototype._getSubUnreadCount = function (code, totalHint) {
    if (!code || typeof MsgBase !== 'function') return 0;
    if (!this._subUnreadCounts) this._subUnreadCounts = {};
    var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : (time() * 1000);
    var cached = this._subUnreadCounts[code];
    if (cached && (now - cached.ts) < 5000) return cached.unread;
    var stats = this._getSubPointers(code);
    var pointer = stats.pointer || 0;
    var total = (typeof totalHint === 'number') ? totalHint : (stats.total || this._getSubMessageCount(code));
    var unread = 0;
    var mb = new MsgBase(code);
    if (mb.open()) {
        try {
            var last = (typeof mb.last_msg === 'number') ? mb.last_msg : 0;
            if (pointer < last) {
                var start = pointer + 1;
                var limit = last;
                var maxLoop = 2000;
                var iter = 0;
                for (var num = start; num <= limit; num++) {
                    var hdr = mb.get_msg_header(false, num, false);
                    if (hdr) unread++;
                    iter++;
                    if (iter >= maxLoop) {
                        unread += Math.max(0, (limit - pointer) - iter);
                        break;
                    }
                }
            }
        } catch (e) {
            unread = Math.max(0, total - (pointer || 0));
        } finally {
            try { mb.close(); } catch (_ignored) { }
        }
    } else {
        unread = Math.max(0, total - (pointer || 0));
    }
    if (unread < 0 || !isFinite(unread)) unread = 0;
    this._subUnreadCounts[code] = { unread: unread, ts: now };
    return unread;
};

MessageBoard.prototype._formatSubLabel = function (name, total, unread) {
    name = name || '';
    total = Math.max(0, parseInt(total, 10) || 0);
    unread = Math.max(0, parseInt(unread, 10) || 0);
    var readCount = Math.max(0, total - unread);
    var segments = [];
    var parts = [];
    var readColor = (typeof LIGHTGRAY !== 'undefined') ? LIGHTGRAY : ((typeof WHITE !== 'undefined') ? WHITE : 7);
    var unreadColor = unread > 0
        ? ((typeof YELLOW !== 'undefined') ? YELLOW : ((typeof LIGHTRED !== 'undefined') ? LIGHTRED : WHITE))
        : ((typeof DARKGRAY !== 'undefined') ? DARKGRAY : ((typeof LIGHTGRAY !== 'undefined') ? LIGHTGRAY : WHITE));
    segments.push({ text: String(readCount), color: readColor });
    segments.push({ text: '/', color: null });
    segments.push({ text: String(unread), color: unreadColor });
    parts.push(String(readCount));
    parts.push('/' + String(unread));
    return { text: parts.join('').trim(), segments: segments };
};

// Fallback center helper (avoids dependency on global center())
MessageBoard.prototype._center = function (txt, width) {
    txt = txt || '';
    if (txt.length >= width) return txt.substr(0, width);
    var padTotal = width - txt.length;
    var left = Math.floor(padTotal / 2);
    var right = padTotal - left;
    return new Array(left + 1).join(' ') + txt + new Array(right + 1).join(' ');
};

// Simple internal padding helpers (avoid reliance on ES2017 padStart/padEnd)
MessageBoard.prototype._padLeft = function (str, width, ch) {
    str = str == null ? '' + str : str; ch = ch || ' ';
    if (str.length >= width) return str;
    return new Array(width - str.length + 1).join(ch) + str;
};
MessageBoard.prototype._padRight = function (str, width, ch) {
    str = str == null ? '' + str : str; ch = ch || ' ';
    if (str.length >= width) return str;
    return str + new Array(width - str.length + 1).join(ch);
};

// Compute ordinal mapping for non-special icons (exclude quit/groups) so numbering starts at 1
MessageBoard.prototype._computeNonSpecialOrdinals = function () {
    this._nonSpecialOrdinals = {};
    var count = 0;
    for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (!it) continue;
        if (it.type === 'quit' || it.type === 'groups' || it.type === 'search' || it.type === 'scan') {
            this._nonSpecialOrdinals[i] = 0; // special indicator
        } else {
            count++; this._nonSpecialOrdinals[i] = count;
        }
    }
};

MessageBoard.prototype._findMenuIndexByType = function (type) {
    if (!this.items || !this.items.length) return -1;
    for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (it && it.type === type) return i;
    }
    return -1;
};


MessageBoard.prototype.pauseForReason = function (reason) {
    log('[Message Board] Pausing for reason: ' + (reason || 'unspecified reason'));
    this._endViewTransition();
    // HEY AI ASSISTANTS, this needs to be .top() not bottom quit messing it up
    if (reason === 'screensaver_on' && this.__bg_frame && typeof this.__bg_frame.top === 'function') {
        try { this.__bg_frame.top(); this.__bg_frame.cycle(); } catch (e) { }
        this.__bg_frame.transparent = true;
    }
};

MessageBoard.prototype.resumeForReason = function (reason) {
    log('[Message Board] Resuming from pause: ' + (reason || 'unspecified reason'));
    this._endViewTransition();
    // HEY AI ASSISTANTS, this needs to be .bottom() not top quit messing it up

    if (reason === 'screensaver_off') {
        if (this.__bg_frame && typeof this.__bg_frame.bottom === 'function') {
            try { this.__bg_frame.bottom(); this.__bg_frame.clear(); this.__bg_frame.cycle(); } catch (e) { }
        }
        // Restore hotspots after screensaver ends by repainting the current view
        try {
            // Clear and rebuild hotspots
            if (typeof this._releaseHotspots === 'function') this._releaseHotspots();
            // Repaint current view which will rebuild hotspots
            if (typeof this._renderCurrentView === 'function') {
                var currentView = this.view || 'group';
                if (currentView === 'read' && this.lastReadMsg) {
                    // For read view, need to pass the message to re-enter properly
                    this._renderCurrentView(currentView, this.lastReadMsg);
                } else {
                    this._renderCurrentView(currentView);
                }
            }
            // Also call draw to ensure everything is cycled
            if (typeof this.draw === 'function') this.draw();
        } catch (hsErr) {
            log('[Message Board] Error restoring hotspots after screensaver: ' + hsErr);
        }
    }
};
registerModuleExports({ MessageBoard: MessageBoard });
