// sbbs/mods/future_api/routes/points.js
//
// Points ledger API for FUTURE_API.
// Interfaces with the BBS points system (see xtrn/points_leader, xtrn/points_admin).
//
// Ledger storage (shared with the points_* doors):
//   data/points/ledger_<userNumber>.json
//   { entries: [ { timestamp, delta, source, note?, adjustedBy? } ], ... }
// Balance is the running sum of all deltas; lifetime is the sum of positive deltas.
// Entries are append-only -- we never edit or delete existing entries.
//
// Endpoints:
//   points/balance/:user   (READ)  - Check a user's balance.            (no secret)
//   points/balance         (READ)  - same, with { user } in data.       (no secret)
//   points/add             (WRITE) - Add points to a user.              (secret required)
//   points/remove          (WRITE) - Remove points from a user.         (secret required)
//   points/transfer        (WRITE) - Move points from one user to another. (secret required)
//
// :user (and the "user"/"from"/"to" fields) accept either a user number or an alias.
//
// Write authorization:
//   add/remove/transfer require an "secret" field in the request data that matches
//   the secret configured in   data/future_api_points.json   -> { "secret": "..." }
//   If that file is absent or has no secret, the write routes FAIL CLOSED
//   (error: "points_api_not_configured") so points can never be minted/destroyed
//   over an unconfigured API. The balance (READ) route never requires the secret.
//   To configure, create the file (outside the mods repo so it isn't committed):
//     echo '{"secret":"<a-long-random-string>"}' > <data>/future_api_points.json
//
// Concurrency: this matches the existing points doors (load-modify-save, no file
// locking). The FUTURE_API service handles one packet at a time, so API calls do
// not race each other; the only window is against a points door writing the same
// ledger at the same instant -- the same window the doors already have with each other.

"use strict";

// USER_DELETED comes from userdefs.js (via sbbsdefs.js), not the built-in global
// scope -- load it defensively so this route doesn't depend on another route
// having loaded it first.
if (typeof USER_DELETED === "undefined") {
	try { load("sbbsdefs.js"); } catch (e) { }
}
var USER_DELETED_FLAG = (typeof USER_DELETED !== "undefined") ? USER_DELETED : 0x8000;

var ROUTE_NAME = "points";
var LEDGER_DIR = system.data_dir + "points/";
var SECRET_FILE = system.data_dir + "future_api_points.json";

// --- Ledger storage helpers (mirrors xtrn/points_admin/points_admin.js) ---

function pointsLoadJSON(filepath) {
	var f = new File(filepath);
	if (!f.open("r")) return null;
	var content = f.read();
	f.close();
	try {
		return JSON.parse(content);
	} catch (e) {
		return null;
	}
}

function pointsSaveJSON(filepath, data) {
	var f = new File(filepath);
	if (!f.open("w")) return false;
	try {
		f.write(JSON.stringify(data, null, 2));
		return true;
	} finally {
		f.close();
	}
}

function getLedgerPath(userNum) {
	return LEDGER_DIR + "ledger_" + userNum + ".json";
}

function loadLedger(userNum) {
	var ledger = pointsLoadJSON(getLedgerPath(userNum));
	if (!ledger || typeof ledger !== "object") {
		ledger = { entries: [], lastLogin: null, consecutiveDays: 0 };
	}
	if (!(ledger.entries instanceof Array)) ledger.entries = [];
	return ledger;
}

function saveLedger(userNum, ledger) {
	return pointsSaveJSON(getLedgerPath(userNum), ledger);
}

function getBalance(ledger) {
	var balance = 0;
	var lifetime = 0;
	for (var i = 0; i < ledger.entries.length; i++) {
		var delta = Number(ledger.entries[i].delta) || 0;
		balance += delta;
		if (delta > 0) lifetime += delta;
	}
	return { balance: balance, lifetime: lifetime };
}

// --- Input helpers ---

// Resolve a user number or alias to { number, alias }, or null if not found.
function resolveUser(idValue) {
	var raw = String(idValue == null ? "" : idValue).trim();
	if (!raw) return null;

	var userNum = 0;
	if (/^[0-9]+$/.test(raw)) {
		userNum = parseInt(raw, 10);
	} else {
		userNum = system.matchuser(raw);
	}
	if (!userNum || userNum < 1) return null;

	try {
		var u = new User(userNum);
		if (!u || !u.alias) return null;
		if (u.settings & USER_DELETED_FLAG) return null;
		return { number: userNum, alias: u.alias };
	} catch (e) {
		return null;
	}
}

