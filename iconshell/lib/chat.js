load("json-chat.js");
load("event-timer.js");

// Chat subprogram as a constructor function using JSONChat backend
function Chat() {
	this.input = "";
	this.running = false;
	this.channel = "main";
	this.jsonchat = null;
}

Chat.prototype.enter = function(done) {
	var redrawTimer = new Timer();
	var redrawInterval = 500; // ms
	var usernum = (typeof user !== 'undefined' && user.number) ? user.number : 1;
	var host = bbs.sys_inetaddr || "127.0.0.1";
	var port = 10088; // Adjust as needed
	var jsonclient = new JSONClient(host, port);
	this.jsonchat = new JSONChat(usernum, jsonclient, host, port);
	this.jsonchat.join(this.channel);
    redrawTimer.addEvent(1000, true, this.refresh())
    this.refresh();
    this.running = true;
    this.done = done;
}

Chat.prototype.exit = function() {
    dbug("Attempting to exit()", "chat");
	this.running = false;
	if (this.jsonchat) this.jsonchat.disconnect();
	this.cleanup();
    this.done();
};

Chat.prototype.cleanup = function() {
	// Release resources, null references, and reset state
	dbug("Cleanup() called", "chat");
	this.input = "";
	this.jsonchat = null;
	this.channel = "main";
	// Add any other cleanup logic here
};


Chat.prototype.handleKey = function(key) {
	dbug("Chat.handleKey()" + key, "chat");
    if (typeof key === 'string' && key.length > 0) {
    if (key === '\x1B') { // ESC
        this.running = false;
        this.exit();
	dbug("Escape detected" + key, "chat");
    } else if (key === '\r') {
        if (this.input.trim().length > 0) {
            this.jsonchat.submit(this.channel, this.input);
            this.input = "";
        }
    } else if (key === '\b' || key === '\x7F') {
        this.input = this.input.slice(0, -1);
    } else if (key.length === 1) {
        this.input += key;
    }
}
};

Chat.prototype.draw = function() {
	// Simple text UI for chat (replace with frames as needed)
	console.clear(BG_BLACK|LIGHTGRAY);
	var y = 1;
	var chan = this.jsonchat ? this.jsonchat.channels[this.channel.toUpperCase()] : null;
	var messages = chan ? chan.messages : [];
	for (var i = Math.max(0, messages.length - 10); i < messages.length; i++) {
		var msg = messages[i];
		var from = msg.nick ? msg.nick.name : "";
		var text = msg.str || msg.text || "";
		console.gotoxy(2, y++);
		console.putmsg((from ? from + ": " : "") + text);
	}
	// Input line
	console.gotoxy(2, console.screen_rows - 2);
	console.putmsg("You: " + this.input + "_");
	// ESC to exit hint
	console.gotoxy(2, console.screen_rows - 1);
	console.putmsg("[ESC to exit chat]");
};

Chat.prototype.refresh = function (){
    this.jsonchat.cycle();
    this.draw();
}

