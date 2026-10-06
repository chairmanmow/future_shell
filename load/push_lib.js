// push_lib.js - native (Web Push) notifications: the devices each user
// enabled, and the queue the sender works from.
//
// Synchronet scripts can't do Web Push's crypto, so they only queue jobs;
// mods/push/push_daemon.js (Node, `web-push`) sends them, drops devices the
// browser says are gone, and also watches telegrams itself.
//
//   data/push/subs/NNNN.json   [ { endpoint, keys: { p256dh, auth }, ua, added } ]
//   data/push/queue/*.json     { user, kind, title, body, url, tag, at, avatar? }
//                              avatar: the sender's 10x6 avatar, base64 .bin;
//                              the daemon draws it as the notification icon
//   ctrl/push-vapid.json       VAPID keys (the public half goes to browsers)
//
// Push.enqueue() checks the user's prefs (notify_lib.js, delivery `push`)
// and that they have a device, so callers just say what happened.

var Push = (function () {
    var DIR = system.data_dir + 'push/';
    var SUBS = DIR + 'subs/';
    var QUEUE = DIR + 'queue/';
    var MAX_DEVICES = 10;

    function readJson(path) {
        var f = new File(path);
        if (!f.open('r')) return null;
        try { return JSON.parse(f.read()); } catch (e) { return null; } finally { f.close(); }
    }

    /* Temp name then rename: the sender never reads half a file. */
    function writeJson(path, value) {
        var dir = path.replace(/[^\/]+$/, '');
        if (!file_isdir(dir)) mkpath(dir);
        var f = new File(path + '.' + random(1e9) + '.tmp');
        if (!f.open('w')) return false;
        f.write(JSON.stringify(value));
        f.close();
        if (!file_rename(f.name, path)) { file_remove(path); return file_rename(f.name, path); }
        return true;
    }

    function subsPath(n) { return SUBS + format('%04u', n) + '.json'; }

    function devices(n) {
        var list = readJson(subsPath(n));
        return Array.isArray(list) ? list : [];
    }

    function publicKey() {
        var keys = readJson(system.ctrl_dir + 'push-vapid.json');
        return keys && keys.publicKey ? keys.publicKey : '';
    }

    function validSubscription(sub) {
        return sub && typeof sub.endpoint === 'string' && /^https:\/\//.test(sub.endpoint)
            && sub.keys && typeof sub.keys.p256dh === 'string' && typeof sub.keys.auth === 'string';
    }

    /* Add (or refresh) one device; false when the subscription is malformed. */
    function subscribe(n, sub, ua) {
        if (!validSubscription(sub)) return false;
        var list = devices(n).filter(function (d) { return d.endpoint !== sub.endpoint; });
        list.unshift({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            ua: String(ua || '').substr(0, 200), added: time() });
        if (list.length > MAX_DEVICES) list.length = MAX_DEVICES;
        return writeJson(subsPath(n), list);
    }

    function unsubscribe(n, endpoint) {
        var list = devices(n).filter(function (d) { return d.endpoint !== endpoint; });
        if (!list.length) { file_remove(subsPath(n)); return true; }
        return writeJson(subsPath(n), list);
    }

    function hasDevice(n, endpoint) {
        return devices(n).some(function (d) { return d.endpoint === endpoint; });
    }

    function wants(n, kind) {
        if (kind === 'test') return true;
        if (typeof Notify === 'undefined') load(system.mods_dir + 'load/notify_lib.js');
        var prefs = Notify.prefs(n);
        return !!(prefs.push && prefs.push[kind]);
    }

    /* Queue a push for user n; false when they don't want it or have no device. */
    function enqueue(n, kind, msg) {
        if (!(n > 0) || !file_exists(subsPath(n)) || !wants(n, kind)) return false;
        var job = {
            user: n, kind: kind, at: time(),
            title: String(msg.title || '').substr(0, 120),
            body: String(msg.body || '').substr(0, 300),
            url: String(msg.url || './'),
            tag: String(msg.tag || kind)
        };
        var avatar = String(msg.avatar || '');
        if (avatar.length && avatar.length <= 400 && /^[A-Za-z0-9+\/=]+$/.test(avatar)) job.avatar = avatar;
        return writeJson(QUEUE + Date.now() + '-' + random(1e9) + '.json', job);
    }

    return {
        publicKey: publicKey,
        subscribe: subscribe,
        unsubscribe: unsubscribe,
        hasDevice: hasDevice,
        enqueue: enqueue
    };
})();

/* load({}, ...) callers: a top-level var doesn't reliably land on a private
   scope, a function does. */
function getPush() { return Push; }
