load('sbbsdefs.js');
function Subprogram(opts) {
    opts = opts || {};
    this.name = opts.name || 'subprogram';
    this.parentFrame = opts.parentFrame || null;
    this.running = false;
    this._done = null;
    // Optional reference to the parent shell (IconShell) so subprograms can access shared services
    this.shell = opts.shell; 
    this._myFrames = [];
}

Subprogram.prototype.enter = function(done) {
    this._done = (typeof done === 'function') ? done : function(){};
    this.running = true;
    if(!this.parentFrame) {
        this.parentFrame = new Frame(1,1,console.screen_columns,console.screen_rows, ICSH_ATTR('FRAME_STANDARD'));
        this.parentFrame.open();
    }
    this.draw();
    if(this._myFrames.length === 0)
        this.registerDefaultFrames();
};

Subprogram.prototype.exit = function() {
    this.running = false;
    this.cleanup();
    if (this._done) this._done();
};

Subprogram.prototype.handleKey = function(key) {
    if(this._handleKey && typeof this._handleKey === 'function') {
        return this._handleKey(key);
    }
    if (key === '\x1B') this.exit();
};

Subprogram.prototype.draw = function(){};
Subprogram.prototype.refresh = function(){ this.draw(); };
Subprogram.prototype.cleanup = function(){
    if (this.parentFrame) { this.parentFrame.close(); this.parentFrame = null; }
    if(this._cleanup && typeof this._cleanup === 'function') {
        this._cleanup();
    }
};

Subprogram.prototype.registerFrame = function(frame){
    this._myFrames.push(frame);
};

Subprogram.prototype.registerDefaultFrames = function(){
    if(this.outputFrame) this.registerFrame(this.outputFrame);
    if(this.inputFrame) this.registerFrame(this.inputFrame);
}

Subprogram.prototype.closeMyFrames = function(){
    this._myFrames.forEach(function(frame){
        frame.close();
    });
    this.parentFrame.cycle();
};      

Subprogram.prototype.bringFramesToTop = function(){
    log("BRINGING SUBPROGRAM FRAMES TO TOP", this._myFrames.length);
    if(this.refresh) this.refresh();
    this.draw();
    this._myFrames.forEach(function(frame){
        frame.top();
    });
    // this.draw();
    this.parentFrame.cycle();
};   

Subprogram.prototype.sendFramesToBottom = function(){
    this._myFrames.forEach(function(frame){
        frame.bottom();
    });
    this.parentFrame.cycle();
}; 

Subprogram.prototype.pauseForReason = function(reason){};

Subprogram.prototype.resumeForReason = function(){};

Subprogram.prototype.setParentFrame = function(f){ this.parentFrame = f; return this; };

// Unified toast helper available to every subprogram.
// Usage: this._showToast({ message:'Hello', timeout:5000, position:'bottom-right' })
Subprogram.prototype._showToast = function(opts) {
    log("Subprogram._showToast called with " +JSON.stringify(opts));
    opts = opts || {};
    try {
        if (this.shell && typeof this.shell.showToast === 'function') {
            // Ensure parentFrame defaults to shell root if not provided
            if (!opts.parentFrame && this.shell.root) opts.parentFrame = this.shell.root;
            mswait(500);
            log("waiting half a second to show toast");
            return this.shell.showToast(opts);
        }
        // Fallback: console output if no shell toast system
        if (opts.message && typeof console !== 'undefined' && console.putmsg) {
            console.putmsg('\r\n' + opts.message + '\r\n');
        }
    } catch(e) { /* swallow */ }
    return null;
};

function extend(Sub, Super) {
    Sub.prototype = Object.create(Super.prototype);
    Sub.prototype.constructor = Sub;
}