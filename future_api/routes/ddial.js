// sbbs/mods/future_api/routes/ddial.js
//
// DDial bridge API for FUTURE_API: lets an external bot ride the fshell_ts
// DDial link multiplexer (mods/fshell_ts/dist/ddial_mux.js) as one of this
// station's local lines.
//
// Architecture:
//   bot -> JSON service (FUTURE_API scope) -> this route
//       -> loopback TCP 127.0.0.1:5001 (ddial mux session protocol)
//       -> single telnet link to the DDial station (magviz.ca)
//
// The bridge holds ONE persistent mux session (the bot's line). Nothing pumps
// the socket between API calls; inbound frames sit in the OS socket buffer
// and are drained into a ring buffer on every ddial/* request. The bot reads
// them with cursor-based polling (ddial/poll). The mux never echoes a
// session's own messages back to it, so the bridge appends synthetic
// self:true frames to the backlog to keep the bot's transcript complete.
//
// Mux session protocol (fshell_ts/src/chat/ddial_mux.ts, newline-JSON):
//   hello:  {"username","password","handle"?}
//   out:    {kind:'chat',body} {kind:'pm',target,body} {kind:'list'}
//   in:     hello/chat/pm/presence/roster/notice/status frames
//
// Endpoints:
//   ddial/status  (READ)  - bridge + link state                (no secret)
//   ddial/attach  (WRITE) - attach the bot line to the mux     (secret)
//   ddial/detach  (WRITE) - drop the bot line                  (secret)
//   ddial/poll    (READ)  - frames since cursor; auto-attaches (secret)
//   ddial/send    (WRITE) - public chat line; auto-attaches    (secret)
//   ddial/pm      (WRITE) - private message to a line number   (secret)
//   ddial/roster  (READ)  - who's visible on the station       (secret)
//
// Configuration (fail closed, mirrors points.js):
//   data/future_api_ddial.json   (outside the mods repo, never committed)
//   {
//     "secret":      "<long-random-string>",    // gate for everything but status
//     "botUser":     "<BBS account alias>",     // the mux verifies real accounts
//     "botPassword": "<BBS account password>",
//     "handle":      "FutureBot",               // optional, default botUser
//     "muxHost":     "127.0.0.1",               // optional
//     "muxPort":     5001,                      // optional; = listen_port in
//                                               //   fshell_ts/config/ddial-link.ini
//     "backlog":     500                        // optional ring buffer size
//   }

"use strict";

var DDIAL_CONFIG_FILE = system.data_dir + "future_api_ddial.json";
var DDIAL_BODY_LIMIT = 512;        // mux splits into <=255-char wire lines
var DDIAL_HANDLE_LIMIT = 16;       // DDIAL_HANDLE_BEST on the wire
var DDIAL_ATTACH_TIMEOUT_MS = 4000;
var DDIAL_DEFAULT_BACKLOG = 500;
var DDIAL_POLL_DEFAULT = 50;
var DDIAL_POLL_MAX = 200;

// --- persistent bridge state (lives as long as this JSON service process;
//     epoch identifies the cursor namespace so a bot can detect restarts) ---
var ddial_bridge = {
	epoch: (new Date()).getTime(),
	sock: null,
	attached: false,
	line: null,            // our line number on the station (octal string)
	handle: null,
	linkState: "unknown",  // disconnected | authenticating | linked
	station: "",
	locked: false,
	roster: [],            // last known DdialUserSpec entries
	backlog: [],           // [{seq, ts, kind, ...}]
	nextSeq: 1,
	backlogMax: DDIAL_DEFAULT_BACKLOG,
	lastError: null
};

// --- config -----------------------------------------------------------------

