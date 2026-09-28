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

	/* Plain text for a post / headline: no control bytes except newline,
	   Ctrl-A dropped (it would re-colour a terminal). Pipe colour codes are
	   left in place: both renderers already understand them. */
	function cleanText(value, max, multiline) {
		var s = String(value === undefined || value === null ? '' : value)
			.replace(/\r\n?/g, '\n')
			.replace(multiline ? /[\x00-\x09\x0b-\x1f\x7f]/g : /[\x00-\x1f\x7f]/g, '');
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
			theme: { preset: 'classic', accent: '', background: '', text: '', link: '' },
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
		p.theme.preset = indexOf(THEME_PRESETS, String(theme.preset)) !== -1 ? String(theme.preset) : 'classic';
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
		if (!n) return defaultProfile(0);
		return normalizeProfile(n, readJson(profilePath(n), 0));
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

	function contributorMatches(list, alias) {
		var target = collapse(alias);
		var parts = String(list || '').split(/\s*(?:,|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bx\b|\/)\s*/i);
		var i;
		if (!target.length) return false;
		for (i = 0; i < parts.length; i++) if (collapse(parts[i]) === target) return true;
		return false;
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

	function fileCreditsAlias(file, dirCode, alias) {
		var target = collapse(alias);
		var over;
		if (!target.length) return false;
		if (collapse(file.from) === target) return true;
		if (filenameCreditsAlias(file.name, alias)) return true;
		if (creationKind(dirCode) === 'track') {
			over = trackOverrides()[String(file.name).toLowerCase()];
			if (over && (contributorMatches(over.composer, alias) || contributorMatches(over.artist, alias))) return true;
		}
		return false;
	}

	/* Display metadata for a track from the records overrides: { title, artist, composer }. */
	function trackMeta(name) {
		var over = trackOverrides()[String(name || '').toLowerCase()] || {};
		var stem = String(name || '').replace(/\.mp3$/i, '').replace(/_/g, ' ');
		return {
			title: String(over.title || '') || stem,
			artist: String(over.artist || ''),
			composer: String(over.composer || '')
		};
	}

	/* Files a user made: [{kind, dir, name, vpath, path, desc, size, added, from}], newest first.
	   opts: { kind: filter, limit } */
	function creations(number, opts) {
		var a = account(number);
		var o = opts || {};
		var dirs, i, j, code, fb, list, dir, out, file;
		if (!a) return [];
		dirs = creationDirs();
		out = [];
		for (i = 0; i < dirs.length; i++) {
			code = dirs[i];
			if (o.kind && creationKind(code) !== o.kind) continue;
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
				if (!fileCreditsAlias(file, code, a.alias)) continue;
				out.push({
					kind: creationKind(code),
					dir: code,
					name: String(file.name),
					vpath: String(dir.lib_name || '') + '/' + String(dir.name || '') + '/' + String(file.name),
					path: String(dir.path || '') + String(file.name),
					desc: String(file.desc || ''),
					size: toNumber(file.size, 0),
					added: toNumber(file.added, 0),
					from: String(file.from || '')
				});
			}
		}
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
		counts = { total: creationsList.length, track: 0, ansi: 0, image: 0, text: 0, art: 0 };
		for (i = 0; i < creationsList.length; i++) { k = creationsList[i].kind; counts[k] = (counts[k] || 0) + 1; }
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
			updateCount: feed(a.number, { kind: 'update' }).length
		};
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
		trackMeta: trackMeta,
		creationDirs: creationDirs,
		pointsBalance: pointsBalance,
		topPrograms: topPrograms,
		wikiPage: wikiPage,
		wikiUserPageSlug: wikiUserPageSlug,
		plainLines: plainLines,
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
