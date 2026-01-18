/**
"use strict";
 * Test MRC Connection Flow
 * Simulates the connection and cycling to verify socket processing
 */

load('future_shell/lib/mrc/factory.js');

print('\n=== MRC Connection Test ===\n');

// Setup globals
if (typeof bbs === 'undefined') {
    bbs = { node_num: 1, online: true };
}
if (typeof user === 'undefined') {
    user = { alias: 'testuser', security: { password: 'testpass' } };
}

// Enable debug output
if (typeof global !== 'undefined') {
    global.__MRC_CONTROLLER_DEBUG__ = true;
    global.__MRC_CLIENT_DEBUG__ = true;
}

print('Getting controller...');
var controller = getMrcController();
if (!controller) {
    print('FAIL: Controller is null');
    exit(1);
}
print('PASS: Controller created\n');

print('Controller state:');
var snapshot = controller.getSnapshot();
print('  Connection state:', snapshot.connection.state);
print('  Connected:', snapshot.connection.connected);
print('  Room:', snapshot.room.name || '(none)');
print('  Messages:', snapshot.messages.length);

print('\nCycling controller 10 times to process socket events...');
for (var i = 0; i < 10; i++) {
    controller.tick();
    mswait(100);
}

snapshot = controller.getSnapshot();
print('\nAfter cycling:');
print('  Connection state:', snapshot.connection.state);
print('  Connected:', snapshot.connection.connected);
print('  Room:', snapshot.room.name || '(none)');
print('  Messages:', snapshot.messages.length);

print('\n=== Test Complete ===\n');
