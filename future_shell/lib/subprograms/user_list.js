// User List Subprogram (ported from classic userlist.js)
// Minimal interactive viewer:
//   - Shows users (filtered by optional mode: UL_SUB or UL_DIR if provided in opts.mode)
//   - Hotkeys: N=Sort by Name, L=Sort by Last-on, # (ignored placeholder), Q/ESC exit
//   - Arrow Up/Down / PgUp / PgDn to scroll
//   - Rebuilds list on enter; sorts only when requested

load('future_shell/lib/subprograms/subprogram.js');
require('sbbsdefs.js', 'USER_DELETED');
require('text.js', 'UserListFmt');

function UserList(opts) {
	opts = opts || {};
	Subprogram.call(this, { name: 'user-list', parentFrame: opts.parentFrame });
	this.mode = opts.mode || 0; // 0=all, UL_SUB, UL_DIR
	this.users = [];
	this.sortMode = null; // 'N' or 'L'
	this.top = 0;
	this.listFrame = null;
	this.statusFrame = null;
}
extend(UserList, Subprogram);

UserList.prototype.enter = function (done) {
	log("WTF DOES THIS GET CALLED???");
	this.buildList();
	Subprogram.prototype.enter.call(this, done);
};

UserList.prototype.buildList = function () {
	this.users = [];
	var total = system.lastuser;
	var u = new User;
	for (var i = 1; i <= total; i++) {
		u.number = i;
		if (u.settings & (USER_DELETED | USER_INACTIVE)) continue;
		if (this.mode === UL_SUB && !u.can_access_sub(bbs.cursub_code)) continue;
		if (this.mode === UL_DIR && !u.can_access_dir(bbs.curdir_code)) continue;
		this.users.push({
			number: u.number,
			alias: u.alias,
			location: u.location,
			note: u.note,
			connection: u.connection,
			laston: u.stats.laston_date,
			netmail: u.netmail
		});
	}
	log('UserList: built list, count=' + JSON.stringify(this.users));
	this.applySort();
};

UserList.prototype.applySort = function () {
	if (this.sortMode === 'L') {
		this.users.sort(function (a, b) { return b.laston - a.laston; });
	} else if (this.sortMode === 'N') {
		this.users.sort(function (a, b) {
			var A = a.alias.toLowerCase(), B = b.alias.toLowerCase();
			if (A > B) return 1; if (A < B) return -1; return 0;
		});
	}
};

UserList.prototype.ensureFrames = function () {
	if (!this.parentFrame) return;
	if (!this.listFrame) {
		var h = Math.max(1, this.parentFrame.height - 1);
		this.listFrame = new Frame(1, 1, this.parentFrame.width, h, ICSH_ATTR('USERS_LIST'), this.parentFrame); this.listFrame.open();
	}
	if (!this.statusFrame) {
		this.statusFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, ICSH_ATTR('USERS_STATUS'), this.parentFrame); this.statusFrame.open();
	}
};

UserList.prototype.draw = function () {
	this.ensureFrames();
	if (!this.listFrame) return;
	var f = this.listFrame; f.clear(); f.gotoxy(1, 1);
	var height = f.height;
	for (var row = 0; row < height && (this.top + row) < this.users.length; row++) {
		var u = this.users[this.top + row];
		var name = format("%s #%u", u.alias, u.number);
		var line = format(bbs.text(UserListFmt)
			, name
			, system.settings & SYS_LISTLOC ? u.location : u.note
			, system.datestr(u.laston)
			, u.netmail
		);
		// trim trailing newline if present
		line = line.replace(/\r?\n$/, '');
		if (line.length > f.width) line = line.substr(0, f.width);
		f.putmsg(line + '\r\n');
	}
	this.drawStatus();
	this.parentFrame.cycle();
};

UserList.prototype.drawStatus = function () {
	if (!this.statusFrame) return;
	var s = this.statusFrame; s.clear(); s.gotoxy(1, 1);
	var viewerEmail = (user && user.netmail) ? user.netmail : '-';
	var info = 'Users: ' + this.users.length + '  Sort: ' + (this.sortMode || '-') + '  N=Name L=Last Q=Quit  You: ' + viewerEmail;
	if (info.length > s.width) info = info.substr(0, s.width);
	s.putmsg(info);
	s.cycle();
};

UserList.prototype.handleKey = function (k) {
	if (!k) return;
	switch (k) {
		case '\x1B': case 'Q': case 'q': this.exit(); return;
		case 'N': case 'n': this.sortMode = 'N'; this.applySort(); this.top = 0; this.draw(); return;
		case 'L': case 'l': this.sortMode = 'L'; this.applySort(); this.top = 0; this.draw(); return;
		case KEY_UP: if (this.top > 0) { this.top--; this.draw(); } return;
		case KEY_DOWN: if (this.top < Math.max(0, this.users.length - (this.listFrame ? this.listFrame.height : 1))) { this.top++; this.draw(); } return;
		case KEY_PGUP: this.top = Math.max(0, this.top - (this.listFrame ? this.listFrame.height : 1)); this.draw(); return;
		case KEY_PGDN: this.top = Math.min(Math.max(0, this.users.length - 1), this.top + (this.listFrame ? this.listFrame.height : 1)); this.draw(); return;
	}
};

UserList.prototype.cleanup = function () {
	try { if (this.listFrame) this.listFrame.close(); } catch (e) { }
	try { if (this.statusFrame) this.statusFrame.close(); } catch (e) { }
	this.listFrame = this.statusFrame = null;
	Subprogram.prototype.cleanup.call(this);
};

this.UserList = UserList;
