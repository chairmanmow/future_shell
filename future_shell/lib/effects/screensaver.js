// screensaver.js
"use strict";
// Unified screen saver controller for IconShell.
// Manages MatrixRain plus a pool of modular animations sourced from
// canvas-animations.js and avatars-float.js. Animations are selected
// according to configuration (guishell.ini [Screensaver] section).

if (typeof load === 'function') {
    try { load('future_shell/lib/effects/matrix_rain.js'); } catch (e) { }
    try { load('future_shell/lib/effects/canvas-animations.js'); } catch (e) { }
    try { load('future_shell/lib/effects/avatars-float.js'); } catch (e) { }
}

(function () {
    'use strict';

    function clone(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        var out = {}; for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
        return out;
    }

    function nowMs() { return Date.now ? Date.now() : (time() * 1000); }

    function pickRandom(list, exclude) {
        if (!list || !list.length) return null;
        if (list.length === 1) return list[0];
        var choice = list[Math.floor(Math.random() * list.length)];
        if (exclude && list.length > 1) {
            var tries = 0;
            while (choice === exclude && tries < 5) {
                choice = list[Math.floor(Math.random() * list.length)];
                tries++;
            }
        }
        return choice;
    }

    function ShellScreenSaver(opts) {
        opts = opts || {};
        this.shell = opts.shell || null;
        this.getFrame = typeof opts.getFrame === 'function' ? opts.getFrame : function () { return null; };
        this.timer = null;
        this.timerEvent = null;
        this.usingTimer = false;
        this.timerIntervalMs = 80;
        this.minTimerIntervalMs = 60;
        this.maxTimerIntervalMs = 200;
        this.autoThrottle = true;
        this._throttleSamples = 0;
        this._throttleCooldown = 0;
        this.active = false;
        this.current = null;
        this.sequence = ['matrix_rain'];
        this.random = true;
        this.clearOnSwitch = false;
        this.switchIntervalMs = 90000;
        this.animationOptions = {};
        this.registry = {};
        this._nextSeqIndex = 0;
        this._lastSwitchMs = 0;
        this._tickBound = this._tick.bind(this);
        this._matrix = null;
        this.configure(opts.config || {});
        this._registerBuiltins();
    }

    ShellScreenSaver.prototype.configure = function (cfg) {
        cfg = cfg || {};
        if (cfg.animations && cfg.animations.length) {
            this.sequence = cfg.animations.slice();
        } else {
            this.sequence = ['matrix_rain'];
        }
        if (cfg.random !== undefined) this.random = !!cfg.random;
        if (cfg.switch_interval !== undefined) {
            var si = parseInt(cfg.switch_interval, 10);
            if (!isNaN(si) && si >= 0) this.switchIntervalMs = si * 1000;
        }
        if (cfg.min_fps !== undefined) {
            var minFps = parseInt(cfg.min_fps, 10);
            if (!isNaN(minFps) && minFps > 0) this.maxTimerIntervalMs = Math.max(20, Math.floor(1000 / minFps));
        }
        if (cfg.max_fps !== undefined) {
            var maxFps = parseInt(cfg.max_fps, 10);
            if (!isNaN(maxFps) && maxFps > 0) this.minTimerIntervalMs = Math.max(20, Math.floor(1000 / maxFps));
        }
        if (cfg.max_interval_ms !== undefined) {
            var maxInt = parseInt(cfg.max_interval_ms, 10);
            if (!isNaN(maxInt) && maxInt > 0) this.maxTimerIntervalMs = Math.max(this.minTimerIntervalMs, maxInt);
        }
        if (cfg.min_interval_ms !== undefined) {
            var minInt = parseInt(cfg.min_interval_ms, 10);
            if (!isNaN(minInt) && minInt > 0) this.minTimerIntervalMs = Math.min(this.maxTimerIntervalMs, Math.max(20, minInt));
        }
        if (cfg.fps !== undefined) {
            var fps = parseInt(cfg.fps, 10);
            if (!isNaN(fps) && fps > 0) {
                this.timerIntervalMs = Math.floor(1000 / fps);
            }
        }
        if (cfg.timer_interval_ms !== undefined) {
            var ti = parseInt(cfg.timer_interval_ms, 10);
            if (!isNaN(ti) && ti > 0) this.timerIntervalMs = ti;
        }
        if (cfg.autothrottle !== undefined) this.autoThrottle = !!cfg.autothrottle;
        this._clampTimerInterval();
        if (cfg.clear_on_switch !== undefined) this.clearOnSwitch = !!cfg.clear_on_switch;
        this.animationOptions = cfg.animationOptions ? clone(cfg.animationOptions) : {};
        for (var key in this.registry) {
            if (Object.prototype.hasOwnProperty.call(this.registry, key)) this.registry[key].failed = false;
        }
        this._resetTimerInterval();
    };

    ShellScreenSaver.prototype.attachTimer = function (timer) {
        if (this.timerEvent && this.timerEvent.abort !== undefined) this.timerEvent.abort = true;
        this.timer = timer || null;
        this.timerEvent = null;
        if (timer && typeof timer.addEvent === 'function') {
            var self = this;
            this.timerEvent = timer.addEvent(this.timerIntervalMs, true, function () { self._tick(); });
            this.usingTimer = true;
        } else {
            this.usingTimer = false;
        }
    };

    ShellScreenSaver.prototype.detachTimer = function () {
        if (this.timerEvent && this.timerEvent.abort !== undefined) this.timerEvent.abort = true;
        this.timerEvent = null;
        this.timer = null;
        this.usingTimer = false;
    };

    ShellScreenSaver.prototype._resetTimerInterval = function () {
        this._clampTimerInterval();
        if (this.usingTimer && this.timer && typeof this.timer.addEvent === 'function') {
            this.attachTimer(this.timer);
        }
    };

    ShellScreenSaver.prototype._clampTimerInterval = function () {
        if (this.minTimerIntervalMs > this.maxTimerIntervalMs) {
            var swap = this.minTimerIntervalMs;
            this.minTimerIntervalMs = this.maxTimerIntervalMs;
            this.maxTimerIntervalMs = swap;
        }
        if (this.timerIntervalMs < this.minTimerIntervalMs) this.timerIntervalMs = this.minTimerIntervalMs;
        if (this.timerIntervalMs > this.maxTimerIntervalMs) this.timerIntervalMs = this.maxTimerIntervalMs;
    };

    ShellScreenSaver.prototype._registerBuiltins = function () {
        this.register('matrix_rain', { type: 'matrix' });
        if (typeof CanvasAnimations === 'object') {
            if (typeof CanvasAnimations.TvStatic === 'function')
                this.register('tv_static', { type: 'class', ctor: CanvasAnimations.TvStatic });
            if (typeof CanvasAnimations.Life === 'function')
                this.register('life', { type: 'class', ctor: CanvasAnimations.Life });
            if (typeof CanvasAnimations.Starfield === 'function')
                this.register('starfield', { type: 'class', ctor: CanvasAnimations.Starfield });
            if (typeof CanvasAnimations.Fireflies === 'function')
                this.register('fireflies', { type: 'class', ctor: CanvasAnimations.Fireflies });
            if (typeof CanvasAnimations.SineWave === 'function')
                this.register('sine_wave', { type: 'class', ctor: CanvasAnimations.SineWave });
            if (typeof CanvasAnimations.CometTrails === 'function')
                this.register('comet_trails', { type: 'class', ctor: CanvasAnimations.CometTrails });
            if (typeof CanvasAnimations.Plasma === 'function')
                this.register('plasma', { type: 'class', ctor: CanvasAnimations.Plasma });
            if (typeof CanvasAnimations.Fireworks === 'function')
                this.register('fireworks', { type: 'class', ctor: CanvasAnimations.Fireworks });
            if (typeof CanvasAnimations.Aurora === 'function')
                this.register('aurora', { type: 'class', ctor: CanvasAnimations.Aurora });
            if (typeof CanvasAnimations.FireSmoke === 'function')
                this.register('fire_smoke', { type: 'class', ctor: CanvasAnimations.FireSmoke });
            if (typeof CanvasAnimations.OceanRipple === 'function')
                this.register('ocean_ripple', { type: 'class', ctor: CanvasAnimations.OceanRipple });
            if (typeof CanvasAnimations.LissajousTrails === 'function')
                this.register('lissajous', { type: 'class', ctor: CanvasAnimations.LissajousTrails });
            if (typeof CanvasAnimations.LightningStorm === 'function')
                this.register('lightning', { type: 'class', ctor: CanvasAnimations.LightningStorm });
            if (typeof CanvasAnimations.RecursiveTunnel === 'function')
                this.register('tunnel', { type: 'class', ctor: CanvasAnimations.RecursiveTunnel });
            if (typeof CanvasAnimations.FigletMessage === 'function')
                this.register('figlet_message', { type: 'class', ctor: CanvasAnimations.FigletMessage });
        }
        if (typeof AvatarsFloat === 'function')
            this.register('avatars_float', { type: 'class', ctor: AvatarsFloat });
    };

    ShellScreenSaver.prototype.register = function (name, def) {
        if (!name || !def) return;
        def.failed = false;
        this.registry[name] = def;
    };

    ShellScreenSaver.prototype._availableNames = function () {
        var list = [];
        for (var i = 0; i < this.sequence.length; i++) {
            var name = this.sequence[i];
            var def = this.registry[name];
            if (def && !def.failed) list.push(name);
        }
        if (!list.length) {
            if (this.registry['matrix_rain'] && !this.registry['matrix_rain'].failed) list.push('matrix_rain');
            if (!list.length) {
                var fallback = Object.keys(this.registry);
                if (fallback.length) {
                    list = fallback.filter(function (n) { return !this.registry[n] || !this.registry[n].failed; }, this);
                }
            }
        }
        return list;
    };

    ShellScreenSaver.prototype._pickNext = function () {
        var available = this._availableNames();
        if (!available.length) return null;
        if (this.random) {
            return pickRandom(available, this.current ? this.current.name : null);
        }
        if (this._nextSeqIndex >= available.length) this._nextSeqIndex = 0;
        var name = available[this._nextSeqIndex];
        this._nextSeqIndex++;
        return name;
    };

    ShellScreenSaver.prototype.isActive = function () { return !!this.active; };

    ShellScreenSaver.prototype.activate = function (name) {
        if (this.active && !name) return true;
        var available = this._availableNames();
        if (!available.length) return false;
        var attempts = 0;
        var targetName = name || (this.current ? this.current.name : null) || this._pickNext();
        while (targetName && attempts < available.length) {
            if (this._startAnimation(targetName)) {
                this.active = true;
                this._lastSwitchMs = nowMs();
                return true;
            }
            attempts++;
            try { log(LOG_WARNING, 'screensaver activation failed for ' + targetName + ', attempt ' + attempts); } catch (_) { }
            targetName = this._pickNext();
        }
        try { log(LOG_ERR, 'screensaver failed to activate any animation after ' + attempts + ' attempts'); } catch (_) { }
        return false;
    };

    ShellScreenSaver.prototype.deactivate = function () {
        if (!this.active && !this.current) return;
        this._stopCurrent();
        this.active = false;
        this._lastSwitchMs = 0;
    };

    ShellScreenSaver.prototype.refreshFrame = function () {
        if (!this.active) return;
        var currentName = this.current ? this.current.name : null;
        if (currentName) this._startAnimation(currentName, true);
    };

    ShellScreenSaver.prototype.pump = function () {
        if (this.usingTimer) return;
        this._tick();
    };

    ShellScreenSaver.prototype._startAnimation = function (name, force) {
        var def = this.registry[name];
        if (!def) return false;
        if (!force && this.current && this.current.name === name) return true;
        this._stopCurrent();
        var frame = this.getFrame ? this.getFrame() : null;
        if (!frame || (typeof frame.is_open !== 'undefined' && !frame.is_open)) {
            this.current = null;
            return false;
        }
        if (this.clearOnSwitch) {
            try { frame.clear(); } catch (e) { }
        }
        this.current = { name: name, type: def.type, instance: null, ownedFrames: [] };
        var success = false;
        if (def.type === 'matrix') {
            if (!this._matrix) this._matrix = new MatrixRain({ parent: frame, deterministic: true });
            else if (typeof this._matrix.setParent === 'function') this._matrix.setParent(frame);
            else {
                this._matrix.parent = frame;
                if (typeof this._matrix.resize === 'function') this._matrix.resize();
            }
            if (typeof this._matrix.start === 'function') this._matrix.start();
            this.current.instance = this._matrix;
            success = true;
        } else if (def.type === 'class') {
            var opts = clone(this.animationOptions[name] || {});
            var owned = this.current.ownedFrames;
            var priorOwn = opts.ownFrame;
            opts.ownFrame = function (frameRef) {
                if (frameRef) owned.push(frameRef);
                if (typeof priorOwn === 'function') {
                    try { priorOwn(frameRef); } catch (e) { }
                }
            };
            try {
                var instance = new def.ctor();
                instance.init(frame, opts);
                this.current.instance = instance;
                success = true;
            } catch (initErr) {
                try { log(LOG_ERR, 'screensaver animation init error ' + name + ': ' + initErr); } catch (_) { }
                this.current = null;
                def.failed = true;
                return false;
            }
        }
        if (success) {
            this.current.frame = frame;
        } else {
            def.failed = true;
            this.current = null;
            try { log(LOG_WARNING, 'screensaver animation ' + name + ' failed to initialise'); } catch (_) { }
            return false;
        }
        def.failed = false;
        this._lastSwitchMs = nowMs();
        return true;
    };

    ShellScreenSaver.prototype._stopCurrent = function () {
        if (!this.current) return;
        try {
            if (this.current.type === 'matrix') {
                if (this._matrix) {
                    if (typeof this._matrix.stop === 'function') this._matrix.stop();
                    if (typeof this._matrix.clear === 'function') this._matrix.clear();
                }
            } else {
                var inst = this.current.instance;
                if (inst && typeof inst.dispose === 'function') {
                    try { inst.dispose(); } catch (e) { }
                }
                if (this.current.ownedFrames && this.current.ownedFrames.length) {
                    for (var i = 0; i < this.current.ownedFrames.length; i++) {
                        try { if (this.current.ownedFrames[i]) this.current.ownedFrames[i].close(); } catch (e) { }
                    }
                    this.current.ownedFrames.length = 0;
                }
            }
        } finally {
            this.current = null;
        }
    };

    ShellScreenSaver.prototype._shouldSwitch = function () {
        if (this.switchIntervalMs <= 0) return false;
        if (!this.active) return false;
        return (nowMs() - this._lastSwitchMs) >= this.switchIntervalMs;
    };

    ShellScreenSaver.prototype._frameIsValid = function (frame) {
        if (!frame) return false;
        if (typeof frame.is_open !== 'undefined' && !frame.is_open) return false;
        return true;
    };

    ShellScreenSaver.prototype._ensureActiveFrame = function () {
        if (!this.current) return true;
        var resolved = this.getFrame ? this.getFrame() : null;
        if (!this._frameIsValid(resolved)) {
            this._stopCurrent();
            return false;
        }
        var currentFrame = this.current.frame;
        if (currentFrame === resolved && this._frameIsValid(currentFrame)) return true;
        var name = this.current ? this.current.name : null;
        if (!name) {
            this._stopCurrent();
            return false;
        }
        this._startAnimation(name, true);
        return !!this.current;
    };

    ShellScreenSaver.prototype._tick = function () {
        if (!this.active) {
            return;
        }
        var tickStart = nowMs();
        if (this.current && !this._ensureActiveFrame()) {
            return;
        }
        if (!this.current) {
            var first = this._pickNext();
            if (!this._startAnimation(first)) return;
        }
        if (this._shouldSwitch()) {
            var next = this._pickNext();
            if (next) this._startAnimation(next);
        }
        if (this.current) {
            if (this.current.type === 'matrix') {
                if (this._matrix && typeof this._matrix.cycle === 'function') this._matrix.cycle();
            } else if (this.current.instance && typeof this.current.instance.tick === 'function') {
                var runningName = this.current.name;
                var tickElapsed = 0;
                try { this.current.instance.tick(); } catch (e) {
                    try { log(LOG_ERR, 'screensaver tick error ' + runningName + ': ' + e); } catch (_) { }
                    if (runningName && this.registry[runningName]) this.registry[runningName].failed = true;
                    this._stopCurrent();
                    tickElapsed = nowMs() - tickStart;
                    this._applyAutoThrottle(tickElapsed);
                    return;
                }
                tickElapsed = nowMs() - tickStart;
                this._applyAutoThrottle(tickElapsed);
                return;
            }
        }
        var elapsed = nowMs() - tickStart;
        this._applyAutoThrottle(elapsed);
    };

    ShellScreenSaver.prototype._applyAutoThrottle = function (elapsedMs) {
        if (!this.autoThrottle || !this.usingTimer) return;
        if (elapsedMs <= 0) return;
        if (elapsedMs > this.timerIntervalMs && this.timerIntervalMs < this.maxTimerIntervalMs) {
            var newInterval = Math.min(this.maxTimerIntervalMs, Math.max(this.timerIntervalMs + 10, Math.round(elapsedMs * 1.1)));
            if (newInterval !== this.timerIntervalMs) {
                this.timerIntervalMs = newInterval;
                this._resetTimerInterval();
            }
            this._throttleSamples = 0;
            this._throttleCooldown = 12;
            return;
        }
        if (this._throttleCooldown > 0) {
            this._throttleCooldown--;
            return;
        }
        if (elapsedMs < (this.timerIntervalMs * 0.45) && this.timerIntervalMs > this.minTimerIntervalMs) {
            this._throttleSamples++;
            if (this._throttleSamples >= 24) {
                var lowered = Math.max(this.minTimerIntervalMs, this.timerIntervalMs - 10);
                if (lowered !== this.timerIntervalMs) {
                    this.timerIntervalMs = lowered;
                    this._resetTimerInterval();
                }
                this._throttleSamples = 0;
            }
        } else {
            this._throttleSamples = 0;
        }
    };

    var _global = (typeof globalThis !== 'undefined') ? globalThis : (typeof js !== 'undefined' && js && js.global) ? js.global : undefined;
    if (_global) _global.ShellScreenSaver = ShellScreenSaver;

})();
