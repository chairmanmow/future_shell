// sbbs/mods/future_api/routes/ping.js
//
// Defines: make_ping_route(ctx) -> route

function make_ping_route(ctx) {
	return {
		name: "ping-route",
		match: function (packet) {
			return String(packet.oper || "").toUpperCase() === "READ"
				&& String(packet.location || "") === "ping2";
		},
		handle: function (ctx, client, packet) {
			// Always respond with plain JSON-safe primitives
			ctx.sendResponse(client, "READ", "ping2", {
				ok: true,
				pong: (new Date()).getTime(),
				nick: packet.nick ? String(packet.nick) : null,
				system: packet.system ? String(packet.system) : null
			});
		}
	};
}