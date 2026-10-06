// chat_push.js - native push for chat while the site is closed.
//
// my-json-service.js calls onWrite() for every write to the chat database
// and reloads this file (and push_lib / notify_lib) whenever any of them
// changes on disk, so changing these rules never needs a services recycle.
//
//   private message to a local user  -> chat_private   (as before)
//   Avatar Chat room message:
//     your name or @name              -> chat_mention, every time
//     #main or a room you joined      -> chat_local, at most once per
//                                        options.chat_local_every minutes per room
// Room pushes only go to people who are away: no site tab checked in within
// PRESENT_SEC (api/chat.ssjs touches data/push/present/NNNN on each sync) and
// not on a terminal node. Pushes carry the sender's avatar (the daemon draws
// it as the icon) and are tagged per room/thread, so a newer one replaces
// the last on the device.
//
// MRC / IRC / DDial: onBridge(net, msg) applies the same room rules, but
// only for networks switched on in data/push/chat-push.json
//   { "bridges": { "mrc": false, "irc": false, "ddial": false } }
// (read on every call). Nothing calls it yet: web users are logged off those
// networks ~90s after their tab closes (fshell_ts muxes), so there is nobody
// to notify until a mux keeps them on and reports their messages here.

var ChatPush = (function () {
    if (typeof NODE_INUSE === 'undefined') load('sbbsdefs.js');
    var PRESENT_SEC = 120;
    var DEVICES_SEC = 60;
    var PRESENT_DIR = system.data_dir + 'push/present/';
    var CONFIG = system.data_dir + 'push/chat-push.json';

    /* load()'s return value is the file's last statement, not its scope:
       read the getter off a scope object instead. */
    var pscope = {};
    load(pscope, system.mods_dir + 'load/push_lib.js');
    var Push = pscope.getPush();
    var nscope = {};
    load(nscope, system.mods_dir + 'load/notify_lib.js');
    var Notify = nscope.Notify;

    /* The website's avatar rules (sysop placeholders, linked handles, real
       avatars): webv4 lib/avatar-profiles.js, so a push shows the same face
       as the page. Inline art in the message is kept, as on the site. */
    var Profiles = null;
    try {
        var web = load({}, 'modopts.js', 'web') || {};
        /* web_directory is relative to ctrl/, as the web server reads it. */
        var dirs = [fullpath(system.ctrl_dir + (web.web_directory || '../webv4_custom')), '/sbbs/webv4_custom'];
        for (var d = 0; d < dirs.length && !Profiles; d++) {
            if (!file_exists(dirs[d] + '/lib/avatar-profiles.js')) continue;
            /* Defines AvatarProfiles in the scope this file was loaded into
               (the service's private scope), not always on js.global. */
            js.global.load(dirs[d] + '/lib/avatar-profiles.js');
            Profiles = (typeof AvatarProfiles !== 'undefined' && AvatarProfiles) || js.global.AvatarProfiles || null;
        }
    } catch (_profilesError) { Profiles = null; log(LOG_WARNING, "chat push: avatar rules unavailable: " + _profilesError); }

    function avatarOf(name, inline) {
        inline = inline ? String(inline) : '';
        if (!Profiles) return inline;
        try { return Profiles.avatarData(name, system.matchuser(name) || 0, inline); } catch (e) { return inline; }
    }

    var devices = { at: 0, users: [] };
    var lastActivity = {};   /* "user:room" -> when its activity push went out */

    function readJson(path) {
        var f = new File(path);
        if (!f.open('r')) return null;
        try { return JSON.parse(f.read()); } catch (e) { return null; } finally { f.close(); }
    }

    /* Users with a push device, refreshed every DEVICES_SEC. */
    function deviceUsers() {
        var now = time();
        if (now - devices.at > DEVICES_SEC) {
            devices = { at: now, users: directory(system.data_dir + 'push/subs/*.json').map(function (path) {
                return parseInt(file_getname(path), 10);
            }).filter(function (n) { return n > 0; }) };
        }
        return devices.users;
    }

    /* On the site (a tab synced recently) or on a terminal node. */
    function isAround(n) {
        var stamp = PRESENT_DIR + format('%04u', n);
        if (file_exists(stamp) && time() - file_date(stamp) < PRESENT_SEC) return true;
        for (var i = 0; i < system.node_list.length; i++) {
            var node = system.node_list[i];
            if (node.useron === n && (node.status === NODE_INUSE || node.status === NODE_QUIET)) return true;
        }
        return false;
    }

    function plain(msg) {
        var text = String(msg.str || '').replace(/\x01./g, '');
        return text.indexOf('[BITMAP|') === 0 ? '(a picture)' : text.substr(0, 200);
    }

    function mentions(text, alias) {
        var esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(^|[^a-z0-9])@?' + esc + '([^a-z0-9]|$)', 'i').test(text);
    }

    /* The room rules for one message, shared by Avatar Chat and bridges.
       inRoom(n, alias) says whether that user counts as in this room. */
    function roomMessage(room, label, msg, url, inRoom) {
        var users = deviceUsers();
        if (!users.length) return;
        var from = String(msg.nick && msg.nick.name || 'Someone');
        var sender = system.matchuser(from);
        var text = String(msg.str || '').replace(/\x01./g, '');
        var avatar = avatarOf(from, msg.nick && msg.nick.avatar);
        var tag = 'chat:' + room.toLowerCase();
        var now = time();
        for (var i = 0; i < users.length; i++) {
            var n = users[i];
            if (n === sender) continue;
            var alias = system.username(n);
            if (!alias || isAround(n)) continue;
            var prefs = Notify.prefs(n);
            if (prefs.push.chat_mention && mentions(text, alias)) {
                Push.enqueue(n, 'chat_mention', { title: from + ' mentioned you in ' + label, body: plain(msg), url: url, tag: tag, avatar: avatar });
                continue;
            }
            if (!prefs.push.chat_local || !inRoom(n, alias)) continue;
            var key = n + ':' + room.toLowerCase();
            var every = (prefs.options && prefs.options.chat_local_every) || 0;
            if (every > 0 && now - (lastActivity[key] || 0) < every * 60) continue;
            if (Push.enqueue(n, 'chat_local', { title: 'New messages in ' + label, body: from + ': ' + plain(msg), url: url, tag: tag, avatar: avatar })) {
                lastActivity[key] = now;
            }
        }
    }

    /* Private message to a local user (unchanged behavior, now with avatar). */
    function privateMessage(msg) {
        var host = String(msg.private.to.host || '');
        if (host.length && host.toLowerCase() !== system.name.toLowerCase() &&
            host.toLowerCase() !== String(system.qwk_id).toLowerCase()) return;
        var to = system.matchuser(String(msg.private.to.name));
        if (!to || system.matchuser(String(msg.nick && msg.nick.name || '')) === to) return;
        var from = String(msg.nick && msg.nick.name || 'Someone');
        Push.enqueue(to, 'chat_private', {
            title: from + ' sent you a private message',
            body: plain(msg),
            url: './?page=001-chat.xjs&private=' + encodeURIComponent(from) +
                (msg.nick && msg.nick.host ? '&system=' + encodeURIComponent(msg.nick.host) : ''),
            tag: 'pm:' + from.toLowerCase(),
            avatar: avatarOf(from, msg.nick && msg.nick.avatar)
        });
    }

    /* Every chat database write (packet as the service received it). */
    function onWrite(packet, ctx) {
        if (!packet.oper || String(packet.oper).toUpperCase() !== 'WRITE') return;
        var m = /^channels\.([^.]+)\.messages$/i.exec(String(packet.location || ''));
        var msg = packet.data;
        if (!m || !msg || !msg.nick) return;
        if (msg.private) {
            if (msg.private.to && msg.private.to.name) privateMessage(msg);
            return;
        }
        var room = m[1];
        var joined = ctx && ctx.db && ctx.db.data && ctx.db.data.web_rooms || {};
        roomMessage(room, '#' + room, msg, './?page=001-chat.xjs&channel=' + encodeURIComponent(room), function (n, alias) {
            return room.toLowerCase() === 'main' || !!(joined[alias] && joined[alias][room.toUpperCase()]);
        });
    }

    /* MRC / IRC / DDial room message, for when a bridge reports one; only
       networks switched on in CONFIG. msg: { nick: { name, avatar }, str };
       members: aliases on that network's room (the bridge knows). */
    function onBridge(net, room, msg, members) {
        var cfg = readJson(CONFIG) || {};
        if (!cfg.bridges || cfg.bridges[net] !== true) return;
        var label = { mrc: 'MRC', irc: 'IRC', ddial: 'DDial' }[net] || net;
        var on = {};
        (members || []).forEach(function (a) { on[String(a).toLowerCase()] = true; });
        roomMessage(net + ':' + room, label + ' ' + room, msg, './?page=001-chat.xjs&channel=' + encodeURIComponent(net), function (n, alias) {
            return !!on[alias.toLowerCase()];
        });
    }

    return { onWrite: onWrite, onBridge: onBridge };
}());

/* load({}, ...) callers: a function lands on the scope reliably. */
function getChatPush() { return ChatPush; }
