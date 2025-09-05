function Subprogram(opts) {
    opts = opts || {};
    this.name = opts.name || 'subprogram';
    this.parentFrame = opts.parentFrame || null;
    this.running = false;
    this._done = null;
}

Subprogram.prototype.enter = function(done) {
    this._done = (typeof done === 'function') ? done : function(){};
    this.running = true;
    if(!this.parentFrame) {
        this.parentFrame = new Frame(1,1,console.screen_columns,console.screen_rows, BG_BLACK|LIGHTGRAY);
        this.parentFrame.open();
    }
    this.draw();
};

Subprogram.prototype.exit = function() {
    this.running = false;
    this.cleanup();
    if (this._done) this._done();
};

Subprogram.prototype.handleKey = function(key) {
    if (key === '\x1B') this.exit();
};

Subprogram.prototype.draw = function(){};
Subprogram.prototype.refresh = function(){ this.draw(); };
Subprogram.prototype.cleanup = function(){
    if (this.parentFrame) { this.parentFrame.close(); this.parentFrame = null; }
};

Subprogram.prototype.setParentFrame = function(f){ this.parentFrame = f; return this; };

function extend(Sub, Super) {
    Sub.prototype = Object.create(Super.prototype);
    Sub.prototype.constructor = Sub;
}