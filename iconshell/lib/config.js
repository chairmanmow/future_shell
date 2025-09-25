
load("iconshell/lib/subfunctions/whosonline.js");
load("iconshell/lib/subfunctions/gamesmenu.js");
// Hello World demo subprogram
load("iconshell/lib/subfunctions/hello-world.js");
load("iconshell/lib/subfunctions/file_area.js");
load("iconshell/lib/subfunctions/calendar.js");
load("iconshell/lib/subfunctions/clock.js");
load("iconshell/lib/subfunctions/rawgate.js");
load("iconshell/lib/subfunctions/mail.js");
load("iconshell/lib/subfunctions/system_info.js");
load("iconshell/lib/subfunctions/message_boards.js");
load("iconshell/lib/subfunctions/users.js");
load("iconshell/lib/subfunctions/sysop_commands.js");

// Attempt dynamic configuration via guishell.ini
// INI format example:
// [Menu]
// items = chat,games,apps,who,messages,files,settings,exit
// [Item.chat]\n type=builtin\n label=Chat\n icon=chat\n builtin=chat
// [Item.games]\n type=xtrn_section\n section=1\n label=Games\n icon=games
// [Item.apps]\n type=xtrn_section\n section=0\n label=Apps\n icon=apps
// (Deprecated) legacy who item removed; use builtin + subprogram instead
// [Item.messages]\n type=command\n command=exec_xtrn:ECREADER\n label=Messages\n icon=messages
// [Item.files]\n type=command\n command=exec_xtrn:ANSIVIEW\n label=Files\n icon=folder
// [Item.settings]\n type=builtin\n builtin=settings\n label=Settings\n icon=settings
// [Item.exit]\n type=builtin\n builtin=exit\n label=Exit\n icon=exit
var debug_icsh = false;
function _icsh_log(msg) { try { 
	if(debug_icsh) log(LOG_INFO, '[icsh-config] '+msg);
 } catch(e) {} }
function _icsh_warn(msg){ try {
	if(debug_icsh) log(LOG_WARNING,'[icsh-config] '+msg);
	} catch(e){} }
function _icsh_err(msg) { try { 
	if(debug_icsh) log(LOG_ERR, '[icsh-config] '+msg);
 } catch(e) {} }

