// Avatar library loaded once (cached)
var _WHO_AVATAR_LIB = (function(){ try { return load({}, '../exec/load/avatar_lib.js'); } catch(e){ return null; } })();
var WHO_DEBUG=true; function whoLog(m){ if(WHO_DEBUG) try{ log('[WHO] '+m); }catch(e){} }


var USER_INFO_FIELDS = {
	// Top-level properties (simple)
	number: 'User #',
    alias: 'Alias',
	'stats.timeon_tday':"Time On Today (mins)",
    location: "Location",
    'stats.first_on': 'Joined',
	'stats.total_logons': 'Logons',
	'stats.total_posts': 'Posts',
    'stats.files_downloaded': 'Files downloaded',
	'is_sysop':"Sysop?",
};

function _getPath(obj, path){
	if(!obj || !path) return undefined;
	var parts = path.split('.');
	var cur = obj;
	for(var i=0;i<parts.length;i++){
		if(cur == null) return undefined;
		var k = parts[i];
		if(typeof cur[k] === 'undefined') return undefined;
		cur = cur[k];
	}
	return cur;
}

function _formatUserField(key, val){
	if(val === undefined || val === null) return '';
	// Heuristics for certain keys
	if(/timeon/i.test(key) && typeof val === 'number'){ // interpret seconds -> minutes if large
		if(val > 3600) return Math.round(val/3600)+'h';
		if(val > 300) return Math.round(val/60)+'m';
		return val+'s';
	}
	if(/first_on/i.test(key) && typeof val === 'object'){
		// Some Synchronet builds expose stats.first_on/date? If it's a Date-like number
	}
	if(/first_on/i.test(key) && typeof val === 'number'){
		try { return strftime('%Y-%m-%d', val); } catch(e){ return ''+val; }
	}
	if(typeof val === 'boolean') return val ? 'Yes' : 'No';
	return ''+val;
}
function repeatChar(ch, count){ var s=''; while(count-- > 0) s+=ch; return s; }
function _avatarLines(av){
	if(!av || !av.data) return [];
	var data = av.data;
	if(typeof data === 'string') data = data.split(/\r?\n/);
	// Strip trailing blank lines
	var out=[]; for(var i=0;i<data.length;i++){ var line=data[i]; if(line==='' && i===data.length-1) continue; out.push(line); }
	return out;
}

// --- New Subprogram-based Who Online List ---
try { load('iconshell/lib/subfunctions/subprogram.js'); } catch(e) {}

function WhoOnline(opts){
	var p = opts || {};
	Subprogram.call(this, { name:'who-online', parentFrame:p.parentFrame, shell:p.shell });
	this.shell = p.shell || this.shell;
	// Frames
	this.listFrame = null;
	this.statusFrame = null;
	// Data
	this.users = [];
	this.selected = 0;
	// Timing
	this.lastRefresh = 0;
	this.refreshIntervalMs = 5000;
	// Modal state
	this.modal = null;
	// Avatar/tile config
	this.avatarWidth = 10;
	this.avatarHeight = 6;
	this.avatarLib = _WHO_AVATAR_LIB;
	this.tileWidth = 12;
	this.tileGap = 1;
	this.showAvatars = true;
	this.flatTiles = true; // render without child frames to avoid overlap issues
	// Internal tile cache
	this._tiles = [];
	this.refreshList(true);
}

if (typeof extend === 'function') extend(WhoOnline, Subprogram);


