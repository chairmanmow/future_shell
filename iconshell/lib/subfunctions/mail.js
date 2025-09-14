load('iconshell/lib/subfunctions/subprogram.js');
// Use shared Icon renderer for consistency with main shell
load('iconshell/lib/shell/icon.js');
// Fallback key codes if not defined globally (Synchronet usually defines in sbbsdefs.js)
if (typeof KEY_PGUP === 'undefined') var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined') var KEY_PGDN = 0x5100;
/* -------------------------------------------------------------------------
   Synchronet bbs.* Mail API quick reference (kept here for fast lookup)

   STYLE: JSDoc-ish so tooling (and future AI passes) can parse easily.
   All params are optional in our current usage (we pass none for interactive flows).

   -------------------------------------------------------------------------
   bbs.read_mail(which?, usernum?, sub_code?) -> number | void
   @param {Number} [which] Bitfield filter. Common bits (see sbbsdefs.js):
	   WM_EMAIL  (read local email)
	   WM_NETMAIL (read netmail)
	   WM_ALL    (all mail types)
	   WM_DELETE (mark deleted while reading)
	   WM_QUOTE  (quote prior text when replying)
	   (We typically omit -> interactive reader for current user.)
   @param {Number} [usernum] Target user number (requires sysop when not current user)
   @param {String} [sub_code] Sub-board internal code (when reading a sub instead of email)
   @returns {Number|void} Count of messages read (implementation-dependent) or nothing.
   Side-effects: Launches full-screen reader UI when called without args.

   -------------------------------------------------------------------------
   bbs.email(dest?, subject?, body?, mode?) -> Boolean|void
   @param {Number|String} [dest] User number, alias/handle, or internet address.
				     Omit for interactive TO prompt.
   @param {String}        [subject] Subject line; omit for prompt.
   @param {String|String[]} [body] Message text or array of lines; omit for editor/prompt.
   @param {Number}        [mode] Bitfield flags (e.g. WM_ANON, WM_PRIVATE, WM_CONF, WM_NOFWD, WM_FILE).
   @returns {Boolean|void} true on success, false on failure, or void when interactive.

   -------------------------------------------------------------------------
   bbs.netmail(address?, subject?, body?, mode?) -> Boolean|void
   @param {String}  [address] Net/Fido/Internet destination; omit for prompt.
   @param {String}  [subject]
   @param {String|String[]} [body]
   @param {Number} [mode] Same style flag bits; plus netmail-specific bits if defined in build.
   @returns {Boolean|void}

   -------------------------------------------------------------------------
   bbs.send_file(path?, mode?) -> Boolean|void
   @param {String} [path] File to attach/send; omit for interactive picker.
   @param {Number} [mode] Flags (e.g. WM_FILE or transfer modifiers if supported).
   @returns {Boolean|void}
   Side-effects: Opens stock file selection/transfer UI when path omitted.

   NOTES / LOCAL USAGE:
   - We intentionally invoke all four with no parameters to leverage native interactive flows.
   - After each action we refresh unread count (updateUnreadCount) and redraw icons.
	- Return values (true/false/count) are ignored; UX feedback previously used a scrollback helper (now removed).
   - If future automation needs scripted flows, supply params & remove interactive dependency.
   ------------------------------------------------------------------------- */
function Mail(opts) {
	opts = opts || {};
	Subprogram.call(this, { name: 'mail', parentFrame: opts.parentFrame, shell: opts.shell });
	this.shell = opts.shell || this.shell; // preserve any provided shell reference
	this.outputFrame = null;
	this.inputFrame = null;
	this.selectedIndex = 0;
	this.lastMessage = '';
	this.mode = 'icon'; // icon | confirm only
	this.confirmFor = null;
	this.scrollback = [];
	this.scrollOffset = 0;
	this.maxScrollLines = 1000;
	var self=this;
	function makeAction(fn,msg,opts){
		opts = opts || {};
		var animate = opts.animation !== 'none';
		return function(){
			var sh = self.shell;
			if(animate && sh && typeof sh.runExternal === 'function') {
				sh.runExternal(function(){ try { fn(); } catch(ex){ /* suppressed error */ } });
			} else {
				try { fn(); } catch(ex){ /* suppressed error */ }
			}
			self.updateUnreadCount();
			self.draw();
		};
	}
	this.menuOptions = [
		{ baseLabel: 'Exit', iconFile:'back', action: function(){ self.exit(); } },
		{ baseLabel: 'Read Mail', iconFile:'messages', dynamic:true,  action: makeAction(function(){ bbs.read_mail(); }, 'Reading mail...') },
		// Native interactive compose (custom pre-screen, no confirmation desired)
		{ baseLabel: 'Compose Email', iconFile:'messages', confirm:false, action: function(){ self.composeInteractiveEmail(); } },
		// Netmail (potentially irreversible route) keep confirmation
		{ baseLabel: 'Send Netmail', iconFile:'messages', confirm:true, action: makeAction(function(){ bbs.netmail(); }, 'Launching netmail composer...') },
		{ baseLabel: 'Send File', iconFile:'folder', action: makeAction(function(){ bbs.send_file(); }, 'Send file dialog...') }
	];
	this.updateUnreadCount();
	// icon cell cache
	this.iconCells = [];
}

