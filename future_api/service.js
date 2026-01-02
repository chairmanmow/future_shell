// sbbs/mods/future_api/service.js
//
// Minimal FUTURE_API service scaffold.
// No file reading, no JSON parsing at boot.
// Purpose: verify wiring + request/response + route dispatch.
//
// Routes are loaded from:
//   <mods_dir>/future_api/routes/index.js
// which must define:  get_routes(ctx)
//
// Packet shape (incoming):
//   { scope:"FUTURE_API", func:"QUERY", oper:"READ", location:"ping", lock:1, timeout:8000, nick:"...", system:"..." }
//
// Response shape (outgoing):
//   { scope:"FUTURE_API", func:"RESPONSE", oper:"READ", location:"ping", data:<json> }

log("FUTURE_API service starting");

var SCOPE = "FUTURE_API";
var MODULE = "mods/future_api/service.js";
var START_MS = (new Date()).getTime();
var DEBUG = true;

function dlog(msg) { if (DEBUG) log("FUTURE_API " + msg); }

// Never allow undefined in data (Synchronet will omit it)
function sendResponse(client, oper, location, data) {
	log("FUTURE_API sendResponse oper=" + oper + " location=" + location + JSON.stringify(data));
	if (data === undefined) data = null;

	var pkt = {
		scope: SCOPE,
		func: "RESPONSE",
		oper: String(oper || "READ"),
		location: String(location || ""),
		data: data
	};

	try {
		client.sendJSON(pkt);
	} catch (e) {
		log("FUTURE_API sendJSON FAILED: " + String(e));
		// If this also fails, we at least want the failure visible.
		try { client.send(JSON.stringify(pkt)); }
		catch (e2) { log("FUTURE_API raw send FAILED: " + String(e2)); }
	}
}

function sendError(client, location, message, extra) {
	var payload = { error: String(message || "error") };
	if (extra !== undefined) payload.extra = String(extra);
	sendResponse(client, "READ", location, payload);
}

// --- ctx passed to routes (do NOT return this from API; it contains functions) ---
var ctx = {
	scope: SCOPE,
	module: MODULE,
	startMs: START_MS,
	debug: DEBUG,
	dlog: dlog,
	sendResponse: sendResponse,
	sendError: sendError
};

// ---- Route loading (safe) ----
var ROUTES = [];

(function loadRoutes() {
	try {
		var path = system.mods_dir;
		if (path && path.slice(-1) !== "/" && path.slice(-1) !== "\\") path += "/";
		path += "future_api/routes/index.js";

		dlog("loading routes from " + path);
		load(path);

		if (typeof get_routes !== "function") {
			dlog("routes/index.js did not define get_routes(ctx); continuing with 0 routes");
			ROUTES = [];
			return;
		}

		var r = get_routes(ctx);

		if (!r || typeof r.length !== "number") {
			dlog("get_routes(ctx) returned non-array; continuing with 0 routes");
			ROUTES = [];
			return;
		}

		ROUTES = r;
	} catch (e) {
		log("FUTURE_API route load FAILED: " + String(e));
		ROUTES = [];
	}
})();

dlog("loaded " + MODULE + " routes=" + ROUTES.length);

// ---- Built-in routes that bypass the routes folder (always available) ----
function handleBuiltin(client, location) {
	log("FUTURE_API handleBuiltin location=" + location);
	if (location === "ping") {
		sendResponse(client, "READ", location, { ok: true, pong: (new Date()).getTime() });
		return true;
	}

	if (location === "__probe") {
		var names = [];
		for (var i = 0; i < ROUTES.length; i++) {
			var nm = ROUTES[i] && ROUTES[i].name ? String(ROUTES[i].name) : "(unnamed)";
			names.push(nm);
		}
		sendResponse(client, "READ", location, {
			ok: true,
			scope: SCOPE,
			module: MODULE,
			uptimeMs: (new Date()).getTime() - START_MS,
			routesCount: ROUTES.length,
			routes: names
		});
		return true;
	}

	return false;
}

// ---- Module interface ----
this.query = function (client, packet) {
	try {
		var oper = String(packet.oper || "").toUpperCase();
		var location = String(packet.location || "");

		dlog("Query IN oper=" + oper + " location=" + location);


		if (oper !== "READ") {
			sendError(client, location, "unsupported oper: " + oper);
			return;
		}

		// Built-ins first
		if (handleBuiltin(client, location)) return;

		// Route dispatch
		for (var i = 0; i < ROUTES.length; i++) {
			var r = ROUTES[i];
			if (!r) continue;
			if (typeof r.match !== "function" || typeof r.handle !== "function") continue;

			// match signature: match(packet) => boolean
			var ok = false;
			try { ok = !!r.match(packet); } catch (e) { ok = false; }

			if (ok) {
				dlog("ROUTE MATCH name=" + (r.name || "(unnamed)") + " location=" + location);
				r.handle(ctx, client, packet);
				return;
			}
		}

		sendError(client, location, "unknown location");
	} catch (e) {
		sendError(client, String(packet && packet.location ? packet.location : ""), "exception", String(e));
	}
};

this.cycle = function () {};
this.shutdown = function () {};