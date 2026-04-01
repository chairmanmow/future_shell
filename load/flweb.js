(function (root) {
    'use strict';

    var VERSION = 1;
    var PREFIX = 'FLWEB/' + VERSION + ' ';

    function asciiSafeJson(value) {
        return JSON.stringify(value).replace(/[^\x20-\x7e]/g, function (ch) {
            var code = ch.charCodeAt(0).toString(16).toUpperCase();
            while (code.length < 4) code = '0' + code;
            return '\\u' + code;
        });
    }

    function writeSequence(str) {
        if (typeof console === 'undefined' || !console.print) {
            throw new Error('FLWeb requires console.print()');
        }
        console.print(str);
        return true;
    }

    function emitPacket(packet) {
        if (!packet || typeof packet !== 'object') {
            throw new Error('FLWeb packet must be an object');
        }
        if (!packet.action || typeof packet.action !== 'string') {
            throw new Error('FLWeb packet requires an action');
        }
        return writeSequence('\x1b_' + PREFIX + asciiSafeJson(packet) + '\x1b\\');
    }

    function detectXtrnCode() {
        var code;
        var execDir;
        var progDir;
        var prog;

        function isAbsolutePath(path) {
            var value = String(path || '');
            return /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]/.test(value);
        }

        if (typeof js === 'undefined' || !js.exec_dir) return null;
        if (typeof xtrn_area === 'undefined' || !xtrn_area.prog) return null;

        execDir = fullpath(backslash(js.exec_dir));
        if (execDir.charAt(execDir.length - 1) !== '\\' && execDir.charAt(execDir.length - 1) !== '/') {
            execDir += '/';
        }

        for (code in xtrn_area.prog) {
            if (!xtrn_area.prog.hasOwnProperty(code)) continue;
            prog = xtrn_area.prog[code];
            if (!prog || !prog.startup_dir) continue;
            try {
                progDir = isAbsolutePath(prog.startup_dir)
                    ? fullpath(backslash(prog.startup_dir))
                    : fullpath(backslash(system.exec_dir + prog.startup_dir));
            } catch (_) {
                continue;
            }
            if (progDir.charAt(progDir.length - 1) !== '\\' && progDir.charAt(progDir.length - 1) !== '/') {
                progDir += '/';
            }
            if (progDir === execDir) {
                return code;
            }
        }

        return null;
    }

    function normalizeAsset(scope, path, code) {
        var asset = {
            scope: scope,
            path: String(path || '')
        };
        if (code) asset.code = String(code);
        return asset;
    }

    function sharedAsset(path) {
        return normalizeAsset('shared', path);
    }

    function xtrnAsset(path, code) {
        return normalizeAsset('xtrn', path, code || detectXtrnCode());
    }

    function alert(message) {
        return emitPacket({
            action: 'alert',
            message: message || 'sent from terminal'
        });
    }

    function toast(title, text, opts) {
        var payload = opts || {};
        payload.action = 'toast.show';
        payload.title = title || payload.title || 'Notification';
        payload.text = text || payload.text || '';
        return emitPacket(payload);
    }

    function playAudio(assetOrPath, opts) {
        var payload = opts || {};
        payload.action = 'audio.play';
        if (typeof assetOrPath === 'string') {
            payload.asset = sharedAsset(assetOrPath);
        } else if (assetOrPath && typeof assetOrPath === 'object') {
            payload.asset = assetOrPath;
        }
        return emitPacket(payload);
    }

    function stopAudio(id) {
        return emitPacket({
            action: 'audio.stop',
            id: id ? String(id) : ''
        });
    }

    function openUrl(url, opts) {
        var payload = opts || {};
        payload.action = 'url.open';
        payload.url = String(url || payload.url || '');
        return emitPacket(payload);
    }

    function say(text, opts) {
        var payload = opts || {};
        payload.action = 'speech.say';
        payload.text = String(text || payload.text || '');
        return emitPacket(payload);
    }

    function controllerMode(mode, opts) {
        var payload = opts || {};
        payload.action = 'controller.mode';
        payload.mode = String(mode || payload.mode || '');
        return emitPacket(payload);
    }

    function controllerMapping(mapping, opts) {
        var payload = opts || {};
        payload.action = 'controller.mapping';
        payload.mapping = String(mapping || payload.mapping || '');
        return emitPacket(payload);
    }

    function controllerProfile(name, opts) {
        var payload = opts || {};
        payload.action = 'controller.profile';
        payload.profile = String(name || payload.profile || '');
        return emitPacket(payload);
    }

    function radioPlay(file, opts) {
        var payload = opts || {};
        payload.action = 'radio.play';
        payload.file = String(file || payload.file || '');
        if (!payload.title && opts && opts.title) payload.title = String(opts.title);
        return emitPacket(payload);
    }

    function radioStop() {
        return emitPacket({ action: 'radio.stop' });
    }

    /**
     * bridgeProbe() — detect if the web bridge is present.
     *
     * Emits a bridge.probe APC with a unique nonce. The web iframe
     * intercepts it and sends back a response APC through the same
     * WebSocket as terminal input: \x1b_FLWEB/1R {"action":"bridge.ack",...}\x1b\\
     *
     * We read the response from console.inkey() with a short timeout.
     *
     * Returns: { available: true, caps: [...] } or { available: false }
     */
    function bridgeProbe(opts) {
        opts = opts || {};
        var nonce = String(Date.now()).slice(-8) + String(Math.random()).slice(2, 6);
        var timeout = opts.timeout || 2000;

        /* flush any pending input first */
        while (console.inkey(K_NONE, 0) !== '') { }

        /* emit the probe */
        emitPacket({
            action: 'bridge.probe',
            nonce: nonce
        });

        /* read response from terminal input.
           The iframe sends back: \x1b_FLWEB/1R {json}\x1b\\
           We accumulate chars and look for the complete APC. */
        var buf = '';
        var deadline = Date.now() + timeout;
        var PREFIX = 'FLWEB/1R ';
        var result = { available: false, caps: [] };

        while (Date.now() < deadline) {
            var ch = console.inkey(K_NONE, 50);
            if (ch === '') continue;
            buf += ch;

            /* look for complete APC: \x1b_ ... \x1b\\ */
            var start = buf.indexOf('\x1b_');
            if (start === -1) {
                /* no APC started — discard stale chars to keep buf short */
                if (buf.length > 512) buf = buf.slice(-256);
                continue;
            }
            var end = buf.indexOf('\x1b\\', start + 2);
            if (end === -1) continue;   /* incomplete, keep reading */

            var payload = buf.slice(start + 2, end);
            if (payload.indexOf(PREFIX) !== 0) {
                /* not our response, skip past it */
                buf = buf.slice(end + 2);
                continue;
            }

            try {
                var data = JSON.parse(payload.slice(PREFIX.length));
                if (data && data.nonce === nonce && data.action === 'bridge.ack') {
                    result.available = true;
                    result.caps = data.caps || [];
                }
            } catch (_) { }
            break;
        }

        /* flush any remaining APC bytes from input so they
           don't leak into normal keyboard handling */
        var flushDeadline = Date.now() + 100;
        while (Date.now() < flushDeadline) {
            if (console.inkey(K_NONE, 10) === '') break;
        }

        return result;
    }

    /**
     * bridgeDetect(opts) — cached bridge detection.
     *
     * Calls bridgeProbe() on first invocation; subsequent calls return the
     * cached result immediately.  Pass { force: true } to re-probe.
     *
     * Returns: { available: true/false, caps: [...] }
     */
    var _bridgeCache = null;

    function bridgeDetect(opts) {
        opts = opts || {};
        if (_bridgeCache !== null && !opts.force) return _bridgeCache;
        _bridgeCache = bridgeProbe(opts);
        return _bridgeCache;
    }

    function bridgeStatus() {
        return _bridgeCache;
    }

    root.VERSION = VERSION;
    root.emit = emitPacket;
    root.alert = alert;
    root.toast = toast;
    root.playAudio = playAudio;
    root.stopAudio = stopAudio;
    root.openUrl = openUrl;
    root.say = say;
    root.controllerMode = controllerMode;
    root.controllerMapping = controllerMapping;
    root.controllerProfile = controllerProfile;
    root.sharedAsset = sharedAsset;
    root.xtrnAsset = xtrnAsset;
    root.detectXtrnCode = detectXtrnCode;
    root.radioPlay = radioPlay;
    root.radioStop = radioStop;
    root.bridgeProbe = bridgeProbe;
    root.bridgeDetect = bridgeDetect;
    root.bridgeStatus = bridgeStatus;
})(this);
