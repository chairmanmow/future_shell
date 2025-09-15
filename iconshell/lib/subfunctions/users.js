function Users(opts){
	opts = opts || {};
	Subprogram.call(this,{ name:'user-list', parentFrame: opts.parentFrame });
    this._avatarLib = (function(){ try { return load({}, '../exec/load/avatar_lib.js'); } catch(e){ return log("USERS COULDNT LOAD AVATAR LIB"); } })();
	this.users = [];
	this.sortMode = null;
    this.whichUsers  = 'all' // 'all', 'online'
    this.onlineUsers = 1;
    // Added initialization to avoid NaN page calculations on first draw
    this.page = 0;
    this.selectedIndex = 0;
    // Avatar sizing + cache
    this.showAvatars = true;
    this.avatarWidth = 10;
    this.avatarHeight = 6;
    this._avatarCache = {}; // usernum -> array lines

    // Planned UI additions:
    // - Grid tile layout (reusing logic style from WhoOnline but simplified for both all + online modes)
    // - Pagination when user count exceeds visible tile capacity (PgUp/PgDn)
    // - Mode toggle key (O): all <-> online
    // - Sort keys: N (alias), L (last on)
    // - Modal detail view (ENTER) showing extended fields, avatar if available
    // - Hotspot mapping (0-9, then A-Z) for first 36 visible tiles
    // - Future: search/filter (F), jump to letter, lazy loading for very large user bases
    // Internal state to be added:
    //   this.page = 0; this.pageSize dynamic from frame; this.filteredUsers cache
}
extend(Users, Subprogram);

Users.prototype.updateAllUsers = function(){
    var users = this.getUsers();
    var online = this.getOnlineUsers();
    this.users = this._hydrateOnlineUsers(users, online);
    log('Users: total='+this.users.length+' online='+JSON.stringify(this.users));
}

Users.prototype.getUsers = function(){
    var users = [];
    var total = system.lastuser;
    var u = new User;
    for(var i=1;i<=total;i++) {
        u.number = i;
        if(u.settings & (USER_DELETED|USER_INACTIVE)) continue;
        users.push({
            number:u.number,
            alias:u.alias,
            location:u.location,
            note:u.note,
            connection:u.connection,
            laston:u.stats.laston_date,
            netmail:u.netmail,
            avatar:null, // lazy
            online:-1
        });
    }
    return users;
};

Users.prototype.getOnlineUsers = function(){
	var collected = [];
	for(var n=1; n<=system.nodes; n++){
		var node = system.node_list[n-1];
		if(!node || !node.useron) continue;
		var u = new User(node.useron);
		collected.push({ node:n, alias:u.alias, number:u.number });
	}
    this.onlineUsers = collected.length;
    return collected;
}

Users.prototype._hydrateOnlineUsers = function(users, online){
	for(var i=0; i<users.length; i++){
		var u = users[i];
		for(var j=0; j<online.length; j++){
			if(u.number === online[j].number){
				// Use node number (or 1) to mark online; previous code assigned undefined (online[j].online) causing miss
				u.online = online[j].node || 1;
				break;
			}
		}
	}
	return users;
};

Users.prototype._toggleWhichUsers = function(){
    if(this.whichUsers === 'all') this.whichUsers = 'online';
    else this.whichUsers = 'all';
}

Users.prototype.enter = function(done){
    this.updateAllUsers();
    Subprogram.prototype.enter.call(this, done);
    // this.draw();
};

Users.prototype._filterUsers = function(){
    if(this.whichUsers === 'online') return this.users.filter(function(u){ return u.online !== -1; });
    return this.users;
};

Users.prototype._ensureFrames = function(){
    if(!this.parentFrame) return;
    if(!this.listFrame){
        var h = Math.max(1, this.parentFrame.height - 1);
        this.listFrame = new Frame(1,1,this.parentFrame.width,h,BG_BLACK|LIGHTGRAY,this.parentFrame); this.listFrame.open();
        this.registerFrame(this.listFrame);
    }
    if(!this.statusFrame){
        this.statusFrame = new Frame(1,this.parentFrame.height,this.parentFrame.width,1,BG_BLUE|WHITE,this.parentFrame); this.statusFrame.open();
        this.registerFrame(this.statusFrame);
    }
};

