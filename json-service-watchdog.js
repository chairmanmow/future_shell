/*
 * JSON service watchdog for Synchronet (mods copy).
 *
 * Intended for periodic execution from cron/systemd with jsexec.  It checks the
 * loopback JSON service and recycles Synchronet Services when the listener is
 * gone or no JSON ping response is received.
 *
 * NOTE: lives in /mods (not /exec) so it survives upstream pulls.  The upstream
 * /sbbs/exec/json-service-watchdog.js is broken: it references SOCK_STREAM but
 * only loads sbbsdefs.js (SOCK_STREAM is defined in sockdefs.js), so it throws
 * a ReferenceError before ever checking the service.  This copy loads sockdefs.
 */

load("sockdefs.js");
load("json-sock.js");
load("sbbsdefs.js");

var host = argv[0] || "127.0.0.1";
var port = Number(argv[1] || 10088);
var timeout = Number(argv[2] || 5);
var minRecycleInterval = Number(argv[3] || 300);

var stateFile = system.data_dir + "json-service-watchdog.state";
// Synchronet's semaphore naming is recycle.<server> (services.cpp:2161
// semfile_list_init(ctrl_dir, "recycle", "services")); the old name
// "services.recycle" was never watched by anything.
// NOTE: the services host only honors this when active_clients()==0
// (services.cpp:2188) — permanent clients (chat bridges) can defer it
// indefinitely; a full sbbs restart is the reliable flush in that state.
var recycleSem = system.ctrl_dir + "recycle.services";

function now() {
	return time();
}

function readState() {
	var state = {
		failures: 0,
		last_recycle: 0
	};
	var f = new File(stateFile);
	if (!f.exists || !f.open("r"))
		return state;
	try {
		var raw = f.read();
		if (raw) {
			var parsed = JSON.parse(raw);
			if (parsed && typeof parsed == "object")
				state = parsed;
		}
	} catch (e) {
		log(LOG_WARNING, "json-service-watchdog: unable to read state: " + e);
	}
	f.close();
	return state;
}

function writeState(state) {
	var f = new File(stateFile);
	if (!f.open("w"))
		return false;
	f.write(JSON.stringify(state));
	f.close();
	return true;
}

function checkJsonService() {
	var sock = new Socket(SOCK_STREAM, "JSON-WATCHDOG");
	try {
		if (!sock.connect(host, port, timeout))
			return { ok: false, reason: sock.error + " connecting to " + host + ":" + port + ": " + sock.error_str };

		sock.sendJSON({
			scope: "SOCKET",
			func: "PING",
			data: Date.now()
		});

		var deadline = Date.now() + (timeout * 1000);
		while (Date.now() < deadline) {
			var packet = sock.recvJSON();
			if (packet && packet.scope && packet.func
					&& packet.scope.toUpperCase() == "SOCKET"
					&& packet.func.toUpperCase() == "PONG")
				return { ok: true };
			mswait(100);
		}
		return { ok: false, reason: "timed out waiting for JSON PONG" };
	} catch (e) {
		return { ok: false, reason: String(e) };
	} finally {
		try {
			sock.close();
		} catch (ignored) {
		}
	}
}

var state = readState();
var result = checkJsonService();

if (result.ok) {
	if (state.failures || state.last_error) {
		state.failures = 0;
		state.last_error = "";
		writeState(state);
	}
	log(LOG_INFO, "json-service-watchdog: JSON service healthy at " + host + ":" + port);
	exit(0);
}

state.failures = (state.failures || 0) + 1;
state.last_error = result.reason;
state.last_failure = now();

if (state.last_recycle && now() - state.last_recycle < minRecycleInterval) {
	log(LOG_WARNING, "json-service-watchdog: JSON service unhealthy (" + result.reason
		+ "); recycle suppressed by cooldown");
	writeState(state);
	exit(2);
}

if (!file_touch(recycleSem)) {
	log(LOG_ERR, "json-service-watchdog: JSON service unhealthy (" + result.reason
		+ "); failed to touch " + recycleSem);
	writeState(state);
	exit(3);
}

state.last_recycle = now();
writeState(state);
log(LOG_ERR, "json-service-watchdog: JSON service unhealthy (" + result.reason
	+ "); touched " + recycleSem + " to recycle Synchronet Services");
exit(1);
