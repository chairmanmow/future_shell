// Hello World demo subprogram to validate Subprogram framework.
// Behavior:
// 1. Shows greeting and asks for name.
// 2. Mirrors keystrokes in input frame until ENTER.
// 3. Greets user by name and prompts to press any key to exit.
// 4. ESC at any time aborts immediately.

load('sbbsdefs.js');
load("iconshell/lib/subfunctions/subprogram.js");
if (typeof KEY_ENTER === 'undefined') var KEY_ENTER = '\r';
if (typeof KEY_ESC === 'undefined') var KEY_ESC = '\x1b';
if (typeof KEY_BACKSPACE === 'undefined') var KEY_BACKSPACE = '\b';
if (typeof KEY_DEL === 'undefined') var KEY_DEL = '\x7f';
if (typeof WHITE === 'undefined') var WHITE = 7;
if (typeof BG_WHITE === 'undefined') var BG_WHITE = WHITE << 4;
if (typeof BG_BLUE === 'undefined') var BG_BLUE = 1 << 4;
if (typeof BG_BLACK === 'undefined') var BG_BLACK = 0;
if (typeof BG_RED === 'undefined') var BG_RED = 4 << 4;
if (typeof BG_GREEN === 'undefined') var BG_GREEN = 2 << 4;
if (typeof BG_CYAN === 'undefined') var BG_CYAN = 3 << 4;
if (typeof BG_MAGENTA === 'undefined') var BG_MAGENTA = 5 << 4;

// Thread tree dependency (for + / - expansion UI similar to ecReader)
// We lazily load tree.js only when entering the threads view to avoid cost if user never opens threads.
// But ensure symbol available for early reference if previously loaded elsewhere.
var _TreeLibLoaded = false;


// For now let's use two types of icons until we can be expicity about more definitions
var BOARD_ICONS = {
    'group': 'folder',
    'sub': 'bulletin_board',
    'groups':'mario',
    'quit': 'logoff',
    'search': 'search'
}

var _MB_ICON_ALIAS_CACHE = null;

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
    var iconDir = system.mods_dir + "iconshell/lib/icons/";
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
            } catch(_e){}
        }
    }
    return null;
}

var GROUPING_PREFIXES = ['RE: ', 'Re: ', 'FW: ', 'FWD: '];
function MessageBoard(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'message-board', parentFrame: opts.parentFrame, shell: opts.shell });
    this._init();
}

extend(MessageBoard, Subprogram);

MessageBoard.prototype.enter = function(done) {
    var self = this;
    this._done = (typeof done === 'function') ? done : function(){};

    Subprogram.prototype.enter.call(this, function(){ if(typeof done==='function') done(); });
    // Re-bootstrap state so a reused instance starts fresh
    this._init(true);
    this.draw();
    if (this.autoCycle) {
        try { this.cycle(); } catch(e) {}
    }
};

MessageBoard.prototype._beginInlineSearchPrompt = function(code, returnView){
    if(!this.inputFrame) return false;
    this._navSearchActive = true;
    this._navSearchBuffer = '';
    this._navSearchCode = code;
    this._navSearchReturnView = returnView || this.view;
    this._searchReturnView = this._navSearchReturnView;
    this._navSearchPlaceholder = '[type to search, ENTER=run, ESC=cancel]';
    if(this.view === 'group' || this.view === 'sub'){
        var searchIndex = this._findMenuIndexByType('search');
        if(searchIndex !== -1){
            this._navSearchPrevSelection = this.selection;
            this.selection = searchIndex;
            this._paintIconGrid();
        }
    }
    this._paintInlineSearchPrompt();
    return true;
};

MessageBoard.prototype._paintInlineSearchPrompt = function(message){
    if(!this.inputFrame) return;
    var code = this._navSearchCode;
    var targetName = this._getSubNameByCode(code) || code || '';
    var prompt = 'Search ' + (targetName ? targetName : '') + ': ';
    var buffer = (typeof message === 'string') ? message : this._navSearchBuffer;
    var isPlaceholder = false;
    if(!buffer || !buffer.length){
        buffer = this._navSearchPlaceholder || '';
        isPlaceholder = true;
    }
    if(!isPlaceholder && this._navSearchActive) buffer = buffer + '_';
    try {
        this.inputFrame.clear(BG_BLUE|WHITE);
        this.inputFrame.home();
        var text = prompt + buffer;
        if(text.length > this.inputFrame.width) text = text.substr(text.length - this.inputFrame.width);
        this.inputFrame.putmsg(text);
        this.inputFrame.cycle();
    } catch(e){}
};

MessageBoard.prototype._endInlineSearchPrompt = function(statusMsg){
    this._navSearchActive = false;
    this._navSearchBuffer = '';
    this._navSearchCode = null;
    this._navSearchReturnView = null;
    this._navSearchPlaceholder = '';
    this._navSearchPrevSelection = -1;
    var hasStatus = (typeof statusMsg === 'string' && statusMsg.length);
    if(this.view === 'group' || this.view === 'sub'){
        var searchIndex = this._findMenuIndexByType('search');
        if(searchIndex !== -1){
            this.selection = searchIndex;
            this._paintIconGrid();
        }
    }
    if(hasStatus) this._writeStatus(statusMsg);
};

MessageBoard.prototype._handleInlineSearchKey = function(key){
    if(!this._navSearchActive) return true;
    if(key === null || typeof key === 'undefined') return false;
    if(key === KEY_ESC || key === '\x1b'){
        this._endInlineSearchPrompt('SEARCH cancelled');
        return false;
    }
    if(key === '\r' || key === '\n' || key === KEY_ENTER){
        var term = (this._navSearchBuffer || '').trim();
        if(!term.length){
            this._navSearchPlaceholder = '[enter search term]';
            this._paintInlineSearchPrompt();
            return false;
        }
        var code = this._navSearchCode;
        var retView = this._navSearchReturnView || this.view;
        this._endInlineSearchPrompt();
        this._searchReturnView = retView;
        this._writeStatus('SEARCH: searching...');
        this._executeSearch(code, term);
        return false;
    }
    if(key === KEY_BACKSPACE || key === KEY_DEL || key === '\b' || key === '\x7f'){
        if(this._navSearchBuffer && this._navSearchBuffer.length){
            this._navSearchBuffer = this._navSearchBuffer.substr(0, this._navSearchBuffer.length-1);
        } else {
            this._navSearchBuffer = '';
        }
        this._paintInlineSearchPrompt();
        return false;
    }
    if(typeof key === 'number'){
        if(key >= 32 && key <= 126){
            this._navSearchBuffer += String.fromCharCode(key);
            this._paintInlineSearchPrompt();
        }
        return false;
    }
    if(typeof key === 'string' && key.length === 1 && key >= ' '){
        this._navSearchBuffer += key;
        this._paintInlineSearchPrompt();
        return false;
    }
    // Swallow all other keys while search prompt active
    return false;
};

// Main loop (called externally by shell or could be invoked after enter)
MessageBoard.prototype.cycle = function(){
    if (this.outputFrame) this.outputFrame.cycle();
    if (this.inputFrame) this.inputFrame.cycle();
    this._updateTransitionOverlay();
};

MessageBoard.prototype._ensureFrames = function() {
    if (this.outputFrame && this.outputFrame.is_open) return;
    var pf = this.parentFrame || this.rootFrame || null;
    var x = pf ? pf.x : 1;
    var y = pf ? pf.y : 1;
    var w = pf ? pf.width : console.screen_columns;
    var h = pf ? pf.height : console.screen_rows;
    // Reserve one line for input/status
    this.outputFrame = new Frame(x, y, w, h - 1, BG_BLACK|LIGHTGRAY, pf);
    this.inputFrame  = new Frame(x, y + h - 1, w, 1, BG_BLUE|WHITE, pf);
    this.outputFrame.open();
    this.inputFrame.open();
    this._writeStatus('Message Boards: ' + this.view);
};

MessageBoard.prototype.draw = function() {
    this._renderCurrentView(this.view);
};

MessageBoard.prototype._drawInput = function() {
};

// Guarded exit override (ensures done callback only fires once through base implementation)
MessageBoard.prototype.exit = function(){
    if(!this.running) return; // already exited
    this._releaseHotspots();
    Subprogram.prototype.exit.call(this);
    this._cleanup();
};

MessageBoard.prototype._handleKey = function(key) {
    if (!key) return true;
    if(this._transitionOverlayFrame){
        this._clearTransitionOverlay();
        return true;
    }
    if(this._navSearchActive){
        return this._handleInlineSearchKey(key);
    }
    // ESC now routes to first special cell (Quit or Groups) instead of unconditional exit
    if (key === '\x1b') {
        if (this.view === 'group') {
            if (this.items.length && this.items[0].type === 'quit') {
                this.selection = 0; // highlight quit
                this._paintIconGrid();
                this.exit();
                return false;
            }
            // Fallback if special not present
            this.exit();
            return false;
        } else if (this.view === 'sub') {
            if (this.items.length && this.items[0].type === 'groups') {
                this.selection = 0; // highlight groups pseudo-item
                this._paintIconGrid();
                this._renderGroupView();
                return false;
            }
            // fallback: go to groups anyway
            this._renderGroupView();
            return false;
        } else if (this.view === 'threads') {
            this._renderSubView(this.curgrp); return false;
        } else if (this.view === 'read') {
            // Ensure read-specific frames are removed so thread view can redraw cleanly
            if(this._destroyReadFrames) { try { this._destroyReadFrames(); } catch(e){} }
            this._renderThreadsView(this.cursub); return false;
        } else if (this.view === 'search') {
            this._exitSearchResults();
            return false;
        } else if (this.view === 'post') {
            this._renderThreadsView(this.cursub); return false;
        } else {
            this.exit(); return false;
        }
    }
    if(this.view === 'threads'){
        if(this._threadSearchFocus){
            var handled = this._threadSearchHandleKey(key);
            if(handled !== 'pass') return handled;
        } else if(key === '/' || key === 's' || key === 'S') {
            this._focusThreadSearch('');
            return true;
        }
    }
    // Hotspot key interception (0-9 then A-Z)
    if (this._hotspotMap && this._hotspotMap.hasOwnProperty(key)) {
        var idx = this._hotspotMap[key];
        if(idx === 'thread-search'){
            this._focusThreadSearch('');
            return true;
        }
        if(typeof idx === 'string' && idx.indexOf('search-result:') === 0){
            var rowIndex = parseInt(idx.substr('search-result:'.length), 10);
            if(!isNaN(rowIndex)){
                this._searchSelection = Math.max(0, Math.min(rowIndex, (this._searchResults||[]).length-1));
                this._handleSearchKey('\r');
            }
            return false;
        }
        if (typeof idx === 'number') {
            if(this.view === 'group' || this.view === 'sub') {
                this.selection = idx;
                if (this.view === 'group') {
                    var it = this.items[this.selection];
                    if(it){
                        if(it.type === 'search'){ this._promptSearch(this._lastActiveSubCode || this.cursub || null, 'group'); return false; }
                        if(typeof it.groupIndex !== 'undefined') { this._renderSubView(it.groupIndex); return false; }
                    }
                } else if (this.view === 'sub') {
                    var it2 = this.items[this.selection];
                    if(it2){
                        if(it2.type === 'search'){ this._searchReturnView = 'sub'; this._promptSearch(this._lastActiveSubCode || null, 'sub'); return false; }
                        if(it2.subCode) { this._renderThreadsView(it2.subCode); return false; }
                    }
                }
            } else if(this.view === 'threads' && this.threadTree && this.threadNodeIndex && this.threadNodeIndex.length) {
                // Map hotspot selection to thread tree selection
                this.threadTreeSelection = Math.min(idx, this.threadNodeIndex.length-1);
                var node = this.threadNodeIndex[this.threadTreeSelection];
                if(node){
                    if(node.__isTree){
                        // Toggle expand/collapse
                        if(node.status & node.__flags__.CLOSED) node.open(); else node.close();
                        this._paintThreadTree();
                    } else if(node.__msgHeader){
                        // Open read view directly for leaf
                        this._renderReadView(node.__msgHeader);
                        return false; // consumed navigation
                    } else {
                        this._paintThreadTree();
                    }
                } else {
                    this._paintThreadTree();
                }
            }
            return true;
        }
    }
    switch(this.view){
        case 'group': return this._handleGroupKey(key);
    case 'sub': return this._handleSubKey(key);
    case 'threads':
        // Use tree view if built; fallback to legacy flat list
        if(this.threadTree) return this._handleThreadTreeKey(key);
        return this._handleThreadsKey(key);
    case 'search': return this._handleSearchKey(key);
    case 'read': return this._handleReadKey(key);
        default: return true;
    }
};

