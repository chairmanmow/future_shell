// notify_lib.js - per-user notifications ("X replied to your message ...")
// and the activity history they leave behind.
//
// Telegrams can't carry this: core's "X posted to you on ..." line has no sub
// or message number, and reading a telegram deletes it. So notifications are
// built from the message bases themselves:
//
//   Notify.indexAll()      scan every sub for messages newer than the last
//                          scan (mods/notify_indexer.js, run each minute by
//                          the NOTIFY timed event in ctrl/xtrn.ini). The first
//                          run backfills BACKFILL_DAYS; a sub added later
//                          starts at its newest message.
//   Notify.indexSub(code)  the same for one sub, right after a local post, so
//                          web and terminal replies show up at once.
//
// A new message notifies:
//   reply    the local author of the message it replies to (thread_back, or
//            reply_id for network replies), whatever its To says
//   to_you   a local user it's addressed to, when it was written here (a
//            network To of "Mike" says nothing about our Mike)
// never the poster themselves, and only someone who can read the sub.
//
// Files, all in data/notify/:
//   scan.json   { subs: { code: last message number scanned }, at }
//   NNNN.json   { unread, entries: [ newest first, at most MAX_ENTRIES ] }
//   entry       { id, type, t, read, actor, actor_ext, sub, num, thread,
//                 subject, snippet, grp, area }
// Read entries stay: they are the user's activity history.
//
// Preferences, one set per user for every kind of notification and every
// way of delivering one (data/notify/NNNN.prefs.json):
//   { toast: { <kind>: bool }, push: { <kind>: bool }, chat: { <kind>: mode } }
// `chat` is how the web client announces a chat message you aren't looking
// at: 'off', 'web' (in-site toast), 'native' (desktop notification) or
// 'both'; kinds and defaults in CHAT_KINDS. The client decides and delivers
// (webv4 js/chat.js); nothing on the server sends chat-room notifications.
// kinds and per-delivery defaults in PREF_KINDS below. `push` is native
// push (mods/load/push_lib.js), sent only to devices the user enabled.

