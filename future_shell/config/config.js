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
var debug_theme = true;
function _icsh_log(msg) {
	try {
		if (debug_icsh) log(LOG_INFO, '[icsh-config] ' + msg);
	} catch (e) { }
}
function _icsh_warn(msg) {
	try {
		if (debug_icsh) log(LOG_WARNING, '[icsh-config] ' + msg);
	} catch (e) { }
}
function _icsh_err(msg) {
	try {
		if (debug_icsh) log(LOG_ERR, '[icsh-config] ' + msg);
	} catch (e) { }
}

if (typeof ThemeRegistry === 'undefined') {
	try {
		var _themeModuleConfig = load('future_shell/lib/theme/palette.js');
		if (_themeModuleConfig && _themeModuleConfig.ThemeRegistry) ThemeRegistry = _themeModuleConfig.ThemeRegistry;
	} catch (e) { _icsh_warn('Theme registry unavailable: ' + e); }
}

function ensureXtrnMenuLoaded() {
	if (typeof getItemsForXtrnSection === 'function') return true;
	try {
		load('future_shell/lib/util/xtrnmenu.js');
	} catch (e) {
		_icsh_warn('Failed loading xtrnmenu.js ' + e);
		return false;
	}
	return typeof getItemsForXtrnSection === 'function';
}