extend(Mail, Subprogram);

Mail.prototype.composeInteractiveEmail = function(){
	var self=this;
	try {
		try { console.attr = BG_BLACK|LIGHTGRAY; } catch(ea) { try { console.attributes = BG_BLACK|LIGHTGRAY; } catch(ea2){} }
		console.clear();
		var dest = self._promptRecipientOverlay();
		if(dest === undefined) dest = self._promptRecipientStyled();
		if(!dest){
			console.crlf();
			console.print('\x01rAborted.  [Hit a key]\x01n');
			console.getkey(K_NOECHO|K_NOSPIN);
			self.draw();
			return;
		}
	var shell=self.shell;
	var sent=false;
	var act=function(){ try { bbs.email(dest, ''); sent=true; } catch(e){ /* send failed suppressed */ } };
		if(shell && typeof shell.runExternal==='function') shell.runExternal(act); else act();
		self.updateUnreadCount();
		if(sent) self._toastSent && self._toastSent(dest);
	} catch(e){ /* compose error suppressed */ }
	self.draw();
};

Mail.prototype._promptRecipient = function(){
	try {
		if(!console || !console.getstr) return null;
		console.crlf(); console.putmsg('\x01hTo (user #/name/email): \x01n');
		var s=console.getstr(80);
		if(!s) return null;
		return s.trim();
	}catch(e){ return null; }
};

// Styled recipient prompt shown on a cleared screen prior to launching editor
Mail.prototype._promptRecipientStyled = function(){
	if(!console || !console.getstr) return null;
	// Guidance (magenta) on first line
    console.clear();
	console.gotoxy(1,1);
	// Ensure we explicitly reset attributes at end so later background stays black
	console.putmsg('\x01mWho do you want to send this email to?\x01n');
	// Blank spacer line 2
	// console.gotoxy(1,2); console.putmsg('\x01n');
	// Label (yellow) and input field on line 3
	var label = 'to:';
	console.gotoxy(1,3);
	// Bright yellow label followed by single space, then reset to normal before field region
	console.putmsg('\x01y'+label+'\x01n ');
	// Field starts after label + space
	var startX = label.length + 2; // column where blue field begins
	var scrCols = console.screen_columns || 80;
	var maxUsable = scrCols - startX - 1;
	var fieldMax = Math.min(60, Math.max(10, maxUsable)); // cap at 60, min 10
	// Draw blue background for field (just the field area, not whole line)
	var ESC='\x1b[';
	var blankField = Array(fieldMax+1).join(' ');
	console.gotoxy(startX,3);
	console.putmsg(ESC+'44;37m'+blankField+'\x1b[0m');
	// Position at start of field for input and set blue/white again
	console.gotoxy(startX,3);
	console.putmsg(ESC+'44;37m');
	var s = console.getstr(fieldMax, K_EDIT);
	// Reset colors immediately after input (rest of line remains black)
	console.putmsg('\x1b[0m');
	// Optional: ensure cursor moves just after entered text (not strictly required)
	if(!s) return null;
	s = s.trim();
	if(!s.length) return null;
	return s;
};