Users.prototype._recomputeLayout = function(){
    if(!this.listFrame){ this.pageSize = 0; return; }
    var tileH = (this.showAvatars?this.avatarHeight:1) + 2; // header + footer
    var tileW = Math.max(this.avatarWidth, 10); // ensure min width for alias
    var gap = 1;
    var cols = Math.max(1, Math.floor((this.listFrame.width + gap) / (tileW + gap)));
    var rows = Math.max(1, Math.floor(this.listFrame.height / tileH));
    this._tileMeta = { tileH:tileH, tileW:tileW, gap:gap, cols:cols, rows:rows };
    this.pageSize = cols * rows;
};

Users.prototype._visibleUsers = function(){
    var list = this._filterUsers();
    if(this.sortMode === 'L') list.sort(function(a,b){ return b.laston - a.laston; });
    else if(this.sortMode === 'N') list.sort(function(a,b){ var A=a.alias.toLowerCase(), B=b.alias.toLowerCase(); if(A>B) return 1; if(A<B) return -1; return 0; });
    this._sortedFiltered = list;
    var start = this.page * this.pageSize;
    return list.slice(start, start + this.pageSize);
};

Users.prototype.draw = function(){
    this._ensureFrames();
    this._recomputeLayout();
    if(!this.listFrame) return;
    var lf = this.listFrame; lf.clear();
    var users = this._visibleUsers();
    this._hotspotMap = {};
    if(typeof console.clear_hotspots === 'function') try { console.clear_hotspots(); } catch(e){}
    for(var i=0;i<users.length;i++) this._drawTile(i, users[i]);
    this._drawStatus();
    try { lf.cycle(); } catch(e){}
};

Users.prototype._drawTile = function(index, user){
    var meta = this._tileMeta; if(!meta) return;
    var lf = this.listFrame; if(!lf) return;
    var col = index % meta.cols; var row = Math.floor(index / meta.cols);
    var x = 1 + col * (meta.tileW + meta.gap);
    var y = 1 + row * meta.tileH;
    var selected = (index === this.selectedIndex);
    // Background block
    for(var yy=0; yy<meta.tileH; yy++){
        try { lf.gotoxy(x, y+yy); lf.putmsg('\x01'+(selected?'4':'0') + repeat(meta.tileW, ' ' ) + '\x01n'); } catch(e){}
    }
    // Header line
    var header = user.alias + ' #' + user.number;
    if(header.length > meta.tileW) header = header.substr(0, meta.tileW);
    try { lf.gotoxy(x, y); lf.putmsg((selected?'\x01h':'')+header+'\x01n'); } catch(e){}
    // Avatar area (lines y+1 .. y+avatarHeight)
    if(this.showAvatars){
        try{
            var avatarLines = this._getAvatar(user) || [];
            if(avatarLines.length){
                // Assume first line is potential base64 bindata for attr-pair avatar
                var base64Candidate = avatarLines[0];
                this.putAvatarBindataIntoFrame(base64Candidate, lf, x, y+1, avatarLines);
            }
        } catch(e){
            log("Error drawing avatar for user #"+user.number+" "+user.alias+": "+e);
        }
    }
    // Footer (online badge / laston date)
    var footerY = y + meta.tileH - 1;
    var footer = (user.online !== -1) ? '[ON]' : system.datestr(user.laston);
    if(footer.length > meta.tileW) footer = footer.substr(0, meta.tileW);
    try { lf.gotoxy(x, footerY); lf.putmsg((selected?'\x01h':'')+footer+'\x01n'); } catch(e){}
    // Hotspot mapping
    if(typeof console.add_hotspot === 'function' && index < 36){
        var cmd = (index < 10) ? String(index) : String.fromCharCode('A'.charCodeAt(0) + (index-10));
        for(var yy2=0; yy2<meta.tileH; yy2++){
            try { console.add_hotspot(cmd, false, x + lf.x -1, x + lf.x + meta.tileW -2, y + lf.y + yy2 -1); }catch(e){}
        }
        this._hotspotMap[cmd] = index;
    }
};