// Builtin actions mapping
function SubprogramActionHandler(descriptor, options) {
	if (!(this instanceof SubprogramActionHandler)) return new SubprogramActionHandler(descriptor, options);
	options = options || {};
	var modulePath = options.module || options.modulePath || null;
	var queueName = options.queueName || options.queue;
	var instanceField = options.instanceProperty || options.instanceKey || null;
	var debugNamespace = options.debugNamespace || 'subprogram';
	var loadFailurePrefix = options.loadFailureMessage || null;
	var missingMessage = options.missingMessage || null;
	var optsBuilder = typeof options.options === 'function' ? options.options : null;
	var onReuse = typeof options.onReuse === 'function' ? options.onReuse : null;
	var shouldCreateNew = typeof options.shouldCreateNew === 'function' ? options.shouldCreateNew : null;
	var afterCreate = typeof options.afterCreate === 'function' ? options.afterCreate : null;
	var afterEnsure = typeof options.afterEnsure === 'function' ? options.afterEnsure : null;
	var autoAssign = options.assignOptions !== false;
	var defaults = (options.options && typeof options.options === 'object') ? options.options : {};
	var globalObject = (function () { return this || (typeof global !== 'undefined' ? global : {}); })();
	var className = options.className || null;

	function logDebug(message) {
		if (typeof dbug === 'function') dbug(debugNamespace, message);
	}

	function resolveCtorReference() {
		if (typeof descriptor === 'function') return descriptor;
		if (descriptor && typeof descriptor.get === 'function') return descriptor.get();
		var name = null;
		if (typeof descriptor === 'string') name = descriptor;
		else if (!className && descriptor && descriptor.name) name = descriptor.name;
		if (!className && name) className = name;
		if (!name) name = className;
		if (!name) return undefined;
		var ctor;
		try { ctor = eval(name); } catch (e) { ctor = undefined; }
		if (typeof ctor === 'function') return ctor;
		if (globalObject && typeof globalObject[name] === 'function') return globalObject[name];
		return undefined;
	}

	function ensureConstructor() {
		var ctor = resolveCtorReference();
		if (typeof ctor === 'function') return ctor;
		if (!modulePath) {
			if (!missingMessage && className) missingMessage = className + ' class missing after load';
			logDebug(missingMessage || 'Subprogram class unavailable');
			return null;
		}
		try { load(modulePath); }
		catch (e) {
			var prefix = loadFailurePrefix || ('Failed loading ' + modulePath.split('/').pop() + ' ');
			logDebug(prefix + e);
			return null;
		}
		ctor = resolveCtorReference();
		if (typeof ctor !== 'function') {
			if (!missingMessage && className) missingMessage = className + ' class missing after load';
			logDebug(missingMessage || 'Subprogram class missing after load');
			return null;
		}
		return ctor;
	}

	var handler = function () {
		var shell = this;
		var Ctor = ensureConstructor();
		if (!Ctor) return;
		var opts = optsBuilder ? optsBuilder.call(shell) : defaults;
		if (!opts || typeof opts !== 'object') opts = {};

		var instance = instanceField ? shell[instanceField] : null;
		if (instance && shouldCreateNew && shouldCreateNew.call(shell, instance, opts)) instance = null;
		var isNew = false;
		if (!instance) {
			try {
				instance = new Ctor(opts);
				isNew = true;
			} catch (eCtor) {
				_icsh_err('Subprogram constructor failed for ' + (className || 'unknown') + ': ' + eCtor);
				instance = null;
			}
			if (instance) {
				if (instanceField) shell[instanceField] = instance;
				try { if (afterCreate) afterCreate.call(shell, instance, opts); } catch (eAC) { _icsh_err('afterCreate error: ' + eAC); }
			}
		} else if (instance) {
			if (onReuse) {
				try { onReuse.call(shell, instance, opts); } catch (eOR) { _icsh_err('onReuse error: ' + eOR); }
			} else if (autoAssign) {
				for (var key in opts) if (opts.hasOwnProperty(key)) instance[key] = opts[key];
			}
		}
		// Validate instance shape (basic): ensure common lifecycle methods present if expected
		if (instance && typeof instance.enter !== 'function') {
			_icsh_warn('Instance for ' + (className || 'subprogram') + ' missing enter(); possible partial construction. Discarding.');
			if (instanceField) delete shell[instanceField];
			instance = null;
		}

		if (instance) {
			try { if (afterEnsure) afterEnsure.call(shell, instance, opts, isNew); } catch (eAE) { _icsh_err('afterEnsure error: ' + eAE); }
			if (typeof shell.queueSubprogramLaunch === 'function' && queueName) shell.queueSubprogramLaunch(queueName, instance);
		}
	};

	return handler;
}
var BUILTIN_ACTIONS = {
	chat: function () { this.queueSubprogramLaunch('chat', this.chat); },
	sysop_commands: new SubprogramActionHandler('SysopCommand', {
		module: 'future_shell/lib/subprograms/sysop_commands.js',
		queueName: 'sysop-commands',
		instanceProperty: 'sysopCommand',
		loadFailureMessage: 'Failed loading sysop_commands.js ',
		missingMessage: 'SysopCommand class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		onReuse: function (instance) {
			instance.parentFrame = this.root;
			instance.shell = this;
		}
	}),

	// Dedicated IRC chat section (distinct from generic 'chat')
	irc_chat: new SubprogramActionHandler('IrcSection', {
		module: 'future_shell/lib/subprograms/irc.js',
		queueName: 'irc-chat',
		instanceProperty: 'ircChatSub',
		loadFailureMessage: 'Failed loading irc.js ',
		missingMessage: 'IrcSection class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		onReuse: function (instance) {
			instance.parentFrame = this.root;
			instance.shell = this;
		}
	}),
	msg_scan_config: function () { if (typeof bbs.cfg_msg_scan === 'function') { this.runExternal(function () { bbs.cfg_msg_scan() }, { programId: 'cfg_msg_scan' }); } },
	user_settings: function () { if (typeof bbs.user_config === 'function') { this.runExternal(function () { bbs.user_config() }, { programId: 'user_config' }); } },
	hello: new SubprogramActionHandler('HelloWorld', {
		module: 'future_shell/lib/subprograms/hello-world.js',
		queueName: 'hello-world',
		instanceProperty: 'helloWorld',
		loadFailureMessage: 'Failed loading hello-world.js ',
		missingMessage: 'HelloWorld class missing after load'
	}),
	exit: function () {
		throw ('Exit Shell');
	},
	msg_boards: new SubprogramActionHandler('MessageBoard', {
		module: 'future_shell/lib/subprograms/message_boards/message_boards.js',
		queueName: 'message-boards',
		instanceProperty: 'msgBoardSub',
		loadFailureMessage: 'Failed loading message_boards.js ',
		missingMessage: 'MessageBoard class missing after load',
		options: function () { return { parentFrame: this.root, shell: this, timer: this.timer }; },
		onReuse: function (instance) {
			instance.parentFrame = this.root;
			instance.shell = this;
			instance.timer = this.timer;
			if (typeof instance.attachShellTimer === 'function') instance.attachShellTimer(this.timer);
		}
	}),
	privatemsg: new SubprogramActionHandler('PrivateMsg', {
		module: 'future_shell/lib/subprograms/private_msg.js',
		queueName: 'private-msg',
		instanceProperty: 'privateMsg',
		loadFailureMessage: 'Failed loading private_msg.js ',
		missingMessage: 'PrivateMsg class missing after load',
		options: function () { return { parentFrame: this.root }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
		}
}),
	users: new SubprogramActionHandler('Users', {
		module: 'future_shell/lib/subprograms/users.js',
		queueName: 'users',
		instanceProperty: 'Users',
		loadFailureMessage: 'Failed loading user_list.js ',
		missingMessage: 'Users class missing after load',
		options: function () { return { parentFrame: this.root }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
		}
}),
	userlist: new SubprogramActionHandler('UserList', {
		module: 'future_shell/lib/subprograms/user_list.js',
		queueName: 'user-list',
		instanceProperty: 'userList',
		loadFailureMessage: 'Failed loading user_list.js ',
		missingMessage: 'UserList class missing after load',
		options: function () { return { parentFrame: this.root }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
	}
}),
	filearea: new SubprogramActionHandler('FileArea', {
		module: 'future_shell/lib/subprograms/file_area.js',
		queueName: 'file-area',
		instanceProperty: 'fileArea',
		loadFailureMessage: 'Failed loading file_area.js ',
		missingMessage: 'FileArea class missing after load',
		options: function () {
			var icons = (typeof ICSH_SETTINGS !== 'undefined' && ICSH_SETTINGS && ICSH_SETTINGS.fileAreaIcons) ? ICSH_SETTINGS.fileAreaIcons : null;
			return { parentFrame: this.root, shell: this, iconMap: icons };
	},
		afterEnsure: function (instance, opts) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
			instance.shell = this;
		if (typeof instance.setIconMap === 'function') instance.setIconMap(opts.iconMap);
	}
}),
	usage_viewer: new SubprogramActionHandler('UsageViewer', {
		module: 'future_shell/lib/subprograms/usage-viewer.js',
		queueName: 'usage-viewer',
		instanceProperty: 'usageViewer',
		loadFailureMessage: 'Failed loading usage-viewer.js ',
		missingMessage: 'UsageViewer class missing after load',
		options: function () { return { parentFrame: this.root, shell: this, timer: this.timer }; },
		shouldCreateNew: function (instance) {
			if (!instance) return false;
			if (typeof UsageViewer !== 'undefined' && typeof UsageViewer.VERSION !== 'undefined') {
				return instance._version !== UsageViewer.VERSION;
			}
			return false;
		},
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
			instance.shell = this;
			instance.timer = this.timer;
			if (typeof instance.attachShellTimer === 'function') instance.attachShellTimer(this.timer);
		}
	}),
	newsreader: new SubprogramActionHandler('NewsReader', {
		module: 'future_shell/lib/subprograms/newsreader.js',
		queueName: 'newsreader',
		instanceProperty: 'newsReaderSub',
		loadFailureMessage: 'Failed loading newsreader.js ',
		missingMessage: 'NewsReader class missing after load',
		options: function () { return { parentFrame: this.root, shell: this, timer: this.timer }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
			instance.shell = this;
			instance.timer = this.timer;
			if (typeof instance.attachShellTimer === 'function') instance.attachShellTimer(this.timer);
	}
	}),
	calendar: new SubprogramActionHandler('CalendarSub', {
		module: 'future_shell/lib/subprograms/calendar.js',
		queueName: 'calendar',
		instanceProperty: 'calendarSub',
		loadFailureMessage: 'Failed loading calendar.js ',
		missingMessage: 'CalendarSub class missing after load',
		options: function () { return { parentFrame: this.root }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
	}
	}),
	clock: new SubprogramActionHandler('ClockSub', {
		module: 'future_shell/lib/subprograms/clock.js',
		queueName: 'clock',
		instanceProperty: 'clockSub',
		loadFailureMessage: 'Failed loading clock.js ',
		missingMessage: 'ClockSub class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
	}
	}),
	rawgate: new SubprogramActionHandler('RawGateSub', {
		module: 'future_shell/lib/subprograms/rawgate.js',
		queueName: 'rawgate',
		instanceProperty: 'rawGateSub',
		loadFailureMessage: 'Failed loading rawgate.js ',
		missingMessage: 'RawGateSub class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		afterEnsure: function (instance) {
			if (typeof instance.setParentFrame === 'function') instance.setParentFrame(this.root);
	}
	}),
	mail: new SubprogramActionHandler('Mail', {
		module: 'future_shell/lib/subprograms/mail.js',
		queueName: 'mail',
		instanceProperty: 'mailSub',
		loadFailureMessage: 'Failed loading mail.js ',
		missingMessage: 'Mail class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		onReuse: function (instance) {
		instance.parentFrame = this.root;
			instance.shell = this;
	}
	}),
	sysinfo: new SubprogramActionHandler('SystemInfo', {
		module: 'future_shell/lib/subprograms/system_info.js',
		queueName: 'system-info',
		instanceProperty: 'systemInfoSub',
		loadFailureMessage: 'Failed loading system_info.js ',
		missingMessage: 'SystemInfo class missing after load',
		options: function () { return { parentFrame: this.root, shell: this }; },
		onReuse: function (instance) {
		instance.parentFrame = this.root;
			instance.shell = this;
	}
	}),
	who_list: function () { dbug('subprogram', 'WhoOnline subprogram deprecated'); },
};