WhoOnline.prototype.handleKey = function(k){
	if(!k) return;
	// Auto refresh on timer
	if(Date.now() - this.lastRefresh > this.refreshIntervalMs){ this.refreshList(); this.draw(); }
	// Hotspot digit / letter mapping (mouse click converted to key by console)
	if(this._hotspotMap && this._hotspotMap[k] !== undefined){
		this.selected = this._hotspotMap[k];
		this._showDetails();
		return;
	}
	// If modal open, intercept keys first
	if(this.modal){
		switch(k){
			case '\x1B': case 'Q': case 'q': // close modal on ESC
				this._closeModal();
				this.draw();
				return;
		}
		return; // ignore list navigation while modal visible
	}
	switch(k){
		case '\x1B': case 'Q': case 'q': this.exit(); return;
		case 'R': case 'r': this.refreshList(true); this.draw(); return;
		case KEY_LEFT:
			this.selected = Math.max(0,this.selected-1); try{ log('[WHO] selected(after LEFT)='+this.selected); }catch(e){} this.draw(); return;
		case KEY_RIGHT:
			this.selected = Math.min(Math.max(0,this.users.length-1), this.selected+1); try{ log('[WHO] selected(after RIGHT)='+this.selected); }catch(e){} this.draw(); return;
		case KEY_UP: {
			var cols = Math.max(1, Math.floor((this.listFrame.width + this.tileGap) / (this.tileWidth + this.tileGap)));
			this.selected = Math.max(0, this.selected - cols); try{ log('[WHO] selected(after UP)='+this.selected); }catch(e){} this.draw(); return; }
		case KEY_DOWN: {
			var cols = Math.max(1, Math.floor((this.listFrame.width + this.tileGap) / (this.tileWidth + this.tileGap)));
			this.selected = Math.min(this.users.length-1, this.selected + cols); try{ log('[WHO] selected(after DOWN)='+this.selected); }catch(e){} this.draw(); return; }
		case '\r': case '\n': this._showDetails(); return;
		case 'P': case 'p': this._sendPrivateMsg(); return;
	}
};

WhoOnline.prototype.refreshList = function(force){
	var now = Date.now();
	if(!force && now - this.lastRefresh < 750) return;
	this.lastRefresh = now;
	var lib = this.avatarLib;
	var collected = [];
	for(var n=1; n<=system.nodes; n++){
		var node = system.node_list[n-1];
		if(!node || !node.useron) continue;
		var u = new User(node.useron);
		var av = null;
		if(this.showAvatars && lib){ try { var raw = lib.read(u.number); if(raw && raw.data) av = { data:''+raw.data }; } catch(e){} }
		collected.push({ node:n, alias:u.alias, usernum:u.number, avatar:av });
	}
	collected.sort(function(a,b){ return a.node - b.node; });
	this.users = collected;
	if(this.selected >= collected.length) this.selected = collected.length? collected.length-1 : 0;
	whoLog('users='+collected.length);
};

// Instance method to build icon items (replaces former global getOnlineUserIcons)
WhoOnline.prototype.getOnlineUserIcons = function(){
	var avatar_lib = this.avatarLib;
	var items = [];
	for(var n=1;n<=system.nodes;n++){
		var node = system.node_list[n-1];
		if(!node || !node.useron) continue;
		var u = new User(node.useron);
		var av = avatar_lib ? avatar_lib.read(u.number, u.alias) : null;
		var iconFile = (avatar_lib && avatar_lib.is_enabled && avatar_lib.is_enabled(av) && av.data) ? undefined : 'user';
		var self = this;
		(function(aliasCopy, nCopy, userNumCopy, avatarCopy){
			items.push({
				label: aliasCopy + ' (#'+nCopy+')',
				type: 'item',
				iconFile: iconFile,
				avatarObj: avatarCopy,
				node: nCopy,
				usernum: userNumCopy,
				action: function(){
					var selUser = u;
					log("OPEN MODAL FOR SELECTED USER" + JSON.stringify(selUser.alias))
					try{self._openModal(selUser); self.draw(); } catch(e){}
					// try {
					// 	var shell = this; // shell context expected
					// 	if(typeof WhoOnline !== 'function') return;
					// 	if(!shell.whoOnlineSub) shell.whoOnlineSub = new WhoOnline({ parentFrame: shell.subFrame, shell: shell });
					// 	var sub = shell.whoOnlineSub;
					// 	sub.refreshList(true);
					// 	for(var i=0;i<sub.users.length;i++) if(sub.users[i].node === nCopy){ sub.selected = i; break; }
					// 	shell.queueSubprogramLaunch('who-online', sub);
					// 	(function(){ var selUser = sub.users[sub.selected]; if(selUser) { try{sub._openModal(selUser); sub.draw(); } catch(e){} } })();
					// } catch(ex){ try { log('who-folder action error '+ex); } catch(_){} }
				}
			});
		})(u.alias, n, u.number, av);
	}
	return items;
};