Users.prototype._drawStatus = function(msg){
    if(!this.statusFrame) return;
    // Guard against uninitialized page/pageSize to prevent NaN
    if(typeof this.page !== 'number' || this.page < 0) this.page = 0;
    if(!this.pageSize || isNaN(this.pageSize)) this.pageSize = (this._tileMeta ? this._tileMeta.cols * this._tileMeta.rows : 0) || 1;
    var total = this._sortedFiltered ? this._sortedFiltered.length : this.users.length;
    var showingStart = this.page * this.pageSize + 1;
    var showingEnd = Math.min(total, showingStart + this.pageSize - 1);
    if(total === 0){ showingStart = 0; showingEnd = 0; }
    var info = (msg?msg+'  ':'') + 'Users '+showingStart+'-'+showingEnd+'/'+total+'  Mode:'+this.whichUsers+'  Sort:'+(this.sortMode||'-')+'  Online:'+this.onlineUsers+'  (O=Toggle N=Name L=Last PgUp/PgDn=Page ENTER=Details Q=Quit)';
    if(info.length > this.statusFrame.width) info = info.substr(0,this.statusFrame.width);
    try { this.statusFrame.clear(); this.statusFrame.gotoxy(1,1); this.statusFrame.putmsg(info); this.statusFrame.cycle(); } catch(e){}
};

// Simple repeat helper
function repeat(n,ch){ var s=''; while(n-- > 0) s+=ch; return s; }

Users.prototype.handleKey = function(k){
    if(!k) return;
    if(this._hotspotMap && this._hotspotMap[k] !== undefined){ this.selectedIndex = this._hotspotMap[k]; this.draw(); return; }
    switch(k){
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'O': case 'o': this._toggleWhichUsers(); this.page=0; this.selectedIndex=0; this.draw(); return;
        case 'N': case 'n': this.sortMode='N'; this.page=0; this.selectedIndex=0; this.draw(); return;
        case 'L': case 'l': this.sortMode='L'; this.page=0; this.selectedIndex=0; this.draw(); return;
        case KEY_LEFT: if(this.selectedIndex>0){ this.selectedIndex--; this.draw(); } return;
        case KEY_RIGHT: if(this.selectedIndex < Math.min(this.pageSize-1, (this._visibleUsers().length-1)) ){ this.selectedIndex++; this.draw(); } return;
        case KEY_UP: {
            var meta=this._tileMeta; if(!meta) return; var target = this.selectedIndex - meta.cols; if(target>=0){ this.selectedIndex=target; this.draw(); } return; }
        case KEY_DOWN: {
            var meta=this._tileMeta; if(!meta) return; var target = this.selectedIndex + meta.cols; if(target < Math.min(this.pageSize, this._visibleUsers().length)){ this.selectedIndex=target; this.draw(); } return; }
        case KEY_PGUP: if(this.page>0){ this.page--; this.selectedIndex=0; this.draw(); } return;
        case KEY_PGDN: {
            var total = this._sortedFiltered ? this._sortedFiltered.length : this._filterUsers().length;
            var maxPage = total? Math.floor((total-1)/this.pageSize) : 0;
            if(this.page < maxPage){ this.page++; this.selectedIndex=0; this.draw(); }
            return; }
        case '\r': case '\n': this._openModalForSelected(); return;
    }
};

Users.prototype._openModalForSelected = function(){
    var vis = this._visibleUsers();
    if(!vis.length) return;
    var u = vis[this.selectedIndex];
    if(!u) return;
    this._openModal(u);
};