MessageBoard.prototype._cleanup = function() {
	this._clearTransitionOverlay();
	this._destroyThreadUI();
	try { if (this.outputFrame) this.outputFrame.close(); } catch(e) {}
	try { if (this.inputFrame) this.inputFrame.close(); } catch(e) {}
    this._resetState();
};

MessageBoard.prototype._resetState = function() {
	this.outputFrame = null;
	this.inputFrame = null;
    this.view = 'group';
    this.selection = 0; this.scrollOffset = 0;
    this.items = [];
    this._hotspotMap = {};
    this.threadHeaders = [];
    this.threadSelection = 0; this.threadScrollOffset = 0;
    this.threadTree = null; this.threadNodeIndex = []; this.threadTreeSelection = 0;
    this._subIndex = null;
    this._threadSearchFrame = null;
    this._threadContentFrame = null;
    this._threadSearchBuffer = '';
    this._threadSearchFocus = false;
    this._threadSearchPlaceholder = '';
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
    this._readReturnView = null;
    this._fullHeaders = {};
    this._threadSequenceCache = {};
    this._cachedSubCode = null;
    this._threadHeadersCache = {};
    this._transitionOverlayFrame = null;
    this._transitionOverlayExpires = 0;
    this._transitionOverlayKind = null;
    this._transitionOverlayTimerEvent = null;
    this._tempOverlayTimer = null;
    this._tempOverlayTimerInterval = null;
    this._tempOverlayTimer = null;
    this._tempOverlayTimerInterval = null;
}

MessageBoard.prototype._releaseHotspots = function(){
    if(typeof console.clear_hotspots === 'function'){
        try { console.clear_hotspots(); } catch(e){}
    }
    this._hotspotMap = {};
};

MessageBoard.prototype._init = function(reentry){
    this.outputFrame = null;
    this.inputFrame = null;
    this.cursub = bbs.cursub_code;
    this.curgrp = bbs.curgrp;
    this.view = 'group';
    this.lastReadMsg = 0;
    this.msgList = [];
    this.selection = 0; this.scrollOffset = 0; this.items = [];
    this.grid = null; this.iconShellUtil = null; this.perPage = 0;
    this.hotspotsEnabled = false; this._hotspotMap = {};
    this.threadHeaders = []; this.threadSelection = 0; this.threadScrollOffset = 0;
    this.threadTree = null; this.threadNodeIndex = []; this.threadTreeSelection = 0; this._threadFrame = null;
    this._iconCells = [];
    this._subIndex = null;
    this._threadSearchFrame = null;
    this._threadContentFrame = null;
    this._threadSearchBuffer = '';
    this._threadSearchFocus = false;
    this._threadSearchPlaceholder = '';
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
    this._readReturnView = null;
    this._fullHeaders = {};
    this._threadSequenceCache = {};
    this._cachedSubCode = null;
    this._threadHeadersCache = {};
    this._transitionOverlayFrame = null;
    this._transitionOverlayExpires = 0;
    this._transitionOverlayKind = null;
    this._transitionOverlayTimerEvent = null;
    // Build comprehensive hotspot character set (single-key tokens only)
    this._buildHotspotCharSet();
    // Thread limits bound by hotspot capacity but capped at 500 for performance
    this.threadHeaderLimit = Math.min(500, this._hotspotChars.length);
    if(reentry) this._releaseHotspots();
};

MessageBoard.prototype._buildHotspotCharSet = function(){
    // Order preference: digits, uppercase, lowercase, selected punctuation, then remaining safe ASCII
    var used = {};
    function push(arr,ch){ if(!used[ch]){ arr.push(ch); used[ch]=true; } }
    var chars = [];
    var digits='0123456789'; for(var i=0;i<digits.length;i++) push(chars,digits[i]);
    var upper='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; for(i=0;i<upper.length;i++) push(chars,upper[i]);
    var lower='abcdefghijklmnopqrstuvwxyz'; for(i=0;i<lower.length;i++) push(chars,lower[i]);
    // Punctuation set (exclude ESC, control chars, space, DEL). Avoid characters likely to conflict with terminal sequences: '[' '\' ']' '^' '_' '`' maybe okay but include; skip '\x1b'
    var punct = "~!@#$%^&*()-_=+[{]}|;:'\",<.>/?"; // backslash escaped
    for(i=0;i<punct.length;i++) push(chars,punct[i]);
    // Optionally add control-key markers? We'll skip non-printable for safety.
    this._hotspotChars = chars; // potentially >90 chars
};

MessageBoard.prototype._changeSub = function(sub) {
	this.cursub = sub;
}

MessageBoard.prototype._changeGroup = function(group) {
	this.curgrp = group;
}

MessageBoard.prototype._renderCurrentView = function(view) {
    switch(view) {
        case 'group':
            this._renderGroupView();
            break;
        case 'sub':
            this._renderSubView();
            break;
        case 'threads':
            this._renderThreadsView();
            break;
        case 'search':
            this._renderSearchResults(true);
            break;
        case 'read':
            this._renderReadView();
            break;
        case 'post':
            this._renderPostView();
            break;
        default:
            this._renderGroupView();
            break;
    }
}

MessageBoard.prototype._renderGroupView = function(groups) {
    this._clearTransitionOverlay();
    // Render a grid of all top level message groups.
    // Use our icon paradigm to display as clickable items in a grid.
    // Selecting an item calls _renderSubView with that group.
    this._ensureFrames();
    this._destroyThreadUI();
    this._clearIconGrid();
    this.view = 'group';
    // Build items from msg_area.grp_list (prepend Quit special cell)
    var list = [];
    list.push({
        type: 'quit',
        label: 'Quit',
        hotkey: '\x1b',
        iconFile: this._resolveBoardIcon('quit', 'quit'),
        iconBg: BG_RED,
        iconFg: WHITE
    });
    list.push({
        type: 'search',
        label: 'Search',
        hotkey: 'S',
        iconFile: this._resolveBoardIcon('search', 'search'),
        iconBg: BG_BLUE,
        iconFg: WHITE
    });
    for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
        var grp = msg_area.grp_list[gi];
        if (!grp || !grp.sub_list || !grp.sub_list.length) continue;
        list.push({
            type: 'group',
            label: grp.name.substr(0, 12),
            hotkey: (grp.name && grp.name.length? grp.name[0].toUpperCase(): null),
            iconFile: this._resolveBoardIcon(grp.name, 'group'),
            iconBg: BG_BLUE,
            iconFg: WHITE,
            groupIndex: gi
        });
    }
    this.items = list;
    this._computeNonSpecialOrdinals();
    this.selection = Math.min(this.selection, this.items.length-1);
    this._paintIconGrid();
    this._writeStatus('GROUPS: Enter opens subs | S=Search | ESC=Quit');
}

MessageBoard.prototype._renderSubView = function(group) {
	this.curgrp = group;
    this._clearTransitionOverlay();
    this.view = 'sub';
    // Render a grid of all the subs in the specified group.
    // Use our icon paradigm to display as clickable items in a grid.
    // Selecting an item (sub) calls _renderThreadsView with that group.
    this._ensureFrames();
    this._destroyThreadUI();
    this._clearIconGrid();
    var grp = msg_area.grp_list[this.curgrp];
    var list = [];
    // Prepend Groups pseudo-item (acts as back to group view)
    list.push({
        type: 'groups',
        label: 'Groups',
        hotkey: '\x1b',
        iconFile: this._resolveBoardIcon('groups', 'groups'),
        iconBg: BG_GREEN,
        iconFg: BLACK
    });
    list.push({
        type: 'search',
        label: 'Search',
        hotkey: 'S',
        iconFile: this._resolveBoardIcon('search', 'search'),
        iconBg: BG_BLUE,
        iconFg: WHITE
    });
    if(!grp) grp = { sub_list: [] };
    for (var si = 0; si < grp.sub_list.length; si++) {
        var sub = grp.sub_list[si];
        list.push({
            type: 'sub',
            label: sub.name.substr(0,12),
            hotkey: (sub.name && sub.name.length? sub.name[0].toUpperCase(): null),
            iconFile: this._resolveBoardIcon(sub.code || sub.name, 'sub'),
            iconBg: BG_CYAN,
            iconFg: BLACK,
            subCode: sub.code
        });
    }
    if(grp.sub_list && grp.sub_list.length && !this._lastActiveSubCode) this._lastActiveSubCode = grp.sub_list[0].code;
    this.items = list;
    this._computeNonSpecialOrdinals();
    this.selection = 0; this.scrollOffset = 0;
    this._paintIconGrid();
    this._writeStatus('SUBS: Enter opens threads | S=Search | Backspace=Groups | '+(this.selection+1)+'/'+this.items.length);

}

MessageBoard.prototype._renderThreadsView = function(sub) {
    this._clearTransitionOverlay();
    this.cursub = sub;
    if(this.cursub) this._lastActiveSubCode = this.cursub;
    this.view = 'threads';
    this._releaseHotspots();
    dbug('MB enter threads view sub='+sub, 'messageboard');
    // Load messages in the specified sub (if not already loaded).
    // If no messages, call _renderPostView to prompt for first post.
    // Render a list of threads in the specified message area.
    // Use tree.js to group messages into threads. (no icons here)
    // Enable mouse reporting for thread selection.
    // If use selects a thread, call _renderReadView with that message.
    this._ensureFrames();
    // Remove any leftover icon frames so list draws cleanly
    this._clearIconGrid();
    this._destroyThreadUI();
    if(!this._fullHeaders) this._fullHeaders = {};
    if(!this._threadSequenceCache) this._threadSequenceCache = {};
    this._ensureThreadSearchUI();
    this._threadSearchFocus = false;
    this._threadSearchBuffer = this._threadSearchBuffer || '';
    this._renderThreadSearchBar();
    var contentFrame = this._threadContentFrame || this.outputFrame;
    // Immediate visual feedback before heavy work
    try { contentFrame.clear(); contentFrame.gotoxy(1,1); contentFrame.putmsg('Building thread list...'); contentFrame.cycle(); } catch(e){}
    this._loadThreadHeaders();
    // Build thread tree (single branch per thread)
    this._ensureTreeLib();
    this._buildThreadTree();
    if(!this.threadHeaders.length){
        contentFrame.clear();
        contentFrame.gotoxy(2,2); contentFrame.putmsg('No messages. Press P to post the first message.');
        this._writeStatus('THREADS: P=Post  S=Search  Backspace=Subs  0/0');
        return;
    }
    this.threadTreeSelection = Math.min(this.threadTreeSelection, Math.max(0,this.threadNodeIndex.length-1));
    if(this.threadTree && this.threadNodeIndex.length){
        this._paintThreadTree();
    } else {
        dbug('MB tree empty, fallback list', 'messageboard');
        this.threadSelection = 0; this.threadScrollOffset = 0; this._paintThreadList();
    }
}


