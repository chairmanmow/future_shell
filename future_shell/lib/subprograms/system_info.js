// System Info Subprogram
"use strict";
// Displays selected properties from global 'system' object.
// Configure the fields to display by editing SYS_INFO_FIELDS below.
// key = property name on global 'system'; value = human-friendly label.
// Order of appearance follows the literal declaration order.

load('sbbsdefs.js');
load('key_defs.js');
load('future_shell/lib/subprograms/subprogram.js');
load('future_shell/lib/util/draw_ansi_bin.js');
if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

// Helper functions
function repeat(str, count) {
	var result = '';
	for (var i = 0; i < count; i++) result += str;
	return result;
}

function ascii(code) {
	return String.fromCharCode(code);
}

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

// Load contributors from .ini file
function loadContributorsFromIni(iniPath) {
	var shoutouts = [];
	var credits = [];

	try {
		var file = new File(iniPath);
		if (!file.open('r')) {
			// Return default data if file doesn't exist
			return {
				shoutouts: [
					{
						contributor: "Rob Swindell (Deuce)",
						contribution: "Creator and maintainer of Synchronet BBS",
						graphic: null
					}
				],
				credits: [
					{
						contributor: "Future Shell Team",
						contribution: "Modern shell interface development",
						graphic: null
					}
				]
			};
		}

		// Get all section names
		var sections = file.iniGetSections();

		for (var i = 0; i < sections.length; i++) {
			var section = sections[i];
			var contributor = file.iniGetValue(section, 'contributor', '');
			var contribution = file.iniGetValue(section, 'contribution', '');
			var graphic = file.iniGetValue(section, 'graphic', null);
			var type = file.iniGetValue(section, 'type', 'credit');

			if (!contributor || !contribution) continue;

			var entry = {
				contributor: contributor,
				contribution: contribution,
				graphic: graphic
			};

			if (type.toLowerCase() === 'shoutout') {
				shoutouts.push(entry);
			} else {
				credits.push(entry);
			}
		}

		file.close();
	} catch (e) {
		// Return default data on error
		return {
			shoutouts: [
				{
					contributor: "Rob Swindell (Deuce)",
					contribution: "Creator and maintainer of Synchronet BBS",
					graphic: null
				}
			],
			credits: [
				{
					contributor: "Future Shell Team",
					contribution: "Modern shell interface development",
					graphic: null
				}
			]
		};
	}

	return { shoutouts: shoutouts, credits: credits };
}

function _getSystemValuePath(path) {
	try {
		if (typeof system === 'undefined' || system === null) return 'n/a';
		if (!path) return 'n/a';
		var parts = path.split('.');
		var cur = system;
		for (var i = 0; i < parts.length; i++) {
			if (cur == null) return 'n/a';
			var seg = parts[i];
			if (!Object.prototype.hasOwnProperty.call(cur, seg) && !(seg in cur)) return 'n/a';
			cur = cur[seg];
		}
		if (cur === undefined || cur === null) return 'n/a';
		if (typeof cur === 'function') {
			// If it's a function with zero arity we can attempt to invoke; otherwise tag as function
			try { if (cur.length === 0) { cur = cur(); } else return '[function]'; } catch (e) { return '[function err]'; }
		}
		// Basic friendly formatting for objects
		if (typeof cur === 'object') {
			try { return JSON.stringify(cur); } catch (e) { return '[object]'; }
		}
		return String(cur);
	} catch (e) { return 'err'; }
}