function ddialLoadJSON(filepath) {
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

function ddialGetConfig() {
	var cfg = ddialLoadJSON(DDIAL_CONFIG_FILE);
	if (!cfg || typeof cfg !== "object") return null;
	if (!cfg.secret || !cfg.botUser || !cfg.botPassword) return null;
	var backlog = parseInt(cfg.backlog, 10);
	if (isNaN(backlog) || backlog < 50 || backlog > 5000) backlog = DDIAL_DEFAULT_BACKLOG;
	var port = parseInt(cfg.muxPort, 10);
	if (isNaN(port) || port < 1 || port > 65535) port = 5001;
	return {
		secret: String(cfg.secret),
		botUser: String(cfg.botUser),
		botPassword: String(cfg.botPassword),
		handle: cfg.handle ? String(cfg.handle) : String(cfg.botUser),
		muxHost: cfg.muxHost ? String(cfg.muxHost) : "127.0.0.1",
		muxPort: port,
		backlogMax: backlog
	};
}

// Returns null if authorized, otherwise an error string for the caller.
// Length-padded comparison, same trade-off as points.js.
function ddialCheckSecret(cfg, packet) {
	if (!cfg) return "ddial_api_not_configured";
	var provided = String((packet.data && packet.data.secret) || "");
	if (provided.length !== cfg.secret.length) return "unauthorized";
	var diff = 0;
	for (var i = 0; i < cfg.secret.length; i++) {
		diff |= (provided.charCodeAt(i) ^ cfg.secret.charCodeAt(i));
	}
	return diff === 0 ? null : "unauthorized";
}

// --- input helpers ----------------------------------------------------------

function ddialCleanBody(value, max) {
	var body = String(value === undefined || value === null ? "" : value);
	body = body.replace(/[\r\n]+/g, " / ");
	body = body.replace(/[\x00-\x1f\x7f]/g, "");
	body = body.replace(/^\s+/, "").replace(/\s+$/, "");
	if (body.length > max) body = body.substr(0, max);
	return body;
}

function ddialCleanHandle(value) {
	var h = String(value || "").replace(/[\x00-\x1f\x7f]/g, "");
	h = h.replace(/^\s+/, "").replace(/\s+$/, "");
	if (h.length > DDIAL_HANDLE_LIMIT) h = h.substr(0, DDIAL_HANDLE_LIMIT);
	return h;
}

// '02' and '2' are the same line; compare stripped (mirrors the mux).
function ddialNormalizeLine(line) {
	return String(line || "").replace(/^0+(?=.)/, "");
}

function ddialSlimUser(u) {
	if (!u || typeof u !== "object") return { handle: "", line: "", linkPrefix: "" };
	return {
		handle: u.handle !== undefined ? String(u.handle) : "",
		line: u.line !== undefined ? String(u.line) : "",
		linkPrefix: u.linkPrefix ? String(u.linkPrefix) : ""
	};
}

function ddialSlimRosterEntry(u) {
	var out = ddialSlimUser(u);
	if (u && u.role !== undefined) out.role = String(u.role);
	if (u && u.location !== undefined) out.location = String(u.location);
	if (u && u.channel !== undefined) out.channel = u.channel;
	return out;
}

// --- bridge internals -------------------------------------------------------

function ddialSockLive() {
	return ddial_bridge.sock !== null && ddial_bridge.sock.is_connected;
}

function ddialPush(frame) {
	frame.seq = ddial_bridge.nextSeq++;
	frame.ts = (new Date()).toISOString();
	ddial_bridge.backlog.push(frame);
	while (ddial_bridge.backlog.length > ddial_bridge.backlogMax) {
		ddial_bridge.backlog.shift();
	}
}

function ddialRosterPatch(direction, users) {
	for (var i = 0; i < users.length; i++) {
		var spec = users[i];
		if (!spec || typeof spec !== "object") continue;
		var key = (spec.linkPrefix || "") + "#" + ddialNormalizeLine(spec.line);
		var kept = [];
		for (var j = 0; j < ddial_bridge.roster.length; j++) {
			var existing = ddial_bridge.roster[j];
			var existingKey = (existing.linkPrefix || "") + "#" + ddialNormalizeLine(existing.line);
			if (existingKey !== key) kept.push(existing);
		}
		ddial_bridge.roster = kept;
		if (direction === "login") ddial_bridge.roster.push(spec);
	}
}

function ddialHandleFrame(frame) {
	switch (String(frame.kind || "")) {
	case "hello":
		if (frame.error) {
			ddial_bridge.lastError = String(frame.error);
			ddial_bridge.attached = false;
		} else {
			ddial_bridge.attached = true;
			ddial_bridge.line = frame.line !== undefined ? String(frame.line) : null;
			ddial_bridge.lastError = null;
		}
		return;
	case "status":
		ddial_bridge.linkState = String(frame.state || "unknown");
		if (frame.station !== undefined) ddial_bridge.station = String(frame.station);
		ddial_bridge.locked = !!frame.locked;
		ddialPush({
			kind: "status",
			state: ddial_bridge.linkState,
			station: ddial_bridge.station,
			locked: ddial_bridge.locked
		});
		return;
	case "roster":
		if (frame.station !== undefined) ddial_bridge.station = String(frame.station);
		ddial_bridge.locked = !!frame.locked;
		ddial_bridge.roster = (frame.entries instanceof Array) ? frame.entries : [];
		return;
	case "presence":
		if (frame.users instanceof Array) {
			ddialRosterPatch(String(frame.direction || ""), frame.users);
			var slim = [];
			for (var i = 0; i < frame.users.length; i++) slim.push(ddialSlimUser(frame.users[i]));
			ddialPush({ kind: "presence", direction: String(frame.direction || ""), users: slim });
		}
		return;
	case "chat":
		ddialPush({
			kind: "chat",
			from: ddialSlimUser(frame.from),
			body: String(frame.body || ""),
			// echo means "another local session on this BBS", not the far station
			local: !!frame.echo,
			dual: !!frame.dual
		});
		return;
	case "pm":
		ddialPush({
			kind: "pm",
			from: ddialSlimUser(frame.from),
			body: String(frame.body || "")
		});
		return;
	case "notice":
		ddialPush({ kind: "notice", text: String(frame.text || "") });
		return;
	default:
		return;
	}
}

// Drain everything waiting on the mux socket into the backlog. Never throws.
function ddialDrain() {
	if (!ddialSockLive()) {
		if (ddial_bridge.attached) {
			// The mux (or the service hosting it) went away under us.
			ddial_bridge.attached = false;
			ddial_bridge.line = null;
			ddialPush({ kind: "status", state: "detached", station: ddial_bridge.station, locked: ddial_bridge.locked });
		}
		return;
	}
	var sock = ddial_bridge.sock;
	var guard = 0;
	while (sock.is_connected && sock.data_waiting && guard < 500) {
		guard++;
		var line = null;
		try {
			line = sock.recvline(1024, 0);
		} catch (e) {
			break;
		}
		if (line === null || line === undefined) break;
		if (!line.length) continue;
		var frame = null;
		try {
			frame = JSON.parse(line);
		} catch (e2) {
			frame = null;
		}
		if (!frame || typeof frame !== "object") continue;
		ddialHandleFrame(frame);
	}
}

function ddialCloseSock() {
	if (ddial_bridge.sock) {
		try { ddial_bridge.sock.close(); } catch (e) { }
	}
	ddial_bridge.sock = null;
	ddial_bridge.attached = false;
	ddial_bridge.line = null;
}

function ddialSendFrame(frame) {
	if (!ddialSockLive()) return false;
	try {
		return !!ddial_bridge.sock.send(JSON.stringify(frame) + "\n");
	} catch (e) {
		return false;
	}
}

// Attach the bot line. Idempotent; returns true when attached.
function ddialAttachBridge(cfg, handleOverride) {
	ddialDrain();
	if (ddial_bridge.attached && ddialSockLive()) return true;
	ddialCloseSock();
	ddial_bridge.lastError = null;
	ddial_bridge.backlogMax = cfg.backlogMax;

	var sock = new Socket();
	var connected = false;
	try {
		connected = sock.connect(cfg.muxHost, cfg.muxPort, 5);
	} catch (e) {
		connected = false;
	}
	if (!connected) {
		try { sock.close(); } catch (e2) { }
		ddial_bridge.lastError = "mux_unreachable";
		return false;
	}
	sock.nonblocking = true;

	var handle = ddialCleanHandle(handleOverride || cfg.handle) || cfg.botUser;
	var hello = { username: cfg.botUser, password: cfg.botPassword, handle: handle };
	try {
		sock.send(JSON.stringify(hello) + "\n");
	} catch (e3) {
		try { sock.close(); } catch (e4) { }
		ddial_bridge.lastError = "mux_send_failed";
		return false;
	}
	ddial_bridge.sock = sock;
	ddial_bridge.handle = handle;

	var waited = 0;
	while (waited < DDIAL_ATTACH_TIMEOUT_MS) {
		ddialDrain();
		if (ddial_bridge.attached || ddial_bridge.lastError !== null) break;
		if (!sock.is_connected) break;
		mswait(50);
		waited += 50;
	}
	if (!ddial_bridge.attached) {
		if (ddial_bridge.lastError === null) {
			ddial_bridge.lastError = sock.is_connected ? "attach_timeout" : "mux_closed_connection";
		}
		ddialCloseSock();
		return false;
	}
	// The mux sends status + roster right after the hello; catch them now.
	mswait(150);
	ddialDrain();
	log(LOG_INFO, "ddial.js: bridge attached as " + handle + " on line #" + ddial_bridge.line);
	return true;
}

// --- route handlers ---------------------------------------------------------

function ddialStatusPayload(cfg) {
	return {
		ok: true,
		configured: cfg !== null,
		attached: ddial_bridge.attached,
		line: ddial_bridge.line,
		handle: ddial_bridge.handle,
		linkState: ddial_bridge.linkState,
		station: ddial_bridge.station,
		locked: ddial_bridge.locked,
		rosterCount: ddial_bridge.roster.length,
		lastSeq: ddial_bridge.nextSeq - 1,
		epoch: ddial_bridge.epoch,
		lastError: ddial_bridge.lastError
	};
}

function ddialHandleStatus(ctx, client, packet) {
	ddialDrain();
	ctx.sendResponse(client, "READ", String(packet.location || ""), ddialStatusPayload(ddialGetConfig()));
}

function ddialHandleAttach(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}
	var handleOverride = packet.data && packet.data.handle ? packet.data.handle : null;
	if (!ddialAttachBridge(cfg, handleOverride)) {
		ctx.sendResponse(client, "WRITE", location, {
			ok: false,
			error: ddial_bridge.lastError || "attach_failed"
		});
		return;
	}
	ctx.sendResponse(client, "WRITE", location, ddialStatusPayload(cfg));
}