// A valid, positive, whole point amount, or NaN.
function coercePositiveAmount(value) {
	var n = Number(value);
	if (isNaN(n) || !isFinite(n)) return NaN;
	n = Math.floor(n);
	if (n <= 0) return NaN;
	return n;
}

// --- Write authorization (shared secret, fail closed) ---

function getConfiguredSecret() {
	var cfg = pointsLoadJSON(SECRET_FILE);
	if (!cfg) return null;
	var s = cfg.secret || cfg.apiSecret;
	if (!s) return null;
	s = String(s);
	return s.length ? s : null;
}

// Returns null if authorized, otherwise an error string to return to the caller.
function checkSecret(packet) {
	var configured = getConfiguredSecret();
	if (!configured) return "points_api_not_configured";
	var provided = String((packet.data && packet.data.secret) || "");
	// Length-padded comparison; not timing-hardened, adequate for an internal API gate.
	if (provided.length !== configured.length) return "unauthorized";
	var diff = 0;
	for (var i = 0; i < configured.length; i++) {
		diff |= (provided.charCodeAt(i) ^ configured.charCodeAt(i));
	}
	return diff === 0 ? null : "unauthorized";
}

// Append an entry to a user's ledger and persist. Returns true on success.
function appendEntry(userNum, delta, source, note, adjustedBy) {
	var ledger = loadLedger(userNum);
	var entry = {
		timestamp: new Date().toISOString(),
		delta: delta,
		source: source
	};
	if (note) entry.note = String(note);
	if (adjustedBy) entry.adjustedBy = String(adjustedBy);
	ledger.entries.push(entry);
	return saveLedger(userNum, ledger) ? entry : null;
}

// --- Route handlers ---

/**
 * READ points/balance/:user   (or points/balance with { user })
 * Output: { ok: true, number, alias, balance, lifetime, entryCount }
 */
function handleBalance(ctx, client, packet) {
	var location = String(packet.location || "");
	var input = packet.data || {};

	var idValue = input.user;
	if (idValue == null || String(idValue).trim() === "") {
		var parts = location.split("/"); // points/balance/:user
		if (parts.length >= 3 && parts[0] === "points" && parts[1] === "balance") {
			idValue = decodeURIComponent(parts[2]);
		}
	}

	if (idValue == null || String(idValue).trim() === "") {
		ctx.sendResponse(client, "READ", location, { ok: false, error: "missing_user" });
		return;
	}

	var who = resolveUser(idValue);
	if (!who) {
		ctx.sendResponse(client, "READ", location, { ok: false, error: "user_not_found" });
		return;
	}

	var bal = getBalance(loadLedger(who.number));
	ctx.sendResponse(client, "READ", location, {
		ok: true,
		number: who.number,
		alias: who.alias,
		balance: bal.balance,
		lifetime: bal.lifetime
	});
}

/**
 * WRITE points/add     Input: { user, amount, secret, source?, note?, by? }
 * WRITE points/remove  (same shape; rejects overdraw)
 */
function handleAddOrRemove(ctx, client, packet, isRemove) {
	var location = String(packet.location || "");
	var input = packet.data || {};

	var authErr = checkSecret(packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}

	var who = resolveUser(input.user);
	if (!who) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "user_not_found" });
		return;
	}

	var amount = coercePositiveAmount(input.amount);
	if (isNaN(amount)) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "invalid_amount" });
		return;
	}

	if (isRemove) {
		var current = getBalance(loadLedger(who.number)).balance;
		if (amount > current) {
			ctx.sendResponse(client, "WRITE", location, {
				ok: false,
				error: "insufficient_balance",
				balance: current,
				requested: amount
			});
			return;
		}
	}

	var delta = isRemove ? -amount : amount;
	var defaultSource = isRemove ? "API_REMOVE" : "API_ADD";
	var entry = appendEntry(
		who.number,
		delta,
		input.source ? String(input.source) : defaultSource,
		input.note,
		input.by
	);

	if (!entry) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "storage_error" });
		return;
	}

	var bal = getBalance(loadLedger(who.number));
	log(LOG_INFO, "points.js: " + (isRemove ? "removed " : "added ") + amount +
		" points " + (isRemove ? "from" : "to") + " " + who.alias + " (#" + who.number + ")" +
		(input.note ? " (" + input.note + ")" : ""));

	ctx.sendResponse(client, "WRITE", location, {
		ok: true,
		number: who.number,
		alias: who.alias,
		delta: delta,
		balance: bal.balance,
		lifetime: bal.lifetime,
		timestamp: entry.timestamp
	});
}