function SystemInfo(opts) {
	opts = opts || {};
	Subprogram.call(this, { name: 'system-info', parentFrame: opts.parentFrame, shell: opts.shell });
	this.shell = opts.shell || this.shell;

	// Register color palette
	this.registerColors({
		TAB_BORDER: { BG: BG_BLACK, FG: WHITE },
		TAB_INACTIVE: { BG: BG_BLACK, FG: LIGHTGRAY },
		TAB_ACTIVE: { BG: BG_CYAN, FG: BLACK },
		TAB_CLOSE: { BG: BG_RED, FG: WHITE },
		TAB_CLOSE_HOVER: { BG: BG_RED, FG: YELLOW },
		CONTENT_BG: { BG: BG_BLACK, FG: LIGHTGRAY },
		CONTENT_LABEL: { BG: BG_BLACK, FG: CYAN },
		CONTENT_VALUE: { BG: BG_BLACK, FG: WHITE },
		SHOUTOUT_NAME: { BG: BG_BLACK, FG: YELLOW },
		SHOUTOUT_TEXT: { BG: BG_BLACK, FG: WHITE },
		CREDITS_NAME: { BG: BG_BLACK, FG: GREEN },
		CREDITS_TEXT: { BG: BG_BLACK, FG: WHITE },
		INPUT_BAR: { BG: BG_BLUE, FG: WHITE }
	});

	// View state
	this.currentView = 'system'; // 'close' | 'help' | 'system' | 'shoutout' | 'credits' | 'modifications' | 'manifesto'
	this.views = ['close', 'help', 'system', 'shoutout', 'credits', 'modifications', 'manifesto'];
	this.viewTitles = {
		'close': '[X]',
		'help': 'Help',
		'system': 'System Info',
		'shoutout': 'Shout Out',
		'credits': 'Credits',
		'modifications': 'Modifications',
		'manifesto': 'Manifesto'
	};

	// Frames
	this.bannerFrame = null;
	this.headerFrame = null;
	this.outputFrame = null;
	this.inputFrame = null;

	// Banner configuration
	this.bannerFile = 'futureland_banner_2.bin'; // Default banner file

	// Hotspot tracking
	this._hotspotActive = false;
	this._tabHotspotMap = {}; // Maps single char hotspot keys to view IDs

	// Load contributors data from .ini file
	var iniPath = js.exec_dir + 'future_shell/config/contributors.ini';
	var contributorsData = loadContributorsFromIni(iniPath);
	this.shoutoutData = contributorsData.shoutouts;
	this.creditsData = contributorsData.credits;

	// Data and scrolling - track per view
	this.viewData = {
		'help': { lines: null, scrollOffset: 0 },
		'system': { lines: [], scrollOffset: 0 },
		'shoutout': { lines: null, scrollOffset: 0 },
		'credits': { lines: null, scrollOffset: 0 },
		'modifications': { lines: null, scrollOffset: 0 },
		'manifesto': { lines: null, scrollOffset: 0 }
	};

	this.refresh();
}

extend(SystemInfo, Subprogram);

// Helper function to strip SAUCE metadata from file content
function stripSauce(content) {
	if (!content || content.length < 128) return content;

	// Look for SAUCE00 in the last 512 bytes
	var tailWindow = content.slice(-512);
	var saucePos = tailWindow.lastIndexOf('SAUCE00');

	if (saucePos > -1) {
		var globalPos = content.length - 512 + saucePos;
		if (globalPos >= 0) {
			return content.substring(0, globalPos);
		}
	}

	return content;
}

SystemInfo.prototype.refresh = function () {
	var order = [];
	for (var k in SYS_INFO_FIELDS) { if (SYS_INFO_FIELDS.hasOwnProperty(k)) order.push(k); }
	var lines = [];
	for (var i = 0; i < order.length; i++) {
		var key = order[i];
		var label = SYS_INFO_FIELDS[key] || key;
		var val = _getSystemValuePath(key);
		lines.push({ label: label, value: val });
	}
	// Timestamp line as structured entry
	try { lines.push({ label: 'Updated', value: new Date().toISOString() }); } catch (e) { }

	// Store in viewData
	this.viewData['system'].lines = lines;
};

SystemInfo.prototype._ensureFrames = function () {
	if (!this.parentFrame) return;

	var currentY = 1;
	var bannerHeight = 6;

	// Banner frame: centered 80x6 frame at the top
	if (!this.bannerFrame) {
		var bannerWidth = Math.min(80, this.parentFrame.width);
		var bannerX = Math.floor((this.parentFrame.width - bannerWidth) / 2) + 1;
		this.bannerFrame = new Frame(bannerX, currentY, bannerWidth, bannerHeight, ICSH_ATTR('SYSINFO_OUTPUT'), this.parentFrame);
		this.bannerFrame.open();
	}
	currentY += bannerHeight;

	if (!this.headerFrame) {
		// Header frame: 3 lines for border top, tabs, and border bottom
		this.headerFrame = new Frame(1, currentY, this.parentFrame.width, 3, ICSH_ATTR('SYSINFO_OUTPUT'), this.parentFrame);
		this.headerFrame.open();
	}
	currentY += 3;

	if (!this.outputFrame) {
		// Output frame: everything between header and input
		var remainingHeight = this.parentFrame.height - currentY;
		var h = Math.max(1, remainingHeight); // Leave 1 line for input at bottom
		this.outputFrame = new Frame(1, currentY, this.parentFrame.width, h, ICSH_ATTR('SYSINFO_OUTPUT'), this.parentFrame);
		this.outputFrame.open();
	}

	if (!this.inputFrame) {
		// Input frame: bottom line
		this.inputFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, ICSH_ATTR('SYSINFO_INPUT'), this.parentFrame);
		this.inputFrame.open();
	}
};