function readIniFile(path) {
	var f = new File(path);
	if (!f.exists) return null;
	if (!f.open('r')) return null;
	var text = f.readAll().join('\n');
	f.close();
	return text;
}

function _ensureTrailingSlash(path) {
	if (!path) return '';
	var last = path.charAt(path.length - 1);
	if (last === '/' || last === '\\') return path;
	return path + '/';
}

var ICSH_CONFIG_DIR = (function () {
	var base = '';
	try {
		if (typeof system !== 'undefined' && system && system.mods_dir) base = system.mods_dir;
		else if (typeof js !== 'undefined' && js && js.exec_dir) base = js.exec_dir;
	} catch (_cfgDirErr) { }
	base = _ensureTrailingSlash(base);
	return base + 'future_shell/config/';
})();

this.ICSH_CONFIG_DIR = ICSH_CONFIG_DIR;

function resolveConfigPath(filename) {
	if (!filename) return ICSH_CONFIG_DIR;
	return ICSH_CONFIG_DIR + filename;
}

this.ICSH_resolveConfigPath = resolveConfigPath;

function readConfigIni(filename) {
	if (!filename) return null;
	return readIniFile(resolveConfigPath(filename));
}

// Very small INI parser sufficient for our sections/keys (case-insensitive section names)
function parseIni(raw) {
	var data = {};
	var cur = null;
	var lines = raw.split(/\r?\n/);
	for (var i = 0; i < lines.length; i++) {
		var ln = lines[i].trim();
		if (!ln || ln.charAt(0) === ';' || ln.charAt(0) === '#') continue;
		var mSec = ln.match(/^\[(.+?)\]$/);
		if (mSec) { cur = mSec[1]; data[cur] = data[cur] || {}; continue; }
		if (!cur) continue;
		var eq = ln.indexOf('=');
		if (eq === -1) continue;
		var k = ln.substring(0, eq).trim();
		var v = ln.substring(eq + 1).trim();
		data[cur][k] = v;
	}
	return data;
}


// Enumerate known external program codes (best-effort; varies by Synchronet version)
function _listExternalCodes() {
	var codes = [];
	try {
		if (system && system.xtrn_area && system.xtrn_area.length) {
			for (var i = 0; i < system.xtrn_area.length; i++) {
				var area = system.xtrn_area[i];
				if (!area) continue;
				// Common property naming: area.xtrn (array of program objects)
				if (area.xtrn && area.xtrn.length) {
					for (var j = 0; j < area.xtrn.length; j++) {
						var prog = area.xtrn[j];
						if (prog && prog.code) codes.push(prog.code);
					}
				}
				// Fallback: sometimes prog_list or programs might exist
				if (area.prog_list && area.prog_list.length) {
					for (var k = 0; k < area.prog_list.length; k++) {
						var p2 = area.prog_list[k];
						if (p2 && p2.code && codes.indexOf(p2.code) === -1) codes.push(p2.code);
					}
				}
			}
		}
	} catch (e) { /* swallow */ }
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
			console.putmsg('\r\n' + msg + '\r\n');
		}
	} catch (e) { }
}

function makeExecXtrnAction(code) {
	code = (code || '').trim();
	if (code.charAt(0) === ":")
		code = code.substring(1);
	return function () {
		var self = this;
		try {
			if (!code) {
				_icsh_err('Empty external program code specified');
				_informUser(self, 'No program code specified');
				return;
			}
			if (!_externalExists(code)) {
				var avail = _listExternalCodes();
				_icsh_err('Invalid external program specified: ' + code + (avail.length ? (' (available: ' + avail.join(', ') + ')') : ''));
				_informUser(self, 'Program not found: ' + code);
				return;
			}
			self.runExternal(function () {
				try {
					bbs.exec_xtrn(code);
				} catch (ex) {
					_icsh_err('exec_xtrn(' + code + ') failed: ' + ex);
					_informUser(self, 'Launch failed: ' + code);
				}
			}, { programId: code });
		} catch (e) {
			_icsh_err('Unhandled error launching external ' + code + ': ' + e);
			_informUser(self, 'Error launching: ' + code);
		}
	};
}

