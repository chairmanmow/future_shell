// sbbs/mods/future_api/routes/index.js
//
// Must define global function: get_routes(ctx)
// Returns: array of route objects { name, match(packet), handle(ctx, client, packet) }

function get_routes(ctx) {
	var base = system.mods_dir;
	if (base && base.slice(-1) !== "/" && base.slice(-1) !== "\\") base += "/";
	base += "future_api/routes/";

	// Load route modules (they register a factory function)
	load(base + "ping.js");

	var routes = [];

	// ping.js defines make_ping_route(ctx)
	if (typeof make_ping_route === "function") {
		routes.push(make_ping_route(ctx));
	}

	return routes;
}