// Overlay frame-based prompt to avoid global console attribute side-effects
Mail.prototype._promptRecipientOverlay = function(){
	try {
		var cols = console.screen_columns || 80;
		var rows = console.screen_rows || 24;
		// Root overlay
		var overlay = new Frame(1,1,cols,rows,BG_BLACK|LIGHTGRAY);
		overlay.open();
		// Guidance line (magenta)
		var guide = new Frame(1,1,cols,1,BG_BLACK|MAGENTA,overlay);
		guide.open();
		guide.putmsg('Who do you want to send this email to?');
		// Label line (row 3) with yellow label and blue field
		var labelFrame = new Frame(1,3,4,1,BG_BLACK|YELLOW,overlay); // width 4 fits 'to:'
		labelFrame.open();
		labelFrame.putmsg('to:');
		var startX = 6; // space after label
		var fieldW = Math.min(60, Math.max(10, cols - startX - 1));
		var fieldFrame = new Frame(startX,3,fieldW,1,BG_BLUE|WHITE,overlay);
		fieldFrame.open();
		// Simple input loop (no echo bleed)
		var buf='';
		function redrawField(){
			fieldFrame.clear(BG_BLUE|WHITE);
			var show = buf;
			if(show.length > fieldW) show = show.substr(show.length-fieldW);
			fieldFrame.gotoxy(1,1);
			fieldFrame.putmsg(show);
			fieldFrame.cycle();
		}
		redrawField();
		while(true){
			var ch = console.getkey(K_NOECHO|K_NOSPIN);
			if(!ch) continue;
			if(ch==='\r' || ch==='\n') break;
			if(ch==='\x1B'){ overlay.close(); return null; }
			if((ch==='\b' || ch==='\x7f') && buf.length){ buf = buf.substr(0,buf.length-1); redrawField(); continue; }
			if(ch.length===1 && ch>=' ' && ch<='~' && buf.length < 120){ buf += ch; redrawField(); }
		}
		var out = buf.trim();
		overlay.close();
		if(!out.length) return null;
		return out;
	} catch(e){
		try { if(overlay) overlay.close(); } catch(_){}
		return undefined; // signal fallback to styled version
	}
};

Mail.prototype._promptSubject = function(){
	try {
		if(!console || !console.getstr) return null;
		console.crlf(); console.putmsg('\x01hSubject: \x01n');
		var s=console.getstr(72);
		if(s===null) return null; // user aborted
		s = s.replace(/\s+$/,'');
		if(!s.length) return null; // treat empty as cancel
		return s;
	} catch(e){ return null; }
};

Mail.prototype._toastSent = function(dest){
	try {
		if(!dest) return;
		// Use unified subprogram helper; falls back to console if shell not available
		this._showToast({ message: 'Sent mail to '+dest, timeout:5000, position: 'top-left' });
	} catch(e) {}
};

// Mail inherits the standard enter(done) from Subprogram; no override needed.
// (Subprogram.enter will set the callback, open a frame if needed, and call draw())

Mail.prototype._ensureFrames = function() {
	if (!this.parentFrame) return;
	if (!this.outputFrame) {
		var h = Math.max(1, this.parentFrame.height - 1);
		this.outputFrame = new Frame(1, 1, this.parentFrame.width, h, BG_BLACK|LIGHTGRAY, this.parentFrame);
		this.outputFrame.open();
	}
	if (!this.inputFrame) {
		this.inputFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, BG_BLUE|WHITE, this.parentFrame);
		this.inputFrame.open();
	}
};

Mail.prototype.draw = function() {
	this._ensureFrames();
	if (!this.outputFrame || !this.inputFrame) return;
	var o=this.outputFrame; o.clear();
	 o.gotoxy(1,1);
	// Clear any prior hotspots (avoid shell leftovers triggering unexpected exits)
	if (typeof console.clear_hotspots === 'function') try { console.clear_hotspots(); } catch(e){}
	var gridInfo = this.drawIconGrid(o) || { heightUsed: 3 };
	// Register hotspots for each icon cell region (map to digit key 1..9 / A.. etc if >9 later)
	this._addMouseHotspots();
	// scrollback below icons
	var visibleLines = o.height - gridInfo.heightUsed;
	if(visibleLines>0){
		var start=Math.max(0,this.scrollback.length-visibleLines - this.scrollOffset);
		var end=Math.min(this.scrollback.length,start+visibleLines);
		for(var li=start; li<end; li++){
			var line=this.scrollback[li]; if(line.length>o.width) line=line.substr(0,o.width); o.putmsg(line+'\r\n');
		}
	}
	if(this.mode==='confirm' && this.confirmFor){
		o.putmsg('\r\nConfirm '+(this.confirmFor.baseLabel||'action')+'? (Y/N)\r\n');
	}
	this._drawInput();
	this.parentFrame.cycle();
};

Mail.prototype._drawInput = function() {
	if (!this.inputFrame) return;
	var f=this.inputFrame; f.clear(); f.gotoxy(1,1);
	var prompt='';
	if(this.mode==='confirm') prompt='Y/N confirm'; else prompt='Arrows/1-'+this.menuOptions.length+' Enter=Run PgUp/PgDn scroll';
	if(prompt.length>f.width) prompt=prompt.substr(0,f.width);
	f.putmsg(prompt);
	f.cycle();
};

