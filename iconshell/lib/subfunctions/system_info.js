// System Info Subprogram
// Displays selected properties from global 'system' object.
// Configure the fields to display by editing SYS_INFO_FIELDS below.
// key = property name on global 'system'; value = human-friendly label.
// Order of appearance follows the literal declaration order.

load('iconshell/lib/subfunctions/subprogram.js');

var SYS_INFO_FIELDS = {
	// Top-level properties (simple)
	name: 'BBS Name',
    operator: 'Sysop',
    location: "Location",
    last_useron: 'Last user',
    'stats.logons_today': 'Logons Today',
	'stats.timeon_today': 'Time On Today (mins)',
    uptime: 'Running continually since',
    tz_offset: 'Server time',
    platform: "Platform",
    version: "Synchronet Version",
    nodes: "Nodes",
    git_hash: "Hash",

};

function _getSystemValuePath(path) {
	try {
		if (typeof system === 'undefined' || system === null) return 'n/a';
		if (!path) return 'n/a';
		var parts = path.split('.');
		var cur = system;
		for (var i=0;i<parts.length;i++) {
			if (cur == null) return 'n/a';
			var seg = parts[i];
			if (!Object.prototype.hasOwnProperty.call(cur, seg) && !(seg in cur)) return 'n/a';
			cur = cur[seg];
		}
		if (cur === undefined || cur === null) return 'n/a';
		if (typeof cur === 'function') {
			// If it's a function with zero arity we can attempt to invoke; otherwise tag as function
			try { if (cur.length === 0) { cur = cur(); } else return '[function]'; } catch(e){ return '[function err]'; }
		}
		// Basic friendly formatting for objects
		if (typeof cur === 'object') {
			try { return JSON.stringify(cur); } catch(e) { return '[object]'; }
		}
		return String(cur);
	} catch(e){ return 'err'; }
}

function SystemInfo(opts){
	opts = opts || {};
	Subprogram.call(this, { name: 'system-info', parentFrame: opts.parentFrame, shell: opts.shell });
	this.shell = opts.shell || this.shell;
	this.outputFrame = null;
	this.inputFrame = null;
	this.scrollOffset = 0;
	this.lines = [];
	this.refresh();
}

extend(SystemInfo, Subprogram);

SystemInfo.prototype.refresh = function(){
	var order = [];
	for (var k in SYS_INFO_FIELDS) { if (SYS_INFO_FIELDS.hasOwnProperty(k)) order.push(k); }
	this.lines = [];
	for (var i=0;i<order.length;i++) {
		var key = order[i];
		var label = SYS_INFO_FIELDS[key] || key;
		var val = _getSystemValuePath(key);
		this.lines.push({ label: label, value: val });
	}
	// Timestamp line as structured entry
	try { this.lines.push({ label: 'Updated', value: new Date().toISOString() }); } catch(e) {}
};

SystemInfo.prototype._ensureFrames = function(){
	if (!this.parentFrame) return;
	if (!this.outputFrame) {
		var h = Math.max(1, this.parentFrame.height - 1);
		this.outputFrame = new Frame(1,1,this.parentFrame.width,h, BG_BLACK|LIGHTGRAY, this.parentFrame);
		this.outputFrame.open();
	}
	if (!this.inputFrame) {
		this.inputFrame = new Frame(1,this.parentFrame.height,this.parentFrame.width,1,BG_BLUE|WHITE,this.parentFrame);
		this.inputFrame.open();
	}
};

SystemInfo.prototype.draw = function(){
	this._ensureFrames();
	if(!this.outputFrame || !this.inputFrame) return;
	var o = this.outputFrame; o.clear(); o.gotoxy(1,1);
	o.putmsg('\x01hSystem Information\x01n  (ESC exit)\r\n');
	var usable = o.height - 2; // header + maybe one padding
	if (usable < 1) usable = 1;
	if (this.scrollOffset < 0) this.scrollOffset = 0;
	if (this.scrollOffset > this.lines.length-1) this.scrollOffset = Math.max(0,this.lines.length-1);
	for (var i=0;i<usable;i++) {
		var idx = this.scrollOffset + i;
		if (idx >= this.lines.length) break;
		var entry = this.lines[idx];
		var label = entry.label;
		var value = entry.value;
		// Truncation logic (exclude color codes from width calc)
		var maxWidth = o.width;
		// Reserve space: label + colon + space + value
		var plain = label + ': ' + value;
		if (plain.length > maxWidth) {
			// Try truncating value first
			var overflow = plain.length - maxWidth;
			if (overflow > 0 && value.length > overflow) {
				value = value.substr(0, value.length - overflow);
			} else if (overflow > 0) {
				// If value can't absorb truncation, truncate label (edge case)
				var need = overflow - value.length;
				if (need > 0 && label.length > need) label = label.substr(0, label.length - need);
			}
		}
		var colored = '\x01c' + label + '\x01w:' + ' ' + '\x01h\x01c' + value + '\x01n';
		o.putmsg(colored + '\r\n');
	}
	this._drawInput();
	this.parentFrame.cycle();
};

SystemInfo.prototype._drawInput = function(){
	if(!this.inputFrame) return;
	var f=this.inputFrame; f.clear(); f.gotoxy(1,1);
	var prompt='PgUp/PgDn scroll  R=Refresh  ESC exit';
	if (prompt.length > f.width) prompt = prompt.substr(0,f.width);
	f.putmsg(prompt); f.cycle();
};

SystemInfo.prototype.handleKey = function(k){
	if(!k) return;
	switch(k){
		case '\x1B': // ESC
		case 'Q': case 'q': this.exit(); return;
		case 'R': case 'r': this.refresh(); this.draw(); return;
		case KEY_PGUP: this.scrollOffset -= 3; if(this.scrollOffset<0) this.scrollOffset=0; this.draw(); return;
		case KEY_PGDN: this.scrollOffset += 3; if(this.scrollOffset>this.lines.length-1) this.scrollOffset=this.lines.length-1; this.draw(); return;
	}
};

SystemInfo.prototype.enter = function(done){
	Subprogram.prototype.enter.call(this, done);
	this.draw();
};

SystemInfo.prototype.cleanup = function(){
	try { if(this.outputFrame) this.outputFrame.close(); } catch(e){}
	try { if(this.inputFrame) this.inputFrame.close(); } catch(e){}
	this.outputFrame = null; this.inputFrame = null;
	Subprogram.prototype.cleanup.call(this);
};

this.SystemInfo = SystemInfo;
