// sbbs/mods/future_api/routes/usage.js
function exports_usage_route(ctx) {
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

		var s = f.readAll();
		f.close();
		return String(s || "");
	}

	function loadUsageJsonFresh() {
		var info = ctx.fileInfo(usageFile);
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
		var keys = ctx.safeKeys(rootObj);
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

	function match(packet) {
		var loc = String(packet.location || "");
		return (loc === "usage/raw" ||
			loc === "usage/keys" ||
			loc === "usage/summary" ||
			loc === "usage/summary/text" ||
			loc.indexOf("usage/month/") === 0 ||
			loc === "__usage_probe");
	}

	function handle(ctx, client, packet) {
		var location = String(packet.location || "");

		// route-specific probe
		if (location === "__usage_probe") {
			ctx.sendResponse(client, "READ", location, {
				route: "usage",
				usageFile: ctx.fileInfo(usageFile),
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

		ctx.sendError(client, location, "unknown usage location");
	}

	return { name: name, match: match, handle: handle };
}