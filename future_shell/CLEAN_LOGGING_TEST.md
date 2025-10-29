# Clean Logging Test - Critical Performance Investigation

## Hypothesis
The 29-second delay in `playDissolveBefore()` is caused by file I/O overhead (the 30+ `logFile.writeln()` calls scattered throughout the function).

## Test Methodology

**File Modified**: `/sbbs/mods/future_shell/lib/shell/shelllib.js`

**Change**: Removed ALL internal logging from `playDissolveBefore()`:
- Stripped function from ~93 lines down to ~35 lines
- Removed every `logFile` operation (open, writeln, close)
- Kept ALL functional logic intact:
  - Grid validation checks
  - Visible index calculation
  - Cell access and icon verification
  - Dissolve function check
  - Transparency state management
  - paletteAttr() call for dissolve color
  - dissolve() animation call
  - clear() and cycle() calls
  - Exception handling

**External Timing Preserved**: The wrapper timing in `_handleItemSelection()` (grid_nav.js, lines 118-123) still measures the total duration:
```javascript
var t1 = Date.now();
this.playDissolveBefore(this.selection);
var t2 = Date.now();
logFile.writeln('[_handleItemSelection] playDissolveBefore END at ' + t2 + ' (duration: ' + (t2 - t1) + 'ms)');
```

## Expected Results

### If logging overhead IS the bottleneck:
- playDissolveBefore duration will drop from 29 seconds to ~900ms (dissolve animation only)
- Arrow+ENTER navigation will become instant or very fast
- Hotkey navigation will remain unchanged
- **Conclusion**: The 30+ logFile operations were causing the delay

### If logging overhead is NOT the bottleneck:
- playDissolveBefore duration will remain ~29 seconds
- All the checked code paths are NOT the problem
- **Conclusion**: The delay must be in code that:
  - Runs BEFORE the first logging statement (impossible to find with internal logging)
  - OR isn't being called at all
  - OR is in an external system-level operation (OS I/O, BBS kernel, etc.)

## How to Test

1. **Restart the shell** - Synchronet BBS caches JavaScript modules, so the clean code won't execute until the shell process restarts
2. **Navigate with arrow keys** - Press arrow keys to move through items
3. **Press ENTER on an item** - This triggers arrow+ENTER path which calls playDissolveBefore
4. **Check the log** - Read `/sbbs/data/dissolve_debug.log` and look for the timing line:
   - `[_handleItemSelection] playDissolveBefore END at XXXXXX (duration: XXXXms)`
5. **Record the duration** - Compare to previous ~29000ms timing

## Why This Matters

This test definitively answers: **Is the problem in code we can see and control, or somewhere deeper?**

- If clean → We can optimize further (reduce animation, move to callback, etc.)
- If still slow → We've exhausted local code changes; need system-level investigation (Synchronet kernel, file system locks, etc.)

## Files Changed
- `/sbbs/mods/future_shell/lib/shell/shelllib.js` - playDissolveBefore function (lines 387-480)

## Next Steps
After test results:
1. If fast → logging WAS the problem; can now optimize accordingly
2. If slow → need different approach entirely; investigate system-level delays
