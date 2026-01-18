"use strict";

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

    var fallbackCount = 1;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type === 'placeholder') continue;
        if (typeof this._nextGridHotspotToken === 'function') {
            item.hotkey = this._nextGridHotspotToken();
            used[item.hotkey] = true;
        } else {
            if (!item.hotkey) {
                var label = item.label || "";
                var hotkeyPool = [];
                for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(65 + k));
                for (var k = 0; k < 10; k++) hotkeyPool.push(String.fromCharCode(48 + k));
                for (var k = 0; k < 26; k++) hotkeyPool.push(String.fromCharCode(97 + k));
                var found = this._assignHotkeyFromLabel(item, label, hotkeyPool, used, logit);
                if (!found) found = this._assignAnyUnusedHotkey(item, hotkeyPool, used, logit);
                if (!found) {
                    this._assignFallbackHotkey(item, fallbackCount, used);
                    fallbackCount++;
                }
            } else {
                used[item.hotkey] = true;
                if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
            }
        }
        if (!this.viewHotkeys[viewId]) this.viewHotkeys[viewId] = {};
        if (item.hotkey && typeof item.action === 'function') {
            this.viewHotkeys[viewId][item.hotkey] = item.action.bind(this);
        }
    }
};

IconShell.prototype._assignHotkeyFromLabel = function(item, label, hotkeyPool, used, logit) {
    for (var j = 0; j < label.length; j++) {
        var c = label[j];
        if (hotkeyPool.indexOf(c) !== -1 && !used[c]) {
            item.hotkey = c;
            used[c] = true;
            if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
            return true;
        }
        var cU = c;
        if (hotkeyPool.indexOf(cU) !== -1 && !used[cU]) {
            item.hotkey = cU;
            used[cU] = true;
            if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
            return true;
        }
    }
    return false;
};

IconShell.prototype._assignAnyUnusedHotkey = function(item, hotkeyPool, used, logit) {
    for (var h = 0; h < hotkeyPool.length; h++) {
        var hk = hotkeyPool[h];
        if (!used[hk]) {
            item.hotkey = hk;
            used[hk] = true;
            if(logit) dbug(item.label + " Assign hotkey " + JSON.stringify(item.hotkey), "hotkeys");
            return true;
        }
    }
    return false;
};

IconShell.prototype._assignFallbackHotkey = function(item, fallbackCount, used) {
    var fallbackKey = 'F' + fallbackCount;
    item.hotkey = fallbackKey;
    used[fallbackKey] = true;
    dbug("Hotkey pool exhausted, assigning fallback hotkey " + fallbackKey + " to " + item.label, "hotkeys");
};
