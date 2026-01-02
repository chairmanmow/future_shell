// sbbs/mods/future_api/routes/users.js
//
// User information routes for FUTURE_API.
// Provides whitelisted user properties suitable for LLM consumption.

function make_users_route(ctx) {
var name = "users";

// ============================================================================
// WHITELISTED USER PROPERTIES
// ============================================================================
// Only these User object properties are exposed

var USER_WHITELIST = [
	// Identity (public)
	"alias",
	"name",
	"handle",
	
	// Location
	"location",
	"zipcode",
	
	// Connection info (safe)
	"modem",
	"connection",
	
	// Activity timestamps
	"logontime",
	"laston",
	"firston",
	"pwmod",
	
	// Counts/stats (public)
	"logons",
	"ltoday",
	"timeon",
	"ttoday",
	"tlast",
	"posts",
	"emails",
	"fbacks",
	"ulb",
	"uls",
	"dlb",
	"dls",
	
	// Preferences (non-sensitive)
	"rows",
	"cols",
	"prot",
	"shell",
	"editor",
	"command_shell",
	"external_editor",
	
	// Status
	"level",
	"minutes",
	"credits"
];

// Properties that should NEVER be exposed
var USER_BLACKLIST = [
	"security",
	"password",
	"pw",
	"ip_address",
	"host_name",
	"note",
	"netmail",
	"email",
	"address",
	"phone",
	"birthdate",
	"gender",
	"cursub",
	"curdir",
	"curxtrn",
	"settings",
	"chat_settings",
	"qwk_settings",
	"number"  // We return this separately
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function coerceNum(x) { 
	var n = Number(x); 
	return isNaN(n) ? 0 : n; 
}

function safeGet(obj, prop) {
	try {
		return obj[prop];
	} catch (e) {
		return undefined;
	}
}

// Get user object by number with whitelisted properties only
function getUserInfo(userNum) {
	if (!userNum || userNum < 1) {
		return { error: "invalid user number" };
	}

	try {
		var u = new User(userNum);
		if (!u || !u.alias) {
			return { error: "user not found: " + userNum };
		}

		var result = {
			number: userNum
		};

		for (var i = 0; i < USER_WHITELIST.length; i++) {
			var prop = USER_WHITELIST[i];
			var val = safeGet(u, prop);
			if (val !== undefined && val !== null && val !== "") {
				result[prop] = val;
			}
		}

		return result;
	} catch (e) {
		return { error: "failed to load user " + userNum + ": " + String(e) };
	}
}

// Get user stats summary (nicely formatted)
function getUserStats(userNum) {
	if (!userNum || userNum < 1) {
		return { error: "invalid user number" };
	}

	try {
		var u = new User(userNum);
		if (!u || !u.alias) {
			return { error: "user not found: " + userNum };
		}

		return {
			number: userNum,
			alias: u.alias,
			logons: coerceNum(u.logons),
			logonsToday: coerceNum(u.ltoday),
			timeOnTotal: coerceNum(u.timeon),
			timeOnToday: coerceNum(u.ttoday),
			lastSession: coerceNum(u.tlast),
			posts: coerceNum(u.posts),
			emails: coerceNum(u.emails),
			feedback: coerceNum(u.fbacks),
			filesUploaded: coerceNum(u.uls),
			bytesUploaded: coerceNum(u.ulb),
			filesDownloaded: coerceNum(u.dls),
			bytesDownloaded: coerceNum(u.dlb),
			credits: coerceNum(u.credits),
			minutes: coerceNum(u.minutes),
			firstOn: coerceNum(u.firston),
			lastOn: coerceNum(u.laston)
		};
	} catch (e) {
		return { error: "failed to load user stats: " + String(e) };
	}
}

// Get user limits based on security level
function getUserLimits(userNum) {
	if (!userNum || userNum < 1) {
		return { error: "invalid user number" };
	}

	try {
		var u = new User(userNum);
		if (!u || !u.alias) {
			return { error: "user not found: " + userNum };
		}

		var limits = u.limits;
		if (!limits) {
			return { error: "could not retrieve limits for user" };
		}

		return {
			number: userNum,
			alias: u.alias,
			level: u.level,
			timePerDay: limits.time_per_day,
			timePerLogon: limits.time_per_logon,
			emailPerDay: limits.email_per_day,
			postsPerDay: limits.posts_per_day,
			linksPerPost: limits.links_per_post
		};
	} catch (e) {
		return { error: "failed to load user limits: " + String(e) };
	}
}

// ============================================================================
// ROUTE MATCHING AND HANDLING
// ============================================================================

function match(packet) {
	var loc = String(packet.location || "");
	return (loc.indexOf("user/") === 0 ||
		loc === "__users_probe");
}

function handle(ctx, client, packet) {
	var location = String(packet.location || "");

	if (location === "__users_probe") {
		ctx.sendResponse(client, "READ", location, {
			route: "users",
			endpoints: ["user/{number}", "user/{number}/stats", "user/{number}/limits"]
		});
		return;
	}

	// All user routes: user/{number} or user/{number}/action
	if (location.indexOf("user/") === 0) {
		var path = location.substr("user/".length);
		var parts = path.split("/");
		var userNumStr = parts[0];
		var action = parts[1] || "info";

		var userNum = parseInt(userNumStr, 10);
		if (isNaN(userNum) || userNum < 1) {
			ctx.sendError(client, location, "invalid user number: " + userNumStr);
			return;
		}

		if (action === "info" || action === "") {
			var result = getUserInfo(userNum);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		if (action === "stats") {
			var result = getUserStats(userNum);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		if (action === "limits") {
			var result = getUserLimits(userNum);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		ctx.sendError(client, location, "unknown user action: " + action);
		return;
	}

	ctx.sendError(client, location, "unknown users location");
}

return { name: name, match: match, handle: handle };
}
