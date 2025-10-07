load("iconshell/lib/subprograms/subprogram.js");
require('sbbsdefs.js', 'SS_TMPSYSOP');

if (typeof SC_RESET === 'undefined') var SC_RESET = '\x01N';
if (typeof SC_BRIGHT === 'undefined') var SC_BRIGHT = '\x01H';
if (typeof SC_WIDTH === 'undefined') var SC_WIDTH = 78;
if (typeof SC_LEFT_WIDTH === 'undefined') var SC_LEFT_WIDTH = 40;

function scColor(text, color, bright) {
    var seq = SC_RESET;
    if (bright !== false) seq += SC_BRIGHT;
    if (color) seq += '\x01' + color;
    return seq + text + SC_RESET;
}

function scStrip(str) {
    return str ? str.replace(/\x01./g, '') : '';
}

function scCenter(text, width) {
    width = width || SC_WIDTH;
    var len = scStrip(text).length;
    if (len >= width) return text;
    var pad = Math.floor((width - len) / 2);
    return Array(pad + 1).join(' ') + text;
}

function scRenderDesc(desc, defaultColor) {
    if (!desc) return '';
    var parts = Array.isArray(desc) ? desc : [{ text: desc, color: defaultColor }];
    var out = '';
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        out += scColor(part.text, part.color || defaultColor, part.bright);
    }
    return out;
}

function scRenderCommand(entry) {
    if (!entry) return '';
    var text = scColor(entry.label, entry.labelColor || 'W', true);
    if (entry.params) text += ' ' + scColor(entry.params, entry.paramColor || 'M', true);
    if (entry.desc) text += '  ' + scRenderDesc(entry.desc, entry.descColor || 'C');
    return text + SC_RESET;
}

function scHeading(text, color, bright) {
    return scColor(text, color || 'Y', bright !== false);
}

function scJoinColumns(left, right) {
    left = left || '';
    right = right || '';
    var len = scStrip(left).length;
    if (len < SC_LEFT_WIDTH) left += Array(SC_LEFT_WIDTH - len + 1).join(' ');
    else left += ' ';
    return left + right + SC_RESET;
}

function buildPoster() {
    var lines = [];
    lines.push(scColor(scCenter('Sysop Command Console', SC_WIDTH), 'C', true));
    lines.push(scColor(scCenter("(All commands preceded by a ';')   (Optional parameters shown in [] )", SC_WIDTH), 'B', true));
    lines.push(scColor(scCenter('(Required parameters shown in <>)   (Required exemptions shown in ())', SC_WIDTH), 'B', true));
    lines.push('');

    function addRow(leftEntry, rightEntry) {
        var left = null;
        var right = null;
        if (leftEntry) {
            if (leftEntry.heading) left = scHeading(leftEntry.heading, leftEntry.color, leftEntry.bright);
            else left = scRenderCommand(leftEntry);
        }
        if (rightEntry) {
            if (rightEntry.heading) right = scHeading(rightEntry.heading, rightEntry.color, rightEntry.bright);
            else right = scRenderCommand(rightEntry);
        }
        lines.push(scJoinColumns(left, right));
    }

    addRow({ heading: 'Node Display/Control:', color: 'Y', bright: true }, { heading: 'Editing:', color: 'M', bright: true });
    addRow({ label: 'NODE', params: '[args]', desc: 'Node Utility' }, { label: 'UEDIT', params: '[user]', desc: 'Edit User Account' });
    addRow({ label: 'DOWN', params: '<nodes>', paramColor: 'R', desc: 'Toggle Down Flag' }, { label: 'EDIT', desc: 'Edit Text/MSG File' });
    addRow({ label: 'LOCK', params: '<nodes>', paramColor: 'R', desc: [{ text: 'Lock/Unlock ', color: 'C' }, { text: '(N)', color: 'M' }] });
    addRow({ label: 'INTR', params: '<nodes>', paramColor: 'R', desc: [{ text: 'Toggle Interrupt ', color: 'C' }, { text: '(I)', color: 'M' }] }, { heading: 'Viewing:', color: 'C', bright: true });
    addRow({ label: 'ANON', desc: [{ text: 'Toggle Anonymous ', color: 'C' }, { text: '(Q)', color: 'M' }] }, { label: 'LIST', params: '[file]', desc: 'View Text/ANSI/MSG File' });
    addRow({ label: 'QUIET', desc: [{ text: 'Toggle Quiet ', color: 'C' }, { text: '(Q)', color: 'M' }] }, { label: 'LOG', desc: "Today's Log" });
    addRow(null, { label: 'YLOG', desc: "Yesterday's Log" });

    addRow({ heading: 'Miscellaneous:', color: 'O', bright: false }, { label: 'NS', params: '[node]', desc: 'Node Statistics' });
    addRow({ label: 'CHUSER', params: '[user]', desc: 'Change into Another User' }, { label: 'SS', desc: 'System Statistics' });
    addRow({ label: 'BULKMAIL', desc: 'Send Bulk E-mail' }, { label: 'NLOG', desc: 'Node Statistics Log' });
    addRow({ label: 'SHELL', desc: 'OS Command Shell' }, { label: 'SLOG', desc: 'System Statistics Log' });
    addRow({ label: 'CALL', params: '<hub>', paramColor: 'R', desc: 'Force QWKnet Call-out' }, { label: 'ERR', desc: 'Critical Error Log' });
    addRow({ label: 'EXEC', params: '<cmd>', paramColor: 'R', desc: 'Execute DOS Program' }, { label: 'GURU', desc: 'Discussions w/The Guru' });
    addRow({ label: 'EXEC *', params: '<mod>', paramColor: 'R', desc: 'Execute Baja Module' }, { label: 'MAIL', desc: 'All Mail on System' });
    addRow({ label: 'EXEC ?', params: '<mod>', paramColor: 'R', desc: 'Execute JavaScript Module' }, { label: 'SPY', params: '[node]', desc: 'Spy/control Node' });
    addRow({ label: 'NEXEC', params: '<cmd>', paramColor: 'R', desc: 'Execute Native Program' }, { label: 'ECHO', params: '<str>', paramColor: 'R', desc: 'Print string (w/@-codes)' });
    addRow({ label: 'FOSSIL', params: '<cmd>', paramColor: 'R', desc: 'Execute FOSSIL Program' }, { label: 'EVAL', params: '<str>', paramColor: 'R', desc: 'Evaluate JavaScript Expr' });

    return lines.join('\r\n');
}