SystemInfo.prototype._drawBanner = function () {
	if (!this.bannerFrame) return;
	var f = this.bannerFrame;
	f.clear();

	// Load and display .bin file using frame.load()
	var binFile = js.exec_dir + 'future_shell/assets/text/' + this.bannerFile;
	if (file_exists(binFile)) {
		try {
			f.load(binFile, f.width, f.height);
		} catch (e) {
			// Silently fail if banner can't be loaded
		}
	}

	f.cycle();
};

SystemInfo.prototype._drawHeader = function () {
	if (!this.headerFrame) return;
	var f = this.headerFrame;
	f.clear();
	f.gotoxy(1, 1);

	var borderAttr = this.paletteAttr('TAB_BORDER');

	// Top border
	f.attr = borderAttr;
	f.putmsg(ascii(218) + repeat(ascii(196), f.width - 2) + ascii(191) + '\r\n');

	// Tab bar - calculate absolute screen coordinates for hotspots
	// headerFrame is now at Y=7 (after 6 lines of banner) relative to parentFrame
	// Line 1 of headerFrame = top border
	// Line 2 of headerFrame = tab bar (where we add hotspots)
	var parentAbsY = this.parentFrame ? this.parentFrame.y : 1;
	var parentAbsX = this.parentFrame ? this.parentFrame.x : 1;
	// headerFrame.y is relative position (7), so absolute Y = parentAbsY + headerFrame.y - 1 + line offset
	// Line 2 of headerFrame in absolute coords = parentAbsY + 6 (banner height) + 1 (line 2)
	var screenY = parentAbsY + 6 + 1;
	var currentX = parentAbsX; // Start at parent's X position

	f.attr = borderAttr;
	f.putmsg(ascii(179));
	currentX++; // After left border

	// Clear old hotspots and map
	this._clearHotspots();
	this._tabHotspotMap = {};

	for (var i = 0; i < this.views.length; i++) {
		var viewId = this.views[i];
		var title = this.viewTitles[viewId];
		var isActive = (viewId === this.currentView);
		var titleLen = title.length;

		// Determine color based on tab type and state
		var tabAttr;
		if (viewId === 'close') {
			tabAttr = isActive ? this.paletteAttr('TAB_CLOSE_HOVER') : this.paletteAttr('TAB_CLOSE');
		} else {
			tabAttr = isActive ? this.paletteAttr('TAB_ACTIVE') : this.paletteAttr('TAB_INACTIVE');
		}

		// Add separator before non-first tabs
		if (i > 0) {
			f.attr = borderAttr;
			f.putmsg(ascii(179));
			currentX++;
		}

		// Draw tab
		f.attr = tabAttr;
		f.putmsg(title);

		// Add hotspot
		var hotspotToken;
		if (viewId === 'close') {
			// Close tab uses 'Q' as its hotspot key
			hotspotToken = 'Q';
		} else {
			// Other tabs use control chars
			hotspotToken = String.fromCharCode(0x10 + i);
		}
		this._tabHotspotMap[hotspotToken] = viewId;
		this._addHotspot(hotspotToken, currentX, currentX + titleLen - 1, screenY);

		currentX += titleLen;
	}

	// Remove 'Q' from the map so clicking close tab exits immediately instead of switching to close view
	// The hotspot is still registered, but won't be intercepted by the hotspot handler
	delete this._tabHotspotMap['Q'];

	// Pad remaining space to right edge
	var usedWidth = 2; // borders
	for (var j = 0; j < this.views.length; j++) {
		usedWidth += this.viewTitles[this.views[j]].length;
	}
	usedWidth += (this.views.length - 1); // separators
	var remaining = f.width - usedWidth;
	if (remaining > 0) {
		f.attr = borderAttr;
		f.putmsg(repeat(' ', remaining));
	}

	f.attr = borderAttr;
	f.putmsg(ascii(179) + '\r\n');

	// Bottom border of header
	f.attr = borderAttr;
	f.putmsg(ascii(192) + repeat(ascii(196), f.width - 2) + ascii(217));

	f.cycle();
};

