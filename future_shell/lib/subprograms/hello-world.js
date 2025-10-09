// Hello World demo subprogram to validate Subprogram framework.
// Behavior:
// 1. Shows greeting and asks for name.
// 2. Mirrors keystrokes in input frame until ENTER.
// 3. Greets user by name and prompts to press any key to exit.
// 4. ESC at any time aborts immediately.

load("future_shell/lib/subprograms/subprogram.js");
if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

function HelloWorld(opts) {
	opts = opts || {};
	Subprogram.call(this, { name: 'hello-world', parentFrame: opts.parentFrame });
	this._nameBuffer = '';
	this._mode = 'asking'; // 'asking' | 'greeted'
	this.outputFrame = null;
	this.inputFrame = null;
}

extend(HelloWorld, Subprogram);

HelloWorld.prototype.enter = function (done) {
	Subprogram.prototype.enter.call(this, done);
	this.draw();
};

HelloWorld.prototype._ensureFrames = function () {
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

HelloWorld.prototype.draw = function () {
	this._ensureFrames();
	if (!this.outputFrame || !this.inputFrame) return;
	this.outputFrame.clear();
	this.outputFrame.gotoxy(1, 1);
	// Greeting always shown
	this.outputFrame.putmsg('\x01hHELLO WORLD.\x01n');
	this.outputFrame.crlf();
	this.outputFrame.putmsg('What is your name?');
	if (this._mode === 'greeted') {
		this.outputFrame.crlf();
		this.outputFrame.crlf();
		this.outputFrame.putmsg('Hello ' + (this._nameBuffer || 'stranger'));
		this.outputFrame.crlf();
		this.outputFrame.putmsg('Press any key to exit.');
	}
	this._drawInput();
	this.parentFrame.cycle();
};

HelloWorld.prototype._drawInput = function () {
	if (!this.inputFrame) return;
	this.inputFrame.clear();
	this.inputFrame.home();
	if (this._mode === 'asking') {
		var prompt = '> ' + this._nameBuffer;
		// Truncate if longer than frame width
		if (prompt.length > this.inputFrame.width) {
			prompt = prompt.substr(prompt.length - this.inputFrame.width);
		}
		this.inputFrame.putmsg(prompt);
	} else {
		this.inputFrame.putmsg('[ Done ]');
	}
	this.inputFrame.cycle();
};

HelloWorld.prototype._handleKey = function (key) {
	// ESC always exits
	if (key === '\x1B') { this.exit(); return; }
	if (this._mode === 'asking') {
		if (key === '\r' || key === '\n') {
			this._mode = 'greeted';
			this.draw();
			return;
		}
		// Backspace handling (ASCII 8 or 127)
		if (key === '\x08' || key === '\x7F') {
			if (this._nameBuffer.length) {
				this._nameBuffer = this._nameBuffer.substr(0, this._nameBuffer.length - 1);
				this._drawInput();
			}
			return;
		}
		// Filter printable characters
		if (key && key.length === 1 && key >= ' ' && key <= '~') {
			// Basic length limit to avoid overflow
			if (this._nameBuffer.length < 64) {
				this._nameBuffer += key;
				this._drawInput();
			}
		}
	} else if (this._mode === 'greeted') {
		// Any key exits
		this.exit();
	}
};

HelloWorld.prototype._cleanup = function () {
	try { if (this.outputFrame) this.outputFrame.close(); } catch (e) { }
	try { if (this.inputFrame) this.inputFrame.close(); } catch (e) { }
	this._resetState();
};

HelloWorld.prototype._resetState = function () {
 this._nameBuffer = '';
 this._mode = 'asking'; // 'asking' | 'greeted'
 this.outputFrame = null;
 this.inputFrame = null;
}

registerModuleExports({ HelloWorld: HelloWorld });