/**
 * WRITE points/transfer   Input: { from, to, amount, secret, note? }
 * Moves points from one user to another. Requires sufficient balance.
 */
function handleTransfer(ctx, client, packet) {
	var location = String(packet.location || "");
	var input = packet.data || {};

	var authErr = checkSecret(packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}

	var fromUser = resolveUser(input.from);
	if (!fromUser) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "from_user_not_found" });
		return;
	}

	var toUser = resolveUser(input.to);
	if (!toUser) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "to_user_not_found" });
		return;
	}

	if (fromUser.number === toUser.number) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "same_user" });
		return;
	}

	var amount = coercePositiveAmount(input.amount);
	if (isNaN(amount)) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "invalid_amount" });
		return;
	}

	var fromBalance = getBalance(loadLedger(fromUser.number)).balance;
	if (amount > fromBalance) {
		ctx.sendResponse(client, "WRITE", location, {
			ok: false,
			error: "insufficient_balance",
			balance: fromBalance,
			requested: amount
		});
		return;
	}

	var note = input.note ? String(input.note) : "";

	// Debit the sender first; only credit the recipient if the debit persisted.
	var fromLedger = loadLedger(fromUser.number);
	var ts = new Date().toISOString();
	var fromEntry = { timestamp: ts, delta: -amount, source: "TRANSFER_OUT", transferTo: toUser.alias };
	if (note) fromEntry.note = note;
	fromLedger.entries.push(fromEntry);
	if (!saveLedger(fromUser.number, fromLedger)) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "storage_error" });
		return;
	}

	var toLedger = loadLedger(toUser.number);
	var toEntry = { timestamp: ts, delta: amount, source: "TRANSFER_IN", transferFrom: fromUser.alias };
	if (note) toEntry.note = note;
	toLedger.entries.push(toEntry);
	if (!saveLedger(toUser.number, toLedger)) {
		// Best-effort rollback of the debit so points aren't destroyed.
		var rb = loadLedger(fromUser.number);
		rb.entries.push({
			timestamp: new Date().toISOString(),
			delta: amount,
			source: "TRANSFER_ROLLBACK",
			note: "credit to " + toUser.alias + " failed"
		});
		saveLedger(fromUser.number, rb);
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "storage_error_recipient_rolled_back" });
		return;
	}

	log(LOG_INFO, "points.js: transferred " + amount + " points from " +
		fromUser.alias + " (#" + fromUser.number + ") to " +
		toUser.alias + " (#" + toUser.number + ")");

	ctx.sendResponse(client, "WRITE", location, {
		ok: true,
		amount: amount,
		timestamp: ts,
		from: { number: fromUser.number, alias: fromUser.alias, balance: getBalance(loadLedger(fromUser.number)).balance },
		to: { number: toUser.number, alias: toUser.alias, balance: getBalance(loadLedger(toUser.number)).balance }
	});
}

// --- Route matcher ---

function matchPointsRoute(packet) {
	var loc = String(packet.location || "");
	if (loc === "points/balance") return true;
	if (loc.match(/^points\/balance\/.+$/)) return true;
	if (loc === "points/add") return true;
	if (loc === "points/remove") return true;
	if (loc === "points/transfer") return true;
	return false;
}

// --- Dispatcher ---

function handlePoints(ctx, client, packet) {
	var loc = String(packet.location || "");
	var oper = String(packet.oper || "READ").toUpperCase();

	ctx.dlog("points route: " + loc + " oper=" + oper);

	if ((loc === "points/balance" || loc.match(/^points\/balance\/.+$/)) && oper === "READ") {
		handleBalance(ctx, client, packet);
		return;
	}
	if (loc === "points/add" && oper === "WRITE") {
		handleAddOrRemove(ctx, client, packet, false);
		return;
	}
	if (loc === "points/remove" && oper === "WRITE") {
		handleAddOrRemove(ctx, client, packet, true);
		return;
	}
	if (loc === "points/transfer" && oper === "WRITE") {
		handleTransfer(ctx, client, packet);
		return;
	}

	ctx.sendError(client, loc, "unknown_points_endpoint");
}

// --- Route factory ---

function make_points_route(ctx) {
	return {
		name: ROUTE_NAME,
		match: matchPointsRoute,
		handle: handlePoints
	};
}
