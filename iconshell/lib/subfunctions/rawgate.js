// Raw TCP Gateway Subprogram (interactive)
// Provides simple host:port connect, shows received data in output frame.
// Input frame first prompts for host and port (ESC to exit). After connect:
//  - CTRL-C aborts connection (KEY_ABORT) and returns to prompt.
//  - Typing sends keystrokes directly; Enter sends CRLF.
//  - Timeout (default 10s) prints notice if no data received in that span.

load('iconshell/lib/subfunctions/subprogram.js');
require('sbbsdefs.js','SS_MOFF');

function RawGateSub(opts){
    opts = opts||{};
    Subprogram.call(this,{ name:'rawgate', parentFrame: opts.parentFrame });
    this.shell = opts.shell;
    this.frameOutput = null;
    this.frameInput = null;
    this.state = 'PROMPT'; // PROMPT | CONNECTING | SESSION
    this.host = '';
    this.port = '';
    this.sock = null;
    this.echo = false;                 // local echo toggle
    this.connectTimeoutSec = 10;       // connection establishment timeout
    this.idleTimeoutSec = 30;          // inactivity (no received data) timeout
    this._bufferedInput = '';
    this._lastDataTime = time();
    this._connectStart = 0;
    this._pollTimerEvent = null;
    this.addrStr = ''; // unified editable host:port[,idle] string at PROMPT
}
extend(RawGateSub, Subprogram);

RawGateSub.prototype.setParentFrame = function(f){ this.parentFrame = f; };

RawGateSub.prototype.enter = function(done){
    Subprogram.prototype.enter.call(this, done);
    // Start polling loop (200ms) to mimic original while() logic for recv
    var self=this;
    try {
        if(this.shell && this.shell.timer){
            this._pollTimerEvent = this.shell.timer.addEvent(200,true,function(){ self.pollLoop(); });
        } else if(typeof Timer === 'function') {
            this._ownTimer = new Timer();
            this._pollTimerEvent = this._ownTimer.addEvent(200,true,function(){ self.pollLoop(); });
        }
    } catch(e){}
};

RawGateSub.prototype.ensureFrames = function(){
    if(!this.parentFrame) return;
    if(!this.frameOutput){
        var h = Math.max(1,this.parentFrame.height-1);
        this.frameOutput = new Frame(1,1,this.parentFrame.width,h,ICSH_ATTR('RAW_OUTPUT'),this.parentFrame); this.frameOutput.open();
    }
    if(!this.frameInput){
        this.frameInput = new Frame(1,this.parentFrame.height,this.parentFrame.width,1,ICSH_ATTR('RAW_INPUT'),this.parentFrame); this.frameInput.open();
    }
};

RawGateSub.prototype.draw = function(){
    this.ensureFrames();
    if(!this.frameOutput) return;
    var o=this.frameOutput; o.cleared=false; o.cycle();
    if(this.state==='PROMPT'){
        if(!o.isCleared){ o.clear(); o.isCleared=true; }
        o.gotoxy(1,1);
        o.putmsg('\x01hRaw TCP Gateway\x01n\r\n');
        o.putmsg('Enter host:port (ESC to exit).\r\n');
        o.putmsg('Example: example.com:80\r\n');
    } else if(this.state==='CONNECTING'){
        if(!o.isCleared){ o.clear(); o.isCleared=true; }
        o.gotoxy(1,1);
        o.putmsg('Connecting to '+this.host+':'+this.port+' ... (Ctrl-C to cancel)\r\n');
    } else if(this.state==='SESSION'){
        // output frame accumulative; nothing to redraw wholesale each cycle
    }
    this.drawInput();
    this.parentFrame && this.parentFrame.cycle();
};

RawGateSub.prototype.drawInput = function(){
    if(!this.frameInput) return; var f=this.frameInput; f.clear(); f.gotoxy(1,1);
    var prompt='';
    if(this.state==='PROMPT') {
        // Show unified addr string; hint about optional ,idle seconds
        var show = this.addrStr;
        if(!show && this.host) show = this.host + (this.port? (':'+this.port):'');
        prompt='Host:Port[,idle]> '+show;
    }
    else if(this.state==='CONNECTING') prompt='[Connecting] Ctrl-C abort';
    else if(this.state==='SESSION') prompt=this.host+':'+this.port+' (Ctrl-C to disconnect)>'; 
    if(prompt.length>f.width) prompt=prompt.substr(prompt.length-f.width);
    f.putmsg(prompt);
    f.cycle();
};

RawGateSub.prototype.appendOutput = function(text){
    // Append raw gateway output into the scrolling output frame.
    // (Optional debug) // dbug && dbug('rawgate','recv '+text.length+' bytes');
    if(!this.frameOutput) return;
    // basic scroll: if at bottom height lines, clear when near overflow for simplicity
    var o=this.frameOutput;
    o.gotoxy(1,o.height);
    var lines = text.split(/\r?\n/);
    for(var i=0;i<lines.length;i++){
        var part=lines[i];
        // Wrap lines longer than width
        while(part.length>o.width){
            o.putmsg(part.substr(0,o.width)+'\r\n');
            part=part.substr(o.width);
        }
        o.putmsg(part);
        if(i<lines.length-1) o.putmsg('\r\n');
    }
    o.cycle();
};

