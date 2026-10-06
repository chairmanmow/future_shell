/**
 * scene3d.js - 3dBBS stereoscopic depth for frame.js doors.
 *
 * Shared by future-login and future_signup; any frame.js program can use it.
 * A caller supplies a band table (near -> far) and a bandFor(frame) policy,
 * and its frame stack renders at real stereo depths.
 *
 * The 3dBBS terminal is a Nintendo 3DS homebrew client that identifies as
 * CTerm 1.332 and renders the text grid stereoscopically: every cell carries
 * a LAYER tag (0..15), and each layer has a depth in world units behind the
 * glass (the stereo convergence plane). Text never leaves the glass, so
 * "nearer" means "closer to layer depth 0" - the reading plane - and
 * "further" means the cell recedes into the screen.
 *
 * Protocol (3dBBS PROTOCOL.md, v0.3):
 *   APC 3DS:Query ST        -> APC 3DS:Ver;maj;min ST     detection probe
 *   CSI = Ps z              select the active text layer; later writes carry it
 *   CSI = Ps ; Pd * z       set layer Ps to depth Pd (centi-units, 0..1800)
 *
 * Both CSI forms are cursor-neutral, so they can be threaded through
 * frame.js's per-cell diff without disturbing the server's outbound cursor
 * model (proved for the shell in fshell_ts/test/text_depth_boundary.test.ts).
 *
 * This module is a plain-JS distillation of the pieces of
 * /sbbs/mods/fshell_ts/src/runtime/scene3d.ts and shell/text_depth_policy.ts
 * that a frame.js door needs: the probe, the two wire builders, and a
 * Display patch that tags each emitted cell with the layer of the frame that
 * won it. The shell derives its bands from its frame TREE; a door's screen
 * has the same kind of implied z-order, so the caller supplies a
 * bandFor(frame) policy and this module handles the wire.
 *
 * Every other terminal is left completely untouched: the cterm_version
 * pre-filter means the probe is not even sent, and with no 3dBBS reply the
 * Display patch is never installed.
 */

