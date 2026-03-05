// sbbs/mods/future_api/routes/avatar.js
//
// Avatar routes for FUTURE_API.
// Returns user avatar data as base64.

// Load avatar_lib (handles local and network users)
var avatar_lib;
try {
	avatar_lib = load({}, 'avatar_lib.js');
} catch (e) {
	log("FUTURE_API avatar route: failed to load avatar_lib: " + String(e));
	avatar_lib = null;
}

function make_avatar_route(ctx) {
	var name = "avatar";

	// Avatar dimensions from avatar_lib
	var AVATAR_WIDTH = avatar_lib ? avatar_lib.defs.width : 10;
	var AVATAR_HEIGHT = avatar_lib ? avatar_lib.defs.height : 6;

	// ============================================================================
	// HELPER FUNCTIONS
	// ============================================================================

	// Lookup user number by username/alias
	function resolveUsername(username) {
		if (!username || typeof username !== 'string') {
			return 0;
		}
		try {
			return system.matchuser(username);
		} catch (e) {
			return 0;
		}
	}

	// Get avatar for a local user by username/alias
	function getLocalUserAvatarByName(username) {
		if (!avatar_lib) {
			return { error: "avatar_lib not available" };
		}

		if (!username) {
			return { error: "username required" };
		}

		var userNum = resolveUsername(username);
		if (!userNum || userNum < 1) {
			return { error: "user not found: " + username };
		}

		return getLocalUserAvatar(userNum);
	}

	// Get avatar for a local user by number
	function getLocalUserAvatar(userNum) {
		if (!avatar_lib) {
			return { error: "avatar_lib not available" };
		}

		if (!userNum || userNum < 1) {
			return { error: "invalid user number" };
		}

		try {
			// Verify user exists
			var u = new User(userNum);
			if (!u || !u.alias) {
				return { error: "user not found: " + userNum };
			}

			var avatarObj = avatar_lib.read_localuser(userNum);

			if (!avatarObj || !avatarObj.data) {
				return {
					number: userNum,
					alias: u.alias,
					hasAvatar: false,
					data: null
				};
			}

			if (avatarObj.disabled) {
				return {
					number: userNum,
					alias: u.alias,
					hasAvatar: false,
					disabled: true,
					data: null
				};
			}

			return {
				number: userNum,
				alias: u.alias,
				hasAvatar: true,
				width: AVATAR_WIDTH,
				height: AVATAR_HEIGHT,
				data: avatarObj.data,  // Already base64
				created: avatarObj.created || null,
				updated: avatarObj.updated || null
			};
		} catch (e) {
			return { error: "failed to load avatar for user " + userNum + ": " + String(e) };
		}
	}

	// Get avatar for a network user (by username and netaddr)
	function getNetUserAvatar(username, netaddr) {
		if (!avatar_lib) {
			return { error: "avatar_lib not available" };
		}

		if (!username) {
			return { error: "username required for network avatar lookup" };
		}

		if (!netaddr) {
			return { error: "netaddr required for network avatar lookup" };
		}

		try {
			var avatarObj = avatar_lib.read_netuser(username, netaddr);

			if (!avatarObj || !avatarObj.data) {
				return {
					username: username,
					netaddr: netaddr,
					hasAvatar: false,
					data: null
				};
			}

			if (avatarObj.disabled) {
				return {
					username: username,
					netaddr: netaddr,
					hasAvatar: false,
					disabled: true,
					data: null
				};
			}

			return {
				username: username,
				netaddr: netaddr,
				hasAvatar: true,
				width: AVATAR_WIDTH,
				height: AVATAR_HEIGHT,
				data: avatarObj.data,  // Already base64
				created: avatarObj.created || null,
				updated: avatarObj.updated || null
			};
		} catch (e) {
			return { error: "failed to load avatar for " + username + "@" + netaddr + ": " + String(e) };
		}
	}

	// Generic avatar read (tries local first, then network)
	function getAvatar(userNum, username, netaddr, bbsid) {
		if (!avatar_lib) {
			return { error: "avatar_lib not available" };
		}

		try {
			var avatarObj = avatar_lib.read(userNum, username, netaddr, bbsid);

			if (!avatarObj || !avatarObj.data) {
				return {
					userNum: userNum || null,
					username: username || null,
					netaddr: netaddr || null,
					hasAvatar: false,
					data: null
				};
			}

			if (avatarObj.disabled) {
				return {
					userNum: userNum || null,
					username: username || null,
					netaddr: netaddr || null,
					hasAvatar: false,
					disabled: true,
					data: null
				};
			}

			return {
				userNum: userNum || null,
				username: username || null,
				netaddr: netaddr || null,
				hasAvatar: true,
				width: AVATAR_WIDTH,
				height: AVATAR_HEIGHT,
				data: avatarObj.data,
				created: avatarObj.created || null,
				updated: avatarObj.updated || null
			};
		} catch (e) {
			return { error: "failed to load avatar: " + String(e) };
		}
	}

	// ============================================================================
	// ROUTE MATCHING AND HANDLING
	// ============================================================================

	function match(packet) {
		var loc = String(packet.location || "");
		return (loc.indexOf("avatar/") === 0 ||
			loc.indexOf("user/") === 0 && loc.indexOf("/avatar") > 0 ||
			loc === "__avatar_probe");
	}

	function handle(ctx, client, packet) {
		var location = String(packet.location || "");

		// Probe endpoint
		if (location === "__avatar_probe") {
			ctx.sendResponse(client, "READ", location, {
				route: "avatar",
				available: !!avatar_lib,
				dimensions: { width: AVATAR_WIDTH, height: AVATAR_HEIGHT },
				endpoints: [
					"user/{number}/avatar",
					"avatar/local/{number}",
					"avatar/user/{username}",
					"avatar/net/{username}/{netaddr}"
				],
				notes: [
					"Avatar data is base64-encoded binary (2 bytes per cell: char + attr)",
					"Dimensions are " + AVATAR_WIDTH + "x" + AVATAR_HEIGHT + " cells",
					"Total decoded size: " + (AVATAR_WIDTH * AVATAR_HEIGHT * 2) + " bytes"
				]
			});
			return;
		}

		// user/{number}/avatar - most common pattern
		var userAvatarMatch = location.match(/^user\/(\d+)\/avatar$/);
		if (userAvatarMatch) {
			var userNum = parseInt(userAvatarMatch[1], 10);
			var result = getLocalUserAvatar(userNum);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		// avatar/local/{number} - explicit local user by number
		var localMatch = location.match(/^avatar\/local\/(\d+)$/);
		if (localMatch) {
			var userNum = parseInt(localMatch[1], 10);
			var result = getLocalUserAvatar(userNum);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		// avatar/user/{username} - local user by username/alias
		var userNameMatch = location.match(/^avatar\/user\/([^\/]+)$/);
		if (userNameMatch) {
			var username = decodeURIComponent(userNameMatch[1]);
			var result = getLocalUserAvatarByName(username);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		// avatar/net/{username}/{netaddr} - network user
		// netaddr can contain slashes (e.g., 1:103/705), so grab rest of path
		var netMatch = location.match(/^avatar\/net\/([^\/]+)\/(.+)$/);
		if (netMatch) {
			var username = decodeURIComponent(netMatch[1]);
			var netaddr = decodeURIComponent(netMatch[2]);
			var result = getNetUserAvatar(username, netaddr);
			if (result.error) {
				ctx.sendError(client, location, result.error);
				return;
			}
			ctx.sendResponse(client, "READ", location, result);
			return;
		}

		ctx.sendError(client, location, "unknown avatar location");
	}

	return { name: name, match: match, handle: handle };
}
