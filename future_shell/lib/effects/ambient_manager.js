// ambient_manager.js
"use strict";
// Lightweight ambient animation manager for IconShell background effects.
// Mirrors the login module's animation switching concept but keeps a small integration surface.
// API: new ShellAmbientManager(parentFrame, opts)
//  methods: add(name, ctor), start(optionalName), stop(), cycle(), running:boolean
//  opts: { switch_interval:seconds, random:boolean, fps:int, clear_on_switch:boolean, debug:boolean }
// Each animation: function Ctor(); Ctor.prototype.init(frame, opts); Ctor.prototype.tick(); Ctor.prototype.dispose();

//// filepath: /sbbs/mods/future_shell/lib/effects/ambient_manager.js
// ...existing code...
(function () {
    "use strict";

    function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

    function ShellAmbientManager(frame, opts) {
        this.frame = frame;
        this.opts = opts || {};
        this.animations = {};
        this.order = [];
        this.current = null;
        this.prevName = null;
        this.lastSwitch = time();
        this.switchInterval = (this.opts.switch_interval || 90);
        this.running = false;
        this.fps = Math.max(1, this.opts.fps || 8);
        this._tickAccum = 0;
        this.sequenceIndex = 0;
        this._timer = null;
        this._timerEvent = null;
        this.shell = this.opts.shell || null; // <— allow callback into shell
    }
    ShellAmbientManager.prototype.add = function (name, ctor) {
        if (!this.animations[name]) {
            this.animations[name] = ctor;
            this.order.push(name);
        }
    };
    ShellAmbientManager.prototype._pickNext = function () {
        if (!this.order.length) return null;
        if (this.opts.random === false) {
            var name = this.order[this.sequenceIndex % this.order.length];
            this.sequenceIndex++;
            return name;
        }
        if (this.order.length === 1) return this.order[0];
        var pick = null, attempts = 0;
        do { pick = this.order[rand(0, this.order.length - 1)]; attempts++; } while (pick === this.prevName && attempts < 6);
        return pick;
    };
    ShellAmbientManager.prototype.start = function (name) {
        if (!this.frame) return;
        // notify shell BEFORE disposing prior (so it can suppress redraws)
        if (!this.running && this.shell && typeof this.shell._onAmbientStart === 'function') {
            try { this.shell._onAmbientStart(); } catch (e) { }
        }
        if (this.current && this.current.dispose) {
            try { this.current.dispose(); } catch (e) { }
        }
        if (!name) name = this._pickNext();
        var ctor = this.animations[name];
        if (!ctor) return;
        this.current = new ctor();
        try {
            this.current.init(this.frame, this.opts);
        } catch (e) {
            try { log('ambient init error ' + name + ': ' + e); } catch (_) { }
            this.current = null;
            return;
        }
        if (this.opts.clear_on_switch) {
            try { this.frame.clear(); } catch (e) { }
        }
        this.prevName = name;
        this.lastSwitch = time();
        this.running = true;
        try { log('ambient start ' + name + ' switchInterval=' + this.switchInterval + 's random=' + (this.opts.random !== false)); } catch (_) { }
    };
    ShellAmbientManager.prototype.stop = function () {
        if (!this.running) return;
        if (this.current && this.current.dispose) {
            try { this.current.dispose(); } catch (e) { }
        }
        if (this.current) {
            try { log('ambient stop ' + (this.prevName || '?')); } catch (_) { }
        }
        this.current = null;
        this.running = false;
        // notify shell AFTER disposal so it can schedule UI redraw
        if (this.shell && typeof this.shell._onAmbientStop === 'function') {
            try { this.shell._onAmbientStop(); } catch (e) { }
        }
    };
    ShellAmbientManager.prototype.cycle = function () {
        if (!this.running) { return; }
        if (!this.current) { this.start(); if (!this.current) return; }
        if (this.switchInterval > 0 && time() - this.lastSwitch >= this.switchInterval) {
            this.start();
        }
        try { this.current.tick(); } catch (e) {
            try { log('ambient tick error ' + e); } catch (_) { }
        }
    };
    ShellAmbientManager.prototype.dispose = function () { this.stop(); };

    ShellAmbientManager.prototype.attachTimer = function (timer) {
        if (!timer || typeof timer.addEvent !== 'function') return;
        this._timer = timer;
        var self = this;
        var intervalMs = Math.max(50, Math.floor(1000 / this.fps));
        this._timerEvent = timer.addEvent(intervalMs, true, function () { self.cycle(); });
        try { log('ambient attachTimer intervalMs=' + intervalMs); } catch (_) { }
    };
    ShellAmbientManager.prototype.detachTimer = function () {
        if (this._timerEvent) {
            try { this._timerEvent.abort = true; } catch (e) { }
            this._timerEvent = null;
        }
        this._timer = null;
    };

    this.ShellAmbientManager = ShellAmbientManager;
})();