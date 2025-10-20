// Lightweight wrapper so subprograms can share the shell HotSpotManager safely.
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

    SubprogramHotspotHelper.prototype.clear = function () {
        this._currentDefs = [];
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
