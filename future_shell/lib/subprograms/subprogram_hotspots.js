// Lightweight wrapper so subprograms can share the shell HotSpotManager safely.
"use strict";
// Falls back to direct console hotspot APIs when the manager is unavailable.
(function (global) {
    if (typeof registerModuleExports !== 'function') {
        try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
    }

    function SubprogramHotspotHelper(opts) {
        opts = opts || {};
        this.shell = opts.shell || null;
        this.owner = opts.owner || (opts.layerName || 'subprogram');
        this.layerName = opts.layerName || ('sub-' + this.owner);
        this.priority = (typeof opts.priority === 'number') ? opts.priority : 40;
        this.autoActivate = opts.autoActivate !== false;
        this.manager = (this.shell && this.shell.hotspotManager) ? this.shell.hotspotManager : null;
        this.layerId = null;
        this._usingManager = false;
        this._fallbackActive = false;
        this._snapshotActive = false;
        this._currentDefs = [];

        if (this.manager && typeof this.manager.ensureLayer === 'function') {
            try {
                this.layerId = this.manager.ensureLayer(this.layerName, this.priority, { active: this.autoActivate });
                this._usingManager = !!this.layerId;
            } catch (err) {
                this.layerId = null;
                this._usingManager = false;
            }
        }
    }

    SubprogramHotspotHelper.prototype.set = function (defs, opts) {
        defs = Array.isArray(defs) ? defs : [];
        this._currentDefs = defs.slice();
        var shouldActivate = (opts && opts.activate === false) ? false : true;
        if (this._usingManager) {
            try {
                this.manager.setLayerHotspots(this.layerId, defs);
                if (defs.length && shouldActivate) this.manager.activateLayer(this.layerId);
                else if (!defs.length) this.manager.deactivateLayer(this.layerId);
            } catch (_) { }
            return;
        }
        this._applyFallback(defs);
    };

    // --- Collision-proof multi-char hotspot tokens -------------------------
    // Legacy subprograms registered single alphanumeric keys as the click
    // command. That capped them at ~90 hotspots and, worse, collided with the
    // keys a user might actually press (clicking a row whose code was 's' would
    // fire a Search command, and pressing 's' on the keyboard would select a
    // row). We instead hand out pipe-delimited tokens such as |m1|, |m2|, ...
    // A mouse click injects the whole token; a normal keypress can never
    // accidentally produce one. We use pipes rather than tildes deliberately:
    // the shell's grid hotspot handler treats any leading '~' as a pending
    // grid token and would swallow it before a subprogram ever sees it (see
    // the ticker's |TK| token in shelllib.js for the same workaround).
    SubprogramHotspotHelper.prototype.nextToken = function () {
        this._tokenCounter = (this._tokenCounter || 0) + 1;
        return '|m' + this._tokenCounter.toString(36) + '|';
    };

    // Returns the list of currently-registered tokens (pipe-delimited keys from
    // the most recent set()). Used by the buffered matcher.
    SubprogramHotspotHelper.prototype._activeTokens = function () {
        var out = [];
        var defs = this._currentDefs || [];
        var seen = {};
        for (var i = 0; i < defs.length; i++) {
            var k = defs[i] && defs[i].key;
            if (typeof k !== 'string' || k.length < 3) continue;
            if (k.charAt(0) !== '|' || k.charAt(k.length - 1) !== '|') continue;
            if (seen[k]) continue;
            seen[k] = true;
            out.push(k);
        }
        return out;
    };

    // Feed a single incoming key. Mirrors the shell's grid hotspot buffering:
    //   returns { token: '|m3|' } when a complete token has arrived,
    //   returns { pending: true } when the buffer is a partial token prefix
    //     (the caller should consume the key and wait for more),
    //   returns null when the key is not part of any active token (the caller
    //     should handle it normally).
    SubprogramHotspotHelper.prototype.matchKey = function (ch) {
        if (!ch || typeof ch !== 'string') return null;
        var tokens = this._activeTokens();
        if (!tokens.length) { this._matchBuf = ''; return null; }
        this._matchBuf = (this._matchBuf || '') + ch;
        if (this._matchBuf.length > 24) this._matchBuf = this._matchBuf.slice(-24);
        var i, token;
        for (i = 0; i < tokens.length; i++) {
            if (this._matchBuf.indexOf(tokens[i]) !== -1) {
                this._matchBuf = '';
                return { token: tokens[i] };
            }
        }
        for (i = 0; i < tokens.length; i++) {
            token = tokens[i];
            var sliceLen = Math.min(token.length, this._matchBuf.length);
            if (sliceLen > 0 && token.substring(0, sliceLen) === this._matchBuf.slice(-sliceLen)) {
                return { pending: true };
            }
        }
        this._matchBuf = '';
        return null;
    };

    SubprogramHotspotHelper.prototype.resetMatch = function () {
        this._matchBuf = '';
    };

    SubprogramHotspotHelper.prototype.clear = function () {
        this._currentDefs = [];
        this._matchBuf = '';
        if (this._usingManager) {
            try { this.manager.clearLayer(this.layerId); } catch (_) { }
            try { this.manager.deactivateLayer(this.layerId); } catch (_) { }
            return;
        }
        this._clearFallback();
    };

    SubprogramHotspotHelper.prototype.deactivate = function () {
        if (this._usingManager) {
            try { this.manager.deactivateLayer(this.layerId); } catch (_) { }
        } else {
            this._clearFallback();
        }
    };

    SubprogramHotspotHelper.prototype.activate = function () {
        if (this._usingManager) {
            try { this.manager.activateLayer(this.layerId); } catch (_) { }
            if (this._currentDefs && this._currentDefs.length) this.set(this._currentDefs);
        } else {
            this._applyFallback(this._currentDefs || []);
        }
    };

    SubprogramHotspotHelper.prototype.stash = function () {
        if (!this._usingManager || this._snapshotActive) return;
        if (typeof this.manager.stashHotSpots === 'function') {
            try {
                this.manager.stashHotSpots();
                this._snapshotActive = true;
            } catch (_) { }
        }
    };

    SubprogramHotspotHelper.prototype.restore = function () {
        if (!this._usingManager || !this._snapshotActive) return;
        if (typeof this.manager.restoreStashedHotSpots === 'function') {
            try {
                this.manager.restoreStashedHotSpots();
            } catch (_) { }
        }
        this._snapshotActive = false;
    };

    SubprogramHotspotHelper.prototype.dispose = function () {
        this.clear();
        this.restore();
    };

    SubprogramHotspotHelper.prototype._applyFallback = function (defs) {
        this._clearFallback();
        if (!defs || !defs.length) return;
        if (typeof console === 'undefined' || typeof console.add_hotspot !== 'function') return;
        for (var i = 0; i < defs.length; i++) {
            var def = defs[i];
            if (!def || def.key === undefined || def.key === null) continue;
            var key = String(def.key);
            var startX = Number(def.x || def.x1 || 0);
            var startY = Number(def.y || def.y1 || 0);
            var width = def.width || ((typeof def.x2 === 'number') ? (def.x2 - startX + 1) : 1);
            var height = def.height || ((typeof def.y2 === 'number') ? (def.y2 - startY + 1) : 1);
            if (width < 1) width = 1;
            if (height < 1) height = 1;
            var swallow = !!def.swallow;
            var endX = startX + width - 1;
            var endY = startY + height - 1;
            for (var y = startY; y <= endY; y++) {
                try { console.add_hotspot(key, swallow, startX, endX, y); } catch (_) { }
            }
        }
        this._fallbackActive = true;
    };

    SubprogramHotspotHelper.prototype._clearFallback = function () {
        if (!this._fallbackActive) return;
        if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
            try { console.clear_hotspots(); } catch (_) { }
        }
        this._fallbackActive = false;
    };

    if (typeof registerModuleExports === 'function') {
        registerModuleExports({ SubprogramHotspotHelper: SubprogramHotspotHelper });
    }

    global.SubprogramHotspotHelper = SubprogramHotspotHelper;
})(this);
