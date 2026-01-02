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
	load(base + "usage.js");
	load(base + "messages.js");
	load(base + "sysinfo.js");
	load(base + "users.js");
	load(base + "files.js");

	var routes = [];

	// ping.js defines make_ping_route(ctx)
	if (typeof make_ping_route === "function") {
		routes.push(make_ping_route(ctx));
	}

	// usage.js defines make_usage_route(ctx)
	if (typeof make_usage_route === "function") {
		routes.push(make_usage_route(ctx));
	}

	// messages.js defines make_messages_route(ctx)
	if (typeof make_messages_route === "function") {
		routes.push(make_messages_route(ctx));
	}

	// sysinfo.js defines make_sysinfo_route(ctx)
	if (typeof make_sysinfo_route === "function") {
		routes.push(make_sysinfo_route(ctx));
	}

	// users.js defines make_users_route(ctx)
	if (typeof make_users_route === "function") {
		routes.push(make_users_route(ctx));
	}

	// files.js defines make_files_route(ctx)
	if (typeof make_files_route === "function") {
		routes.push(make_files_route(ctx));
	}

	return routes;
}