Users.prototype._openModal = function(user){
    if(this.modal) return; // one at a time
    if(!this.parentFrame) return;
    var W = Math.min(50, Math.max(30, Math.floor(this.parentFrame.width*0.66)));
    var H = 16; // give a little more room for segmentation
    var mx = Math.max(1, Math.floor((this.parentFrame.width - W)/2)+1);
    var my = Math.max(1, Math.floor((this.parentFrame.height - H)/2)+1);
    var frame = new Frame(mx, my, W, H, BG_BLUE|WHITE, this.parentFrame); frame.open();

    // Layout: keep overall width W. Reserve right column: 8 avatar cols + 1 padding left + 1 padding right = 10 cols.
    // So left content width = W - 10 (ensure >= 10)
    var rightTotal = 10; // 1 pad +8 avatar +1 pad
    if(W < rightTotal + 10) rightTotal = Math.min(10, W-10); // safety
    var leftW = W - rightTotal;
    var rightX = leftW + 1; // 1-based inside parent frame

    // Vertical segmentation for right side: top spacer, middle avatar, bottom footer (alias)
    // We'll compute middle height based on avatarHeight + 2 vertical padding
    var avatarH = this.avatarHeight;
    var rightPaddingV = 2; // one above, one below avatar
    var rightMidH = avatarH + rightPaddingV;
    if(rightMidH > H-2) rightMidH = Math.max(1, H-2); // keep room for top/bot
    var remaining = H - rightMidH;
    var rightTopH = Math.floor(remaining/2);
    var rightBotH = remaining - rightTopH;
    if(rightTopH < 1) rightTopH = 1;
    if(rightBotH < 1) rightBotH = 1;

    // Left side segmentation: top, middle, bottom similar approach (middle aligns with avatar mid for potential future features)
    var leftMidH = rightMidH; // align heights for symmetry
    var leftRemaining = H - leftMidH;
    var leftTopH = Math.floor(leftRemaining/2);
    var leftBotH = leftRemaining - leftTopH;
    if(leftTopH < 1) leftTopH = 1; if(leftBotH < 1) leftBotH = 1;

    // Create subframes
    var parts = {};
    // Left frames
    parts.leftTop = new Frame(frame.x, frame.y, leftW, leftTopH, BG_BLUE|WHITE, this.parentFrame); parts.leftTop.open();
    parts.leftMid = new Frame(frame.x, frame.y + leftTopH, leftW, leftMidH, BG_BLUE|WHITE, this.parentFrame); parts.leftMid.open();
    parts.leftBot = new Frame(frame.x, frame.y + leftTopH + leftMidH, leftW, leftBotH, BG_BLUE|WHITE, this.parentFrame); parts.leftBot.open();
    // Right frames
    parts.rightTop = new Frame(frame.x + rightX -1, frame.y, rightTotal, rightTopH, BG_BLUE|WHITE, this.parentFrame); parts.rightTop.open();
    parts.rightMid = new Frame(frame.x + rightX -1, frame.y + rightTopH, rightTotal, rightMidH, BG_BLUE|WHITE, this.parentFrame); parts.rightMid.open();
    parts.rightBot = new Frame(frame.x + rightX -1, frame.y + rightTopH + rightMidH, rightTotal, rightBotH, BG_BLUE|WHITE, this.parentFrame); parts.rightBot.open();
    // Avatar inner frame (for precise centering) inside rightMid
    var avatarInnerW = this.avatarWidth; var avatarInnerH = this.avatarHeight;
    var avatarInnerX = parts.rightMid.x + Math.max(0, Math.floor((rightTotal - avatarInnerW)/2));
    var avatarInnerY = parts.rightMid.y + Math.max(0, Math.floor((rightMidH - avatarInnerH)/2));
    parts.avatar = new Frame(avatarInnerX, avatarInnerY, avatarInnerW, avatarInnerH, BG_BLUE|WHITE, this.parentFrame); parts.avatar.open();

    this.modal = { frame:frame, user:user, parts:parts };
    this._drawModal();
};

Users.prototype._closeModal = function(){
    if(!this.modal) return;
    var m = this.modal;
    function safeClose(f){ if(!f) return; try{ f.close(); }catch(e){} }
    if(m.parts){ for(var k in m.parts){ safeClose(m.parts[k]); } }
    safeClose(m.frame);
    this.modal = null;
    this.draw();
};