// Builtin actions mapping
var BUILTIN_ACTIONS = {
	chat: function(){ this.queueSubprogramLaunch('chat', this.chat); },
	sysop_commands: function(){
		try { if(typeof SysopCommand !== 'function') load('iconshell/lib/subfunctions/sysop_commands.js'); } catch(e) { dbug('subprogram','Failed loading sysop_commands.js '+e); return; }
		if(typeof SysopCommand !== 'function') { dbug('subprogram','SysopCommand class missing after load'); return; }
		if(!this.sysopCommand) this.sysopCommand = new SysopCommand({ parentFrame: this.subFrame, shell: this });
		else { this.sysopCommand.parentFrame = this.root; this.sysopCommand.shell = this; }
		this.queueSubprogramLaunch('sysop-commands', this.sysopCommand);
	},

	// Dedicated IRC chat section (distinct from generic 'chat')
	irc_chat: function(){
		try { if(typeof IrcSection !== 'function') load('iconshell/lib/subfunctions/irc.js'); } catch(e) { dbug('subprogram','Failed loading irc.js '+e); return; }
		if(typeof IrcSection !== 'function') { dbug('subprogram','IrcSection class missing after load'); return; }
		if(!this.ircChatSub) this.ircChatSub = new IrcSection({ parentFrame: this.subFrame, shell: this });
		else { this.ircChatSub.parentFrame = this.root; this.ircChatSub.shell = this; }
		this.queueSubprogramLaunch('irc-chat', this.ircChatSub);
	},
	msg_scan_config: function(){ if (typeof bbs.cfg_msg_scan==='function') {this.runExternal(function(){bbs.cfg_msg_scan()}) }  },
	user_settings: function(){ if (typeof bbs.user_config==='function') {this.runExternal(function(){bbs.user_config()}) }  },
	hello: function(){ if(!this.helloWorld) this.helloWorld = new HelloWorld(); this.queueSubprogramLaunch('hello-world', this.helloWorld); },
	exit: function(){ throw('Exit Shell'); },
	msg_boards: function(){
		try { if(typeof MessageBoard !== 'function') load('iconshell/lib/subfunctions/message_boards.js'); } catch(e) { dbug('subprogram','Failed loading message_boards.js '+e); return; }
		if(typeof MessageBoard !== 'function') { dbug('subprogram','MessageBoard class missing after load'); return; }
		if(!this.msgBoardSub) this.msgBoardSub = new MessageBoard({ parentFrame: this.subFrame, shell: this, timer: this.timer });
		else {
			this.msgBoardSub.parentFrame = this.root;
			this.msgBoardSub.shell = this;
			if(typeof this.msgBoardSub.attachShellTimer === 'function') this.msgBoardSub.attachShellTimer(this.timer);
		}
		this.queueSubprogramLaunch('message-boards', this.msgBoardSub);
	},
	privatemsg: function(){
		try { if(typeof PrivateMsg !== 'function') load('iconshell/lib/subfunctions/private_msg.js'); } catch(e) { dbug('subprogram', 'Failed loading private_msg.js '+e); return; }
		if(typeof PrivateMsg !== 'function') { dbug('subprogram','PrivateMsg class missing after load'); return; }
		if(!this.privateMsg) this.privateMsg = new PrivateMsg({ parentFrame: this.subFrame });
		// always reassign parentFrame in case shell recreated frames
		this.privateMsg.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('private-msg', this.privateMsg);
	},
	users: function(){
		try { if(typeof Users !== 'function') load('iconshell/lib/subfunctions/users.js'); } catch(e) { dbug('subprogram','Failed loading user_list.js '+e); return; }
		if(typeof Users !== 'function') { dbug('subprogram','Users class missing after load'); return; }
		if(!this.Users) this.Users = new Users({ parentFrame: this.subFrame });
		this.Users.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('users', this.Users);
	},
	userlist: function(){
		try { if(typeof UserList !== 'function') load('iconshell/lib/subfunctions/user_list.js'); } catch(e) { dbug('subprogram','Failed loading user_list.js '+e); return; }
		if(typeof UserList !== 'function') { dbug('subprogram','UserList class missing after load'); return; }
		if(!this.userList) this.userList = new UserList({ parentFrame: this.subFrame });
		this.userList.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('user-list', this.userList);
	},
	filearea: function(){
		try { if(typeof FileArea !== 'function') load('iconshell/lib/subfunctions/file_area.js'); } catch(e) { dbug('subprogram','Failed loading file_area.js '+e); return; }
		if(typeof FileArea !== 'function') { dbug('subprogram','FileArea class missing after load'); return; }
		if(!this.fileArea) this.fileArea = new FileArea({ parentFrame: this.subFrame });
		// this.fileArea.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('file-area', this.fileArea);
	},
	calendar: function(){
		try { if(typeof CalendarSub !== 'function') load('iconshell/lib/subfunctions/calendar.js'); } catch(e) { dbug('subprogram','Failed loading calendar.js '+e); return; }
		if(typeof CalendarSub !== 'function') { dbug('subprogram','CalendarSub class missing after load'); return; }
		if(!this.calendarSub) this.calendarSub = new CalendarSub({ parentFrame: this.subFrame });
		this.calendarSub.setParentFrame && this.calendarSub.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('calendar', this.calendarSub);
	},
	clock: function(){
		try { if(typeof ClockSub !== 'function') load('iconshell/lib/subfunctions/clock.js'); } catch(e) { dbug('subprogram','Failed loading clock.js '+e); return; }
		if(typeof ClockSub !== 'function') { dbug('subprogram','ClockSub class missing after load'); return; }
		if(!this.clockSub) this.clockSub = new ClockSub({ parentFrame: this.subFrame, shell: this });
		else this.clockSub.setParentFrame && this.clockSub.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('clock', this.clockSub);
	},
	rawgate: function(){
		try { if(typeof RawGateSub !== 'function') load('iconshell/lib/subfunctions/rawgate.js'); } catch(e) { dbug('subprogram','Failed loading rawgate.js '+e); return; }
		if(typeof RawGateSub !== 'function') { dbug('subprogram','RawGateSub class missing after load'); return; }
		if(!this.rawGateSub) this.rawGateSub = new RawGateSub({ parentFrame: this.subFrame, shell: this });
		else this.rawGateSub.setParentFrame && this.rawGateSub.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('rawgate', this.rawGateSub);
	},
	mail: function(){
		try { if(typeof Mail !== 'function') load('iconshell/lib/subfunctions/mail.js'); } catch(e) { dbug('subprogram','Failed loading mail.js '+e); return; }
		if(typeof Mail !== 'function') { dbug('subprogram','Mail class missing after load'); return; }
		if(!this.mailSub) this.mailSub = new Mail({ parentFrame: this.subFrame, shell: this });
		else { this.mailSub.parentFrame = this.root; this.mailSub.shell = this; }
		this.queueSubprogramLaunch('mail', this.mailSub);
	},
	sysinfo: function(){
		try { if(typeof SystemInfo !== 'function') load('iconshell/lib/subfunctions/system_info.js'); } catch(e) { dbug('subprogram','Failed loading system_info.js '+e); return; }
		if(typeof SystemInfo !== 'function') { dbug('subprogram','SystemInfo class missing after load'); return; }
		if(!this.systemInfoSub) this.systemInfoSub = new SystemInfo({ parentFrame: this.subFrame, shell: this });
		else { this.systemInfoSub.parentFrame = this.root; this.systemInfoSub.shell = this; }
		this.queueSubprogramLaunch('system-info', this.systemInfoSub);
	},
	who_list: function(){
		try { if(typeof WhoOnline !== 'function') load('iconshell/lib/subfunctions/whosonline.js'); } catch(e) { dbug('subprogram','Failed loading whosonline.js '+e); return; }
		if(typeof WhoOnline !== 'function') { dbug('subprogram','WhoOnline class missing after load'); return; }
		if(!this.whoOnlineSub) this.whoOnlineSub = new WhoOnline({ parentFrame: this.subFrame, shell: this });
		else { this.whoOnlineSub.parentFrame = this.root; this.whoOnlineSub.shell = this; }
		this.queueSubprogramLaunch('who-online', this.whoOnlineSub);
	},
};

function readIniFile(path) {
	var f = new File(path);
	if(!f.exists) return null;
	if(!f.open('r')) return null;
	var text = f.readAll().join('\n');
	f.close();
	return text;
}

