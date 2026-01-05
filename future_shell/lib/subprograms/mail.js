load('future_shell/lib/subprograms/subprogram.js');
// Use shared Icon renderer for consistency with main shell
load('future_shell/lib/shell/icon.js');
load('future_shell/lib/subprograms/subprogram_hotspots.js');
// Load dissolve animation function
try { load('future_shell/lib/effects/eye_candy.js'); } catch (e) { /* dissolve optional */ }
if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
require('sbbsdefs.js', 'MAIL_SENT', 'MAIL_YOUR', 'LM_REVERSE', 'LM_UNREAD', 'LM_INCDEL', 'NMAIL_KILL');
require('smbdefs.js', 'NET_FIDO', 'NETMSG_INTRANSIT', 'NETMSG_SENT', 'NETMSG_KILLSENT', 'NETMSG_HOLD', 'NETMSG_CRASH', 'NETMSG_IMMEDIATE', 'NETMSG_DIRECT', 'NETMSG_ARCHIVESENT');
require('userdefs.js', 'U_NAME');
require('msgdefs.js', 'MM_REALNAME');

// Fallback key codes if not defined globally (Synchronet usually defines in sbbsdefs.js)
if (typeof KEY_PGUP === 'undefined') var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined') var KEY_PGDN = 0x5100;
if (typeof SCAN_TOYOU === 'undefined') var SCAN_TOYOU = (1 << 3);
if (typeof SCAN_UNREAD === 'undefined') var SCAN_UNREAD = (1 << 5);
if (typeof SCAN_NEW === 'undefined') var SCAN_NEW = (1 << 1);
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

   -------------------------------------------------------------------------
   bbs.scan_subs(mode?, all?) -> void
   @param {Number} [mode] Bitfield flags. Use SCAN_TOYOU/SCAN_UNREAD to focus on messages addressed to the current user.
   @param {Boolean} [all] If true, includes every accessible sub instead of configured scan list.
   Side-effects: Launches stock message scan UI using the specified filters.

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
	this.hotspots = new SubprogramHotspotHelper({ shell: this.shell, owner: 'mail', layerName: 'mail', priority: 60 });
	this.outputFrame = null;
	this.footerFrame = null;
	this.headerFrame = null;
	this.selectedIndex = 0;
	this.lastMessage = '';
	this.mode = 'icon'; // icon | confirm | promptRecipient
	this.confirmFor = null;
	this.scrollback = [];
	this.scrollOffset = 0;
	this.maxScrollLines = 1000;
	var self = this;
	function makeAction(fn, msg, opts) {
		opts = opts || {};
		var animate = opts.animation !== 'none';
		var programId = opts.programId || (msg ? ('mail:' + msg.replace(/\s+/g, '_').toLowerCase()) : 'mail');
		return function () {
			var sh = self.shell;
			var runAndRefresh = function () {
				try { fn(); } catch (ex) {
					try { log('mail action error', ex); } catch (_) { }
				}
				self._destroyIconCells();
				self._destroyPromptFrames();
				self.updateUnreadCount();
				self.draw();
			};
			var useWrapper = (opts.useShellWrapper !== false) && sh && typeof sh.runExternal === 'function';
			if (useWrapper) {
				var runOpts = { programId: programId };
				if (opts.trackUsage !== undefined) runOpts.trackUsage = opts.trackUsage;
				if (!animate) runOpts.animation = 'none';
				sh.runExternal(runAndRefresh, runOpts);
			} else {
				runAndRefresh();
			}
		};
	}
	this.unreadCount = 0;
	this.totalMailCount = 0;
	this.menuOptions = [
		{ baseLabel: 'Exit', iconFile: 'back', action: function () { self.exit(); } },
		{ baseLabel: 'Inbox', iconFile: 'messages', dynamic: true, action: makeAction(function () { bbs.read_mail(); }, 'Reading mail...', { programId: 'mail:inbox', useShellWrapper: false }) },
		// Native interactive compose (custom pre-screen, no confirmation desired)
		{ baseLabel: 'Compose Email', iconFile: 'compose', confirm: false, action: function () { self.composeInteractiveEmail(); } },
		{ baseLabel: 'Scan For You', iconFile: 'mailbox', action: makeAction(function () { self._scanMessagesAddressedToUser(); console.pause(); }, 'Scanning for messages to you...', { programId: 'mail:scan_for_you', useShellWrapper: false }) },
		// {
		// 	baseLabel: 'Netmail Queue', iconFile: 'clock', action: makeAction(function () {
		// 		self._renderNetmailList({ mode: 'queue', title: 'Fido Netmail Queue' });
		// 	}, 'Viewing netmail queue...', { programId: 'mail:netmail_queue' })
		// },
		{
			baseLabel: 'Sent Mail', iconFile: 'redman', action: makeAction(function () {
				if (typeof bbs === 'undefined' || typeof bbs.read_mail !== 'function') return;
				var currentUserNum = (typeof user !== 'undefined' && user && typeof user.number === 'number' && user.number > 0) ? user.number : null;
				var mode = 0;
				if (typeof user !== 'undefined' && user && typeof user.mail_settings === 'number' && (user.mail_settings & LM_REVERSE))
					mode |= LM_REVERSE;
				if (typeof msg_area !== 'undefined' && msg_area) {
					var killFlags = 0;
					if (typeof msg_area.fido_netmail_settings === 'number') killFlags |= msg_area.fido_netmail_settings;
					if (typeof msg_area.inet_netmail_settings === 'number') killFlags |= msg_area.inet_netmail_settings;
					if (killFlags & NMAIL_KILL)
						mode |= LM_INCDEL;
				}
				try {
					if (currentUserNum !== null) {
						if (mode)
							bbs.read_mail(MAIL_SENT, currentUserNum, mode);
						else
							bbs.read_mail(MAIL_SENT, currentUserNum);
					} else {
						bbs.read_mail(MAIL_SENT);
					}
				} catch (e) {
					log('Sent Mail read_mail crashed', e);
				}
			}, 'Opening sent mail...', { programId: 'mail:sent', useShellWrapper: false })
		},
	];
	this.updateUnreadCount();
	// icon cell cache
	this.iconCells = [];
	this.registerColors({
		ICON: { BG: BG_BLACK, FG: LIGHTGRAY },
		LIST: { BG: BG_RED, FG: BLACK },
		LABEL_MUTED: { FG: LIGHTMAGENTA },
		TEXT_TIME: { FG: LIGHTCYAN },
		TEXT_RECENT: { FG: LIGHTRED },
		TEXT_TOP: { FG: LIGHTMAGENTA },
		TEXT_TOTAL: { FG: LIGHTBLUE },
		HEADER_FRAME: { BG: BG_CYAN, FG: WHITE },
		MAIN_FRAME: { BG: BG_BLACK, FG: LIGHTGRAY },
		FOOTER_FRAME: { BG: BG_BLACK, FG: LIGHTCYAN },
		LIGHTBAR: { BG: CYAN, FG: WHITE },
		TEXT_HOTKEY: { FG: LIGHTCYAN },
		TEXT_NORMAL: { FG: LIGHTGRAY },
		TEXT_BOLD: { FG: LIGHTBLUE },
	});
}

