// Simulating the message_boards.js load sequence
"use strict";
print('Simulating message_boards.js load...');

// Load subprogram.js first (which exports extend)
load('future_shell/lib/subprograms/subprogram.js');
print('After loading subprogram.js:');
print('typeof extend: ' + typeof extend);
print('typeof Subprogram: ' + typeof Subprogram);

// Create a mock MessageBoard constructor
function MessageBoard() {
    Subprogram.call(this, {name: 'message-boards'});
    this.running = false; // Set by constructor
    this.autoCycle = true;
}

print('Before extend:');
print('MessageBoard.prototype.enter: ' + typeof MessageBoard.prototype.enter);

try {
    extend(MessageBoard, Subprogram);
    print('extend() succeeded');
} catch (e) {
    print('extend() ERROR: ' + e);
}

print('After extend:');
print('MessageBoard.prototype.enter: ' + typeof MessageBoard.prototype.enter);
print('MessageBoard.prototype.running: ' + typeof MessageBoard.prototype.running);

// Test creating an instance
var mb = new MessageBoard();
print('Instance created:');
print('mb.running: ' + mb.running);
print('mb instanceof Subprogram: ' + (mb instanceof Subprogram));

// Test calling enter
print('Calling enter...');
mb.enter(function() { print('done callback fired'); });
print('After enter:');
print('mb.running: ' + mb.running);
