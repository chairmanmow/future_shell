// Comprehensive timing instrumentation to find the 30-second freeze

// Wrap key functions with timing
var originalOpenSelection = IconShell.prototype.openSelection;
IconShell.prototype.openSelection = function() {
    var ts = Date.now();
    var logFile = new File(system.logs_dir + 'timing_debug.log');
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts + '] openSelection START');
    logFile.close();

    var result = originalOpenSelection.call(this);

    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts2 + '] openSelection END (duration: ' + (ts2 - ts) + 'ms)');
    logFile.close();
    return result;
};

var originalHandleItemSelection = IconShell.prototype._handleItemSelection;
IconShell.prototype._handleItemSelection = function(realItem) {
    var ts = Date.now();
    var logFile = new File(system.logs_dir + 'timing_debug.log');
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts + '] _handleItemSelection START');
    logFile.close();

    var result = originalHandleItemSelection.call(this, realItem);

    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts2 + '] _handleItemSelection END (duration: ' + (ts2 - ts) + 'ms)');
    logFile.close();
    return result;
};

var originalDrawFolder = IconShell.prototype.drawFolder;
IconShell.prototype.drawFolder = function(options) {
    var ts = Date.now();
    var logFile = new File(system.logs_dir + 'timing_debug.log');
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts + '] drawFolder START');
    logFile.close();

    var result = originalDrawFolder.call(this, options);

    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts2 + '] drawFolder END (duration: ' + (ts2 - ts) + 'ms)');
    logFile.close();
    return result;
};

var originalPlayDissolveBefore = IconShell.prototype.playDissolveBefore;
IconShell.prototype.playDissolveBefore = function(selectionIndex) {
    var ts = Date.now();
    var logFile = new File(system.logs_dir + 'timing_debug.log');
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts + '] playDissolveBefore START');
    logFile.close();

    var result = originalPlayDissolveBefore.call(this, selectionIndex);

    var ts2 = Date.now();
    logFile.open('a');
    logFile.writeln('[TIMING ' + ts2 + '] playDissolveBefore END (duration: ' + (ts2 - ts) + 'ms)');
    logFile.close();
    return result;
};

// Log initialization
var logFile = new File(system.logs_dir + 'timing_debug.log');
logFile.open('w');
logFile.writeln('=== TIMING DEBUG INITIALIZED ===');
logFile.writeln('Now press arrow key + ENTER on an item');
logFile.writeln('This will show exactly where the 30-second delay happens');
logFile.writeln('');
logFile.close();

log('Timing debug initialized - check ' + system.logs_dir + 'timing_debug.log');