extend(Mail, Subprogram);

Mail.prototype.composeInteractiveEmail = function () {
	if (this.mode !== 'icon') return;
	this._enterRecipientPrompt();
	this.draw();
};

Mail.prototype._scanMessagesAddressedToUser = function () {
	if (typeof bbs === 'undefined' || typeof bbs.scan_subs !== 'function') return;
	var mode = 0;
	if (typeof SCAN_TOYOU !== 'undefined') mode |= SCAN_TOYOU;
	if (typeof SCAN_UNREAD !== 'undefined') mode |= SCAN_UNREAD;
	if (!mode && typeof SCAN_NEW !== 'undefined') mode |= SCAN_NEW;
	try {
		if (mode) bbs.scan_subs(mode, true);
		else bbs.scan_subs(undefined, true);
	} catch (e) {
		/* swallow scan errors */
	}
};

Mail.prototype._renderNetmailList = function (opts) {
	opts = opts || {};
	console.clear();
	console.print('\x01n\x01h' + (opts.title || 'Fido Netmail') + '\x01n\r\n\r\n');
	if (typeof MsgBase !== 'function') {
		console.print('Mail base access is unavailable in this runtime.\r\n');
		console.pause();
		return;
	}
	var gather = this._gatherNetmailRows(opts.mode || 'queue');
	if (gather.error) {
		console.print(gather.error + '\r\n');
		console.pause();
		return;
	}
	var rows = gather.rows || [];
	if (!rows.length) {
		console.print('No matching Fido netmail messages were found.\r\n');
		console.pause();
		return;
	}
	for (var i = 0; i < rows.length; i++) {
		var row = rows[i];
		console.print(pad((i + 1) + '.', 4));
		console.print((row.whenText || 'unknown time') + '\r\n');
		console.print('   To: ' + row.to + '\r\n');
		if (row.subject)
			console.print('   Subj: ' + row.subject + '\r\n');
		if (row.from)
			console.print('   From: ' + row.from + '\r\n');
		console.print('   Status: ' + row.status + '\r\n\r\n');
	}
	console.print('Press any key to return...');
	console.getkey();
};

Mail.prototype._gatherNetmailRows = function (mode) {
	var rows = [];
	var mailBase = new MsgBase('mail');
	if (!mailBase.open())
		return { error: 'Unable to open mail base: ' + mailBase.error };
	try {
		for (var off = 0; off < mailBase.total_msgs; off++) {
			var hdr = mailBase.get_msg_header(true, off);
			if (!hdr || hdr.to_net_type !== NET_FIDO)
				continue;
			var outgoing = !!(hdr.netattr & NETMSG_SENT);
			if (mode === 'inbox') {
				if (outgoing) continue;
				if (!this._isNetmailForCurrentUser(hdr)) continue;
			} else if (mode === 'queue') {
				if (!outgoing) continue;
			}
			rows.push(this._summarizeNetmailHeader(hdr));
		}
	} finally {
		mailBase.close();
	}
	rows.sort(function (a, b) { return b.when - a.when; });
	return { rows: rows };
};