WhoOnline.prototype._ensureFrames = function(){
	if(!this.parentFrame) return;
	if(!this.listFrame){
		var h = Math.max(1, this.parentFrame.height - 1);
		this.listFrame = new Frame(1,1,this.parentFrame.width,h,BG_BLACK|LIGHTGRAY,this.parentFrame);
		this.listFrame.open();
	}
	if(!this.statusFrame){
		this.statusFrame = new Frame(1,this.parentFrame.height,this.parentFrame.width,1,BG_BLUE|WHITE,this.parentFrame);
		this.statusFrame.open();
	}
};

WhoOnline.prototype._destroyTiles = function(){
	if(!this._tiles) return;
	for(var i=0;i<this._tiles.length;i++){
		var t=this._tiles[i];
		try { t.nameFrame && t.nameFrame.close(); } catch(e){}
		try { t.nodeFrame && t.nodeFrame.close(); } catch(e){}
		try { t.avatarFrame && t.avatarFrame.close(); } catch(e){}
		try { t.frame && t.frame.close(); } catch(e){}
	}
	this._tiles=[];
};

WhoOnline.prototype._buildTiles = function(){
	if(!this.listFrame) return;
	this._destroyTiles();
	var availW = this.listFrame.width;
	var availH = this.listFrame.height;
	var tileH = this.avatarHeight + 2;
	var cols = Math.max(1, Math.floor((availW + this.tileGap) / (this.tileWidth + this.tileGap)));
	var rows = Math.max(1, Math.floor(availH / tileH));
	var capacity = cols * rows;
	var count = Math.min(this.users.length, capacity);
	for(var i=0;i<count;i++){
		var user = this.users[i];
		var col = i % cols, row = Math.floor(i / cols);
		var x = 1 + col * (this.tileWidth + this.tileGap);
		var y = 1 + row * tileH;
		// In flat mode we store only metadata coordinates; otherwise create frames
		var tileObj = { index:i, user:{ node:user.node, alias:user.alias, usernum:user.usernum, avatar:user.avatar }, x:x, y:y, w:this.tileWidth, h:tileH };
		if(!this.flatTiles){
			var base = new Frame(x, y, this.tileWidth, tileH, BG_BLACK|LIGHTGRAY, this.listFrame); base.open();
			var header, avatar, footer;
			try { header = new Frame(1,1,this.tileWidth,1,BG_BLUE|WHITE,base); header.open(); } catch(e){}
			if(this.showAvatars){ try { avatar = new Frame(1,2,this.tileWidth,this.avatarHeight,BG_BLACK|LIGHTGRAY,base); avatar.open(); } catch(e){} }
			try { footer = new Frame(1,2+this.avatarHeight,this.tileWidth,1,BG_BLUE|WHITE,base); footer.open(); } catch(e){}
			tileObj.frame = base; tileObj.nodeFrame = header; tileObj.avatarFrame = avatar; tileObj.nameFrame = footer;
		}
		this._tiles.push(tileObj);
		whoLog('build tile#'+i+' node='+user.node+' col='+col+' row='+row+' flat='+this.flatTiles+' pos='+x+','+y+' w='+this.tileWidth+' h='+tileH);
	}
	whoLog('tiles='+this._tiles.length+' cols='+cols+' rows='+rows+' flat='+this.flatTiles);
};

