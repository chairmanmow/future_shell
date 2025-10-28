# Grid Extension Pattern: Selection Border & Dissolve Animation

## Overview

The main shell (shelllib.js / grid_nav.js) implements two visual enhancements for grid-based UIs:

1. **Selection Border**: A visual frame drawn around the selected cell (icon + label)
2. **Dissolve Animation**: A pixel-dissolve effect that plays when launching an item

This document explains how to implement the same pattern in other grid-based subprograms.

---

## Implementation Architecture

### Current Shell Implementation

**Theme Configuration** (`config/theme.ini`):
```ini
ICON_SELECTION_BORDER = CYAN
ICON_DISSOLVE_COLOR = BLACK
```

**Cell Structure** (grid_nav.js `_createIconCell()`):
```javascript
{
    icon: iconFrame,           // Icon graphic frame
    label: labelFrame,         // Label text frame
    item: itemObject,          // Item data
    iconObj: iconRenderer,     // Icon renderer
    borderFrame: borderFrame   // NEW: Selection border frame
}
```

**Border Frame Dimensions**:
- Position: `(x - 1, y - 1)` relative to icon position
- Size: `(iconW + 2, iconH + labelH + 2)`
- Uses existing `Frame.prototype.drawBorder()` from frame-ext.js

**Key Functions**:

1. **shelllib.js `drawCellBorder(cell)`** - Draw border using theme color
2. **shelllib.js `clearCellBorder(cell)`** - Clear border from frame
3. **shelllib.js `playDissolveBefore(selectionIndex)`** - Play dissolve animation
4. **grid_nav.js `_highlightSelectedCell()`** - Manages border on selection change
5. **grid_nav.js `_handleItemSelection()`** - Calls dissolve before launching

---

## How to Implement in Other Subprograms

### Step 1: Add Theme Configuration

Update `config/theme.ini` with entries for your subprogram:

```ini
[Colors]

; --- Your Subprogram ---
yoursubprogram.ICON_SELECTION_BORDER = CYAN
yoursubprogram.ICON_DISSOLVE_COLOR = BLACK
```

### Step 2: Enhance Cell Creation

When building your grid cells, create a borderFrame:

```javascript
// Pseudo-code for cell creation function
function createGridCell(itemData, x, y, iconW, iconH, labelH, parentFrame) {
    // Create icon and label frames (existing code)
    var iconFrame = new Frame(x, y, iconW, iconH, iconAttr, parentFrame);
    var labelFrame = new Frame(x, y + iconH, iconW, labelH, labelAttr, parentFrame);

    // NEW: Create border frame
    var borderFrame = new Frame(
        x - 1, y - 1,                           // Inset 1 cell
        iconW + 2, iconH + labelH + 2,          // Include margins
        borderAttr,
        parentFrame
    );
    borderFrame.transparent = true;

    // Return cell with borderFrame added
    return {
        icon: iconFrame,
        label: labelFrame,
        item: itemData,
        borderFrame: borderFrame,
        // ... other properties
    };
}
```

### Step 3: Add Border Management Functions

Add these utility functions to your subprogram:

```javascript
/**
 * Draw a border around the given cell.
 */
function drawCellBorder(cell, paletteAttr) {
    if (!cell || !cell.borderFrame) return;

    var fallbackBorderColor = (typeof CYAN !== 'undefined' ? CYAN : 6);
    var borderColor = (typeof paletteAttr === 'function')
        ? paletteAttr('ICON_SELECTION_BORDER', fallbackBorderColor)
        : fallbackBorderColor;

    try {
        cell.borderFrame.drawBorder(borderColor);
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('drawCellBorder error: ' + e);
    }
}

/**
 * Clear a cell's border.
 */
function clearCellBorder(cell) {
    if (!cell || !cell.borderFrame) return;
    try {
        cell.borderFrame.clear();
        cell.borderFrame.cycle();
    } catch (e) {
        dbug('clearCellBorder error: ' + e);
    }
}

/**
 * Play dissolve animation on cell's icon.
 */
function playDissolveBefore(cell, paletteAttr) {
    if (!cell || !cell.iconFrame) return false;

    if (typeof dissolve !== 'function') {
        dbug('dissolve function not available');
        return false;
    }

    try {
        var fallbackDissolveColor = (typeof BLACK !== 'undefined' ? BLACK : 0);
        var dissolveColor = (typeof paletteAttr === 'function')
            ? paletteAttr('ICON_DISSOLVE_COLOR', fallbackDissolveColor)
            : fallbackDissolveColor;

        dissolve(cell.iconFrame, dissolveColor, 1);
        return true;
    } catch (e) {
        dbug('dissolve error: ' + e);
        return false;
    }
}
```

### Step 4: Integrate Selection Highlighting

In your selection/navigation code:

