
var MAX_TOAST_WIDTH = 40;
var DEFAULT_TOAST_TIMEOUT = 30000; // 30 seconds
// Position keywords: 'top-left','top-right','bottom-left','bottom-right','center'
// For now we implement corner logic + center; bottom variants offset 1 row above bottom to avoid crumb bar.

function Toast(options) {
    if (!options || typeof options !== 'object') options = {};
    this._avatarData = null;
    this._avatarLib = load({}, 'avatar_lib.js');
    log('Creating Toast ' + JSON.stringify(options.avatar) + !!this._avatarLib);
    if(options.avatar && this._avatarLib){
        log('Got avatar options: '+JSON.stringify(options.avatar));
        if(options.avatar.netaddr === system.name){
            var uNum = system.matchuser(options.avatar.username); 
            this.avatarData = this._avatarLib.read(uNum);

        } else if(options.avatar.username && options.avatar.netaddr){
            this.avatarData = this._avatarLib.read_netuser(options.avatar.username, options.avatar.netaddr);
        }
        log('Avatar data read: '+ JSON.stringify(this.avatarData));
    }
    var message = options.message || "";
    var timeout = (typeof options.timeout === 'number') ? options.timeout : DEFAULT_TOAST_TIMEOUT;
    var onDone = options.onDone;

    var width = Math.min(MAX_TOAST_WIDTH, Math.max(8, message.length + 4));
    if(this.avatarData){
        width = width + 6; // avatar width
    }
    var height = this.avatarData ? 6 : 3;
    if (height < 1) height = 1;
    if (height > console.screen_rows) height = console.screen_rows;
    var pos = options.position || 'bottom-right';
    var scrW = console.screen_columns || 80;
    var scrH = console.screen_rows || 24;
    var x=1, y=1;
    function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
    switch(pos){
        case 'top-right':
            x = scrW - width + 1; y = 1; break;
        case 'bottom-left':
            x = 1; y = scrH - height; break; // leave last line for crumb
        case 'bottom-right':
            x = scrW - width + 1; y = scrH - height;
                if(this.avatarData){
                    x = x - 7; // avatar width + padding offset frame to left;
                }
             break;
        case 'center':
            x = Math.max(1, Math.floor((scrW - width)/2) + 1);
            y = Math.max(1, Math.floor((scrH - height)/2) + 1);
            break;
        case 'top-left':
        default:
            x = 1; y = 1; break;
    }
    x = clamp(x,1, Math.max(1, scrW - width + 1));
    y = clamp(y,1, Math.max(1, scrH - height + 1));
    log('Toast position '+pos+' => '+x+','+y+' in '+scrW+'x'+scrH);
    this.avatarFrame = null;
    this.parentFrame = options.parentFrame || undefined;
    this.toastFrame = new Frame(x, y, width, height, BG_BLACK, this.parentFrame);
    var msgX = this.avatarData ? 6 : 0;
    this.msgFrame = new Frame((2* msgX) + this.toastFrame.x, this.toastFrame.y, this.toastFrame.width - msgX , this.toastFrame.height, BG_MAGENTA|WHITE, this.toastFrame);
    this.toastFrame.transparent = true;
    if(this.avatarData){
        this.avatarFrame = new Frame(this.toastFrame.x + 1, this.toastFrame.y, 10, Math.min(6, this.toastFrame.height), BG_BLACK|WHITE, this.toastFrame);
        this.insertAvatarData();
    }
    this.msgFrame.putmsg(message);
    this.toastFrame.draw();
    this.toastFrame.open();

    this._dismissed = false;
    this._startTime = time();
    this._timeout = timeout;
    this._onDone = onDone;

    var self = this;
    this.dismiss = function(parentFrame) {
        if (self._dismissed) return;
        self._dismissed = true;
        self.toastFrame.clear();
        self.toastFrame.close();
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


Toast.prototype._blitAvatarToFrame = function(frame, binData, w, h, dstX, dstY){
        var offset=0; for(var y=0;y<h;y++){ 
                for(var x=0;x<w;x++){ 
                    if(offset+1>=binData.length) return; 
                    var ch=binData.substr(offset++,1);
                    var attr=ascii(binData.substr(offset++,1));
                      try{ 
                        frame.setData(dstX + x - 1, dstY + y - 1, ch, attr, false); 
                    } catch(se){} } }
};
Toast.prototype.insertAvatarData = function() {
        var avatarWidth = 10;
        var avatarHeight = 6;
        if(this.avatarData){
        try {
            var bin = (typeof base64_decode==='function') ? base64_decode(this.avatarData.data) : null;
            if(bin && bin.length >= avatarWidth*avatarHeight*2){
                var hf = this.avatarFrame;
                this._blitAvatarToFrame(hf, bin, avatarWidth, Math.min(avatarHeight, hf.height), 2, 1);
            }
        } catch(be){ log('avatar blit error: '+be); }
    }
}