function ddialHandleDetach(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}
	var wasAttached = ddial_bridge.attached;
	// Just close; the mux reaps the dead session and announces the logout.
	ddialCloseSock();
	log(LOG_INFO, "ddial.js: bridge detached" + (wasAttached ? "" : " (was not attached)"));
	ctx.sendResponse(client, "WRITE", location, { ok: true, attached: false });
}

function ddialHandlePoll(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "READ", location, { ok: false, error: authErr });
		return;
	}
	var input = packet.data || {};
	ddialDrain(); // notices a dead mux socket and flips attached off
	if (!ddial_bridge.attached && !input.noAttach) {
		ddialAttachBridge(cfg, null);
	}
	ddialDrain();

	var since = parseInt(input.since, 10);
	if (isNaN(since) || since < 0) since = 0;
	var reset = false;
	if (since > ddial_bridge.nextSeq - 1) {
		// Cursor from a previous service instance (epoch changed); start over.
		since = 0;
		reset = true;
	}
	var limit = parseInt(input.limit, 10);
	if (isNaN(limit) || limit < 1) limit = DDIAL_POLL_DEFAULT;
	if (limit > DDIAL_POLL_MAX) limit = DDIAL_POLL_MAX;

	var frames = [];
	var more = false;
	for (var i = 0; i < ddial_bridge.backlog.length; i++) {
		var frame = ddial_bridge.backlog[i];
		if (frame.seq <= since) continue;
		if (frames.length >= limit) {
			more = true;
			break;
		}
		frames.push(frame);
	}
	var nextSince = frames.length ? frames[frames.length - 1].seq : since;

	ctx.sendResponse(client, "READ", location, {
		ok: true,
		epoch: ddial_bridge.epoch,
		attached: ddial_bridge.attached,
		linkState: ddial_bridge.linkState,
		frames: frames,
		nextSince: nextSince,
		more: more,
		reset: reset,
		lastError: ddial_bridge.attached ? null : ddial_bridge.lastError
	});
}

