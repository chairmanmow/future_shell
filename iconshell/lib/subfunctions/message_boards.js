// Hello World demo subprogram to validate Subprogram framework.
// Behavior:
// 1. Shows greeting and asks for name.
// 2. Mirrors keystrokes in input frame until ENTER.
// 3. Greets user by name and prompts to press any key to exit.
// 4. ESC at any time aborts immediately.

load('sbbsdefs.js');
load("iconshell/lib/subfunctions/subprogram.js");
load("iconshell/lib/util/debug.js");
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
    'groups':'back',
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
    this.blockScreenSaver = false;
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
    if(!this.inputFrame){
        this._ensureFrames();
        if(!this.inputFrame) return false;
    }
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
    if(!this.running) return;
    this._startFrameCycle();
};

MessageBoard.prototype._startFrameCycle = function(){
    this._pumpFrameCycle();
    if(!this.timer || typeof this.timer.addEvent !== 'function') return;
    if(this._frameCycleEvent) return;
    var self = this;
    this._frameCycleEvent = this.timer.addEvent(120, true, function(){
        if(!self.running){
            self._cancelFrameCycle();
            return;
        }
        self._pumpFrameCycle();
    });
};

MessageBoard.prototype._pumpFrameCycle = function(){
    try { if(this.outputFrame) this.outputFrame.cycle(); } catch(e){}
    try { if(this.inputFrame) this.inputFrame.cycle(); } catch(e){}
};

MessageBoard.prototype._cancelFrameCycle = function(){
    if(!this._frameCycleEvent) return;
    try { this._frameCycleEvent.abort = true; } catch(e){}
    this._frameCycleEvent = null;
};

MessageBoard.prototype._ensureFrames = function() {
    if (this.outputFrame && this.outputFrame.is_open) return;
    var pf = this.hostFrame || this.rootFrame || null;
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
    this._cancelFrameCycle();
    this._releaseHotspots();
    Subprogram.prototype.exit.call(this);
    this._cleanup();
};