Mail.prototype._summarizeNetmailHeader = function (hdr) {
	var statusBits = [];
	if (hdr.netattr & NETMSG_INTRANSIT) statusBits.push('in-transit');
	if (hdr.netattr & NETMSG_SENT) statusBits.push('sent');
	if (hdr.netattr & NETMSG_KILLSENT) statusBits.push('kill');
	if (hdr.netattr & NETMSG_ARCHIVESENT) statusBits.push('archive');
	if (hdr.netattr & NETMSG_HOLD) statusBits.push('hold');
	if (hdr.netattr & NETMSG_CRASH) statusBits.push('crash');
	if (hdr.netattr & NETMSG_IMMEDIATE) statusBits.push('immediate');
	if (hdr.netattr & NETMSG_DIRECT) statusBits.push('direct');
	if (!statusBits.length) statusBits.push('pending');
	var when = hdr.when_written_time || hdr.when_imported_time || 0;
	return {
		to: hdr.to || hdr.to_net_addr || '(unknown)',
		subject: hdr.subject || '',
		from: hdr.from || '',
		when: when,
		whenText: when ? system.timestr(when) : 'unknown time',
		status: statusBits.join(', ')
	};
};

Mail.prototype._isNetmailForCurrentUser = function (hdr) {
	if (typeof user === 'undefined' || !user)
		return false;
	if (typeof hdr.to_ext === 'number' && hdr.to_ext > 0 && typeof user.number === 'number' && hdr.to_ext === user.number)
		return true;
	var targets = [];
	if (user.alias) targets.push(user.alias);
	if (user.name) targets.push(user.name);
	if (user.handle) targets.push(user.handle);
	if (user.netmail) targets.push(user.netmail);
	var toVal = (hdr.to || '').trim().toLowerCase();
	for (var i = 0; i < targets.length; i++) {
		var target = (targets[i] || '').trim().toLowerCase();
		if (target && target === toVal)
			return true;
	}
	if (hdr.to_net_addr) {
		var addr = hdr.to_net_addr.trim().toLowerCase();
		for (var j = 0; j < targets.length; j++) {
			var t2 = (targets[j] || '').trim().toLowerCase();
			if (t2 && t2 === addr)
				return true;
		}
	}
	return false;
};

// Deprecated blocking APIs replaced by non-blocking promptRecipient mode
Mail.prototype._promptRecipient = function () { return null; };

// Styled recipient prompt shown on a cleared screen prior to launching editor
Mail.prototype._promptRecipientStyled = function () { return null; };

// Overlay frame-based prompt to avoid global console attribute side-effects
Mail.prototype._promptRecipientOverlay = function () { return null; };

Mail.prototype._destroyPromptFrames = function () {
	var host = this._promptField ? this._promptField.parent : (this._promptLabel ? this._promptLabel.parent : (this._promptGuide ? this._promptGuide.parent : null));
	['_promptField', '_promptLabel', '_promptGuide'].forEach(function (key) {
		try { if (this[key]) this[key].close(); } catch (e) { }
		this[key] = null;
	}, this);
	if (host) { try { host.cycle(); } catch (e) { } }
	else if (this.outputFrame) { try { this.outputFrame.cycle(); } catch (e) { } }
};

Mail.prototype._resolveLocalUser = function (name) {
	if (!name) return 0;
	var num = 0;
	if (name.charAt(0) === '#') {
		num = parseInt(name.substr(1), 10) || 0;
		if (num) return num;
	}
	if (/^[0-9]+$/.test(name)) {
		var nodeNum = parseInt(name, 10);
		if (nodeNum > 0 && nodeNum <= system.nodes) {
			try {
				var node = system.get_node(nodeNum);
				if (node && node.useron) return node.useron;
			} catch (e) { }
		}
	}
	try { if (typeof bbs.finduser === 'function') num = bbs.finduser(name); } catch (e) { }
	if (num) return num;
	try { if (typeof system.matchuser === 'function') num = system.matchuser(name); } catch (e) { }
	if (num) return num;
	try {
		if (typeof system.matchuserdata === 'function' && typeof U_NAME !== 'undefined' && typeof msg_area !== 'undefined' && msg_area && (msg_area.settings & MM_REALNAME))
			num = system.matchuserdata(U_NAME, name);
	} catch (e) { }
	return num || 0;
};

Mail.prototype._isLikelyNetAddress = function (addr) {
	if (!addr) return false;
	if (typeof netaddr_type === 'function') {
		var type = netaddr_type(addr);
		if (typeof NET_NONE !== 'undefined') {
			if (type !== NET_NONE) return true;
		} else if (type) return true;
	}
	return /[@:!\\/]/.test(addr);
};

// Enter non-blocking recipient prompt mode
Mail.prototype._enterRecipientPrompt = function () {
	this._destroyPromptFrames();
	this._ensureFrames();
	this.mode = 'promptRecipient';
	this._recipBuf = '';
	var host = this.outputFrame || this.parentFrame;
	if (!host) return;
	var startRow = (this._iconGridHeight || 0) + 1;
	if (startRow < 1) startRow = 1;
	if (startRow >= host.height) startRow = Math.max(1, host.height - 1);
	var guideY = startRow;
	var labelY = Math.min(host.height, guideY + 1);
	var cols = host.width;
	this._promptGuide = new Frame(1, guideY, cols, 1, BG_BLACK | MAGENTA, host); this._promptGuide.open();
	this._promptGuide.putmsg('Who do you want to send this email to?');
	this._promptLabel = new Frame(1, labelY, 4, 1, BG_BLACK | YELLOW, host); this._promptLabel.open(); this._promptLabel.putmsg('to:');
	var fieldW = Math.min(60, Math.max(10, cols - 6 - 1));
	var fieldY = labelY;
	if (fieldY > host.height) fieldY = host.height;
	this._promptField = new Frame(6, fieldY, fieldW, 1, BG_BLUE | WHITE, host); this._promptField.open();
	this._redrawRecipientField();
};