// Very small INI parser sufficient for our sections/keys (case-insensitive section names)
function parseIni(raw) {
	var data = {};
	var cur = null;
	var lines = raw.split(/\r?\n/);
	for(var i=0;i<lines.length;i++) {
		var ln = lines[i].trim();
		if(!ln || ln.charAt(0)===';' || ln.charAt(0)==='#') continue;
		var mSec = ln.match(/^\[(.+?)\]$/);
		if(mSec) { cur = mSec[1]; data[cur] = data[cur] || {}; continue; }
		if(!cur) continue;
		var eq = ln.indexOf('=');
		if(eq === -1) continue;
		var k = ln.substring(0,eq).trim();
		var v = ln.substring(eq+1).trim();
		data[cur][k] = v;
	}
	return data;
}


// Enumerate known external program codes (best-effort; varies by Synchronet version)
function _listExternalCodes() {
	var codes = [];
	try {
		if (system && system.xtrn_area && system.xtrn_area.length) {
			for (var i=0;i<system.xtrn_area.length;i++) {
				var area = system.xtrn_area[i];
				if (!area) continue;
				// Common property naming: area.xtrn (array of program objects)
				if (area.xtrn && area.xtrn.length) {
					for (var j=0;j<area.xtrn.length;j++) {
						var prog = area.xtrn[j];
						if (prog && prog.code) codes.push(prog.code);
					}
				}
				// Fallback: sometimes prog_list or programs might exist
				if (area.prog_list && area.prog_list.length) {
					for (var k=0;k<area.prog_list.length;k++) {
						var p2 = area.prog_list[k];
						if (p2 && p2.code && codes.indexOf(p2.code)===-1) codes.push(p2.code);
					}
				}
			}
		}
	} catch(e) { /* swallow */ }
	return codes;
}

function _externalExists(code) {
	var list = _listExternalCodes();
	if (!list.length) return true; // Can't verify -> assume OK
	return list.indexOf(code) !== -1;
}

function _informUser(shell, msg) {
	try {
		if (shell && typeof shell.showToast === 'function') {
			shell.showToast({ message: msg });
		} else if (typeof console !== 'undefined' && console.putmsg) {
			console.putmsg('\r\n'+msg+'\r\n');
		}
	} catch(e) {}
}

function makeExecXtrnAction(code) {
	code = (code||'').trim();
	if (code.charAt(0) === ":")
        code =  code.substring(1);
	return function() {
		var self = this;
		try {
			if (!code) {
				_icsh_err('Empty external program code specified');
				_informUser(self, 'No program code specified');
				return;
			}
			if (!_externalExists(code)) {
				var avail = _listExternalCodes();
				_icsh_err('Invalid external program specified: ' + code + (avail.length? (' (available: '+avail.join(', ')+')') : '')); 
				_informUser(self, 'Program not found: ' + code);
				return;
			}
			self.runExternal(function(){
				try {
					bbs.exec_xtrn(code);
				} catch(ex) {
					_icsh_err('exec_xtrn('+code+') failed: ' + ex);
					_informUser(self, 'Launch failed: ' + code);
				}
			});
		} catch(e) {
			_icsh_err('Unhandled error launching external '+code+': '+e);
			_informUser(self, 'Error launching: '+code);
		}
	};
}

function makeCommandAction(spec) {
	if(!spec) return null;
	if(spec.indexOf('exec_xtrn:')===0) {
		var code = spec.substring(9).trim();
		return makeExecXtrnAction(code);
	}
	// Shorthand: leading ':' means external door code (":ECREADER" -> ECREADER)
	if (spec.charAt(0) === ':' && spec.length > 1) {
		return makeExecXtrnAction(spec.substring(1).trim());
	}
	// Shorthand: bare word with no spaces & no prefix assumed to be external code
	if (/^[A-Za-z0-9_]{2,}$/.test(spec)) {
		return makeExecXtrnAction(spec.trim());
	}
	if(spec.indexOf('js:')===0) {
		var body = spec.substring(3);
		try { var fn = new Function(body); return function(){ fn.call(this); }; } catch(e) { _icsh_err('Bad js command: '+e); return null; }
	}
	_icsh_warn('Unknown command spec '+spec);
	return null;
}