function makeCommandAction(spec) {
	if (!spec) return null;
	if (spec.indexOf('exec_xtrn:') === 0) {
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
	if (spec.indexOf('js:') === 0) {
		var body = spec.substring(3);
		try { var fn = new Function(body); return function () { fn.call(this); }; } catch (e) { _icsh_err('Bad js command: ' + e); return null; }
	}
	_icsh_warn('Unknown command spec ' + spec);
	return null;
}

// Recursive builder for items (supports new type=folder with nested items list)
function _buildItemRecursive(key, ini, ancestry) {
	ancestry = ancestry || [];
	if (ancestry.indexOf(key) !== -1) { _icsh_warn('Cycle detected for item ' + key + ' path ' + ancestry.join('>')); return null; }
	var sect = ini['Item.' + key];
	if (!sect) { _icsh_warn('Missing section [Item.' + key + ']'); return null; }
	// Access gating check (inline, minimal) – returns true if allowed or user data not ready
	function _allow(sect) {
		// Centralize user level resolution (prefer security.level if present)
		function _usrLvl() {
			if (typeof user === 'undefined') return null;
			if (user.security && typeof user.security.level === 'number') return user.security.level;
			if (typeof user.level === 'number') return user.level;
			return null;
		}
		var ulev = _usrLvl();
		if (ulev === null) { _icsh_err('user object missing or no usable level (security.level / level) during gating; denying item'); return false; }
		if (sect.min_level !== undefined) { var ml = parseInt(sect.min_level, 10); if (!isNaN(ml) && ulev < ml) return false; }
		if (sect.require_sysop !== undefined && /^(1|true|yes)$/i.test(sect.require_sysop)) {
			var isSys = (user.is_sysop === true) || (user.security && user.security.level >= 90) || ulev >= 90; if (!isSys) return false;
		}
		if (sect.require_flag !== undefined) {
			var f = ('' + sect.require_flag).trim().toUpperCase();
			if (f.length === 1) { var sets = [user.flags1, user.flags2, user.flags3, user.flags4]; var ok = false; for (var i = 0; i < sets.length && !ok; i++) if (sets[i] && sets[i].indexOf(f) !== -1) ok = true; if (!ok && user.security) { var ss = user.security; var more = [ss.flags1, ss.flags2, ss.flags3, ss.flags4]; for (var m = 0; m < more.length && !ok; m++) if (more[m] && more[m].indexOf(f) !== -1) ok = true; } if (!ok) return false; }
		}
		return true;
	}
	if (!_allow(sect)) { _icsh_log('Filtered (gating) ' + key); return null; }
	var type = (sect.type || '').toLowerCase();
	var label = sect.label || key.charAt(0).toUpperCase() + key.substring(1);
	var icon = sect.icon || key;
	var obj = { label: label, iconFile: icon };
	// Lightweight gating metadata copied directly (evaluation deferred to one central filter)
	if (sect.min_level !== undefined) obj.min_level = parseInt(sect.min_level, 10);
	if (sect.require_sysop !== undefined) obj.require_sysop = /^(1|true|yes)$/i.test(sect.require_sysop);
	if (sect.require_flag !== undefined) obj.require_flag = ('' + sect.require_flag).trim().toUpperCase();
	if (type === 'builtin') {
		var bname = (sect.builtin || '').toLowerCase();
		var act = BUILTIN_ACTIONS[bname];
		if (!act) { _icsh_warn('Unknown builtin ' + bname + ' for item ' + key); return null; }
		obj.type = 'item'; obj.action = act;
		return obj;
	}
	if (type === 'command') {
		var actSpec = sect.command;
		var actionFn = makeCommandAction(actSpec);
		if (!actionFn) { _icsh_warn('Invalid command action for ' + key); return null; }
		obj.type = 'item'; obj.action = actionFn; return obj;
	}
	if (type === 'xtrn_section') {
		var secNum = parseInt(sect.section, 10);
		if (isNaN(secNum) || secNum < 0) { _icsh_warn('Bad section number for ' + key); return null; }
		obj.type = 'folder';
		(function (secNumRef) {
			Object.defineProperty(obj, 'children', {
				configurable: true,
				enumerable: true,
				get: function () {
					return ensureXtrnMenuLoaded() ? getItemsForXtrnSection(secNumRef) : [];
				}
			});
		})(secNum);
		return obj;
	}
	if (type === 'folder') {
		obj.type = 'folder';
		var listRaw = sect.items || sect.children || '';
		if (!listRaw) { _icsh_warn('Folder ' + key + ' has no items list'); obj.children = []; return obj; }
		var childKeys = listRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
		var kids = [];
		for (var i = 0; i < childKeys.length; i++) {
			var ck = childKeys[i];
			var childObj = _buildItemRecursive(ck, ini, ancestry.concat([key]));
			if (childObj) kids.push(childObj);
		}
		obj.children = kids;
		return obj;
	}
	_icsh_warn('Unknown type ' + type + ' for item ' + key);
	return null;
}

function buildDynamicConfig() {
	var iniRaw = readConfigIni('guishell.ini');
	if (!iniRaw) { _icsh_warn('guishell.ini not found – using static config'); return null; }
	var ini = parseIni(iniRaw);
	if (!ini.Menu || !ini.Menu.items) { _icsh_warn('No [Menu]/items in guishell.ini'); return null; }
	var order = ini.Menu.items.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
	if (!order.length) { _icsh_warn('Empty items list in [Menu]'); return null; }
	var children = [];
	for (var i = 0; i < order.length; i++) {
		var built = _buildItemRecursive(order[i], ini, []);
		if (built) children.push(built);
	}
	if (!children.length) { _icsh_warn('No valid menu items built; fallback to static'); return null; }
	// Concise gating filter (single pass)
	// Post-build filter (only if we have a resolvable user level). Uses same logic as _allow but on built objects.
	function _userLevel() { if (typeof user === 'undefined') return null; if (user.security && typeof user.security.level === 'number') return user.security.level; if (typeof user.level === 'number') return user.level; return null; }
	var __ulev = _userLevel();
	if (__ulev !== null) {
		children = children.filter(function (c) {
			if (c.min_level !== undefined && !isNaN(c.min_level) && __ulev < c.min_level) return false;
			if (c.require_sysop) { var isSys = (user.is_sysop === true) || (user.security && user.security.level >= 90) || __ulev >= 90; if (!isSys) return false; }
			if (c.require_flag && c.require_flag.length === 1) {
				var sets = [user.flags1, user.flags2, user.flags3, user.flags4]; var ok = false;
				for (var i = 0; i < sets.length && !ok; i++) if (sets[i] && typeof sets[i] === 'string' && sets[i].indexOf(c.require_flag) !== -1) ok = true;
				if (!ok && user.security) { var ss = user.security; var more = [ss.flags1, ss.flags2, ss.flags3, ss.flags4]; for (var m = 0; m < more.length && !ok; m++) if (more[m] && typeof more[m] === 'string' && more[m].indexOf(c.require_flag) !== -1) ok = true; }
				if (!ok) return false;
			}
			return true;
		});
	}
	_icsh_log('Dynamic menu built with ' + children.length + ' top-level items (folders supported)');
	return { label: 'Home', type: 'folder', children: children };
}

var _DYNAMIC_ICSH_CONFIG = buildDynamicConfig();

// Global shell settings (e.g., inactivity -> matrix rain) loaded from guishell.ini if present.
var ICSH_SETTINGS = (function () {
	var out = { inactivitySeconds: 180, inactivityMinutes: 3 }; // default 3 minutes
	function _parseBool(val) {
		if (val === undefined || val === null) return undefined;
		var s = String(val).trim().toLowerCase();
		if (!s) return undefined;
		if (s === 'true' || s === 'yes' || s === 'on' || s === '1') return true;
		if (s === 'false' || s === 'no' || s === 'off' || s === '0') return false;
		return undefined;
	}
	function _parseNumber(val) {
		if (val === undefined || val === null) return undefined;
		var s = String(val).trim();
		if (!s) return undefined;
		if (!/^[-+]?\d*(?:\.\d+)?$/.test(s)) return undefined;
		var n = parseFloat(s);
		return isNaN(n) ? undefined : n;
	}
	function _sanitiseName(name) {
		return String(name || '').trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, '').replace(/-/g, '_');
	}
	try {
		var iniRaw = readConfigIni('guishell.ini');
		if (iniRaw) {
			var ini = parseIni(iniRaw);
			// Allow either [Shell]/[Idle]/[GuiShell] sections with inactivity_seconds or inactivity_minutes (legacy)
			var secVal = null;
			if (ini.Shell && ini.Shell.inactivity_seconds !== undefined) secVal = ini.Shell.inactivity_seconds;
			else if (ini.Idle && ini.Idle.inactivity_seconds !== undefined) secVal = ini.Idle.inactivity_seconds;
			else if (ini.GuiShell && ini.GuiShell.inactivity_seconds !== undefined) secVal = ini.GuiShell.inactivity_seconds;
			if (secVal !== null) {
				var secs = parseInt(secVal, 10);
				if (!isNaN(secs)) {
					out.inactivitySeconds = secs;
				}
			}
			else {
				var minVal = null;
				if (ini.Shell && ini.Shell.inactivity_minutes !== undefined) minVal = ini.Shell.inactivity_minutes;
				else if (ini.Idle && ini.Idle.inactivity_minutes !== undefined) minVal = ini.Idle.inactivity_minutes;
				else if (ini.GuiShell && ini.GuiShell.inactivity_minutes !== undefined) minVal = ini.GuiShell.inactivity_minutes; // backwards compat / existing section
				if (minVal !== null) {
					var mins = parseInt(minVal, 10);
					if (!isNaN(mins)) out.inactivitySeconds = mins < 0 ? -1 : mins * 60;
				}
			}
			if (out.inactivitySeconds === -1) out.inactivityMinutes = -1;
			else out.inactivityMinutes = Math.round(out.inactivitySeconds / 60);
			if (ini.Screensaver) {
				var ss = ini.Screensaver;
				var cfg = {};
				if (ss.animations) {
					cfg.animations = ss.animations.split(',').map(function (n) { return _sanitiseName(n); }).filter(Boolean);
				}
				if (ss.random !== undefined) {
					var b = _parseBool(ss.random);
					if (b !== undefined) cfg.random = b;
				}
				if (ss.switch_interval !== undefined) {
					var si = _parseNumber(ss.switch_interval);
					if (si !== undefined) cfg.switch_interval = Math.max(0, si | 0);
				}
				if (ss.fps !== undefined) {
					var fps = _parseNumber(ss.fps);
					if (fps !== undefined) cfg.fps = Math.max(1, fps | 0);
				}
				if (ss.clear_on_switch !== undefined) {
					var cos = _parseBool(ss.clear_on_switch);
					if (cos !== undefined) cfg.clear_on_switch = cos;
				}
				// animation-specific overrides using dot notation e.g. life.density=0.25
				var animOpts = {};
				for (var key in ss) {
					if (!Object.prototype.hasOwnProperty.call(ss, key)) continue;
					if (key.indexOf('.') === -1) continue;
					var parts = key.split('.');
					var animName = _sanitiseName(parts.shift());
					var optName = parts.join('.');
					if (!animName || !optName) continue;
					if (!animOpts[animName]) animOpts[animName] = {};
					var raw = ss[key];
					var boolVal = _parseBool(raw);
					if (boolVal !== undefined) animOpts[animName][optName] = boolVal;
					else {
						var numVal = _parseNumber(raw);
						if (numVal !== undefined) animOpts[animName][optName] = numVal;
						else animOpts[animName][optName] = raw;
					}
				}
				if (Object.keys(animOpts).length) cfg.animationOptions = animOpts;
				if (Object.keys(cfg).length) out.screensaver = cfg;
			}
		}
	} catch (e) { _icsh_warn('Error loading ICSH_SETTINGS: ' + e); }
	return out;
})();


