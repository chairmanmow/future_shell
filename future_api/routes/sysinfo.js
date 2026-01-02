// sbbs/mods/future_api/routes/sysinfo.js
//
// System information routes for FUTURE_API.
// Provides whitelisted system properties and statistics.
// Uses a whitelist approach for security - only expose approved properties.

function make_sysinfo_route(ctx) {
var name = "sysinfo";

// ============================================================================
// WHITELISTED SYSTEM PROPERTIES
// ============================================================================
// Only these properties can be queried via the API.
// Each entry: { prop: "property.path", desc: "description", transform: fn (optional) }

var SYSTEM_WHITELIST = {
	// Basic identity
	"name": { prop: "name", desc: "BBS name" },
	"operator": { prop: "operator", desc: "Sysop/operator name" },
	"location": { prop: "location", desc: "System location (city, state)" },
	"qwk_id": { prop: "qwk_id", desc: "QWK packet ID" },
	"inet_addr": { prop: "inet_addr", desc: "Internet address" },
	"guru": { prop: "guru", desc: "Default AI/Guru name" },
	
	// Timezone
	"timezone": { prop: "timezone", desc: "Timezone (SMB format)", 
		transform: function(v) { return { raw: v, string: system.zonestr(v) }; } },
	"tz_offset": { prop: "tz_offset", desc: "Timezone offset from UTC in minutes" },
	
	// Date/time formatting
	"date_format": { prop: "date_format", desc: "Date format preference (0=MDY, 1=DMY, 2=YMD)" },
	"date_separator": { prop: "date_separator", desc: "Date field separator character" },
	"date_verbal": { prop: "date_verbal", desc: "Use verbal month names in dates" },
	
	// Node/capacity info
	"nodes": { prop: "nodes", desc: "Total terminal server nodes" },
	"last_node": { prop: "last_node", desc: "Last displayable node number" },
	
	// User policy (non-sensitive)
	"pwdays": { prop: "pwdays", desc: "Days between forced password changes (0=never)" },
	"min_password_length": { prop: "min_password_length", desc: "Minimum password length" },
	"max_password_length": { prop: "max_password_length", desc: "Maximum password length" },
	"deldays": { prop: "deldays", desc: "Days to preserve deleted user records" },
	"autodel": { prop: "autodel", desc: "Days of inactivity before auto-deletion" },
	"newuser_level": { prop: "newuser_level", desc: "New user default security level" },
	
	// Version/platform info
	"version": { prop: "version", desc: "Synchronet version" },
	"full_version": { prop: "full_version", desc: "Full version string" },
	"revision": { prop: "revision", desc: "Revision letter" },
	"beta_version": { prop: "beta_version", desc: "Beta version designation" },
	"version_notice": { prop: "version_notice", desc: "Version notice string" },
	"platform": { prop: "platform", desc: "Platform (e.g., Linux, Win32)" },
	"architecture": { prop: "architecture", desc: "Architecture (e.g., x86_64)" },
	"git_branch": { prop: "git_branch", desc: "Git branch name" },
	"git_hash": { prop: "git_hash", desc: "Git commit hash" },
	"compiled_when": { prop: "compiled_when", desc: "Compilation timestamp" },
	"compiled_with": { prop: "compiled_with", desc: "Compiler used" },
	"js_version": { prop: "js_version", desc: "JavaScript engine version" },
	"os_version": { prop: "os_version", desc: "Operating system version" },
	
	// Operational info
	"uptime": { prop: "uptime", desc: "Time system was brought online (time_t)" },
	"local_host_name": { prop: "local_host_name", desc: "Local hostname" },
	"mqtt_enabled": { prop: "mqtt_enabled", desc: "MQTT support enabled" },
	"fido_addr_list": { prop: "fido_addr_list", desc: "FidoNet addresses" },
	
	// Disk space
	"freediskspace": { prop: "freediskspace", desc: "Free disk space in bytes" },
	"freediskspacek": { prop: "freediskspacek", desc: "Free disk space in KB" },
	
	// Last user (public info)
	"last_user": { prop: "last_user", desc: "Last user record number" },
	"last_useron": { prop: "last_useron", desc: "Name of last user to log off" },
	
	// Copyright
	"copyright": { prop: "copyright", desc: "Synchronet copyright notice" }
};

// Properties that should NEVER be exposed
var BLACKLIST = [
	"newuser_password",
	"newuser_magic_word",
	"node_dir",
	"ctrl_dir",
	"data_dir",
	"text_dir",
	"temp_dir",
	"exec_dir",
	"mods_dir",
	"logs_dir",
	"devnull",
	"temp_path",
	"cmd_shell",
	"name_servers"
];

// Stats properties (all are safe to expose)
var STATS_WHITELIST = [
	"total_logons",
	"logons_today",
	"total_timeon",
	"timeon_today",
	"total_files",
	"files_uploaded_today",
	"bytes_uploaded_today",
	"files_downloaded_today",
	"bytes_downloaded_today",
	"total_messages",
	"messages_posted_today",
	"total_email",
	"email_sent_today",
	"total_feedback",
	"feedback_sent_today",
	"total_users",
	"new_users_today"
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

// Fuzzy match property name - handles underscores, case differences
function fuzzyMatchProperty(propName) {
	var name = String(propName || "").toLowerCase();
	
	// Direct match first
	if (SYSTEM_WHITELIST[propName]) return propName;
	
	// Case-insensitive match
	for (var k in SYSTEM_WHITELIST) {
		if (k.toLowerCase() === name) return k;
	}
	
	// Normalized match (strip underscores, spaces)
	var nameNorm = name.replace(/[_\s-]/g, "");
	for (var k in SYSTEM_WHITELIST) {
		var kNorm = k.toLowerCase().replace(/[_\s-]/g, "");
		if (kNorm === nameNorm) return k;
	}
	
	// Partial match (contains)
	for (var k in SYSTEM_WHITELIST) {
		var kNorm = k.toLowerCase().replace(/[_\s-]/g, "");
		if (kNorm.indexOf(nameNorm) !== -1 || nameNorm.indexOf(kNorm) !== -1) return k;
	}
	
	return null;
}

// Get a single whitelisted property
function getProperty(propName) {
	var matchedName = fuzzyMatchProperty(propName);
	if (!matchedName) {
		// Return helpful list of similar properties
		var props = [];
		for (var k in SYSTEM_WHITELIST) props.push(k);
		return { error: "property not found: " + propName + ". Available: " + props.slice(0, 15).join(", ") + "..." };
	}
	var entry = SYSTEM_WHITELIST[matchedName];

	var value = safeGet(system, entry.prop);
	if (value === undefined) {
		return { error: "property undefined: " + propName };
	}

	if (entry.transform) {
		value = entry.transform(value);
	}

	var result = {
		property: matchedName,
		value: value,
		description: entry.desc
	};
	// Include queried name if it was fuzzy matched
	if (matchedName !== propName) {
		result.queriedAs = propName;
	}
	return result;
}

// Get multiple properties at once
function getProperties(propNames) {
	var results = {};
	for (var i = 0; i < propNames.length; i++) {
		var name = propNames[i];
		var entry = SYSTEM_WHITELIST[name];
		if (entry) {
			var value = safeGet(system, entry.prop);
			if (value !== undefined) {
				results[name] = entry.transform ? entry.transform(value) : value;
			}
		}
	}
	return results;
}

// Get all available property names
function listProperties() {
	var props = [];
	for (var k in SYSTEM_WHITELIST) {
		if (SYSTEM_WHITELIST.hasOwnProperty(k)) {
			props.push({
				name: k,
				description: SYSTEM_WHITELIST[k].desc
			});
		}
	}
	return props;
}

// Get basic system info (commonly needed together)
function getSystemInfo() {
	return {
		name: safeGet(system, "name"),
		operator: safeGet(system, "operator"),
		location: safeGet(system, "location"),
		inet_addr: safeGet(system, "inet_addr"),
		qwk_id: safeGet(system, "qwk_id"),
		nodes: safeGet(system, "nodes"),
		version: safeGet(system, "full_version"),
		platform: safeGet(system, "platform"),
		architecture: safeGet(system, "architecture"),
		uptime: safeGet(system, "uptime"),
		timezone: system.zonestr(),
		tz_offset: safeGet(system, "tz_offset")
	};
}

// Get system stats
function getSystemStats() {
	var stats = {};
	for (var i = 0; i < STATS_WHITELIST.length; i++) {
		var prop = STATS_WHITELIST[i];
		stats[prop] = coerceNum(safeGet(system.stats, prop));
	}
	return stats;
}

// Get node list with verbal status
function getNodeList() {
	var nodes = [];
	var activeCount = 0;
	
	for (var i = 0; i < system.node_list.length; i++) {
		var node = system.node_list[i];
		var n = {
			number: i + 1,
			status: node.status,
			vstatus: node.vstatus || "unknown",
			action: node.action,
			activity: node.activity || "",
			useron: node.useron,
			connection: node.connection
		};
		
		// Get username if someone is on
		if (node.useron > 0) {
			try {
				n.user = system.username(node.useron);
			} catch (e) {}
			activeCount++;
		}
		
		nodes.push(n);
	}
	
	return {
		totalNodes: nodes.length,
		activeNodes: activeCount,
		nodes: nodes
	};
}

// Get specific node status
function getNodeStatus(nodeNum) {
	var idx = nodeNum - 1;
	if (idx < 0 || idx >= system.node_list.length) {
		return { error: "invalid node number: " + nodeNum };
	}
	
	var node = system.node_list[idx];
	var result = {
		number: nodeNum,
		status: node.status,
		vstatus: node.vstatus || "unknown",
		action: node.action,
		activity: node.activity || "",
		useron: node.useron,
		connection: node.connection,
		errors: node.errors,
		misc: node.misc,
		aux: node.aux,
		extaux: node.extaux
	};
	
	if (node.useron > 0) {
		try {
			result.user = system.username(node.useron);
		} catch (e) {}
	}
	
	return result;
}

// ============================================================================
// ROUTE MATCHING AND HANDLING
// ============================================================================

function match(packet) {
	var loc = String(packet.location || "");
	return (loc === "system" ||
		loc === "system/stats" ||
		loc === "system/properties" ||
		loc === "system/node_list" ||
		loc === "system/matchuser" ||
		loc === "system/username" ||
		loc.indexOf("system/node_list/") === 0 ||
		loc.indexOf("system/property/") === 0 ||
		loc === "__sysinfo_probe");
}

function handle(ctx, client, packet) {
	var location = String(packet.location || "");

	if (location === "__sysinfo_probe") {
		ctx.sendResponse(client, "READ", location, {
			route: "sysinfo",
			endpoints: ["system", "system/stats", "system/properties",
			            "system/property/{name}", "system/node_list",
			            "system/node_list/{number}", "system/matchuser",
			            "system/username"],
			availableProperties: listProperties()
		});
		return;
	}

	// Basic system info
	if (location === "system") {
		ctx.sendResponse(client, "READ", location, getSystemInfo());
		return;
	}

	// System stats
	if (location === "system/stats") {
		ctx.sendResponse(client, "READ", location, getSystemStats());
		return;
	}

	// List available properties
	if (location === "system/properties") {
		ctx.sendResponse(client, "READ", location, {
			count: listProperties().length,
			properties: listProperties()
		});
		return;
	}

	// Get specific property: system/property/{name}
	if (location.indexOf("system/property/") === 0) {
		var propName = decodeURIComponent(location.substr("system/property/".length));
		if (!propName) {
			ctx.sendError(client, location, "missing property name");
			return;
		}
		var result = getProperty(propName);
		if (result.error) {
			ctx.sendError(client, location, result.error);
			return;
		}
		ctx.sendResponse(client, "READ", location, result);
		return;
	}

	// Node list
	if (location === "system/node_list") {
		ctx.sendResponse(client, "READ", location, getNodeList());
		return;
	}

	// Specific node: system/node_list/{number}
	if (location.indexOf("system/node_list/") === 0) {
		var nodeStr = location.substr("system/node_list/".length);
		var nodeNum = parseInt(nodeStr, 10);
		if (isNaN(nodeNum) || nodeNum < 1) {
			ctx.sendError(client, location, "invalid node number");
			return;
		}
		var result = getNodeStatus(nodeNum);
		if (result.error) {
			ctx.sendError(client, location, result.error);
			return;
		}
		ctx.sendResponse(client, "READ", location, result);
		return;
	}

	// Match user by name -> returns user number
	if (location === "system/matchuser") {
		var data = packet.data || {};
		var username = data.username ? String(data.username) : null;
		if (!username) {
			ctx.sendError(client, location, "username parameter required");
			return;
		}
		var userNum = system.matchuser(username);
		ctx.sendResponse(client, "READ", location, userNum);
		return;
	}

	// Get username by number
	if (location === "system/username") {
		var data = packet.data || {};
		var userNum = data.user_number ? parseInt(data.user_number, 10) : 0;
		if (!userNum || userNum < 1) {
			ctx.sendError(client, location, "user_number parameter required");
			return;
		}
		var name = system.username(userNum);
		ctx.sendResponse(client, "READ", location, name || null);
		return;
	}

	ctx.sendError(client, location, "unknown sysinfo location");
}

return { name: name, match: match, handle: handle };
}
