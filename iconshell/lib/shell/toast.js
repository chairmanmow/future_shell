
var MAX_TOAST_WIDTH = 40;
var DEFAULT_TOAST_TIMEOUT = 30000; // 30 seconds

function Toast(options) {
    if (!options || typeof options !== 'object') options = {};
    var message = options.message || "";
    var timeout = (typeof options.timeout === 'number') ? options.timeout : DEFAULT_TOAST_TIMEOUT;
    var onDone = options.onDone;

    var width = Math.min(MAX_TOAST_WIDTH, Math.max(8, message.length + 4));
    var height = 3;
    if (height < 1) height = 1;
    if (height > console.screen_rows) height = console.screen_rows;
    // Always display at top left for now
    var x = 1;
    var y = 1;

    this.parentFrame = options.parentFrame || undefined;
    this.frame = new Frame(x, y, width, height, BG_GREEN|LIGHTGRAY, this.parentFrame);
    this.frame.attr = BG_GREEN|LIGHTGRAY;
    this.frame.transparent = false;
    this.frame.putmsg(" "+message+" ", 2, 1);
    this.frame.draw();
    this.frame.open();

    this._dismissed = false;
    this._startTime = time();
    this._timeout = timeout;
    this._onDone = onDone;

    var self = this;
    this.dismiss = function(parentFrame) {
        if (self._dismissed) return;
        self._dismissed = true;
        self.frame.clear();
        self.frame.close();
        if (self.parentFrame && typeof self.parentFrame.cycle === 'function') self.parentFrame.cycle();
        if (typeof self._onDone === 'function') self._onDone(self);
    };
}

// Call this in your main loop to check for auto-dismiss
Toast.prototype.cycle = function() {
    if (this._dismissed) return;
    if (this._timeout > 0 && (time() - this._startTime) * 1000 >= this._timeout) {
        this.dismiss();
    }
};