WhoOnline.prototype._drawTile = function(tile){
	if(!tile) return;
	var selected = tile.index === this.selected;
	if(this.flatTiles){
		// Flat drawing into listFrame (no child frames)
		var lf = this.listFrame;
		var left = tile.x, top = tile.y;
		var bgSel = '\x01'+(selected?'4':'0'); // light bg when selected (rudimentary)
		// Clear block (background)
		for(var yy=0; yy<tile.h; yy++){
			try { lf.gotoxy(left, top+yy); lf.putmsg(bgSel+repeatChar(' ', Math.min(tile.w, lf.width-left+1))); } catch(e){}
		}
		// Header (node)
		try { lf.gotoxy(left, top); var header = 'Node '+tile.user.node; if(header.length>tile.w) header=header.substr(0,tile.w); lf.putmsg((selected?'\x01h':'')+header+'\x01n'); } catch(e){}
		// Avatar area
		if(this.showAvatars && tile.user.avatar && tile.user.avatar.data){
			try {
				var bin=(typeof base64_decode==='function')?base64_decode(tile.user.avatar.data):null;
				if(bin){
					var aw=this.avatarWidth, ah=this.avatarHeight;
					var startX = left + (tile.w>aw ? Math.floor((tile.w-aw)/2) : 0);
					var off=0; for(var ay=0; ay<ah; ay++){ for(var ax=0; ax<aw; ax++){ if(off+1>=bin.length) break; var ch=bin.substr(off++,1); var attr=ascii(bin.substr(off++,1)); try { lf.setData(startX+ax-1, top+1+ay-1, ch, attr, false); } catch(se){} } }
				}
			} catch(e){}
		}
		// Footer (alias)
		var nameY = top + tile.h - 1;
		var name = tile.user.alias; if(name.length>tile.w) name = name.substr(0,tile.w);
		try { lf.gotoxy(left, nameY); lf.putmsg((selected?'\x01h':'')+name+'\x01n'); } catch(e){}
		// Minimal log (comment out for production)
		// whoLog('draw flat tile#'+tile.index+' node='+tile.user.node+' at '+left+','+top+' sel='+selected);
	}else{
		var absBaseX = (this.listFrame ? this.listFrame.x - 1 : 0) + tile.frame.x;
		var absBaseY = (this.listFrame ? this.listFrame.y - 1 : 0) + tile.frame.y;
		whoLog('draw tile#'+tile.index+' node='+tile.user.node+' framePos='+tile.frame.x+','+tile.frame.y+' abs='+absBaseX+','+absBaseY+' sel='+selected);
		if(tile.nodeFrame){ try { tile.nodeFrame.clear(selected?(BG_LIGHTGRAY|BLACK):(BG_BLUE|WHITE)); }catch(e){} tile.nodeFrame.gotoxy(1,1); tile.nodeFrame.putmsg((selected?'\x01h':'')+'Node '+tile.user.node+'\x01n'); }
		if(tile.avatarFrame){
			try { tile.avatarFrame.clear(BG_BLACK|LIGHTGRAY); }catch(e){}
			var av = tile.user.avatar;
			if(av && av.data){ try { var bin=(typeof base64_decode==='function')?base64_decode(av.data):null; if(bin && this.blitAvatarToFrame){ var sx=1; if(this.avatarWidth<tile.avatarFrame.width) sx=1+Math.floor((tile.avatarFrame.width-this.avatarWidth)/2); this.blitAvatarToFrame(tile.avatarFrame,bin,this.avatarWidth,this.avatarHeight,sx,1);} }catch(e){} }
		}
		if(tile.nameFrame){ var name=tile.user.alias; if(name.length>tile.nameFrame.width) name=name.substr(0,tile.nameFrame.width); try { tile.nameFrame.clear(selected?(BG_LIGHTGRAY|BLACK):(BG_BLUE|WHITE)); }catch(e){} tile.nameFrame.gotoxy(1,1); tile.nameFrame.putmsg((selected?'\x01h':'')+name+'\x01n'); }
		try { tile.frame.attr = selected?(BG_LIGHTGRAY|BLACK):(BG_BLACK|LIGHTGRAY); }catch(e){}
		try { tile.nodeFrame && tile.nodeFrame.cycle(); }catch(e){}
		try { tile.avatarFrame && tile.avatarFrame.cycle(); }catch(e){}
		try { tile.nameFrame && tile.nameFrame.cycle(); }catch(e){}
		try { tile.frame.cycle(); }catch(e){}
	}
};