function ddialHandleSend(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}
	var body = ddialCleanBody(packet.data && packet.data.body, DDIAL_BODY_LIMIT);
	if (!body.length) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "missing_body" });
		return;
	}
	if (!ddialAttachBridge(cfg, null)) {
		ctx.sendResponse(client, "WRITE", location, {
			ok: false,
			error: ddial_bridge.lastError || "attach_failed"
		});
		return;
	}
	if (!ddialSendFrame({ kind: "chat", body: body })) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "mux_send_failed" });
		return;
	}
	// Our own messages are never echoed back; keep the transcript complete.
	ddialPush({
		kind: "chat",
		from: { handle: ddial_bridge.handle, line: ddial_bridge.line, linkPrefix: "" },
		body: body,
		local: true,
		self: true
	});
	log(LOG_INFO, "ddial.js: sent chat (" + body.length + " chars) as " + ddial_bridge.handle);
	ctx.sendResponse(client, "WRITE", location, {
		ok: true,
		line: ddial_bridge.line,
		handle: ddial_bridge.handle,
		linkState: ddial_bridge.linkState,
		// Wire lines flush at ~1/second; long bodies split into <=255-char lines.
		queued: ddial_bridge.linkState !== "linked" || body.length > 200
	});
}

function ddialHandlePm(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: authErr });
		return;
	}
	var target = String((packet.data && packet.data.target) || "").replace(/[^0-9]/g, "");
	if (!target.length) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "invalid_target" });
		return;
	}
	var body = ddialCleanBody(packet.data && packet.data.body, DDIAL_BODY_LIMIT);
	if (!body.length) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "missing_body" });
		return;
	}
	if (!ddialAttachBridge(cfg, null)) {
		ctx.sendResponse(client, "WRITE", location, {
			ok: false,
			error: ddial_bridge.lastError || "attach_failed"
		});
		return;
	}
	if (!ddialSendFrame({ kind: "pm", target: target, body: body })) {
		ctx.sendResponse(client, "WRITE", location, { ok: false, error: "mux_send_failed" });
		return;
	}
	ddialPush({
		kind: "pm",
		from: { handle: ddial_bridge.handle, line: ddial_bridge.line, linkPrefix: "" },
		to: target,
		body: body,
		self: true
	});
	ctx.sendResponse(client, "WRITE", location, {
		ok: true,
		target: target,
		line: ddial_bridge.line,
		linkState: ddial_bridge.linkState
	});
}

