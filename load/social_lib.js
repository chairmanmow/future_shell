/* social_lib.js - shared user-profile + friends store for Futureland
 *
 * Consumers: the fshell_ts terminal shell (src/runtime/sbbs.ts), the website
 * (webv4_custom root/api/social.ssjs + pages/013-profile.xjs) and anything
 * else that wants to know who is friends with whom. Load with an absolute
 * path so neither side depends on the load() search order:
 *
 *     load(system.mods_dir + 'load/social_lib.js');   // defines global Social
 *
 * ES5 only: this runs under Synchronet's SpiderMonkey 1.8.5.
 *
 * Concepts
 *   Friends     mutual, local accounts only, by user number. A request from A
 *               to B sits in `requests` until B accepts (both become friends),
 *               declines, or A cancels. A request that meets one already going
 *               the other way is accepted on the spot.
 *   Profile     the owner-editable part of a user page: headline, mood, the
 *               profile song, featured friends, wall policy, web theme.
 *   Feed        one append-only jsonl per user. Posts BY the owner are Updates
 *               (their status history); posts by others are Wall posts.
 *               Deleting appends a tombstone.
 *   Resolver    resolveLocalUser(handle, network): a chat nick -> user number.
 *               Order: sysop "not a local user" mark (never matches), sysop
 *               cross-network link (data/avatar_placeholders.json `links`),
 *               then a bare alias match. The mark also lives in that file so
 *               the avatar resolvers on both sides honour it.
 *
 * Files (data/social/)
 *   friends.json         { version, friends: { "<n>": [n, ...] }, requests: [ {from, to, at, message} ] }
 *   profiles/<n>.json    see defaultProfile()
 *   feeds/<n>.jsonl      { id, at, author, alias, kind: 'update'|'wall', body } | { id, deleted: true, at, by }
 *
 * Writes to friends.json and profiles go through a mkdir() lock plus
 * write-temp-then-rename (same recipe as fl_playcounts.js), so a web request
 * and a terminal node saving at the same moment cannot clobber each other.
 */