Users.prototype._drawModal = function(){
    if(!this.modal || !this.modal.frame) return;
    var m = this.modal; var u = m.user; var p = m.parts;
    if(!p){ return; }
    // Clear frames
    function clr(fr){ try{ fr.clear(); }catch(e){} }
    clr(p.leftTop); clr(p.leftMid); clr(p.leftBot); clr(p.rightTop); clr(p.rightMid); clr(p.rightBot); clr(p.avatar);

    // Left text content distribution: put header in leftTop, main details in leftMid, footer/help in leftBot
    var headerLines = [ 'User #'+u.number, u.alias ];
    for(var i=0;i<headerLines.length && i<p.leftTop.height;i++){
        var line = headerLines[i]; if(line.length > p.leftTop.width) line=line.substr(0,p.leftTop.width);
        try{ p.leftTop.gotoxy(1,1+i); p.leftTop.putmsg('\x01h'+line+'\x01n'); }catch(e){}
    }

    var midLines = [];
    midLines.push('Location: '+(u.location||''));
    midLines.push('Email: '+(u.netmail||''));
    midLines.push('Last On: '+system.datestr(u.laston));
    midLines.push('Conn: '+(u.connection||''));
    midLines.push('Online: '+(u.online!==-1?'Yes':'No'));
    for(var j=0;j<midLines.length && j<p.leftMid.height;j++){
        var ml = midLines[j]; if(ml.length > p.leftMid.width) ml=ml.substr(0,p.leftMid.width);
        try{ p.leftMid.gotoxy(1,1+j); p.leftMid.putmsg(ml); }catch(e){}
    }

    var botLines = [ '(ENTER/ESC to close)' ];
    for(var k=0;k<botLines.length && k<p.leftBot.height;k++){
        var bl = botLines[k]; if(bl.length > p.leftBot.width) bl=bl.substr(0,p.leftBot.width);
        try{ p.leftBot.gotoxy(1,1+k); p.leftBot.putmsg(bl); }catch(e){}
    }

    // Avatar in rightMid via avatar frame
    try {
        var avatarLines = this._getAvatar(u) || [];
        if(avatarLines.length){
            var base64Candidate = avatarLines[0];
            this.putAvatarBindataIntoFrame(base64Candidate, p.avatar, 1,1, avatarLines);
        }
    } catch(e){ log('Modal avatar error: '+e); }

    // Alias in rightBot centered
    if(p.rightBot){
        var alias = u.alias;
        if(alias.length > p.rightBot.width) alias = alias.substr(0,p.rightBot.width);
        var startX = Math.max(1, Math.floor((p.rightBot.width - alias.length)/2)+1);
        try { p.rightBot.gotoxy(startX, Math.floor(p.rightBot.height/2)+1); p.rightBot.putmsg('\x01h'+alias+'\x01n'); }catch(e){}
    }

    // Cycle all
    function cyc(fr){ try{ fr.cycle(); }catch(e){} }
    for(var key in p) cyc(p[key]);
    try{ m.frame.cycle(); }catch(e){}
};

// Override handleKey when modal active
Users.prototype.handleKey = function(k){
    if(this.modal){
    if(k){ this._closeModal(); }
    return;
    }
    // fallback to base implementation defined earlier
    return this._handleMainKey(k);
};

// Main (non-modal) key dispatch extracted so modal override above can delegate
Users.prototype._handleMainKey = function(k){
    if(!k) return;
    if(this._hotspotMap && this._hotspotMap[k] !== undefined){ 
        this.selectedIndex = this._hotspotMap[k]; 
        this.draw(); 
        // Auto-open modal for hotspot activation
        this._openModalForSelected();
        return; 
    }
    switch(k){
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'O': case 'o': this._toggleWhichUsers(); this.page=0; this.selectedIndex=0; this.draw(); return;
        case 'N': case 'n': this.sortMode='N'; this.page=0; this.selectedIndex=0; this.draw(); return;
        case 'L': case 'l': this.sortMode='L'; this.page=0; this.selectedIndex=0; this.draw(); return;
        case KEY_LEFT: if(this.selectedIndex>0){ this.selectedIndex--; this.draw(); } return;
        case KEY_RIGHT: if(this.selectedIndex < Math.min(this.pageSize-1, (this._visibleUsers().length-1)) ){ this.selectedIndex++; this.draw(); } return;
        case KEY_UP: {
            var meta=this._tileMeta; if(!meta) return; var target = this.selectedIndex - meta.cols; if(target>=0){ this.selectedIndex=target; this.draw(); } return; }
        case KEY_DOWN: {
            var meta=this._tileMeta; if(!meta) return; var target = this.selectedIndex + meta.cols; if(target < Math.min(this.pageSize, this._visibleUsers().length)){ this.selectedIndex=target; this.draw(); } return; }
        case KEY_PGUP: if(this.page>0){ this.page--; this.selectedIndex=0; this.draw(); } return;
        case KEY_PGDN: {
            var total = this._sortedFiltered ? this._sortedFiltered.length : this._filterUsers().length;
            var maxPage = total? Math.floor((total-1)/this.pageSize) : 0;
            if(this.page < maxPage){ this.page++; this.selectedIndex=0; this.draw(); }
            return; }
        case '\r': case '\n': this._openModalForSelected(); return;
    }
};

