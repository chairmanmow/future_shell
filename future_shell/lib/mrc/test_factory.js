// Test factory integration
"use strict";
load('future_shell/lib/mrc/factory.js');

print('\n=== MRC Factory Integration Test ===\n');

// Simulate bbs object
if (typeof bbs === 'undefined') {
    bbs = {
        node_num: 1,
        online: true
    };
}

// Simulate user object
if (typeof user === 'undefined') {
    user = {
        alias: 'testuser',
        security: {
            password: 'testpass'
        }
    };
}

// Test 1: Get controller (should create new)
print('Test 1: Get controller (should create new)...');
var controller1 = getMrcController();
if (!controller1) {
    print('  FAIL: Controller is null');
} else {
    print('  PASS: Controller created');
}

// Test 2: Get controller again (should return same instance)
print('\nTest 2: Get controller again (should return same)...');
var controller2 = getMrcController();
if (controller1 !== controller2) {
    print('  FAIL: Got different controller instance');
} else {
    print('  PASS: Got same controller instance');
}

// Test 3: Verify controller stored on bbs object
print('\nTest 3: Verify controller stored on bbs object...');
if (bbs._mrcController !== controller1) {
    print('  FAIL: Controller not stored correctly');
} else {
    print('  PASS: Controller stored on bbs._mrcController');
}

// Test 4: Verify controller has expected methods
print('\nTest 4: Verify controller API...');
var methods = ['connect', 'disconnect', 'tick', 'joinRoom', 'sendMessage',
    'getSnapshot', 'isDirty', 'clearDirty', 'addListener', 'removeListener'];
var allPresent = true;
for (var i = 0; i < methods.length; i++) {
    if (typeof controller1[methods[i]] !== 'function') {
        print('  FAIL: Missing method:', methods[i]);
        allPresent = false;
    }
}
if (allPresent) {
    print('  PASS: All expected methods present');
}

// Test 5: Get snapshot
print('\nTest 5: Get snapshot...');
var snapshot = controller1.getSnapshot();
if (!snapshot || !snapshot.connection || !snapshot.room) {
    print('  FAIL: Invalid snapshot structure');
} else {
    print('  PASS: Snapshot has expected structure');
    print('    - Connection state:', snapshot.connection.state);
    print('    - Room name:', snapshot.room.name || '(none)');
    print('    - Message count:', snapshot.messages.length);
}

// Test 6: Cleanup
print('\nTest 6: Cleanup...');
destroyMrcController();
if (typeof bbs._mrcController !== 'undefined') {
    print('  FAIL: Controller not cleaned up');
} else {
    print('  PASS: Controller cleaned up from bbs object');
}

print('\n=== All Tests Complete ===\n');
