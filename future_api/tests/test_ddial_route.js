// Unit test for mods/future_api/routes/ddial.js under jsexec.
// Never touches the live mux: uses a scratch config with a closed port.

load(system.mods_dir + "future_api/routes/ddial.js");

var SCRATCH = system.temp_dir;
DDIAL_CONFIG_FILE = SCRATCH + "ddial_test_cfg.json"; // override the global

var failures = 0;
function expect(cond, label) {
	print((cond ? "PASS " : "FAIL ") + label);
	if (!cond) failures++;
}

var last = null;
var ctx = {
	dlog: function (m) { },
	sendResponse: function (client, oper, location, data) {
		last = { oper: oper, location: location, data: data };
	},
	sendError: function (client, location, message, extra) {
		last = { location: location, error: String(message) };
	}
};
var client = {};
var route = make_ddial_route(ctx);

// --- matcher ---
expect(route.match({ location: "ddial/status" }), "match ddial/status");
expect(route.match({ location: "ddial/send" }), "match ddial/send");
expect(!route.match({ location: "points/balance" }), "no match points/balance");
expect(!route.match({ location: "ddial/other" }), "no match unknown ddial loc");

// --- unconfigured: status ok, writes fail closed ---
file_remove(DDIAL_CONFIG_FILE);
route.handle(ctx, client, { location: "ddial/status", oper: "READ" });
expect(last.data && last.data.ok === true && last.data.configured === false, "status: ok, configured=false");
expect(last.data.attached === false, "status: not attached");

route.handle(ctx, client, { location: "ddial/send", oper: "WRITE", data: { body: "hi" } });
expect(last.data && last.data.ok === false && last.data.error === "ddial_api_not_configured", "send unconfigured fails closed");

route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: {} });
expect(last.data && last.data.ok === false && last.data.error === "ddial_api_not_configured", "poll unconfigured fails closed");

// --- write scratch config pointing at a closed port ---
var cf = new File(DDIAL_CONFIG_FILE);
cf.open("w");
cf.write(JSON.stringify({
	secret: "test-secret-123",
	botUser: "tester",
	botPassword: "not-a-real-password",
	muxPort: 59999
}));
cf.close();

// --- secret checks ---
route.handle(ctx, client, { location: "ddial/send", oper: "WRITE", data: { body: "hi" } });
expect(last.data && last.data.error === "unauthorized", "send without secret unauthorized");

route.handle(ctx, client, { location: "ddial/send", oper: "WRITE", data: { body: "hi", secret: "wrong-secret-00" } });
expect(last.data && last.data.error === "unauthorized", "send with wrong secret unauthorized");

// --- attach failure path (closed port) ---
route.handle(ctx, client, { location: "ddial/send", oper: "WRITE", data: { body: "hi", secret: "test-secret-123" } });
expect(last.data && last.data.ok === false && last.data.error === "mux_unreachable", "send: mux unreachable reported");

route.handle(ctx, client, { location: "ddial/attach", oper: "WRITE", data: { secret: "test-secret-123" } });
expect(last.data && last.data.ok === false && last.data.error === "mux_unreachable", "attach: mux unreachable reported");

// --- poll with noAttach: ok, empty, cursor sane ---
route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: { secret: "test-secret-123", noAttach: true } });
expect(last.data && last.data.ok === true && last.data.attached === false, "poll: ok while detached");
expect(last.data.frames.length === 0 && last.data.nextSince === 0, "poll: empty backlog, nextSince 0");

// --- oper mismatch ---
route.handle(ctx, client, { location: "ddial/send", oper: "READ", data: {} });
expect(last.error === "wrong_oper_for_ddial_endpoint", "send with READ oper rejected");

// --- input helpers ---
expect(ddialCleanBody("  a\r\nb\x01c  ", 512) === "a / bc", "body sanitize: newlines + controls");
expect(ddialCleanBody(Array(600 + 1).join("x"), 512).length === 512, "body cap 512");
expect(ddialCleanHandle("A Very Long Handle Name Indeed") === "A Very Long Hand", "handle cap 16");
expect(ddialNormalizeLine("02") === "2" && ddialNormalizeLine("0") === "0", "line normalize");

// --- frame handling + poll cursor (no socket involved) ---
ddialHandleFrame({ kind: "chat", from: { handle: "Bob", line: "2", linkPrefix: "" }, body: "yo", echo: true, colors: [1, 2] });
ddialHandleFrame({ kind: "pm", from: { handle: "Sue", line: "9", linkPrefix: "9" }, body: "psst" });
ddialHandleFrame({ kind: "notice", text: "station notice" });
ddialHandleFrame({ kind: "status", state: "linked", station: "magviz", locked: false });
ddialHandleFrame({
	kind: "roster", station: "magviz", locked: false,
	entries: [{ handle: "Bob", line: "2", linkPrefix: "", role: "member", location: "T", channel: 1 }]
});
ddialHandleFrame({ kind: "presence", direction: "login", users: [{ handle: "New", line: "3", linkPrefix: "" }] });
ddialHandleFrame({ kind: "presence", direction: "logout", users: [{ handle: "Bob", line: "02", linkPrefix: "" }] });

route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: { secret: "test-secret-123", noAttach: true } });
var frames = last.data.frames;
expect(frames.length === 6, "poll: 6 buffered frames (roster not buffered), got " + frames.length);
expect(frames[0].kind === "chat" && frames[0].local === true && frames[0].body === "yo", "chat frame: local flag + body");
expect(frames[0].colors === undefined, "chat frame: color arrays stripped");
expect(frames[1].kind === "pm" && frames[1].from.linkPrefix === "9", "pm frame: link prefix kept");
expect(frames[3].kind === "status" && frames[3].state === "linked", "status frame buffered");
var cursor = last.data.nextSince;
expect(cursor === frames[frames.length - 1].seq, "nextSince = last seq");

// cursor advances: nothing new
route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: { secret: "test-secret-123", since: cursor, noAttach: true } });
expect(last.data.frames.length === 0 && last.data.nextSince === cursor, "poll: cursor drains cleanly");

// stale cursor from an older epoch -> reset
route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: { secret: "test-secret-123", since: 999999, noAttach: true } });
expect(last.data.reset === true && last.data.frames.length === 6, "poll: stale cursor resets to full backlog");

// limit + more flag
route.handle(ctx, client, { location: "ddial/poll", oper: "READ", data: { secret: "test-secret-123", since: 0, limit: 2, noAttach: true } });
expect(last.data.frames.length === 2 && last.data.more === true, "poll: limit honored, more=true");

// --- roster state after presence patches ---
route.handle(ctx, client, { location: "ddial/roster", oper: "READ", data: { secret: "test-secret-123" } });
var entries = last.data.entries;
expect(last.data.ok === true && last.data.station === "magviz", "roster: station name");
expect(entries.length === 1 && entries[0].handle === "New", "roster: login added, '02' logout removed 'Bob'");

// --- detach is safe when never attached ---
route.handle(ctx, client, { location: "ddial/detach", oper: "WRITE", data: { secret: "test-secret-123" } });
expect(last.data && last.data.ok === true && last.data.attached === false, "detach: safe no-op");

file_remove(DDIAL_CONFIG_FILE);
print(failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED");
exit(failures === 0 ? 0 : 1);