// Centralized color configuration for IconShell
// ====================================================================
// Central color registry (semantic keys) – every UI surface gets a
// distinct key even if its colors match another, so they can diverge
// later without touching code. All are overrideable via [Colors].
// ====================================================================
var ICSH_DEFAULTS = {
	// Shell core (legacy names kept for backwards compatibility)
	ROOT: { BG: BG_BLACK, FG: WHITE },
	VIEW: { BG: BG_BLACK, FG: LIGHTGRAY },
	CRUMB: { BG: BG_BLUE, FG: WHITE },
	SELECTED: { BG: BG_BLUE, FG: WHITE },
	LABEL: { BG: BG_BLACK, FG: LIGHTGRAY },
	UPITEM: { BG: BG_LIGHTGRAY, FG: BLACK },
	MOUSE_ON: { BG: BG_BLUE, FG: WHITE },
	MOUSE_OFF: { BG: BG_RED, FG: WHITE },
	ANIMATION: { COLOR: GREEN },
	EXTERNAL_BG: BG_BLACK,         // primitive numeric allowed
	EXTERNAL_FG: LIGHTGRAY,

	// Generic / shared surfaces
	FRAME_STANDARD: { BG: BG_BLACK, FG: LIGHTGRAY },
	STATUS_BAR: { BG: BG_BLUE, FG: WHITE },
	INPUT_BAR: { BG: BG_BLUE, FG: WHITE },
	HEADER_BAR: { BG: BG_BLUE, FG: WHITE },
	FOOTER_BAR: { BG: BG_BLUE, FG: WHITE },
	SELECTION_INVERT: { BG: BG_LIGHTGRAY, FG: BLACK },
	HILITE_CYAN: { BG: BG_CYAN, FG: WHITE },
	POPUP_FRAME: { BG: BG_BLACK, FG: WHITE },
	POPUP_CONTENT: { BG: BG_BLACK, FG: LIGHTGRAY },
	// Generic modal surface (default background for all modal chrome unless overridden)
	MODAL: { BG: BG_BLUE, FG: WHITE },
	MODAL_FRAME: { BG: BG_BLUE, FG: WHITE },
	MODAL_CONTENT: { BG: BG_BLACK, FG: LIGHTGRAY },
	MODAL_TITLE: { BG: BG_BLUE, FG: WHITE },
	MODAL_BUTTON: { BG: BG_BLUE, FG: WHITE },
	MODAL_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },
	MODAL_BUTTON_DISABLED: { BG: BG_BLUE, FG: LIGHTGRAY },
	MODAL_OVERLAY: { BG: BG_BLACK, FG: BLACK },
	MODAL_PROMPT_FRAME: { BG: BG_BLUE, FG: WHITE },
	MODAL_PROMPT_CONTENT: { BG: BG_BLACK, FG: LIGHTGRAY },
	MODAL_PROMPT_TITLE: { BG: BG_BLUE, FG: WHITE },
	MODAL_PROMPT_BUTTON: { BG: BG_BLUE, FG: WHITE },
	MODAL_PROMPT_BUTTON_FOCUS: { BG: BG_BLUE, FG: WHITE },
	MODAL_PROMPT_BUTTON_DISABLED: { BG: BG_BLUE, FG: LIGHTGRAY },
	MODAL_PROMPT_OVERLAY: { BG: BG_BLACK, FG: BLACK },
	MODAL_LEFT_PANEL: { BG: BG_CYAN, FG: LIGHTGRAY },
	MODAL_RIGHT_PANEL: { BG: BG_BLUE, FG: LIGHTGRAY },

	// Users / Who listings
	USERS_LIST: { BG: BG_BLACK, FG: LIGHTGRAY },
	USERS_STATUS: { BG: BG_BLUE, FG: WHITE },
	USERS_MODAL: { BG: BG_BLUE, FG: WHITE },
	USERS_MODAL_AVATAR: { BG: BG_BLUE, FG: WHITE },
	WHOS_LIST: { BG: BG_BLACK, FG: LIGHTGRAY },
	WHOS_STATUS: { BG: BG_BLUE, FG: WHITE },
	WHOS_TILE_BG: { BG: BG_BLACK, FG: LIGHTGRAY },
	WHOS_TILE_BG_SELECTED: { BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_HEADER: { BG: BG_BLUE, FG: WHITE },
	WHOS_TILE_HEADER_SELECTED: { BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_NAME: { BG: BG_BLUE, FG: WHITE },
	WHOS_TILE_NAME_SELECTED: { BG: BG_LIGHTGRAY, FG: BLACK },
	WHOS_TILE_FOOTER: { BG: BG_BLUE, FG: WHITE },
	WHOS_MODAL: { BG: BG_BLUE, FG: WHITE },
	WHOS_MODAL_LEFT: { BG: BG_CYAN, FG: LIGHTGRAY },
	WHOS_MODAL_RIGHT: { BG: BG_BLUE, FG: LIGHTGRAY },

	// Message Boards
	MB_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	MB_INPUT: { BG: BG_BLUE, FG: WHITE },
	MB_READ_HEADER: { BG: BG_BLUE, FG: WHITE },
	MB_READ_BODY: { BG: BG_BLACK, FG: LIGHTGRAY },
	MB_LABEL: { BG: BG_BLACK, FG: LIGHTGRAY },
	MB_LABEL_SELECTED: { BG: BG_LIGHTGRAY, FG: BLACK },
	MB_ICON_MOD: { BG: BG_RED, FG: WHITE },
	MB_ICON_SECTION: { BG: BG_BLUE, FG: WHITE },
	MB_ICON_SYS: { BG: BG_GREEN, FG: WHITE },
	MB_ICON_MISC: { BG: BG_CYAN, FG: WHITE },

	// Mail
	MAIL_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	MAIL_INPUT: { BG: BG_BLUE, FG: WHITE },
	MAIL_PROMPT_GUIDE: { BG: BG_BLACK, FG: MAGENTA },
	MAIL_PROMPT_LABEL: { BG: BG_BLACK, FG: YELLOW },
	MAIL_PROMPT_FIELD: { BG: BG_BLUE, FG: WHITE },
	MAIL_ICON: { BG: BG_BLACK, FG: LIGHTGRAY },
	MAIL_ICON_SELECTED: { BG: BG_BLUE, FG: WHITE },

	// File Area
	FILE_HEADER: { BG: BG_BLUE, FG: WHITE },
	FILE_FOOTER: { BG: BG_BLUE, FG: WHITE },
	FILE_LIST: { BG: BG_BLACK, FG: LIGHTGRAY },
	FILE_LIST_ACTIVE: { BG: BG_CYAN, FG: WHITE },
	FILE_LIST_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY },
	FILE_POPUP: { BG: BG_BLACK, FG: WHITE },
	FILE_POPUP_CONTENT: { BG: BG_BLACK, FG: LIGHTGRAY },

	// Calendar
	CAL_HEADER: { BG: BG_BLUE, FG: WHITE },
	CAL_FOOTER: { BG: BG_BLUE, FG: WHITE },
	CAL_GRID: { BG: BG_BLACK, FG: LIGHTGRAY },
	CAL_DAY_SELECTED: { BG: BG_CYAN, FG: WHITE },
	CAL_DAY_TODAY: { BG: BG_BLUE, FG: WHITE },
	CAL_DAY_HOLIDAY: { BG: BG_GREEN, FG: WHITE },
	CAL_DAY_NORMAL: { BG: BG_BLACK, FG: LIGHTGRAY },

	// Chat / IRC / Private / Generic text subs
	CHAT_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	CHAT_INPUT: { BG: BG_BLUE, FG: WHITE },
	PRIVMSG_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	PRIVMSG_INPUT: { BG: BG_BLUE, FG: WHITE },
	IRC_LIST: { BG: BG_BLACK, FG: LIGHTGRAY },
	IRC_STATUS: { BG: BG_BLUE, FG: WHITE },
	RAW_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	RAW_INPUT: { BG: BG_BLUE, FG: WHITE },
	SYSINFO_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	SYSINFO_INPUT: { BG: BG_BLUE, FG: WHITE },
	HELLO_OUTPUT: { BG: BG_BLACK, FG: LIGHTGRAY },
	HELLO_INPUT: { BG: BG_BLUE, FG: WHITE },

	// Toast / notifications
	TOAST_FRAME: { BG: BG_BLACK, FG: LIGHTGRAY },
	TOAST_MSG: { BG: BG_MAGENTA, FG: WHITE },
	TOAST_AVATAR: { BG: BG_BLACK, FG: WHITE },

	// Clock
	CLOCK_BG: { BG: BG_BLACK, FG: LIGHTGRAY },

	// Matrix rain effect (head & fading segments)
	RAIN_HEAD: { BG: BG_BLACK, FG: LIGHTGREEN },
	RAIN_FADE_HIGH: { BG: BG_BLACK, FG: GREEN },
	RAIN_SPARK: { BG: BG_BLACK, FG: WHITE },
	RAIN_DIM1: { BG: BG_BLACK, FG: LIGHTGRAY },
	RAIN_DIM2: { BG: BG_BLACK, FG: DARKGRAY }
};