var Notify = (function () {
    var DIR = system.data_dir + 'notify/';
    var SCAN = DIR + 'scan.json';
    var RUN_LOCK = DIR + 'indexer.lock';
    var MAX_ENTRIES = 500;
    var BACKFILL_DAYS = 30;
    var SNIPPET_LEN = 140;
    var LOCK_WAIT_MS = 3000;

    if (typeof USER_DELETED === 'undefined') load('sbbsdefs.js');

    function userPath(n) { return DIR + format('%04u', n) + '.json'; }
    function prefsPath(n) { return DIR + format('%04u', n) + '.prefs.json'; }

    /* Every notification kind, with its default per delivery. Chat rooms
       on MRC/DDial only ever notify while the user is on that network. */
    var PREF_KINDS = {
        forum:        { toast: false, push: true },   /* replies and messages to you on the boards */
        telegram:     { toast: false, push: true },   /* telegrams and system notices */
        chat_private: { toast: true,  push: true },   /* private chat messages, any network */
        chat_mention: { toast: false, push: true },   /* site closed: your name said in an Avatar Chat room (chat_push.js) */
        chat_local:   { toast: true,  push: true },   /* site closed: Avatar Chat activity, throttled by options.chat_local_every */
        chat_mrc:     { toast: true,  push: false },  /* the MRC room you're in */
        chat_ddial:   { toast: true,  push: false },  /* DDial, while you're on it */
        chat_irc:     { toast: true,  push: false }   /* your IRC channel, while you're on IRC */
    };
    var PREF_DELIVERIES = ['toast', 'push'];
    /* Non-boolean settings: default and the values allowed.
       chat_local_every: minutes between Avatar Chat activity pushes per room
       while the site is closed (0 = every message). */
    var PREF_OPTIONS = {
        chat_local_every: { def: 10, allowed: [0, 10, 30, 60] }
    };

    /* Chat notifications, one delivery mode each (see the header). */
    var CHAT_MODES = ['off', 'web', 'native', 'both'];
    var CHAT_KINDS = {
        chat_private: 'both',   /* private messages, any network */
        chat_mention: 'both',   /* your name said in an Avatar Chat room */
        chat_local:   'web',    /* Avatar Chat rooms */
        chat_mrc:     'web',
        chat_ddial:   'web',
        chat_irc:     'web'
    };

    /* Before `chat` existed, toast and push booleans said the same thing. */
    function legacyChatMode(saved, kind) {
        var t = saved.toast && typeof saved.toast[kind] === 'boolean' ? saved.toast[kind] : null;
        var p = saved.push && typeof saved.push[kind] === 'boolean' ? saved.push[kind] : null;
        if (t === null && p === null) return CHAT_KINDS[kind];
        return t && p ? 'both' : t ? 'web' : p ? 'native' : 'off';
    }

    /* A user's preferences, every kind filled in. */
    function prefs(n) {
        var saved = readJson(prefsPath(n)) || {};
        var out = {};
        PREF_DELIVERIES.forEach(function (d) {
            var have = saved[d] && typeof saved[d] === 'object' ? saved[d] : {};
            out[d] = {};
            for (var kind in PREF_KINDS) {
                out[d][kind] = typeof have[kind] === 'boolean' ? have[kind] : PREF_KINDS[kind][d];
            }
        });
        var opts = saved.options && typeof saved.options === 'object' ? saved.options : {};
        out.options = {};
        for (var o in PREF_OPTIONS) {
            out.options[o] = PREF_OPTIONS[o].allowed.indexOf(opts[o]) !== -1 ? opts[o] : PREF_OPTIONS[o].def;
        }
        var chat = saved.chat && typeof saved.chat === 'object' ? saved.chat : null;
        out.chat = {};
        for (var ck in CHAT_KINDS) {
            out.chat[ck] = chat && CHAT_MODES.indexOf(chat[ck]) !== -1 ? chat[ck] : legacyChatMode(saved, ck);
        }
        return out;
    }

    /* Change some preferences ({ toast: { chat_mrc: false } }); returns all. */
    function setPrefs(n, patch) {
        var next = prefs(n);
        PREF_DELIVERIES.forEach(function (d) {
            var p = patch && patch[d];
            if (!p || typeof p !== 'object') return;
            for (var kind in PREF_KINDS) {
                if (typeof p[kind] === 'boolean') next[d][kind] = p[kind];
            }
        });
        var po = patch && patch.options;
        if (po && typeof po === 'object') {
            for (var o in PREF_OPTIONS) {
                var v = typeof po[o] === 'string' ? parseInt(po[o], 10) : po[o];
                if (PREF_OPTIONS[o].allowed.indexOf(v) !== -1) next.options[o] = v;
            }
        }
        var pc = patch && patch.chat;
        if (pc && typeof pc === 'object') {
            for (var ck in CHAT_KINDS) {
                if (CHAT_MODES.indexOf(pc[ck]) !== -1) next.chat[ck] = pc[ck];
            }
        }
        writeJson(prefsPath(n), next);
        return next;
    }

    function readJson(path) {
        var f = new File(path);
        if (!f.open('r')) return null;
        try { return JSON.parse(f.read()); } catch (e) { return null; } finally { f.close(); }
    }

    /* Write to a temp name and rename, so a reader never sees half a file. */
    function writeJson(path, value) {
        if (!file_isdir(DIR)) mkdir(DIR);
        var f = new File(path + '.' + random(1e9) + '.tmp');
        if (!f.open('w')) return false;
        f.write(JSON.stringify(value));
        f.close();
        if (!file_rename(f.name, path)) { file_remove(path); return file_rename(f.name, path); }
        return true;
    }

    /* Run fn while holding lock file `path`; false if it stays busy. */
    function withLock(path, waitMs, maxAge, fn) {
        if (!file_isdir(DIR)) mkdir(DIR);
        var until = Date.now() + waitMs;
        while (!file_mutex(path, String(Date.now()), maxAge)) {
            if (Date.now() >= until) return false;
            mswait(50);
        }
        try { fn(); } finally { file_remove(path); }
        return true;
    }

    /* A user's notifications, changed under their lock. */
    function updateUser(n, fn) {
        var result;
        withLock(userPath(n) + '.lock', LOCK_WAIT_MS, 10, function () {
            var data = readJson(userPath(n)) || { unread: 0, entries: [] };
            if (fn(data) === false) return;
            if (data.entries.length > MAX_ENTRIES) data.entries.length = MAX_ENTRIES;
            data.unread = 0;
            data.entries.forEach(function (e) { if (!e.read) data.unread++; });
            writeJson(userPath(n), data);
            result = data;
        });
        return result;
    }

    function load_(n) { return readJson(userPath(n)) || { unread: 0, entries: [] }; }

    /* ---- reading ---- */

    function unread(n) { return load_(n).unread || 0; }

    /* Page of entries: opts { filter: 'unread'|'read'|'all', offset, limit }. */
    function list(n, opts) {
        opts = opts || {};
        var data = load_(n), filter = opts.filter || 'all';
        var all = data.entries.filter(function (e) {
            return filter === 'unread' ? !e.read : filter === 'read' ? !!e.read : true;
        });
        var offset = Math.max(0, opts.offset | 0), limit = Math.max(1, Math.min(100, opts.limit || 30));
        return { unread: data.unread || 0, total: all.length, entries: all.slice(offset, offset + limit) };
    }

    /* Mark entries read; ids is an array of entry ids, or 'all'. */
    function markRead(n, ids) {
        var want = {};
        if (ids !== 'all') (ids || []).forEach(function (id) { want[id] = true; });
        var data = updateUser(n, function (d) {
            var changed = false;
            d.entries.forEach(function (e) {
                if (!e.read && (ids === 'all' || want[e.id])) { e.read = true; changed = true; }
            });
            return changed;
        });
        return data ? data.unread : unread(n);
    }

    /* Add entries (any type); duplicates by id are skipped. */
    function add(n, entries) {
        if (!entries.length) return;
        updateUser(n, function (d) {
            var have = {};
            d.entries.forEach(function (e) { have[e.id] = true; });
            var fresh = entries.filter(function (e) { return !have[e.id]; });
            if (!fresh.length) return false;
            d.entries = fresh.concat(d.entries);
            d.entries.sort(function (a, b) { return b.t - a.t; });
            pushEntries(n, fresh);
        });
    }

    /* Native push for new entries (push_lib checks the user's prefs and
       devices). Backfill never pushes: only entries from the last hour. */
    function pushEntries(n, fresh) {
        try {
            if (typeof Push === 'undefined') load(system.mods_dir + 'load/push_lib.js');
            var avatars = null;
            try { avatars = load({}, 'avatar_lib.js'); } catch (_avatarLoad) { avatars = null; }
            /* The website's avatar rules first (sysop placeholders, linked
               handles), as the forum page shows the poster. */
            var profiles = null;
            try {
                if (typeof AvatarProfiles === 'undefined') {
                    var web = load({}, 'modopts.js', 'web') || {};
                    var lib = fullpath(system.ctrl_dir + (web.web_directory || '../webv4_custom')) + '/lib/avatar-profiles.js';
                    if (file_exists(lib)) js.global.load(lib);
                }
                profiles = (typeof AvatarProfiles !== 'undefined' && AvatarProfiles) || js.global.AvatarProfiles || null;
            } catch (_profilesLoad) { profiles = null; }
            fresh.forEach(function (e) {
                if (e.t < time() - 3600) return;
                if (e.type === 'mail') return;   /* the telegram already pushes new mail */
                /* The poster's avatar for the notification icon (local, or
                   networked by address); anonymous posts get none. */
                var avatar = '';
                if (profiles && e.actor !== 'Anonymous') {
                    try { avatar = profiles.avatarData(e.actor, e.actor_ext || 0, ''); } catch (_profileRead) { avatar = ''; }
                }
                if (!avatar && avatars && e.actor !== 'Anonymous') {
                    try {
                        var a = avatars.read(e.actor_ext || 0, e.actor, e.actor_ext ? undefined : (e.actor_net || undefined));
                        if (a && a.data && !a.disabled) avatar = a.data;
                    } catch (_avatarRead) { avatar = ''; }
                }
                var subject = String(e.subject || '').replace(/^(re:\s*)+/i, '') || '(no subject)';
                Push.enqueue(n, 'forum', {
                    title: e.actor + (e.type === 'reply' ? ' replied to your message' : ' posted to you'),
                    body: '\u201c' + subject + '\u201d' + (e.snippet ? ' \u2014 ' + e.snippet : ''),
                    url: './?page=002-forum.xjs&sub=' + encodeURIComponent(e.sub) + '&thread=' + e.thread + '#' + e.num,
                    tag: 'forum:' + e.id,
                    avatar: avatar
                });
            });
        } catch (err) {
            log(LOG_WARNING, 'notify: push failed: ' + err);
        }
    }

    /* ---- indexing ---- */

    /* Local accounts by the CRC-16 Synchronet puts in message indexes. */
    function userTable() {
        var web = load({}, 'modopts.js', 'web') || {};
        var guest = (web.guest || 'Guest').toLowerCase();
        var byCrc = {}, users = {};
        function put(name, n) {
            if (!name) return;
            var crc = crc16_calc(name.toLowerCase());
            (byCrc[crc] = byCrc[crc] || []).push(n);
        }
        for (var n = 1; n <= system.lastuser; n++) {
            var u = new User(n);
            if (u.settings & (USER_DELETED | USER_INACTIVE)) continue;
            if (!u.alias || u.alias.toLowerCase() === guest) continue;
            users[n] = { alias: u.alias, name: u.name, user: u };
            put(u.alias, n);
            if (u.name && u.name.toLowerCase() !== u.alias.toLowerCase()) put(u.name, n);
        }
        return { byCrc: byCrc, users: users, access: {} };
    }

    /* Local user number named `name` (alias or real name), or 0. */
    function named(table, name, crc) {
        if (!name) return 0;
        var lower = name.toLowerCase(), list = table.byCrc[crc === undefined ? crc16_calc(lower) : crc];
        if (!list) return 0;
        for (var i = 0; i < list.length; i++) {
            var u = table.users[list[i]];
            if (u.alias.toLowerCase() === lower || (u.name && u.name.toLowerCase() === lower)) return list[i];
        }
        return 0;
    }

    function canRead(table, n, code) {
        var key = n + ':' + code;
        if (table.access[key] === undefined) {
            var s = msg_area.sub[code], u = table.users[n].user;
            table.access[key] = !!(s && u.compare_ars(s.ars) && u.compare_ars(s.read_ars));
        }
        return table.access[key];
    }

    function isLocal(h) { return !h.from_net_type; }

    /* Author of a locally written header, or 0. */
    function localAuthor(table, h) {
        if (!h || !isLocal(h)) return 0;
        var ext = parseInt(h.from_ext, 10);
        if (ext > 0 && table.users[ext]) return ext;
        return named(table, h.from);
    }

    function snippet(mb, num) {
        var body = mb.get_msg_body(false, num, /* strip ctrl-a */ true, /* rfc822 */ false, /* tails */ false) || '';
        var lines = body.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x01./g, '').split(/\r?\n/);
        var out = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/^\s*[A-Za-z]{0,3}>/.test(line)) continue;           /* quoted */
            if (/^(---|\s\*\s+Origin:|SEEN-BY:)/.test(line)) break;  /* tear/origin */
            line = line.replace(/\s+/g, ' ').trim();
            if (line) out.push(line);
            if (out.join(' ').length > SNIPPET_LEN) break;
        }
        var text = out.join(' ');
        return text.length > SNIPPET_LEN ? text.substr(0, SNIPPET_LEN - 1) + '…' : text;
    }

    /* Notifications for the messages in `idx` (index entries) of `code`. */
    function scanMessages(table, mb, code, idx, out) {
        var s = msg_area.sub[code];
        for (var i = 0; i < idx.length; i++) {
            var e = idx[i];
            if (!e || (e.attr & MSG_DELETE)) continue;
            var h = mb.get_msg_header(false, e.number, false);
            if (!h || (h.attr & MSG_DELETE)) continue;
            var poster = localAuthor(table, h);
            var hits = {};

            /* reply: the parent's local author */
            var parent = null;
            if (h.thread_back > 0) {
                var pi = mb.get_msg_index(false, h.thread_back);
                if (pi && table.byCrc[pi.from]) parent = mb.get_msg_header(false, h.thread_back, false);
            } else if (h.reply_id) {
                parent = mb.get_msg_header(String(h.reply_id), false);
            }
            var pAuthor = localAuthor(table, parent);
            if (pAuthor) hits[pAuthor] = 'reply';

            /* to_you: addressed to a local user, written here */
            if (isLocal(h) && h.to && h.to.toLowerCase() !== 'all') {
                var to = parseInt(h.to_ext, 10);
                if (!(to > 0 && table.users[to])) to = named(table, h.to, e.to);
                if (to && !hits[to] && !(h.attr & MSG_ANONYMOUS)) hits[to] = 'to_you';
            }

            for (var key in hits) {
                var n = parseInt(key, 10);
                if (n === poster) continue;
                if (poster === 0 && table.users[n] && h.from &&
                    (h.from.toLowerCase() === table.users[n].alias.toLowerCase())) continue;
                if (!canRead(table, n, code)) continue;
                if ((h.attr & MSG_PRIVATE) && hits[n] !== 'to_you') continue;
                (out[n] = out[n] || []).push({
                    id: code + ':' + h.number,
                    type: hits[n],
                    t: h.when_written_time || e.time,
                    read: false,
                    actor: (h.attr & MSG_ANONYMOUS) ? 'Anonymous' : h.from,
                    actor_ext: (!(h.attr & MSG_ANONYMOUS) && poster) ? poster : 0,
                    actor_net: (!(h.attr & MSG_ANONYMOUS) && h.from_net_addr) ? String(h.from_net_addr) : '',
                    sub: code,
                    num: h.number,
                    thread: h.thread_id || h.number,
                    parent: parent ? parent.number : 0,
                    subject: h.subject || '',
                    snippet: snippet(mb, h.number),
                    grp: s.grp_name,
                    area: s.name
                });
            }
        }
    }

    /* Scan one sub from scan.subs[code]; returns messages looked at. */
    function scanSub(table, scan, code, since, out) {
        var mb = new MsgBase(code);
        if (!mb.open()) return 0;
        try {
            var last = mb.last_msg, from = scan.subs[code];
            if (from === undefined && !since) { scan.subs[code] = last; return 0; }
            if (from !== undefined && last <= from) return 0;
            var idx = (mb.get_index() || []).filter(function (e) {
                return e && (from === undefined ? e.time >= since : e.number > from);
            });
            scanMessages(table, mb, code, idx, out);
            scan.subs[code] = last;
            return idx.length;
        } finally {
            mb.close();
        }
    }

    /* New mail to local users, as feed entries (type 'mail'). Same rules as
       scanSub: the first run only records where the mail base is (no flood
       of old mail), later runs take what arrived since. */
    function scanMail(table, scan, out) {
        var mb = new MsgBase('mail');
        if (!mb.open()) return 0;
        try {
            var last = mb.last_msg, from = scan.mail;
            if (from === undefined) { scan.mail = last; return 0; }
            if (last <= from) return 0;
            var idx = (mb.get_index() || []).filter(function (e) { return e && e.number > from; });
            for (var i = 0; i < idx.length; i++) {
                var e = idx[i];
                if (e.attr & MSG_DELETE) continue;
                var h = mb.get_msg_header(false, e.number, false);
                if (!h || (h.attr & MSG_DELETE)) continue;
                var to = parseInt(h.to_ext, 10);
                if (!(to > 0 && table.users[to])) continue;
                var poster = localAuthor(table, h);
                if (poster === to) continue;
                (out[to] = out[to] || []).push({
                    id: 'mail:' + h.number,
                    type: 'mail',
                    t: h.when_written_time || e.time,
                    read: false,
                    actor: (h.attr & MSG_ANONYMOUS) ? 'Anonymous' : h.from,
                    actor_ext: (!(h.attr & MSG_ANONYMOUS) && poster) ? poster : 0,
                    actor_net: (!(h.attr & MSG_ANONYMOUS) && h.from_net_addr) ? String(h.from_net_addr) : '',
                    sub: 'mail',
                    num: h.number,
                    thread: 0,
                    parent: 0,
                    subject: h.subject || '',
                    snippet: snippet(mb, h.number),
                    grp: '',
                    area: 'Email'
                });
            }
            scan.mail = last;
            return idx.length;
        } finally {
            mb.close();
        }
    }

    function deliver(out) {
        var users = 0;
        for (var key in out) { add(parseInt(key, 10), out[key]); users++; }
        return users;
    }

    /* Scan every sub; returns a report, or null if another scan is running. */
    function indexAll() {
        var report = null;
        withLock(RUN_LOCK, 0, 600, function () {
            var scan = readJson(SCAN);
            var since = 0;
            if (!scan) { scan = { subs: {} }; since = time() - BACKFILL_DAYS * 86400; }
            var table = userTable(), out = {}, looked = 0;
            for (var code in msg_area.sub) looked += scanSub(table, scan, code, since, out);
            looked += scanMail(table, scan, out);
            scan.at = time();
            writeJson(SCAN, scan);
            report = { messages: looked, users: deliver(out), backfill: !!since };
        });
        return report;
    }

    /* Scan one sub now (after a local post). Skipped if a scan is running:
       that scan, or the next timed one, picks the message up. */
    function indexSub(code) {
        if (!msg_area.sub[code]) return false;
        return withLock(RUN_LOCK, 1500, 600, function () {
            var scan = readJson(SCAN);
            if (!scan) return;              /* first full scan hasn't run yet */
            var table = userTable(), out = {};
            scanSub(table, scan, code, 0, out);
            writeJson(SCAN, scan);
            deliver(out);
        });
    }

    return {
        dir: DIR,
        path: userPath,
        prefKinds: PREF_KINDS,
        chatKinds: CHAT_KINDS,
        prefs: prefs,
        setPrefs: setPrefs,
        unread: unread,
        list: list,
        markRead: markRead,
        add: add,
        indexAll: indexAll,
        indexSub: indexSub
    };
})();

/* load({}, ...) callers: a top-level var doesn't reliably land on a private
   scope, a function does (same as social_lib.js's getSocial). */
function getNotify() { return Notify; }
