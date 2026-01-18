// Simple test to verify dissolve function works
"use strict";
load("sbbsdefs.js");

try { load('future_shell/lib/effects/eye_candy.js'); } catch (e) {
    log('Failed to load eye_candy.js: ' + e);
    exit(1);
}

if (typeof dissolve !== 'function') {
    log('ERROR: dissolve function not available');
    exit(1);
}

log('dissolve function loaded successfully');

// Create a test frame
var testFrame = new Frame(10, 5, 10, 10);
testFrame.open();
testFrame.clear();
testFrame.home();
testFrame.putmsg('TEST DISSOLVE');
testFrame.cycle();

log('Test frame created at 10,5 size 10x10');
log('Calling dissolve with BLACK color, 10ms delay...');

// Call dissolve
try {
    dissolve(testFrame, BLACK, 10);
    log('dissolve() completed successfully');
} catch (e) {
    log('ERROR calling dissolve: ' + e);
    exit(1);
}

testFrame.close();
log('Test complete - if you saw pixels dissolving on screen, dissolve works');