// Recursive builder for items (supports new type=folder with nested items list)
function _buildItemRecursive(key, ini, ancestry) {
	ancestry = ancestry || [];
	if(ancestry.indexOf(key)!==-1) { _icsh_warn('Cycle detected for item '+key+' path '+ancestry.join('>')); return null; }
	var sect = ini['Item.'+key];
	if(!sect) { _icsh_warn('Missing section [Item.'+key+']'); return null; }
	// Access gating check (inline, minimal) – returns true if allowed or user data not ready
	function _allow(sect){
		// Centralize user level resolution (prefer security.level if present)
		function _usrLvl(){
			if (typeof user === 'undefined') return null;
			if (user.security && typeof user.security.level === 'number') return user.security.level;
			if (typeof user.level === 'number') return user.level;
			return null;
		}
		var ulev = _usrLvl();
		if (ulev === null) { _icsh_err('user object missing or no usable level (security.level / level) during gating; denying item'); return false; }
		if (sect.min_level !== undefined) { var ml=parseInt(sect.min_level,10); if(!isNaN(ml) && ulev < ml) return false; }
		if (sect.require_sysop !== undefined && /^(1|true|yes)$/i.test(sect.require_sysop)) {
			var isSys = (user.is_sysop===true)||(user.security&&user.security.level>=90)||ulev>=90; if(!isSys) return false;
		}
		if (sect.require_flag !== undefined) {
			var f=(''+sect.require_flag).trim().toUpperCase();
			if(f.length===1){ var sets=[user.flags1,user.flags2,user.flags3,user.flags4]; var ok=false; for(var i=0;i<sets.length && !ok;i++) if(sets[i]&&sets[i].indexOf(f)!==-1) ok=true; if(!ok && user.security){ var ss=user.security; var more=[ss.flags1,ss.flags2,ss.flags3,ss.flags4]; for(var m=0;m<more.length && !ok;m++) if(more[m]&&more[m].indexOf(f)!==-1) ok=true; } if(!ok) return false; }
		}
		return true;
	}
	if(!_allow(sect)) { _icsh_log('Filtered (gating) '+key); return null; }
	var type = (sect.type||'').toLowerCase();
	var label = sect.label || key.charAt(0).toUpperCase()+key.substring(1);
	var icon = sect.icon || key;
	var obj = { label: label, iconFile: icon };
	// Lightweight gating metadata copied directly (evaluation deferred to one central filter)
	if(sect.min_level!==undefined) obj.min_level = parseInt(sect.min_level,10);
	if(sect.require_sysop!==undefined) obj.require_sysop = /^(1|true|yes)$/i.test(sect.require_sysop);
	if(sect.require_flag!==undefined) obj.require_flag = (''+sect.require_flag).trim().toUpperCase();
	if(type === 'builtin') {
		var bname = (sect.builtin||'').toLowerCase();
		var act = BUILTIN_ACTIONS[bname];
		if(!act) { _icsh_warn('Unknown builtin '+bname+' for item '+key); return null; }
		obj.type='item'; obj.action = act;
		return obj;
	}
	if(type === 'command') {
		var actSpec = sect.command;
		var actionFn = makeCommandAction(actSpec);
		if(!actionFn) { _icsh_warn('Invalid command action for '+key); return null; }
		obj.type='item'; obj.action = actionFn; return obj;
	}
	if(type === 'xtrn_section') {
		var secNum = parseInt(sect.section,10);
		if(isNaN(secNum) || secNum < 0) { _icsh_warn('Bad section number for '+key); return null; }
		obj.type='folder';
		(function(secNumRef){ Object.defineProperty(obj,'children',{ configurable:true, enumerable:true, get:function(){ return getItemsForXtrnSection(secNumRef); }}); })(secNum);
		return obj;
	}
	if(type === 'folder') {
		obj.type='folder';
		var listRaw = sect.items || sect.children || '';
		if(!listRaw) { _icsh_warn('Folder '+key+' has no items list'); obj.children = []; return obj; }
		var childKeys = listRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
		var kids = [];
		for(var i=0;i<childKeys.length;i++) {
			var ck = childKeys[i];
			var childObj = _buildItemRecursive(ck, ini, ancestry.concat([key]));
			if(childObj) kids.push(childObj);
		}
		obj.children = kids;
		return obj;
	}
	_icsh_warn('Unknown type '+type+' for item '+key);
	return null;
}

function buildDynamicConfig() {
	var iniRaw = readIniFile(system.mods_dir + 'guishell.ini');
	if(!iniRaw) { _icsh_warn('guishell.ini not found – using static config'); return null; }
	var ini = parseIni(iniRaw);
	if(!ini.Menu || !ini.Menu.items) { _icsh_warn('No [Menu]/items in guishell.ini'); return null; }
	var order = ini.Menu.items.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
	if(!order.length) { _icsh_warn('Empty items list in [Menu]'); return null; }
	var children = [];
	for(var i=0;i<order.length;i++) {
		var built = _buildItemRecursive(order[i], ini, []);
		if(built) children.push(built);
	}
	if(!children.length) { _icsh_warn('No valid menu items built; fallback to static'); return null; }
	// Concise gating filter (single pass)
	// Post-build filter (only if we have a resolvable user level). Uses same logic as _allow but on built objects.
	function _userLevel(){ if(typeof user==='undefined') return null; if(user.security && typeof user.security.level==='number') return user.security.level; if(typeof user.level==='number') return user.level; return null; }
	var __ulev = _userLevel();
	if(__ulev !== null){
		children = children.filter(function(c){
			if(c.min_level!==undefined && !isNaN(c.min_level) && __ulev < c.min_level) return false;
			if(c.require_sysop){ var isSys = (user.is_sysop===true)||(user.security&&user.security.level>=90)||__ulev>=90; if(!isSys) return false; }
			if(c.require_flag && c.require_flag.length===1){
				var sets=[user.flags1,user.flags2,user.flags3,user.flags4]; var ok=false;
				for(var i=0;i<sets.length && !ok;i++) if(sets[i] && typeof sets[i]==='string' && sets[i].indexOf(c.require_flag)!==-1) ok=true;
				if(!ok && user.security){ var ss=user.security; var more=[ss.flags1,ss.flags2,ss.flags3,ss.flags4]; for(var m=0;m<more.length && !ok;m++) if(more[m] && typeof more[m]==='string' && more[m].indexOf(c.require_flag)!==-1) ok=true; }
				if(!ok) return false;
			}
			return true;
		});
	}
	_icsh_log('Dynamic menu built with '+children.length+' top-level items (folders supported)');
	return { label:'Home', type:'folder', children: children };
}

var _DYNAMIC_ICSH_CONFIG = buildDynamicConfig();

