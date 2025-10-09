// Private Message (minimal) Subprogram
// Straightforward state machine, single active input string, few states.
// States: MENU -> RECIPIENT -> MESSAGE -> SENT -> MENU
// Keys: T (from MENU) start telegram, Q/ESC exit, ENTER advances, blank ENTER sends when composing.

load('future_shell/lib/subprograms/subprogram.js');
if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
require('sbbsdefs.js', 'SS_USERON');
require('text.js', 'TelegramFmt');

function PrivateMsg(opts) {
	opts = opts || {};
	Subprogram.call(this, { name: 'private-msg', parentFrame: opts.parentFrame });
	this.state = 'MENU';
	this.inputStr = '';
	this.lines = [];
	this.maxLines = 5;
	this.toUserNum = 0;
	this.toUserName = '';
	this.frameOutput = null;
	this.frameInput = null;
}
extend(PrivateMsg, Subprogram);

PrivateMsg.prototype.enter = function (done) {
	if (!(bbs.sys_status & SS_USERON)) { this.exit(); return; }
	Subprogram.prototype.enter.call(this, done);
};

PrivateMsg.prototype.ensureFrames = function () {
	if (!this.parentFrame) return;
	if (!this.frameOutput) {
		var h = Math.max(1, this.parentFrame.height - 1);
		this.frameOutput = new Frame(1, 1, this.parentFrame.width, h, ICSH_ATTR('PRIVMSG_OUTPUT'), this.parentFrame); this.frameOutput.open();
	}
	if (!this.frameInput) {
		this.frameInput = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, ICSH_ATTR('PRIVMSG_INPUT'), this.parentFrame); this.frameInput.open();
	}
};

PrivateMsg.prototype.draw = function () {
	this.ensureFrames();
	if (!this.frameOutput) return;
	var o = this.frameOutput; o.clear(); o.gotoxy(1, 1);
	switch (this.state) {
		case 'MENU':
			o.putmsg('\x01hPrivate Message\x01n\r\n');
			o.putmsg('T)elegram   Q)uit / ESC\r\n');
			break;
		case 'RECIPIENT':
			o.putmsg('Enter username, #usernum or node #. Blank to cancel.\r\n');
			break;
		case 'MESSAGE':
			o.putmsg('To: ' + this.toUserName + ' (#' + this.toUserNum + ')\r\n');
			for (var i = 0; i < this.lines.length; i++) o.putmsg((i + 1) + '> ' + this.lines[i] + '\r\n');
			if (this.lines.length >= this.maxLines) o.putmsg('(Max lines reached. ENTER to send)\r\n');
			else o.putmsg((this.lines.length + 1) + '> ' + this.inputStr);
			break;
		case 'SENT':
			o.putmsg('Telegram sent to ' + this.toUserName + '. Press any key.\r\n');
			break;
	}
	this.drawInput();
	this.parentFrame.cycle();
};

PrivateMsg.prototype.drawInput = function () {
	if (!this.frameInput) return;
	var f = this.frameInput; f.clear(); f.gotoxy(1, 1);
	var prompt = '';
	switch (this.state) {
		case 'MENU': prompt = '>'; break;
		case 'RECIPIENT': prompt = 'User> ' + this.inputStr; break;
		case 'MESSAGE': if (this.lines.length < this.maxLines) prompt = 'Text> ' + this.inputStr; else prompt = 'Text> '; break;
		case 'SENT': prompt = '[Sent]'; break;
	}
	if (prompt.length > f.width) prompt = prompt.substr(prompt.length - f.width);
	f.putmsg(prompt);
	f.cycle();
};

PrivateMsg.prototype.handleKey = function (k) {
	if (!k) return;
	if (k === '\x1B') { this.exit(); return; }
	if (this.state === 'SENT') { this.state = 'MENU'; this.draw(); return; }
	switch (k) {
		case '\r': case '\n':
			this.onEnter();
			return;
		case '\x08': case '\x7F': // backspace
			if (this.inputStr.length) { this.inputStr = this.inputStr.substr(0, this.inputStr.length - 1); this.drawInput(); this.parentFrame && this.parentFrame.cycle(); }
			return;
		default:
			if (k.length === 1 && k >= ' ' && k <= '~') {
				if (this.state === 'MENU') {
					var up = k.toUpperCase();
					if (up === 'T') { this.state = 'RECIPIENT'; this.inputStr = ''; this.draw(); return; }
					else if (up === 'Q') { this.exit(); }
				} else if (this.state === 'RECIPIENT') {
					if (this.inputStr.length < 40) { this.inputStr += k; this.drawInput(); this.parentFrame && this.parentFrame.cycle(); }
				} else if (this.state === 'MESSAGE') {
					if (this.lines.length < this.maxLines && this.inputStr.length < 80) { this.inputStr += k; this.drawInput(); this.parentFrame && this.parentFrame.cycle(); }
				}
			}
	}
};

PrivateMsg.prototype.onEnter = function () {
	if (this.state === 'MENU') { return; }
	if (this.state === 'RECIPIENT') {
		var s = this.inputStr.trim();
		if (!s) { this.state = 'MENU'; this.inputStr = ''; this.draw(); return; }
		var num = 0;
		if (s.charAt(0) === '#') num = parseInt(s.slice(1), 10);
		else if (/^[0-9]+$/.test(s)) {
			var nodeNum = parseInt(s, 10);
			if (nodeNum > 0 && nodeNum <= system.nodes) { var n = system.get_node(nodeNum); if (n && n.status == NODE_INUSE) num = n.useron; }
		} else {
			num = system.matchuser(s, true) || bbs.finduser(s);
		}
		if (!num || system.username(num) === '') { this.state = 'MENU'; this.inputStr = ''; this.draw(); return; }
		this.toUserNum = num; this.toUserName = system.username(num);
		this.lines = []; this.inputStr = ''; this.state = 'MESSAGE'; this.draw(); return;
	}
	if (this.state === 'MESSAGE') {
		if (this.inputStr.length) { this.lines.push(this.inputStr); this.inputStr = ''; }
		if (this.lines.length >= this.maxLines || !this.inputStr) {
			// user pressed enter on blank line OR hit max -> send if we have at least one line
			if (this.lines.length) { this.sendTelegram(); return; }
		}
		this.draw();
	}
};

PrivateMsg.prototype.sendTelegram = function () {
	var msg = this.lines.join('\r\n    ');
	var header = format(bbs.text(TelegramFmt), user.alias, system.timestr());
	var telegram = header + '    ' + msg + '\r\n';
	if (!system.put_telegram(this.toUserNum, telegram)) {
		// failed -> just drop back
		this.state = 'MENU';
	} else {
		this.state = 'SENT';
	}
	this.inputStr = ''; this.lines = []; this.draw();
};

PrivateMsg.prototype.cleanup = function () {
	try { if (this.frameOutput) this.frameOutput.close(); } catch (e) { }
	try { if (this.frameInput) this.frameInput.close(); } catch (e) { }
	this.frameOutput = this.frameInput = null;
Subprogram.prototype.cleanup.call(this);
};

registerModuleExports({ PrivateMsg: PrivateMsg });