Mail.prototype._redrawRecipientField = function () {
	if (!this._promptField) return;
	var buf = this._recipBuf || '';
	var show = buf;
	if (show.length > this._promptField.width) show = show.substr(show.length - this._promptField.width);
	this._promptField.clear(BG_BLUE | WHITE);
	this._promptField.gotoxy(1, 1);
	this._promptField.putmsg(show);
	this._promptField.cycle();
};

Mail.prototype._commitRecipientPrompt = function (accepted) {
	var rawDest = (accepted && this._recipBuf) ? this._recipBuf.trim() : null;
	this._destroyPromptFrames();
	this.mode = 'icon';
	if (!rawDest) { this.draw(); return; }
	var localUser = this._resolveLocalUser(rawDest);
	var destDisplay = rawDest;
	var sent = false;
	var run;
	if (localUser) {
		destDisplay = system.username(localUser) || ('User #' + localUser);
		run = function () { try { bbs.email(localUser, ''); sent = true; } catch (e) { } };
	} else if (this._isLikelyNetAddress(rawDest)) {
		var addrs = rawDest.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
		if (!addrs.length) { this._toastSent && this._toastSent('Invalid address'); this.draw(); return; }
		run = function () { try { bbs.netmail(addrs); sent = true; } catch (e) { } };
	} else {
		this._toastSent && this._toastSent('Unknown user');
		this.draw();
		return;
	}
	var shell = this.shell;
	if (shell && typeof shell.runExternal === 'function') shell.runExternal(run, { programId: 'mail:send' });
	else run();
	this.updateUnreadCount();
	if (sent) this._toastSent && this._toastSent(destDisplay);
	else if (!localUser)
		this._toastSent && this._toastSent('Delivery failed');
	this._resetState();
	this.draw();
};


Mail.prototype._toastSent = function (dest) {
	try {
		if (!dest) return;
		// Use unified subprogram helper; falls back to console if shell not available
		this._showToast({ message: 'Sent mail to ' + dest, timeout: 5000, position: 'top-left', category: 'mail' });
	} catch (e) { }
};

// Mail inherits the standard enter(done) from Subprogram; no override needed.
// (Subprogram.enter will set the callback, open a frame if needed, and call draw())

Mail.prototype._ensureFrames = function () {
	var host = this.hostFrame || this.parentFrame;
	if (!host) return;
	var expectedOutputHeight = Math.max(1, host.height - 2);
	if (!this.headerFrame || this.headerFrame.width !== host.width || this.headerFrame.height !== 1) {
		if (this.headerFrame) { try { this.headerFrame.close(); } catch (_) { } }
		this.headerFrame = new Frame(host.x, host.y, host.width, 1, this.paletteAttr('HEADER_FRAME'), host);
		this.headerFrame.open();
	} else if (this.headerFrame.is_open === false) {
		try { this.headerFrame.open(); } catch (e) { }
	}
	if (!this.outputFrame || this.outputFrame.width !== host.width || this.outputFrame.height !== expectedOutputHeight) {
		if (this.outputFrame) {
			try { this.outputFrame.close(); } catch (_) { }
		}
		this.outputFrame = new Frame(host.x, host.y + 1, host.width, expectedOutputHeight, this.paletteAttr('MAIN_FRAME'), host);
		this.outputFrame.open();
		this.setBackgroundFrame(this.outputFrame);
	} else if (this.outputFrame.is_open === false) {
		try { this.outputFrame.open(); } catch (e2) { }
		this.setBackgroundFrame(this.outputFrame);
	}
	var footerParent = host.parent || host;
	if (!this.footerFrame || this.footerFrame.width !== host.width) {
		if (this.footerFrame) { try { this.footerFrame.close(); } catch (_) { } }
		this.footerFrame = new Frame(host.x, host.height, host.width, 1, this.paletteAttr('FOOTER_FRAME'), footerParent);
		this.footerFrame.open();
	} else if (this.footerFrame.is_open === false) {
		try { this.footerFrame.open(); } catch (e3) { }
	}
	if (this.parentFrame && this.parentFrame.is_open === false) {
		try { this.parentFrame.open(); } catch (_) { }
	}
};