MessageBoard.prototype._renderReadView = function(msg) {
    if(!msg) return;
    this._clearTransitionOverlay();
    this.view = 'read';
    this.lastReadMsg = msg;
    this._storeFullHeader(msg);
    if(!this.outputFrame) this._ensureFrames();
    // Destroy prior read frames if any
    if(this._destroyReadFrames) this._destroyReadFrames();
    var f = this.outputFrame; f.clear();
    // Load avatar lib
    if(!bbs.mods) bbs.mods = {};
    if(!bbs.mods.avatar_lib){ try { bbs.mods.avatar_lib = load({}, 'avatar_lib.js'); } catch(e){} }
    this._avatarLib = bbs.mods.avatar_lib || null;
    var avh = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.height) || 6;
    var headerH = Math.min(avh, f.height-1);
    this._readHeaderFrame = new Frame(f.x, f.y, f.width, headerH, BG_BLUE|WHITE, f.parent);
    var bodyY = this._readHeaderFrame.y + this._readHeaderFrame.height;
    var bodyH = Math.max(1, f.y + f.height - bodyY);
    this._readBodyFrame = new Frame(f.x, bodyY, f.width, bodyH, f.attr || (BG_BLACK|LIGHTGRAY), f.parent);
    try { this._readHeaderFrame.open(); this._readBodyFrame.open(); } catch(e){}
    this._paintReadHeader && this._paintReadHeader(msg);
    var code = this.cursub || (msg.sub || null);
    var bodyLines = [];
    try {
        if(code){
            var mb = new MsgBase(code);
            if(mb.open()){
                try {
                    var body = mb.get_msg_body(msg.number || msg.id || msg, msg, true); // strip ctrl-a
                    if(body) bodyLines = (''+body).split(/\r?\n/);
                } catch(e) { dbug('MB read body error: '+e, 'messageboard'); }
                try { mb.close(); } catch(_e){}
            }
        }
    } catch(e){}
    this._readScroll = 0;
    this._readLines = bodyLines;
    this._paintRead();
    this._focusThreadNodeForMessage(msg);
}

MessageBoard.prototype._paintRead = function(){
    if(this.view !== 'read') return;
    var f=this._readBodyFrame || this.outputFrame; if(!f) return; f.clear();
    var header = this.lastReadMsg;
    var usable = f.height - 1; if(usable < 1) usable = f.height;
    var start = this._readScroll || 0;
    var end = Math.min(this._readLines.length, start + usable);
    var lineY = 1;
    for(var i=start;i<end;i++){
        try { f.gotoxy(1,lineY); var line=this._readLines[i]; if(line.length>f.width) line=line.substr(0,f.width); f.putmsg(line); } catch(e){}
        lineY++; if(lineY>f.height) break;
    }
    this._writeStatus('[ENTER]=Scroll/Next  [Bksp/Del]=Prev Msg  (Arrows: [Up]/[Down]=Scroll - [Right]/[Left]=Thread+/-) [ESC]=Threads  '+(start+1)+'-'+end+'/'+this._readLines.length);
    try { f.cycle(); if(this._readHeaderFrame) this._readHeaderFrame.cycle(); } catch(e){}
};

MessageBoard.prototype._handleReadKey = function(key){
    if(this.view !== 'read') return true;
    var f=this._readBodyFrame || this.outputFrame; var usable = f?f.height-1:20; if(usable<1) usable=1;
    var maxStart = Math.max(0, (this._readLines.length - usable));
    switch(key){
        case KEY_UP: this._readScroll = Math.max(0, (this._readScroll||0)-1); this._paintRead(); return true;
        case KEY_DOWN: this._readScroll = Math.min(maxStart, (this._readScroll||0)+1); this._paintRead(); return true;
        case KEY_PAGEUP: this._readScroll = Math.max(0, (this._readScroll||0)-usable); this._paintRead(); return true;
        case KEY_PAGEDN: this._readScroll = Math.min(maxStart, (this._readScroll||0)+usable); this._paintRead(); return true;
        case KEY_HOME: this._readScroll = 0; this._paintRead(); return true;
        case KEY_END: this._readScroll = maxStart; this._paintRead(); return true;
        case KEY_LEFT: // previous thread
            if(this._openAdjacentThread(-1)) { this._showTransitionOverlay('thread', -1); return false; }
            this._writeStatus('READ: No previous thread');
            return true;
        case KEY_RIGHT: // next thread
            if(this._openAdjacentThread(1)) { this._showTransitionOverlay('thread', 1); return false; }
            this._writeStatus('READ: No next thread');
            return true;
        case '\r': case '\n': case KEY_ENTER:
            if((this._readScroll||0) < maxStart){
                this._readScroll = Math.min(maxStart, (this._readScroll||0) + usable);
                this._paintRead();
                return true;
            }
            if(this._openRelativeInThread(1)) { this._showTransitionOverlay('message', 1); return false; }
            if(this._openAdjacentThread(1)) { this._showTransitionOverlay('thread', 1); return false; }
            this._writeStatus('READ: End of messages');
            return true;
        case '\x7f': // DEL
        case KEY_BACKSPACE:
        case '\x08': // Backspace -> previous message in thread
            if(this._openRelativeInThread(-1)) { this._showTransitionOverlay('message', -1); return false; }
            if(this._openAdjacentThread(-1)) { this._showTransitionOverlay('thread', -1); return false; }
            this._writeStatus('READ: No previous message');
            return true;
        case 'R': case 'r': // Reply to current message
            if(this.lastReadMsg){ this._renderPostView({ replyTo: this.lastReadMsg }); return false; }
            return true;
        case 'P': case 'p': // New post (thread)
            this._renderPostView(); return false;
        case '\x12': // Ctrl-R refresh body
            this._renderReadView(this.lastReadMsg); return true;
        case 'S': case 's': case '/':
            this._promptSearch(this.cursub || this._lastActiveSubCode || null, 'threads');
            return false;
        default: return true;
    }
};

// Helpers for navigating thread containers and adjacent threads
MessageBoard.prototype._getThreadRootEntries = function(){
    var entries = [];
    if(!this.threadNodeIndex || !this.threadNodeIndex.length) return entries;
    for(var i=0; i<this.threadNodeIndex.length; i++){
        var node = this.threadNodeIndex[i];
        if(!node) continue;
        if(node.__isTree){
            entries.push({ index: i, node: node, type: 'tree' });
        } else if(node.__threadRootId && (!node.parent || !node.parent.__isTree)){
            entries.push({ index: i, node: node, type: 'single' });
        }
    }
    return entries;
};

// Open previous/next thread container based on threadTreeSelection delta (-1 or +1)
MessageBoard.prototype._openAdjacentThread = function(delta){
    if(!this.threadTree || !this.threadNodeIndex || !this.threadNodeIndex.length) return false;
    // Find current container node for lastReadMsg
    var currentMsgNum = this.lastReadMsg && this.lastReadMsg.number;
    if(!currentMsgNum) return false;
    this._indexThreadTree();
    var rootEntries = this._getThreadRootEntries();
    if(!rootEntries.length) return false;
    var currentEntryIdx = -1;
    for(var r=0; r<rootEntries.length && currentEntryIdx===-1; r++){
        var entry = rootEntries[r];
        if(entry.type === 'tree'){
            var node = entry.node;
            if(node && node.items){
                for(var m=0;m<node.items.length;m++){
                    var itm = node.items[m];
                    if(itm && itm.__msgHeader && itm.__msgHeader.number === currentMsgNum){ currentEntryIdx = r; break; }
                }
            }
        } else if(entry.node && entry.node.__msgHeader && entry.node.__msgHeader.number === currentMsgNum){
            currentEntryIdx = r;
        }
    }
    if(currentEntryIdx === -1){
        var rootId = this.lastReadMsg.thread_id || this.lastReadMsg.number;
        for(var r2=0; r2<rootEntries.length; r2++){
            if(rootEntries[r2].node && rootEntries[r2].node.__threadRootId === rootId){ currentEntryIdx = r2; break; }
        }
    }
    if(currentEntryIdx === -1) return false;
    var targetEntryIdx = currentEntryIdx + delta;
    if(targetEntryIdx < 0 || targetEntryIdx >= rootEntries.length) return false;
    var targetEntry = rootEntries[targetEntryIdx];
    this.threadTreeSelection = targetEntry.index;
    if(targetEntry.type === 'tree'){
        var targetNode = targetEntry.node;
        try { if(targetNode.status & targetNode.__flags__.CLOSED) targetNode.open(); } catch(e){}
        if(targetNode.items && targetNode.items.length){
            var first = targetNode.items[0];
            if(first && first.__msgHeader){
                this._renderReadView(first.__msgHeader);
                return true;
            }
        }
        var seq = this._buildThreadSequence(targetNode.__threadRootId || (targetNode.__msgHeader && targetNode.__msgHeader.number));
        if(seq && seq.length){
            this._renderReadView(seq[0]);
            return true;
        }
    } else if(targetEntry.node && targetEntry.node.__msgHeader){
        this._renderReadView(targetEntry.node.__msgHeader);
        return true;
    }
    return false;
};

// Move within current thread's message list (dir = +1/-1)
MessageBoard.prototype._openRelativeInThread = function(dir){
    if(!this.lastReadMsg || !this.threadTree || !this.threadNodeIndex) return false;
    var currentMsgNum = this.lastReadMsg.number;
    var container=null; var msgs=[]; var idx=-1;
    // Locate container and index
    for(var i=0;i<this.threadNodeIndex.length;i++){
        var node=this.threadNodeIndex[i];
        if(node && node.__isTree && node.items){
            for(var m=0;m<node.items.length;m++){
                var itm=node.items[m];
                if(itm.__msgHeader && itm.__msgHeader.number===currentMsgNum){ container=node; msgs=node.items; idx=m; break; }
            }
            if(idx!==-1) break;
        }
    }
    if(container && idx!==-1){
        var nidx = idx + dir;
        if(nidx >=0 && nidx < msgs.length){
            var target = msgs[nidx];
            if(target && target.__msgHeader){ this._renderReadView(target.__msgHeader); return true; }
        }
    }

    var seq = this._buildThreadSequence(this.lastReadMsg.thread_id || this.lastReadMsg.number);
    if(!seq || !seq.length) return false;
    for(var i=0;i<seq.length;i++){
        if(seq[i].number === currentMsgNum){
            var targetIndex = i + dir;
            if(targetIndex < 0 || targetIndex >= seq.length) return false;
            var next = seq[targetIndex];
            if(next){ this._renderReadView(next); return true; }
            return false;
        }
    }
    return false;
};

MessageBoard.prototype._renderPostView = function(postOptions) {
    // Delegate to built-in editor only. postOptions.replyTo (header) indicates reply.
    var sub = this.cursub || (bbs && bbs.cursub_code) || null;
    if(!sub){ this._writeStatus('POST: No sub selected'); return; }
    try {
        if(postOptions && postOptions.replyTo){
            this._writeStatus('Replying...');
            bbs.post_msg(sub, WM_NONE, postOptions.replyTo);
        } else {
            this._writeStatus('Posting...');
            bbs.post_msg(sub, WM_NONE);
        }
    } catch(e){ this._writeStatus('Post error: '+e); }
    // Refresh threads after posting
    try { this._destroyReadFrames && this._destroyReadFrames(); } catch(e){}
    this._renderThreadsView(sub);
}