MessageBoard.prototype._handleKey = function(key) {
    if (!key) return true;
    if(this.view === 'read' && this._consumeReadNoticeKey && this._consumeReadNoticeKey(key)) return true;
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
        if(idx === 'read-sub-icon'){
            if(this.view === 'read' && typeof this._destroyReadFrames === 'function') {
                try { this._destroyReadFrames(); } catch(e){}
            }
            this._renderSubView(this.curgrp);
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
	try { this._destroyReadFrames && this._destroyReadFrames(); } catch(e) {}
	this._destroyThreadUI();
    this._hideReadNotice({ skipRepaint: true });
    this._cancelFrameCycle();
	try { this._clearIconGrid && this._clearIconGrid(); } catch(e) {}
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
    this._readScroll = 0;
    this._readBodyText = '';
    this._readBodyLineCache = null;
    this._frameCycleEvent = null;
    this._readNoticeFrame = null;
    this._readNoticeEvent = null;
    this._readNoticeActive = false;
}

MessageBoard.prototype._releaseHotspots = function(){
    if(typeof console.clear_hotspots === 'function'){
        try { console.clear_hotspots(); } catch(e){}
    }
    this._hotspotMap = {};
};

MessageBoard.prototype._init = function(reentry){
    if(reentry) this._cancelFrameCycle();
    this._hideReadNotice({ skipRepaint: true });
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
    this._subMessageCounts = {};
    this._setReadBodyText('');
    this._readScroll = 0;
    this._readSubIconFrame = null;
    this._readSubIconHotspotKey = '@';
    // Build comprehensive hotspot character set (single-key tokens only)
    this._buildHotspotCharSet();
    // Default to no artificial cap; hotspot mapping handles visible rows only
    this.threadHeaderLimit = 0;
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
		var subName = (sub.name || sub.code || '').substr(0,12);
		var totalMessages = this._getSubMessageCount(sub.code);
		var labelInfo = this._formatSubLabel(subName, totalMessages);
		list.push({
			type: 'sub',
			label: labelInfo.text,
			hotkey: (sub.name && sub.name.length? sub.name[0].toUpperCase(): null),
			iconFile: this._resolveBoardIcon(sub.code || sub.name, 'sub'),
			iconBg: BG_CYAN,
			iconFg: BLACK,
			subCode: sub.code,
			_labelBase: subName,
			_labelSegments: labelInfo.segments,
			_messageCount: totalMessages
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
    var previousCode = this.cursub || this._lastActiveSubCode || this._cachedSubCode || bbs.cursub_code || null;
    var state = this._syncSubState(sub || previousCode);
    var code = state && state.code ? state.code : (this.cursub || this._lastActiveSubCode || bbs.cursub_code);
    if (!code) return;
    this.cursub = code;
    this._lastActiveSubCode = code;
    var subChanged = previousCode && code !== previousCode;
    this.view = 'threads';
    this._releaseHotspots();
    dbug('MessageBoard: enter threads view sub=' + code, 'messageboard');
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
    if (subChanged) {
        this.threadTreeSelection = 0;
        this.threadHeaders = [];
        this.threadNodeIndex = [];
        this.threadTree = null;
        this.threadScrollOffset = 0;
        this.threadSelection = 0;
    }
    this._ensureThreadSearchUI();
    if (subChanged) {
        this._threadSearchFocus = false;
        this._threadSearchBuffer = '';
    } else {
        this._threadSearchFocus = false;
        this._threadSearchBuffer = this._threadSearchBuffer || '';
    }
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
        dbug('MessageBoard: thread tree empty, fallback list', 'messageboard');
        this.threadSelection = 0; this.threadScrollOffset = 0; this._paintThreadList();
    }
}


MessageBoard.prototype._renderReadView = function(msg) {
    // log('MessageBoard: enter read view', 'messageboard', JSON.stringify(msg));
    if(!msg) return;
    this.view = 'read';
    this._releaseHotspots();
    this._hotspotMap = {};
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
    var code = this.cursub || (msg.sub || null) || this._lastActiveSubCode || bbs.cursub_code;
    var fullHeader = msg;
    var bodyText = '';
    if(code && msg && typeof msg.number === 'number'){
        var mb = new MsgBase(code);
        if(mb.open()){
            try {
                var cached = (this._fullHeaders && this._fullHeaders[msg.number]) || null;
                if(!cached){
                    try { cached = mb.get_msg_header(false, msg.number, true); } catch(e) { cached = null; }
                    if(cached) this._storeFullHeader(cached);
                }
                if(cached) fullHeader = cached;
                if(fullHeader) this._storeFullHeader(fullHeader);
                bodyText = this._readMessageBody(mb, fullHeader) || '';
            } finally {
                try { mb.close(); } catch(_e){}
            }
        }
    }
    this.lastReadMsg = fullHeader;
    this._updateScanPointer(fullHeader);
    this._readScroll = 0;
    this._setReadBodyText(bodyText);
    this._paintRead();
}

MessageBoard.prototype._setReadBodyText = function(text){
    this._readBodyText = text || '';
    this._readBodyLineCache = null;
};

MessageBoard.prototype._getReadLines = function(){
    if(this._readBodyLineCache) return this._readBodyLineCache;
    var raw = this._readBodyText || '';
    this._readBodyLineCache = raw.length ? raw.split(/\r?\n/) : [];
    return this._readBodyLineCache;
};

MessageBoard.prototype._readMessageBody = function(msgbase, header){
    if(!msgbase || !header) return '';
    var body = '';
    var msgNumber = (typeof header.number === 'number') ? header.number : null;
    try {
        body = msgbase.get_msg_body(header) || '';
    } catch(e){ body = ''; }
    if(!body && msgNumber !== null){
        try { 
            body = msgbase.get_msg_body(msgNumber) || '';
         }
        catch(e) { body = ''; }
    }
    if(!body && msgNumber !== null){
        try {
            var idx = msgbase.get_msg_index(msgNumber);
            var offset = null;
            if(typeof idx === 'object' && idx !== null && typeof idx.offset === 'number') offset = idx.offset;
            else if(typeof idx === 'number' && idx >= 0) offset = idx;
            if(offset !== null) body = msgbase.get_msg_body(true, offset) || '';
        } catch(e){ body = ''; }
    }
    if(!body){
        dbug('MessageBoard: empty body for msg #' + (msgNumber === null ? '?' : msgNumber) + ' offset=' + (header.offset === undefined ? 'n/a' : header.offset), 'messageboard');
    }
    return body || '';
};

MessageBoard.prototype._updateScanPointer = function(header){
    if(!header || typeof header.number !== 'number') return;
    if(!this.cursub || !msg_area[this.curgrp] || !msg_area[this.curgrp][this.cursub]) return;
    if(header.number > msg_area[this.curgrp][this.cursub].scan_ptr){
        msg_area[this.curgrp][this.cursub].scan_ptr = header.number;
    }
};

MessageBoard.prototype._paintRead = function(){
    if(this.view !== 'read') return;
    var f=this._readBodyFrame || this.outputFrame; if(!f) return; f.clear();
    var usable = f.height - 1; if(usable < 1) usable = f.height;
    var start = this._readScroll || 0;
    var lines = this._getReadLines();
    var totalLines = lines.length;
    if(start < 0) start = 0;
    if(start >= totalLines) start = Math.max(0, totalLines - usable);
    var end = Math.min(totalLines, start + usable);
    var lineY = 1;
    for(var i=start;i<end;i++){
        var line = lines[i] || '';
        if(line.length && line.indexOf('\x00') !== -1) line = line.replace(/\x00+/g,'');
        if(line.length>f.width) line=line.substr(0,f.width);
        try {
            f.gotoxy(1,lineY);
            f.putmsg(line);
        } catch(e){
            var err = (e && e.message) ? e.message : e;
            dbug('MessageBoard: paintRead putmsg error ' + err, 'messageboard');
        }
        lineY++;
        if(lineY>f.height) break;
    }
    var dispStart = totalLines ? (start + 1) : 0;
    var dispEnd = totalLines ? end : 0;
    this._writeStatus('[ENTER]=Scroll/NextMsg  [Bksp/Del]=PrevMsg (Arrows: [Up]/[Down]=Scroll - [Right]/[Left]=Thread+/-) [ESC]=Threads  '+dispStart+'-'+dispEnd+'/'+totalLines);
    try { f.cycle(); if(this._readHeaderFrame) this._readHeaderFrame.cycle(); } catch(e){}
};

MessageBoard.prototype._handleReadKey = function(key){
    if(this.view !== 'read') return true;
    var f=this._readBodyFrame || this.outputFrame; var usable = f?f.height-1:20; if(usable<1) usable=1;
    var lines = this._getReadLines();
    var maxStart = Math.max(0, (lines.length - usable));
    switch(key){
        case KEY_UP: this._readScroll = Math.max(0, (this._readScroll||0)-1); this._paintRead(); return true;
        case KEY_DOWN: this._readScroll = Math.min(maxStart, (this._readScroll||0)+1); this._paintRead(); return true;
        case KEY_PAGEUP: this._readScroll = Math.max(0, (this._readScroll||0)-usable); this._paintRead(); return true;
        case KEY_PAGEDN: this._readScroll = Math.min(maxStart, (this._readScroll||0)+usable); this._paintRead(); return true;
        case KEY_HOME: this._readScroll = 0; this._paintRead(); return true;
        case KEY_END: this._readScroll = maxStart; this._paintRead(); return true;
        case KEY_LEFT: // previous thread
            if(this._openAdjacentThread(-1)) return false;
            return true;
        case KEY_RIGHT: // next thread
            if(this._openAdjacentThread(1)) return false;
            return true;
        case KEY_ENTER:
        case '\r':
        case '\n':
            if((this._readScroll||0) < maxStart){
                this._readScroll = Math.min(maxStart, (this._readScroll||0) + usable);
                this._paintRead();
                return true;
            }
            if(this._openRelativeInThread(1)) return false;
            if(this._openAdjacentThread(1)) return false;
            return true;
        case '\x7f': // DEL
        case '\x08': // Backspace -> previous message in thread
            if(this._openRelativeInThread(-1)) return false; // consumed
            // If no previous message, ignore (do not exit) ; ESC reserved for exit
            return true;
        case '\x08': // Backspace also returns
            // (This case now repurposed above for prev message; unreachable duplicate kept for safety)
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

// Open previous/next thread container based on threadTreeSelection delta (-1 or +1)
MessageBoard.prototype._openAdjacentThread = function(delta){
    if(!this.threadTree || !this.threadNodeIndex || !this.threadNodeIndex.length) return false;
    // Find current container node for lastReadMsg
    var currentMsgNum = this.lastReadMsg && this.lastReadMsg.number;
    var containerIndex = -1;
    for(var i=0;i<this.threadNodeIndex.length;i++){
        var node=this.threadNodeIndex[i];
        if(node && node.__isTree && node.items){
            for(var m=0;m<node.items.length;m++){ var itm=node.items[m]; if(itm.__msgHeader && itm.__msgHeader.number===currentMsgNum){ containerIndex=i; break; } }
            if(containerIndex!==-1) break;
        }
    }
    if(containerIndex===-1) return false;
    var target = containerIndex + delta;
    // Seek next/prev container (__isTree) skipping non-container nodes
    while(target>=0 && target < this.threadNodeIndex.length){
        if(this.threadNodeIndex[target].__isTree) break; target += (delta>0?1:-1);
    }
    if(target<0 || target>=this.threadNodeIndex.length) return false;
    var targetNode = this.threadNodeIndex[target];
    if(!targetNode || !targetNode.__isTree) return false;
    // Open container and read its first message
    try { if(targetNode.status & targetNode.__flags__.CLOSED) targetNode.open(); } catch(e){}
    if(targetNode.items && targetNode.items.length){
        var first = targetNode.items[0];
        if(first.__msgHeader){
            this._renderReadView(first.__msgHeader);
            this._showReadNotice(delta > 0 ? 'next-thread' : 'prev-thread');
            return true;
        }
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
            if(target && target.__msgHeader){
                this._renderReadView(target.__msgHeader);
                this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                return true;
            }
        }
    }

    var seq = this._buildThreadSequence(this.lastReadMsg.thread_id || this.lastReadMsg.number);
    if(!seq || !seq.length) return false;
    for(var i=0;i<seq.length;i++){
        if(seq[i].number === currentMsgNum){
            var targetIndex = i + dir;
            if(targetIndex < 0 || targetIndex >= seq.length) return false;
            var next = seq[targetIndex];
            if(next){
                this._renderReadView(next);
                this._showReadNotice(dir > 0 ? 'next-message' : 'prev-message');
                return true;
            }
            return false;
        }
    }
    return false;
};

MessageBoard.prototype._consumeReadNoticeKey = function(key){
    if(!this._readNoticeActive) return false;
    this._hideReadNotice();
    return true;
};

MessageBoard.prototype._showReadNotice = function(kind){
    if(this.view !== 'read') return;
    if(!kind) return;
    this._hideReadNotice({ skipRepaint: true });
    var host = this._readBodyFrame || this.outputFrame || this.hostFrame || this.rootFrame;
    if(!host) return;
    var labelMap = {
        'next-message': 'Showing next message',
        'prev-message': 'Showing previous message',
        'next-thread':  'Showing next thread',
        'prev-thread':  'Showing previous thread'
    };
    var text = labelMap[kind] || labelMap['next-message'];
    var isThread = (kind.indexOf('thread') !== -1);
    var attr = (isThread ? BG_MAGENTA : BG_BLUE) | WHITE;
    var width = Math.min(host.width, Math.max(20, text.length + 4));
    var height = 3;
    var x = Math.max(1, Math.floor((host.width - width) / 2) + 1);
    var y = Math.max(1, Math.floor((host.height - height) / 2) + 1);
    var frame = new Frame(x, y, width, height, attr, host);
    try {
        frame.open();
        frame.attr = attr;
        frame.clear();
        var midY = Math.max(1, Math.floor((height + 1) / 2));
        var startX = Math.max(1, Math.floor((width - text.length) / 2) + 1);
        frame.gotoxy(startX, midY);
        frame.putmsg(text);
        frame.cycle();
        try { frame.top(); } catch(_e){}
    } catch(e){
        try { frame.close(); } catch(_err){}
        return;
    }
    this._readNoticeFrame = frame;
    this._readNoticeActive = true;
    if(this.timer && typeof this.timer.addEvent === 'function'){
        var self = this;
        this._readNoticeEvent = this.timer.addEvent(3000, false, function(){
            self._readNoticeEvent = null;
            self._hideReadNotice();
        });
    }
};

MessageBoard.prototype._hideReadNotice = function(opts){
    opts = opts || {};
    var skipRepaint = !!opts.skipRepaint;
    if(this._readNoticeEvent){
        try { this._readNoticeEvent.abort = true; } catch(e){}
        this._readNoticeEvent = null;
    }
    if(this._readNoticeFrame){
        try { this._readNoticeFrame.close(); } catch(e){}
        this._readNoticeFrame = null;
    }
    this._readNoticeActive = false;
    if(!skipRepaint && this.view === 'read' && this._readBodyFrame){
        try { this._paintRead(); } catch(_e){}
    }
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
    var hf=this._readHeaderFrame;
    hf.clear(BG_BLUE|WHITE);
    if(this._readSubIconFrame){ try { this._readSubIconFrame.close(); } catch(e){} this._readSubIconFrame=null; }
    var iconW = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_W : 12;
    var iconH = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS) ? ICSH_CONSTANTS.ICON_H : 6;
    var iconMaxWidth = Math.min(iconW, hf.width);
    var iconHeight = Math.min(iconH, hf.height);
    var iconLoaded = false;
    var subCode = this.cursub || msg.sub || msg.sub_code || this._lastActiveSubCode || bbs.cursub_code;
    var iconBase = this._resolveBoardIcon(subCode || this._getCurrentSubName(), 'sub');
    if(iconBase){
        if (!this._Icon) {
            try { this._Icon = load('iconshell/lib/shell/icon.js').Icon || Icon; }
            catch(e){ try { load('iconshell/lib/shell/icon.js'); this._Icon = Icon; } catch(e2){} }
        }
        if(this._Icon){
            var iconFrame = null;
            var labelFrame = null;
            try {
                iconFrame = new Frame(hf.x, hf.y, iconMaxWidth, iconHeight, hf.attr, hf.parent);
                iconFrame.open();
                labelFrame = new Frame(iconFrame.x, iconFrame.y + iconFrame.height, iconFrame.width, 1, hf.attr, hf.parent);
                labelFrame.open();
                labelFrame.clear();
                var iconObj = new this._Icon(iconFrame, labelFrame, { iconFile: iconBase, label: '' });
                iconObj.render();
                iconLoaded = true;
                this._readSubIconFrame = iconFrame;
            } catch(e) {
                iconLoaded = false;
                if(iconFrame){ try { iconFrame.close(); } catch(_e3){} }
                this._readSubIconFrame = null;
            } finally {
                if(labelFrame){ try { labelFrame.close(); } catch(_lf2){} }
            }
        }
    }
    var from = (msg.from || msg.from_net || 'unknown');
    var toField = msg.to || msg.to_net || msg.to_net_addr || msg.replyto || msg.reply_to || '';
    var subj = (msg.subject || '(no subject)');
    var when = msg.when_written_time || msg.when_written || msg.when_imported_time || 0;
    var dateStr = 'Unknown';
    try { if(when) dateStr = strftime('%Y-%m-%d %H:%M', when); } catch(e){}
    var avatarWidth = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.width) || 10;
    var avatarHeight = (this._avatarLib && this._avatarLib.defs && this._avatarLib.defs.height) || 6;
    var avatarInfo = null;
    if(this._avatarLib){
        try { avatarInfo = this._fetchAvatarForMessage ? this._fetchAvatarForMessage(msg) : null; } catch(e){ log('avatar fetch error: '+e); }
    }
    var haveAvatar = avatarInfo && avatarInfo.obj && avatarInfo.obj.data;
    var textStartX = iconLoaded ? Math.min(iconMaxWidth + 2, hf.width) : 1;
    var textEndX = hf.width;
    var avatarStartX = hf.width - avatarWidth + 1;
    if(haveAvatar && avatarStartX > textStartX){
        textEndX = Math.max(textStartX, avatarStartX - 2);
    }
    var lines = [];
    lines.push({ label: null, value: '\x01h\x01g'+(subCode || this._getCurrentSubName() || 'unknown' ).toUpperCase() });
    lines.push({ label: 'Date', value: dateStr });
    lines.push({ label: 'From', value: '\x01h\x01r'+from });
    if(toField && toField.length) lines.push({ label: 'To', value: '\x01h\x01m'+toField });
    if(msg.replyto && msg.replyto.length && (!toField || toField.toLowerCase() !== msg.replyto.toLowerCase())) {
        lines.push({ label: 'Reply-To', value: msg.replyto });
    }
    lines.push({ label: 'Subj', value: '\x01h\x01y'+subj });
    var textWidth = Math.max(1, textEndX - textStartX + 1);
    for(var i=0;i<lines.length && i<hf.height;i++){
        var info = lines[i];
        var label = !!info.label ? '\x01h\x01c'+info.label+':\x01n ' : '';
        var value = info.value || '';
        var text = label + value;
        if(text.length > textWidth) text = text.substr(0, textWidth);
        try { hf.gotoxy(textStartX, i+1); hf.putmsg(text); } catch(e){}
    }
    if(haveAvatar){
        try {
            var bin = (typeof base64_decode==='function') ? base64_decode(avatarInfo.obj.data) : null;
            if(bin && bin.length >= avatarWidth*avatarHeight*2){
                if(!this._blitAvatarToFrame){
                    this._blitAvatarToFrame = function(frame, binData, w, h, dstX, dstY){
                        var offset=0; for(var y=0;y<h;y++){ for(var x=0;x<w;x++){ if(offset+1>=binData.length) return; var ch=binData.substr(offset++,1); var attr=ascii(binData.substr(offset++,1)); try{ frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); }catch(se){} } }
                    };
                }
                var drawWidth = Math.min(avatarWidth, hf.width);
                var drawHeight = Math.min(avatarHeight, hf.height);
                var startX = Math.max(textStartX, hf.width - drawWidth + 1);
                this._blitAvatarToFrame(hf, bin, drawWidth, drawHeight, startX, 1);
            }
        } catch(be){}
    }
    if(this._readSubIconFrame && this._readSubIconHotspotKey){
        this._readSubIconFrame.cycle();
        this._hotspotMap = this._hotspotMap || {};
        this._hotspotMap[this._readSubIconHotspotKey] = 'read-sub-icon';
        if(this._readSubIconHotspotKey.length === 1){
            var lowerHot = this._readSubIconHotspotKey.toLowerCase();
            if(lowerHot !== this._readSubIconHotspotKey) this._hotspotMap[lowerHot] = 'read-sub-icon';
        }
        if(typeof console.add_hotspot === 'function'){
            var minX = this._readSubIconFrame.x;
            var maxX = this._readSubIconFrame.x + this._readSubIconFrame.width - 1;
            for(var sy=0; sy<this._readSubIconFrame.height; sy++){
                try { console.add_hotspot(this._readSubIconHotspotKey, false, minX, maxX, this._readSubIconFrame.y + sy); } catch(e){}
            }
            if(this._readSubIconHotspotKey.length === 1){
                var lowerHotspot = this._readSubIconHotspotKey.toLowerCase();
                if(lowerHotspot !== this._readSubIconHotspotKey){
                    for(var sy2=0; sy2<this._readSubIconFrame.height; sy2++){
                        try { console.add_hotspot(lowerHotspot, false, minX, maxX, this._readSubIconFrame.y + sy2); } catch(e){}
                    }
                }
            }
        }
    }
    try { hf.cycle(); } catch(e){}
};