SystemInfo.prototype._addHotspot = function (key, startX, endX, y) {
	if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
	try {
		console.add_hotspot(JSON.stringify(key), false, startX, endX, y - 1);
		console.add_hotspot(JSON.stringify(key), false, startX, endX, y);
		console.add_hotspot(JSON.stringify(key), false, startX, endX, y + 1);
		this._hotspotActive = true;
	} catch (e) { }
};

SystemInfo.prototype._clearHotspots = function () {
	if (!this._hotspotActive) return;
	if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
		try {
			console.clear_hotspots();
			this._hotspotActive = false;
		} catch (e) { }
	}
};


SystemInfo.prototype.draw = function () {
	this._ensureFrames();
	if (!this.outputFrame || !this.inputFrame || !this.headerFrame || !this.bannerFrame) return;

	// Draw banner
	this._drawBanner();

	// Draw header with tabs
	this._drawHeader();

	// Draw current view content
	switch (this.currentView) {
		case 'close':
			this._drawCloseView();
			break;
		case 'help':
			this._drawHelpView();
			break;
		case 'system':
			this._drawSystemInfoView();
			break;
		case 'shoutout':
			this._drawShoutOutView();
			break;
		case 'credits':
			this._drawCreditsView();
			break;
		case 'modifications':
			this._drawModificationsView();
			break;
		case 'manifesto':
			this._drawManifestoView();
			break;
	}

	// Draw input/help bar
	this._drawInput();

	// Cycle parent to show everything
	this.parentFrame.cycle();
};

SystemInfo.prototype._drawCloseView = function () {
	if (!this.outputFrame) return;
	var f = this.outputFrame;
	f.clear();
	f.gotoxy(1, 1);

	var textAttr = this.paletteAttr('CONTENT_BG');
	var highlightAttr = this.paletteAttr('TAB_CLOSE');

	f.attr = textAttr;
	f.putmsg('\r\n\r\n  Press ');
	f.attr = highlightAttr;
	f.putmsg('ENTER');
	f.attr = textAttr;
	f.putmsg(' to exit System Info\r\n\r\n  Or use arrow keys to navigate to another tab.\r\n');

	f.cycle();
};

SystemInfo.prototype._drawSystemInfoView = function () {
	if (!this.outputFrame) return;
	var f = this.outputFrame;
	f.clear();
	f.gotoxy(1, 1);

	var labelAttr = this.paletteAttr('CONTENT_LABEL');
	var valueAttr = this.paletteAttr('CONTENT_VALUE');

	var lines = this.viewData['system'].lines;
	var scrollOffset = this.viewData['system'].scrollOffset;
	var visibleHeight = f.height;

	// Draw system info lines with scrolling
	var displayEnd = Math.min(scrollOffset + visibleHeight, lines.length);
	for (var i = scrollOffset; i < displayEnd; i++) {
		var entry = lines[i];
		var label = entry.label;
		var value = entry.value;

		// Truncation logic
		var maxWidth = f.width - 2;
		var plain = label + ': ' + value;
		if (plain.length > maxWidth) {
			var overflow = plain.length - maxWidth;
			if (overflow > 0 && value.length > overflow) {
				value = value.substring(0, value.length - overflow - 3) + '...';
			}
		}

		f.attr = labelAttr;
		f.putmsg(label + ': ');
		f.attr = valueAttr;
		f.putmsg(value + '\r\n');
	}
	f.cycle();
};

SystemInfo.prototype._loadMsgFile = function (filename) {
	var msgFile = js.exec_dir + 'future_shell/assets/text/' + filename;
	var lines = [];
	try {
		var file = new File(msgFile);
		if (file.open('r')) {
			// Read entire file and strip SAUCE
			var content = file.read();
			file.close();
			content = stripSauce(content);

			// Split into lines
			var rawLines = content.split(/\r?\n/);
			for (var i = 0; i < rawLines.length; i++) {
				lines.push({ type: 'text', text: rawLines[i], attr: 'CONTENT_VALUE' });
			}
			return lines;
		}
	} catch (e) {
		return [{ type: 'text', text: 'Error loading ' + filename + ': ' + e.toString(), attr: 'CONTENT_VALUE' }];
	}
	return [{ type: 'text', text: 'Could not open ' + msgFile, attr: 'CONTENT_VALUE' }];
};