MessageBoard.prototype._paintReadHeader = function(msg){
    if(!this._readHeaderFrame || !msg) return;
    var hf=this._readHeaderFrame; hf.clear(BG_BLUE|WHITE);
    var from = (msg.from || msg.from_net || 'unknown');
    var subj = (msg.subject || '(no subject)');
    var replyTo = msg.replyto || msg.reply_to || msg.replyto_net_addr || '';
    var when = msg.when_written_time || msg.when_written || msg.when_imported_time || 0;
    var dateStr = 'Unknown';
    try { if(when) dateStr = strftime('%Y-%m-%d %H:%M', when); } catch(e){}
    var avatarWidth = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.width) || 10;
    var avatarHeight = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.height) || 6;
    var leftPad = 1; // where avatar starts
    var textStartX = 1;
    // Attempt avatar fetch first (so we know if we need to reserve space)
    var avatarInfo = null;
    if(this._avatarLib){
        try { avatarInfo = this._fetchAvatarForMessage ? this._fetchAvatarForMessage(msg) : null; } catch(e){ log('avatar fetch error: '+e); }
    }
    var haveAvatar = avatarInfo && avatarInfo.obj && avatarInfo.obj.data;
    if(haveAvatar && hf.width > avatarWidth + 3){
        textStartX = avatarWidth + 3; // leave a gap after avatar
    }
    var lines = [];
    lines.push({ label: 'Date', value: dateStr });
    lines.push({ label: 'From', value: from });
    if(replyTo && replyTo.length) lines.push({ label: 'Reply-To', value: replyTo });
    lines.push({ label: 'Subj', value: subj });
    for(var i=0;i<lines.length && i<hf.height;i++){
        var info = lines[i];
        var label = '\x01h\x01y'+info.label+':\x01n ';
        var text = label + info.value;
        if(text.length > hf.width - textStartX + 1) text = text.substr(0, hf.width - textStartX + 1);
        try { hf.gotoxy(textStartX, i+1); hf.putmsg(text); } catch(e){}
    }
    // Blit avatar into header frame (no direct console cursor side-effects)
    if(haveAvatar){
        try {
            var bin = (typeof base64_decode==='function') ? base64_decode(avatarInfo.obj.data) : null;
            if(bin && bin.length >= avatarWidth*avatarHeight*2){
                if(!this._blitAvatarToFrame){
                    this._blitAvatarToFrame = function(frame, binData, w, h, dstX, dstY){
                        var offset=0; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ if(offset+1>=binData.length) return; var ch=binData.substr(offset++,1); var attr=ascii(binData.substr(offset++,1)); try{ frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); }catch(se){} } }
                    };
                }
                this._blitAvatarToFrame(hf, bin, avatarWidth, Math.min(avatarHeight, hf.height), leftPad, 1);
            }
        } catch(be){ log('avatar blit error: '+be); }
    }
};

// Fetch avatar for a message without rendering. Returns {obj, attempts:[{netaddr,username,ok,reason}], chosen:{...}}
MessageBoard.prototype._fetchAvatarForMessage = function(msg){
    if(!this._avatarLib || !msg) return null; var full = msg;
    // Re-fetch full header if needed
    if(!full.from_net_addr && full.number && this.cursub){
        try { var mb=new MsgBase(this.cursub); if(mb.open()){ var fh=mb.get_msg_header(false, full.number, false); if(fh){ fh.number=full.number; full=fh; } mb.close(); } } catch(e){ log('avatar refetch header error: '+e); }
    }
    if(!this._deriveAvatarCandidates){
        this._deriveAvatarCandidates = function(h){
            var cands=[]; if(!h) return cands; var uname=h.from || h.from_net || 'unknown';
            function push(addr,reason){ if(!addr) return; addr=''+addr; for(var i=0;i<cands.length;i++){ if(cands[i].netaddr===addr) return; } cands.push({ username:uname, netaddr:addr, reason:reason }); }
            if(h.from_net_addr) push(h.from_net_addr,'from_net_addr');
            if(h.from_org) push(h.from_org,'from_org');
            function hostToQWK(idstr){ if(!idstr) return; var m=idstr.match(/<[^@]+@([^>]+)>/); if(!m) return; var host=m[1]; var first=host.split('.')[0]; if(!first) return; first=first.replace(/[^A-Za-z0-9_-]/g,''); if(!first.length) return; var q=first.toUpperCase(); if(q.length>8) q=q.substr(0,8); if(!/^[A-Z][A-Z0-9_-]{1,7}$/.test(q)) return; return q; }
            var q1=hostToQWK(h.id); if(q1) push(q1,'id-host');
            var q2=hostToQWK(h.reply_id); if(q2) push(q2,'reply-id-host');
            return cands;
        };
    }
    var candidates = this._deriveAvatarCandidates(full);
    var attempts=[]; var chosen=null; var avatarObj=null;
    for(var i=0;i<candidates.length;i++){
        var c=candidates[i]; var obj=null; var ok=false;
        try { obj = this._avatarLib.read_netuser(c.username, c.netaddr); ok = !!(obj && obj.data); } catch(e){ obj=false; }
        attempts.push({ netaddr:c.netaddr, username:c.username, ok:ok, reason:c.reason });
        if(ok){ chosen=c; avatarObj=obj; break; }
    }
    if(!avatarObj){ log('Avatar fetch failed msg#'+(full.number||'?')+' attempts='+attempts.map(function(a){return a.netaddr+':'+a.reason+'='+a.ok;}).join(', ')); }
    else { log('Avatar fetch success msg#'+(full.number||'?')+' netaddr='+chosen.netaddr+' attempts='+attempts.length); }
    this._lastAvatarObj = avatarObj || null;
    return { obj: avatarObj, attempts: attempts, chosen: chosen, msg: full };
};

MessageBoard.prototype._destroyReadFrames = function(){
    if(this._readHeaderFrame){ try { this._readHeaderFrame.close(); } catch(e){} this._readHeaderFrame=null; }
    if(this._readBodyFrame){ try { this._readBodyFrame.close(); } catch(e){} this._readBodyFrame=null; }
};

MessageBoard.prototype._destroyThreadUI = function(){
    try { if(this._threadSearchFrame) this._threadSearchFrame.close(); } catch(e){}
    try { if(this._threadContentFrame) this._threadContentFrame.close(); } catch(e){}
    this._threadSearchFrame = null;
    this._threadContentFrame = null;
    this._threadSearchFocus = false;
};

MessageBoard.prototype._setThreadSearchPlaceholder = function(placeholder, suppress){
    this._threadSearchPlaceholder = placeholder || '';
    if(!suppress && !this._threadSearchFocus) this._renderThreadSearchBar();
};

MessageBoard.prototype._storeFullHeader = function(hdr){
    if(!hdr || typeof hdr.number === 'undefined' || hdr.number === null) return;
    if(!this._fullHeaders) this._fullHeaders = {};
    this._fullHeaders[hdr.number] = hdr;
    if(this._threadSequenceCache){
        var rootId = hdr.thread_id || hdr.number;
        if(rootId && this._threadSequenceCache[rootId]) delete this._threadSequenceCache[rootId];
    }
};

MessageBoard.prototype._ensureThreadSearchUI = function(){
    if(!this.outputFrame) return;
    if(this._threadSearchFrame && this._threadContentFrame) return;
    var of = this.outputFrame;
    if(of.height <= 1){
        this._threadContentFrame = of;
        this._threadSearchFrame = null;
        return;
    }
    var parent = of.parent || of;
    var searchHeight = 1;
    var contentHeight = Math.max(1, of.height - searchHeight);
    this._threadSearchFrame = new Frame(of.x, of.y, of.width, searchHeight, BG_BLUE|WHITE, parent);
    this._threadContentFrame = new Frame(of.x, of.y + searchHeight, of.width, contentHeight, BG_BLACK|LIGHTGRAY, parent);
    try { this._threadSearchFrame.open(); } catch(e){}
    try { this._threadContentFrame.open(); } catch(e){}
    if(!this._threadSearchPlaceholder) this._setThreadSearchPlaceholder('[Enter search term]', true);
    this._renderThreadSearchBar();
};

MessageBoard.prototype._renderThreadSearchBar = function(){
    if(!this._threadSearchFrame) return;
    var bar = this._threadSearchFrame;
    var attr = this._threadSearchFocus ? (BG_WHITE|BLACK) : (BG_BLUE|WHITE);
    try { bar.clear(attr); bar.home(); } catch(e){}
    var prompt = 'Search: ';
    var display = this._threadSearchBuffer || '';
    if(!display.length && !this._threadSearchFocus){
        display = this._threadSearchPlaceholder || '[Enter search term]';
    }
    var text = prompt + display;
    if(text.length > bar.width) text = text.substr(text.length - bar.width);
    try { bar.putmsg(text); bar.cycle(); } catch(e){}
    this._registerThreadSearchHotspot();
};

MessageBoard.prototype._registerThreadSearchHotspot = function(){
    if(!this._threadSearchFrame) return;
    if(typeof console.add_hotspot !== 'function') return;
    var bar = this._threadSearchFrame;
    if(!this._hotspotMap) this._hotspotMap = {};
    try { console.add_hotspot('/', false, bar.x, bar.x + bar.width - 1, bar.y); } catch(e){}
    this._hotspotMap['/'] = 'thread-search';
};

MessageBoard.prototype._focusThreadSearch = function(initialChar){
    if(!this._threadSearchFrame && this.outputFrame && this.outputFrame.height <= 1){
        this._promptSearch(this.cursub || this._lastActiveSubCode || null, 'threads');
        return;
    }
    this._threadSearchFocus = true;
    if(typeof initialChar === 'string' && initialChar.length === 1 && initialChar >= ' '){
        this._threadSearchBuffer = initialChar;
    } else if(!this._threadSearchBuffer) {
        this._threadSearchBuffer = '';
    }
    this._renderThreadSearchBar();
};

MessageBoard.prototype._threadSearchHandleKey = function(key){
    if(!this._threadSearchFocus) return 'pass';
    var handled = true;
    if(typeof key === 'number'){
        if(key === KEY_ENTER || key === 13) key = '\n';
        else if(key === KEY_ESC || key === 27) key = '\x1b';
        else if(key === KEY_BACKSPACE || key === 8 || key === KEY_DEL || key === 127) key = '\b';
        else if(key >= 32 && key <= 126) key = String.fromCharCode(key);
        else handled = false;
    }
    if(key === '\x1b'){
        this._threadSearchFocus = false;
        if(!this._threadSearchBuffer) this._setThreadSearchPlaceholder('[Enter search term]');
        else this._renderThreadSearchBar();
        return true;
    }
    var nav = [KEY_UP, KEY_DOWN, KEY_PAGEUP, KEY_PAGEDN, KEY_LEFT, KEY_RIGHT, KEY_HOME, KEY_END];
    if(typeof key === 'number' && nav.indexOf(key) !== -1){
        this._threadSearchFocus = false;
        if(!this._threadSearchBuffer) this._setThreadSearchPlaceholder('[Enter search term]');
        else this._renderThreadSearchBar();
        return 'pass';
    }
    if(key === '\n' || key === '\r'){
        var term = (this._threadSearchBuffer || '').trim();
        this._threadSearchFocus = false;
        if(!term.length) this._setThreadSearchPlaceholder('[Enter search term]', false);
        this._renderThreadSearchBar();
        if(term.length){
            this._searchReturnView = 'threads';
            this._executeSearch(this.cursub || this._lastActiveSubCode || null, term);
        }
        return true;
    }
    if(key === '\b'){
        if(this._threadSearchBuffer && this._threadSearchBuffer.length)
            this._threadSearchBuffer = this._threadSearchBuffer.substr(0, this._threadSearchBuffer.length-1);
        else this._threadSearchBuffer = '';
        this._renderThreadSearchBar();
        return true;
    }
    if(typeof key === 'string' && key.length === 1 && key >= ' '){
        this._threadSearchBuffer = (this._threadSearchBuffer || '') + key;
        this._renderThreadSearchBar();
        return true;
    }
    if(!handled) return 'pass';
    return true;
};

// Export constructor globally
this.MessageBoard = MessageBoard;

// Static convenience launcher so shell code can do: MessageBoard.launch(shell, cb)
MessageBoard.launch = function(shell, cb, opts){
    opts = opts || {};
    opts.parentFrame = opts.parentFrame || (shell && shell.subFrame) || (shell && shell.root) || null;
    opts.shell = shell || opts.shell;
    if(shell && shell.timer) opts.timer = shell.timer;
    var mb = new MessageBoard(opts);
    mb.enter(function(){ if(typeof cb==='function') cb(); });
    if(opts.autoCycle) mb.autoCycle = true;
    if(mb.autoCycle) mb.cycle();
    return mb;
};

