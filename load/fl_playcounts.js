/* fl_playcounts.js - shared MP3 play-count store for Futureland Records
 *
 * Consumers: the web radio (webv4_custom root/api/files.ssjs) and the
 * fl_records terminal door. Load with an absolute path so neither side
 * depends on the load() search order:
 *
 *     load(system.mods_dir + 'load/fl_playcounts.js');
 *
 * What counts as a play: the listener heard at least MIN_LISTEN_SEC of the
 * track in one sitting (paused time never counts), or 90% of a track that is
 * shorter than that. Clients report listened/duration seconds and the store
 * applies the rule, so both players share one definition.
 *
 * Store: data/futureland-records/play-counts.json
 *   { version: 1,
 *     tracks: { "<lowercased filename>": { name, plays, last_played, sources: { web: n, door: n } } },
 *     recent: { "<user>|<lowercased filename>": <unix time> } }   // per-user throttle, pruned daily
 *
 * Writes go through a mkdir() lock plus write-temp-then-rename, so a web
 * request and a door node counting at the same moment cannot clobber each
 * other or leave a half-written file behind.
 */
var FLPlayCounts = (function () {
	'use strict';

	var VERSION = 1;
	var MIN_LISTEN_SEC = 30;
	var SHORT_TRACK_FRACTION = 0.9;
	var THROTTLE_SEC = 30;          // same user + same track cannot count twice inside this window
	var RECENT_KEEP_SEC = 86400;    // throttle memory
	var LOCK_WAIT_MS = 1500;
	var LOCK_STALE_SEC = 10;

	var storePath = system.data_dir + 'futureland-records/play-counts.json';

	function keyFor(name) {
		return String(name || '').toLowerCase();
	}

	function toNumber(value, fallback) {
		var n = Number(value);
		return isFinite(n) ? n : fallback;
	}

	// Seconds a listener must hear before a play counts.
	function thresholdSec(durationSec) {
		var d = toNumber(durationSec, 0);
		if (d <= 0) return MIN_LISTEN_SEC;
		return Math.min(MIN_LISTEN_SEC, Math.max(1, d * SHORT_TRACK_FRACTION));
	}

	function qualifies(listenedSec, durationSec) {
		return toNumber(listenedSec, 0) >= thresholdSec(durationSec);
	}

	function emptyStore() {
		return { version: VERSION, tracks: {}, recent: {} };
	}

	function dirOf(path) {
		var slash = path.lastIndexOf('/');
		return slash > 0 ? path.substring(0, slash + 1) : '';
	}

	function ensureDir() {
		var dir = dirOf(storePath);
		if (dir.length && !file_exists(dir)) {
			try { mkpath(dir); } catch (e) { }
		}
	}

	function readStore() {
		var f, raw, data;
		if (!file_exists(storePath)) return emptyStore();
		f = new File(storePath);
		if (!f.open('r')) return emptyStore();
		try {
			raw = f.read();
		} finally {
			f.close();
		}
		try {
			data = JSON.parse(raw);
		} catch (e) {
			data = null;
		}
		if (!data || typeof data !== 'object') return emptyStore();
		if (!data.tracks || typeof data.tracks !== 'object') data.tracks = {};
		if (!data.recent || typeof data.recent !== 'object') data.recent = {};
		data.version = VERSION;
		return data;
	}

	function writeStore(data) {
		var tmp = storePath + '.tmp' + Math.floor(Math.random() * 1000000000);
		var f;
		ensureDir();
		f = new File(tmp);
		if (!f.open('w+')) throw new Error('Could not write ' + tmp);
		try {
			f.write(JSON.stringify(data, null, 1));
		} finally {
			f.close();
		}
		if (!file_rename(tmp, storePath)) {
			try { file_remove(tmp); } catch (e) { }
			throw new Error('Could not replace ' + storePath);
		}
	}

	function acquireLock() {
		var lock = storePath + '.lock';
		var started = Date.now();
		var stamp;
		ensureDir();
		for (;;) {
			if (mkdir(lock)) return lock;
			stamp = file_date(lock);
			if (stamp > 0 && time() - stamp > LOCK_STALE_SEC) {
				rmdir(lock);   // a crashed writer left it behind
				continue;
			}
			if (Date.now() - started > LOCK_WAIT_MS) return null;
			mswait(20);
		}
	}

	function releaseLock(lock) {
		if (lock) {
			try { rmdir(lock); } catch (e) { }
		}
	}

	function pruneRecent(recent, now) {
		var keys = Object.keys(recent);
		var i;
		for (i = 0; i < keys.length; i++) {
			if (now - toNumber(recent[keys[i]], 0) > RECENT_KEEP_SEC) delete recent[keys[i]];
		}
	}

	function entryView(key, entry) {
		return {
			name: entry && entry.name ? String(entry.name) : key,
			plays: entry ? toNumber(entry.plays, 0) : 0,
			last_played: entry ? toNumber(entry.last_played, 0) : 0,
			sources: entry && entry.sources && typeof entry.sources === 'object' ? entry.sources : {}
		};
	}

	// Map of lowercased filename -> { name, plays, last_played, sources }.
	function counts() {
		var data = readStore();
		var out = {};
		var keys = Object.keys(data.tracks);
		var i;
		for (i = 0; i < keys.length; i++) out[keys[i]] = entryView(keys[i], data.tracks[keys[i]]);
		return out;
	}

	function forTrack(name) {
		var data = readStore();
		var key = keyFor(name);
		return entryView(key, data.tracks[key]);
	}

	// Ranked list, most played first (ties: most recently played first).
	// `filter(name) -> bool` lets callers drop tracks no longer in the catalog.
	function top(limit, filter) {
		var all = counts();
		var keys = Object.keys(all);
		var list = [];
		var i;
		for (i = 0; i < keys.length; i++) {
			if (all[keys[i]].plays <= 0) continue;
			if (typeof filter === 'function' && !filter(all[keys[i]].name)) continue;
			list.push(all[keys[i]]);
		}
		list.sort(function (a, b) {
			return (b.plays - a.plays) || (b.last_played - a.last_played) || (a.name < b.name ? -1 : 1);
		});
		if (limit > 0 && list.length > limit) list.length = limit;
		return list;
	}

	// Count one play of `name`. opts:
	//   source   'web' | 'door' (anything, used for the per-source breakdown)
	//   user     user number/alias for the throttle ('' = no throttle)
	//   listened seconds actually heard; omit to skip the threshold check
	//   duration track length in seconds (short-track rule)
	// Returns { counted, plays, last_played, reason? }.
	function record(name, opts) {
		var key = keyFor(name);
		var source, who, now, lock, data, entry, rk;
		opts = opts || {};
		source = String(opts.source || 'unknown');
		who = (opts.user === undefined || opts.user === null) ? '' : String(opts.user);
		if (!key.length) return { counted: false, plays: 0, last_played: 0, reason: 'no-track' };
		if (opts.listened !== undefined && !qualifies(opts.listened, opts.duration)) {
			return { counted: false, plays: forTrack(name).plays, last_played: 0, reason: 'too-short' };
		}
		lock = acquireLock();
		if (!lock) return { counted: false, plays: forTrack(name).plays, last_played: 0, reason: 'locked' };
		try {
			data = readStore();
			now = time();
			if (who.length) {
				rk = who + '|' + key;
				if (data.recent[rk] && now - toNumber(data.recent[rk], 0) < THROTTLE_SEC) {
					return { counted: false, plays: entryView(key, data.tracks[key]).plays, last_played: 0, reason: 'throttled' };
				}
				data.recent[rk] = now;
				pruneRecent(data.recent, now);
			}
			entry = data.tracks[key];
			if (!entry || typeof entry !== 'object') {
				entry = { name: String(name), plays: 0, last_played: 0, sources: {} };
				data.tracks[key] = entry;
			}
			if (!entry.sources || typeof entry.sources !== 'object') entry.sources = {};
			entry.name = String(name);
			entry.plays = toNumber(entry.plays, 0) + 1;
			entry.last_played = now;
			entry.sources[source] = toNumber(entry.sources[source], 0) + 1;
			writeStore(data);
			return { counted: true, plays: entry.plays, last_played: now };
		} finally {
			releaseLock(lock);
		}
	}

	// Forget a track (used when a track is deleted from the library).
	function remove(name) {
		var key = keyFor(name);
		var lock = acquireLock();
		var data;
		if (!lock) return false;
		try {
			data = readStore();
			if (!data.tracks[key]) return false;
			delete data.tracks[key];
			writeStore(data);
			return true;
		} finally {
			releaseLock(lock);
		}
	}

	// Tests point the store somewhere harmless.
	function configure(opts) {
		if (opts && opts.path) storePath = String(opts.path);
	}

	return {
		MIN_LISTEN_SEC: MIN_LISTEN_SEC,
		THROTTLE_SEC: THROTTLE_SEC,
		keyFor: keyFor,
		thresholdSec: thresholdSec,
		qualifies: qualifies,
		counts: counts,
		forTrack: forTrack,
		top: top,
		record: record,
		remove: remove,
		configure: configure,
		get path() { return storePath; }
	};
})();