// Fetch avatar for a message without rendering. Returns {obj, attempts:[{netaddr,username,ok,reason}], chosen:{...}}
MessageBoard.prototype._fetchAvatarForMessage = function(msg){
    if(!this._avatarLib || !msg) return null; var full = msg;
    // Re-fetch full header if needed
    if(!full.from_net_addr && full.number && this.cursub){
        try { var mb=new MsgBase(this.cursub); if(mb.open()){ var fh=mb.get_msg_header(false, full.number, true); if(fh){ fh.number=full.number; full=fh; } mb.close(); } } catch(e){ log('avatar refetch header error: '+e); }
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
    this._lastAvatarObj = avatarObj || null;
    return { obj: avatarObj, attempts: attempts, chosen: chosen, msg: full };
};

MessageBoard.prototype._destroyReadFrames = function(){
    this._hideReadNotice({ skipRepaint: true });
    if(this._readHeaderFrame){ try { this._readHeaderFrame.close(); } catch(e){} this._readHeaderFrame=null; }
    if(this._readBodyFrame){ try { this._readBodyFrame.close(); } catch(e){} this._readBodyFrame=null; }
    if(this._readSubIconFrame){ try { this._readSubIconFrame.close(); } catch(e){} this._readSubIconFrame=null; }
    this._setReadBodyText('');
    this._readScroll = 0;
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
        if(rootId){
            var code = this.cursub || this._lastActiveSubCode || bbs.cursub_code || '';
            var cacheKey = code + ':' + rootId;
            if(this._threadSequenceCache.hasOwnProperty(cacheKey)) delete this._threadSequenceCache[cacheKey];
        }
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
    this._ensureFrames();
    var code = preferredCode || this.cursub || this._lastActiveSubCode || bbs.cursub_code || null;
    if(!code){
        this._writeStatus('SEARCH: Select a sub first');
        return;
    }
    this._lastActiveSubCode = code;
    if(this._beginInlineSearchPrompt(code, returnView)) return;
    var subName = this._getSubNameByCode(code) || code;
    this._writeStatus('SEARCH: Unable to open inline prompt for '+subName);
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
            var hdr = mb.get_msg_header(false, n, true);
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
                try { body = this._readMessageBody(mb, hdr); } catch(e){ body = null; }
                if(body && body.toLowerCase().indexOf(lowered) !== -1) matched = true;
            }
            if(!matched) continue;
            if(body === null){
                try { body = this._readMessageBody(mb, hdr); } catch(e){ body = ''; }
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
		var itemData = visible[v];
		if(itemData.type === 'sub' && itemData.subCode){
			var updated = this._getSubMessageCount(itemData.subCode);
			itemData._messageCount = updated;
			var baseName = itemData._labelBase || (itemData.label || '');
			var refreshed = this._formatSubLabel(baseName, updated);
			itemData.label = refreshed.text;
			itemData._labelSegments = refreshed.segments;
		}
		var iconObj = new this._Icon(iconFrame,labelFrame,itemData);
		iconObj.render();
		this._iconCells.push({ icon: iconFrame, label: labelFrame, item: itemData, iconObj: iconObj });
		try {
			this._renderIconLabel(labelFrame, itemData, globalIndex === this.selection, metrics.iconW);
		} catch(e){}
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
    // If caller specifies limit, respect it; otherwise load full message list
    limit = limit || this.threadHeaderLimit;
    if(limit && limit > 0) limit = Math.min(limit, this.threadHeaderLimit);
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
        var start = 1;
        var endNum = total;
        if(limit && limit > 0){
            start = Math.max(1, total - limit + 1);
        }
        for(var n=start; n<=endNum; n++) {
            var hdr = mb.get_msg_header(false, n, true);
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
    var self = this;
    this._releaseHotspots();
    var hotspotChars = this._hotspotChars || [];
    var usedHotspots = 0;
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
        if(usedHotspots < hotspotChars.length){
            var cmd = hotspotChars[usedHotspots++];
            this._hotspotMap[cmd] = i;
            if(typeof console.add_hotspot === 'function'){
                try { console.add_hotspot(cmd, false, f.x, f.x + f.width - 1, f.y + lineY - 1); } catch(e){}
            }
        }
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
            var hdr = mb.get_msg_header(false, num, true);
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
    dbug('MessageBoard: buildThreadTree done nodes=' + this.threadNodeIndex.length, 'messageboard');
};
MessageBoard.prototype._buildThreadSequence = function(rootId){
    if(!rootId && this.lastReadMsg) rootId = this.lastReadMsg.thread_id || this.lastReadMsg.number;
    var code = this.cursub || this._lastActiveSubCode || bbs.cursub_code;
    if(!rootId || !code) return [];
    if(!this._threadSequenceCache) this._threadSequenceCache = {};
    var cacheKey = code + ':' + rootId;
    if(this._threadSequenceCache[cacheKey]) return this._threadSequenceCache[cacheKey];

    var self = this;
    if(!this._fullHeaders) this._fullHeaders = {};
    var mb = null;

    function ensureHeader(num){
        if(!num) return null;
        if(self._fullHeaders && self._fullHeaders[num]) return self._fullHeaders[num];
        try {
            if(!mb){ mb = new MsgBase(code); if(!mb.open()){ mb = null; return null; } }
            var hdr = mb.get_msg_header(false, num, true);
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
    this._threadSequenceCache[cacheKey] = sequence;
    return sequence;
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
    dbug('MessageBoard: paintThreadTree selection=' + this.threadTreeSelection, 'messageboard');
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

MessageBoard.prototype._renderIconLabel = function(frame, item, isSelected, widthOverride){
    if(!frame) return;
    var baseAttr = isSelected ? (BG_LIGHTGRAY|BLACK) : (BG_BLACK|LIGHTGRAY);
    try { frame.clear(baseAttr); frame.home(); } catch(e){}
    var width = widthOverride || frame.width || 0;
    if(width <= 0) return;
    var segments = (item && item._labelSegments && item._labelSegments.length) ? item._labelSegments : null;
    var text = (item && item.label) ? item.label : '';
    function repeatSpaces(count){ return (count > 0) ? new Array(count+1).join(' ') : ''; }
    if(!segments){
        if(text.length > width) text = text.substr(0, width);
        var left = Math.max(0, Math.floor((width - text.length) / 2));
        var written = 0;
        var padLeft = repeatSpaces(left);
        if(padLeft){ frame.attr = baseAttr; frame.putmsg(padLeft); written += padLeft.length; }
        if(text){ frame.attr = baseAttr; frame.putmsg(text); written += text.length; }
        if(written < width){ frame.attr = baseAttr; frame.putmsg(repeatSpaces(width - written)); }
        return;
    }
    var truncated = [];
    var visible = 0;
    for(var i=0; i<segments.length; i++){
        var seg = segments[i];
        var segText = seg && seg.text ? String(seg.text) : '';
        if(!segText.length && segText !== '0') continue;
        var remaining = width - visible;
        if(remaining <= 0) break;
        if(segText.length > remaining) segText = segText.substr(0, remaining);
        truncated.push({ text: segText, color: seg ? seg.color : null });
        visible += segText.length;
    }
    if(!truncated.length){
        frame.attr = baseAttr;
        frame.putmsg(repeatSpaces(width));
        return;
    }
    var leftPad = Math.max(0, Math.floor((width - visible) / 2));
    var writtenTotal = 0;
    var bg = baseAttr & 0xF0;
    var pad = repeatSpaces(Math.min(leftPad, width));
    if(pad){ frame.attr = baseAttr; frame.putmsg(pad); writtenTotal += pad.length; }
    for(var j=0; j<truncated.length && writtenTotal < width; j++){
        var segPart = truncated[j];
        var attr = (segPart.color !== null && typeof segPart.color === 'number') ? (bg | segPart.color) : baseAttr;
        frame.attr = attr;
        frame.putmsg(segPart.text);
        writtenTotal += segPart.text.length;
    }
    if(writtenTotal < width){
        frame.attr = baseAttr;
        frame.putmsg(repeatSpaces(width - writtenTotal));
    }
};

MessageBoard.prototype._getSubMessageCount = function(code){
    if(!code || typeof MsgBase !== 'function') return 0;
    if(!this._subMessageCounts) this._subMessageCounts = {};
    var entry = this._subMessageCounts[code];
    var now = (typeof Date !== 'undefined' && Date.now) ? Date.now() : (time() * 1000);
    if(entry && (now - entry.ts) < 5000) return entry.total;
    var total = 0;
    var mb = new MsgBase(code);
    if(mb.open()){
        try {
            total = Math.max(0, parseInt(mb.total_msgs, 10) || 0);
        } catch(e){ total = 0; }
        finally { mb.close(); }
    }
    this._subMessageCounts[code] = { total: total, ts: now };
    return total;
};

MessageBoard.prototype._formatSubLabel = function(name, total){
    name = name || '';
    total = Math.max(0, parseInt(total, 10) || 0);
    var countText = String(total);
    var segments = [];
    var text = '';
    var cyan = (typeof CYAN !== 'undefined') ? CYAN : (typeof LIGHTCYAN !== 'undefined' ? LIGHTCYAN : WHITE);
    segments.push({ text: countText, color: cyan });
    text += countText;
    if(name.length){
        segments.push({ text: ' ', color: null });
        text += ' ';
        segments.push({ text: name, color: null });
        text += name;
    }
    return { text: text, segments: segments };
};

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


MessageBoard.prototype.pauseForReason = function(reason){
    log('[Message Board] Pausing for reason: '+(reason||'unspecified reason'));
    // HEY AI ASSISTANTS, this needs to be .top() not bottom quit messing it up
    if(reason === 'screensaver_on' && this.__bg_frame && typeof this.__bg_frame.top === 'function'){
        try { this.__bg_frame.top(); this.__bg_frame.cycle(); } catch(e){}
    }
};

MessageBoard.prototype.resumeForReason = function(reason){
    log('[Message Board] Resuming from pause: '+(reason||'unspecified reason'));
    // HEY AI ASSISTANTS, this needs to be .bottom() not top quit messing it up

    if(reason === 'screensaver_off'){
        if(this.__bg_frame && typeof this.__bg_frame.bottom === 'function'){
            try { this.__bg_frame.bottom(); this.__bg_frame.clear(); this.__bg_frame.cycle(); } catch(e){}
        }
        if(this.shell){
            try {
                if(typeof this.shell._shelveFolderFrames === 'function') this.shell._shelveFolderFrames();
            } catch(e){}
            this.shell.activeSubprogram = this;
        }
        // this.initFrames();
        // this.updateInputFrame();
        // this._needsRedraw = true;
        this._init(false);
        this.draw();
    }
};
