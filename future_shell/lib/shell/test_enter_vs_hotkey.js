// Test harness to compare ENTER path vs hotkey path execution
"use strict";
// Run this to see which code paths are actually being called and in what order

IconShell.prototype.testEnterVsHotkey = function() {
    var testLog = new File(system.logs_dir + 'test_enter_vs_hotkey.log');
    testLog.open('w');

    testLog.writeln('=== TEST HARNESS: ENTER vs HOTKEY PATH ===');
    testLog.writeln('');
    testLog.writeln('Instructions:');
    testLog.writeln('1. Press an arrow key to move selection');
    testLog.writeln('2. Press ENTER - watch log for execution order');
    testLog.writeln('3. Note timestamp when subprogram launches');
    testLog.writeln('4. Then click same item - watch log for execution order');
    testLog.writeln('5. Note timestamp when subprogram launches');
    testLog.writeln('');
    testLog.writeln('Compare the two execution paths and timestamps.');
    testLog.writeln('');
    testLog.close();

    // Wrap _handleItemSelection to log detailed timing
    var originalHandleItemSelection = this._handleItemSelection;
    this._handleItemSelection = function(realItem) {
        var startTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + startTime + '] _handleItemSelection START');
        testLog.writeln('  this.selection=' + this.selection);
        testLog.writeln('  this.scrollOffset=' + this.scrollOffset);
        testLog.writeln('  this.grid exists=' + (this.grid ? 'yes' : 'no'));
        testLog.close();

        // Call original
        originalHandleItemSelection.call(this, realItem);

        var endTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + endTime + '] _handleItemSelection END (duration: ' + (endTime - startTime) + 'ms)');
        testLog.close();
    };

    // Wrap _handleHotkeyAction to log detailed timing
    var originalHandleHotkeyAction = this._handleHotkeyAction;
    this._handleHotkeyAction = function(ch) {
        var startTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + startTime + '] _handleHotkeyAction START (ch=' + JSON.stringify(ch) + ')');
        testLog.writeln('  this.selection=' + this.selection);
        testLog.writeln('  this.scrollOffset=' + this.scrollOffset);
        testLog.writeln('  this.grid exists=' + (this.grid ? 'yes' : 'no'));
        testLog.close();

        // Call original
        var result = originalHandleHotkeyAction.call(this, ch);

        var endTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + endTime + '] _handleHotkeyAction END (duration: ' + (endTime - startTime) + 'ms)');
        testLog.close();

        return result;
    };

    // Wrap launchSubprogram to see when it's actually called
    var originalLaunchSubprogram = this.launchSubprogram;
    this.launchSubprogram = function(name, handlers) {
        var startTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + startTime + '] launchSubprogram START (name=' + name + ')');
        testLog.close();

        var result = originalLaunchSubprogram.call(this, name, handlers);

        var endTime = Date.now();
        testLog.open('a');
        testLog.writeln('[' + endTime + '] launchSubprogram END');
        testLog.close();

        return result;
    };

    testLog.open('a');
    testLog.writeln('');
    testLog.writeln('Test harness initialized. Ready to compare paths.');
    testLog.close();

    log('Test harness loaded - check ' + system.logs_dir + 'test_enter_vs_hotkey.log');
};

// Initialize on load
if (typeof this !== 'undefined' && this.testEnterVsHotkey) {
    this.testEnterVsHotkey();
}