SystemInfo.prototype._ensureViewLines = function (viewId) {
	if (this.viewData[viewId].lines !== null) return;

	var lines = [];
	switch (viewId) {
		case 'help':
			lines = this._loadMsgFile('future_help.msg');
			break;
		case 'modifications':
			lines = this._loadMsgFile('future_mods.msg');
			break;
		case 'manifesto':
			lines = this._loadMsgFile('future_manifesto.msg');
			break;
		case 'shoutout':
			lines.push({ type: 'text', text: 'Standing on the shoulders of giants', attr: 'CONTENT_VALUE' });
			lines.push({ type: 'text', text: '', attr: 'CONTENT_VALUE' });
			for (var i = 0; i < this.shoutoutData.length; i++) {
				var item = this.shoutoutData[i];
				lines.push({ type: 'text', text: item.contributor, attr: 'SHOUTOUT_NAME' });
				lines.push({ type: 'text', text: '  ' + item.contribution, attr: 'SHOUTOUT_TEXT' });
				lines.push({ type: 'text', text: '', attr: 'CONTENT_VALUE' });
			}
			break;
		case 'credits':
			lines.push({ type: 'text', text: 'Thank you to all contributors', attr: 'CONTENT_VALUE' });
			lines.push({ type: 'text', text: '', attr: 'CONTENT_VALUE' });
			for (var i = 0; i < this.creditsData.length; i++) {
				var item = this.creditsData[i];
				lines.push({ type: 'text', text: item.contributor, attr: 'CREDITS_NAME' });
				lines.push({ type: 'text', text: '  ' + item.contribution, attr: 'CREDITS_TEXT' });
				lines.push({ type: 'text', text: '', attr: 'CONTENT_VALUE' });
			}
			break;
	}

	this.viewData[viewId].lines = lines;
};

SystemInfo.prototype._drawScrollableView = function (viewId) {
	if (!this.outputFrame) return;
	this._ensureViewLines(viewId);

	var f = this.outputFrame;
	f.clear();
	f.gotoxy(1, 1);

	var lines = this.viewData[viewId].lines;
	var scrollOffset = this.viewData[viewId].scrollOffset;
	var visibleHeight = f.height;

	var displayEnd = Math.min(scrollOffset + visibleHeight, lines.length);
	for (var i = scrollOffset; i < displayEnd; i++) {
		var line = lines[i];
		f.attr = this.paletteAttr(line.attr);
		f.putmsg(line.text + '\r\n');
	}

	f.cycle();
};

SystemInfo.prototype._drawHelpView = function () {
	this._drawScrollableView('help');
};

SystemInfo.prototype._drawShoutOutView = function () {
	this._drawScrollableView('shoutout');
};

SystemInfo.prototype._drawCreditsView = function () {
	this._drawScrollableView('credits');
};

SystemInfo.prototype._drawModificationsView = function () {
	this._drawScrollableView('modifications');
};

SystemInfo.prototype._drawManifestoView = function () {
	this._drawScrollableView('manifesto');
};

SystemInfo.prototype._switchView = function (newView) {
	if (this.currentView === newView) return;
	// Reset scroll offset when switching views
	if (this.viewData[newView]) {
		this.viewData[newView].scrollOffset = 0;
	}
	this.currentView = newView;
	this.draw();
};

SystemInfo.prototype._drawInput = function () {
	if (!this.inputFrame) return;
	var f = this.inputFrame;
	f.clear();
	f.gotoxy(1, 1);

	var inputAttr = this.paletteAttr('INPUT_BAR');

	var prompt;
	if (this.currentView === 'close') {
		prompt = 'ENTER: Confirm exit  LEFT/RIGHT: Navigate  ESC: Cancel';
	} else {
		prompt = 'UP/DOWN: Scroll  LEFT/RIGHT: Switch tabs  1-6: Direct select  ESC: Exit';
	}

	if (prompt.length > f.width) prompt = prompt.substring(0, f.width);
	f.attr = inputAttr;
	f.putmsg(prompt);
	f.cycle();
};