```javascript
// When selection changes:
var previousCell = grid.cells[previousSelectionIndex];
var currentCell = grid.cells[currentSelectionIndex];

if (previousCell) clearCellBorder(previousCell);
if (currentCell) drawCellBorder(currentCell, paletteAttr);

// Highlight current item visually
paintItemSelection(currentCell, true);
```

### Step 5: Integrate Dissolve Animation

Before launching an item:

```javascript
// When user activates/launches an item:
var cell = grid.cells[selectionIndex];

// Play dissolve effect
playDissolveBefore(cell, paletteAttr);

// Then execute the item's action
itemAction.call(this);
```

### Step 6: Pre-load eye_candy.js

At the top of your subprogram (near other load statements):

```javascript
try { load('future_shell/lib/effects/eye_candy.js'); } catch (e) { }
```

---

## Important Design Notes

### Border Frame Overlap

The border frame intentionally overlaps the grid margin/gap space:

- **Why**: Only one border is active at a time (only selected cell shows border)
- **No collision**: When selection moves, previous border is cleared before new one drawn
- **Design trade-off**: Exploits margin space but provides clean selection visualization

### Dissolve Animation Timing

The dissolve animation is **synchronous** (blocking):

- Runs to completion before the item action executes
- Creates visual feedback that item is launching
- May take 100-500ms depending on icon size and terminal speed
- If latency is unacceptable, consider queueing dissolve to run after action starts

### Color Theme Integration

Both features get their colors from `theme.ini`:

```
ICON_SELECTION_BORDER: Color of the selection box
ICON_DISSOLVE_COLOR: Color of dissolve pixel blocks
```

If theme colors are not defined, graceful fallbacks are used (CYAN and BLACK).

---

## Subprogram Implementation Checklist

- [ ] Theme entries added to config/theme.ini
- [ ] Cell structure includes borderFrame property
- [ ] drawCellBorder() function implemented
- [ ] clearCellBorder() function implemented
- [ ] playDissolveBefore() function implemented
- [ ] eye_candy.js pre-loaded at module top
- [ ] Selection highlighting calls drawCellBorder()
- [ ] Previous selection calls clearCellBorder()
- [ ] Item launch calls playDissolveBefore() before action
- [ ] Grid redraw resets border tracking
- [ ] Tested with keyboard navigation
- [ ] Tested with mouse hotspots (if applicable)
- [ ] Tested theme color customization

---

## Subprogram Inventory

Candidates for implementing this pattern (to be investigated):

- [ ] `lib/subprograms/usage-viewer.js` - Game/usage display grid
- [ ] `lib/subprograms/file-area.js` - File listing grid
- [ ] `lib/subprograms/message-board.js` - Message/thread grid
- [ ] `lib/util/layout/modal.js` - Modal content grids
- [ ] Other grid UIs TBD

---

## Testing Recommendations

### Border Visibility
```
1. Launch shell
2. Verify border appears around selected icon
3. Use arrow keys to navigate
4. Verify border clears old cell and appears on new cell
5. Verify border color matches theme.ini setting
```

### Dissolve Animation
```
1. Select an item
2. Press Enter/Return
3. Verify pixel-dissolve effect plays on selected icon
4. Verify dissolve completes before item launches
5. Verify dissolve color matches theme.ini setting
```

### Edge Cases
```
1. Test selection at grid edges
2. Test selection with scrolling (if applicable)
3. Test switching folders/views (border should reset)
4. Test with custom theme colors
5. Test with eye_candy.js unavailable (should degrade gracefully)
```

---

## Troubleshooting

### Border not appearing
- Verify borderFrame was created in cell structure
- Verify drawCellBorder() is called after paintIcon()
- Check that borderFrame.transparent = true was set
- Verify theme color is defined or fallback is working

### Dissolve not playing
- Verify eye_candy.js is pre-loaded
- Check dissolve function availability: `typeof dissolve === 'function'`
- Verify iconFrame exists and has dimensions
- Check browser/terminal supports frame operations

### Performance issues
- Reduce dissolve delay: change `dissolve(..., 1)` to `dissolve(..., 0)`
- Only draw borders for visible cells
- Consider async dissolve if blocking is problematic

---

## Reference: Shell Implementation

See these files for the canonical implementation:

- **Border/Selection Logic**: `lib/shell/grid_nav.js` lines 447-464 (_highlightSelectedCell)
- **Border Functions**: `lib/shell/shelllib.js` lines 349-378 (drawCellBorder, clearCellBorder)
- **Dissolve Function**: `lib/shell/shelllib.js` lines 387-417 (playDissolveBefore)
- **Launch Integration**: `lib/shell/grid_nav.js` lines 90-104 (_handleItemSelection)
- **Cell Creation**: `lib/shell/grid_nav.js` lines 620-628 (_createIconCell - borderFrame)
- **Theme Config**: `config/theme.ini` lines 94-95