Mail.prototype.draw = function () {
	this._ensureFrames();
	if (!this.outputFrame || !this.footerFrame) return;
	// Ensure our parent frame (and thus subprogram visuals) stays above shell folder frames
	try { if (this.parentFrame && typeof this.parentFrame.top === 'function') this.parentFrame.top(); } catch (e) { }
	var o = this.outputFrame; o.clear();
	o.gotoxy(1, 1);
	if (this.hotspots) this.hotspots.clear();
	var gridInfo = this.drawIconGrid(o) || { heightUsed: 3 };
	this._iconGridHeight = gridInfo.heightUsed || 0;
	// Register hotspots for each icon cell region (map to digit key 1..9 / A.. etc if >9 later)
	this._addMouseHotspots();
	// Clear all borders, then draw border on currently selected item
	if (this.iconCells) {
		for (var b = 0; b < this.iconCells.length; b++) {
			this.clearCellBorder(this.iconCells[b]);
		}
	}
	if (this.iconCells && this.iconCells[this.selectedIndex]) {
		this.drawCellBorder(this.iconCells[this.selectedIndex]);
	}
	// scrollback below icons
	var reservedRows = 0;
	if (this.mode === 'promptRecipient') {
		reservedRows = (gridInfo.heightUsed + 1 < o.height) ? 2 : 1;
	}
	var scrollStartY = gridInfo.heightUsed + 1 + reservedRows;
	if (scrollStartY < 1) scrollStartY = 1;
	if (scrollStartY > o.height + 1) scrollStartY = o.height + 1;
	var visibleLines = Math.max(0, o.height - (scrollStartY - 1));
	if (visibleLines > 0) {
		o.gotoxy(1, scrollStartY);
		var start = Math.max(0, this.scrollback.length - visibleLines - this.scrollOffset);
		var end = Math.min(this.scrollback.length, start + visibleLines);
		for (var li = start; li < end; li++) {
			var line = this.scrollback[li]; if (line.length > o.width) line = line.substr(0, o.width); o.putmsg(line + '\r\n');
		}
	}
	if (this.mode === 'confirm' && this.confirmFor) {
		o.putmsg('\r\nConfirm ' + (this.confirmFor.baseLabel || 'action') + '? (Y/N)\r\n');
	}
	this._drawInput();
	this.headerFrame.center("Mail (" + (this.unreadCount || 0) + " new, " + (this.totalMailCount || 0) + " total)");
	this.parentFrame.cycle();
};

Mail.prototype._drawInput = function () {
	if (!this.footerFrame) return;
	var f = this.footerFrame; f.clear(); f.gotoxy(1, 1);
	var prompt = '';
	if (this.mode === 'promptRecipient') prompt = 'Type recipient, ENTER=send, ESC=cancel';
	else if (this.mode === 'confirm') prompt = 'Y/N confirm';
	else prompt = 'Arrows/1-' + this.menuOptions.length + ' Enter=Run PgUp/PgDn scroll';
	if (prompt.length > f.width) prompt = prompt.substr(0, f.width);
	f.putmsg(prompt);
	f.cycle();
};

Mail.prototype.handleKey = function (k) {
	if (!k) return;
	if (k === '\x1B') {
		if (this.mode === 'confirm') { this.mode = 'icon'; this.confirmFor = null; this.draw(); return; }
		if (this.mode === 'promptRecipient') { this._commitRecipientPrompt(false); return; }
		this.exit(); return;
	}
	if (k === 'Q' || k === 'q') { this.exit(); return; }
	if (this.mode === 'promptRecipient') {
		if (k === '\r' || k === '\n') { this._commitRecipientPrompt(true); return; }
		if ((k === '\b' || k === '\x7f') && this._recipBuf && this._recipBuf.length) { this._recipBuf = this._recipBuf.substr(0, this._recipBuf.length - 1); this._redrawRecipientField(); return; }
		if (k.length === 1 && k >= ' ' && k <= '~' && this._recipBuf.length < 120) { this._recipBuf += k; this._redrawRecipientField(); return; }
		return; // swallow other keys
	}
	if (this.mode === 'confirm') {
		if (k === 'Y' || k === 'y') { this.invokeConfirmed(); return; }
		if (k === 'N' || k === 'n') { this.mode = 'icon'; this.confirmFor = null; this.draw(); return; }
		return;
	}
	switch (k) {
		case 'KEY_UP':
		case '\x1B[A':
		case '\x1E':
		case KEY_UP:
			this._moveMenuSelection(0, -1); return;
		case 'KEY_DOWN':
		case '\x1B[B':
		case '\x0A':
		case KEY_DOWN:
			this._moveMenuSelection(0, 1); return;
		case 'KEY_LEFT':
		case '\x1B[D':
		case KEY_LEFT:
		case "\u001d":
			this._moveMenuSelection(-1, 0); return;
		case 'KEY_RIGHT':
		case '\x1B[C':
		case KEY_RIGHT:
		case "\u0006":
			this._moveMenuSelection(1, 0); return;
		case '\r':
		case '\n':
		case 'KEY_ENTER':
			this.invokeSelected(); return;
		default:
			if (k.length === 1 && k >= '1' && k <= '9') {
				var idx = parseInt(k, 10) - 1; if (idx < this.menuOptions.length) { this.selectedIndex = idx; this.draw(); this.invokeSelected(); return; }
			}
	}
};

Mail.prototype._moveMenuSelection = function (dx, dy) {
	if (this.mode !== 'icon' || !this.menuOptions || !this.menuOptions.length) return;
	var cols = this._iconCols || this.menuOptions.length;
	if (cols < 1) cols = this.menuOptions.length;
	var idx = this.selectedIndex;
	var row = Math.floor(idx / cols);
	var col = idx % cols;

	if (dx === 1) {
		// Move right: next column in same row, or wrap to next row
		col = col + 1;
		if (col >= cols) {
			col = 0;
			row = row + 1;
		}
		idx = (row * cols) + col;
		if (idx >= this.menuOptions.length) idx = this.selectedIndex; // stay put if out of bounds
	} else if (dx === -1) {
		// Move left: previous column in same row, or wrap to previous row
		col = col - 1;
		if (col < 0) {
			col = cols - 1;
			row = row - 1;
		}
		idx = (row * cols) + col;
		if (idx < 0 || row < 0) idx = this.selectedIndex; // stay put if out of bounds
	} else if (dy === 1) {
		idx = Math.min(this.menuOptions.length - 1, idx + cols);
	} else if (dy === -1) {
		idx = Math.max(0, idx - cols);
	}

	if (idx !== this.selectedIndex) {
		// Clear border from previous selection
		if (this.iconCells && this.iconCells[this.selectedIndex]) {
			this.clearCellBorder(this.iconCells[this.selectedIndex]);
		}
		this.selectedIndex = idx;
		// Draw border on new selection
		if (this.iconCells && this.iconCells[this.selectedIndex]) {
			this.drawCellBorder(this.iconCells[this.selectedIndex]);
		}
		this.draw();
	}
};