(function () {
    "use strict";

    var APC = '\x1b_';
    var ST = '\x1b\\';
    /** The 3dBBS-specific detection probe; real SyncTERM ignores it entirely. */
    var QUERY_3DS = APC + '3DS:Query' + ST;
    /** Client-side layer table size (protocol v0.3). */
    var MAX_TEXT_LAYERS = 16;
    /** CTerm version 3dBBS reports - the cheap pre-filter before probing. */
    var CTERM_3DBBS = 1332;

    /** `CSI = Ps z` - select the active text layer for subsequent writes. */
    function selectTextLayerSeq(layer) {
        return '\x1b[=' + (layer | 0) + 'z';
    }

    /**
     * `CSI = Ps ; Pd * z` - set a layer's stereo depth in world units behind
     * the glass (wire carries centi-units; the client clamps at 18). Redefining
     * a depth re-renders every cell already tagged with that layer WITHOUT a
     * repaint, so the whole screen can recede or rise for a couple hundred bytes.
     */
    function defineTextLayerSeq(layer, depthWorld) {
        var d = depthWorld < 0 ? 0 : depthWorld > 18 ? 18 : depthWorld;
        return '\x1b[=' + (layer | 0) + ';' + Math.round(d * 100) + '*z';
    }

    /** Text depth layers arrived in protocol 0.3. */
    function supportsTextLayers(version) {
        return !!version && (version.major > 0 || version.minor >= 3);
    }

    /** True when this terminal is even worth probing (see PROTOCOL.md 1). */
    function preFilter() {
        try {
            return typeof console.cterm_version === 'number'
                && console.cterm_version >= CTERM_3DBBS;
        } catch (e) { return false; }
    }

    /**
     * One-shot detection: write the query, wait for `APC 3DS:Ver;maj;min ST`.
     * A timeout means "not 3dBBS" - nothing else answers this. Any bytes read
     * along the way that are not part of the reply (someone typing during
     * connect) go back into the input stream via ungetstr, so the probe never
     * eats a keystroke.
     */
    function probe(timeoutMs) {
        try {
            if (typeof console.getbyte !== 'function' || typeof console.ungetstr !== 'function') return null;
        } catch (e) { return null; }
        if (!preFilter()) return null;
        var deadline = Date.now() + Math.max(1, timeoutMs || 500);
        var captured = '';
        var pattern = /\x1b_3DS:Ver;([0-9]+);([0-9]+)\x1b\\/;
        try {
            console.write(QUERY_3DS);
            while (captured.length < 256 && Date.now() < deadline) {
                var remaining = deadline - Date.now();
                var value = console.getbyte(Math.max(1, Math.min(50, remaining)));
                if (value === null || value === undefined || value < 0) continue;
                captured += String.fromCharCode(value & 255);
                var match = pattern.exec(captured);
                if (match) {
                    var index = match.index || 0;
                    var leftovers = captured.substring(0, index)
                        + captured.substring(index + match[0].length);
                    if (leftovers) console.ungetstr(leftovers);
                    return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10) };
                }
            }
            if (captured) console.ungetstr(captured);
        } catch (e) {
            try { if (captured) console.ungetstr(captured); } catch (e2) { }
            return null;
        }
        return null;
    }

    // ------------------------------------------------------------- depth bands

    /**
     * Layer order IS the band table: index in this array is the client layer
     * number, so layer 0 must stay the glass - anything written outside the
     * frame diff (the cursor, raw ANSI art, a gateway) lands there. Callers
     * normally pass their own `order`/`depths` naming their real surfaces;
     * this generic near-to-far ramp is only the fallback.
     */
    var BAND_ORDER = ['glass', 'near', 'mid', 'far', 'back'];

    /** Band depths as fractions of the configured spread. */
    var BAND_DEPTHS = {
        glass: 0.0,   // raw console output and anything unrecognized
        near: 0.15,
        mid: 0.45,
        far: 0.8,
        back: 1.0
    };

    /**
     * Tags every cell frame.js emits with the layer of the frame that won it,
     * and maintains the client's depth table.
     *
     * frame.js already computes exactly the provenance this needs: its update
     * list carries `id`, the id of the top canvas at that cell. So the patch is
     * small - resolve id -> Frame -> band -> layer, and thread a layer select
     * into the existing per-cell write loop. The cell diff has to learn about
     * layers too, though: upstream compares only (ch, attr), so a blank cell
     * inside the form host that matches the blank canvas cell underneath it
     * would never be re-emitted and would keep the canvas's back-wall depth,
     * punching holes in the card. `layer` joins the comparison.
     */
    function TextDepthLayers(opts) {
        opts = opts || {};
        this.spread = opts.spread === undefined ? 3 : opts.spread;
        this.bandFor = opts.bandFor || function () { return 'glass'; };
        this.order = opts.order || BAND_ORDER;
        this.depths = opts.depths || BAND_DEPTHS;
        this.log = opts.log || function () { };
        this._layerOfBand = {};
        for (var i = 0; i < this.order.length; i++) this._layerOfBand[this.order[i]] = i;
        this._cache = {};        // frame id -> layer (ids are never reused)
        this._curLayer = 0;      // the layer the terminal is currently writing at
        this._installed = false;
        this._origCycle = null;
        this._origUpdateList = null;
    }

    /** World depth of a layer index (unused slots sit at the glass). */
    TextDepthLayers.prototype.depthOfLayer = function (layer) {
        var band = this.order[layer];
        var fraction = band === undefined ? 0 : this.depths[band];
        return this.spread * (fraction === undefined ? 0 : fraction);
    };

    /** Push the whole 16-entry depth table; cheap enough to re-send on retune. */
    TextDepthLayers.prototype.writeTable = function () {
        var out = '';
        for (var l = 0; l < MAX_TEXT_LAYERS; l++) out += defineTextLayerSeq(l, this.depthOfLayer(l));
        try { console.write(out); } catch (e) { }
    };

    /**
     * Retune the depth spread live. The client re-depths every painted cell
     * from the table, so this costs one table write and zero repaints.
     */
    TextDepthLayers.prototype.setSpread = function (spread) {
        this.spread = spread;
        if (this._installed) this.writeTable();
    };

    /** Drop the id -> layer memo (call if the frame tree is rebuilt). */
    TextDepthLayers.prototype.invalidate = function () {
        this._cache = {};
    };

    TextDepthLayers.prototype._layerForId = function (display, id) {
        if (id === undefined || id === null) return 0;
        var hit = this._cache[id];
        if (hit !== undefined) return hit;
        var layer = 0;
        try {
            var canvas = display.__properties__.canvas[id];
            if (canvas && canvas.frame) {
                var index = this._layerOfBand[this.bandFor(canvas.frame)];
                if (index !== undefined) layer = index;
            }
        } catch (e) { layer = 0; }
        this._cache[id] = layer;
        return layer;
    };

    /**
     * frame.js's Display.__getUpdateList__ with `layer` folded into the diff.
     * Mirrors upstream (frame.js Display.prototype.__getUpdateList__) so the
     * dirty-cell semantics stay identical; the only addition is the layer term.
     */
    TextDepthLayers.prototype._updateList = function (display) {
        var props = display.__properties__;
        var list = [];
        for (var y in props.update) {
            for (var x in props.update[y]) {
                var c = display.__getTopCanvas__(x, y);
                var d = display.__getData__(c, x, y);
                if (d.px < 1 || d.py < 1 || d.px > console.screen_columns || d.py > console.screen_rows)
                    continue;
                d.layer = this._layerForId(display, d.id);
                if (!props.buffer[x]) props.buffer[x] = {};
                var prev = props.buffer[x][y];
                if (prev === undefined || prev.ch != d.ch || prev.attr != d.attr || prev.layer != d.layer) {
                    props.buffer[x][y] = d;
                    list.push(d);
                }
            }
        }
        props.update = {};
        return list.sort(function (a, b) {
            if (a.y == b.y) return a.x - b.x;
            return a.y - b.y;
        });
    };

    /**
     * frame.js's Display.cycle with a layer select threaded into the run.
     * Always ends back at layer 0 so the cursor - and anything written outside
     * the frame system - stays at the glass.
     */
    TextDepthLayers.prototype._cycle = function (display) {
        var updates = display.__getUpdateList__();
        if (!updates.length) return false;
        var lasty;
        var lastx;
        var lastf;
        for (var i = 0; i < updates.length; i++) {
            var u = updates[i];
            if (lasty !== u.y || lastx == undefined || (u.x - lastx) !== 1)
                console.gotoxy(u.px, u.py);
            if (lastf !== u.id)
                console.attributes = undefined;
            var layer = u.layer === undefined ? 0 : u.layer;
            if (layer !== this._curLayer) {
                console.write(selectTextLayerSeq(layer));
                this._curLayer = layer;
            }
            display.__drawChar__(u.ch, u.attr, u.px, u.py);
            lastx = u.x;
            lasty = u.y;
            lastf = u.id;
        }
        if (this._curLayer !== 0) {
            console.write(selectTextLayerSeq(0));
            this._curLayer = 0;
        }
        return true;
    };

    /**
     * Patch Display.prototype (frame.js is loaded into this door's scope, so
     * this affects only the login session) and publish the depth table.
     * Returns false when frame.js is not loaded.
     */
    TextDepthLayers.prototype.install = function (displayCtor) {
        if (this._installed) return true;
        var ctor = displayCtor
            || (typeof Display !== 'undefined' ? Display : null);
        if (typeof ctor !== 'function') return false;
        var self = this;
        this._ctor = ctor;
        this._origCycle = ctor.prototype.cycle;
        this._origUpdateList = ctor.prototype.__getUpdateList__;
        ctor.prototype.cycle = function () { return self._cycle(this); };
        ctor.prototype.__getUpdateList__ = function () { return self._updateList(this); };
        this._installed = true;
        this._curLayer = 0;
        // Start from a known active layer: everything before us wrote at the
        // glass, and the diff below only ever emits layer CHANGES.
        try { console.write(selectTextLayerSeq(0)); } catch (e) { }
        this.writeTable();
        this.log('scene3d: text depth layers enabled (spread ' + this.spread + ')');
        return true;
    };

    /**
     * Restore frame.js, return to the glass, and flatten the depth table -
     * whatever runs next (the shell, the signup module, a raw ANSI screen)
     * inherits a terminal with no stale depth on any layer.
     */
    TextDepthLayers.prototype.dispose = function () {
        if (!this._installed) return;
        try {
            this._ctor.prototype.cycle = this._origCycle;
            this._ctor.prototype.__getUpdateList__ = this._origUpdateList;
        } catch (e) { }
        this._installed = false;
        var out = selectTextLayerSeq(0);
        for (var l = 0; l < MAX_TEXT_LAYERS; l++) out += defineTextLayerSeq(l, 0);
        try { console.write(out); } catch (e) { }
        this._curLayer = 0;
        this._cache = {};
    };

    var moduleExports = {
        QUERY_3DS: QUERY_3DS,
        MAX_TEXT_LAYERS: MAX_TEXT_LAYERS,
        CTERM_3DBBS: CTERM_3DBBS,
        BAND_ORDER: BAND_ORDER,
        BAND_DEPTHS: BAND_DEPTHS,
        probe: probe,
        preFilter: preFilter,
        supportsTextLayers: supportsTextLayers,
        selectTextLayerSeq: selectTextLayerSeq,
        defineTextLayerSeq: defineTextLayerSeq,
        TextDepthLayers: TextDepthLayers
    };

    var _global = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof js !== 'undefined' && js && js.global) ? js.global : undefined;
    if (_global) {
        try { _global.Scene3d = moduleExports; } catch (e) { }
    }

    return moduleExports;

})();