Users.prototype.cleanup = function(){
    if(typeof console.clear_hotspots === 'function') { try { console.clear_hotspots(); } catch(e){} }
    try { if(this.listFrame) this.listFrame.close(); } catch(e){}
    try { if(this.statusFrame) this.statusFrame.close(); } catch(e){}
    try { if(this.modal && this.modal.frame) this.modal.frame.close(); } catch(e){}
    this.listFrame=this.statusFrame=null; this.modal=null;
    this._avatarCache = {};
    Subprogram.prototype.cleanup.call(this);
};

// Lazy avatar fetch helper methods
Users.prototype._fetchAvatarData = function(usernum, alias){
    if(!this._avatarLib || !this.showAvatars) return null;
    try {
        var raw = this._avatarLib.read(usernum, alias);
        if(!raw || !raw.data) return null;
        var lines = (''+raw.data).split(/\r?\n/);
        // Trim trailing blanks
        while(lines.length && lines[lines.length-1]==='') lines.pop();
        return lines;
    } catch(e){ return null; }
};

Users.prototype._getAvatar = function(u){
    if(!u) return null;
    if(this._avatarCache[u.number]) return this._avatarCache[u.number];
    var data = this._fetchAvatarData(u.number, u.alias) || [];
    log("Avatar data for user #"+u.number+" "+u.alias+": "+JSON.stringify(data));
    this._avatarCache[u.number] = data;
    return data;
};

Users.prototype.putAvatarBindataIntoFrame = function(data, frame, dstX, dstY, originalLines){
    // Backwards compat defaults
    dstX = dstX || 1; dstY = dstY || 1;
    if(!data){
        // Fallback to plain lines if provided
        if(originalLines) this._drawAsciiAvatar(frame, originalLines, dstX, dstY);
        return;
    }
    var bin=null;
    if(typeof base64_decode==='function'){
        try { bin=base64_decode(data); } catch(e){ bin=null; }
    }
    // Heuristic: expect char+attr pairs length >= w*h*2
    if(bin && bin.length >= (this.avatarWidth * this.avatarHeight * 2)){
        this._blitAvatarToFrame(frame, bin, this.avatarWidth, this.avatarHeight, dstX, dstY);
        return;
    }
    // Not valid bindata; draw ASCII lines (originalLines includes first line already)
    if(originalLines) this._drawAsciiAvatar(frame, originalLines, dstX, dstY);
};

Users.prototype._drawAsciiAvatar = function(frame, lines, dstX, dstY){
    var h = Math.min(this.avatarHeight, lines.length);
    for(var i=0;i<h;i++){
        var line = lines[i];
        if(!line) line='';
        if(line.length > this.avatarWidth) line = line.substr(0,this.avatarWidth);
        try { frame.gotoxy(dstX, dstY + i); frame.putmsg(line); } catch(e){}
    }
};

Users.prototype._blitAvatarToFrame = function(frame, binData, w, h, dstX, dstY){
    var offset=0; 
    for(var y=0;y<h;y++){
        for(var x=0;x<w;x++){
            if(offset+1>=binData.length) return; 
            var ch=binData.substr(offset++,1);
            var attr=ascii(binData.substr(offset++,1));
            try{ frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); }catch(se){}
        }
    }
};

// Export
this.Users = Users;