Mail.prototype.invokeSelected = function () {
	var opt = this.menuOptions[this.selectedIndex]; if (!opt) return;
	if (opt.confirm) { this.mode = 'confirm'; this.confirmFor = opt; this.draw(); return; }

	// Play dissolve animation before launching
	try {
		if (this.shell && typeof this.shell.playDissolveBefore === 'function') {
			// Map local selectedIndex to appropriate cell for dissolve
			if (this.iconCells && this.iconCells[this.selectedIndex] && this.iconCells[this.selectedIndex].icon) {
				var cell = this.iconCells[this.selectedIndex];
				var wasTransparent = cell.icon.transparent;
				cell.icon.transparent = false;
				var fallbackDissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
				var dissolveColor = fallbackDissolveColor;
				try {
					dissolve(cell.icon, dissolveColor, 5);
				} catch (e) {
					dbug("dissolve error in mail invokeSelected: " + e, "view");
				}
				cell.icon.transparent = wasTransparent;
				cell.icon.clear();
				cell.icon.cycle();
			}
		}
	} catch (e) {
		dbug("Error in invokeSelected dissolve: " + e, "view");
	}

	try { opt.action && opt.action(); } catch (e) { /* suppressed option error */ }
};

Mail.prototype.invokeConfirmed = function () {
	var opt = this.confirmFor; this.mode = 'icon'; this.confirmFor = null; if (!opt) { this.draw(); return; }
	try { opt.action && opt.action(); } catch (e) { /* suppressed option error */ }
};

// Removed suspend/resume logic; using shell.runExternal wrapper

Mail.prototype.renderOptionLabel = function (opt, idx) {
	var info = this._buildOptionLabelInfo(opt, idx);
	if (opt) {
		opt._labelSegments = info.segments;
	}
	return info.text;
};

Mail.prototype._buildOptionLabelInfo = function (opt, idx) {
	opt = opt || {};
	var baseLabel = opt.baseLabel || opt.label || ('Option ' + (idx + 1));
	var unread = Math.max(0, parseInt(this.unreadCount, 10) || 0);
	var total = Math.max(0, parseInt(this.totalMailCount, 10) || 0);
	if (total < unread) total = unread;
	var segments = null;
	var text = baseLabel;
	if (opt.dynamic && /Inbox/i.test(baseLabel)) {
		segments = [];
		text = '';
		if (unread > 0) {
			var unreadText = String(unread);
			segments.push({ text: unreadText, color: typeof LIGHTGREEN !== 'undefined' ? LIGHTGREEN : GREEN });
			text += unreadText;
			segments.push({ text: ' ', color: null });
			text += ' ';
		}
		segments.push({ text: baseLabel, color: null });
		text += baseLabel;
		segments.push({ text: ' ', color: null });
		text += ' ';
		var totalText = String(total);
		segments.push({ text: totalText, color: typeof YELLOW !== 'undefined' ? YELLOW : WHITE });
		text += totalText;
	}
	return { text: text, segments: segments };
};

Mail.prototype.updateUnreadCount = function () {
	var unread = 0;
	var read = 0;
	var total = 0;
	var stats = (typeof user !== 'undefined' && user && user.stats) ? user.stats : null;
	if (stats) {
		if (typeof stats.unread_mail_waiting === 'number') unread = stats.unread_mail_waiting;
		if (typeof stats.read_mail_waiting === 'number') read = stats.read_mail_waiting;
		if (typeof stats.mail_waiting === 'number') total = stats.mail_waiting;
	}
	if (typeof bbs !== 'undefined') {
		try {
			if (!total) {
				if (typeof bbs.mail_waiting === 'number') total = bbs.mail_waiting;
				else if (typeof bbs.mail_waiting === 'function') total = bbs.mail_waiting();
			}
			if (!unread) {
				if (typeof bbs.unread_mail_waiting === 'number') unread = bbs.unread_mail_waiting;
				else if (typeof bbs.unread_mail_waiting === 'function') unread = bbs.unread_mail_waiting();
			}
			if (!read) {
				if (typeof bbs.read_mail_waiting === 'number') read = bbs.read_mail_waiting;
				else if (typeof bbs.read_mail_waiting === 'function') read = bbs.read_mail_waiting();
			}
		} catch (e) { }
	}
	unread = Math.max(0, parseInt(unread, 10) || 0);
	read = Math.max(0, parseInt(read, 10) || 0);
	total = Math.max(0, parseInt(total, 10) || 0);
	if (!total) total = unread + read;
	if (!unread && total && read) unread = Math.max(0, total - read);
	if (total < unread) total = unread;
	this.unreadCount = unread;
	this.totalMailCount = total;
};