function SysopCommand(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'sysop-commands', parentFrame: opts.parentFrame, shell: opts.shell });
    this._commandBuffer = '';
    this.history = [];
    this._posterVisible = true;
    this._commandPoster = buildPoster();
    this.outputFrame = null;
    this.inputFrame = null;
    this.shell = opts.shell || null;
}

extend(SysopCommand, Subprogram);

SysopCommand.prototype.enter = function (done) {
    Subprogram.prototype.enter.call(this, done);
    this.draw();
};

SysopCommand.prototype._ensureFrames = function () {
    if (!this.parentFrame) return;
    if (!this.outputFrame) {
        var h = Math.max(1, this.parentFrame.height - 1);
        this.outputFrame = new Frame(1, 1, this.parentFrame.width, h, ICSH_ATTR('HELLO_OUTPUT'), this.parentFrame);
        this.outputFrame.open();
    }
    if (!this.inputFrame) {
        this.inputFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, ICSH_ATTR('HELLO_INPUT'), this.parentFrame);
        this.inputFrame.open();
    }
};

SysopCommand.prototype.draw = function (options) {
    this._ensureFrames();
    if (!this.outputFrame || !this.inputFrame) return;
    this.outputFrame.clear();
    this.outputFrame.gotoxy(1, 1);
    this._posterVisible = !options || options.showCommands !== false;
    if (this._posterVisible) this.outputFrame.putmsg(this._commandPoster);
    if (this.history.length) {
        this.outputFrame.crlf();
        this.outputFrame.putmsg('\x01hCommand History:\x01n');
        this.outputFrame.crlf();
        for (var i = Math.max(0, this.history.length - 10); i < this.history.length; i++) {
            this.outputFrame.putmsg(this.history[i]);
            this.outputFrame.crlf();
        }
    }
    this._drawInput();
    this.parentFrame.cycle();
};

SysopCommand.prototype._drawInput = function () {
    if (!this.inputFrame) return;
    this.inputFrame.clear();
    this.inputFrame.home();
    var prompt = '; ' + this._commandBuffer;
    if (prompt.length > this.inputFrame.width)
        prompt = prompt.substr(prompt.length - this.inputFrame.width);
    this.inputFrame.putmsg(prompt);
    this.inputFrame.cycle();
};

SysopCommand.prototype._handleKey = function (key) {
    if (key === '\x1B') { this.exit(); return; }
    if (!key) return;
    if (key === '\r' || key === '\n') {
        this._submitCommand();
        return;
    }
    if (key === '\x08' || key === '\x7F') {
        if (this._commandBuffer.length) {
            this._commandBuffer = this._commandBuffer.substr(0, this._commandBuffer.length - 1);
            this._drawInput();
        }
        return;
    }
    if (typeof key === 'string' && key.length === 1 && key >= ' ' && key <= '~') {
        if (!this._posterVisible) this.draw();
        this._commandBuffer += key;
        this._drawInput();
    }
};

SysopCommand.prototype._submitCommand = function () {
    var cmd = this._commandBuffer.trim();
    if (!cmd) {
        this._commandBuffer = '';
        this._drawInput();
        return;
    }
    if (!(user && (user.compare_ars && user.compare_ars("SYSOP")) || (bbs && (bbs.sys_status & SS_TMPSYSOP)))) {
        this.history.push('; ' + cmd + '  \x01h\x01r[denied]\x01n');
        if (this.history.length > 100) this.history = this.history.slice(this.history.length - 100);
        this._commandBuffer = '';
        this.draw();
        return;
    }
    this.history.push('; ' + cmd);
    if (this.history.length > 100) this.history = this.history.slice(this.history.length - 100);
    this._commandBuffer = '';
    this.draw();
    var self = this;
    var runner = function () {
        try {
            load({}, 'str_cmds.js', cmd);
        } catch (e) {
            console.crlf();
            console.putmsg('\x01h\x01rError running command: ' + e + '\x01n');
            console.crlf();
        }
        console.crlf();
        console.putmsg('\x01h[Press any key to return]\x01n');
        console.crlf();
        console.getkey();
    };
    if (this.shell && typeof this.shell.runExternal === 'function') {
        this.shell.runExternal(runner, { programId: 'sysop:' + cmd });
    } else {
        runner();
    }
    this.draw({ showCommands: false });
};

SysopCommand.prototype._cleanup = function () {
    try { if (this.outputFrame) this.outputFrame.close(); } catch (e) { }
    try { if (this.inputFrame) this.inputFrame.close(); } catch (e) { }
    this._resetState();
};

SysopCommand.prototype._resetState = function () {
    this._commandBuffer = '';
    this.outputFrame = null;
    this.inputFrame = null;
    this._posterVisible = true;
};

this.SysopCommand = SysopCommand;