// ---- Internal helpers (private-ish) ----
MessageBoard.prototype._writeStatus = function(msg){
    if(!this.inputFrame) return;
    if(this._navSearchActive){
        this._paintInlineSearchPrompt();
        return;
    }
    var prefix = this._getCurrentSubName();
    var text = msg || '';
    if(prefix && prefix.length) text = prefix + ' | ' + text;
    this.inputFrame.clear(BG_BLUE|WHITE); this.inputFrame.home();
    this.inputFrame.putmsg(truncsp(text).substr(0,this.inputFrame.width));
};

MessageBoard.prototype._calcGridMetrics = function(){
    var w = this.outputFrame.width, h=this.outputFrame.height;
    var iconW=ICSH_CONSTANTS?ICSH_CONSTANTS.ICON_W:10;
    var iconH=ICSH_CONSTANTS?ICSH_CONSTANTS.ICON_H:6;
    var cellW=iconW+2; var cellH=iconH+1+2; // +label +padding
    var cols=Math.max(1, Math.floor(w / cellW));
    var rows=Math.max(1, Math.floor(h / cellH));
    return {iconW:iconW, iconH:iconH, cols:cols, rows:rows, cellW:cellW, cellH:cellH};
};

MessageBoard.prototype._ensureSubIndex = function(){
    if(this._subIndex) return this._subIndex;
    var map = {};
    if(msg_area && msg_area.grp_list){
        for(var gi=0; gi<msg_area.grp_list.length; gi++){
            var grp = msg_area.grp_list[gi];
            if(!grp || !grp.sub_list) continue;
            for(var si=0; si<grp.sub_list.length; si++){
                var sub = grp.sub_list[si];
                if(!sub || !sub.code) continue;
                map[sub.code] = { name: sub.name || sub.code, groupIndex: gi, subIndex: si };
            }
        }
    }
    this._subIndex = map;
    return map;
};

MessageBoard.prototype._getSubNameByCode = function(code){
    if(!code) return '';
    var idx = this._ensureSubIndex();
    if(idx && idx.hasOwnProperty(code)) return idx[code].name || code;
    return '';
};

MessageBoard.prototype._getCurrentSubName = function(){
    var code = this.cursub || bbs.cursub_code || this._lastActiveSubCode || null;
    if(!code) return '';
    return this._getSubNameByCode(code);
};

MessageBoard.prototype._highlightQuery = function(text, query, resume){
    if(!text || !query) return text || '';
    resume = resume || ''; // already handles reset codes outside
    var pattern;
    try {
        var esc = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        pattern = new RegExp(esc, 'ig');
    } catch(e){ return text; }
    return (''+text).replace(pattern, function(match){ return '\x01h\x01y'+match+resume; });
};

MessageBoard.prototype._syncSubState = function(code){
    if(!code) return null;
    var changed = (this._cachedSubCode && this._cachedSubCode !== code);
    this.cursub = code;
    try { if(bbs && typeof bbs.cursub_code !== 'undefined') bbs.cursub_code = code; } catch(e){}
    try { if(user && typeof user.cursub !== 'undefined') user.cursub = code; } catch(e){}
    var subIndex = null;
    var groupIndex = this.curgrp;
    var map = this._ensureSubIndex();
    if(map && map.hasOwnProperty(code)){
        var entry = map[code];
        if(entry){
            if(typeof entry.subIndex === 'number') subIndex = entry.subIndex;
            if(typeof entry.groupIndex === 'number') groupIndex = entry.groupIndex;
        }
    }
    if(typeof groupIndex === 'number' && groupIndex >= 0){
        this.curgrp = groupIndex;
        try { if(bbs && typeof bbs.curgrp !== 'undefined') bbs.curgrp = groupIndex; } catch(e){}
    }
    if(typeof subIndex === 'number' && subIndex >= 0){
        try { if(bbs && typeof bbs.cursub !== 'undefined') bbs.cursub = subIndex; } catch(e){}
    }
    if(changed){
        this._fullHeaders = {};
        this._threadSequenceCache = {};
    }
    this._cachedSubCode = code;
    return { code: code, groupIndex: groupIndex, subIndex: subIndex };
};

MessageBoard.prototype._getIconAliasMap = function(){
    if(!this._iconAliasMap) this._iconAliasMap = _mbLoadIconAliasMap();
    return this._iconAliasMap;
};

MessageBoard.prototype._resolveBoardIcon = function(name, type){
    var fallback = BOARD_ICONS[type];
    if(!fallback) fallback = (type === 'group') ? 'folder' : 'bulletin_board';
    var resolved = _mbFindIconBase(name);
    if(resolved) return resolved;
    // Try resolving on type as secondary hint before falling back
    if(type && type !== name){
        resolved = _mbFindIconBase(type);
        if(resolved) return resolved;
    }
    return fallback;
};

MessageBoard.prototype._promptSearch = function(preferredCode, returnView){
    var code = preferredCode || this.cursub || this._lastActiveSubCode || bbs.cursub_code || null;
    if(!code){
        this._writeStatus('SEARCH: Select a sub first');
        return;
    }
    this._lastActiveSubCode = code;
    if(this._beginInlineSearchPrompt(code, returnView)) return;
    this._writeStatus('SEARCH input unavailable in this view');
};

MessageBoard.prototype._executeSearch = function(code, query){
    var results = [];
    if(code) this._lastActiveSubCode = code;
    var mb = new MsgBase(code);
    if(!mb.open()){
        this._writeStatus('SEARCH: Unable to open '+code);
        return;
    }
    try {
        var total = mb.total_msgs || 0;
        for(var n=1; n<=total; n++){
            var hdr = mb.get_msg_header(false, n, false);
            if(!hdr) continue;
            var matched = false;
            var fields = [hdr.subject, hdr.from, hdr.to, hdr.from_net, hdr.to_net, hdr.id, hdr.reply_id];
            var lowered = query.toLowerCase();
            for(var i=0;i<fields.length && !matched;i++){
                var val = fields[i];
                if(val && String(val).toLowerCase().indexOf(lowered) !== -1) matched = true;
            }
            var body = null;
            if(!matched){
                try { body = mb.get_msg_body(hdr.number, hdr, true); } catch(e){ body = null; }
                if(body && body.toLowerCase().indexOf(lowered) !== -1) matched = true;
            }
            if(!matched) continue;
            if(body === null){
                try { body = mb.get_msg_body(hdr.number, hdr, true); } catch(e){ body = ''; }
            }
            var snippet = '';
            if(body){
                var clean = body.replace(/\r?\n/g,' ');
                var idx = clean.toLowerCase().indexOf(lowered);
                if(idx !== -1){
                    var start = Math.max(0, idx - 30);
                    var end = Math.min(clean.length, idx + query.length + 30);
                    snippet = clean.substring(start, end).replace(/\s+/g,' ');
                    if(start>0) snippet = '...'+snippet;
                    if(end<clean.length) snippet += '...';
                }
            }
            if(!snippet && hdr.subject) snippet = hdr.subject;
            results.push({
                code: code,
                header: hdr,
                number: hdr.number,
                subject: hdr.subject || '(no subject)',
                from: hdr.from || hdr.from_net || 'unknown',
                snippet: snippet
            });
        }
    } finally {
        try { mb.close(); } catch(e){}
    }
    if(!results.length){
        this._writeStatus('SEARCH: No matches for "'+query+'"');
        if(this.view === 'threads'){
            this._threadSearchBuffer = '';
            this._setThreadSearchPlaceholder('[no results for "'+query+'"]');
        }
        var ret = this._searchReturnView || 'group';
        this._searchReturnView = null;
        if(ret === 'sub') this._renderSubView(this.curgrp);
        else if(ret === 'threads') this._renderThreadsView(this.cursub);
        else this._renderGroupView();
        return;
    }
    this._searchResults = results;
    this._searchSelection = 0;
    this._searchScrollOffset = 0;
    this._searchQuery = query;
    this.view = 'search';
    this._renderSearchResults();
};

MessageBoard.prototype._renderSearchResults = function(preserveState){
    this._clearTransitionOverlay();
    if(this._destroyReadFrames) {
        try { this._destroyReadFrames(); } catch(e){}
    }
    this._destroyThreadUI();
    this._ensureFrames();
    this._releaseHotspots();
    this._clearIconGrid();
    this.view = 'search';
    if(!this.outputFrame) return;
    if(!this._searchResults || !this._searchResults.length){
        try { this.outputFrame.clear(); this.outputFrame.putmsg('No matches found.'); } catch(e){}
        this._writeStatus('SEARCH: No matches');
        return;
    }
    if(!preserveState){
        this._searchSelection = Math.max(0, Math.min(this._searchSelection, this._searchResults.length-1));
        this._searchScrollOffset = Math.min(this._searchScrollOffset, this._searchSelection);
    }
    this._paintSearchResults();
};

MessageBoard.prototype._paintSearchResults = function(){
    var f = this.outputFrame; if(!f) return;
    try { f.clear(); } catch(e){}
    var header = '\x01h\x01cSearch \x01h\x01y"'+this._searchQuery+'"\x01h\x01c in \x01h\x01y'+(this._getCurrentSubName()||'')+'\x01h\x01c ('+this._searchResults.length+' results)\x01n';
    if(header.length > f.width) header = header.substr(0, f.width);
    try { f.gotoxy(1,1); f.putmsg(header); } catch(e){}
    var usable = Math.max(1, f.height - 2);
    if(this._searchSelection < this._searchScrollOffset) this._searchScrollOffset = this._searchSelection;
    if(this._searchSelection >= this._searchScrollOffset + usable) this._searchScrollOffset = Math.max(0, this._searchSelection - usable + 1);
    var end = Math.min(this._searchResults.length, this._searchScrollOffset + usable);
    this._releaseHotspots();
    if(!this._hotspotMap) this._hotspotMap = {};
    var hotspotChars = this._hotspotChars || [];
    var usedHotspots = 0;
    for(var i=this._searchScrollOffset; i<end; i++){
        var res = this._searchResults[i];
        var lineY = 2 + (i - this._searchScrollOffset);
        if(lineY > f.height) break;
        var line = this._padLeft(''+res.number,5,' ') + ' ' + this._padRight((res.from||'').substr(0,12),12,' ') + ' ' + (res.subject||'');
        if(res.snippet) line += ' - ' + res.snippet.replace(/\s+/g,' ');
        if(line.length > f.width) line = line.substr(0, f.width-3)+'...';
        var selected = (i === this._searchSelection);
        var resume = selected ? '\x01n\x01h' : '\x01n';
        line = this._highlightQuery(line, this._searchQuery, resume);
        if(selected) line = '\x01n\x01h'+line; else line='\x01n'+line;
        try { f.gotoxy(1,lineY); f.putmsg(line); } catch(e){}
        var cmd = null;
        if(usedHotspots < hotspotChars.length) {
            cmd = hotspotChars[usedHotspots++];
        }
        if(cmd){
            this._hotspotMap[cmd] = 'search-result:'+i;
            if(typeof console.add_hotspot === 'function'){
                try { console.add_hotspot(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1); } catch(e){}
            }
        }
    }
    try { f.cycle(); } catch(e){}
    this._writeStatus('SEARCH: Enter=Read  ESC/Bksp=Back  '+(this._searchSelection+1)+'/'+this._searchResults.length);
};

MessageBoard.prototype._handleSearchKey = function(key){
    if(this.view !== 'search') return true;
    if(key === '\x1b' || key === '\x08'){
        this._exitSearchResults();
        return false;
    }
    if(!this._searchResults || !this._searchResults.length) return true;
    var usable = this.outputFrame ? Math.max(1, this.outputFrame.height - 2) : this._searchResults.length;
    var oldSel = this._searchSelection;
    if(key === KEY_UP) this._searchSelection = Math.max(0, this._searchSelection-1);
    else if(key === KEY_DOWN) this._searchSelection = Math.min(this._searchResults.length-1, this._searchSelection+1);
    else if(key === KEY_PAGEUP) this._searchSelection = Math.max(0, this._searchSelection-usable);
    else if(key === KEY_PAGEDN) this._searchSelection = Math.min(this._searchResults.length-1, this._searchSelection+usable);
    else if(key === KEY_HOME) this._searchSelection = 0;
    else if(key === KEY_END) this._searchSelection = this._searchResults.length-1;
    else if(key === '\r' || key === '\n' || key === KEY_ENTER){
        var item = this._searchResults[this._searchSelection];
        if(item && item.header){
            this._readReturnView = 'search';
            this._syncSubState(item.code || this.cursub);
            this._renderReadView(item.header);
        }
        return false;
    } else {
        return true;
    }
    if(this._searchSelection !== oldSel) this._paintSearchResults();
    return true;
};