WhoOnline.prototype._drawGrid = function(){
	if(!this.listFrame) return;
	if(typeof console.clear_hotspots==='function'){ try{ console.clear_hotspots(); }catch(e){} }
	var tileH = this.avatarHeight + 2;
	var cols = Math.max(1, Math.floor((this.listFrame.width + this.tileGap) / (this.tileWidth + this.tileGap)));
	var rows = Math.max(1, Math.floor(this.listFrame.height / tileH));
	var capacity = cols * rows;
	var needed = Math.min(this.users.length, capacity);
	if(this._tiles.length !== needed) this._buildTiles();
	for(var i=0;i<this._tiles.length;i++) this._drawTile(this._tiles[i]);
	this._addMouseHotspots();
	try { this.listFrame.cycle(); }catch(e){}
};

WhoOnline.prototype._drawStatus = function(msg){
	var f=this.statusFrame; if(!f) return; f.clear(); f.gotoxy(1,1);
	if(msg===undefined) msg = this.users.length ? (this.users.length+' online') : 'No users online';
	f.putmsg(msg.substr(0,f.width)); f.cycle();
};

WhoOnline.prototype.draw = function(){
	this._ensureFrames();
	if(!this.modal){
		this._drawGrid();
		this._drawStatus();
	}else{ this._drawModalContents(); }
	this.parentFrame && this.parentFrame.cycle();
};

// Add console hotspots for each tile so clicks fire corresponding hotkey which shell forwards as key
WhoOnline.prototype._addMouseHotspots = function(){
	if(!this._tiles || !this._tiles.length) return;
	if(typeof console.add_hotspot !== 'function') return;
	for(var i=0;i<this._tiles.length && i<36;i++){ // support up to 36 tiles (0-9 then A-Z)
		var t=this._tiles[i];
		var cmd;
		if(i<10) cmd = String(i); else cmd = String.fromCharCode('A'.charCodeAt(0)+(i-10));
		var min_x, max_x, min_y, max_y;
		if(this.flatTiles){
			// tile.x/y are relative to listFrame (1-based)
			var baseX = this.listFrame ? (this.listFrame.x - 1) : 0;
			var baseY = this.listFrame ? (this.listFrame.y - 1) : 0;
			min_x = baseX + t.x;
			max_x = min_x + t.w - 1;
			min_y = baseY + t.y;
			max_y = min_y + t.h - 1;
		}else{
			if(!t.frame) continue; // safety
			var baseX = this.listFrame ? (this.listFrame.x - 1) : 0;
			var baseY = this.listFrame ? (this.listFrame.y - 1) : 0;
			// frame.x/y are relative to listFrame; convert to absolute
			min_x = baseX + t.frame.x;
			max_x = min_x + t.frame.width - 1;
			min_y = baseY + t.frame.y;
			max_y = min_y + t.frame.height - 1;
		}
		for(var y=min_y; y<=max_y; y++){
			try { console.add_hotspot(cmd, false, min_x, max_x, y); } catch(e){}
		}
		// Map command to selecting + opening modal when key processed in handleKey
		// We'll intercept in handleKey by checking if key matches generated mapping
		if(!this._hotspotMap) this._hotspotMap={};
		this._hotspotMap[cmd]=i;
	}
};

WhoOnline.prototype._showDetails = function(){
	if(!this.users.length) return;
	var u=this.users[this.selected];
	this._openModal(u);
};

WhoOnline.prototype._sendPrivateMsg = function(){
	if(!this.users.length) return;
	var u=this.users[this.selected];
	try {
		if (typeof bbs !== 'undefined' && bbs.sys_status !== undefined) {
			console.putmsg('\r\nEnter message for '+u.alias+' (blank=cancel): ');
			var m = console.getstr(60);
			if(m){
				// Basic inter-node message using system.put_telegram / node message if available
				try { bbs.more_prompt=false; } catch(ex){}
				try { system.put_telegram(u.usernum, m); this._drawStatus('Sent message'); } catch(ex){ this._drawStatus('Send failed'); }
			}
		}
	} catch(e){ this._drawStatus('Error'); }
};