Mail.prototype.drawIconGrid = function (o) {
	var ICON_W = (typeof ICSH_CONSTANTS !== 'undefined' ? ICSH_CONSTANTS.ICON_W : 12);
	var ICON_H = (typeof ICSH_CONSTANTS !== 'undefined' ? ICSH_CONSTANTS.ICON_H : 6);
	var labelH = 1;
	this.updateUnreadCount();
	var cellW = ICON_W + 2; // padding similar to main shell
	var cellH = ICON_H + labelH + 1; // top/bottom padding
	var topPadding = 1; // leave an extra blank row above the icon grid
	var cols = Math.max(1, Math.floor((o.width - 2) / cellW));
	var usedWidth = cols * cellW;
	var extraWidth = (o.width - 2) - usedWidth;
	var offsetX = Math.max(0, Math.floor(extraWidth / 2));
	var availableHeight = Math.max(0, o.height - (topPadding + 2));
	var usableRows = Math.max(1, Math.floor(availableHeight / cellH));
	var maxIcons = cols * usableRows;
	var needRebuild = false;
	if (!this.iconCells || this.iconCells.length === 0) needRebuild = true;
	// Rebuild if column count changed or menu length changed
	if (this._iconCols !== cols || (this.iconCells && this.iconCells.length !== this.menuOptions.length)) needRebuild = true;
	if (!needRebuild && this.iconCells) {
		for (var c = 0; c < this.iconCells.length; c++) {
			var existing = this.iconCells[c];
			if (!existing) { needRebuild = true; break; }
			if ((existing.icon && existing.icon.is_open === false) || (existing.label && existing.label.is_open === false)) {
				needRebuild = true;
				break;
			}
		}
	}
	if (needRebuild) {
		// close old frames
		this._destroyIconCells();
		for (var i = 0; i < this.menuOptions.length && i < maxIcons; i++) {
			var col = i % cols;
			var row = Math.floor(i / cols);
			var x = (col * cellW) + 2 + offsetX;
			var y = topPadding + (row * cellH) + 1;
			if (y + ICON_H + labelH > o.height) break;
			var opt = this.menuOptions[i];
			var labelText = this.renderOptionLabel(opt, i);
			var segments = opt && opt._labelSegments ? opt._labelSegments.slice() : null;
			// Provide a label property for Icon class (doesn't mutate baseLabel permanently)
			var item = { label: labelText, iconFile: opt.iconFile, iconBg: opt.iconBg, iconFg: opt.iconFg, _labelSegments: segments };
			var iconFrame = new Frame(o.x + x - 1, o.y + y - 1, ICON_W, ICON_H, BG_BLACK | LIGHTGRAY, o.parent);
			var labelFrame = new Frame(o.x + x - 1, o.y + y - 1 + ICON_H, ICON_W, labelH, BG_BLACK | LIGHTGRAY, o.parent);

			// Create border frame for selection highlighting (positioned around icon+label with 1-cell margin)
			var borderFrame = new Frame(o.x + x - 2, o.y + y - 2, ICON_W + 2, ICON_H + labelH + 2, BG_BLACK | LIGHTGRAY, o.parent);
			borderFrame.transparent = true;
			if (typeof borderFrame.open === 'function') borderFrame.open();

			var iconObj = new Icon(iconFrame, labelFrame, item);
			iconObj.render();
			this.iconCells.push({ icon: iconFrame, label: labelFrame, item: item, iconObj: iconObj, borderFrame: borderFrame });
		}
		this._iconCols = cols;
	}
	// Update labels (dynamic unread count) & selection highlighting
	for (var j = 0; j < this.iconCells.length; j++) {
		var cell = this.iconCells[j];
		var opt = this.menuOptions[j];
		var info = this._buildOptionLabelInfo(opt, j);
		cell.item.label = info.text;
		cell.item._labelSegments = info.segments ? info.segments.slice() : null;
		cell.iconObj.render(); // re-render to refresh label (small overhead acceptable here)
		try {
			this._drawMailLabel(cell.label, cell.item, j === this.selectedIndex);
		} catch (e) { }
	}
	var rowsUsed = Math.ceil(this.iconCells.length / cols);
	return { heightUsed: topPadding + (rowsUsed * cellH) + 2 };
};

Mail.prototype._drawMailLabel = function (frame, item, isSelected) {
	if (!frame || !item) return;
	var baseAttr = isSelected ? (BG_BLUE | WHITE) : (BG_BLACK | LIGHTGRAY);
	try { frame.clear(baseAttr); frame.home(); } catch (e) { }
	var width = frame.width || 0;
	if (width <= 0) return;
	var segments = item._labelSegments && item._labelSegments.length ? item._labelSegments : null;
	var text = (item.label || '');
	function repeatSpaces(count) { return (count > 0) ? new Array(count + 1).join(' ') : ''; }
	if (!segments) {
		if (text.length > width) text = text.substr(0, width);
		var left = Math.max(0, Math.floor((width - text.length) / 2));
		var padLeft = repeatSpaces(left);
		var written = 0;
		if (padLeft) { frame.attr = baseAttr; frame.putmsg(padLeft); written += padLeft.length; }
		if (text) { frame.attr = baseAttr; frame.putmsg(text); written += text.length; }
		if (written < width) { frame.attr = baseAttr; frame.putmsg(repeatSpaces(width - written)); }
		return;
	}
	var truncated = [];
	var visible = 0;
	for (var s = 0; s < segments.length; s++) {
		var seg = segments[s];
		var segText = seg && seg.text ? String(seg.text) : '';
		if (!segText.length && segText !== '0') continue;
		var remaining = width - visible;
		if (remaining <= 0) break;
		if (segText.length > remaining) segText = segText.substr(0, remaining);
		truncated.push({ text: segText, color: seg ? seg.color : null });
		visible += segText.length;
	}
	if (!truncated.length) {
		frame.attr = baseAttr;
		frame.putmsg(repeatSpaces(width));
		return;
	}
	var leftPad = Math.max(0, Math.floor((width - visible) / 2));
	var writtenTotal = 0;
	var bg = baseAttr & 0xF0;
	var pad = repeatSpaces(Math.min(leftPad, width));
	if (pad) { frame.attr = baseAttr; frame.putmsg(pad); writtenTotal += pad.length; }
	for (var t = 0; t < truncated.length && writtenTotal < width; t++) {
		var segment = truncated[t];
		var segText2 = segment.text;
		if (!segText2.length && segText2 !== '0') continue;
		var attr = (segment.color !== null && typeof segment.color === 'number') ? (bg | segment.color) : baseAttr;
		frame.attr = attr;
		frame.putmsg(segText2);
		writtenTotal += segText2.length;
	}
	if (writtenTotal < width) {
		frame.attr = baseAttr;
		frame.putmsg(repeatSpaces(width - writtenTotal));
	}
};