RawGateSub.prototype.tryConnect = function(){
    // Parse addrStr: host:port[,idle]
    if(this.addrStr){
        var parts=this.addrStr.trim().split(',');
        var hostPort=parts[0];
        var m=hostPort.match(/^([^:]+):(\d{1,5})$/);
        if(m){ this.host=m[1]; this.port=m[2]; }
        if(parts.length>1){ var idle=parseInt(parts[1],10); if(!isNaN(idle) && idle>0) this.idleTimeoutSec=idle; }
    }
    if(!this.host || !this.port){ this.appendOutput('\r\nProvide host:port first.'); this.state='PROMPT'; this.draw(); return; }
    var p=parseInt(this.port,10); if(isNaN(p) || p<=0 || p>65535){ this.appendOutput('\r\nInvalid port.'); this.state='PROMPT'; this.draw(); return; }
    this.state='CONNECTING'; this.draw();
    try {
        this.sock = new Socket();
        this._connectStart = time();
        if(!this.sock.connect(this.host, p, this.connectTimeoutSec)){
            this.appendOutput('\r\nConnect failed.'); this.sock.close(); this.sock=null; this.state='PROMPT'; this.draw(); return;
        }
        this.appendOutput('\r\nConnected. (Ctrl-C = disconnect, Ctrl-E = toggle echo '+(this.echo?'ON':'OFF')+')');
        this.state='SESSION';
        this._lastDataTime = time();
    } catch(e){
        this.appendOutput('\r\nError: '+e); this.state='PROMPT'; this.draw();
    }
};

RawGateSub.prototype.handleKey = function(k){
    if(!k) return;
    if(this.state==='PROMPT'){
        if(k==='\x1B'){ this.exit(); return; }
        if(k==='\r' || k==='\n'){
            var combined=this.addrStr.trim();
            if(!combined){ this.exit(); return; }
            this.tryConnect(); return;
        }
        if(k==='\x08' || k==='\x7F'){ // backspace
            if(this.addrStr.length){ this.addrStr=this.addrStr.substr(0,this.addrStr.length-1); this.drawInput(); }
            return;
        }
        if(k.length===1 && k>=' ' && k<='~'){
            // allow only one colon
            if(k===':' && this.addrStr.indexOf(':')!==-1) return;
            this.addrStr+=k; this.drawInput();
        }
        return;
    }
    if(k===KEY_ABORT){ // Ctrl-C
        if(this.state==='SESSION' || this.state==='CONNECTING'){
            try{ if(this.sock) this.sock.close(); }catch(e){}
            this.sock=null; this.state='PROMPT'; this.draw(); return;
        } else { this.exit(); return; }
    }
    if(this.state==='CONNECTING') return; // ignore typing while connecting
    if(this.state==='SESSION'){
        // Ctrl-E toggles echo
        if(k==='\x05'){ // ENQ (Ctrl-E)
            this.echo=!this.echo; this.appendOutput('\r\n(Local echo '+(this.echo?'ON':'OFF')+')'); this.drawInput(); return; }
        if(k==='\x1B'){ // ESC ends session too
            try{ if(this.sock) this.sock.close(); }catch(e){}
            this.sock=null; this.state='PROMPT'; this.draw(); return;
        }
        if(k==='\r' || k==='\n'){ try{ this.sock.send('\r\n'); if(this.echo) this.appendOutput('\r\n'); }catch(e){} return; }
        if(k==='\x08' || k==='\x7F'){ try{ this.sock.send('\b'); if(this.echo) this.appendOutput('\b'); }catch(e){} return; }
        // Forward any key sequence; if multi-char (e.g., arrow), send raw if possible
        try { this.sock.send(k); if(this.echo && k.length===1 && k>=' ' && k!=='\r') this.appendOutput(k); } catch(e){}
        return;
    }
};

RawGateSub.prototype.cycle = function(){
    // Fallback if shell calls cycle explicitly
    this.pollLoop();
};

// Polling loop that mimics the legacy while() structure for continuous recv
RawGateSub.prototype.pollLoop = function(){
    if(this.state!=='SESSION' || !this.sock) return;
    try {
        var w=true;
        // Read all available data (non-blocking)
        while(!js.terminated && this.sock.is_connected && this.sock.data_waiting){
            w=false;
            var data=this.sock.recv(512, 0);
            if(data && data.length){ this.appendOutput(data); this._lastDataTime=time(); }
            else break; // no more data immediately
        }
        // Inactivity timeout message
        if(time()-this._lastDataTime >= this.idleTimeoutSec){
            this.appendOutput('\r\n-- Idle '+this.idleTimeoutSec+'s --');
            this._lastDataTime=time();
        }
    } catch(e){
        this.appendOutput('\r\nSocket error: '+e); try{ this.sock.close(); }catch(_e){} this.sock=null; this.state='PROMPT'; this.draw();
    }
};

RawGateSub.prototype.cleanup = function(){
    try{ if(this.sock) this.sock.close(); }catch(e){}
    this.sock=null;
    try { if(this._pollTimerEvent) this._pollTimerEvent.abort = true; } catch(e){}
    try { if(this._ownTimer) this._ownTimer.cycle(); } catch(e){}
    try{ if(this.frameOutput) this.frameOutput.close(); }catch(e){}
    try{ if(this.frameInput) this.frameInput.close(); }catch(e){}
    this.frameOutput=this.frameInput=null;
    Subprogram.prototype.cleanup.call(this);
};

this.RawGateSub=RawGateSub;