SystemInfo.prototype.handleKey = function (k) {
	if (!k) return;

	// Handle hotspot clicks - check if key is in our hotspot map
	if (typeof k === 'string' && k.length === 1 && this._tabHotspotMap[k]) {
		this._switchView(this._tabHotspotMap[k]);
		return;
	}

	// Handle ENTER on close tab
	if (k === '\r' || k === '\n') {
		if (this.currentView === 'close') {
			this.exit();
			return;
		}
	}

	// Handle ESC - exit immediately unless on close tab
	if (k === '\x1B') {
		if (this.currentView === 'close') {
			// ESC from close tab goes back to system tab
			this._switchView('system');
		} else {
			// ESC from other tabs exits immediately
			this.exit();
		}
		return;
	}

	// Q to quit (like ESC)
	if (k === 'Q' || k === 'q') {
		this.exit();
		return;
	}

	// Handle UP/DOWN arrow keys for scrolling
	if (k === KEY_UP) {
		if (this.viewData[this.currentView]) {
			var scrollOffset = this.viewData[this.currentView].scrollOffset;
			if (scrollOffset > 0) {
				this.viewData[this.currentView].scrollOffset--;
				this.draw();
			}
		}
		return;
	}

	if (k === KEY_DOWN) {
		if (this.viewData[this.currentView]) {
			// Ensure lines are loaded for scrollable views
			if (this.currentView !== 'close' && this.currentView !== 'system') {
				this._ensureViewLines(this.currentView);
			}

			var data = this.viewData[this.currentView];
			if (data.lines && this.outputFrame) {
				var maxScroll = Math.max(0, data.lines.length - this.outputFrame.height);
				if (data.scrollOffset < maxScroll) {
					data.scrollOffset++;
					this.draw();
				}
			}
		}
		return;
	}

	// Handle LEFT/RIGHT arrow keys to switch tabs
	if (k === KEY_LEFT) {
		var currentIdx = this.views.indexOf(this.currentView);
		if (currentIdx > 0) {
			this._switchView(this.views[currentIdx - 1]);
		} else {
			// Wrap to last tab
			this._switchView(this.views[this.views.length - 1]);
		}
		return;
	}

	if (k === KEY_RIGHT) {
		var currentIdx = this.views.indexOf(this.currentView);
		if (currentIdx < this.views.length - 1) {
			this._switchView(this.views[currentIdx + 1]);
		} else {
			// Wrap to first tab
			this._switchView(this.views[0]);
		}
		return;
	}

	// Number keys for direct tab access (skip close tab)
	if (k === '1') {
		this._switchView('help');
		return;
	}
	if (k === '2') {
		this._switchView('system');
		return;
	}
	if (k === '3') {
		this._switchView('shoutout');
		return;
	}
	if (k === '4') {
		this._switchView('credits');
		return;
	}
	if (k === '5') {
		this._switchView('modifications');
		return;
	}
	if (k === '6') {
		this._switchView('manifesto');
		return;
	}
};

SystemInfo.prototype.enter = function (done) {
	Subprogram.prototype.enter.call(this, done);
	this.draw();
};

SystemInfo.prototype.cleanup = function () {
	// Clear hotspots
	this._clearHotspots();

	// Clean up frames in reverse order of creation
	try {
		if (this.inputFrame) {
			this.inputFrame.close();
			this.inputFrame = null;
		}
		if (this.outputFrame) {
			this.outputFrame.close();
			this.outputFrame = null;
		}
		if (this.headerFrame) {
			this.headerFrame.close();
			this.headerFrame = null;
		}
		if (this.bannerFrame) {
			this.bannerFrame.close();
			this.bannerFrame = null;
		}
	} catch (e) {
		// Log errors but continue cleanup
		try { log('SystemInfo cleanup error: ' + e); } catch (_) { }
	}

	// Clear parent frame to remove any residual content
	if (this.parentFrame) {
		try {
			this.parentFrame.clear();
			this.parentFrame.invalidate();
		} catch (e) { }
	}

	// Call parent cleanup
	Subprogram.prototype.cleanup.call(this);
};

registerModuleExports({ SystemInfo: SystemInfo });
