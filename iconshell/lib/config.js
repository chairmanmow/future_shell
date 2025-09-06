
load("iconshell/lib/subfunctions/whosonline.js");
load("iconshell/lib/subfunctions/gamesmenu.js");
// Hello World demo subprogram
load("iconshell/lib/subfunctions/hello-world.js");
load("iconshell/lib/subfunctions/file_area.js");
load("iconshell/lib/subfunctions/calendar.js");
load("iconshell/lib/subfunctions/clock.js");
load("iconshell/lib/subfunctions/rawgate.js");

// Attempt dynamic configuration via guishell.ini
// INI format example:
// [Menu]
// items = chat,games,apps,who,messages,files,settings,exit
// [Item.chat]\n type=builtin\n label=Chat\n icon=chat\n builtin=chat
// [Item.games]\n type=xtrn_section\n section=1\n label=Games\n icon=games
// [Item.apps]\n type=xtrn_section\n section=0\n label=Apps\n icon=apps
// [Item.who]\n type=who\n label=Who\n icon=whosonline
// [Item.messages]\n type=command\n command=exec_xtrn:ECREADER\n label=Messages\n icon=messages
// [Item.files]\n type=command\n command=exec_xtrn:ANSIVIEW\n label=Files\n icon=folder
// [Item.settings]\n type=builtin\n builtin=settings\n label=Settings\n icon=settings
// [Item.exit]\n type=builtin\n builtin=exit\n label=Exit\n icon=exit

function _icsh_log(msg) { try { log(LOG_INFO, '[icsh-config] '+msg); } catch(e) {} }
function _icsh_warn(msg){ try { log(LOG_WARNING,'[icsh-config] '+msg);} catch(e){} }
function _icsh_err(msg) { try { log(LOG_ERR, '[icsh-config] '+msg); } catch(e) {} }

// Builtin actions mapping
var BUILTIN_ACTIONS = {
	chat: function(){ this.queueSubprogramLaunch('chat', this.chat); },
	settings: function(){ if (typeof bbs.user_config==='function') bbs.user_config(); else { console.clear(); console.putmsg('\x01h\x01cUser settings editor not available.\x01n\r\n'); mswait(800);} },
	hello: function(){ if(!this.helloWorld) this.helloWorld = new HelloWorld(); this.queueSubprogramLaunch('hello-world', this.helloWorld); },
	exit: function(){ throw('Exit Shell'); },
	privatemsg: function(){
		try { if(typeof PrivateMsg !== 'function') load('iconshell/lib/subfunctions/private_msg.js'); } catch(e) { dbug('subprogram', 'Failed loading private_msg.js '+e); return; }
		if(typeof PrivateMsg !== 'function') { dbug('subprogram','PrivateMsg class missing after load'); return; }
		if(!this.privateMsg) this.privateMsg = new PrivateMsg({ parentFrame: this.subFrame });
		// always reassign parentFrame in case shell recreated frames
		this.privateMsg.setParentFrame(this.subFrame);
		this.queueSubprogramLaunch('private-msg', this.privateMsg);
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
	var type = (sect.type||'').toLowerCase();
	var label = sect.label || key.charAt(0).toUpperCase()+key.substring(1);
	var icon = sect.icon || key;
	var obj = { label: label, iconFile: icon };
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
	if(type === 'who') {
		obj.type='folder';
		Object.defineProperty(obj,'children',{ configurable:true, enumerable:true, get:function(){ return getOnlineUserIcons(); }});
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
	_icsh_log('Dynamic menu built with '+children.length+' top-level items (folders supported)');
	return { label:'Home', type:'folder', children: children };
}

var _DYNAMIC_ICSH_CONFIG = buildDynamicConfig();


// Centralized color configuration for IconShell
var ICSH_VALS = {
	ROOT:   { BG: BG_BLACK,     FG: LIGHTGRAY },
	VIEW:   { BG: BG_BLACK,     FG: LIGHTGRAY },
	CRUMB:  { BG: BG_BLUE,      FG: WHITE     },
	SELECTED: { BG: BG_BLUE,    FG: WHITE     },
	LABEL:  { BG: BG_BLACK,     FG: LIGHTGRAY },
	UPITEM: { BG: BG_LIGHTGRAY, FG: BLACK     },
	ANIMATION: { COLOR: GREEN },
	EXTERNAL_BG: BG_BLACK,
	EXTERNAL_FG: LIGHTGRAY,
	MOUSE_ON:  { BG: BG_BLUE, FG: WHITE },
	MOUSE_OFF: { BG: BG_RED,  FG: WHITE }
	// Add more as needed for other UI elements
};

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
		{ label: "Files", type: "item", iconFile:"folder", action: makeExecXtrnAction("ANSIVIEW") },
		{ label: "Who", type: "folder", iconFile:"whosonline", get children(){ return getOnlineUserIcons(); } },
		{ label: "Hello", type: "item", iconFile:"folder", action: BUILTIN_ACTIONS.hello },
		{ label: "Settings", type: "item", iconFile:"settings", action: BUILTIN_ACTIONS.settings },
		{ label: "Exit", type: "item", iconFile:"exit", action: BUILTIN_ACTIONS.exit }
	]
};

// Do not change.
var ICSH_CONSTANTS = {
    "ICON_W":12,
    "ICON_H":6
}