Mail.prototype.drawCellBorder = function (cell) {
	if (!cell || !cell.borderFrame) return;
	var borderColor = (typeof CYAN !== 'undefined' ? CYAN : 6);
	try {
		cell.borderFrame.drawBorder(borderColor);
		cell.borderFrame.cycle();
	} catch (e) {
		dbug('drawCellBorder error: ' + e, 'view');
	}
};

Mail.prototype.clearCellBorder = function (cell) {
	if (!cell || !cell.borderFrame) return;
	try {
		cell.borderFrame.clear();
		cell.borderFrame.cycle();
	} catch (e) {
		dbug('clearCellBorder error: ' + e, 'view');
	}
};

Mail.prototype._addMouseHotspots = function () {
	if (!this.hotspots) return;
	if (!this.iconCells || !this.iconCells.length) {
		this.hotspots.clear();
		return;
	}
	var defs = [];
	for (var i = 0; i < this.iconCells.length && i < 9; i++) { // limit to 1-9 for now
		var cell = this.iconCells[i];
		if (!cell || !cell.icon) continue;
		var cmd = String(i + 1);
		var min_x = cell.icon.x;
		var max_x = cell.icon.x + cell.icon.width - 1;
		var min_y = cell.icon.y;
		var max_y = cell.icon.y + cell.icon.height; // include label line below
		defs.push({
			key: cmd,
			x: min_x,
			y: min_y,
			width: Math.max(1, max_x - min_x + 1),
			height: Math.max(1, max_y - min_y + 1),
			swallow: false,
			owner: 'mail'
		});
	}
	this.hotspots.set(defs);
};

Mail.prototype.ensureIconVisible = function () { };

Mail.prototype._destroyIconCells = function () {
	if (!this.iconCells) return;
	for (var i = 0; i < this.iconCells.length; i++) {
		var cell = this.iconCells[i];
		if (!cell) continue;
		try { if (cell.icon) cell.icon.close(); } catch (e) { }
		try { if (cell.label) cell.label.close(); } catch (e) { }
		try { if (cell.borderFrame) cell.borderFrame.close(); } catch (e) { }
	}
	this.iconCells = [];
	this._iconCols = null;
	this._iconGridHeight = 0;
};

function pad(str, len, ch) { if (ch === undefined) ch = ' '; if (str.length > len) return str.substr(0, len); while (str.length < len) str += ch; return str; }

Mail.prototype._cleanup = function () {
	this._destroyPromptFrames();
	this._destroyIconCells();
	this._resetState();
	if (this.hotspots) this.hotspots.clear();
	if (this.outputFrame) {
		try { this.outputFrame.clear(); } catch (_e) { }
		try { this.outputFrame.close(); } catch (_e2) { }
		this.outputFrame = null;
	}
	if (this.footerFrame) {
		try { this.footerFrame.clear(); } catch (_e3) { }
		try { this.footerFrame.close(); } catch (_e4) { }
		this.footerFrame = null;
	}
	if (this.headerFrame) {
		try { this.headerFrame.clear(); } catch (_e6) { }
		try { this.headerFrame.close(); } catch (_e7) { }
		this.headerFrame = null;
	}
	if (this.parentFrame) {
		try { this.parentFrame.cycle(); } catch (_e5) { }
	}
};

Mail.prototype._resetState = function () {
	this.selectedIndex = 0;
	this.lastMessage = '';
	this.mode = 'icon';
	this.confirmFor = null;
	this.scrollback = [];
	this.scrollOffset = 0;
	this.maxScrollLines = 1000;
	this._recipBuf = '';
	this._iconGridHeight = 0;
};

Mail.prototype.exit = function () {
	log('exiting mail');
	if (this.hotspots) this.hotspots.clear();
	var shell = this.shell;
	Subprogram.prototype.exit.call(this);
	if (shell) {
		if (shell._pendingSubLaunch && shell._pendingSubLaunch.instance === this) {
			shell._pendingSubLaunch = null;
		}
		if (shell.activeSubprogram === this) {
			shell.exitSubprogram();
		}
	}
};

// Export constructor globally
registerModuleExports({ Mail: Mail });
