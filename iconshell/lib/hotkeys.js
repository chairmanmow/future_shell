IconShell.prototype.assignViewHotkeys = function(items, logit) {
    if (!items) return;
    var used = {};
    // Ensure currentView is set
    if (!this.currentView) this.currentView = this.generateViewId ? this.generateViewId() : "root";
    this.viewHotkeys[this.currentView] = {};
    this.assignHotkeys(items, used, logit, this.currentView);
};

IconShell.prototype.assignHotkeys = function (items, used, logit, viewId) {
    used = used || {};
    viewId = viewId || (this.currentView || "root");
    var hotkeyPool = [];
    // Add uppercase A-Z
    for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(65 + k));
    // Add digits 0-9
    for (var k = 0; k < 10; k++) hotkeyPool.push(String.fromCharCode(48 + k));
    // Add lowercase a-z
    for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(97 + k));

    var fallbackCount = 1;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type === 'placeholder') continue;
        // Assign hotkey if not already set
        if (!item.hotkey) {
            var label = item.label || "";
            var found = false;
            // Try to assign a hotkey from the label (A-Z, 0-9, a-z)
            for (var j = 0; j < label.length; j++) {
                var c = label[j];
                if (hotkeyPool.indexOf(c) !== -1 && !used[c]) {
                    item.hotkey = c;
                    used[c] = true;
                    found = true;
                    if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
                    break;
                }
                var cU = c;
                if (hotkeyPool.indexOf(cU) !== -1 && !used[cU]) {
                    item.hotkey = cU;
                    used[cU] = true;
                    found = true;
                    if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
                    break;
                }
            }
            // fallback: assign any unused hotkey from the pool
            if (!found) {
                for (var h = 0; h < hotkeyPool.length; h++) {
                    var hk = hotkeyPool[h];
                    if (!used[hk]) {
                        item.hotkey = hk;
                        used[hk] = true;
                        found = true;
                        if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
                        break;
                    }
                }
            }
            // If still not found, assign a fallback hotkey (e.g., F1, F2, ...)
            if (!found) {
                var fallbackKey = 'F' + fallbackCount;
                item.hotkey = fallbackKey;
                used[fallbackKey] = true;
                fallbackCount++;
                dbug("Hotkey pool exhausted, assigning fallback hotkey " + fallbackKey + " to " + item.label, "hotkeys");
            }
        } else {
            used[item.hotkey] = true;
            if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
        }
        // Register the action for this hotkey in the viewHotkeys map
        if (!this.viewHotkeys[viewId]) this.viewHotkeys[viewId] = {};
        if (item.hotkey && typeof item.action === 'function') {
            this.viewHotkeys[viewId][item.hotkey] = item.action.bind(this);
        }
    }
}