Mail.prototype.handleKey = function(k) {
	if(!k) return;
	if(k==='\x1B'){ // ESC
		if(this.mode==='confirm'){ this.mode='icon'; this.confirmFor=null; this.draw(); return; }
		this.exit(); return; }
	if(k==='Q' || k==='q'){ this.exit(); return; }
	if(this.mode==='confirm'){
		if(k==='Y' || k==='y'){ this.invokeConfirmed(); return; }
		if(k==='N' || k==='n'){ this.mode='icon'; this.confirmFor=null; this.draw(); return; }
		return;
	}
	switch(k){
		case '\x1E':
		case KEY_UP:
			if(this.selectedIndex>0){ this.selectedIndex--; if(this.mode==='icon') this.ensureIconVisible(); this.draw(); }
			return;
		case '\x0A':
		case KEY_DOWN:
			if(this.selectedIndex<this.menuOptions.length-1){ this.selectedIndex++; if(this.mode==='icon') this.ensureIconVisible(); this.draw(); }
			return;
		case KEY_HOME:
			this.selectedIndex=0; this.draw(); return;
		case KEY_END:
			this.selectedIndex=this.menuOptions.length-1; this.draw(); return;
		case KEY_PGUP:
			this.scrollOffset += 3; if(this.scrollOffset>this.scrollback.length) this.scrollOffset=this.scrollback.length; this.draw(); return;
		case KEY_PGDN:
			this.scrollOffset -= 3; if(this.scrollOffset<0) this.scrollOffset=0; this.draw(); return;
		case '\r': case '\n':
			this.invokeSelected(); return;
		default:
			if(k.length===1 && k>='1' && k<='9'){
				var idx=parseInt(k,10)-1; if(idx<this.menuOptions.length){ this.selectedIndex=idx; this.draw(); this.invokeSelected(); return; }
			}
	}
};

Mail.prototype.invokeSelected = function(){
	var opt=this.menuOptions[this.selectedIndex]; if(!opt) return;
	if(opt.confirm){ this.mode='confirm'; this.confirmFor=opt; this.draw(); return; }
	try { opt.action && opt.action(); } catch(e){ /* suppressed option error */ }
};

Mail.prototype.invokeConfirmed = function(){
	var opt=this.confirmFor; this.mode='icon'; this.confirmFor=null; if(!opt){ this.draw(); return; }
	try { opt.action && opt.action(); } catch(e){ /* suppressed option error */ }
};

// Removed suspend/resume logic; using shell.runExternal wrapper

Mail.prototype.renderOptionLabel = function(opt, idx){
	var label = opt.baseLabel || opt.label || ('Option '+(idx+1));
	if(opt.dynamic && /Read Mail/i.test(label)) label += ' ('+this.unreadCount+')';
	return label;
};

Mail.prototype.updateUnreadCount = function(){
	try { this.unreadCount = (typeof bbs.mail_waiting !== 'undefined') ? bbs.mail_waiting : (user && user.mail_waiting) || 0; }
	catch(e){ this.unreadCount=0; }
};