var Social = (function () {
	'use strict';

	var VERSION = 1;
	var LOCK_WAIT_MS = 1500;
	var LOCK_STALE_SEC = 10;
	var MAX_FRIENDS = 500;
	var MAX_FEATURED = 8;
	var MAX_POST_CHARS = 1000;
	var MAX_HEADLINE = 60;
	var MAX_MOOD = 40;
	var MAX_FEED_BYTES = 4 * 1024 * 1024;
	var MAX_REQUEST_MESSAGE = 200;
	var PLACEHOLDERS_MAX_BYTES = 2 * 1024 * 1024;
	var THEME_PRESETS = ['classic', 'midnight', 'cga', 'sunset', 'terminal'];
	/* Theme of a profile whose owner never picked one (both renderers). */
	var DEFAULT_THEME_PRESET = 'cga';
	var WALL_POLICIES = ['friends', 'nobody'];

	var baseDir = system.data_dir + 'social/';
	var friendsPath = baseDir + 'friends.json';
	var profilesDir = baseDir + 'profiles/';
	var feedsDir = baseDir + 'feeds/';
	var placeholdersPath = system.data_dir + 'avatar_placeholders.json';
	var usagePath = system.mods_dir + 'future_shell/data/external_usage.json';
	var pointsDir = system.data_dir + 'points/';
	var wikiPagesDir = system.data_dir + 'wiki/pages/';
	var trackOverridesPath = system.data_dir + 'futureland-records/track-overrides.ini';

	if (typeof USER_DELETED === 'undefined') { try { load('sbbsdefs.js'); } catch (e) { } }
	if (typeof NODE_INUSE === 'undefined') { try { load('nodedefs.js'); } catch (e) { } }

	// ------------------------------------------------------------ utilities

	function toNumber(value, fallback) {
		var n = Number(value);
		return isFinite(n) ? n : fallback;
	}

	function userNumber(value) {
		var n = Math.floor(toNumber(value, 0));
		return n > 0 ? n : 0;
	}

	function nowMs() {
		return Date.now ? Date.now() : new Date().getTime();
	}

	function trim(value) {
		return String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '');
	}

	/* Match key for a handle: trimmed, control bytes dropped, lowercased. Same
	   rule as the avatar placeholder file (both shells key on it). */
	function handleKey(value) {
		return String(value === undefined || value === null ? '' : value)
			.replace(/[\x00-\x1f\x7f]/g, '')
			.replace(/^\s+|\s+$/g, '')
			.toLowerCase()
			.substr(0, 60);
	}

	/* Forms of a chat handle worth matching against local aliases: as seen,
	   without the MRC collision suffix (^11D) and site tags (Alias[FL],
	   Alias<FL>, [FL]Alias, !xx!Alias), underscores as spaces, and fully
	   collapsed. Mirrors webv4_custom/lib/avatar-profiles.js forms(). */
	function handleForms(handle) {
		var raw = String(handle || '');
		var plain = raw
			.replace(/\^\(?[A-Za-z0-9]{1,8}\)?$/, '')
			.replace(/(\[\w{1,4}\]|<\w{1,4}>)$/, '')
			.replace(/^(\[\w{1,4}\]|<\w{1,4}>|!\w{1,4}!)/, '');
		var list = [raw, plain, plain.replace(/_/g, ' '), plain.replace(/[^A-Za-z0-9]/g, '')];
		var out = [];
		var seen = {};
		var i, k;
		for (i = 0; i < list.length; i++) {
			k = handleKey(list[i]);
			if (k.length && !seen[k]) { seen[k] = true; out.push(k); }
		}
		return out;
	}

	/* Lowercased alphanumerics only: "Hm Derdoc" -> "hmderdoc". */
	function collapse(value) {
		return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
	}

	/* Text for a post / headline: no control bytes except newline and
	   Synchronet Ctrl-A colour codes (\x01 + letter/digit/-/_), which both
	   renderers understand; a bare \x01 is dropped. Mystic pipe codes (|07)
	   are plain text here and still colour on both sides. */
	function cleanText(value, max, multiline) {
		var s = String(value === undefined || value === null ? '' : value)
			.replace(/\r\n?/g, '\n')
			.replace(/\x01([A-Za-z0-9\-_])/g, '\u0100$1')     // park valid Ctrl-A pairs
			.replace(multiline ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, '')
			.replace(/\u0100/g, '\x01');
		if (!multiline) s = s.replace(/\n/g, ' ');
		s = s.replace(/^\s+|\s+$/g, '');
		if (max > 0 && s.length > max) s = s.substr(0, max);
		return s;
	}

	function dirOf(path) {
		var slash = path.lastIndexOf('/');
		return slash > 0 ? path.substring(0, slash + 1) : '';
	}

	function ensureDir(path) {
		if (path.length && !file_exists(path)) {
			try { mkpath(path); } catch (e) { }
		}
	}

	function readText(path, maxBytes) {
		var f, raw;
		if (!file_exists(path)) return '';
		f = new File(path);
		if (!f.open('r')) return '';
		try { raw = (maxBytes > 0 ? f.read(maxBytes) : f.read()) || ''; } finally { f.close(); }
		return raw;
	}

	function readJson(path, maxBytes) {
		var raw = readText(path, maxBytes);
		if (!raw.length) return null;
		try { return JSON.parse(raw); } catch (e) { return null; }
	}

	function writeJsonAtomic(path, data) {
		var tmp = path + '.tmp' + Math.floor(Math.random() * 1000000000);
		var f;
		ensureDir(dirOf(path));
		f = new File(tmp);
		if (!f.open('w+')) throw new Error('Could not write ' + tmp);
		try { f.write(JSON.stringify(data, null, 1)); } finally { f.close(); }
		if (!file_rename(tmp, path)) {
			try { file_remove(tmp); } catch (e) { }
			throw new Error('Could not replace ' + path);
		}
	}

	function acquireLock(path) {
		var lock = path + '.lock';
		var started = nowMs();
		var stamp;
		ensureDir(dirOf(path));
		for (;;) {
			if (mkdir(lock)) return lock;
			stamp = file_date(lock);
			if (stamp > 0 && time() - stamp > LOCK_STALE_SEC) {
				rmdir(lock);   // a crashed writer left it behind
				continue;
			}
			if (nowMs() - started > LOCK_WAIT_MS) return null;
			mswait(20);
		}
	}

	function releaseLock(lock) {
		if (lock) { try { rmdir(lock); } catch (e) { } }
	}

	function withLock(path, fn) {
		var lock = acquireLock(path);
		if (!lock) throw new Error('Could not lock ' + path);
		try { return fn(); } finally { releaseLock(lock); }
	}

	function indexOf(list, value) {
		var i;
		for (i = 0; i < list.length; i++) if (list[i] === value) return i;
		return -1;
	}

	function currentUserIsSysop() {
		try { return typeof user === 'object' && user !== null && user.number > 0 && !!user.is_sysop; } catch (e) { return false; }
	}

	function currentUserNumber() {
		try { return typeof user === 'object' && user !== null ? userNumber(user.number) : 0; } catch (e) { return 0; }
	}

	// ------------------------------------------------------------ accounts

	var userCache = {};

	/* Public, cheap view of a local account, or null for deleted/missing. */
	function account(number) {
		var n = userNumber(number);
		var u, rec;
		if (!n) return null;
		if (userCache.hasOwnProperty(n)) return userCache[n];
		rec = null;
		try {
			if (n <= system.lastuser) {
				u = new User(n);
				if (u && u.alias && !(u.settings & USER_DELETED)) {
					rec = {
						number: n,
						alias: String(u.alias),
						location: String(u.location || ''),
						firstOn: toNumber(u.stats.firston_date, 0),
						lastOn: toNumber(u.stats.laston_date, 0),
						logons: toNumber(u.stats.total_logons, 0),
						timeOnMinutes: toNumber(u.stats.total_timeon, 0),
						posts: toNumber(u.stats.total_posts, 0),
						uploads: toNumber(u.stats.files_uploaded, 0),
						downloads: toNumber(u.stats.files_downloaded, 0),
						inactive: !!(u.settings & USER_INACTIVE),
						quiet: false
					};
					try { rec.quiet = !!u.compare_ars('REST Q'); } catch (e) { rec.quiet = false; }
				}
			}
		} catch (e) { rec = null; }
		userCache[n] = rec;
		return rec;
	}

	function aliasOf(number) {
		var a = account(number);
		return a ? a.alias : '';
	}

	/* Exact alias -> number, 0 when unknown or deleted. */
	function localUserByAlias(alias) {
		var n = 0;
		var name = trim(alias);
		if (!name.length) return 0;
		try { n = system.matchuser(name) || 0; } catch (e) { n = 0; }
		if (n > 0 && !account(n)) n = 0;
		return n;
	}

	/* Node the account is on right now, 0 when offline. */
	function onlineNode(number) {
		var n = userNumber(number);
		var nodes, i, node;
		if (!n) return 0;
		try { nodes = system.node_list || []; } catch (e) { nodes = []; }
		for (i = 0; i < nodes.length; i++) {
			node = nodes[i];
			if (!node) continue;
			if (node.status !== NODE_INUSE && node.status !== NODE_QUIET) continue;
			if (node.useron === n) return i + 1;
		}
		return 0;
	}

	// ------------------------------------------------------------ placeholders file (links + not-local marks)

	var placeholderStamp = -1;
	var placeholderLinks = {};
	var placeholderNotLocal = {};

	function placeholderFileStamp() {
		return file_exists(placeholdersPath) ? (file_date(placeholdersPath) * 1000 + (file_size(placeholdersPath) % 1000)) : 0;
	}

	function loadPlaceholders() {
		var stamp = placeholderFileStamp();
		var parsed, name, alias, main, links, marks;
		if (stamp === placeholderStamp) return;
		placeholderStamp = stamp;
		placeholderLinks = {};
		placeholderNotLocal = {};
		if (!stamp) return;
		parsed = readJson(placeholdersPath, PLACEHOLDERS_MAX_BYTES);
		if (!parsed || typeof parsed !== 'object') return;
		links = parsed.links && typeof parsed.links === 'object' ? parsed.links : {};
		for (name in links) {
			if (!links.hasOwnProperty(name)) continue;
			alias = handleKey(name);
			main = handleKey(links[name]);
			if (alias.length && main.length && alias !== main) placeholderLinks[alias] = main;
		}
		// a -> b -> c reads as a -> c (one hop, like the shell)
		for (alias in placeholderLinks) {
			if (!placeholderLinks.hasOwnProperty(alias)) continue;
			main = placeholderLinks[placeholderLinks[alias]];
			if (main && main !== alias) placeholderLinks[alias] = main;
		}
		marks = parsed.notLocal && typeof parsed.notLocal === 'object' ? parsed.notLocal : {};
		for (name in marks) {
			if (!marks.hasOwnProperty(name)) continue;
			alias = handleKey(name);
			if (alias.length) placeholderNotLocal[alias] = true;
		}
	}

	/* True when a sysop marked this handle as NOT any local account. */
	function isNotLocal(handle) {
		var forms = handleForms(handle);
		var i;
		loadPlaceholders();
		for (i = 0; i < forms.length; i++) if (placeholderNotLocal[forms[i]]) return true;
		return false;
	}

	/* The main name a handle is linked to, or ''. */
	function linkedTo(handle) {
		var forms = handleForms(handle);
		var i;
		loadPlaceholders();
		for (i = 0; i < forms.length; i++) if (placeholderLinks.hasOwnProperty(forms[i])) return placeholderLinks[forms[i]];
		return '';
	}

	/* Sysop only: mark (on) or clear (off) "handle is not a local user".
	   Rewrites the shared placeholders file in place, keeping entries/links. */
	function setNotLocal(handle, on, by) {
		var key = handleKey(handle);
		var parsed, marks;
		if (!key.length) return false;
		if (!currentUserIsSysop()) return false;
		parsed = readJson(placeholdersPath, PLACEHOLDERS_MAX_BYTES);
		if (!parsed || typeof parsed !== 'object') parsed = { version: 1, entries: {}, links: {} };
		if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};
		if (!parsed.links || typeof parsed.links !== 'object') parsed.links = {};
		marks = parsed.notLocal && typeof parsed.notLocal === 'object' ? parsed.notLocal : {};
		if (on) marks[key] = { by: String(by || (typeof user === 'object' && user ? user.alias : '') || '').substr(0, 40), at: nowMs() };
		else delete marks[key];
		parsed.notLocal = marks;
		try {
			var f = new File(placeholdersPath);
			if (!f.open('w')) return false;
			try { f.write(JSON.stringify(parsed)); } finally { f.close(); }
		} catch (e) { return false; }
		placeholderStamp = -1;
		return true;
	}

	/* Sysop: read-modify-write of data/avatar_placeholders.json (entries,
	   links, notLocal), the same file the terminal chat menu edits. */
	function editPlaceholders(fn) {
		var parsed;
		if (!currentUserIsSysop()) return false;
		parsed = readJson(placeholdersPath, PLACEHOLDERS_MAX_BYTES);
		if (!parsed || typeof parsed !== 'object') parsed = { version: 1, entries: {}, links: {} };
		if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};
		if (!parsed.links || typeof parsed.links !== 'object') parsed.links = {};
		if (!parsed.notLocal || typeof parsed.notLocal !== 'object') parsed.notLocal = {};
		if (fn(parsed) === false) return false;
		try {
			var f = new File(placeholdersPath);
			if (!f.open('w')) return false;
			try { f.write(JSON.stringify(parsed)); } finally { f.close(); }
		} catch (e) { return false; }
		placeholderStamp = -1;
		return true;
	}

	/* Pin a 10x6 raster (base64, 160 chars) to a handle that has no real avatar. */
	function setPlaceholder(handle, data, source) {
		var key = handleKey(handle);
		var clean = String(data || '').replace(/\s+/g, '');
		if (!key.length || clean.length !== 160 || !/^[A-Za-z0-9+\/]+=*$/.test(clean)) return false;
		return editPlaceholders(function (parsed) {
			parsed.entries[key] = { data: clean, source: String(source || '').substr(0, 80), by: (typeof user === 'object' && user ? String(user.alias) : ''), at: nowMs() };
		});
	}

	function clearPlaceholder(handle) {
		var key = handleKey(handle);
		if (!key.length) return false;
		return editPlaceholders(function (parsed) {
			if (!parsed.entries[key]) return false;
			delete parsed.entries[key];
		});
	}

	/* handle -> main name ('' unlinks). Chains flatten to the main name. */
	function linkHandle(handle, mainName) {
		var alias = handleKey(handle);
		var main = handleKey(mainName);
		if (!alias.length) return false;
		return editPlaceholders(function (parsed) {
			var other;
			if (main.length && parsed.links[main]) main = handleKey(parsed.links[main]);
			if (!main.length || main === alias) {
				if (!parsed.links[alias]) return false;
				delete parsed.links[alias];
				return;
			}
			parsed.links[alias] = main;
			for (other in parsed.links) if (parsed.links.hasOwnProperty(other) && parsed.links[other] === alias) parsed.links[other] = main;
		});
	}

	/* What a sysop needs to know about a handle before offering overrides. */
	function placeholderInfo(handle) {
		var key = handleKey(handle);
		var parsed = readJson(placeholdersPath, PLACEHOLDERS_MAX_BYTES) || {};
		var entries = parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
		var entry = entries[key] || null;
		loadPlaceholders();
		return {
			hasPlaceholder: !!(entry && entry.data),
			placeholderSource: entry ? String(entry.source || '') : '',
			linkedTo: linkedTo(handle),
			notLocal: isNotLocal(handle)
		};
	}

	// ------------------------------------------------------------ ignore list (shell preferences)

	var shellPrefsPath = system.mods_dir + 'fshell_ts/data/prefs/shell_prefs.json';

	function readShellPrefs() {
		var data = readJson(shellPrefsPath, 0);
		if (!data || typeof data !== 'object') data = {};
		if (!data.users || typeof data.users !== 'object') data.users = {};
		return data;
	}

	/* The terminal shell's per-user ignore list: [{handle, label, network, hideChat, added}].
	   Sharing it means ignoring someone on the web silences them on the BBS too. */
	function ignoreList(number) {
		var n = userNumber(number);
		var entry = n ? readShellPrefs().users['user-' + n] : null;
		var list = entry && entry.notifications && Object.prototype.toString.call(entry.notifications.ignored) === '[object Array]' ? entry.notifications.ignored : [];
		var out = [];
		var i, e;
		for (i = 0; i < list.length; i++) {
			e = list[i];
			if (!e || typeof e !== 'object' || !handleKey(e.handle || e.label).length) continue;
			out.push({ handle: handleKey(e.handle || e.label), label: String(e.label || e.handle), network: String(e.network || ''), hideChat: e.hideChat !== false, added: toNumber(e.added, 0) });
		}
		return out;
	}

	function isIgnored(number, handle, network) {
		var list = ignoreList(number);
		var key = handleKey(handle);
		var i;
		for (i = 0; i < list.length; i++) {
			if (list[i].handle === key && (list[i].network === '' || list[i].network === String(network || ''))) return true;
		}
		return false;
	}

	/* Add (on) or drop (off) `handle` on `network` ('' = everywhere) for user `number`. */
	function setIgnored(number, handle, network, on) {
		var n = userNumber(number);
		var key = handleKey(handle);
		var net = String(network || '');
		if (!n || !key.length) return fail('no-such-user');
		return withLock(shellPrefsPath, function () {
			var data = readShellPrefs();
			var entry = data.users['user-' + n];
			var list, i, changed = false;
			if (!entry || typeof entry !== 'object') entry = { version: 7, updated: 0, notifications: {} };
			if (!entry.notifications || typeof entry.notifications !== 'object') entry.notifications = {};
			if (Object.prototype.toString.call(entry.notifications.ignored) !== '[object Array]') entry.notifications.ignored = [];
			list = entry.notifications.ignored;
			for (i = list.length - 1; i >= 0; i--) {
				if (list[i] && handleKey(list[i].handle || list[i].label) === key && (on ? String(list[i].network || '') === net : (String(list[i].network || '') === net || String(list[i].network || '') === ''))) {
					if (!on) { list.splice(i, 1); changed = true; }
					else return { ok: true, status: 'already' };
				}
			}
			if (on) {
				if (list.length >= 200) return fail('list-full');
				list.push({ handle: key, label: cleanText(handle, 60, false), network: net, hideChat: true, added: nowMs() });
				changed = true;
			}
			if (!changed) return { ok: true, status: 'not-ignored' };
			entry.updated = nowMs();
			data.users['user-' + n] = entry;
			writeJsonAtomic(shellPrefsPath, data);
			return { ok: true, status: on ? 'ignored' : 'unignored' };
		});
	}

	/* A chat handle seen on `network` -> local user number, or 0.
	   'local' handles are aliases already, but the same rules do no harm. */
	function resolveLocalUser(handle, network) {
		var forms = handleForms(handle);
		var i, main, n;
		if (!forms.length) return 0;
		loadPlaceholders();
		for (i = 0; i < forms.length; i++) if (placeholderNotLocal[forms[i]]) return 0;
		main = '';
		for (i = 0; i < forms.length && !main.length; i++) {
			if (placeholderLinks.hasOwnProperty(forms[i])) main = placeholderLinks[forms[i]];
		}
		if (main.length) {
			if (placeholderNotLocal[main]) return 0;
			n = localUserByAlias(main);
			if (n) return n;
		}
		for (i = 0; i < forms.length; i++) {
			n = localUserByAlias(forms[i]);
			if (n) return n;
		}
		return 0;
	}

	// ------------------------------------------------------------ friends graph

	function emptyGraph() {
		return { version: VERSION, friends: {}, requests: [] };
	}

	function readGraph() {
		var data = readJson(friendsPath, 0);
		var key, list, out, i, n;
		if (!data || typeof data !== 'object') return emptyGraph();
		if (!data.friends || typeof data.friends !== 'object') data.friends = {};
		if (Object.prototype.toString.call(data.requests) !== '[object Array]') data.requests = [];
		for (key in data.friends) {
			if (!data.friends.hasOwnProperty(key)) continue;
			list = data.friends[key];
			out = [];
			if (Object.prototype.toString.call(list) === '[object Array]') {
				for (i = 0; i < list.length; i++) {
					n = userNumber(list[i]);
					if (n && n !== userNumber(key) && indexOf(out, n) === -1) out.push(n);
				}
			}
			data.friends[key] = out;
		}
		out = [];
		for (i = 0; i < data.requests.length; i++) {
			var r = data.requests[i];
			if (!r || typeof r !== 'object') continue;
			var from = userNumber(r.from), to = userNumber(r.to);
			if (!from || !to || from === to) continue;
			out.push({ from: from, to: to, at: toNumber(r.at, 0), message: cleanText(r.message, MAX_REQUEST_MESSAGE, false) });
		}
		data.requests = out;
		data.version = VERSION;
		return data;
	}

	function writeGraph(data) {
		writeJsonAtomic(friendsPath, data);
	}

	function graphFriends(data, n) {
		var list = data.friends[String(n)];
		return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
	}

	function findRequest(data, from, to) {
		var i;
		for (i = 0; i < data.requests.length; i++) {
			if (data.requests[i].from === from && data.requests[i].to === to) return i;
		}
		return -1;
	}

	function removeRequestsBetween(data, a, b) {
		var i;
		for (i = data.requests.length - 1; i >= 0; i--) {
			var r = data.requests[i];
			if ((r.from === a && r.to === b) || (r.from === b && r.to === a)) data.requests.splice(i, 1);
		}
	}

	function linkPair(data, a, b) {
		var la = graphFriends(data, a), lb = graphFriends(data, b);
		if (indexOf(la, b) === -1) la.push(b);
		if (indexOf(lb, a) === -1) lb.push(a);
		data.friends[String(a)] = la;
		data.friends[String(b)] = lb;
	}

	function unlinkPair(data, a, b) {
		var la = graphFriends(data, a), lb = graphFriends(data, b);
		var ia = indexOf(la, b), ib = indexOf(lb, a);
		var changed = false;
		if (ia !== -1) { la.splice(ia, 1); changed = true; }
		if (ib !== -1) { lb.splice(ib, 1); changed = true; }
		data.friends[String(a)] = la;
		data.friends[String(b)] = lb;
		return changed;
	}

	/* Friend numbers of `n`, deleted accounts dropped. */
	function friendsOf(number) {
		var n = userNumber(number);
		var list = n ? graphFriends(readGraph(), n) : [];
		var out = [];
		var i;
		for (i = 0; i < list.length; i++) if (account(list[i])) out.push(list[i]);
		return out;
	}

	/* [{number, alias, online}] for a user's friends, alphabetical. */
	function friendList(number) {
		var list = friendsOf(number);
		var out = [];
		var i, a;
		for (i = 0; i < list.length; i++) {
			a = account(list[i]);
			if (a) out.push({ number: a.number, alias: a.alias, online: onlineNode(a.number) });
		}
		out.sort(function (x, y) { return x.alias.toLowerCase() < y.alias.toLowerCase() ? -1 : x.alias.toLowerCase() > y.alias.toLowerCase() ? 1 : 0; });
		return out;
	}

	function isFriend(a, b) {
		var na = userNumber(a), nb = userNumber(b);
		if (!na || !nb || na === nb) return false;
		return indexOf(graphFriends(readGraph(), na), nb) !== -1;
	}

	/* The virtual function from the design notes: a chat nick on `network`
	   is a friend of `viewer` when it resolves to a local friend. */
	function isFriendHandle(handle, network, viewer) {
		var n = resolveLocalUser(handle, network);
		return n ? isFriend(n, viewer) : false;
	}

	function requestView(r) {
		var fa = account(r.from), ta = account(r.to);
		return {
			from: r.from, fromAlias: fa ? fa.alias : '#' + r.from,
			to: r.to, toAlias: ta ? ta.alias : '#' + r.to,
			at: r.at, message: r.message
		};
	}

	/* Requests waiting for `n` to answer, newest first. */
	function incomingRequests(number) {
		var n = userNumber(number);
		var data = readGraph();
		var out = [];
		var i;
		for (i = 0; i < data.requests.length; i++) {
			if (data.requests[i].to === n && account(data.requests[i].from)) out.push(requestView(data.requests[i]));
		}
		out.sort(function (x, y) { return y.at - x.at; });
		return out;
	}

	/* Requests `n` sent that nobody has answered yet. */
	function outgoingRequests(number) {
		var n = userNumber(number);
		var data = readGraph();
		var out = [];
		var i;
		for (i = 0; i < data.requests.length; i++) {
			if (data.requests[i].from === n && account(data.requests[i].to)) out.push(requestView(data.requests[i]));
		}
		out.sort(function (x, y) { return y.at - x.at; });
		return out;
	}

	/* 'self' | 'friends' | 'outgoing' (viewer asked) | 'incoming' (they asked) | 'none' */
	function relation(viewer, other) {
		var a = userNumber(viewer), b = userNumber(other);
		var data;
		if (!a || !b) return 'none';
		if (a === b) return 'self';
		data = readGraph();
		if (indexOf(graphFriends(data, a), b) !== -1) return 'friends';
		if (findRequest(data, a, b) !== -1) return 'outgoing';
		if (findRequest(data, b, a) !== -1) return 'incoming';
		return 'none';
	}

	/* Best-effort node message so an online recipient hears about it in any
	   shell. Never throws. */
	function telegram(to, text) {
		try { system.put_telegram(to, text); } catch (e) { }
	}

	function fail(reason) { return { ok: false, reason: reason }; }

	/* A -> B. Returns { ok, status: 'requested'|'friends' } or { ok:false, reason }. */
	function requestFriend(from, to, message) {
		var a = userNumber(from), b = userNumber(to);
		var msg = cleanText(message, MAX_REQUEST_MESSAGE, false);
		if (!a || !b) return fail('no-such-user');
		if (a === b) return fail('self');
		if (!account(a) || !account(b)) return fail('no-such-user');
		return withLock(friendsPath, function () {
			var data = readGraph();
			var result;
			if (indexOf(graphFriends(data, a), b) !== -1) return { ok: true, status: 'friends', already: true };
			if (findRequest(data, a, b) !== -1) return { ok: true, status: 'requested', already: true };
			if (graphFriends(data, a).length >= MAX_FRIENDS) return fail('list-full');
			if (findRequest(data, b, a) !== -1) {
				// They already asked: mutual intent, no need to make them wait.
				removeRequestsBetween(data, a, b);
				linkPair(data, a, b);
				writeGraph(data);
				result = { ok: true, status: 'friends' };
				telegram(b, '\x01n\x01h' + aliasOf(a) + '\x01n accepted your friend request. You are now friends.\r\n');
				return result;
			}
			data.requests.push({ from: a, to: b, at: nowMs(), message: msg });
			writeGraph(data);
			telegram(b, '\x01n\x01h' + aliasOf(a) + '\x01n sent you a friend request' + (msg.length ? ': "' + msg + '"' : '.') + '\r\n');
			return { ok: true, status: 'requested' };
		});
	}

	/* `to` accepts the request `from` sent. */
	function acceptRequest(to, from) {
		var a = userNumber(from), b = userNumber(to);
		if (!a || !b || a === b) return fail('no-such-user');
		return withLock(friendsPath, function () {
			var data = readGraph();
			if (findRequest(data, a, b) === -1) {
				return indexOf(graphFriends(data, a), b) !== -1 ? { ok: true, status: 'friends', already: true } : fail('no-request');
			}
			if (!account(a) || !account(b)) return fail('no-such-user');
			removeRequestsBetween(data, a, b);
			linkPair(data, a, b);
			writeGraph(data);
			telegram(a, '\x01n\x01h' + aliasOf(b) + '\x01n accepted your friend request. You are now friends.\r\n');
			return { ok: true, status: 'friends' };
		});
	}

	/* `to` declines what `from` sent (quietly: the sender is not told). */
	function declineRequest(to, from) {
		var a = userNumber(from), b = userNumber(to);
		if (!a || !b) return fail('no-such-user');
		return withLock(friendsPath, function () {
			var data = readGraph();
			var at = findRequest(data, a, b);
			if (at === -1) return fail('no-request');
			data.requests.splice(at, 1);
			writeGraph(data);
			return { ok: true, status: 'declined' };
		});
	}

	/* `from` withdraws a request they sent to `to`. */
	function cancelRequest(from, to) {
		var a = userNumber(from), b = userNumber(to);
		if (!a || !b) return fail('no-such-user');
		return withLock(friendsPath, function () {
			var data = readGraph();
			var at = findRequest(data, a, b);
			if (at === -1) return fail('no-request');
			data.requests.splice(at, 1);
			writeGraph(data);
			return { ok: true, status: 'cancelled' };
		});
	}

	/* Either side ends the friendship. Also drops any request between them. */
	function unfriend(a, b) {
		var na = userNumber(a), nb = userNumber(b);
		if (!na || !nb || na === nb) return fail('no-such-user');
		return withLock(friendsPath, function () {
			var data = readGraph();
			var was = unlinkPair(data, na, nb);
			removeRequestsBetween(data, na, nb);
			writeGraph(data);
			return { ok: true, status: was ? 'unfriended' : 'not-friends' };
		});
	}

	// ------------------------------------------------------------ profiles

	function defaultProfile(number) {
		return {
			version: VERSION,
			number: userNumber(number),
			headline: '',      // one line under the name
			mood: '',          // short "feeling" tag
			song: '',          // filename in the OriginalContent MP3 dir
			featured: [],      // up to MAX_FEATURED friend numbers, in display order
			wallPolicy: 'friends',
			theme: { preset: DEFAULT_THEME_PRESET, accent: '', background: '', text: '', link: '' },
			updated: 0,
			views: 0
		};
	}

	function profilePath(number) {
		return profilesDir + format('%04u', userNumber(number)) + '.json';
	}

	function hexColor(value) {
		var s = trim(value).toLowerCase();
		return /^#[0-9a-f]{6}$/.test(s) ? s : (/^#[0-9a-f]{3}$/.test(s) ? s : '');
	}

	function normalizeProfile(number, raw) {
		var p = defaultProfile(number);
		var src = raw && typeof raw === 'object' ? raw : {};
		var i, n, theme, list;
		p.headline = cleanText(src.headline, MAX_HEADLINE, false);
		p.mood = cleanText(src.mood, MAX_MOOD, false);
		p.song = cleanText(src.song, 200, false).replace(/[\/\\]/g, '');
		list = Object.prototype.toString.call(src.featured) === '[object Array]' ? src.featured : [];
		for (i = 0; i < list.length && p.featured.length < MAX_FEATURED; i++) {
			n = userNumber(list[i]);
			if (n && n !== p.number && indexOf(p.featured, n) === -1) p.featured.push(n);
		}
		p.wallPolicy = indexOf(WALL_POLICIES, String(src.wallPolicy)) !== -1 ? String(src.wallPolicy) : 'friends';
		theme = src.theme && typeof src.theme === 'object' ? src.theme : {};
		p.theme.preset = indexOf(THEME_PRESETS, String(theme.preset)) !== -1 ? String(theme.preset) : DEFAULT_THEME_PRESET;
		p.theme.accent = hexColor(theme.accent);
		p.theme.background = hexColor(theme.background);
		p.theme.text = hexColor(theme.text);
		p.theme.link = hexColor(theme.link);
		p.updated = toNumber(src.updated, 0);
		p.views = Math.max(0, Math.floor(toNumber(src.views, 0)));
		return p;
	}

	function profile(number) {
		var n = userNumber(number);
		var p;
		if (!n) return defaultProfile(0);
		p = normalizeProfile(n, readJson(profilePath(n), 0));
		/* A file the owner never saved (view counter only) carries whatever
		   the default was when it was written: keep it on today's default. */
		if (!p.updated) p.theme.preset = DEFAULT_THEME_PRESET;
		return p;
	}

	/* Merge `patch` into the stored profile. `by` must be the owner or a
	   sysop. Featured entries that are not (or no longer) friends are dropped. */
	function saveProfile(number, patch, by) {
		var n = userNumber(number);
		var editor = userNumber(by);
		var path;
		if (!n) return fail('no-such-user');
		if (editor !== n && !currentUserIsSysop()) return fail('forbidden');
		path = profilePath(n);
		return withLock(path, function () {
			var current = normalizeProfile(n, readJson(path, 0));
			var src = patch && typeof patch === 'object' ? patch : {};
			var merged = {};
			var key, friends, i, kept;
			for (key in current) if (current.hasOwnProperty(key)) merged[key] = current[key];
			for (key in src) if (src.hasOwnProperty(key) && key !== 'views' && key !== 'number' && key !== 'version') merged[key] = src[key];
			if (src.theme && typeof src.theme === 'object') {
				merged.theme = {};
				for (key in current.theme) if (current.theme.hasOwnProperty(key)) merged.theme[key] = current.theme[key];
				for (key in src.theme) if (src.theme.hasOwnProperty(key)) merged.theme[key] = src.theme[key];
			}
			merged = normalizeProfile(n, merged);
			friends = friendsOf(n);
			kept = [];
			for (i = 0; i < merged.featured.length; i++) if (indexOf(friends, merged.featured[i]) !== -1) kept.push(merged.featured[i]);
			merged.featured = kept;
			merged.views = current.views;
			merged.updated = nowMs();
			writeJsonAtomic(path, merged);
			return { ok: true, profile: merged };
		});
	}

	/* Count a profile view by someone other than the owner. Best effort. */
	function recordView(number, viewer) {
		var n = userNumber(number), v = userNumber(viewer);
		var path;
		if (!n || v === n) return;
		path = profilePath(n);
		try {
			withLock(path, function () {
				var current = normalizeProfile(n, readJson(path, 0));
				current.views += 1;
				writeJsonAtomic(path, current);
			});
		} catch (e) { }
	}

	// ------------------------------------------------------------ feed (updates + wall)

	function feedPath(number) {
		return feedsDir + format('%04u', userNumber(number)) + '.jsonl';
	}

	function newPostId(author) {
		return nowMs().toString(36) + '-' + userNumber(author).toString(36) + '-' + Math.floor(Math.random() * 1679616).toString(36);
	}

	/* Every live post on `n`'s feed, oldest first. Tombstones are applied. */
	function readFeed(number) {
		var n = userNumber(number);
		var raw = n ? readText(feedPath(n), MAX_FEED_BYTES) : '';
		var lines = raw.length ? raw.split('\n') : [];
		var posts = [];
		var byId = {};
		var i, line, obj, at;
		for (i = 0; i < lines.length; i++) {
			line = lines[i].replace(/\r$/, '');
			if (!line.replace(/\s+/g, '').length) continue;
			try { obj = JSON.parse(line); } catch (e) { continue; }
			if (!obj || typeof obj !== 'object' || typeof obj.id !== 'string') continue;
			if (obj.deleted === true) {
				at = byId[obj.id];
				if (at !== undefined) { posts[at] = null; }
				continue;
			}
			byId[obj.id] = posts.length;
			posts.push({
				id: obj.id,
				at: toNumber(obj.at, 0),
				author: userNumber(obj.author),
				alias: cleanText(obj.alias, 60, false),
				kind: obj.kind === 'wall' ? 'wall' : 'update',
				body: cleanText(obj.body, MAX_POST_CHARS, true)
			});
		}
		lines = [];
		for (i = 0; i < posts.length; i++) if (posts[i]) lines.push(posts[i]);
		return lines;
	}

	/* opts: { kind: 'update'|'wall'|'' (all), limit, newestFirst (default true) } */
	function feed(number, opts) {
		var o = opts || {};
		var all = readFeed(number);
		var out = [];
		var i;
		for (i = 0; i < all.length; i++) if (!o.kind || all[i].kind === o.kind) out.push(all[i]);
		if (o.newestFirst !== false) out.reverse();
		if (o.limit > 0 && out.length > o.limit) out.length = o.limit;
		return out;
	}

	function appendFeedLine(number, obj) {
		var path = feedPath(number);
		var f;
		ensureDir(feedsDir);
		f = new File(path);
		if (!f.open('a')) throw new Error('Could not append ' + path);
		try { f.write(JSON.stringify(obj) + '\n'); } finally { f.close(); }
	}

	/* Who may post on `owner`'s wall: friends (per policy) and the owner. */
	function canPostWall(owner, author) {
		var o = userNumber(owner), a = userNumber(author);
		var p;
		if (!o || !a) return false;
		if (o === a) return true;
		p = profile(o);
		if (p.wallPolicy === 'nobody') return false;
		return isFriend(o, a);
	}

	/* Post to `owner`'s feed. The owner's own posts are Updates; anyone else's
	   are Wall posts and go through canPostWall. */
	function post(owner, author, body) {
		var o = userNumber(owner), a = userNumber(author);
		var text = cleanText(body, MAX_POST_CHARS, true);
		var authorAccount = account(a);
		var entry;
		if (!o || !a || !account(o) || !authorAccount) return fail('no-such-user');
		if (!text.length) return fail('empty');
		if (o !== a && !canPostWall(o, a)) return fail('forbidden');
		entry = { id: newPostId(a), at: nowMs(), author: a, alias: authorAccount.alias, kind: o === a ? 'update' : 'wall', body: text };
		appendFeedLine(o, entry);
		if (o !== a) telegram(o, '\x01n\x01h' + authorAccount.alias + '\x01n wrote on your wall.\r\n');
		return { ok: true, post: entry };
	}

	/* The owner, the post's author, or a sysop may delete. */
	function deletePost(owner, id, by) {
		var o = userNumber(owner), b = userNumber(by);
		var all, i, target;
		if (!o || !b) return fail('no-such-user');
		all = readFeed(o);
		target = null;
		for (i = 0; i < all.length; i++) if (all[i].id === String(id)) target = all[i];
		if (!target) return fail('no-post');
		if (b !== o && b !== target.author && !currentUserIsSysop()) return fail('forbidden');
		appendFeedLine(o, { id: target.id, deleted: true, at: nowMs(), by: b });
		return { ok: true };
	}

	// ------------------------------------------------------------ creations (file base by uploader / composer)

	function creationKind(dirCode) {
		var code = String(dirCode || '').toLowerCase();
		if (/mp3s$/.test(code)) return 'track';
		if (/imgs$/.test(code)) return 'image';
		if (/_ansi$/.test(code)) return 'ansi';
		if (/textfiles$/.test(code)) return 'text';
		return 'art';
	}

	/* Directory codes that hold user-made things: every dir of the
	   OriginalContent and Artwork libraries. */
	function creationDirs() {
		var out = [];
		var libs, i, j, lib, name;
		try { libs = file_area.lib_list || []; } catch (e) { libs = []; }
		for (i = 0; i < libs.length; i++) {
			lib = libs[i];
			name = String(lib.name || '').toLowerCase();
			if (name !== 'originalcontent' && name !== 'artwork') continue;
			for (j = 0; j < (lib.dir_list || []).length; j++) out.push(lib.dir_list[j].code);
		}
		return out;
	}

	var overridesCache = null;
	function trackOverrides() {
		var f, all, i, out;
		if (overridesCache) return overridesCache;
		out = {};
		if (file_exists(trackOverridesPath)) {
			f = new File(trackOverridesPath);
			if (f.open('r')) {
				try { all = f.iniGetAllObjects('name') || []; } catch (e) { all = []; } finally { f.close(); }
				for (i = 0; i < all.length; i++) out[String(all[i].name).toLowerCase()] = all[i];
			}
		}
		overridesCache = out;
		return out;
	}

	// ---- track tags: the MP3's own ID3 title / artist / composer, cached ----
	//
	// The generator writes who asked for a track into TCOM (composer) and
	// fronts most tracks with the house bot in TPE1 ("Vektrax feat. Alias"),
	// so the composer is the owner and the lead artist is a collaborator.
	// Tags are read once per file (first 256K) and kept in
	// data/social/track-tags.json keyed by name, revalidated by size + mtime.

	var trackTagsPath = baseDir + 'track-tags.json';
	var TRACK_TAG_BYTES = 262144;
	var ID3_FIELDS = { TIT2: 'title', TPE1: 'artist', TCOM: 'composer' };
	var trackTagsCache = null;
	var trackTagsDirty = false;

	function byteAt(data, i) { return data.charCodeAt(i) & 0xff; }
	function synchsafe(data, i) {
		return ((byteAt(data, i) & 0x7f) << 21) | ((byteAt(data, i + 1) & 0x7f) << 14) | ((byteAt(data, i + 2) & 0x7f) << 7) | (byteAt(data, i + 3) & 0x7f);
	}
	function bigEndian32(data, i) {
		return (byteAt(data, i) << 24) | (byteAt(data, i + 1) << 16) | (byteAt(data, i + 2) << 8) | byteAt(data, i + 3);
	}

	/* One ID3v2 text frame body -> UTF-8 byte string, the form every other
	   name here has (uploader fields, chat handles, the link map), so the
	   fancy-Unicode nicks match and the JSON cache round-trips.
	   Encodings: 0 latin1, 1/2 UTF-16, 3 UTF-8. */
	function id3Text(frame) {
		var out = '';
		var enc, i, little, b1, b2, code, start;
		if (!frame || frame.length < 2) return '';
		enc = byteAt(frame, 0);
		if (enc === 1 || enc === 2) {
			little = enc === 1;
			start = 1;
			b1 = byteAt(frame, 1); b2 = byteAt(frame, 2);
			if (b1 === 0xff && b2 === 0xfe) { little = true; start = 3; }
			else if (b1 === 0xfe && b2 === 0xff) { little = false; start = 3; }
			for (i = start; i + 1 < frame.length; i += 2) {
				b1 = byteAt(frame, i); b2 = byteAt(frame, i + 1);
				code = little ? (b1 | (b2 << 8)) : ((b1 << 8) | b2);
				if (!code) break;
				out += String.fromCharCode(code);
			}
		} else {
			for (i = 1; i < frame.length; i++) {
				code = byteAt(frame, i);
				if (!code) break;
				out += String.fromCharCode(code);
			}
		}
		if (enc !== 3 && typeof utf8_encode === 'function') { try { out = utf8_encode(out); } catch (e) { } }
		return out.replace(/^\s+|\s+$/g, '');
	}

	function readId3(path) {
		var out = {};
		var f, data, major, flags, size, end, id, fsize, field;
		var pos = 10;
		f = new File(path);
		if (!f.open('rb')) return out;
		try { data = f.read(Math.min(f.length || TRACK_TAG_BYTES, TRACK_TAG_BYTES)) || ''; } catch (e) { data = ''; } finally { f.close(); }
		if (data.length < 10 || data.substr(0, 3) !== 'ID3') return out;
		major = byteAt(data, 3);
		flags = byteAt(data, 5);
		size = synchsafe(data, 6);
		if (flags & 0x40) pos += major >= 4 ? synchsafe(data, pos) : bigEndian32(data, pos);
		end = Math.min(10 + size, data.length);
		while (pos + 10 <= end) {
			id = data.substr(pos, 4);
			if (!id.length || !id.charCodeAt(0)) break;
			fsize = major >= 4 ? synchsafe(data, pos + 4) : bigEndian32(data, pos + 4);
			pos += 10;
			if (fsize <= 0 || pos + fsize > end) break;
			field = ID3_FIELDS[id];
			if (field && !out[field]) out[field] = id3Text(data.substr(pos, fsize));
			pos += fsize;
		}
		return out;
	}

	/* { title, artist, composer } straight from the file (cached). */
	function trackTags(name, path) {
		var key = String(name || '').toLowerCase();
		var size, mtime, hit, tags;
		if (!trackTagsCache) trackTagsCache = readJson(trackTagsPath) || {};
		if (!path || !file_exists(path)) return trackTagsCache[key] || {};
		size = file_size(path);
		mtime = file_date(path);
		hit = trackTagsCache[key];
		if (hit && hit.size === size && hit.mtime === mtime) return hit;
		tags = readId3(path);
		hit = { size: size, mtime: mtime, title: String(tags.title || ''), artist: String(tags.artist || ''), composer: String(tags.composer || '') };
		trackTagsCache[key] = hit;
		trackTagsDirty = true;
		return hit;
	}

	function flushTrackTags() {
		if (!trackTagsDirty || !trackTagsCache) return;
		trackTagsDirty = false;
		try { writeJsonAtomic(trackTagsPath, trackTagsCache); } catch (e) { }
	}

	/* On-disk path of a track by name, '' when no track dir holds it. */
	function trackPath(name) {
		var clean = String(name || '');
		var dirs, i, dir;
		if (!clean.length || /[\/\\\x00]/.test(clean)) return '';
		dirs = creationDirs();
		for (i = 0; i < dirs.length; i++) {
			if (creationKind(dirs[i]) !== 'track') continue;
			dir = file_area.dir[dirs[i]];
			if (dir && file_exists(dir.path + clean)) return dir.path + clean;
		}
		return '';
	}

	/* Credits for a track: the records overrides win field by field over the
	   file's own tags (the same precedence as the web files API). */
	function trackCredits(name, path) {
		var over = trackOverrides()[String(name || '').toLowerCase()] || {};
		var tags = trackTags(name, path || trackPath(name));
		return {
			title: String(over.title || '') || String(tags.title || ''),
			artist: String(over.artist || '') || String(tags.artist || ''),
			composer: String(over.composer || '') || String(tags.composer || '')
		};
	}

	/* "Vektrax feat. Cowboy & Hm Derdoc" -> { lead: 'Vektrax', featured: 'Cowboy & Hm Derdoc' }. */
	function splitArtist(artist) {
		var parts = String(artist || '').split(/\s*\b(?:feat\.?|ft\.?)\s*/i);
		return { lead: String(parts[0] || '').replace(/^\s+|\s+$/g, ''), featured: parts.slice(1).join(', ') };
	}

	/* "70s_Funk_hm_derdoc.mp3" is Hm Derdoc's: the stem ends in the alias. */
	function filenameCreditsAlias(name, alias) {
		var stem = String(name || '').replace(/\.[^.]+$/, '').toLowerCase();
		var variants = [];
		var a = String(alias || '').toLowerCase();
		var i, v;
		if (a.length < 4) return false;
		variants.push(a.replace(/[^a-z0-9]+/g, '_'));
		variants.push(a.replace(/[^a-z0-9]+/g, '-'));
		variants.push(a.replace(/[^a-z0-9]+/g, ''));
		for (i = 0; i < variants.length; i++) {
			v = variants[i];
			if (!v.length) continue;
			if (stem.length > v.length && stem.substr(stem.length - v.length) === v && /[_\-]/.test(stem.charAt(stem.length - v.length - 1))) return true;
		}
		return false;
	}

	/* Every name an account is known by: its alias plus each handle a sysop
	   linked to it (data/avatar_placeholders.json `links`), so a track the
	   generator credited to "mro1337" lands on Jas Hud's page. */
	function handlesForAccount(number) {
		var a = account(number);
		var out = [];
		var main, h;
		if (!a) return out;
		out.push(a.alias);
		loadPlaceholders();
		main = handleKey(a.alias);
		for (h in placeholderLinks) {
			if (placeholderLinks.hasOwnProperty(h) && placeholderLinks[h] === main) out.push(h);
		}
		return out;
	}

	/* Does a name (uploader field, credit) mean this account? Direct alias
	   or linked-handle match, else the full resolver (strips site tags). */
	function nameMeansAccount(name, number, handles) {
		var c = collapse(name);
		var i;
		if (!c.length) return false;
		for (i = 0; i < handles.length; i++) if (collapse(handles[i]) === c) return true;
		return resolveLocalUser(name, '') === number;
	}

	function creditListMeansAccount(list, number, handles) {
		var parts = String(list || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bx\b|\/)\s*/i);
		var i;
		for (i = 0; i < parts.length; i++) if (nameMeansAccount(parts[i], number, handles)) return true;
		return false;
	}

	function filenameCreditsHandles(name, handles) {
		var i;
		for (i = 0; i < handles.length; i++) if (filenameCreditsAlias(name, handles[i])) return true;
		return false;
	}

	/* How an account is tied to a file: { role, collab, collabWith } or null.
	   role: composer | featured | uploader | filename | artist. */
	function fileCredit(file, number, handles) {
		if (nameMeansAccount(file.from, number, handles)) return { role: 'uploader', collab: false, collabWith: '' };
		if (filenameCreditsHandles(file.name, handles)) return { role: 'filename', collab: false, collabWith: '' };
		return null;
	}

	/* Tracks, strongest tie first: composer, featured artist, uploader,
	   filename suffix. Those own the track. The lead artist alone is a
	   collaboration credit (the house bot fronts most tracks); it owns the
	   track only when none of the other fields names anyone. */
	function trackCredit(file, path, number, handles) {
		var credits = trackCredits(file.name, path);
		var artist = splitArtist(credits.artist);
		var owners;
		if (creditListMeansAccount(credits.composer, number, handles)) return { role: 'composer', collab: false, collabWith: '' };
		if (creditListMeansAccount(artist.featured, number, handles)) return { role: 'featured', collab: false, collabWith: '' };
		if (nameMeansAccount(file.from, number, handles)) return { role: 'uploader', collab: false, collabWith: '' };
		if (filenameCreditsHandles(file.name, handles)) return { role: 'filename', collab: false, collabWith: '' };
		if (!creditListMeansAccount(artist.lead, number, handles)) return null;
		owners = ownerNames(credits.composer || artist.featured || file.from || '');
		if (!owners.length) return { role: 'artist', collab: false, collabWith: '' };
		return { role: 'artist', collab: true, collabWith: owners };
	}

	/* "mro1337, Cowboy" -> "Jas Hud, Cowboy": each credited name as the local
	   alias it resolves to (so the tag names the member), else as written
	   minus control bytes. */
	function ownerNames(list) {
		var parts = String(list || '').split(/\s*(?:,|&|\band\b|\/)\s*/);
		var out = [];
		var i, name, n, a;
		for (i = 0; i < parts.length; i++) {
			name = String(parts[i] || '').replace(/[\x00-\x1f\x7f]/g, '').replace(/^\s+|\s+$/g, '');
			if (!name.length) continue;
			n = resolveLocalUser(name, '');
			a = n ? account(n) : null;
			if (a) name = a.alias;
			if (indexOf(out, name) === -1) out.push(name);
		}
		return out.join(', ');
	}

	/* Display metadata for a track: { title, artist, composer } (overrides, then the file's tags). */
	function trackMeta(name) {
		var credits = trackCredits(name, '');
		var stem = String(name || '').replace(/\.mp3$/i, '').replace(/_/g, ' ');
		flushTrackTags();
		return {
			title: credits.title || stem,
			artist: credits.artist,
			composer: credits.composer
		};
	}

	/* Files a user made: [{kind, dir, name, vpath, path, desc, size, added, from,
	   role, collab, collabWith}], newest first. `collab` marks a track the account
	   only fronts as lead artist while `collabWith` names its owner(s).
	   opts: { kind: filter, limit, collabs: false to leave collaborations out } */
	function creations(number, opts) {
		var a = account(number);
		var o = opts || {};
		var dirs, i, j, code, kind, fb, list, dir, out, file, handles, path, credit;
		if (!a) return [];
		handles = handlesForAccount(a.number);
		dirs = creationDirs();
		out = [];
		for (i = 0; i < dirs.length; i++) {
			code = dirs[i];
			kind = creationKind(code);
			if (o.kind && kind !== o.kind) continue;
			dir = file_area.dir[code];
			if (!dir) continue;
			fb = null;
			try {
				fb = new FileBase(code);
				if (!fb.open()) continue;
				list = fb.get_list('*', FileBase.DETAIL.NORM) || [];
			} catch (e) { list = []; } finally { try { if (fb) fb.close(); } catch (e2) { } }
			for (j = 0; j < list.length; j++) {
				file = list[j];
				if (!file || !file.name) continue;
				path = String(dir.path || '') + String(file.name);
				credit = kind === 'track' ? trackCredit(file, path, a.number, handles) : fileCredit(file, a.number, handles);
				if (!credit) continue;
				if (o.collabs === false && credit.collab) continue;
				out.push({
					kind: kind,
					dir: code,
					name: String(file.name),
					nsfw: kind === 'image' || kind === 'ansi' || kind === 'art' ? isNsfw(code, file.name, file.desc) : false,
					vpath: String(dir.lib_name || '') + '/' + String(dir.name || '') + '/' + String(file.name),
					path: path,
					desc: String(file.desc || ''),
					size: toNumber(file.size, 0),
					added: toNumber(file.added, 0),
					from: String(file.from || ''),
					role: credit.role,
					collab: credit.collab,
					collabWith: credit.collabWith
				});
			}
		}
		flushTrackTags();
		out.sort(function (x, y) { return y.added - x.added; });
		if (o.limit > 0 && out.length > o.limit) out.length = o.limit;
		return out;
	}

	/* Resolve a creation by dir code + file name to its on-disk path, but only
	   inside the creation dirs (never a way to read arbitrary files). */
	function creationPath(dirCode, name) {
		var code = String(dirCode || '').toLowerCase();
		var dir = file_area.dir[code];
		var clean = String(name || '');
		if (!dir || indexOf(creationDirs(), code) === -1) return '';
		if (!clean.length || /[\/\\\x00]/.test(clean) || clean === '.' || clean === '..') return '';
		return file_exists(dir.path + clean) ? dir.path + clean : '';
	}

	// ------------------------------------------------------------ NSFW tags (creations)

	/* data/social/nsfw.json
	     { version, moderatorArs: "FLAG1 M", keywords: [...],
	       manual: { "<dir>/<name lowercased>": { nsfw: true|false, by, at } } }
	   Auto-flagging matches whole words in the file name and description
	   (the AI generators name files after the prompt). Moderators can flag
	   a piece the keywords missed; nothing ever un-flags a piece. Viewers
	   blur / unblur flagged pieces for themselves, client side. */
	var nsfwPath = baseDir + 'nsfw.json';
	var NSFW_DEFAULT_KEYWORDS = ['nude', 'nudes', 'nudity', 'naked', 'nsfw', 'topless', 'sex', 'sexy', 'sexual', 'porn', 'porno',
		'xxx', 'erotic', 'erotica', 'boobs', 'breasts', 'tits', 'nipples', 'nipple', 'genitals', 'penis', 'vagina',
		'pussy', 'dick', 'cock', 'orgy', 'lingerie', 'thong', 'stripper', 'striptease', 'undressed', 'undressing'];
	var nsfwCache = null;
	var nsfwStamp = -1;

	function readNsfw() {
		var stamp = file_exists(nsfwPath) ? (file_date(nsfwPath) * 1000 + (file_size(nsfwPath) % 1000)) : 0;
		var data;
		if (nsfwCache && stamp === nsfwStamp) return nsfwCache;
		data = readJson(nsfwPath, 0) || {};
		if (typeof data !== 'object') data = {};
		if (Object.prototype.toString.call(data.keywords) !== '[object Array]' || !data.keywords.length) data.keywords = NSFW_DEFAULT_KEYWORDS.slice();
		if (!data.manual || typeof data.manual !== 'object') data.manual = {};
		if (typeof data.moderatorArs !== 'string') data.moderatorArs = 'FLAG1 M';
		data.version = VERSION;
		nsfwCache = data;
		nsfwStamp = stamp;
		return data;
	}

	function nsfwKey(dir, name) { return String(dir || '').toLowerCase() + '/' + String(name || '').toLowerCase(); }

	function nsfwKeywordHit(name, keywords) {
		var words = String(name || '').replace(/\.[^.]+$/, '').toLowerCase().split(/[^a-z0-9]+/);
		var i, j;
		for (i = 0; i < words.length; i++) {
			for (j = 0; j < keywords.length; j++) if (words[i] === String(keywords[j]).toLowerCase()) return String(keywords[j]);
		}
		return '';
	}

	/* { nsfw: bool, source: 'auto'|'manual'|'', keyword } */
	function nsfwInfo(dir, name, desc) {
		var data = readNsfw();
		var manual = data.manual[nsfwKey(dir, name)];
		var hit = nsfwKeywordHit(name, data.keywords) || (desc ? nsfwKeywordHit(String(desc).replace(/[^A-Za-z0-9]+/g, '_') + '.x', data.keywords) : '');
		if (hit) return { nsfw: true, source: 'auto', keyword: hit };
		/* Older files may hold nsfw:false entries: those are ignored. */
		if (manual && typeof manual === 'object' && manual.nsfw !== false) return { nsfw: true, source: 'manual', keyword: '' };
		return { nsfw: false, source: '', keyword: '' };
	}

	function isNsfw(dir, name, desc) { return nsfwInfo(dir, name, desc).nsfw; }

	/* The active keyword list (for clients that check names before render). */
	function nsfwKeywords() { return readNsfw().keywords.slice(); }

	/* Keyword check on any name / URL / caption (no manual overrides): the
	   generated images land in chat first, under the same file names. */
	function nsfwText(text) {
		var t = String(text || '');
		try { t = decodeURIComponent(t); } catch (e) { }
		// Whole words over the entire text: URL paths, query values, captions.
		return !!nsfwKeywordHit(t.replace(/[^A-Za-z0-9]+/g, '_') + '.x', readNsfw().keywords);
	}

	/* Sysops, plus anyone matching moderatorArs (default: FLAG1 M). */
	function canModerate() {
		var data = readNsfw();
		try {
			if (typeof user !== 'object' || user === null || !(user.number > 0)) return false;
			if (user.is_sysop) return true;
			return !!user.compare_ars(data.moderatorArs);
		} catch (e) { return false; }
	}

	/* Moderator: flag a piece (on must be true; flags are never removed). */
	function setNsfw(dir, name, on, by) {
		var key = nsfwKey(dir, name);
		if (!canModerate()) return fail('forbidden');
		if (on !== true) return fail('flags-are-permanent');
		if (!creationPath(dir, name)) return fail('no-such-file');
		return withLock(nsfwPath, function () {
			var data = readJson(nsfwPath, 0) || {};
			if (typeof data !== 'object') data = {};
			if (!data.manual || typeof data.manual !== 'object') data.manual = {};
			data.manual[key] = { nsfw: true, by: String(by || (typeof user === 'object' && user ? user.alias : '')).substr(0, 40), at: nowMs() };
			if (!data.keywords) data.keywords = NSFW_DEFAULT_KEYWORDS.slice();
			if (!data.moderatorArs) data.moderatorArs = 'FLAG1 M';
			data.version = VERSION;
			writeJsonAtomic(nsfwPath, data);
			nsfwCache = null;
			return { ok: true, info: nsfwInfo(dir, name) };
		});
	}

	// ------------------------------------------------------------ stats from neighbours

	function pointsBalance(number) {
		var n = userNumber(number);
		var data = n ? readJson(pointsDir + 'ledger_' + n + '.json', 0) : null;
		var balance = 0, lifetime = 0, i, d;
		if (data && Object.prototype.toString.call(data.entries) === '[object Array]') {
			for (i = 0; i < data.entries.length; i++) {
				d = toNumber(data.entries[i] && data.entries[i].delta, 0);
				balance += d;
				if (d > 0) lifetime += d;
			}
		}
		return { balance: balance, lifetime: lifetime };
	}

	function programName(code) {
		var prog = null;
		try { prog = xtrn_area.prog[String(code).toLowerCase()] || null; } catch (e) { prog = null; }
		return prog && prog.name ? String(prog.name) : String(code);
	}

	/* Most-played doors, all months merged: [{code, name, count, seconds, last}] */
	function topPrograms(number, limit) {
		var a = account(number);
		var data = a ? readJson(usagePath, 0) : null;
		var totals = {};
		var month, users, key, entry, code, prog, out;
		if (!data || typeof data !== 'object') return [];
		for (month in data) {
			if (!data.hasOwnProperty(month) || !data[month] || typeof data[month] !== 'object') continue;
			users = data[month].users || {};
			for (key in users) {
				if (!users.hasOwnProperty(key)) continue;
				entry = users[key];
				if (!entry || typeof entry !== 'object') continue;
				if (userNumber(entry.number) !== a.number && collapse(entry.alias || key) !== collapse(a.alias)) continue;
				for (code in (entry.programs || {})) {
					if (!entry.programs.hasOwnProperty(code)) continue;
					prog = entry.programs[code];
					if (!totals[code]) totals[code] = { code: code, name: programName(code), count: 0, seconds: 0, last: 0 };
					totals[code].count += toNumber(prog.count, 0);
					totals[code].seconds += toNumber(prog.seconds, 0);
					totals[code].last = Math.max(totals[code].last, toNumber(prog.lastTimestamp, 0));
				}
			}
		}
		out = [];
		for (code in totals) if (totals.hasOwnProperty(code)) out.push(totals[code]);
		out.sort(function (x, y) { return (y.seconds - x.seconds) || (y.count - x.count); });
		if (limit > 0 && out.length > limit) out.length = limit;
		return out;
	}

	/* Same rules as xtrn/wiki slug.ts + permissions.userPageSlug. */
	function wikiUserPageSlug(alias) {
		var s = String(alias || '').toLowerCase();
		s = s.replace(/[ _]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
		if (s.length > 64) s = s.substr(0, 64).replace(/-+$/, '');
		return s === '' ? '' : 'user-' + s;
	}

	/* Head revision of the user's wiki page: { slug, exists, rev, time, title, body }. */
	function wikiPage(number) {
		var a = account(number);
		var slug = a ? wikiUserPageSlug(a.alias) : '';
		var empty = { slug: slug, exists: false, rev: 0, time: 0, title: '', body: '' };
		var raw, lines, i, head, line;
		if (!slug) return empty;
		raw = readText(wikiPagesDir + slug + '.jsonl', 1 << 20);
		if (!raw.length) return empty;
		lines = raw.split('\n');
		head = null;
		for (i = lines.length - 1; i >= 0 && !head; i--) {
			line = lines[i].replace(/\r$/, '');
			if (!line.replace(/\s+/g, '').length) continue;
			try { head = JSON.parse(line); } catch (e) { head = null; }
		}
		if (!head || head.deleted === true) return empty;
		return { slug: slug, exists: true, rev: toNumber(head.rev, 0), time: toNumber(head.time, 0), title: String(head.title || ''), body: String(head.body || '') };
	}

	/* Wiki markup lightly stripped to plain lines (for terminal previews). */
	function plainLines(markup, maxLines) {
		var body = String(markup || '')
			.replace(/\x01./g, '')
			.replace(/!\[[a-z]*\]\([^)]*\)/gi, '')
			.replace(/\{[^}]{1,10}\}/g, '')
			.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
			.replace(/^#+\s*/gm, '')
			.replace(/[`*_]/g, '');
		var parts = body.split('\n');
		var out = [];
		var i, line;
		for (i = 0; i < parts.length && (maxLines <= 0 || out.length < maxLines); i++) {
			line = parts[i].replace(/\s+$/, '');
			if (line.length || (out.length && out[out.length - 1].length)) out.push(line);
		}
		return out;
	}

	// ------------------------------------------------------------ forum activity

	var FORUM_PAGE_DEFAULT = 10;
	var FORUM_PAGE_MAX = 50;
	var FORUM_SNIPPET_CHARS = 200;
	var FORUM_BODY_MAX = 64 * 1024;
	var FORUM_ATTR_PRIVATE = typeof MSG_PRIVATE === 'number' ? MSG_PRIVATE : (1 << 0);
	var FORUM_ATTR_DELETE = typeof MSG_DELETE === 'number' ? MSG_DELETE : (1 << 5);
	var FORUM_ATTR_POLL = typeof MSG_POLL === 'number' ? MSG_POLL : 0;

	/* Names whose posts count as this account's: the alias and every chat
	   handle the sysop linked to it, on any BBS (a networked post carries the
	   alias, not the account); the real name only for posts made here. */
	function forumNames(number) {
		var handles = handlesForAccount(number);
		var out = { any: {}, local: {}, crcs: {} };
		var i, key, real;
		for (i = 0; i < handles.length; i++) {
			key = String(handles[i]).replace(/\s+$/, '').toLowerCase();
			if (!key.length || out.any[key]) continue;
			out.any[key] = true;
			out.crcs[crc16_calc(key)] = true;
		}
		try {
			real = new User(number).name;
			key = String(real || '').replace(/\s+$/, '').toLowerCase();
			if (key.length && !out.any[key]) { out.local[key] = true; out.crcs[crc16_calc(key)] = true; }
		} catch (e) { }
		return out;
	}

	function forumNetType(settings) {
		var s = toNumber(settings, 0);
		if (typeof SUB_FIDO !== 'undefined' && (s & SUB_FIDO)) return 'fidonet';
		if (typeof SUB_QNET !== 'undefined' && (s & SUB_QNET)) return 'qwknet';
		if (typeof SUB_INET !== 'undefined' && (s & SUB_INET)) return 'internet';
		if (typeof SUB_PNET !== 'undefined' && (s & SUB_PNET)) return 'postlink';
		return 'local';
	}

	/* Machine channels (avatar/data exchange subs) are not forum activity. */
	function forumSkipSub(code, s) {
		if (/syncdata|sync-data|_data$|-data$/i.test(String(code || ''))) return true;
		return /synchronet data|user avatars/i.test(String(s && s.name || ''));
	}

	/* The from-name check behind the index CRC hit (CRC-16 collides now and then). */
	function forumHeaderIsBy(header, names) {
		var key = String(header.from || '').replace(/\s+$/, '').toLowerCase();
		if (!key.length) return false;
		if (names.any[key]) return true;
		return !!names.local[key] && !(toNumber(header.from_net_type, 0) > 0);
	}

	/* Message text with colour codes, ANSI, quotes, tearlines and origin lines
	   removed: what a snippet or a plain body shows. */
	function forumPlainBody(raw) {
		var text = String(raw || '').replace(/\r\n?/g, '\n');
		var lines = text.split('\n');
		var out = [];
		var i, line;
		text = null;
		for (i = 0; i < lines.length; i++) {
			line = lines[i].replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x01./g, '').replace(/[\x00-\x08\x0b-\x1f]/g, '');
			if (/^\s*(?:[A-Za-z0-9]{0,3}>)/.test(line)) continue;
			if (/^--- /.test(line) || /^\s*\* Origin:/.test(line) || /^-- $/.test(line) || /^\.\.\. /.test(line)) continue;
			/* Quote preambles: "  Re: Subject" + "  By: X to Y on <date>", "On <date>, X wrote:". */
			if (/^\s*By:\s.+\son\s/.test(line)) { while (out.length && /^\s*Re:/i.test(out[out.length - 1])) out.pop(); continue; }
			if (/wrote:\s*$/.test(line) || /^\s*Re:\s.*\sBy:\s/i.test(line)) continue;
			out.push(line.replace(/\s+$/, ''));
		}
		while (out.length && !out[0].length) out.shift();
		while (out.length && !out[out.length - 1].length) out.pop();
		return out.join('\n').replace(/\n{3,}/g, '\n\n');
	}

	/* Block/box-drawing cells (CP437 0xB0-0xDF) are art, not words: an ANSI
	   post's snippet keeps whatever readable text it has and says it is art. */
	function forumSnippet(raw) {
		var plain = forumPlainBody(raw);
		var art = /\x1b\[/.test(String(raw || '')) || /[\xb0-\xdf]{8,}/.test(plain);
		plain = plain.replace(/[\xb0-\xdf]+/g, ' ').replace(/\s+/g, ' ').replace(/^\s+/, '');
		if (plain.length > FORUM_SNIPPET_CHARS) plain = plain.substr(0, FORUM_SNIPPET_CHARS - 3).replace(/\s+\S*$/, '') + '...';
		if (art) plain = '[ANSI art] ' + plain;
		return plain.replace(/\s+$/, '');
	}

	function forumItem(code, header, withSnippet, body) {
		var s = msg_area.sub[code];
		var at = toNumber(header.when_written_time, 0) * 1000;
		var item = {
			sub: code,
			subName: s ? String(s.name || code) : code,
			group: s ? String(s.grp_name || '') : '',
			netType: forumNetType(s ? s.settings : 0),
			origin: String(header.from_net_addr || ''),
			number: toNumber(header.number, 0),
			id: String(header.id || ''),
			thread: toNumber(header.thread_id, 0) || toNumber(header.number, 0),
			at: at,
			from: String(header.from || ''),
			to: String(header.to || ''),
			subject: String(header.subject || ''),
			snippet: '',
			art: /\x1b\[/.test(String(body || '')),
			poll: !!(toNumber(header.attr, 0) & FORUM_ATTR_POLL)
		};
		if (withSnippet) item.snippet = forumSnippet(body);
		return item;
	}

	function forumReadBody(mb, number) {
		var body = '';
		try { body = mb.get_msg_body(false, number, true, false, true, true) || ''; } catch (e) { body = ''; }
		if (body.length > FORUM_BODY_MAX) body = body.substr(0, FORUM_BODY_MAX);
		return body;
	}

	/* Every readable post by the account, newest first, as {sub, number, at}.
	   One get_index() pass per sub (the whole board takes tens of ms), then a
	   header read per CRC hit to confirm the name. */
	function forumMatches(number, viewer) {
		var names = forumNames(number);
		var out = [];
		var code, s, mb, idx, i, hits, h, header, ownPage;
		ownPage = userNumber(viewer) === number;
		for (code in msg_area.sub) {
			if (!msg_area.sub.hasOwnProperty(code)) continue;
			s = msg_area.sub[code];
			if (forumSkipSub(code, s)) continue;
			try { if (!s.can_read) continue; } catch (e) { continue; }
			hits = [];
			try {
				mb = new MsgBase(code);
				if (!mb.open()) continue;
				idx = mb.get_index() || [];
				for (i = 0; i < idx.length; i++) {
					if (typeof idx[i].from !== 'number') continue;
					if (idx[i].attr & FORUM_ATTR_DELETE) continue;
					if (!names.crcs[idx[i].from]) continue;
					if ((idx[i].attr & FORUM_ATTR_PRIVATE) && !ownPage) continue;
					hits.push(idx[i].number);
				}
				idx = null;
				for (h = 0; h < hits.length; h++) {
					header = mb.get_msg_header(false, hits[h], false);
					if (!header || (header.attr & FORUM_ATTR_DELETE) || !forumHeaderIsBy(header, names)) continue;
					out.push({ sub: code, number: header.number, at: toNumber(header.when_written_time, 0), subject: String(header.subject || '') });
				}
				mb.close();
			} catch (e) { try { mb.close(); } catch (e2) { } }
		}
		out.sort(function (x, y) { return y.at - x.at || y.number - x.number; });
		return out;
	}

	/* One page of the account's posts across every sub the viewer may read,
	   newest first: { total, page, per, pages, items }. Each item carries the
	   sub/group/network, recipient, subject, a plain-text snippet and the
	   thread root for deep links. */
	/* "[ANSI] futureland.today": the tag auto-posted ads and art drops carry. */
	var FORUM_ANSI_SUBJECT = /\[ANSI\]/i;

	function forumActivity(number, viewer, opts) {
		var n = userNumber(number);
		var o = opts || {};
		var per = Math.max(1, Math.min(FORUM_PAGE_MAX, toNumber(o.per, FORUM_PAGE_DEFAULT)));
		var page = Math.max(0, toNumber(o.page, 0));
		var result = { total: 0, page: page, per: per, pages: 0, items: [], hiddenAnsi: 0 };
		var all, slice, bySub, i, code, mb, header, j, kept;
		if (!n || !account(n)) return result;
		all = forumMatches(n, viewer);
		/* opts.hideAnsi: leave out posts tagged [ANSI] in the subject (ads and
		   art drops), so a profile shows what they actually wrote. */
		if (o.hideAnsi) {
			kept = [];
			for (i = 0; i < all.length; i++) {
				if (FORUM_ANSI_SUBJECT.test(all[i].subject)) result.hiddenAnsi++;
				else kept.push(all[i]);
			}
			all = kept;
		}
		result.total = all.length;
		result.pages = Math.ceil(all.length / per);
		if (page >= result.pages) { result.page = page = Math.max(0, result.pages - 1); }
		slice = all.slice(page * per, page * per + per);
		bySub = {};
		for (i = 0; i < slice.length; i++) {
			if (!bySub[slice[i].sub]) bySub[slice[i].sub] = [];
			bySub[slice[i].sub].push(i);
		}
		for (code in bySub) {
			if (!bySub.hasOwnProperty(code)) continue;
			try {
				mb = new MsgBase(code);
				if (!mb.open()) continue;
				for (j = 0; j < bySub[code].length; j++) {
					i = bySub[code][j];
					header = mb.get_msg_header(false, slice[i].number, false);
					if (!header) continue;
					slice[i] = forumItem(code, header, true, forumReadBody(mb, slice[i].number));
				}
				mb.close();
			} catch (e) { try { mb.close(); } catch (e2) { } }
		}
		for (i = 0; i < slice.length; i++) if (slice[i].subject !== undefined) result.items.push(slice[i]);
		return result;
	}

	/* One post in full (plain text body) for the expand control; null when
	   the viewer may not read that sub or the message is gone. */
	function forumPost(code, number) {
		var s = msg_area.sub[String(code || '')];
		var mb, header, item;
		if (!s) return null;
		try { if (!s.can_read) return null; } catch (e) { return null; }
		try {
			mb = new MsgBase(s.code);
			if (!mb.open()) return null;
			header = mb.get_msg_header(false, toNumber(number, 0), false);
			if (!header || (header.attr & FORUM_ATTR_DELETE)) { mb.close(); return null; }
			item = forumItem(s.code, header, false, '');
			item.body = forumPlainBody(forumReadBody(mb, header.number));
			mb.close();
			return item;
		} catch (e) { try { mb.close(); } catch (e2) { } return null; }
	}

	// ------------------------------------------------------------ composite summary

	/* Everything a profile page needs except the heavy lists. `viewer` is the
	   account looking (0 = anonymous). */
	function summary(number, viewer) {
		var a = account(number);
		var v = userNumber(viewer);
		var p, friends, featured, i, fa, page, updates, creationsList, counts, k, incoming;
		if (!a) return null;
		p = profile(a.number);
		friends = friendList(a.number);
		featured = [];
		for (i = 0; i < p.featured.length; i++) {
			fa = account(p.featured[i]);
			if (fa && isFriend(a.number, fa.number)) featured.push({ number: fa.number, alias: fa.alias, online: onlineNode(fa.number) });
		}
		if (!featured.length) {
			for (i = 0; i < friends.length && featured.length < MAX_FEATURED; i++) featured.push(friends[i]);
		}
		page = wikiPage(a.number);
		updates = feed(a.number, { kind: 'update', limit: 1 });
		creationsList = creations(a.number, {});
		counts = { total: 0, collab: 0, track: 0, ansi: 0, image: 0, text: 0, art: 0 };
		for (i = 0; i < creationsList.length; i++) {
			if (creationsList[i].collab) { counts.collab++; continue; }
			k = creationsList[i].kind;
			counts.total++;
			counts[k] = (counts[k] || 0) + 1;
		}
		incoming = v && v === a.number ? incomingRequests(v).length : 0;
		return {
			number: a.number,
			alias: a.alias,
			location: a.location,
			firstOn: a.firstOn,
			lastOn: a.lastOn,
			logons: a.logons,
			timeOnMinutes: a.timeOnMinutes,
			posts: a.posts,
			uploads: a.uploads,
			downloads: a.downloads,
			online: onlineNode(a.number),
			profile: p,
			relation: v ? relation(v, a.number) : 'none',
			friends: friends,
			friendCount: friends.length,
			featured: featured,
			pendingIncoming: incoming,
			points: pointsBalance(a.number),
			topPrograms: topPrograms(a.number, 5),
			about: { slug: page.slug, exists: page.exists, rev: page.rev, time: page.time, title: page.title, preview: plainLines(page.body, 8) },
			latestUpdate: updates.length ? updates[0] : null,
			creationCounts: counts,
			wallCount: feed(a.number, { kind: 'wall' }).length,
			updateCount: feed(a.number, { kind: 'update' }).length,
			nickStyle: nickStyleFor(a.number, a.alias)
		};
	}

	/* The member's chat handle style (mods/load/chat_style_lib.js) aligned to
	   their alias, so both profile pages paint the name the way chat does.
	   null when they set none or the lib is missing. */
	var chatStyleLib;
	function nickStyleFor(number, alias) {
		var style;
		if (chatStyleLib === undefined) {
			try { chatStyleLib = load({}, system.mods_dir + 'load/chat_style_lib.js').getChatStyle(); } catch (e) { chatStyleLib = null; }
		}
		if (!chatStyleLib) return null;
		try { style = chatStyleLib.forName(number, alias); } catch (e2) { return null; }
		return style && style.styled ? style : null;
	}

	return {
		VERSION: VERSION,
		MAX_FEATURED: MAX_FEATURED,
		MAX_POST_CHARS: MAX_POST_CHARS,
		MAX_HEADLINE: MAX_HEADLINE,
		MAX_MOOD: MAX_MOOD,
		THEME_PRESETS: THEME_PRESETS,
		WALL_POLICIES: WALL_POLICIES,
		// accounts + resolver
		account: account,
		aliasOf: aliasOf,
		localUserByAlias: localUserByAlias,
		onlineNode: onlineNode,
		handleForms: handleForms,
		resolveLocalUser: resolveLocalUser,
		isNotLocal: isNotLocal,
		setNotLocal: setNotLocal,
		linkedTo: linkedTo,
		placeholderInfo: placeholderInfo,
		setPlaceholder: setPlaceholder,
		clearPlaceholder: clearPlaceholder,
		linkHandle: linkHandle,
		ignoreList: ignoreList,
		isIgnored: isIgnored,
		setIgnored: setIgnored,
		// friends
		friendsOf: friendsOf,
		friendList: friendList,
		isFriend: isFriend,
		isFriendHandle: isFriendHandle,
		relation: relation,
		incomingRequests: incomingRequests,
		outgoingRequests: outgoingRequests,
		requestFriend: requestFriend,
		acceptRequest: acceptRequest,
		declineRequest: declineRequest,
		cancelRequest: cancelRequest,
		unfriend: unfriend,
		// profile
		profile: profile,
		saveProfile: saveProfile,
		recordView: recordView,
		// feed
		feed: feed,
		post: post,
		deletePost: deletePost,
		canPostWall: canPostWall,
		// creations + neighbours
		creations: creations,
		creationPath: creationPath,
		handlesForAccount: handlesForAccount,
		trackMeta: trackMeta,
		nsfwInfo: nsfwInfo,
		isNsfw: isNsfw,
		nsfwKeywords: nsfwKeywords,
		nsfwText: nsfwText,
		setNsfw: setNsfw,
		canModerate: canModerate,
		creationDirs: creationDirs,
		pointsBalance: pointsBalance,
		topPrograms: topPrograms,
		wikiPage: wikiPage,
		wikiUserPageSlug: wikiUserPageSlug,
		plainLines: plainLines,
		forumActivity: forumActivity,
		forumPost: forumPost,
		forumPlainBody: forumPlainBody,
		summary: summary,
		currentUserNumber: currentUserNumber
	};
}());

/* load(scope, file) callers (the fshell_ts runtime) get the API from this
   function: a top-level `var` does not always land on a private load scope,
   a top-level function declaration does. load(file) callers use `Social`. */
function getSocial() { return Social; }
try { if (typeof this === 'object' && this !== null && this.Social === undefined) this.Social = Social; } catch (e) { }

/* load(scope, file) returns the last expression: hand the scope back. */
this;