// Helper to blit a decoded avatar block into a frame at (dstX, dstY)
WhoOnline.prototype.blitAvatarToFrame = function (frame, avatarData, width, height, dstX, dstY) {
    var offset = 0;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            if (offset + 1 >= avatarData.length) return;
            var ch = avatarData.substr(offset++, 1);
            var attr = ascii(avatarData.substr(offset++, 1));
            frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false);
        }
    }
}

// ---- Modal Support ----
WhoOnline.prototype._openModal = function(user){
	log("_openModalCalled.  Modal exists in memory?" + !!this.modal);
	log("_openModalCalled.  Parent frame exists memory?" + !!this.modal);

	// if(!user || this.modal) return;
	// if(!this.parentFrame) return;
	var fullUser; // attempt to get a richer user object
	try { if(user && (user.usernum || user.number)) fullUser = new User(user.usernum || user.number); } catch(e){}
	if(!fullUser) fullUser = user || {};
	// Count fields to decide height
	var fieldCount = 0; for(var fk in USER_INFO_FIELDS) if(USER_INFO_FIELDS.hasOwnProperty(fk)) fieldCount++;
	var infoHeight = fieldCount + 3; // header + spacing
	var minH = 10;
	var H = Math.max(minH, infoHeight);
	var W = 50; // wider for labels
	var pw = this.parentFrame.width;
	var ph = this.parentFrame.height;
	// Coordinates must be RELATIVE to parentFrame, not absolute screen coordinates
	var mx = Math.max(1, Math.floor((pw - W)/2) + 1);
	var my = Math.max(1, Math.floor((ph - H)/2) + 1);
	var modalFrame = new Frame(mx, my, W, H, BG_BLUE|WHITE, this.parentFrame);
	modalFrame.open();
	// Column layout: right avatar column fixed avatarWidth, left remainder -1 for spacer
	var rightW = this.avatarWidth;
	if(rightW > W-4) rightW = Math.max(6, W-4);
	// Create two column frames inside modal
	var gap = 1;
	var leftW = W - rightW - gap; if(leftW < 10) leftW = W - rightW - gap; // ensure some width
	if(leftW < 5){ // fallback to single column if too narrow
		this.modal = { frame: modalFrame, avatarColWidth: rightW, user: fullUser, rawUser: user };
	}else{
		// Child frame coordinates are relative to modal (1,1), not absolute screen coords
		var leftFrame = new Frame(modalFrame.x,modalFrame.y,leftW,H,BG_CYAN|LIGHTGRAY, modalFrame); leftFrame.open();
		var rightFrame = new Frame(modalFrame.x + leftW,modalFrame.y,rightW,H,BG_BLUE|LIGHTGRAY, modalFrame); rightFrame.open();
		this.modal = { frame: modalFrame, leftFrame:leftFrame, rightFrame:rightFrame, user: fullUser, rawUser: user };
	}
	log("CREATED MODAL DRAWING CONTENTS")
	this._drawModalContents();
};

WhoOnline.prototype._closeModal = function(){
	if(!this.modal) return;
	try { if(this.modal.leftFrame) this.modal.leftFrame.close(); } catch(e){}
	try { if(this.modal.rightFrame) this.modal.rightFrame.close(); } catch(e){}
	try { if(this.modal.frame) this.modal.frame.close(); } catch(e){}
	this.modal = null;
};


