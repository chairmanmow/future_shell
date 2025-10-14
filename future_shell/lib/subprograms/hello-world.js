// Hello World demo subprogram to validate Subprogram framework.
// Behavior:
// 1. Opens a modal prompt asking for the user's name.
// 2. Greets the user with the supplied name inside the primary frame.
// 3. Pressing any key after the greeting (or Cancel/ESC in the prompt) exits.

load("future_shell/lib/subprograms/subprogram.js");
if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}
try { if (typeof Modal !== 'function') load('future_shell/lib/util/layout/modal.js'); } catch (_) { }

function HelloWorld(opts) {
	log("HELLO WORLD CONSTRUCTOR 2");
	opts = opts || {};
	Subprogram.call(this, { name: 'hello-world', parentFrame: opts.parentFrame });
	this.id = 'hello-world';
	this.themeNamespace = this.id;
	this._nameBuffer = '';
	this._mode = 'asking'; // 'asking' | 'greeted'
	this.outputFrame = null;
	this.inputFrame = null;
	this._promptModal = null;
	this.registerColors({
		OUTPUT: { BG: BG_RED, FG: WHITE },
		INPUT: { BG: BG_RED, FG: WHITE },
		PROMPT: { FG: CYAN }
	});
}

extend(HelloWorld, Subprogram);

HelloWorld.prototype.enter = function (done) {
	Subprogram.prototype.enter.call(this, done);
	this.draw();
	this._showNamePrompt();
};

HelloWorld.prototype._ensureFrames = function () {
	if (!this.parentFrame) return;
	if (!this.outputFrame) {
		var h = Math.max(1, this.parentFrame.height - 1);
		var outputAttr = this.paletteAttr('OUTPUT', ICSH_ATTR('HELLO_OUTPUT'));
		this.outputFrame = new Frame(1, 1, this.parentFrame.width, h, outputAttr, this.parentFrame);
		this.outputFrame.open();
	}
	if (!this.inputFrame) {
		var inputAttr = this.paletteAttr('INPUT', ICSH_ATTR('HELLO_INPUT'));
		this.inputFrame = new Frame(1, this.parentFrame.height, this.parentFrame.width, 1, inputAttr, this.parentFrame);
		this.inputFrame.open();
	}
};

HelloWorld.prototype._showNamePrompt = function () {
	var self = this;
	if (this._promptModal && this._promptModal._open) return;
	this._promptModal = new Modal({
		parentFrame: this.parentFrame,
		type: 'prompt',
		title: 'Hello',
		message: 'What is your name?',
		defaultValue: this._nameBuffer,
		initialFocus: 'input',
		okLabel: 'OK',
		cancelLabel: 'Cancel',
		onSubmit: function (value) {
			self._nameBuffer = (value || '').trim();
			self._mode = 'greeted';
			self.draw();
			self._promptModal = null;
		},
		onCancel: function () {
			self._promptModal = null;
			self.exit();
		},
		onClose: function () {
			self._promptModal = null;
		}
	});
};

HelloWorld.prototype.draw = function () {
	this._ensureFrames();
	if (!this.outputFrame || !this.inputFrame) return;
	var outputAttr = this.paletteAttr('OUTPUT', ICSH_ATTR('HELLO_OUTPUT'));
	this.outputFrame.clear(outputAttr);
	this.outputFrame.attr = outputAttr;
	this.outputFrame.gotoxy(1, 1);
	// Greeting always shown
	this.outputFrame.putmsg('HELLO WORLD.');
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
	var inputAttr = this.paletteAttr('INPUT', ICSH_ATTR('HELLO_INPUT'));
	this.inputFrame.clear(inputAttr);
	this.inputFrame.home();
	if (this._mode === 'asking') {
		var prompt = '[ Respond in the modal prompt ]';
		if (prompt.length > this.inputFrame.width) {
			prompt = prompt.substr(0, this.inputFrame.width);
		}
		this.inputFrame.attr = this.paletteAttr('PROMPT', inputAttr);
		this.inputFrame.putmsg(prompt);
	} else {
		this.inputFrame.attr = inputAttr;
		this.inputFrame.putmsg('[ Done ]');
	}
	this.inputFrame.cycle();
};

HelloWorld.prototype._handleKey = function (key) {
	// ESC always exits
	if (key === '\x1B') { this.exit(); return; }
	if (this._mode === 'greeted') {
		this.exit();
		return;
	}
	if (!this._promptModal || !this._promptModal._open) {
		this._showNamePrompt();
	}
};

HelloWorld.prototype._cleanup = function () {
	if (this._promptModal) {
		try { this._promptModal.close(); } catch (e) { }
		this._promptModal = null;
	}
	try { if (this.outputFrame) this.outputFrame.close(); } catch (e) { }
	try { if (this.inputFrame) this.inputFrame.close(); } catch (e) { }
	this._resetState();
};

HelloWorld.prototype._resetState = function () {
	this._nameBuffer = '';
	this._mode = 'asking'; // 'asking' | 'greeted'
	this.outputFrame = null;
	this.inputFrame = null;
	this._promptModal = null;
};

registerModuleExports({ HelloWorld: HelloWorld });
