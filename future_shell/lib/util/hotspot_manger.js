/*
    Centralized hotspot manager for future shell.
    Provides layered hotspot registration with conflict resolution and stashing support.
*/
(function (global) {
    function HotSpotManager(opts) {
        opts = opts || {};
        this.console = opts.console || (typeof console !== 'undefined' ? console : null);
        this._layers = {};
        this._layerOrder = [];
        this._layerNameMap = {};
        this._nextLayerId = 1;
        this._nextRegionId = 1;
        this._dirty = false;
        this._stashStack = [];
        var baseName = opts.baseLayerName || 'base';
        var basePriority = typeof opts.baseLayerPriority === 'number' ? opts.baseLayerPriority : 0;
        this._baseLayerId = this.createLayer(baseName, basePriority, { active: true });
    }

    HotSpotManager.prototype.getBaseLayerId = function () {
        return this._baseLayerId;
    };

    HotSpotManager.prototype.ensureLayer = function (name, priority, options) {
        options = options || {};
        if (name && this._layerNameMap[name]) {
            var existingId = this._layerNameMap[name];
            if (typeof priority === 'number') this.setLayerPriority(existingId, priority);
            if (options.active === true) this.activateLayer(existingId);
            if (options.active === false) this.deactivateLayer(existingId);
            return existingId;
        }
        return this.createLayer(name, priority, options);
    };

    HotSpotManager.prototype.createLayer = function (name, priority, options) {
        options = options || {};
        var id = 'layer_' + (this._nextLayerId++);
        var layer = {
            id: id,
            name: name || id,
            priority: typeof priority === 'number' ? priority : 0,
            active: options.active === false ? false : true,
            hotspots: {},
            keyOrder: [],
            meta: options.meta || null
        };
        this._layers[id] = layer;
        this._layerOrder.push(id);
        if (name) this._layerNameMap[name] = id;
        this._markDirty();
        this._applyIfDirty();
        return id;
    };

    HotSpotManager.prototype.destroyLayer = function (layerId) {
        var idx = this._layerOrder.indexOf(layerId);
        if (idx === -1) return false;
        var layer = this._layers[layerId];
        delete this._layers[layerId];
        this._layerOrder.splice(idx, 1);
        if (layer && layer.name && this._layerNameMap[layer.name] === layerId) delete this._layerNameMap[layer.name];
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.activateLayer = function (layerId) {
        var layer = this._getLayer(layerId);
        if (!layer || layer.active) return false;
        layer.active = true;
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.deactivateLayer = function (layerId) {
        var layer = this._getLayer(layerId);
        if (!layer || !layer.active) return false;
        layer.active = false;
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.setLayerPriority = function (layerId, priority) {
        var layer = this._getLayer(layerId);
        if (!layer) return false;
        if (typeof priority !== 'number' || layer.priority === priority) return false;
        layer.priority = priority;
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.getLayerPriority = function (layerId) {
        var layer = this._getLayer(layerId);
        return layer ? layer.priority : 0;
    };

    HotSpotManager.prototype.addHotspot = function (def, layerId) {
        if (!def) return null;
        var targetLayer = this._resolveLayer(layerId);
        if (!targetLayer) return null;
        var entry = this._appendHotspot(targetLayer, def);
        if (entry) {
            this._markDirty();
            this._applyIfDirty();
        }
        return entry;
    };

    HotSpotManager.prototype.addHotspots = function (defs, layerId) {
        if (!defs || !defs.length) return 0;
        var targetLayer = this._resolveLayer(layerId);
        if (!targetLayer) return 0;
        var added = 0;
        for (var i = 0; i < defs.length; i++) {
            if (this._appendHotspot(targetLayer, defs[i])) added++;
        }
        if (added) {
            this._markDirty();
            this._applyIfDirty();
        }
        return added;
    };

    HotSpotManager.prototype.setLayerHotspots = function (layerId, defs) {
        var targetLayer = this._resolveLayer(layerId);
        if (!targetLayer) return false;
        targetLayer.hotspots = {};
        targetLayer.keyOrder = [];
        if (defs && defs.length) {
            for (var i = 0; i < defs.length; i++) {
                this._appendHotspot(targetLayer, defs[i]);
            }
        }
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.removeHotspot = function (key, layerId) {
        var targetLayer = this._resolveLayer(layerId);
        if (!targetLayer) return false;
        var stringKey = typeof key === 'string' ? key : String(key);
        if (!targetLayer.hotspots[stringKey]) return false;
        delete targetLayer.hotspots[stringKey];
        var idx = targetLayer.keyOrder.indexOf(stringKey);
        if (idx !== -1) targetLayer.keyOrder.splice(idx, 1);
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.clearLayer = function (layerId) {
        var targetLayer = this._resolveLayer(layerId);
        if (!targetLayer) return false;
        if (!targetLayer.keyOrder.length) return false;
        targetLayer.hotspots = {};
        targetLayer.keyOrder = [];
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.clearAll = function () {
        var cleared = false;
        for (var i = 0; i < this._layerOrder.length; i++) {
            var layer = this._layers[this._layerOrder[i]];
            if (layer && layer.keyOrder.length) {
                layer.hotspots = {};
                layer.keyOrder = [];
                cleared = true;
            }
        }
        if (cleared) {
            this._markDirty();
            this._applyIfDirty();
        }
        return cleared;
    };

    HotSpotManager.prototype.renderHotspots = function () {
        this._markDirty();
        this._applyIfDirty();
    };

    HotSpotManager.prototype.stashHotSpots = function (options) {
        var snapshot = this._snapshotLayers();
        this._stashStack.push(snapshot);
        if (!options || options.clear !== false) this.clearAll();
        return snapshot;
    };

    HotSpotManager.prototype.unstashHotSpots = function (options) {
        return this.restoreStashedHotSpots(options);
    };

    HotSpotManager.prototype.restoreStashedHotSpots = function () {
        if (!this._stashStack.length) return false;
        var snapshot = this._stashStack.pop();
        this._restoreSnapshot(snapshot);
        this._markDirty();
        this._applyIfDirty();
        return true;
    };

    HotSpotManager.prototype.getActiveHotspots = function () {
        var entries = this._collectActiveEntries();
        var output = [];
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            for (var r = 0; r < entry.regions.length; r++) {
                var region = entry.regions[r];
                output.push({
                    key: entry.key,
                    swallow: region.swallow !== undefined ? region.swallow : entry.swallow,
                    x1: region.x1,
                    x2: region.x2,
                    y1: region.y1,
                    y2: region.y2,
                    layerId: entry.layerId,
                    owner: entry.owner || null,
                    data: region.data || entry.data || null
                });
            }
        }
        return output;
    };

    HotSpotManager.prototype._appendHotspot = function (layer, def) {
        var normalized = this._normalizeDefinition(def, layer.id);
        if (!normalized) return null;
        var key = normalized.key;
        var existing = layer.hotspots[key];
        if (!existing) {
            layer.hotspots[key] = normalized;
            layer.keyOrder.push(key);
            return normalized;
        }
        existing.swallow = existing.swallow || normalized.swallow;
        existing.owner = normalized.owner || existing.owner;
        existing.data = normalized.data || existing.data;
        for (var i = 0; i < normalized.regions.length; i++) {
            existing.regions.push(normalized.regions[i]);
        }
        return existing;
    };

    HotSpotManager.prototype._normalizeDefinition = function (def, layerId) {
        if (!def) return null;
        var key = def.key !== undefined ? def.key : def.command;
        if (key === undefined || key === null) return null;
        key = String(key);
        var regions = [];
        if (def.regions && def.regions.length) {
            for (var i = 0; i < def.regions.length; i++) {
                var reg = this._normalizeRegion(def.regions[i]);
                if (reg) regions.push(reg);
            }
        } else {
            var region = this._normalizeRegion(def);
            if (region) regions.push(region);
        }
        if (!regions.length) return null;
        return {
            key: key,
            swallow: !!def.swallow,
            regions: regions,
            owner: def.owner || null,
            data: def.data || null,
            layerId: layerId
        };
    };

    HotSpotManager.prototype._normalizeRegion = function (input) {
        if (!input) return null;
        var x1 = null;
        var x2 = null;
        var y1 = null;
        var y2 = null;
        if (typeof input.x1 === 'number') x1 = Math.round(input.x1);
        else if (typeof input.x === 'number') x1 = Math.round(input.x);
        if (typeof input.y1 === 'number') y1 = Math.round(input.y1);
        else if (typeof input.y === 'number') y1 = Math.round(input.y);
        if (typeof input.x2 === 'number') x2 = Math.round(input.x2);
        if (typeof input.y2 === 'number') y2 = Math.round(input.y2);
        if (x1 === null) return null;
        if (y1 === null) return null;
        var width = null;
        var height = null;
        if (typeof input.width === 'number') width = Math.max(1, Math.round(input.width));
        if (typeof input.height === 'number') height = Math.max(1, Math.round(input.height));
        if (x2 === null) {
            if (width === null) width = 1;
            x2 = x1 + width - 1;
        } else {
            width = Math.max(1, x2 - x1 + 1);
        }
        if (y2 === null) {
            if (height === null) height = 1;
            y2 = y1 + height - 1;
        } else {
            height = Math.max(1, y2 - y1 + 1);
        }
        if (width < 1 || height < 1) return null;
        return {
            id: 'region_' + (this._nextRegionId++),
            x1: x1,
            x2: x2,
            y1: y1,
            y2: y2,
            swallow: input.hasOwnProperty('swallow') ? !!input.swallow : undefined,
            data: input.data || null
        };
    };

    HotSpotManager.prototype._collectActiveEntries = function () {
        var activeLayers = [];
        for (var i = 0; i < this._layerOrder.length; i++) {
            var layer = this._layers[this._layerOrder[i]];
            if (layer && layer.active) activeLayers.push(layer);
        }
        if (!activeLayers.length) return [];
        activeLayers.sort(function (a, b) { return b.priority - a.priority; });
        var claimed = {};
        var result = [];
        for (var l = 0; l < activeLayers.length; l++) {
            var layer = activeLayers[l];
            for (var i = 0; i < layer.keyOrder.length; i++) {
                var key = layer.keyOrder[i];
                if (claimed[key]) continue;
                var entry = layer.hotspots[key];
                if (!entry) continue;
                claimed[key] = true;
                result.push(entry);
            }
        }
        return result;
    };

    HotSpotManager.prototype._applyIfDirty = function () {
        if (!this._dirty) return;
        this._dirty = false;
        var con = this.console || (typeof console !== 'undefined' ? console : null);
        if (!con || typeof con.clear_hotspots !== 'function' || typeof con.add_hotspot !== 'function') return;
        try { con.clear_hotspots(); } catch (_) { }
        var entries = this._collectActiveEntries();
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            for (var r = 0; r < entry.regions.length; r++) {
                var region = entry.regions[r];
                var swallow = region.swallow !== undefined ? region.swallow : entry.swallow;
                var x1 = region.x1;
                var x2 = region.x2;
                var y1 = region.y1;
                var y2 = region.y2;
                for (var y = y1; y <= y2; y++) {
                    try { con.add_hotspot(entry.key, swallow, x1, x2, y); } catch (_) { }
                }
            }
        }
    };

    HotSpotManager.prototype._markDirty = function () {
        this._dirty = true;
    };

    HotSpotManager.prototype._resolveLayer = function (layerId) {
        if (!layerId) return this._layers[this._baseLayerId];
        if (this._layers[layerId]) return this._layers[layerId];
        if (this._layerNameMap[layerId]) return this._layers[this._layerNameMap[layerId]];
        return null;
    };

    HotSpotManager.prototype._getLayer = function (layerId) {
        return this._layers[layerId] || null;
    };

    HotSpotManager.prototype._snapshotLayers = function () {
        var snapshot = {
            layers: [],
            order: this._layerOrder.slice(),
            nameMap: {}
        };
        for (var name in this._layerNameMap) {
            if (this._layerNameMap.hasOwnProperty(name)) snapshot.nameMap[name] = this._layerNameMap[name];
        }
        for (var i = 0; i < this._layerOrder.length; i++) {
            var id = this._layerOrder[i];
            var layer = this._layers[id];
            if (!layer) continue;
            var layerCopy = {
                id: id,
                name: layer.name,
                priority: layer.priority,
                active: layer.active,
                keyOrder: layer.keyOrder.slice(),
                meta: layer.meta ? JSON.parse(JSON.stringify(layer.meta)) : null,
                hotspots: {}
            };
            for (var key in layer.hotspots) {
                if (!layer.hotspots.hasOwnProperty(key)) continue;
                var entry = layer.hotspots[key];
                var entryCopy = {
                    key: entry.key,
                    swallow: entry.swallow,
                    owner: entry.owner,
                    data: entry.data,
                    layerId: entry.layerId,
                    regions: []
                };
                for (var r = 0; r < entry.regions.length; r++) {
                    var region = entry.regions[r];
                    entryCopy.regions.push({
                        id: region.id,
                        x1: region.x1,
                        x2: region.x2,
                        y1: region.y1,
                        y2: region.y2,
                        swallow: region.swallow,
                        data: region.data
                    });
                }
                layerCopy.hotspots[key] = entryCopy;
            }
            snapshot.layers.push(layerCopy);
        }
        return snapshot;
    };

    HotSpotManager.prototype._restoreSnapshot = function (snapshot) {
        if (!snapshot || !snapshot.layers) return;
        this._layers = {};
        this._layerOrder = snapshot.order ? snapshot.order.slice() : [];
        this._layerNameMap = snapshot.nameMap ? JSON.parse(JSON.stringify(snapshot.nameMap)) : {};
        for (var i = 0; i < snapshot.layers.length; i++) {
            var layer = snapshot.layers[i];
            var restored = {
                id: layer.id,
                name: layer.name,
                priority: layer.priority,
                active: layer.active,
                keyOrder: layer.keyOrder.slice(),
                meta: layer.meta ? JSON.parse(JSON.stringify(layer.meta)) : null,
                hotspots: {}
            };
            for (var key in layer.hotspots) {
                if (!layer.hotspots.hasOwnProperty(key)) continue;
                var entry = layer.hotspots[key];
                var entryCopy = {
                    key: entry.key,
                    swallow: entry.swallow,
                    owner: entry.owner,
                    data: entry.data,
                    layerId: layer.id,
                    regions: []
                };
                for (var r = 0; r < entry.regions.length; r++) {
                    var region = entry.regions[r];
                    entryCopy.regions.push({
                        id: region.id,
                        x1: region.x1,
                        x2: region.x2,
                        y1: region.y1,
                        y2: region.y2,
                        swallow: region.swallow,
                        data: region.data
                    });
                }
                restored.hotspots[key] = entryCopy;
            }
            this._layers[restored.id] = restored;
        }
        if (!this._layers[this._baseLayerId] && this._layerOrder.length) {
            this._baseLayerId = this._layerOrder[0];
        }
    };

    if (typeof registerModuleExports === 'function') {
        registerModuleExports({
            HotSpotManager: HotSpotManager,
            createHotSpotManager: function (opts) { return new HotSpotManager(opts || {}); }
        });
    }

    global.HotSpotManager = HotSpotManager;
})(this);