WhoOnline.prototype._drawModalContents = function(){
	if(!this.modal) return;
	var m = this.modal; var f = m.frame; var u = m.user; var raw = m.rawUser;
	if(!f || !f.is_open) try { f.open(); } catch(e){}
	// Two-frame layout
	if(m.leftFrame && m.rightFrame){
		var lf = m.leftFrame, rf = m.rightFrame;
		try { lf.clear(); } catch(e){}
		try { rf.clear(); } catch(e){}
		// Title
		var line = 1;
		var title = (u.alias || raw.alias || 'User');
		try { lf.gotoxy(1,line); lf.putmsg('\x01h'+title.substr(0,lf.width)+'\x01n'); } catch(e){}
		line++;
		// Fields
		for(var key in USER_INFO_FIELDS){ if(!USER_INFO_FIELDS.hasOwnProperty(key)) continue; var label = USER_INFO_FIELDS[key]; var val;
			if(key === 'number') val = u.number || u.usernum || raw.usernum; else val = _getPath(u, key);
			var formatted = _formatUserField(key, val);
			if(!formatted) continue;
			if(line > lf.height) break;
			var text = label+': '+formatted;
			if(text.length > lf.width) text = text.substr(0, lf.width);
			try { lf.gotoxy(1,line); lf.putmsg(text); } catch(e){}
			line++;
		}
		// Avatar centered vertically in right frame
		try {
			var av = raw.avatar || u.avatar; if(!av && this.avatarLib && (u.number||u.usernum)) { try { var r=this.avatarLib.read(u.number||u.usernum); if(r && r.data) av=r; } catch(ex){} }
			if(av && av.data){
				if(av && av.data){ 
					try { 
					var bin=(typeof base64_decode==='function')?base64_decode(av.data):null; 
					if(bin && this.blitAvatarToFrame) {
						// Center inside right frame
						var cx = 1 + Math.max(0, Math.floor((rf.width - this.avatarWidth)/2));
						var cy = 1 + Math.max(0, Math.floor((rf.height - this.avatarHeight)/2));
						this.blitAvatarToFrame(rf, bin, this.avatarWidth, this.avatarHeight, cx, cy);
					}}
					catch(e){}
				}
			} else{ rf.gotoxy(1,1); rf.putmsg('\x01c(No Avatar)'); }
		} catch(e){ try { rf.gotoxy(1,1); rf.putmsg('Err'); } catch(_){} }
		try { lf.cycle(); } catch(e){}
		try { rf.cycle(); } catch(e){}
	}else{
		// Fallback to single-frame logic if columns missing
		try { f.clear(); } catch(e){}
		var title2 = (u.alias || raw.alias || 'User');
		try { f.gotoxy(1,1); f.putmsg('\x01h'+title2.substr(0,f.width)+'\x01n'); } catch(e){}
	}
	try { f.cycle(); } catch(e){}
};

// Optional mouse handling (shell must forward events)
WhoOnline.prototype.handleMouse = function(mx,my,btn){
	if(!this.parentFrame) return false;
	if(this.modal){
		if(btn && this.modal.frame && (mx < this.modal.frame.x || mx >= this.modal.frame.x + this.modal.frame.width || my < this.modal.frame.y || my >= this.modal.frame.y + this.modal.frame.height)){
			this._closeModal(); this.draw(); return true;
		}
		return true;
	}
	if(!this.listFrame) return false;
	// Translate to listFrame local
	if(mx < this.listFrame.x || my < this.listFrame.y || mx >= this.listFrame.x + this.listFrame.width || my >= this.listFrame.y + this.listFrame.height) return false;
	var localX = mx - this.listFrame.x + 1; // 1-based inside listFrame
	var localY = my - this.listFrame.y + 1;
	for(var i=0;i<this._tiles.length;i++){
		var t=this._tiles[i];
		var within;
		if(this.flatTiles){
			within = (localX >= t.x && localX < t.x + t.w && localY >= t.y && localY < t.y + t.h);
		}else if(t.frame){
			within = (localX >= t.frame.x && localX < t.frame.x + t.frame.width && localY >= t.frame.y && localY < t.frame.y + t.frame.height);
		}else within=false;
		if(within){
			this.selected = t.index;
			if(btn){ this._showDetails(); } else { this.draw(); }
			return true;
		}
	}
	return false;
};

WhoOnline.prototype.enter = function(done){
	Subprogram.prototype.enter.call(this, done);
	this.draw();
};

WhoOnline.prototype.cleanup = function(){
	try { if(this.listFrame) this.listFrame.close(); } catch(e){}
	try { if(this.statusFrame) this.statusFrame.close(); } catch(e){}
	this._destroyTiles();
	this.listFrame=null; this.statusFrame=null;
	Subprogram.prototype.cleanup.call(this);
};

this.WhoOnline = WhoOnline;