var ICSH_VALS = ICSH_DEFAULTS;
if (typeof ThemeRegistry !== 'undefined') {
	ThemeRegistry.registerPalette('icsh', ICSH_DEFAULTS);
	ICSH_VALS = ThemeRegistry.get('icsh');
}

var SHARED_THEME_DEFAULTS = {
	WARNING: { BG: BG_RED, FG: WHITE },
	INFO: { FG: LIGHTCYAN },
	SUCCESS: { FG: LIGHTGREEN },
	MUTED: { FG: LIGHTMAGENTA }
};
if (typeof ThemeRegistry !== 'undefined') {
	ThemeRegistry.registerPalette('shared', SHARED_THEME_DEFAULTS);
}

// Helper: resolve full attribute (BG|FG) from semantic key
function ICSH_ATTR(key) {
	var g = ICSH_VALS[key];
	if (g === undefined) return WHITE; // fallback
	if (typeof g === 'number') return g; // primitive
	var bg = g.BG || 0; var fg = g.FG || 0; return bg | fg;
}

function _clonePalette(src) {
	if (!src || typeof src !== 'object') return {};
	var out = {};
	for (var key in src) {
		if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
		var val = src[key];
		if (val && typeof val === 'object' && !Array.isArray(val)) out[key] = _clonePalette(val);
		else out[key] = val;
	}
	return out;
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
function applyColorOverrides(defaults) {
	var baseDefaults = defaults || ICSH_DEFAULTS;
	var vals = _clonePalette((typeof ThemeRegistry !== 'undefined') ? ThemeRegistry.get('icsh') : baseDefaults);
	var changed = false;
	var namespaceOverrides = {};
	function ensureNamespace(ns, key) {
		if (!namespaceOverrides[ns]) namespaceOverrides[ns] = {};
		if (!namespaceOverrides[ns][key]) namespaceOverrides[ns][key] = {};
		return namespaceOverrides[ns][key];
	}
	try {
		var iniRaw = readConfigIni('theme.ini');
		if (!iniRaw) iniRaw = readConfigIni('guishell.ini');
		if (!iniRaw) {
			if (debug_theme) _icsh_log('Theme override skipped: no theme.ini or guishell.ini found');
			if (typeof ThemeRegistry === 'undefined') ICSH_VALS = vals;
			else ICSH_VALS = ThemeRegistry.get('icsh');
			return;
		}
		var ini = parseIni(iniRaw);
		if (!ini || (!ini.Colors && !ini.colors)) {
			if (debug_theme) _icsh_log('Theme override skipped: no [Colors] section');
			if (typeof ThemeRegistry === 'undefined') ICSH_VALS = vals;
			else ICSH_VALS = ThemeRegistry.get('icsh');
			return;
		}
		var sect = ini.Colors || ini.colors;
		if (debug_theme) _icsh_log('Theme override initialised with ' + Object.keys(sect).length + ' entries');

		function lookupColor(token, isBg) {
			if (token === undefined || token === null) return null;
			token = ('' + token).trim();
			if (token === '') return null;
			if (/^[0-9]+$/.test(token)) return parseInt(token, 10);
			var up = token.toUpperCase();
			var candidates = [];
			if (isBg) {
				if (up.indexOf('BG_') === 0) candidates.push(up); else candidates.push('BG_' + up);
				if (up.indexOf('BG_') !== 0) candidates.push(up);
			} else {
				candidates.push(up);
			}
			for (var i = 0; i < candidates.length; i++) {
				var name = candidates[i];
				try { if (eval('typeof ' + name + ' !== "undefined"')) { var v = eval(name); if (typeof v === 'number') return v; } } catch (e) { }
			}
			return null;
		}

		function setPair(baseKey, bgVal, fgVal) {
			if (!vals[baseKey] || typeof vals[baseKey] !== 'object') return;
			var applied = false;
			if (bgVal !== null) { vals[baseKey].BG = bgVal; applied = true; _icsh_log('Color override ' + baseKey + '.BG applied'); }
			if (fgVal !== null) { vals[baseKey].FG = fgVal; applied = true; _icsh_log('Color override ' + baseKey + '.FG applied'); }
			if (applied) changed = true;
		}

		function applyNamespaceOverride(origKey, value) {
			var parts = origKey.split('.');
			if (parts.length < 2) { _icsh_warn('Invalid namespace color override ' + origKey); return; }
			var ns = parts.shift().trim();
			if (!ns) { _icsh_warn('Invalid namespace color override ' + origKey); return; }
			if (debug_theme) _icsh_log('Apply namespace override: ' + ns + ' <- ' + value);
			var attrTarget = null;
			var last = parts[parts.length - 1];
			if (last && /^(BG|FG|COLOR)$/i.test(last.trim())) {
				attrTarget = last.trim().toUpperCase();
				parts.pop();
			}
			var keyName = parts.join('.').trim();
			if (!keyName) {
				if (attrTarget) keyName = 'DEFAULT';
				else { _icsh_warn('Invalid namespace color override ' + origKey); return; }
			}
			keyName = keyName.toUpperCase();
			var entry = ensureNamespace(ns, keyName);
			function logSuccess(msg) { if (debug_theme) _icsh_log('Color override ' + ns + '.' + keyName + msg); }
			if (attrTarget === 'COLOR') {
				var c = lookupColor(value, false);
				if (c !== null) { entry.COLOR = c; changed = true; logSuccess('.COLOR applied'); } else _icsh_warn('Invalid COLOR token ' + value + ' for ' + ns + '.' + keyName);
				return;
			} else if (attrTarget === 'BG' || attrTarget === 'FG') {
				var isBg = attrTarget === 'BG';
				var col = lookupColor(value, isBg);
				if (col !== null) { entry[attrTarget] = col; changed = true; logSuccess('.' + attrTarget + ' applied'); } else _icsh_warn('Invalid ' + attrTarget + ' token ' + value + ' for ' + ns + '.' + keyName);
				return;
			}
			if (typeof value === 'string' && value.indexOf(',') !== -1) {
				var pair = value.split(',');
				var bg = lookupColor(pair[0], true);
				var fg = lookupColor(pair[1], false);
				if (bg === null && fg === null) { _icsh_warn('Invalid pair override ' + value + ' for ' + ns + '.' + keyName); return; }
				if (bg !== null) entry.BG = bg;
				if (fg !== null) entry.FG = fg;
				changed = true; logSuccess(' applied');
			} else {
				var fgOnly = lookupColor(value, false);
				if (fgOnly !== null) { entry.FG = fgOnly; changed = true; logSuccess('.FG applied'); }
				else _icsh_warn('Invalid color token ' + value + ' for ' + ns + '.' + keyName);
			}
		}

		var seenKeys = 0;
		for (var rawKey in sect) {
			if (!Object.prototype.hasOwnProperty.call(sect, rawKey)) continue;
			var value = sect[rawKey];
			if (value === undefined || value === null) continue;
			var trimmed = rawKey.trim();
			if (!trimmed) continue;
			var upKey = trimmed.toUpperCase();
			if (debug_theme) _icsh_log('Processing color key ' + trimmed + ' = ' + value);
			var base = null, target = null;
			if (upKey.indexOf('.') !== -1) {
				var parts = upKey.split('.');
				if (parts.length > 2) {
					applyNamespaceOverride(trimmed, value);
					continue;
				}
				base = parts[0]; target = parts[1];
			} else if (/_(BG|FG|COLOR)$/.test(upKey)) {
				var suffixBg = /_BG$/;
				var suffixFg = /_FG$/;
				var suffixColor = /_COLOR$/;
				if (suffixBg.test(upKey)) { base = upKey.replace(suffixBg, ''); target = 'BG'; }
				else if (suffixFg.test(upKey)) { base = upKey.replace(suffixFg, ''); target = 'FG'; }
				else if (suffixColor.test(upKey)) { base = upKey.replace(suffixColor, ''); target = 'COLOR'; }
			} else {
				base = upKey;
			}

			if (!vals.hasOwnProperty(base)) {
				if (trimmed.indexOf('.') !== -1) { applyNamespaceOverride(trimmed, value); }
				else if (debug_theme) _icsh_warn('Color override references unknown group ' + trimmed);
				continue;
			}
			if (typeof vals[base] === 'number') {
				var prim = lookupColor(value, /_BG$|\.BG$/.test(upKey));
				if (prim !== null) { vals[base] = prim; changed = true; _icsh_log('Color override ' + base + '=' + value); }
				else _icsh_warn('Invalid color token ' + value + ' for ' + base);
				continue;
			}
			if (target) {
				var isBg = (target === 'BG');
				if (target === 'COLOR') {
					var col = lookupColor(value, false);
					if (col !== null) { vals[base].COLOR = col; changed = true; _icsh_log('Color override ' + base + '.COLOR=' + value); }
					else _icsh_warn('Invalid COLOR token ' + value + ' for ' + base);
				} else {
					var col2 = lookupColor(value, isBg);
					if (col2 !== null) { vals[base][target] = col2; changed = true; _icsh_log('Color override ' + base + '.' + target + '=' + value); }
					else _icsh_warn('Invalid ' + target + ' token ' + value + ' for ' + base);
				}
				continue;
			}
			if (base === 'ANIMATION') {
				var c = lookupColor(value, false);
				if (c !== null) { vals.ANIMATION.COLOR = c; changed = true; _icsh_log('Color override ANIMATION.COLOR=' + value); }
				else _icsh_warn('Invalid ANIMATION color ' + value);
				continue;
			}
			if (typeof value === 'string' && value.indexOf(',') !== -1) {
				var pair = value.split(',');
				var bg = lookupColor(pair[0], true);
				var fg = lookupColor(pair[1], false);
				if (bg === null && fg === null) { _icsh_warn('Invalid pair override ' + value + ' for ' + base); continue; }
				setPair(base, bg, fg);
			} else {
				if (vals[base] && typeof vals[base] === 'object') {
					if ('FG' in vals[base]) {
						var fgOnly = lookupColor(value, false);
						if (fgOnly !== null) { vals[base].FG = fgOnly; changed = true; _icsh_log('Color override ' + base + '.FG=' + value); }
						else _icsh_warn('Invalid FG token ' + value + ' for ' + base);
					} else if ('COLOR' in vals[base]) {
						var conly = lookupColor(value, false);
						if (conly !== null) { vals[base].COLOR = conly; changed = true; _icsh_log('Color override ' + base + '.COLOR=' + value); }
						else _icsh_warn('Invalid COLOR token ' + value + ' for ' + base);
					}
				}
			}
			seenKeys++;
		}
	} catch (e) { _icsh_warn('applyColorOverrides error: ' + e); }
	if (typeof ThemeRegistry !== 'undefined') {
		if (changed) ThemeRegistry.applyOverrides({ icsh: vals });
		if (Object.keys(namespaceOverrides).length) ThemeRegistry.applyOverrides(namespaceOverrides);
		if (debug_theme) {
			_icsh_log('Theme overrides applied: icsh changed=' + changed);
			_icsh_log('Namespace overrides: ' + JSON.stringify(namespaceOverrides));
		}
		ICSH_VALS = ThemeRegistry.get('icsh');
	} else {
		ICSH_VALS = vals;
	}
}


// Apply overrides at load time (silent if no [Colors] section present)
applyColorOverrides(ICSH_DEFAULTS);

// IconShell configuration: menu structure, labels, icons, and actions
var ICSH_CONFIG = _DYNAMIC_ICSH_CONFIG || {
	// Static fallback (original definition) without fixed viewIds; runtime assigns
	label: "Home",
	type: "folder",
	children: [
		{ label: "Chat", type: "item", iconFile: "chat", action: BUILTIN_ACTIONS.chat },
		{
			label: "Games",
			type: "folder",
			iconFile: "games",
			get children() { return ensureXtrnMenuLoaded() ? getItemsForXtrnSection(1) : []; }
		},
		{
			label: "Apps",
			type: "folder",
			iconFile: "apps",
			get children() { return ensureXtrnMenuLoaded() ? getItemsForXtrnSection(0) : []; }
		},
		{ label: "Messages", type: "item", iconFile: "messages", action: makeExecXtrnAction("ECREADER") },
		{ label: "News", type: "item", iconFile: "news", action: BUILTIN_ACTIONS.newsreader },
		{ label: "Mail", type: "item", iconFile: "mail", dynamic: true, action: BUILTIN_ACTIONS.mail },
		{ label: "Files", type: "item", iconFile: "folder", action: makeExecXtrnAction("ANSIVIEW") },
		{ label: "Hello", type: "item", iconFile: "folder", action: BUILTIN_ACTIONS.hello },
		{ label: "Sys Info", type: "item", iconFile: "kingcomputer", action: BUILTIN_ACTIONS.sysinfo },
		{ label: "Usage", type: "item", iconFile: "calendar", action: BUILTIN_ACTIONS.usage_viewer },
		{ label: "Settings", type: "item", iconFile: "settings", action: BUILTIN_ACTIONS.settings },
		{ label: "Exit", type: "item", iconFile: "exit", action: BUILTIN_ACTIONS.exit }
	]
};

// Do not change.
var ICSH_CONSTANTS = {
	"ICON_W": 12,
	"ICON_H": 6
}