function ddialHandleRoster(ctx, client, packet) {
	var location = String(packet.location || "");
	var cfg = ddialGetConfig();
	var authErr = ddialCheckSecret(cfg, packet);
	if (authErr) {
		ctx.sendResponse(client, "READ", location, { ok: false, error: authErr });
		return;
	}
	if (ddial_bridge.attached) {
		// Ask the far station for a fresh list, give it a moment to answer.
		ddialSendFrame({ kind: "list" });
		mswait(300);
	}
	ddialDrain();
	var entries = [];
	for (var i = 0; i < ddial_bridge.roster.length; i++) {
		entries.push(ddialSlimRosterEntry(ddial_bridge.roster[i]));
	}
	ctx.sendResponse(client, "READ", location, {
		ok: true,
		attached: ddial_bridge.attached,
		station: ddial_bridge.station,
		locked: ddial_bridge.locked,
		entries: entries
	});
}

// --- route matcher / dispatcher ---------------------------------------------

function ddialMatchRoute(packet) {
	var loc = String(packet.location || "");
	return loc === "ddial/status"
		|| loc === "ddial/attach"
		|| loc === "ddial/detach"
		|| loc === "ddial/poll"
		|| loc === "ddial/send"
		|| loc === "ddial/pm"
		|| loc === "ddial/roster";
}

function ddialHandleRoute(ctx, client, packet) {
	var loc = String(packet.location || "");
	var oper = String(packet.oper || "READ").toUpperCase();
	var isWrite = (oper === "WRITE" || oper === "CREATE");

	ctx.dlog("ddial route: " + loc + " oper=" + oper);

	if (loc === "ddial/status" && oper === "READ") {
		ddialHandleStatus(ctx, client, packet);
		return;
	}
	if (loc === "ddial/poll" && oper === "READ") {
		ddialHandlePoll(ctx, client, packet);
		return;
	}
	if (loc === "ddial/roster" && oper === "READ") {
		ddialHandleRoster(ctx, client, packet);
		return;
	}
	if (loc === "ddial/attach" && isWrite) {
		ddialHandleAttach(ctx, client, packet);
		return;
	}
	if (loc === "ddial/detach" && isWrite) {
		ddialHandleDetach(ctx, client, packet);
		return;
	}
	if (loc === "ddial/send" && isWrite) {
		ddialHandleSend(ctx, client, packet);
		return;
	}
	if (loc === "ddial/pm" && isWrite) {
		ddialHandlePm(ctx, client, packet);
		return;
	}

	ctx.sendError(client, loc, "wrong_oper_for_ddial_endpoint");
}

// --- route factory ----------------------------------------------------------

function make_ddial_route(ctx) {
	return {
		name: "ddial",
		match: ddialMatchRoute,
		handle: ddialHandleRoute
	};
}
