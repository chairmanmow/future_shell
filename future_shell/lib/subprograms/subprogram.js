load('sbbsdefs.js');
if (typeof lazyLoadModule !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (e) { }
}

// Provide sensible defaults when sbbsdefs.js hasn't populated key constants yet.
if (typeof KEY_UP === 'undefined')      var KEY_UP = 0x4800;
if (typeof KEY_DOWN === 'undefined')    var KEY_DOWN = 0x5000;
if (typeof KEY_PGUP === 'undefined')    var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined')    var KEY_PGDN = 0x5100;
if (typeof KEY_PAGEUP === 'undefined')  var KEY_PAGEUP = 0x4900;
if (typeof KEY_PAGEDN === 'undefined')  var KEY_PAGEDN = 0x5100;
if (typeof KEY_HOME === 'undefined')    var KEY_HOME = 0x4700;
if (typeof KEY_END === 'undefined')     var KEY_END = 0x4F00;
if (typeof KEY_LEFT === 'undefined')    var KEY_LEFT = 0x4B00;
if (typeof KEY_RIGHT === 'undefined')   var KEY_RIGHT = 0x4D00;
if (typeof KEY_ENTER === 'undefined')   var KEY_ENTER = '\r';
if (typeof KEY_TAB === 'undefined')     var KEY_TAB = '\t';
function Subprogram(opts) {
    this.__bg_frame = null;  
    opts = opts || {};
    this.name = opts.name || 'subprogram';
    this.parentFrame = opts.parentFrame || null;
    this._ownsParentFrame = !this.parentFrame;
    this.hostFrame = null;
    this.running = false;
    this._done = null;
    // Optional reference to the parent shell (IconShell) so subprograms can access shared services
    this.shell = opts.shell; 
    this._myFrames = [];
    this.timer = opts.timer || (this.shell && this.shell.timer) || null;
    this.blockScreenSaver = false;
}

Subprogram.prototype.enter = function(done) {
    this._done = (typeof done === 'function') ? done : function(){};
    this.running = true;
    if(!this.parentFrame) {
        this.parentFrame = new Frame(1,1,console.screen_columns,console.screen_rows, ICSH_ATTR('FRAME_STANDARD'));
        this.parentFrame.open();
        this._ownsParentFrame = true;
    }
    this._ensureHostFrame();
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
    if(this._cleanup && typeof this._cleanup === 'function') {
        this._cleanup();
    }
    if(this.hostFrame){
        var oldHost = this.hostFrame;
        try { oldHost.close(); } catch(e) {}
        var idx = this._myFrames.indexOf(oldHost);
        if(idx !== -1) this._myFrames.splice(idx, 1);
        this.hostFrame = null;
    }
    this.setBackgroundFrame(null);
    if (this.parentFrame) {
        if(this._ownsParentFrame){
            try { this.parentFrame.close(); } catch(e) {}
            this.parentFrame = null;
        } else {
            try { this.parentFrame.cycle(); } catch(e) {}
        }
    }
    this.detachShellTimer();
    this._myFrames = [];
};

Subprogram.prototype._teardownHostFrame = function(){
    if(!this.hostFrame) return;
    try { this.hostFrame.close(); } catch(e){}
    var idx = this._myFrames.indexOf(this.hostFrame);
    if(idx !== -1) this._myFrames.splice(idx, 1);
    this.hostFrame = null;
    this.setBackgroundFrame(null);
};

Subprogram.prototype._releaseFrameRefs = function(){
    for(var key in this){
        if(!Object.prototype.hasOwnProperty.call(this, key)) continue;
        if(!this[key]) continue;
        if(key === 'parentFrame' || key === 'hostFrame' || key === '__bg_frame' || key === '_myFrames') continue;
        var val = this[key];
        if(val && typeof val === 'object'){
            var isFrameLike = (typeof val.close === 'function' && typeof val.open === 'function' && typeof val.gotoxy === 'function');
            if(isFrameLike){
                try { val.close(); } catch(e){}
                this[key] = null;
            }
        }
    }
};

Subprogram.prototype.onShellResize = function(dims){
    this._releaseFrameRefs();
    this._teardownHostFrame();
    this._myFrames = [];
    if(typeof this.handleResize === 'function'){
        try { this.handleResize(dims); } catch(e){}
    }
    this._ensureHostFrame();
    if(typeof this.afterResize === 'function'){
        try { this.afterResize(dims); } catch(e){}
    }
    if(typeof this.refresh === 'function'){
        try { this.refresh(); } catch(e){}
    } else if(typeof this.draw === 'function'){
        try { this.draw(); } catch(e){}
    }
    if(this.parentFrame && typeof this.parentFrame.cycle === 'function'){
        try { this.parentFrame.cycle(); } catch(e){}
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

Subprogram.prototype.resumeForReason = function(reason){};

Subprogram.prototype.setParentFrame = function(f){
    this.parentFrame = f;
    this._ownsParentFrame = !this.parentFrame;
    return this;
};

Subprogram.prototype.attachShellTimer = function(timer){
    this.timer = timer || null;
};

Subprogram.prototype.detachShellTimer = function(){
    this.timer = null;
};

Subprogram.prototype.setBackgroundFrame = function(frame) { 
    this.__bg_frame = frame; 
    return frame; 
};

Subprogram.prototype.backgroundFrame = function() { 
    return this.__bg_frame || false;
};

Subprogram.prototype._ensureHostFrame = function(){
    if(this.hostFrame && this.hostFrame.is_open) return this.hostFrame;
    if(!this.parentFrame) return null;
    var pf = this.parentFrame;
    var width = Math.max(1, pf.width || console.screen_columns || 80);
    var height = Math.max(1, pf.height || console.screen_rows || 24);
    var attr;
    if (typeof pf.attr === 'number') attr = pf.attr;
    else if (typeof ICSH_VALS !== 'undefined' && ICSH_VALS.VIEW && typeof ICSH_VALS.VIEW.BG === 'number' && typeof ICSH_VALS.VIEW.FG === 'number') attr = (ICSH_VALS.VIEW.BG | ICSH_VALS.VIEW.FG);
    else if (typeof BG_BLACK !== 'undefined' && typeof LIGHTGRAY !== 'undefined') attr = BG_BLACK | LIGHTGRAY;
    else attr = 0;
    try {
        this.hostFrame = new Frame(1, 1, width, height, attr, pf);
        this.hostFrame.open();
        this.setBackgroundFrame(this.hostFrame);
        if(this._myFrames.indexOf(this.hostFrame) === -1) this._myFrames.push(this.hostFrame);
    } catch(e) {
        log('Subprogram '+(this.name||'unknown')+' failed to create hostFrame: '+e);
        this.hostFrame = null;
    }
    return this.hostFrame;
};

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
