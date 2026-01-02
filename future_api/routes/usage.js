// sbbs/mods/future_api/routes/usage.js
function make_usage_route(ctx) {
	var name = "usage";

	// ---- Usage file path (same as your future_shell tracker) ----
	var baseDir = system.mods_dir;
	if (baseDir && baseDir.slice(-1) !== "/" && baseDir.slice(-1) !== "\\") baseDir += "/";
	baseDir += "future_shell/";
	var dataDir = baseDir + "data/";
	var usageFile = dataDir + "external_usage.json";

	try { if (!file_isdir(baseDir)) mkdir(baseDir); } catch (e) {}
	try { if (!file_isdir(dataDir)) mkdir(dataDir); } catch (e) {}

	ctx.dlog("usage route usageFile=" + usageFile + " exists=" + String(file_exists(usageFile)));

	// ---- Helper functions (ctx doesn't provide these) ----
	function fileInfo(path) {
		return {
			exists: file_exists(path),
			date: file_date(path) || 0,
			size: file_size(path) || 0
		};
	}

	function safeKeys(obj) {
		if (!obj || typeof obj !== "object") return [];
		var keys = [];
		for (var k in obj) {
			if (obj.hasOwnProperty(k)) keys.push(k);
		}
		return keys;
	}

	// ---- Cache parsed JSON (reload on file_date change) ----
	var cache = { lastDate: 0, lastSize: 0, data: null, parseError: null };

	function readTextFile(path, maxBytes) {
		var f = new File(path);
		if (!f.open("r")) throw new Error("open failed: " + path);

		try {
			var sz = Number(file_size(path) || 0);
			if (maxBytes && sz > maxBytes) {
				f.close();
				throw new Error("file too large: " + sz + " > " + maxBytes);
			}
		} catch (e) {}

		var lines = f.readAll();
		f.close();
		// readAll returns array of lines - join with newlines, not commas
		if (Array.isArray(lines)) {
			return lines.join("\n");
		}
		return String(lines || "");
	}

	function loadUsageJsonFresh() {
		var info = fileInfo(usageFile);
		if (!info.exists) {
			cache.data = {};
			cache.parseError = null;
			cache.lastDate = 0;
			cache.lastSize = 0;
			return cache.data;
		}

		if (cache.data !== null && info.date === cache.lastDate && info.size === cache.lastSize) {
			return cache.data;
		}

		cache.lastDate = info.date;
		cache.lastSize = info.size;
		cache.parseError = null;

		var raw = readTextFile(usageFile, 2 * 1024 * 1024);
		ctx.dlog("usage raw head: " + raw.substr(0, 200));

		try {
			cache.data = JSON.parse(raw);
		} catch (e) {
			cache.data = {};
			cache.parseError = String(e);
		}
		return cache.data;
	}

	function getMonthKeys(rootObj) {
		var keys = safeKeys(rootObj);
		var months = [];
		for (var i = 0; i < keys.length; i++) {
			var k = String(keys[i]);
			if (/^\d{4}-\d{2}$/.test(k)) months.push(k);
		}
		months.sort();
		return months;
	}

	function coerceNum(x) { var n = Number(x); return isNaN(n) ? 0 : n; }

	function summarizeMonth(monthObj, monthKey) {
		var totals = monthObj && monthObj.totals ? monthObj.totals : {};
		var programs = monthObj && monthObj.programs ? monthObj.programs : {};
		var users = monthObj && monthObj.users ? monthObj.users : {};
		var lastTs = coerceNum(monthObj && monthObj.lastTimestamp);

		var progArr = [];
		for (var pid in programs) {
			if (!programs.hasOwnProperty(pid)) continue;
			var p = programs[pid] || {};
			progArr.push({
				programId: String(pid),
				seconds: coerceNum(p.seconds),
				count: coerceNum(p.count),
				lastTimestamp: coerceNum(p.lastTimestamp),
				label: (p.label !== undefined ? String(p.label) : undefined)
			});
		}
		progArr.sort(function (a, b) { return b.seconds - a.seconds; });

		var userArr = [];
		for (var uid in users) {
			if (!users.hasOwnProperty(uid)) continue;
			var u = users[uid] || {};
			userArr.push({
				userName: String(uid),
				seconds: coerceNum(u.seconds),
				count: coerceNum(u.count),
				alias: (u.alias !== undefined ? String(u.alias) : undefined),
				number: (u.number !== undefined ? coerceNum(u.number) : undefined),
				lastTimestamp: coerceNum(u.lastTimestamp)
			});
		}
		userArr.sort(function (a, b) { return b.seconds - a.seconds; });

		return {
			month: String(monthKey || ""),
			totals: { count: coerceNum(totals.count), seconds: coerceNum(totals.seconds) },
			lastTimestamp: lastTs,
			topPrograms: progArr.slice(0, 10),
			topUsers: userArr.slice(0, 10)
		};
	}

	function buildUsageSummary(rootObj) {
		var months = getMonthKeys(rootObj);
		var latest = months.length ? months[months.length - 1] : null;
		var latestObj = latest ? rootObj[latest] : null;

		var out = {
			schema: "future_shell.external_usage.monthKeyed.v1",
			monthsCount: months.length,
			months: months.slice(-24),
			latestMonth: latest,
			latest: latest ? summarizeMonth(latestObj, latest) : null
		};

		var totalSeconds = 0;
		var totalCount = 0;
		for (var i = 0; i < months.length; i++) {
			var m = rootObj[months[i]];
			if (!m || !m.totals) continue;
			totalSeconds += coerceNum(m.totals.seconds);
			totalCount += coerceNum(m.totals.count);
		}
		out.allTimeTotals = { seconds: totalSeconds, count: totalCount };
		return out;
	}

	function fmtHMS(seconds) {
		seconds = Math.max(0, Math.floor(coerceNum(seconds)));
		var h = Math.floor(seconds / 3600);
		var m = Math.floor((seconds % 3600) / 60);
		var s = seconds % 60;
		return h + "h " + m + "m " + s + "s";
	}

	function summaryToText(summary) {
		if (!summary || !summary.latestMonth || !summary.latest) return "No usage data recorded yet.";

		var lines = [];
		lines.push("USAGE " + summary.latestMonth + " total " + fmtHMS(summary.latest.totals.seconds) +
			" (" + summary.latest.totals.count + " runs)");

		var tp = summary.latest.topPrograms || [];
		if (tp.length) {
			var topP = tp.slice(0, 5).map(function (p) {
				var nm = p.label || p.programId;
				return nm + " " + fmtHMS(p.seconds);
			});
			lines.push("Top: " + topP.join(" | "));
		}

		var tu = summary.latest.topUsers || [];
		if (tu.length) {
			var topU = tu.slice(0, 5).map(function (u) {
				var nm = u.alias || u.userName;
				return nm + " " + fmtHMS(u.seconds);
			});
			lines.push("Users: " + topU.join(" | "));
		}

		return lines.join("\n");
	}

	// Aggregate user's program usage across all months
	function buildUserUsage(rootObj, userName) {
		var months = getMonthKeys(rootObj);
		var userLower = userName.toLowerCase();
		var programs = {};
		var totals = { count: 0, seconds: 0 };
		var foundAlias = null;
		var foundNumber = null;
		var lastTimestamp = 0;

		for (var i = 0; i < months.length; i++) {
			var m = rootObj[months[i]];
			if (!m || !m.users) continue;

			// Find user by case-insensitive match
			for (var uid in m.users) {
				if (!m.users.hasOwnProperty(uid)) continue;
				if (uid.toLowerCase() !== userLower) continue;

				var u = m.users[uid];
				if (!foundAlias && u.alias) foundAlias = u.alias;
				if (!foundNumber && u.number) foundNumber = u.number;

				totals.count += coerceNum(u.count);
				totals.seconds += coerceNum(u.seconds);
				if (u.lastTimestamp > lastTimestamp) lastTimestamp = u.lastTimestamp;

				// Merge program usage
				if (u.programs) {
					for (var pid in u.programs) {
						if (!u.programs.hasOwnProperty(pid)) continue;
						var p = u.programs[pid];
						if (!programs[pid]) {
							programs[pid] = { programId: pid, count: 0, seconds: 0, lastTimestamp: 0 };
						}
						programs[pid].count += coerceNum(p.count);
						programs[pid].seconds += coerceNum(p.seconds);
						if (p.lastTimestamp > programs[pid].lastTimestamp) {
							programs[pid].lastTimestamp = p.lastTimestamp;
						}
					}
				}
			}
		}

		// Convert programs to sorted array
		var progArr = [];
		for (var pid in programs) {
			if (programs.hasOwnProperty(pid)) progArr.push(programs[pid]);
		}
		progArr.sort(function (a, b) { return b.seconds - a.seconds; });

		return {
			userName: foundAlias || userName,
			userNumber: foundNumber,
			totals: totals,
			lastActive: lastTimestamp,
			favoriteProgram: progArr.length > 0 ? progArr[0].programId : null,
			topPrograms: progArr.slice(0, 10),
			queriedAs: null,  // Will be set if fuzzy matched
			matchedName: null
		};
	}

	// Get list of all known users across all months
	function getAllUsers(rootObj) {
		var months = getMonthKeys(rootObj);
		var users = {};

		for (var i = 0; i < months.length; i++) {
			var m = rootObj[months[i]];
			if (!m || !m.users) continue;

			for (var uid in m.users) {
				if (!m.users.hasOwnProperty(uid)) continue;
				var u = m.users[uid];
				if (!users[uid]) {
					users[uid] = { 
						userName: u.alias || uid, 
						userNumber: u.number,
						count: 0, 
						seconds: 0 
					};
				}
				users[uid].count += coerceNum(u.count);
				users[uid].seconds += coerceNum(u.seconds);
			}
		}

		// Convert to sorted array (most active first)
		var arr = [];
		for (var uid in users) {
			if (users.hasOwnProperty(uid)) arr.push(users[uid]);
		}
		arr.sort(function (a, b) { return b.seconds - a.seconds; });
		return arr;
	}

	// Fuzzy match a username - returns best match or null
	function fuzzyMatchUser(rootObj, query) {
		var users = getAllUsers(rootObj);
		var queryLower = query.toLowerCase();
		var queryNorm = queryLower.replace(/[^a-z0-9]/g, "");
		
		// First try exact match
		for (var i = 0; i < users.length; i++) {
			if (users[i].userName.toLowerCase() === queryLower) {
				return users[i].userName;
			}
		}

		// Try starts-with match (common for nicknames)
		for (var i = 0; i < users.length; i++) {
			var nameLower = users[i].userName.toLowerCase();
			if (nameLower.indexOf(queryLower) === 0 || queryLower.indexOf(nameLower.split(" ")[0]) === 0) {
				return users[i].userName;
			}
		}

		// Try contains match
		for (var i = 0; i < users.length; i++) {
			var nameLower = users[i].userName.toLowerCase();
			if (nameLower.indexOf(queryLower) !== -1 || queryLower.indexOf(nameLower) !== -1) {
				return users[i].userName;
			}
		}

		// Try normalized match (strip spaces, punctuation)
		for (var i = 0; i < users.length; i++) {
			var nameNorm = users[i].userName.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (nameNorm === queryNorm || nameNorm.indexOf(queryNorm) !== -1 || queryNorm.indexOf(nameNorm) !== -1) {
				return users[i].userName;
			}
		}

		// Try first name only
		for (var i = 0; i < users.length; i++) {
			var firstName = users[i].userName.toLowerCase().split(" ")[0];
			if (firstName === queryLower || firstName.indexOf(queryLower) === 0) {
				return users[i].userName;
			}
		}

		return null; // No match
	}

	// Aggregate program usage across all months
	function buildProgramUsage(rootObj, programId) {
		var months = getMonthKeys(rootObj);
		var pidLower = programId.toLowerCase();
		var users = {};
		var totals = { count: 0, seconds: 0 };
		var lastTimestamp = 0;
		var foundLabel = null;

		for (var i = 0; i < months.length; i++) {
			var m = rootObj[months[i]];
			if (!m || !m.programs) continue;

			// Find program by case-insensitive match
			for (var pid in m.programs) {
				if (!m.programs.hasOwnProperty(pid)) continue;
				if (pid.toLowerCase() !== pidLower) continue;

				var p = m.programs[pid];
				if (!foundLabel && p.label) foundLabel = p.label;
				totals.count += coerceNum(p.count);
				totals.seconds += coerceNum(p.seconds);
				if (p.lastTimestamp > lastTimestamp) lastTimestamp = p.lastTimestamp;
			}

			// Find users who used this program
			if (m.users) {
				for (var uid in m.users) {
					if (!m.users.hasOwnProperty(uid)) continue;
					var u = m.users[uid];
					if (!u.programs) continue;

					for (var upid in u.programs) {
						if (!u.programs.hasOwnProperty(upid)) continue;
						if (upid.toLowerCase() !== pidLower) continue;

						var up = u.programs[upid];
						if (!users[uid]) {
							users[uid] = { userName: u.alias || uid, userNumber: u.number, count: 0, seconds: 0, lastTimestamp: 0 };
						}
						users[uid].count += coerceNum(up.count);
						users[uid].seconds += coerceNum(up.seconds);
						if (up.lastTimestamp > users[uid].lastTimestamp) {
							users[uid].lastTimestamp = up.lastTimestamp;
						}
					}
				}
			}
		}

		// Convert users to sorted array
		var userArr = [];
		for (var uid in users) {
			if (users.hasOwnProperty(uid)) userArr.push(users[uid]);
		}
		userArr.sort(function (a, b) { return b.seconds - a.seconds; });

		return {
			programId: programId,
			programLabel: foundLabel || programId,
			totals: totals,
			lastActive: lastTimestamp,
			topPlayers: userArr.slice(0, 10)
		};
	}

	// Get list of all known programs across all months
	function getAllPrograms(rootObj) {
		var months = getMonthKeys(rootObj);
		var programs = {};

		for (var i = 0; i < months.length; i++) {
			var m = rootObj[months[i]];
			if (!m || !m.programs) continue;

			for (var pid in m.programs) {
				if (!m.programs.hasOwnProperty(pid)) continue;
				var p = m.programs[pid];
				if (!programs[pid]) {
					programs[pid] = { 
						programId: pid, 
						label: p.label || null,
						count: 0, 
						seconds: 0 
					};
				}
				programs[pid].count += coerceNum(p.count);
				programs[pid].seconds += coerceNum(p.seconds);
			}
		}

		// Convert to sorted array (most popular first)
		var arr = [];
		for (var pid in programs) {
			if (programs.hasOwnProperty(pid)) arr.push(programs[pid]);
		}
		arr.sort(function (a, b) { return b.seconds - a.seconds; });
		return arr;
	}

	// Fuzzy match a program name - returns best match or null
	function fuzzyMatchProgram(rootObj, query) {
		var programs = getAllPrograms(rootObj);
		var queryLower = query.toLowerCase().replace(/[^a-z0-9]/g, "");
		
		// First try exact match
		for (var i = 0; i < programs.length; i++) {
			if (programs[i].programId.toLowerCase() === query.toLowerCase()) {
				return programs[i].programId;
			}
		}

		// Try contains match
		for (var i = 0; i < programs.length; i++) {
			var pid = programs[i].programId.toLowerCase();
			var label = (programs[i].label || "").toLowerCase();
			if (pid.indexOf(queryLower) !== -1 || queryLower.indexOf(pid.replace(/[^a-z0-9]/g, "")) !== -1) {
				return programs[i].programId;
			}
			if (label && (label.indexOf(query.toLowerCase()) !== -1)) {
				return programs[i].programId;
			}
		}

		// Try normalized match (strip underscores, dashes, spaces)
		for (var i = 0; i < programs.length; i++) {
			var pidNorm = programs[i].programId.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (pidNorm === queryLower || pidNorm.indexOf(queryLower) !== -1 || queryLower.indexOf(pidNorm) !== -1) {
				return programs[i].programId;
			}
		}

		return null; // No match
	}

	function match(packet) {
		var loc = String(packet.location || "");
		return (loc === "usage/raw" ||
			loc === "usage/keys" ||
			loc === "usage/programs" ||
			loc === "usage/summary" ||
			loc === "usage/summary/text" ||
			loc.indexOf("usage/month/") === 0 ||
			loc.indexOf("usage/user/") === 0 ||
			loc.indexOf("usage/program/") === 0 ||
			loc === "__usage_probe");
	}

	function handle(ctx, client, packet) {
		var location = String(packet.location || "");

		// route-specific probe
		if (location === "__usage_probe") {
			ctx.sendResponse(client, "READ", location, {
				route: "usage",
				usageFile: fileInfo(usageFile),
				cache: { lastDate: cache.lastDate, lastSize: cache.lastSize, parseError: cache.parseError }
			});
			return;
		}

		var root = loadUsageJsonFresh();

		if (cache.parseError) {
			ctx.sendError(client, location, "usage JSON parse failed", cache.parseError);
			return;
		}

		if (location === "usage/raw") {
			ctx.sendResponse(client, "READ", location, root);
			return;
		}

		if (location === "usage/keys") {
			ctx.sendResponse(client, "READ", location, getMonthKeys(root));
			return;
		}

		// List all programs with usage
		if (location === "usage/programs") {
			var programs = getAllPrograms(root);
			ctx.sendResponse(client, "READ", location, {
				count: programs.length,
				programs: programs.slice(0, 50) // Top 50 by time
			});
			return;
		}

		if (location.indexOf("usage/month/") === 0) {
			var monthKey = location.substr("usage/month/".length);
			if (!/^\d{4}-\d{2}$/.test(monthKey)) {
				ctx.sendError(client, location, "invalid month key (expected YYYY-MM)");
				return;
			}
			var monthObj = root[monthKey];
			if (!monthObj) {
				ctx.sendError(client, location, "month not found");
				return;
			}
			ctx.sendResponse(client, "READ", location, monthObj);
			return;
		}

		if (location === "usage/summary") {
			ctx.sendResponse(client, "READ", location, buildUsageSummary(root));
			return;
		}

		if (location === "usage/summary/text") {
			var summary = buildUsageSummary(root);
			ctx.sendResponse(client, "READ", location, summaryToText(summary));
			return;
		}

		// User usage: usage/user/{username}
		if (location.indexOf("usage/user/") === 0) {
			var userName = decodeURIComponent(location.substr("usage/user/".length));
			if (!userName) {
				ctx.sendError(client, location, "missing username");
				return;
			}
			
			// Try fuzzy matching
			var matchedName = fuzzyMatchUser(root, userName);
			if (!matchedName) {
				// Return helpful error with list of active users
				var allUsers = getAllUsers(root);
				var suggestions = allUsers.slice(0, 10).map(function(u) { return u.userName; });
				ctx.sendError(client, location, "no usage data found for user: " + userName + ". Active users: " + suggestions.join(", "));
				return;
			}
			
			var userUsage = buildUserUsage(root, matchedName);
			// Include the matched name so LLM knows what was actually found
			userUsage.queriedAs = userName;
			userUsage.matchedName = matchedName;
			ctx.sendResponse(client, "READ", location, userUsage);
			return;
		}

		// Program usage: usage/program/{programId}
		if (location.indexOf("usage/program/") === 0) {
			var programId = decodeURIComponent(location.substr("usage/program/".length));
			if (!programId) {
				ctx.sendError(client, location, "missing program ID");
				return;
			}
			
			// Try fuzzy matching if exact match fails
			var matchedId = fuzzyMatchProgram(root, programId);
			if (!matchedId) {
				// Return helpful error with list of similar programs
				var allProgs = getAllPrograms(root);
				var suggestions = allProgs.slice(0, 10).map(function(p) { return p.programId; });
				ctx.sendError(client, location, "no usage data found for program: " + programId + ". Try: " + suggestions.join(", "));
				return;
			}
			
			var programUsage = buildProgramUsage(root, matchedId);
			// Include the matched ID so LLM knows what was actually found
			programUsage.queriedAs = programId;
			programUsage.matchedId = matchedId;
			ctx.sendResponse(client, "READ", location, programUsage);
			return;
		}

		ctx.sendError(client, location, "unknown usage location");
	}

	return { name: name, match: match, handle: handle };
}