MessageBoard.prototype._exitSearchResults = function(){
    this._releaseHotspots();
    var ret = this._searchReturnView || 'group';
    this._searchReturnView = null;
    if(ret === 'sub') this._renderSubView(this.curgrp);
    else if(ret === 'threads'){
        this._threadSearchBuffer = '';
        this._setThreadSearchPlaceholder('[Enter search term]', false);
        this._renderThreadsView(this.cursub);
    }
    else this._renderGroupView();
};

MessageBoard.prototype._paintIconGrid = function(){
    this.outputFrame.clear();
    // Clear previous hotspots
    if (typeof console.clear_hotspots === 'function') { try { console.clear_hotspots(); } catch(e){} }
    this._hotspotMap = {};
    this._clearIconGrid();
    if (!this.items.length){ this.outputFrame.putmsg('No items'); return; }
    // Lazy load Icon and reuse existing icon infrastructure
    if (!this._Icon) { try { this._Icon = load('iconshell/lib/shell/icon.js').Icon || Icon; } catch(e) { try { load('iconshell/lib/shell/icon.js'); this._Icon=Icon; } catch(e2){} } }
    var metrics=this._calcGridMetrics();
    var maxVisible = metrics.cols * metrics.rows;
    if (this.selection < this.scrollOffset) this.scrollOffset=this.selection;
    if (this.selection >= this.scrollOffset + maxVisible) this.scrollOffset = Math.max(0, this.selection - maxVisible + 1);
    var end = Math.min(this.items.length, this.scrollOffset + maxVisible);
    var visible = this.items.slice(this.scrollOffset, end);
    // Build and render each visible icon
    var idx=0;
    for (var v=0; v<visible.length; v++) {
        var globalIndex = this.scrollOffset + v;
        var col = idx % metrics.cols; var row = Math.floor(idx / metrics.cols);
        var x = (col * metrics.cellW) + 2; var y=(row * metrics.cellH)+1;
        var iconFrame = new Frame(this.outputFrame.x + x -1, this.outputFrame.y + y -1, metrics.iconW, metrics.iconH, (visible[v].iconBg||0)|(visible[v].iconFg||0), this.outputFrame);
        var labelFrame= new Frame(iconFrame.x, iconFrame.y + metrics.iconH, metrics.iconW, 1, BG_BLACK|LIGHTGRAY, this.outputFrame);
        var iconObj = new this._Icon(iconFrame,labelFrame,visible[v]);
        iconObj.render();
        this._iconCells.push({ icon: iconFrame, label: labelFrame });
        // Selection highlight
        if (globalIndex === this.selection) {
            labelFrame.clear(BG_LIGHTGRAY|BLACK); labelFrame.home(); labelFrame.putmsg(this._center(visible[v].label.substr(0,metrics.iconW), metrics.iconW));
        }
        // Hotspot mapping: ESC for special first cell; numbering starts at 1 for others (1-9 then A-Z)
        var item = visible[v];
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
                if (alphaIndex < 26) cmd = String.fromCharCode('A'.charCodeAt(0)+alphaIndex);
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
                if (typeof console.add_hotspot === 'function') {
                    for (var hy=0; hy<metrics.iconH; hy++) {
                        try { console.add_hotspot(mappedCmd, false, iconFrame.x, iconFrame.x + iconFrame.width - 1, iconFrame.y + hy); } catch(e){}
                    }
                    try { console.add_hotspot(mappedCmd, false, labelFrame.x, labelFrame.x + labelFrame.width - 1, labelFrame.y); } catch(e){}
                }
            }
        }
        idx++;
    }
    var baseHelp;
    if (this.view === 'group') baseHelp = 'Enter=Open  S=Search  ESC=Quit ';
    else if (this.view === 'sub') baseHelp = 'Enter=Open  S=Search  ESC=Groups  Backspace=Groups ';
    else baseHelp = '';
    this._writeStatus(this.view.toUpperCase()+': '+(this.selection+1)+'/'+this.items.length+' PgUp/PgDn Navigate '+baseHelp);
};

MessageBoard.prototype._clearIconGrid = function(){
    if(!this._iconCells) return;
    for(var i=0;i<this._iconCells.length;i++){
        var c=this._iconCells[i];
        try { c.icon && c.icon.close(); } catch(e){}
        try { c.label && c.label.close(); } catch(e){}
    }
    this._iconCells = [];
};

// ---- Threads View ----
MessageBoard.prototype._loadThreadHeaders = function(limit){
    // If caller specifies limit use min with our configured threadHeaderLimit
    limit = limit || this.threadHeaderLimit || 500;
    limit = Math.min(limit, this.threadHeaderLimit || limit);
    this.threadHeaders = [];
    var code = this.cursub || (this.items[this.selection] && this.items[this.selection].subCode) || bbs.cursub_code;
    if(!code) return;
    if(!this._threadHeadersCache) this._threadHeadersCache = {};
    var cacheKey = code + ':' + limit;
    var cached = this._threadHeadersCache[cacheKey] || null;
    var mb = new MsgBase(code);
    if(!mb.open()) { return; }
    try {
        var total = mb.total_msgs;
        if(!total) return;
        if(cached && cached.total === total && cached.headers){
            this.threadHeaders = cached.headers.slice();
            if(cached.fullHeaders){
                if(!this._fullHeaders) this._fullHeaders = {};
                for(var num in cached.fullHeaders){
                    if(cached.fullHeaders.hasOwnProperty(num)) this._fullHeaders[num] = cached.fullHeaders[num];
                }
            }
            return;
        }
        var start = Math.max(1, total - limit + 1);
        for(var n=start; n<=total; n++) {
            var hdr = mb.get_msg_header(false, n, false);
            if(!hdr) continue;
            this._storeFullHeader(hdr);
            this.threadHeaders.push({
                number:n,
                id: hdr.id,
                reply_id: hdr.reply_id,
                subject: hdr.subject || '(no subject)',
                from: hdr.from || hdr.from_net || 'unknown',
                when: hdr.when_written_time || hdr.when_written || 0
            });
        }
    } catch(e) { /* swallow */ }
    finally { try { mb.close(); } catch(e2) {} }
    // Basic chronological sort (oldest first). For threads we might group later.
    this.threadHeaders.sort(function(a,b){ return a.number - b.number; });
    // Cache headers and associated full header details for reuse
    var cacheHeaders = this.threadHeaders.slice();
    var cacheFull = {};
    if(this._fullHeaders){
        for(var i=0;i<cacheHeaders.length;i++){
            var num = cacheHeaders[i].number;
            if(this._fullHeaders[num]) cacheFull[num] = this._fullHeaders[num];
        }
    }
    this._threadHeadersCache[cacheKey] = { total: total, headers: cacheHeaders, fullHeaders: cacheFull };
};

MessageBoard.prototype._paintThreadList = function(){
    var f = this._threadContentFrame || this.outputFrame; if(!f) return; f.clear();
    if(!this.threadHeaders.length){ f.putmsg('No messages'); return; }
    var h = f.height; var usable = h - 2; // leave top line for header maybe
    if(usable < 3) usable = h; // fallback
    // pagination
    if(this.threadSelection < this.threadScrollOffset) this.threadScrollOffset = this.threadSelection;
    if(this.threadSelection >= this.threadScrollOffset + usable) this.threadScrollOffset = Math.max(0, this.threadSelection - usable + 1);
    var end = Math.min(this.threadHeaders.length, this.threadScrollOffset + usable);
    f.gotoxy(1,1);
    f.putmsg('Messages in ' + (this.cursub||'') + ' ('+this.threadHeaders.length+')');
    var row=0;
    for(var i=this.threadScrollOffset; i<end; i++) {
        var hdr = this.threadHeaders[i];
        var lineY = 2 + row; if(lineY>f.height) break;
        var sel = (i === this.threadSelection);
        try { f.gotoxy(1,lineY); } catch(e){}
    var subj = hdr.subject.replace(/\s+/g,' ');
        if(subj.length > f.width - 25) subj = subj.substr(0, f.width - 28) + '...';
    var from = hdr.from.substr(0,12);
    var numStr = this._padLeft(''+hdr.number,5,' ');
        var dateStr = '';
        try { if(hdr.when) dateStr = strftime('%m-%d %H:%M', hdr.when); } catch(e){}
    var text = numStr + ' ' + this._padRight(from,12,' ') + ' ' + subj;
        if(text.length < f.width) text += Array(f.width - text.length + 1).join(' ');
        if(sel) text='\x01n\x01h'+text; else text='\x01n'+text;
        f.putmsg(text.substr(0,f.width));
        row++;
    }
    this._writeStatus('THREADS: Enter=Read  P=Post  S=Search  Backspace=Subs  '+(this.threadSelection+1)+'/'+this.threadHeaders.length);
    this._registerThreadSearchHotspot();
};

// ---- Thread Tree (using tree.js) ----
MessageBoard.prototype._ensureTreeLib = function(){
    if (_TreeLibLoaded) return;
    try { load('tree.js'); _TreeLibLoaded = true; } catch(e) { /* ignore */ }
};