Mail.prototype.drawIconGrid = function(o){
	var ICON_W = (typeof ICSH_CONSTANTS!=='undefined'?ICSH_CONSTANTS.ICON_W:12);
	var ICON_H = (typeof ICSH_CONSTANTS!=='undefined'?ICSH_CONSTANTS.ICON_H:6);
	var labelH = 1;
	var cellW = ICON_W + 2; // padding similar to main shell
	var cellH = ICON_H + labelH + 1; // top/bottom padding
	var cols = Math.max(1, Math.floor((o.width - 2) / cellW));
	var maxIcons = cols * Math.max(1, Math.floor((o.height - 3) / cellH));
	var needRebuild = false;
	if(!this.iconCells || this.iconCells.length===0) needRebuild = true;
	// Rebuild if column count changed or menu length changed
	if(this._iconCols !== cols || (this.iconCells && this.iconCells.length !== this.menuOptions.length)) needRebuild = true;
	if(needRebuild){
		// close old frames
		if(this.iconCells){
			for(var ci=0; ci<this.iconCells.length; ci++){
				try{ this.iconCells[ci].icon.close(); }catch(e){}
				try{ this.iconCells[ci].label.close(); }catch(e){}
			}
		}
		this.iconCells = [];
		for(var i=0; i<this.menuOptions.length && i<maxIcons; i++){
			var col = i % cols;
			var row = Math.floor(i / cols);
			var x = (col * cellW) + 2;
			var y = (row * cellH) + 1; // leave header row
			if(y + ICON_H + labelH > o.height) break;
			var opt = this.menuOptions[i];
			// Provide a label property for Icon class (doesn't mutate baseLabel permanently)
			var item = { label: this.renderOptionLabel(opt,i), iconFile: opt.iconFile, iconBg: opt.iconBg, iconFg: opt.iconFg };
			var iconFrame = new Frame(o.x + x -1, o.y + y -1, ICON_W, ICON_H, BG_BLACK|LIGHTGRAY, o.parent);
			var labelFrame = new Frame(o.x + x -1, o.y + y -1 + ICON_H, ICON_W, labelH, BG_BLACK|LIGHTGRAY, o.parent);
			var iconObj = new Icon(iconFrame, labelFrame, item);
			iconObj.render();
			this.iconCells.push({ icon: iconFrame, label: labelFrame, item: item, iconObj: iconObj });
		}
		this._iconCols = cols;
	}
	// Update labels (dynamic unread count) & selection highlighting
	for(var j=0; j<this.iconCells.length; j++){
		var cell = this.iconCells[j];
		var opt = this.menuOptions[j];
		cell.item.label = this.renderOptionLabel(opt,j);
		cell.iconObj.render(); // re-render to refresh label (small overhead acceptable here)
		// highlight selection on label frame
		try {
			cell.label.clear(j===this.selectedIndex ? (BG_BLUE|WHITE) : (BG_BLACK|LIGHTGRAY));
			cell.label.home();
			var name = cell.item.label || '';
			var start = Math.max(0, Math.floor((cell.icon.width - name.length) / 2));
			var pad = repeatChar(' ', start);
			cell.label.putmsg(pad + name.substr(0, cell.icon.width));
		}catch(e){}
	}
	return { heightUsed: (Math.ceil(this.iconCells.length / cols) * cellH) + 3 };
};

Mail.prototype._addMouseHotspots = function(){
	if(!this.iconCells || !this.iconCells.length) return;
	if(typeof console.add_hotspot !== 'function') return;
	for(var i=0;i<this.iconCells.length && i<9;i++){ // limit to 1-9 for now
		var cell=this.iconCells[i];
		var cmd = String(i+1); // digit key triggers selection+invoke
		var min_x = cell.icon.x;
		var max_x = cell.icon.x + cell.icon.width - 1;
		var min_y = cell.icon.y;
		var max_y = cell.icon.y + cell.icon.height; // include label line below
		for(var y=min_y; y<=max_y; y++){
			// swallow=false to prevent accidental propagation of clicks across gaps
			try { console.add_hotspot(cmd, false, min_x, max_x, y); } catch(e) {}
		}
	}
};

Mail.prototype.ensureIconVisible = function(){};
function pad(str,len,ch){ if(ch===undefined) ch=' '; if(str.length>len) return str.substr(0,len); while(str.length<len) str+=ch; return str; }

Mail.prototype.cleanup = function() {
	this._resetState();
	try { 
		if (typeof console.clear_hotspots === 'function') console.clear_hotspots(); 
	} catch(e){}
	if(this.outputFrame) {
		this.outputFrame.clear();
		this.outputFrame.close(); 
		this.outputFrame = null;
	}
	if(this.inputFrame) {
		this.inputFrame.clear();
		this.inputFrame.close(); 
		this.inputFrame = null;
	}
	if(this.parentFrame) this.parentFrame.cycle();
	Subprogram.prototype.cleanup.call(this);
};

Mail.prototype._resetState = function() {
    this.selectedIndex = 0;
	this.lastMessage = '';
	this.mode = 'icon'; // icon | confirm only
	this.confirmFor = null;
	this.scrollback = [];
	this.scrollOffset = 0;
	this.maxScrollLines = 1000;
	this.outputFrame = null;
	this.inputFrame = null;
};

Mail.prototype.exit = function(){
	log('exiting mail');
	// Clear hotspots registered by this subprogram before delegating
	if (typeof console.clear_hotspots === 'function') { try { console.clear_hotspots(); } catch(e){} }
	this._resetState();
	// Subprogram.exit() will invoke the done callback passed to enter()
	Subprogram.prototype.exit.call(this);
};

// Export constructor globally
this.Mail = Mail;

