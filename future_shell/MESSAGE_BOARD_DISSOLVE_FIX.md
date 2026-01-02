# Message Board Dissolve Animation Fix

## Problem
Message board views (Groups, Subs) were not showing dissolve animations when pressing ENTER to navigate between views, even though the icon shell main menu did show them.

## Root Cause
The `handleGroupEnter()` and `handleSubEnter()` functions in `message_board_views.js` were calling view rendering and action functions directly without playing the dissolve animation on the selected icon first.

## Solution
Added a `playDissolveBeforeTransition()` helper function that:
1. Accesses the board's icon grid (`board.grid.cells`)
2. Gets the visible index of the currently selected item
3. Retrieves the icon frame from that cell
4. Plays the dissolve animation (from eye_candy.js)
5. Clears and cycles the frame to reset it

The function gracefully handles missing grid, dissolve function, or cell data by silently returning.

## Changes Made

### File: `/sbbs/mods/future_shell/lib/subprograms/message_board_views.js`

1. **Added `playDissolveBeforeTransition()` function** (lines 233-259):
   - Validates grid and cell existence
   - Calculates visible index accounting for scroll offset
   - Plays dissolve animation before view transition

2. **Modified `handleGroupEnter()` function** (lines 261-278):
   - Now calls `playDissolveBeforeTransition(board)` before:
     - Rendering sub view for group selection
     - Executing item action functions

3. **Modified `handleSubEnter()` function** (lines 400-420):
   - Now calls `playDissolveBeforeTransition(board)` before:
     - Rendering group view (back navigation)
     - Opening sub reader or threads view
     - Handling search items

## Implementation Details

The `playDissolveBeforeTransition()` function mirrors the logic from `IconShell.prototype.playDissolveBefore()` in shelllib.js:

```javascript
function playDissolveBeforeTransition(board) {
    if (!board || !board.grid || !board.grid.cells) return;

    var visibleIdx = board.selection - (board.scrollOffset || 0);
    if (visibleIdx < 0 || visibleIdx >= board.grid.cells.length) return;

    var cell = board.grid.cells[visibleIdx];
    if (!cell || !cell.icon) return;
    if (typeof dissolve !== 'function') return;

    try {
        var wasTransparent = cell.icon.transparent;
        cell.icon.transparent = false;
        var dissolveColor = (typeof board.paletteAttr === 'function')
            ? board.paletteAttr('ICON_DISSOLVE_COLOR', BLACK)
            : BLACK;
        dissolve(cell.icon, dissolveColor, 12);
        cell.icon.clear();
        cell.icon.cycle();
        cell.icon.transparent = wasTransparent;
    } catch (e) {
        // Silently fail - dissolve is optional
    }
}
```

## Testing
1. Navigate to message boards (Forums)
2. Use arrow keys to select items in Groups view
3. Press ENTER to navigate to Subs
4. **Expected**: Dissolve animation plays on selected icon before transitioning
5. Use arrow keys to select a sub
6. Press ENTER to open reader/threads
7. **Expected**: Dissolve animation plays before transitioning to that view

## Compatibility
- Eye candy dissolve function is already loaded in message_boards.js
- Function gracefully degrades if grid doesn't exist
- Does not affect non-grid-based views (SearchView, ThreadsView, ReadView)
