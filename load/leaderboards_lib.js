// leaderboards_lib.js - the home page's rankings, built ahead of time.
//
// Built every few minutes by the HM_LEADERBOARDS timed event
// (mods/hm_leaderboards.js) into data/leaderboards/<name>.json, and read by
// webv4's api/leaderboards.ssjs, so a page load never waits on a count.
// If a file is missing or the event has stopped, the API builds that one
// board itself (see Leaderboards.get).
//
//   forums   { code: posts }               posts per sub in the last 30 days,
//                                           ad and data boards left out
//   posters  { code: { number: posts } }    forum posts per sub per account,
//                                           counted like a profile's Forum
//                                           Activity (Social.forumPostCountsBySub)
//   rico     [{ number, alias, coins }]     most BBScoin first
//   suave    [{ number, alias, friends }]   most friends first
//
// forums and posters are kept for every sub: what a reader may see depends
// on who they are, so the API cuts them down per request.

var Leaderboards = (function () {
    var DIR = system.data_dir + 'leaderboards/';
    var STALE_SEC = 20 * 60;   /* older than this, the API rebuilds it itself */
    var LIMIT = 50;
    var FORUM_DAYS = 30;
    var AD_SUB = /\bads?\b|advert|advertis|classified/i;
    var DATA_SUB = /\bdata\b|\bdat\b|syncdata|sync-data|_data$|-data$|user avatars/i;

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

    /* Alias of a listable account (not deleted, inactive or the guest), or null. */
    function listable(n, guest) {
        if (!(n > 0) || n > system.lastuser) return null;
        var u = new User(n);
        if (u.settings & (USER_DELETED | USER_INACTIVE)) return null;
        if (!u.alias || u.alias === guest) return null;
        return u.alias;
    }

    function rico(guest) {
        var out = [];
        directory(system.data_dir + 'points/ledger_*.json').forEach(function (path) {
            var m = /ledger_(\d+)\.json$/.exec(path);
            if (!m) return;
            var n = parseInt(m[1], 10), alias = listable(n, guest);
            if (!alias) return;
            var ledger = readJson(path), coins = 0;
            if (!ledger || !ledger.entries) return;
            ledger.entries.forEach(function (e) { if (typeof e.delta === 'number') coins += e.delta; });
            if (coins > 0) out.push({ number: n, alias: alias, coins: coins });
        });
        out.sort(function (a, b) { return b.coins - a.coins || a.number - b.number; });
        return out.slice(0, LIMIT);
    }

    function suave(guest) {
        var data = readJson(system.data_dir + 'social/friends.json');
        var out = [];
        if (!data || !data.friends) return out;
        for (var key in data.friends) {
            if (!data.friends.hasOwnProperty(key)) continue;
            var n = parseInt(key, 10), alias = listable(n, guest);
            if (!alias || !data.friends[key]) continue;
            /* Count only friends whose accounts still stand. */
            var seen = {}, count = 0;
            data.friends[key].forEach(function (f) {
                f = parseInt(f, 10);
                if (f !== n && !seen[f] && listable(f, guest)) { seen[f] = true; count++; }
            });
            if (count > 0) out.push({ number: n, alias: alias, friends: count });
        }
        out.sort(function (a, b) { return b.friends - a.friends || a.alias.toLowerCase().localeCompare(b.alias.toLowerCase()); });
        return out.slice(0, LIMIT);
    }

    /* Posts per sub in the last FORUM_DAYS (deleted and private mail left
       out), for every sub but ad and data boards. */
    function forums() {
        require('sbbsdefs.js', 'MSG_DELETE');
        var since = time() - FORUM_DAYS * 86400, out = {};
        for (var code in msg_area.sub) {
            var s = msg_area.sub[code];
            var label = code + ' ' + s.name + ' ' + s.description;
            if (AD_SUB.test(label) || DATA_SUB.test(label)) continue;
            var mb = new MsgBase(code);
            if (!mb.open()) continue;
            var idx = mb.get_index() || [], posts = 0;
            mb.close();
            for (var i = idx.length - 1; i >= 0; i--) {
                var e = idx[i];
                if (!e || e.time < since) continue;
                if (e.attr & (MSG_DELETE | MSG_PRIVATE)) continue;
                posts++;
            }
            if (posts > 0) out[code] = posts;
        }
        return out;
    }

    function posters() {
        if (typeof Social === 'undefined') load(system.mods_dir + 'load/social_lib.js');
        return Social.forumPostCountsBySub();
    }

    var BUILDERS = { forums: forums, posters: posters, rico: rico, suave: suave };

    /* Build one board and save it; returns its data. */
    function build(name, guest) {
        var data = BUILDERS[name](guest);
        writeJson(DIR + name + '.json', { built: time(), data: data });
        return data;
    }

    /* A board's data: the saved copy, or (missing or STALE_SEC old) built now. */
    function get(name, guest) {
        if (!BUILDERS[name]) return null;
        var saved = readJson(DIR + name + '.json');
        if (saved && saved.data !== undefined && time() - (saved.built || 0) < STALE_SEC) return saved.data;
        return build(name, guest);
    }

    return { names: ['forums', 'posters', 'rico', 'suave'], build: build, get: get, listable: listable };
}());
