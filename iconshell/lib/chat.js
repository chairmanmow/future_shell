load("json-chat.js");
// Chat subprogram as a constructor function using JSONChat backend
function Chat() {
	this.input = "";
	this.running = false;
	this.channel = "main";
	this.jsonchat = null;
}

Chat.prototype.enter = function() {
	log("Enter chat");
	this.running = true;
	// Setup JSONChat backend
	var usernum = (typeof user !== 'undefined' && user.number) ? user.number : 1;
	var host = bbs.sys_inetaddr || "127.0.0.1";
	var port = 10088; // Adjust as needed
	var jsonclient = new JSONClient(host, port);
	this.jsonchat = new JSONChat(usernum, jsonclient, host, port);
	this.jsonchat.join(this.channel);
	// No key polling here; shell will call processKey
};

Chat.prototype.processKey = function(key) {
	if (!this.running) return;
	this.jsonchat.cycle();
	if (typeof key === 'string' && key.length > 0) {
		if (key === '\x1B') { // ESC
			this.running = false;
			return 'exit';
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
	this.draw();
};
	// On exit, restore shell UI

Chat.prototype.exit = function() {
	this.running = false;
	if (this.jsonchat) this.jsonchat.disconnect();
	this.cleanup();
};

Chat.prototype.cleanup = function() {
	// Release resources, null references, and reset state
    log("Cleanup() called");
	this.input = "";
	this.jsonchat = null;
	this.channel = "main";
	// Add any other cleanup logic here
};


Chat.prototype.handleKey = function(key) {
	// Not used in new model; input handled in enter loop
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

// Export for Synchronet JS module system
if (typeof exports !== 'undefined') exports.Chat = Chat;
if (typeof module !== 'undefined') module.exports = Chat;
