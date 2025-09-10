// Hello World demo subprogram to validate Subprogram framework.
// Behavior:
// 1. Shows greeting and asks for name.
// 2. Mirrors keystrokes in input frame until ENTER.
// 3. Greets user by name and prompts to press any key to exit.
// 4. ESC at any time aborts immediately.

load("iconshell/lib/subfunctions/subprogram.js");
// Thread tree dependency (for + / - expansion UI similar to ecReader)
// We lazily load tree.js only when entering the threads view to avoid cost if user never opens threads.
// But ensure symbol available for early reference if previously loaded elsewhere.
var _TreeLibLoaded = false;


// For now let's use two types of icons until we can be expicity about more definitions
var BOARD_ICONS = {
    'group': 'folder',
    'sub': 'bulletin_board',
    'groups':'mario',
    'quit': 'logoff'
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
    Subprogram.prototype.enter.call(this, function(){ if(typeof done==='function') done(); });
    // Re-bootstrap state so a reused instance starts fresh
    this._init(true);
    this.draw();
    if (this.autoCycle) {
        try { this.cycle(); } catch(e) {}
    }
};

// Main loop (called externally by shell or could be invoked after enter)
MessageBoard.prototype.cycle = function(){
    while(this.running){
        // Non-blocking key poll
        if (console.inkey && console.strlen) {
            var k = console.inkey(K_NOCRLF|K_NOSPIN|K_NOECHO, 5);
            if (k) {
                if (Subprogram.prototype.handleKey.call(this, k) === false) {
                    // If handler returns false, allow immediate redraw or exit
                }
            }
        }
        // Frame updates
        if (this.outputFrame) this.outputFrame.cycle();
        if (this.inputFrame) this.inputFrame.cycle();
        mswait(10);
    }
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
        } else if (this.view === 'post') {
            this._renderThreadsView(this.cursub); return false;
        } else {
            this.exit(); return false;
        }
    }
    // Hotspot key interception (0-9 then A-Z)
    if (this._hotspotMap && this._hotspotMap.hasOwnProperty(key)) {
        var idx = this._hotspotMap[key];
        if (typeof idx === 'number') {
            if(this.view === 'group' || this.view === 'sub') {
                this.selection = idx;
                if (this.view === 'group') {
                    var it = this.items[this.selection]; if(it && typeof it.groupIndex !== 'undefined') { this._renderSubView(it.groupIndex); return false; }
                } else if (this.view === 'sub') {
                    var it2 = this.items[this.selection]; if(it2 && it2.subCode) { this._renderThreadsView(it2.subCode); return false; }
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
    case 'read': return this._handleReadKey(key);
        default: return true;
    }
};

MessageBoard.prototype._cleanup = function() {
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
    this.debug = this.debug || false; // toggle via external set
    this._dbg = function(){ if(!this.debug) return; var args = Array.prototype.slice.call(arguments); try { log('[MB] '+args.join(' ')); } catch(e){} };
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
    this._clearIconGrid();
    this.view = 'group';
    // Build items from msg_area.grp_list (prepend Quit special cell)
    var list = [];
    list.push({
        type: 'quit',
        label: 'Quit',
        hotkey: '\x1b',
        iconFile: BOARD_ICONS['quit'] || 'logoff',
        iconBg: BG_RED,
        iconFg: WHITE
    });
    for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
        var grp = msg_area.grp_list[gi];
        if (!grp || !grp.sub_list || !grp.sub_list.length) continue;
        list.push({
            type: 'group',
            label: grp.name.substr(0, 12),
            hotkey: (grp.name && grp.name.length? grp.name[0].toUpperCase(): null),
            iconFile: 'folder',
            iconBg: BG_BLUE,
            iconFg: WHITE,
            groupIndex: gi
        });
    }
    this.items = list;
    this._computeNonSpecialOrdinals();
    this.selection = Math.min(this.selection, this.items.length-1);
    this._paintIconGrid();
}

MessageBoard.prototype._renderSubView = function(group) {
	this.curgrp = group;
    this.view = 'sub';
    // Render a grid of all the subs in the specified group.
    // Use our icon paradigm to display as clickable items in a grid.
    // Selecting an item (sub) calls _renderThreadsView with that group.
    this._ensureFrames();
    this._clearIconGrid();
    var grp = msg_area.grp_list[this.curgrp];
    var list = [];
    // Prepend Groups pseudo-item (acts as back to group view)
    list.push({
        type: 'groups',
        label: 'Groups',
        hotkey: '\x1b',
        iconFile: BOARD_ICONS['groups'] || 'folder',
        iconBg: BG_GREEN,
        iconFg: BLACK
    });
    for (var si = 0; si < grp.sub_list.length; si++) {
        var sub = grp.sub_list[si];
        list.push({
            type: 'sub',
            label: sub.name.substr(0,12),
            hotkey: (sub.name && sub.name.length? sub.name[0].toUpperCase(): null),
            iconFile: 'bulletin_board',
            iconBg: BG_CYAN,
            iconFg: BLACK,
            subCode: sub.code
        });
    }
    this.items = list;
    this._computeNonSpecialOrdinals();
    this.selection = 0; this.scrollOffset = 0;
    this._paintIconGrid();
    this._writeStatus('SUBS: Enter opens threads | Backspace=Groups | '+(this.selection+1)+'/'+this.items.length);

}

MessageBoard.prototype._renderThreadsView = function(sub) {
    this.cursub = sub;
    this.view = 'threads';
    this._releaseHotspots();
    this._dbg('enter threads view sub='+sub);
    // Load messages in the specified sub (if not already loaded).
    // If no messages, call _renderPostView to prompt for first post.
    // Render a list of threads in the specified message area.
    // Use tree.js to group messages into threads. (no icons here)
    // Enable mouse reporting for thread selection.
    // If use selects a thread, call _renderReadView with that message.
    this._ensureFrames();
    // Remove any leftover icon frames so list draws cleanly
    this._clearIconGrid();
    // Immediate visual feedback before heavy work
    try { this.outputFrame.clear(); this.outputFrame.gotoxy(1,1); this.outputFrame.putmsg('Building thread list...'); this.outputFrame.cycle(); } catch(e){}
    this._loadThreadHeaders();
    // Build thread tree (single branch per thread)
    this._ensureTreeLib();
    this._buildThreadTree();
    if(!this.threadHeaders.length){
        this.outputFrame.clear();
        this.outputFrame.gotoxy(2,2); this.outputFrame.putmsg('No messages. Press P to post the first message.');
        this._writeStatus('THREADS: P=Post  Backspace=Subs  0/0');
        return;
    }
    this.threadTreeSelection = Math.min(this.threadTreeSelection, Math.max(0,this.threadNodeIndex.length-1));
    if(this.threadTree && this.threadNodeIndex.length){
        this._paintThreadTree();
    } else {
        this._dbg('tree empty, fallback list');
        this.threadSelection = 0; this.threadScrollOffset = 0; this._paintThreadList();
    }
}


MessageBoard.prototype._renderReadView = function(msg) {
    if(!msg) return;
    this.view = 'read';
    this.lastReadMsg = msg;
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
                } catch(e) { this._dbg('read body error', e); }
                try { mb.close(); } catch(_e){}
            }
        }
    } catch(e){}
    this._readScroll = 0;
    this._readLines = bodyLines;
    this._paintRead();
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
    this._writeStatus('[ENTER]=NextMsg  [Bksp/Del]=PrevMsg (Arrows: [Up]/[Down]=Scroll - [Right]/[Left]=Thread+/-) [ESC]=Threads  '+(start+1)+'-'+end+'/'+this._readLines.length);
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
            if(this._openAdjacentThread(-1)) return false; return true;
        case KEY_RIGHT: // next thread
            if(this._openAdjacentThread(1)) return false; return true;
        case '\r': case '\n': // next message in thread
            if(this._openRelativeInThread(1)) return false; return true;
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
        var first = targetNode.items[0]; if(first.__msgHeader){ this._renderReadView(first.__msgHeader); return true; }
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
    if(!container || idx===-1) return false;
    var nidx = idx + dir;
    if(nidx < 0 || nidx >= msgs.length) return false; // out of bounds -> caller decides
    var target = msgs[nidx];
    if(target && target.__msgHeader){ this._renderReadView(target.__msgHeader); return true; }
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
    log('PAINT READ HEADER.. msg:'+ JSON.stringify(msg));
    if(!this._readHeaderFrame) return;
    var hf=this._readHeaderFrame; hf.clear(BG_BLUE|WHITE);
    var from = (msg.from || msg.from_net || 'unknown');
    var subj = (msg.subject || '(no subject)');
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
    // Render text (wrap/truncate within frame)
    try {
        hf.gotoxy(textStartX,1); hf.putmsg(('From: '+from).substr(0,Math.max(1,hf.width - textStartX + 1)));
        if(hf.height>1){
            hf.gotoxy(textStartX, Math.min(2,hf.height));
            hf.putmsg(('Subj: '+subj).substr(0,Math.max(1,hf.width - textStartX + 1)));
        }
    } catch(e){}
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
    if(!this.inputFrame) return; this.inputFrame.clear(BG_BLUE|WHITE); this.inputFrame.home(); this.inputFrame.putmsg(truncsp(msg).substr(0,this.inputFrame.width));
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
    this._iconCells.push({icon:iconFrame,label:labelFrame});
        // Selection highlight
        if (globalIndex === this.selection) {
            labelFrame.clear(BG_LIGHTGRAY|BLACK); labelFrame.home(); labelFrame.putmsg(this._center(visible[v].label.substr(0,metrics.iconW), metrics.iconW));
        }
        // Hotspot mapping: ESC for special first cell; numbering starts at 1 for others (1-9 then A-Z)
        if (typeof console.add_hotspot === 'function') {
            var item = visible[v];
            var cmd = null;
            if (item.type === 'quit' || item.type === 'groups') {
                cmd = '\x1b'; // ESC
            } else if (this._nonSpecialOrdinals && typeof this._nonSpecialOrdinals[globalIndex] === 'number') {
                var ord = this._nonSpecialOrdinals[globalIndex]; // 1-based
                if (ord <= 9) cmd = String(ord);
                else {
                    var alphaIndex = ord - 10; // 0-based for A
                    if (alphaIndex < 26) cmd = String.fromCharCode('A'.charCodeAt(0)+alphaIndex);
                }
            }
            if (cmd) {
                this._hotspotMap[cmd] = globalIndex;
                for (var hy=0; hy<metrics.iconH; hy++) {
                    try { console.add_hotspot(cmd, false, iconFrame.x, iconFrame.x + iconFrame.width - 1, iconFrame.y + hy); } catch(e){}
                }
                try { console.add_hotspot(cmd, false, labelFrame.x, labelFrame.x + labelFrame.width - 1, labelFrame.y); } catch(e){}
            }
        }
        idx++;
    }
    var baseHelp;
    if (this.view === 'group') baseHelp = 'Enter=Open  ESC=Quit ';
    else if (this.view === 'sub') baseHelp = 'Enter=Open  ESC=Groups  Backspace=Groups ';
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
    var mb = new MsgBase(code);
    if(!mb.open()) { return; }
    try {
        var total = mb.total_msgs;
        if(!total) return;
        var start = Math.max(1, total - limit + 1);
        for(var n=start; n<=total; n++) {
            var hdr = mb.get_msg_header(false, n, false);
            if(!hdr) continue;
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
};

MessageBoard.prototype._paintThreadList = function(){
    var f = this.outputFrame; if(!f) return; f.clear();
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
    this._writeStatus('THREADS: Enter=Read  P=Post  Backspace=Subs  '+(this.threadSelection+1)+'/'+this.threadHeaders.length);
};

// ---- Thread Tree (using tree.js) ----
MessageBoard.prototype._ensureTreeLib = function(){
    if (_TreeLibLoaded) return;
    try { load('tree.js'); _TreeLibLoaded = true; } catch(e) { /* ignore */ }
};

MessageBoard.prototype._buildThreadTree = function(){
    this.threadTree = null; this.threadNodeIndex = [];
    if(!this.outputFrame) return;
    this._dbg('buildThreadTree start headers='+this.threadHeaders.length);
    // --- Subject-based fuzzy grouping ---
    // We ignore reply_id chains and instead cluster messages whose normalized subjects
    // are similar (after stripping GROUPING_PREFIXES like "Re: ").
    // Simple fuzzy match: Levenshtein distance threshold relative to length plus prefix stripping.
    // This keeps all messages for a logical topic under one expandable container node.

    function normalizeSubject(raw){
        if(!raw) return '(no subject)';
        var s = ''+raw;
        // Strip known prefixes repeatedly (case sensitive list provided by user)
        var changed=true;
        while(changed){
            changed=false;
            for(var p=0;p<GROUPING_PREFIXES.length;p++){
                var pref=GROUPING_PREFIXES[p];
                if(s.indexOf(pref)===0){ s = s.substr(pref.length); changed=true; break; }
            }
        }
        s = s.replace(/^[\s\-_:]+/,'').replace(/[\s\-_:]+$/,'');
        s = s.replace(/\s+/g,' ').toLowerCase();
        return s || '(no subject)';
    }
    function levenshtein(a,b,max){
        if(a===b) return 0; if(!a||!b) return (a||b).length; // crude
        var al=a.length, bl=b.length;
        if(Math.abs(al-bl) > max) return max+1; // early abort
        var v0=new Array(bl+1), v1=new Array(bl+1);
        for(var j=0;j<=bl;j++) v0[j]=j;
        for(var i=0;i<al;i++){
            v1[0]=i+1; var minRow=v1[0];
            var ca=a.charCodeAt(i);
            for(var j=0;j<bl;j++){
                var cost = (ca===b.charCodeAt(j))?0:1;
                var m = Math.min(
                    v0[j+1] + 1, // deletion
                    v1[j] + 1,   // insertion
                    v0[j] + cost // substitution
                );
                v1[j+1]=m; if(m<minRow) minRow=m;
            }
            if(minRow>max) return max+1; // early abort
            var tmp=v0; v0=v1; v1=tmp;
        }
        return v0[bl];
    }
    function threshold(len){ if(len<=8) return 1; if(len<=14) return 2; if(len<=25) return 3; return 4; }

    var clusters=[]; // { canonical, display, msgs:[hdr], earliest:number }
    for(var i=0;i<this.threadHeaders.length;i++){
        var hdr=this.threadHeaders[i];
        var canon = normalizeSubject(hdr.subject);
        var placed=false; var bestMatch=null; var bestDist=9999;
        for(var c=0;c<clusters.length;c++){
            var cand=clusters[c];
            var max=threshold(Math.max(cand.canonical.length, canon.length));
            var dist=levenshtein(canon, cand.canonical, max);
            if(dist<=max){
                // choose closest cluster if multiple
                if(dist<bestDist){ bestDist=dist; bestMatch=cand; }
            }
        }
        if(bestMatch){
            bestMatch.msgs.push(hdr);
            if(hdr.number < bestMatch.earliest) bestMatch.earliest = hdr.number;
            placed=true;
        }
        if(!placed){
            clusters.push({ canonical: canon, display: canon, msgs:[hdr], earliest: hdr.number });
        }
    }
    // Sort clusters by earliest message number (could choose last activity later)
    clusters.sort(function(a,b){ return a.earliest - b.earliest; });
    // Sort messages within each cluster chronologically
    for(var cc=0; cc<clusters.length; cc++) clusters[cc].msgs.sort(function(a,b){ return a.number - b.number; });

    var treeFrame = this.outputFrame; // reuse
    if (typeof Tree === 'undefined') { return; }
    var root = new Tree(treeFrame, '');
    // Inherit some colors to align with existing UI palette
    root.colors.bg = BG_BLACK; root.colors.fg = LIGHTGRAY;
    root.colors.lbg = BG_CYAN; root.colors.lfg = BLACK;
    root.colors.xfg = YELLOW; root.colors.tfg = LIGHTCYAN;
    for(var r=0; r<clusters.length; r++){
        var cluster = clusters[r];
        // Use the earliest message's subject for display (before normalization) if available
        var firstMsg = cluster.msgs[0];
        var displaySubj = firstMsg ? firstMsg.subject : cluster.canonical;
        if(displaySubj) displaySubj = displaySubj.replace(/\s+/g,' ');
        if(displaySubj.length > treeFrame.width - 25) displaySubj = displaySubj.substr(0, treeFrame.width - 28) + '...';
        var containerLabel = '#'+cluster.earliest+' ('+cluster.msgs.length+') '+displaySubj;
        var tnode = root.addTree(containerLabel); // container only
        for(var m=0;m<cluster.msgs.length;m++){
            var msg = cluster.msgs[m];
            var msubj = msg.subject ? msg.subject.replace(/\s+/g,' ') : '(no subject)';
            if(msubj.length > treeFrame.width - 25) msubj = msubj.substr(0, treeFrame.width - 28) + '...';
            var itemLabel = msg.number+': '+msubj;
            var item = tnode.addItem(itemLabel, (function(h){ return function(){ return h; };})(msg));
            item.__msgHeader = msg;
        }
        // Leave closed by default
    }
    root.open();
    this.threadTree = root;
    this._indexThreadTree();
    root.refresh();
    this._dbg('buildThreadTree done nodes='+this.threadNodeIndex.length);
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
    var f=this.outputFrame; if(!f) return; f.clear();
    if(!this.threadTree){ f.putmsg('Loading thread tree...'); return; }
    this._dbg('paintThreadTree selection='+this.threadTreeSelection);
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
    this._writeStatus('THREADS (tree): Enter=Expand/Read  Space=Expand/Collapse  Backspace=Subs  '+(this.threadTreeSelection+1)+'/'+this.threadNodeIndex.length);
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
    if(overflow) this._writeStatus('THREADS (tree): Enter=Expand/Read  Space=Expand/Collapse  Backspace=Subs  '+(this.threadTreeSelection+1)+'/'+this.threadNodeIndex.length+' (Scroll / hotspots '+mappedCount+'/'+chars.length+')');
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
            this._renderSubView(this.curgrp); return false;
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
    var f = this.outputFrame; var usable = f ? f.height - 2 : 10; if(usable<3) usable = f?f.height:10;
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
            if (item.type === 'group') { this._renderSubView(item.groupIndex); return false; }
        }
        return false;
    }
    else if (key===KEY_PAGEUP) { this.selection=Math.max(0,this.selection-maxVisible); }
    else if (key===KEY_PAGEDN) { this.selection=Math.min(this.items.length-1,this.selection+maxVisible); }
    if (this.selection!==oldSel) { this._paintIconGrid(); }
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
    else if (key===KEY_PAGEUP) { this.selection=Math.max(0,this.selection-maxVisible); }
    else if (key===KEY_PAGEDN) { this.selection=Math.min(this.items.length-1,this.selection+maxVisible); }
    if (this.selection!==oldSel) { this._paintIconGrid(); }
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
        if (it.type === 'quit' || it.type === 'groups') {
            this._nonSpecialOrdinals[i] = 0; // special indicator
        } else {
            count++; this._nonSpecialOrdinals[i] = count;
        }
    }
};


MessageBoard.prototype.pauseForReason = function(reason){
    log('[Message Board] Pausing for reason: '+(reason||'unspecified reason'));
};

MessageBoard.prototype.resumeForReason = function(reason){
    log('[Message Board] Resuming from pause: '+(reason||'unspecified reason'));
};