MessageBoard.prototype._buildThreadTree = function(){
    this.threadTree = null; this.threadNodeIndex = [];
    var frame = this._threadContentFrame || this.outputFrame;
    if(!frame) return;
    if (typeof Tree === 'undefined') { return; }

    if(!this._fullHeaders) this._fullHeaders = {};
    var rootMap = {};
    var self = this;
    function recordRoot(h){
        if(!h) return;
        var rid = h.thread_id || h.number;
        if(rid) rootMap[rid] = true;
    }
    for(var num in self._fullHeaders){ if(self._fullHeaders.hasOwnProperty(num)) recordRoot(self._fullHeaders[num]); }
    for(var i=0;i<self.threadHeaders.length;i++) recordRoot(self._fullHeaders[self.threadHeaders[i].number] || null);
    var rootList = Object.keys(rootMap).map(function(v){ return parseInt(v,10); }).filter(function(n){ return n>0; });
    if(!rootList.length) rootList = self.threadHeaders.map(function(h){ return h.number; });
    rootList.sort(function(a,b){ return a-b; });

    var treeRoot = new Tree(frame, '');
    treeRoot.colors.bg = BG_BLACK; treeRoot.colors.fg = LIGHTGRAY;
    treeRoot.colors.lbg = BG_BLUE; treeRoot.colors.lfg = WHITE;
    treeRoot.colors.cbg = BG_BLUE; treeRoot.colors.cfg = WHITE;
    treeRoot.colors.hfg = LIGHTCYAN; treeRoot.colors.tfg = LIGHTGRAY;
    treeRoot.colors.xfg = CYAN;

    var dateWidth = 12;
    var fromWidth = 16;

    function ensureHeader(num){
        if(!num) return null;
        if(self._fullHeaders && self._fullHeaders[num]) return self._fullHeaders[num];
        var code = self.cursub || self._lastActiveSubCode || bbs.cursub_code;
        if(!code) return null;
        try {
            var mb = new MsgBase(code);
            if(!mb.open()) return null;
            var hdr = mb.get_msg_header(false, num, false);
            try { mb.close(); } catch(e){}
            if(hdr){ self._storeFullHeader(hdr); return hdr; }
        } catch(e){}
        return self._fullHeaders[num] || null;
    }

    function fmtDate(msg){
        var t = msg.when_written_time || msg.when_written || msg.when_imported_time || 0;
        if(!t) return '--/-- --:--';
        try { return strftime('%m-%d %H:%M', t); } catch(e) { return '--/-- --:--'; }
    }

    function fmtFrom(msg){ return (msg.from || msg.from_net || 'unknown'); }

    function buildThreadLabel(rootHdr, count, width){
        var subjectWidth = Math.max(12, width - (dateWidth + fromWidth + 12));
        var label = '['+self._padLeft(''+(rootHdr.number||'?'),4,' ')+'] ';
        label += self._padRight(fmtDate(rootHdr), dateWidth, ' ') + '  ';
        label += self._padRight(fmtFrom(rootHdr).substr(0, fromWidth), fromWidth, ' ') + '  ';
        var subj = rootHdr.subject || '(no subject)';
        if(subj.length > subjectWidth) subj = subj.substr(0, subjectWidth-3)+'...';
        label += subj + '  ('+count+' msg'+(count===1?'':'s')+')';
        if(label.length > width) label = label.substr(0, width);
        return label;
    }

    function buildItemLabel(msg, width){
        var subjectWidth = Math.max(12, width - (dateWidth + fromWidth + 6));
        var label = self._padRight(fmtDate(msg), dateWidth, ' ') + '  ';
        label += self._padRight(fmtFrom(msg).substr(0, fromWidth), fromWidth, ' ') + '  ';
        var subj = msg.subject || '(no subject)';
        if(subj.length > subjectWidth) subj = subj.substr(0, subjectWidth-3)+'...';
        label += subj;
        if(label.length > width) label = label.substr(0, width);
        return label;
    }

    for(var r=0; r<rootList.length; r++){
        var rootId = rootList[r];
        var seq = self._buildThreadSequence(rootId);
        if(!seq || !seq.length){
            var rootHdr = ensureHeader(rootId);
            if(rootHdr) seq = [rootHdr]; else continue;
        }
        var rootHdr = seq[0];
        if(seq.length === 1){
            var solo = treeRoot.addItem(buildThreadLabel(rootHdr, 1, frame.width), (function(h){ return function(){ return h; };})(rootHdr));
            solo.__msgHeader = rootHdr;
            solo.__threadRootId = rootId;
        } else {
            var threadNode = treeRoot.addTree(buildThreadLabel(rootHdr, seq.length, frame.width));
            threadNode.__msgHeader = rootHdr;
            threadNode.__isTree = true;
            threadNode.__threadRootId = rootId;
            for(var i=0;i<seq.length;i++){
                var msg = seq[i];
                if(!msg) continue;
                var item = threadNode.addItem(buildItemLabel(msg, frame.width), (function(h){ return function(){ return h; };})(msg));
                item.__msgHeader = msg;
            }
        }
    }

    treeRoot.open();
    this.threadTree = treeRoot;
    this._indexThreadTree();
    treeRoot.refresh();
    dbug('MB buildThreadTree done nodes='+this.threadNodeIndex.length, 'messageboard');
};
MessageBoard.prototype._buildThreadSequence = function(rootId){
    if(!rootId && this.lastReadMsg) rootId = this.lastReadMsg.thread_id || this.lastReadMsg.number;
    var code = this.cursub || this._lastActiveSubCode || bbs.cursub_code;
    if(!rootId || !code) return [];
    if(!this._threadSequenceCache) this._threadSequenceCache = {};
    if(this._threadSequenceCache[rootId]) return this._threadSequenceCache[rootId];

    var self = this;
    if(!this._fullHeaders) this._fullHeaders = {};
    var mb = null;

    function ensureHeader(num){
        if(!num) return null;
        if(self._fullHeaders && self._fullHeaders[num]) return self._fullHeaders[num];
        try {
            if(!mb){ mb = new MsgBase(code); if(!mb.open()){ mb = null; return null; } }
            var hdr = mb.get_msg_header(false, num, false);
            if(hdr){ self._storeFullHeader(hdr); return hdr; }
        } catch(e){}
        return self._fullHeaders[num] || null;
    }

    var root = ensureHeader(rootId);
    if(!root){ if(mb){ try { mb.close(); } catch(e){} } return []; }

    var sequence = [];
    var visited = {};
    function traverse(node){
        if(!node || visited[node.number]) return;
        visited[node.number] = true;
        sequence.push(node);
        var childNum = node.thread_first;
        while(childNum){
            if(visited[childNum]) break;
            var child = ensureHeader(childNum);
            if(!child) break;
            traverse(child);
            var nextNum = child.thread_next;
            if(!nextNum || visited[nextNum]) break;
            childNum = nextNum;
        }
    }

    traverse(root);
    if(mb){ try { mb.close(); } catch(e){} }
    if(!sequence.length) return [];
    this._threadSequenceCache[rootId] = sequence;
    return sequence;
};

MessageBoard.prototype._focusThreadNodeForMessage = function(msg){
    if(!msg || !this.threadTree || !this.threadNodeIndex) return;
    this._indexThreadTree();
    for(var i=0;i<this.threadNodeIndex.length;i++){
        var node=this.threadNodeIndex[i];
        if(node && node.__msgHeader && node.__msgHeader.number === msg.number){
            this.threadTreeSelection = i;
            return;
        }
    }
};




MessageBoard.prototype._indexThreadTree = function(){
    this.threadNodeIndex = [];
    if(!this.threadTree) return;
    // We traverse treeTree.items recursively respecting open/closed status to build flat visible list
    function traverse(tree){
        if(!tree || !tree.items) return;
        for(var i=0;i<tree.items.length;i++) {
            var node = tree.items[i];
            if(node instanceof Tree) {
                // push the subtree itself (its heading line)
                if(!(node.status & node.__flags__.HIDDEN)) {
                    // Only include if parent root or visible
                    // tree.generate already handles open/closed marks
                    // We'll rely on refresh for drawing
                    // Mark a synthetic entry representing subtree header
                    node.__isTree = true;
                    this.threadNodeIndex.push(node);
                    if(!(node.status & node.__flags__.CLOSED)) traverse.call(this, node);
                }
            } else { // TreeItem
                if(!(node.status & node.__flags__.HIDDEN)) this.threadNodeIndex.push(node);
            }
        }
    }
    traverse.call(this, this.threadTree);
    // Assign 1-based absolute row indices matching Tree.generate() line usage
    for(var r=0; r<this.threadNodeIndex.length; r++) this.threadNodeIndex[r].__row = r + 1; // 1-based logical row
};

MessageBoard.prototype._paintThreadTree = function(){
    var f=this._threadContentFrame || this.outputFrame; if(!f) return; f.clear();
    if(!this.threadTree){ f.putmsg('Loading thread tree...'); return; }
    dbug('MB paintThreadTree selection='+this.threadTreeSelection, 'messageboard');
    // Ensure tree frame matches output frame dims
    this.threadTree.refresh();
    // Highlight selection manually by manipulating tree indices
    // Simpler approach: map selection to actual tree internal index by replay traversal; easier: redraw after adjusting tree.index
    this._indexThreadTree();
    if(!this.threadNodeIndex.length){ f.putmsg('No messages'); return; }
    if(this.threadTreeSelection >= this.threadNodeIndex.length) this.threadTreeSelection=this.threadNodeIndex.length-1;
    var targetNode = this.threadNodeIndex[this.threadTreeSelection];
    // Set current indices along ancestry chain
    function setCurrent(node){
        if(!node) return;
        if(node.parent){
            // ensure parent open to reveal
            if(node.parent.status & node.parent.__flags__.CLOSED) node.parent.open();
            node.parent.index = node.parent.items.indexOf(node);
            setCurrent(node.parent);
        }
    }
    setCurrent(targetNode);
    this.threadTree.refresh();
    this._writeStatus('THREADS (tree): Enter=Expand/Read  Space=Expand/Collapse  S=Search  Backspace=Subs  '+(this.threadTreeSelection+1)+'/'+this.threadNodeIndex.length);
    try { f.cycle(); } catch(e){}
    // Add hotspots for visible nodes (excluding beyond 36)
    if(typeof console.clear_hotspots === 'function'){ try { console.clear_hotspots(); } catch(e){} }
    this._hotspotMap = {};
    var chars = this._hotspotChars || [];
    var offset = (this.threadTree && typeof this.threadTree.offset === 'number') ? this.threadTree.offset : 0; // tree internal scroll offset (0-based)
    var visibleHeight = f.height; // number of rows available
    var mappedCount = 0;
    var overflow = false;
    // Iterate nodes, only map those within visible window (row > offset && row <= offset+visibleHeight)
    for(var i=0;i<this.threadNodeIndex.length && mappedCount < chars.length;i++){
        var node = this.threadNodeIndex[i];
        var absRow = (typeof node.__row === 'number') ? node.__row : (i+1); // 1-based
        if(absRow <= offset) continue; // above window
        if(absRow > offset + visibleHeight) { overflow = true; break; } // below window
        var visibleRow = absRow - offset; // 1..visibleHeight
        var cmd = chars[mappedCount];
        this._hotspotMap[cmd] = i; // map to node index
        var min_x = f.x; var max_x = f.x + f.width - 1; var y = f.y + visibleRow - 1;
        try { console.add_hotspot(cmd, false, min_x, max_x, y - 1); } catch(e){}
        mappedCount++;
    }
    // If there are still nodes beyond the visible window or beyond hotspot char capacity, mark overflow
    if(!overflow && (this.threadNodeIndex.length > 0)) {
        var lastVisibleAbs = offset + visibleHeight;
        if(this.threadNodeIndex.length && (this.threadNodeIndex[this.threadNodeIndex.length-1].__row > lastVisibleAbs)) overflow = true;
        if(mappedCount >= chars.length && this.threadNodeIndex.length > mappedCount) overflow = true;
    }
    if(overflow) this._writeStatus('THREADS (tree): Enter=Expand/Read  Space=Expand/Collapse  S=Search  Backspace=Subs  '+(this.threadTreeSelection+1)+'/'+this.threadNodeIndex.length+' (Scroll / hotspots '+mappedCount+'/'+chars.length+')');
    this._registerThreadSearchHotspot();
};

MessageBoard.prototype._handleThreadTreeKey = function(key){
    if(!this.threadTree) return true;
    switch(key){
        case KEY_UP:
            this.threadTreeSelection = Math.max(0, this.threadTreeSelection-1); this._paintThreadTree(); return true;
        case KEY_DOWN:
            this.threadTreeSelection = Math.min(this.threadNodeIndex.length-1, this.threadTreeSelection+1); this._paintThreadTree(); return true;
        case KEY_HOME:
            this.threadTreeSelection = 0; this._paintThreadTree(); return true;
        case KEY_END:
            this.threadTreeSelection = this.threadNodeIndex.length-1; this._paintThreadTree(); return true;
        case '\x08': // Backspace
        case 'Q':
        case '\x1B':
            this._renderSubView(this.curgrp); 
            return false;
        case '/':
        case 'S':
        case 's':
            this._focusThreadSearch('');
            return true;
        case ' ': // Space toggles expand/collapse if tree node
            var node = this.threadNodeIndex[this.threadTreeSelection];
            if(node && node.__isTree){ if(node.status & node.__flags__.CLOSED) node.open(); else node.close(); this._paintThreadTree(); }
            return true;
        case '\r': case '\n':
            var node2 = this.threadNodeIndex[this.threadTreeSelection];
            if(node2){
                if(node2.__isTree){ // expand
                    if(node2.status & node2.__flags__.CLOSED) node2.open(); else { // open & no children? treat as header
                        // fallthrough to first child if exists
                        if(node2.items && node2.items.length){ node2.open(); }
                    }
                    this._paintThreadTree();
                } else if(node2.__msgHeader){
                    this._renderReadView(node2.__msgHeader);
                }
            }
            return false;
        case 'P': case 'p': this._renderPostView(); return false;
        case 'R': case 'r': {
            var sel = this.threadNodeIndex[this.threadTreeSelection];
            if(sel && sel.__msgHeader){ this._renderPostView({ replyTo: sel.__msgHeader }); return false; }
            return true;
        }
        default: return true;
    }
};

