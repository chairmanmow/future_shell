// Minimal test harness for playDissolveBefore timing analysis
// This script calls playDissolveBefore in isolation and measures execution time

var testLog = new File(system.logs_dir + 'test_play_dissolve_before.log');
testLog.open('w');

testLog.writeln('=== TEST HARNESS: playDissolveBefore isolation ===');
testLog.writeln('Purpose: Call playDissolveBefore directly and measure timing');
testLog.writeln('This isolates the function from the normal action pipeline');
testLog.writeln('');

// Ensure dissolve is loaded
if (typeof dissolve !== 'function') {
    testLog.writeln('ERROR: dissolve function not available');
    testLog.close();
    exit(1);
}

testLog.writeln('dissolve function available: YES');

// Create a mock cell with icon frame
var mockCell = {
    icon: new Frame(12, 6, 1, 1),  // 12x6 frame at position 1,1
    label: new Frame(14, 1, 1, 8),
    borderFrame: new Frame(14, 8, 1, 0),
    item: { label: 'Test Item', type: 'test' },
    iconObj: null
};

testLog.writeln('Mock cell created with 12x6 icon frame');
testLog.writeln('');

// Create a minimal IconShell mock with just what we need
var testShell = {};
testShell.grid = {
    cells: [null, null, null, null, null, null, null, null, null, null, mockCell]  // mockCell at index 10
};
testShell.scrollOffset = 0;
testShell.selection = 10;
testShell.paletteAttr = function(name, fallback) {
    return fallback;  // Just return black
};

// Use the real playDissolveBefore from IconShell
testShell.playDissolveBefore = IconShell.prototype.playDissolveBefore;

testLog.writeln('Test shell mock created');
testLog.writeln('Calling playDissolveBefore...');
testLog.writeln('');

var ts1 = Date.now();
testLog.writeln('START at ' + ts1);

// Call the function
var result = testShell.playDissolveBefore.call(testShell, 10);

var ts2 = Date.now();
var duration = ts2 - ts1;

testLog.writeln('END at ' + ts2);
testLog.writeln('DURATION: ' + duration + 'ms');
testLog.writeln('');

testLog.writeln('Result: ' + (result ? 'SUCCESS' : 'FAILED'));
testLog.writeln('');

if (duration > 1000) {
    testLog.writeln('WARNING: Execution took ' + duration + 'ms (> 1 second)');
    if (duration > 5000) {
        testLog.writeln('CRITICAL: Execution took ' + duration + 'ms (> 5 seconds)');
    }
}

testLog.writeln('');
testLog.writeln('Check dissolve_debug.log to see internal timing details');

testLog.close();
log('Test complete - check ' + system.logs_dir + 'test_play_dissolve_before.log');