// Global shell settings (e.g., inactivity -> matrix rain) loaded from guishell.ini if present.
var ICSH_SETTINGS = (function(){
	var out = { inactivitySeconds: 180, inactivityMinutes: 3 }; // default 3 minutes
	function _parseBool(val){
		if(val === undefined || val === null) return undefined;
		var s = String(val).trim().toLowerCase();
		if(!s) return undefined;
		if(s === 'true' || s === 'yes' || s === 'on' || s === '1') return true;
		if(s === 'false' || s === 'no' || s === 'off' || s === '0') return false;
		return undefined;
	}
	function _parseNumber(val){
		if(val === undefined || val === null) return undefined;
		var s = String(val).trim();
		if(!s) return undefined;
		if(!/^[-+]?\d*(?:\.\d+)?$/.test(s)) return undefined;
		var n = parseFloat(s);
		return isNaN(n) ? undefined : n;
	}
	function _sanitiseName(name){
		return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_\-]+/g,'').replace(/-/g,'_');
	}
	try {
		var iniRaw = readIniFile(system.mods_dir + 'guishell.ini');
		if(iniRaw){
			var ini = parseIni(iniRaw);
			// Allow either [Shell]/[Idle]/[GuiShell] sections with inactivity_seconds or inactivity_minutes (legacy)
			var secVal = null;
			if(ini.Shell && ini.Shell.inactivity_seconds !== undefined) secVal = ini.Shell.inactivity_seconds;
			else if(ini.Idle && ini.Idle.inactivity_seconds !== undefined) secVal = ini.Idle.inactivity_seconds;
			else if(ini.GuiShell && ini.GuiShell.inactivity_seconds !== undefined) secVal = ini.GuiShell.inactivity_seconds;
			if(secVal !== null){
				var secs = parseInt(secVal, 10);
				if(!isNaN(secs)){
					out.inactivitySeconds = secs;
				}
			}
			else {
				var minVal = null;
				if(ini.Shell && ini.Shell.inactivity_minutes !== undefined) minVal = ini.Shell.inactivity_minutes;
				else if(ini.Idle && ini.Idle.inactivity_minutes !== undefined) minVal = ini.Idle.inactivity_minutes;
				else if(ini.GuiShell && ini.GuiShell.inactivity_minutes !== undefined) minVal = ini.GuiShell.inactivity_minutes; // backwards compat / existing section
				if(minVal !== null){
					var mins = parseInt(minVal,10);
					if(!isNaN(mins)) out.inactivitySeconds = mins < 0 ? -1 : mins * 60;
				}
			}
			if(out.inactivitySeconds === -1) out.inactivityMinutes = -1;
			else out.inactivityMinutes = Math.round(out.inactivitySeconds / 60);
			if(ini.Screensaver){
				var ss = ini.Screensaver;
				var cfg = {};
				if(ss.animations){
					cfg.animations = ss.animations.split(',').map(function(n){ return _sanitiseName(n); }).filter(Boolean);
				}
				if(ss.random !== undefined){
					var b = _parseBool(ss.random);
					if(b !== undefined) cfg.random = b;
				}
				if(ss.switch_interval !== undefined){
					var si = _parseNumber(ss.switch_interval);
					if(si !== undefined) cfg.switch_interval = Math.max(0, si|0);
				}
				if(ss.fps !== undefined){
					var fps = _parseNumber(ss.fps);
					if(fps !== undefined) cfg.fps = Math.max(1, fps|0);
				}
				if(ss.clear_on_switch !== undefined){
					var cos = _parseBool(ss.clear_on_switch);
					if(cos !== undefined) cfg.clear_on_switch = cos;
				}
				// animation-specific overrides using dot notation e.g. life.density=0.25
				var animOpts = {};
				for(var key in ss){
					if(!Object.prototype.hasOwnProperty.call(ss,key)) continue;
					if(key.indexOf('.') === -1) continue;
					var parts = key.split('.');
					var animName = _sanitiseName(parts.shift());
					var optName = parts.join('.');
					if(!animName || !optName) continue;
					if(!animOpts[animName]) animOpts[animName] = {};
					var raw = ss[key];
					var boolVal = _parseBool(raw);
					if(boolVal !== undefined) animOpts[animName][optName] = boolVal;
					else {
						var numVal = _parseNumber(raw);
						if(numVal !== undefined) animOpts[animName][optName] = numVal;
						else animOpts[animName][optName] = raw;
					}
				}
				if(Object.keys(animOpts).length) cfg.animationOptions = animOpts;
				if(Object.keys(cfg).length) out.screensaver = cfg;
			}
		}
	} catch(e){ _icsh_warn('Error loading ICSH_SETTINGS: '+e); }
	return out;
})();