MessageBoard.prototype._handleThreadsKey = function(key){
    if(!this.threadHeaders.length){
        if(key==='P'||key==='p') { this._renderPostView(); return false; }
        if(key==='\x08') { this._renderSubView(this.curgrp); return false; }
        return true;
    }
    var oldSel = this.threadSelection;
    var f = this._threadContentFrame || this.outputFrame; var usable = f ? f.height - 2 : 10; if(usable<3) usable = f?f.height:10;
    if((key===KEY_UP || key===KEY_PAGEUP) && this.threadSelection===0){
        this._focusThreadSearch('');
        return true;
    }
    switch(key){
        case KEY_UP: this.threadSelection=Math.max(0,this.threadSelection-1); break;
        case KEY_DOWN: this.threadSelection=Math.min(this.threadHeaders.length-1,this.threadSelection+1); break;
        case KEY_PAGEUP: this.threadSelection=Math.max(0,this.threadSelection-usable); break;
        case KEY_PAGEDN: this.threadSelection=Math.min(this.threadHeaders.length-1,this.threadSelection+usable); break;
        case KEY_HOME: this.threadSelection=0; break;
        case KEY_END: this.threadSelection=this.threadHeaders.length-1; break;
        case '\x08': // Backspace
            this._renderSubView(this.curgrp); return false;
        case 'P': case 'p':
            this._renderPostView(); return false;
        case 'R': case 'r':
            var rh = this.threadHeaders[this.threadSelection]; if(rh){ this._renderPostView({ replyTo: rh }); }
            return false;
        case '\r': case '\n':
            var hdr=this.threadHeaders[this.threadSelection]; if(hdr) { this._renderReadView(hdr); } return false;
        default: return true;
    }
    if(this.threadSelection!==oldSel) this._paintThreadList();
    return true;
};


MessageBoard.prototype._handleGroupKey = function(key){
    var metrics=this._calcGridMetrics();
    var maxVisible=metrics.cols*metrics.rows;
    var oldSel=this.selection;
    if (key===KEY_LEFT) this.selection=Math.max(0,this.selection-1);
    else if (key===KEY_RIGHT) this.selection=Math.min(this.items.length-1,this.selection+1);
    else if (key===KEY_UP) this.selection=Math.max(0,this.selection-metrics.cols);
    else if (key===KEY_DOWN) this.selection=Math.min(this.items.length-1,this.selection+metrics.cols);
    else if (key==="\x0d"||key==="\n") { // Enter
        var item=this.items[this.selection];
        if(item){
            if (item.type === 'quit') { this.exit(); return false; }
            if (item.type === 'search') { this._promptSearch(this._lastActiveSubCode || this.cursub || null, 'group'); return false; }
            if (item.type === 'group') { this._renderSubView(item.groupIndex); return false; }
        }
        return false;
    }
    else if (key==='S' || key==='s' || key==='/') { this._promptSearch(this._lastActiveSubCode || this.cursub || null, 'group'); return false; }
    else if (key===KEY_PAGEUP) { this.selection=Math.max(0,this.selection-maxVisible); }
    else if (key===KEY_PAGEDN) { this.selection=Math.min(this.items.length-1,this.selection+maxVisible); }
    if (this.selection!==oldSel) {
        var current = this.items[this.selection];
        if(current && current.subCode) this._lastActiveSubCode = current.subCode;
        this._paintIconGrid();
    }
    return true;
};

MessageBoard.prototype._handleSubKey = function(key){
    var metrics=this._calcGridMetrics();
    var maxVisible=metrics.cols*metrics.rows;
    var oldSel=this.selection;
    if (key===KEY_LEFT) this.selection=Math.max(0,this.selection-1);
    else if (key===KEY_RIGHT) this.selection=Math.min(this.items.length-1,this.selection+1);
    else if (key===KEY_UP) this.selection=Math.max(0,this.selection-metrics.cols);
    else if (key===KEY_DOWN) this.selection=Math.min(this.items.length-1,this.selection+metrics.cols);
    else if (key==="\x08") { // Backspace
        this._renderGroupView();
        return false;
    }
    else if (key==="\x0d"||key==="\n") { // Enter
        var item=this.items[this.selection];
        if(item){
            if (item.type === 'groups') { this._renderGroupView(); return false; }
            if (item.type === 'sub') { this._renderThreadsView(item.subCode); return false; }
        }
        return false;
    }
    else if (key==='S' || key==='s' || key==='/') { this._searchReturnView = 'sub'; this._promptSearch(this._lastActiveSubCode || null, 'sub'); return false; }
    else if (key===KEY_PAGEUP) { this.selection=Math.max(0,this.selection-maxVisible); }
    else if (key===KEY_PAGEDN) { this.selection=Math.min(this.items.length-1,this.selection+maxVisible); }
    if (this.selection!==oldSel) {
        var current = this.items[this.selection];
        if(current && current.subCode) this._lastActiveSubCode = current.subCode;
        this._paintIconGrid();
    }
    return true;
};

// TODO: Mouse support
// We'll mirror the approach in whosonline.js: build a stable mapping of commands -> indices
// per repaint, using digits 0-9 then A-Z (up to 36) and store in this._hotspotMap.
// A separate method (e.g. processMouseKey) will intercept those keys in _handleKey before view logic.

// Fallback center helper (avoids dependency on global center())
MessageBoard.prototype._center = function(txt, width){
    txt = txt || '';
    if (txt.length >= width) return txt.substr(0,width);
    var padTotal = width - txt.length;
    var left = Math.floor(padTotal/2);
    var right = padTotal - left;
    return new Array(left+1).join(' ') + txt + new Array(right+1).join(' ');
};

// Simple internal padding helpers (avoid reliance on ES2017 padStart/padEnd)
MessageBoard.prototype._padLeft = function(str, width, ch){
    str = str==null?''+str:str; ch = ch || ' ';
    if(str.length >= width) return str;
    return new Array(width - str.length + 1).join(ch) + str;
};
MessageBoard.prototype._padRight = function(str, width, ch){
    str = str==null?''+str:str; ch = ch || ' ';
    if(str.length >= width) return str;
    return str + new Array(width - str.length + 1).join(ch);
};

// Compute ordinal mapping for non-special icons (exclude quit/groups) so numbering starts at 1
MessageBoard.prototype._computeNonSpecialOrdinals = function(){
    this._nonSpecialOrdinals = {};
    var count = 0;
    for (var i=0;i<this.items.length;i++) {
        var it = this.items[i];
        if (!it) continue;
        if (it.type === 'quit' || it.type === 'groups' || it.type === 'search') {
            this._nonSpecialOrdinals[i] = 0; // special indicator
        } else {
            count++; this._nonSpecialOrdinals[i] = count;
        }
    }
};

MessageBoard.prototype._findMenuIndexByType = function(type){
    if(!this.items || !this.items.length) return -1;
    for(var i=0; i<this.items.length; i++){
        var it = this.items[i];
        if(it && it.type === type) return i;
    }
    return -1;
};

MessageBoard.prototype._showTransitionOverlay = function(kind, direction){
    dbug('MB transition overlay show kind='+kind+' direction='+direction, 'messageboard');
    if(!this.outputFrame) return;
    this._clearTransitionOverlay();
    var parent = this.outputFrame.parent || this.outputFrame;
    var maxWidth = Math.max(1, parent.width - 2);
    var width = Math.min(40, maxWidth);
    if(width < 20) width = maxWidth;
    if(width < 1) width = parent.width;
    var maxHeight = Math.max(1, parent.height - 2);
    var height = Math.min(3, maxHeight);
    if(height < 1) height = parent.height;
    var x = parent.x + Math.max(0, Math.floor((parent.width - width) / 2));
    var y = parent.y + Math.max(0, Math.floor((parent.height - height) / 2));
    var bg = (kind === 'thread') ? BG_MAGENTA : BG_BLUE;
    var attr = bg | WHITE;
    var frame = new Frame(x, y, width, height, attr, parent);
    try { frame.open(); frame.top(); } catch(e){}
    try {
        frame.clear(attr);
        frame.gotoxy(1, Math.floor(height/2)+1);
        var dirText = (direction < 0) ? 'previous' : 'next';
        var text = 'Showing ' + dirText + ' ' + (kind === 'thread' ? 'thread' : 'message');
        frame.putmsg(this._center(text, width));
        frame.cycle();
    } catch(e){}
    this._transitionOverlayFrame = frame;
    var now = (typeof time === 'function') ? time() : Math.floor(Date.now() / 1000);
    this._transitionOverlayExpires = now + 1;
    this._transitionOverlayKind = kind;
    if(this._transitionOverlayTimerEvent){
        this._transitionOverlayTimerEvent.abort = true;
        this._transitionOverlayTimerEvent = null;
    }
    var timer = this.timer || (this.shell && this.shell.timer) || null;
    dbug('MB transition overlay timer '+(timer ? 'existing' : 'none') + (this.timer ? ' instance' : (this.shell && this.shell.timer ? ' from shell' : '')), 'messageboard');
    if(!timer && typeof Timer === 'function'){
        dbug('MB transition overlay timer fallback new Timer', 'messageboard');
        timer = new Timer();
        this._tempOverlayTimer = timer;
        if(typeof js !== 'undefined' && typeof js.setInterval === 'function'){
            this._tempOverlayTimerInterval = js.setInterval(function(){ try { timer.cycle(); } catch(e){} }, 100);
        }
    }
    if(timer && typeof timer.addEvent === 'function'){
        var self = this;
        this._transitionOverlayTimerEvent = timer.addEvent(1000, false, function(){ self._clearTransitionOverlay(); }, [], this);
    }
};

MessageBoard.prototype._clearTransitionOverlay = function(){
    if(this._transitionOverlayFrame){
        try { this._transitionOverlayFrame.close(); } catch(e){}
        this._transitionOverlayFrame = null;
    }
    this._transitionOverlayExpires = 0;
    this._transitionOverlayKind = null;
    if(this._transitionOverlayTimerEvent){
        this._transitionOverlayTimerEvent.abort = true;
        this._transitionOverlayTimerEvent = null;
    }
    if(this._tempOverlayTimerInterval && typeof js !== 'undefined' && typeof js.clearInterval === 'function'){
        try { js.clearInterval(this._tempOverlayTimerInterval); } catch(e){}
        this._tempOverlayTimerInterval = null;
    }
    if(this._tempOverlayTimer){
        try { this._tempOverlayTimer.cycle(); } catch(e){}
        this._tempOverlayTimer = null;
    }
};

MessageBoard.prototype._updateTransitionOverlay = function(){
    if(!this._transitionOverlayFrame) return;
    if(this._tempOverlayTimer){
        try { this._tempOverlayTimer.cycle(); } catch(e){}
    }
    var now = (typeof time === 'function') ? time() : Math.floor(Date.now() / 1000);
    if(now >= (this._transitionOverlayExpires || 0)) {
        this._clearTransitionOverlay();
    } else {
        try { this._transitionOverlayFrame.cycle(); } catch(e){}
    }
};


MessageBoard.prototype.pauseForReason = function(reason){
    log('[Message Board] Pausing for reason: '+(reason||'unspecified reason'));
};

MessageBoard.prototype.resumeForReason = function(reason){
    dbug('MB resume reason='+(reason||''), 'messageboard');
    try { this._clearTransitionOverlay(); } catch(e){}
    try { this._ensureFrames(); } catch(e){}
    switch(this.view){
        case 'read':
            if(this.lastReadMsg) this._renderReadView(this.lastReadMsg);
            else this._renderCurrentView('threads');
            break;
        case 'threads':
            this._renderThreadsView(this.cursub || this._lastActiveSubCode || null);
            break;
        case 'search':
            this._renderSearchResults(true);
            break;
        case 'post':
            this._renderPostView();
            break;
        default:
            this._renderCurrentView(this.view || 'group');
            break;
    }
};