// Centralized color configuration for IconShell
// ====================================================================
// Central color registry (semantic keys) – every UI surface gets a
// distinct key even if its colors match another, so they can diverge
// later without touching code. All are overrideable via [Colors].
// ====================================================================
var ICSH_VALS = {
	// Shell core (legacy names kept for backwards compatibility)
	ROOT:                 { BG: BG_BLACK,     FG: WHITE },
	VIEW:                 { BG: BG_BLACK,     FG: LIGHTGRAY },
	CRUMB:                { BG: BG_BLUE,      FG: WHITE },
	SELECTED:             { BG: BG_BLUE,      FG: WHITE },
	LABEL:                { BG: BG_BLACK,     FG: LIGHTGRAY },
	UPITEM:               { BG: BG_LIGHTGRAY, FG: BLACK },
	MOUSE_ON:             { BG: BG_BLUE,      FG: WHITE },
	MOUSE_OFF:            { BG: BG_RED,       FG: WHITE },
	ANIMATION:            { COLOR: GREEN },
	EXTERNAL_BG:          BG_BLACK,         // primitive numeric allowed
	EXTERNAL_FG:          LIGHTGRAY,

	// Generic / shared surfaces
	FRAME_STANDARD:       { BG: BG_BLACK,     FG: LIGHTGRAY },
	STATUS_BAR:           { BG: BG_BLUE,      FG: WHITE },
	INPUT_BAR:            { BG: BG_BLUE,      FG: WHITE },
	HEADER_BAR:           { BG: BG_BLUE,      FG: WHITE },
	FOOTER_BAR:           { BG: BG_BLUE,      FG: WHITE },
	SELECTION_INVERT:     { BG: BG_LIGHTGRAY, FG: BLACK },
	HILITE_CYAN:          { BG: BG_CYAN,      FG: WHITE },
	POPUP_FRAME:          { BG: BG_BLACK,     FG: WHITE },
	POPUP_CONTENT:        { BG: BG_BLACK,     FG: LIGHTGRAY },
	MODAL_FRAME:          { BG: BG_BLUE,      FG: WHITE },
	MODAL_LEFT_PANEL:     { BG: BG_CYAN,      FG: LIGHTGRAY },
	MODAL_RIGHT_PANEL:    { BG: BG_BLUE,      FG: LIGHTGRAY },

	// Users / Who listings
	USERS_LIST:           { BG: BG_BLACK,     FG: LIGHTGRAY },
	USERS_STATUS:         { BG: BG_BLUE,      FG: WHITE },
	USERS_MODAL:          { BG: BG_BLUE,      FG: WHITE },
	USERS_MODAL_AVATAR:   { BG: BG_BLUE,      FG: WHITE },
	WHOS_LIST:            { BG: BG_BLACK,     FG: LIGHTGRAY },
	WHOS_STATUS:          { BG: BG_BLUE,      FG: WHITE },
	WHOS_TILE_BG:         { BG: BG_BLACK,     FG: LIGHTGRAY },
	WHOS_TILE_BG_SELECTED:{ BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_HEADER:     { BG: BG_BLUE,      FG: WHITE },
	WHOS_TILE_HEADER_SELECTED:{ BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_NAME:       { BG: BG_BLUE,      FG: WHITE },
	WHOS_TILE_NAME_SELECTED:{ BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_FOOTER:     { BG: BG_BLUE,      FG: WHITE },
	WHOS_MODAL:           { BG: BG_BLUE,      FG: WHITE },
	WHOS_MODAL_LEFT:      { BG: BG_CYAN,      FG: LIGHTGRAY },
	WHOS_MODAL_RIGHT:     { BG: BG_BLUE,      FG: LIGHTGRAY },

	// Message Boards
	MB_OUTPUT:            { BG: BG_BLACK,     FG: LIGHTGRAY },
	MB_INPUT:             { BG: BG_BLUE,      FG: WHITE },
	MB_READ_HEADER:       { BG: BG_BLUE,      FG: WHITE },
	MB_READ_BODY:         { BG: BG_BLACK,     FG: LIGHTGRAY },
	MB_LABEL:             { BG: BG_BLACK,     FG: LIGHTGRAY },
	MB_LABEL_SELECTED:    { BG: BG_LIGHTGRAY, FG: BLACK },
	MB_ICON_MOD:          { BG: BG_RED,       FG: WHITE },
	MB_ICON_SECTION:      { BG: BG_BLUE,      FG: WHITE },
	MB_ICON_SYS:          { BG: BG_GREEN,     FG: WHITE },
	MB_ICON_MISC:         { BG: BG_CYAN,      FG: WHITE },

	// Mail
	MAIL_OUTPUT:          { BG: BG_BLACK,     FG: LIGHTGRAY },
	MAIL_INPUT:           { BG: BG_BLUE,      FG: WHITE },
	MAIL_PROMPT_GUIDE:    { BG: BG_BLACK,     FG: MAGENTA },
	MAIL_PROMPT_LABEL:    { BG: BG_BLACK,     FG: YELLOW },
	MAIL_PROMPT_FIELD:    { BG: BG_BLUE,      FG: WHITE },
	MAIL_ICON:            { BG: BG_BLACK,     FG: LIGHTGRAY },
	MAIL_ICON_SELECTED:   { BG: BG_BLUE,      FG: WHITE },

	// File Area
	FILE_HEADER:          { BG: BG_BLUE,      FG: WHITE },
	FILE_FOOTER:          { BG: BG_BLUE,      FG: WHITE },
	FILE_LIST:            { BG: BG_BLACK,     FG: LIGHTGRAY },
	FILE_LIST_ACTIVE:     { BG: BG_CYAN,      FG: WHITE },
	FILE_LIST_INACTIVE:   { BG: BG_BLACK,     FG: LIGHTGRAY },
	FILE_POPUP:           { BG: BG_BLACK,     FG: WHITE },
	FILE_POPUP_CONTENT:   { BG: BG_BLACK,     FG: LIGHTGRAY },

	// Calendar
	CAL_HEADER:           { BG: BG_BLUE,      FG: WHITE },
	CAL_FOOTER:           { BG: BG_BLUE,      FG: WHITE },
	CAL_GRID:             { BG: BG_BLACK,     FG: LIGHTGRAY },
	CAL_DAY_SELECTED:     { BG: BG_CYAN,      FG: WHITE },
	CAL_DAY_TODAY:        { BG: BG_BLUE,      FG: WHITE },
	CAL_DAY_HOLIDAY:      { BG: BG_GREEN,     FG: WHITE },
	CAL_DAY_NORMAL:       { BG: BG_BLACK,     FG: LIGHTGRAY },

	// Chat / IRC / Private / Generic text subs
	CHAT_OUTPUT:          { BG: BG_BLACK,     FG: LIGHTGRAY },
	CHAT_INPUT:           { BG: BG_BLUE,      FG: WHITE },
	PRIVMSG_OUTPUT:       { BG: BG_BLACK,     FG: LIGHTGRAY },
	PRIVMSG_INPUT:        { BG: BG_BLUE,      FG: WHITE },
	IRC_LIST:             { BG: BG_BLACK,     FG: LIGHTGRAY },
	IRC_STATUS:           { BG: BG_BLUE,      FG: WHITE },
	RAW_OUTPUT:           { BG: BG_BLACK,     FG: LIGHTGRAY },
	RAW_INPUT:            { BG: BG_BLUE,      FG: WHITE },
	SYSINFO_OUTPUT:       { BG: BG_BLACK,     FG: LIGHTGRAY },
	SYSINFO_INPUT:        { BG: BG_BLUE,      FG: WHITE },
	HELLO_OUTPUT:         { BG: BG_BLACK,     FG: LIGHTGRAY },
	HELLO_INPUT:          { BG: BG_BLUE,      FG: WHITE },

	// Toast / notifications
	TOAST_FRAME:          { BG: BG_BLACK,     FG: LIGHTGRAY },
	TOAST_MSG:            { BG: BG_MAGENTA,   FG: WHITE },
	TOAST_AVATAR:         { BG: BG_BLACK,     FG: WHITE },

	// Clock
	CLOCK_BG:             { BG: BG_BLACK,     FG: LIGHTGRAY },

	// Matrix rain effect (head & fading segments)
	RAIN_HEAD:            { BG: BG_BLACK,     FG: LIGHTGREEN },
	RAIN_FADE_HIGH:       { BG: BG_BLACK,     FG: GREEN },
	RAIN_SPARK:           { BG: BG_BLACK,     FG: WHITE },
	RAIN_DIM1:            { BG: BG_BLACK,     FG: LIGHTGRAY },
	RAIN_DIM2:            { BG: BG_BLACK,     FG: DARKGRAY }
};

// Helper: resolve full attribute (BG|FG) from semantic key
function ICSH_ATTR(key){
	var g = ICSH_VALS[key];
	if(g === undefined) return WHITE; // fallback
	if(typeof g === 'number') return g; // primitive
	var bg = g.BG || 0; var fg = g.FG || 0; return bg | fg;
}

// Color override loader: allows redefining colors via [Colors] section in guishell.ini
// Supported syntaxes (case-insensitive keys):
//   [Colors]
//   ROOT = BLUE,WHITE              ; sets BG,FG (BG token can optionally have BG_ prefix)
//   VIEW.BG = BLACK                ; sets only background
//   VIEW.FG = LIGHTGRAY            ; sets only foreground
//   SELECTED_BG = BLUE             ; underscore form
//   LABEL_FG = YELLOW              ; underscore form for FG
//   ANIMATION.COLOR = GREEN        ; single COLOR-style entry objects (e.g. ANIMATION)
//   ANIMATION = CYAN               ; shorthand for ANIMATION.COLOR
// Notes:
//   - Tokens map to Synchronet color constants; BG_ prefix optional for backgrounds.
//   - If a single token is supplied for an entry having BG/FG and no attribute specified, it's treated as FG.
//   - Invalid tokens are logged and ignored.
function applyColorOverrides(vals){
	try {
		var iniRaw = readIniFile(system.mods_dir + 'guishell.ini');
		if(!iniRaw) return; // no file
		var ini = parseIni(iniRaw);
		if(!ini || (!ini.Colors && !ini.colors)) return; // no section
		var sect = ini.Colors || ini.colors;

		function lookupColor(token, isBg){
			if(token===undefined||token===null) return null;
			token = (''+token).trim();
			if(token==='') return null;
			// Allow numeric values directly
			if(/^[0-9]+$/.test(token)) return parseInt(token,10);
			var up = token.toUpperCase();
			// If already has BG_ prefix and we're resolving BG, try directly first
			var candidates = [];
			if(isBg){
				if(up.indexOf('BG_')===0) candidates.push(up); else candidates.push('BG_'+up);
				// fallback to raw (maybe user specified actual BG_* constant name incorrectly flagged as FG)
				if(up.indexOf('BG_')!==0) candidates.push(up);
			} else {
				// Foreground: prefer raw name first
				candidates.push(up);
				// If they specified a BG_ token for FG by mistake, skip adding BG_ variant
			}
			for(var i=0;i<candidates.length;i++){
				var name = candidates[i];
				try { if(eval('typeof '+name+' !== "undefined"')) { var v = eval(name); if(typeof v==='number') return v; } } catch(e){}
			}
			return null;
		}

		function setPair(baseKey, bgVal, fgVal){
			if(!vals[baseKey] || typeof vals[baseKey] !== 'object') return;
			if(bgVal!==null){ vals[baseKey].BG = bgVal; _icsh_log('Color override '+baseKey+'.BG applied'); }
			if(fgVal!==null){ vals[baseKey].FG = fgVal; _icsh_log('Color override '+baseKey+'.FG applied'); }
		}

		for(var rawKey in sect){
			if(!sect.hasOwnProperty(rawKey)) continue;
			var value = sect[rawKey];
			if(value===undefined||value===null) continue;
			var key = rawKey.trim();
			if(key==='') continue;
			var upKey = key.toUpperCase();
			var base = null, target = null; // target: BG|FG|COLOR|null
			if(upKey.indexOf('.')!==-1){
				var parts = upKey.split('.');
				base = parts[0]; target = parts[1];
			} else if(/_(BG|FG|COLOR)$/.test(upKey)){
				if(upKey.endsWith('_BG')) { base = upKey.slice(0,-3); target='BG'; }
				else if(upKey.endsWith('_FG')) { base = upKey.slice(0,-3); target='FG'; }
				else if(upKey.endsWith('_COLOR')) { base = upKey.slice(0,-6); target='COLOR'; }
			} else {
				base = upKey;
			}
			if(!vals.hasOwnProperty(base)) { _icsh_warn('Color override references unknown group '+base); continue; }
			// If group is a primitive numeric (EXTERNAL_BG/EXTERNAL_FG), allow direct numeric/constant replacement
			if(typeof vals[base] === 'number'){
				var prim = lookupColor(value, /_BG$|\.BG$/.test(upKey));
				if(prim!==null){ vals[base] = prim; _icsh_log('Color override '+base+'='+value); }
				else _icsh_warn('Invalid color token '+value+' for '+base);
				continue;
			}
			if(target){
				var isBg = (target==='BG');
				if(target==='COLOR'){
					var col = lookupColor(value,false);
					if(col!==null){ vals[base].COLOR = col; _icsh_log('Color override '+base+'.COLOR='+value); }
					else _icsh_warn('Invalid COLOR token '+value+' for '+base);
				} else { // BG or FG
					var col2 = lookupColor(value,isBg);
					if(col2!==null){ vals[base][target] = col2; _icsh_log('Color override '+base+'.'+target+'='+value); }
					else _icsh_warn('Invalid '+target+' token '+value+' for '+base);
				}
				continue;
			}
			// No explicit target: either BG,FG pair or single token.
			if(base==='ANIMATION'){
				// Shorthand for ANIMATION.COLOR
				var c = lookupColor(value,false);
				if(c!==null){ vals.ANIMATION.COLOR = c; _icsh_log('Color override ANIMATION.COLOR='+value); }
				else _icsh_warn('Invalid ANIMATION color '+value);
				continue;
			}
			// BG,FG pair separated by comma
			if(value.indexOf(',')!==-1){
				var pair = value.split(',');
				var bg = lookupColor(pair[0], true);
				var fg = lookupColor(pair[1], false);
				if(bg===null) _icsh_warn('Invalid BG token "'+pair[0]+'" for '+base);
				if(fg===null) _icsh_warn('Invalid FG token "'+pair[1]+'" for '+base);
				setPair(base, bg, fg);
			} else {
				// Single token -> FG preference, unless group only has COLOR
				if(vals[base] && typeof vals[base]==='object'){
					if('FG' in vals[base]){
						var fgOnly = lookupColor(value,false);
						if(fgOnly!==null){ vals[base].FG = fgOnly; _icsh_log('Color override '+base+'.FG='+value); }
						else _icsh_warn('Invalid FG token '+value+' for '+base);
					} else if('COLOR' in vals[base]) {
						var conly = lookupColor(value,false);
						if(conly!==null){ vals[base].COLOR = conly; _icsh_log('Color override '+base+'.COLOR='+value); }
						else _icsh_warn('Invalid COLOR token '+value+' for '+base);
					}
				}
			}
		}
	} catch(e){ _icsh_warn('applyColorOverrides error: '+e); }
}

// Apply overrides at load time (silent if no [Colors] section present)
applyColorOverrides(ICSH_VALS);

// IconShell configuration: menu structure, labels, icons, and actions
var ICSH_CONFIG = _DYNAMIC_ICSH_CONFIG || {
	// Static fallback (original definition) without fixed viewIds; runtime assigns
	label: "Home",
	type: "folder",
	children: [
		{ label: "Chat", type: "item", iconFile: "chat", action: BUILTIN_ACTIONS.chat },
		{ label: "Games", type: "folder", iconFile: "games", get children(){ return getItemsForXtrnSection(1);} },
		{ label: "Apps", type: "folder", iconFile: "apps", get children(){ return getItemsForXtrnSection(0);} },
		{ label: "Messages", type: "item", iconFile:"messages", action: makeExecXtrnAction("ECREADER") },
		{ label: "Mail", type: "item", iconFile:"mail", dynamic:true, action: BUILTIN_ACTIONS.mail },
		{ label: "Files", type: "item", iconFile:"folder", action: makeExecXtrnAction("ANSIVIEW") },
		{ label: "Who", type: "folder", iconFile:"whosonline", get children(){
			try {
				if(typeof WhoOnline !== 'function') load('iconshell/lib/subfunctions/whosonline.js');
				if(typeof WhoOnline !== 'function') return [];
				if (typeof global !== 'undefined' && global.__icsh_shell && global.__icsh_shell.whoOnlineSub)
					return global.__icsh_shell.whoOnlineSub.getOnlineUserIcons();
				if(!this._whoTemp) this._whoTemp = new WhoOnline({ parentFrame: null, shell: null });
				return this._whoTemp.getOnlineUserIcons();
			} catch(e){ return []; }
		} },
		{ label: "Who List", type: "item", iconFile:"whosonline", action: BUILTIN_ACTIONS.who_list },
		{ label: "Hello", type: "item", iconFile:"folder", action: BUILTIN_ACTIONS.hello },
		{ label: "Sys Info", type: "item", iconFile:"kingcomputer", action: BUILTIN_ACTIONS.sysinfo },
		{ label: "Settings", type: "item", iconFile:"settings", action: BUILTIN_ACTIONS.settings },
		{ label: "Exit", type: "item", iconFile:"exit", action: BUILTIN_ACTIONS.exit }
	]
};

// Do not change.
var ICSH_CONSTANTS = {
    "ICON_W":12,
    "ICON_H":6
}
