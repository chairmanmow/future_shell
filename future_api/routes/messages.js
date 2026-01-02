// sbbs/mods/future_api/routes/messages.js
//
// Message area routes for FUTURE_API.
// Provides summarized message data suitable for LLM consumption.
// All responses are pruned to headers-only (no bodies) to keep payloads small.
// CREATE operations are supported for whitelisted subs only.

// Load message base constants (MSG_DELETE, MSG_PRIVATE, etc.)
load("smbdefs.js");

// Load whitelist for CREATE operations
var whitelist = null;
try {
	var wlPath = system.mods_dir;
	if (wlPath && wlPath.slice(-1) !== "/" && wlPath.slice(-1) !== "\\") wlPath += "/";
	wlPath += "future_api/lib/whitelist.js";
	load(wlPath);
	if (typeof FutureAPIWhitelist !== "undefined") {
		whitelist = FutureAPIWhitelist;
	}
} catch (e) {
	log("FUTURE_API messages.js: failed to load whitelist: " + e);
}

function make_messages_route(ctx) {
var name = "messages";

// ---- Helper functions ----
function safeKeys(obj) {
if (!obj || typeof obj !== "object") return [];
var keys = [];
for (var k in obj) {
if (obj.hasOwnProperty(k)) keys.push(k);
}
return keys;
}

function coerceNum(x) { 
var n = Number(x); 
return isNaN(n) ? 0 : n; 
}

// Sub codes to exclude from all queries (data sync, ops, netmail, bot areas)
var BLACKLISTED_SUBS = {
	// DoveNet system/ops areas
	"dove-syncdata": true,
	"dove-ops": true,
	// fsxNet system areas (note: underscores, not dashes)
	"fsx_dat": true,
	"fsx_bot": true,
	// Netmail areas
	"local-netmail": true,
	"fsx_netmail": true
};

function isBlacklisted(code) {
	return BLACKLISTED_SUBS[String(code).toLowerCase()] === true;
}

// Get message body snippet (first N chars, cleaned up)
function getBodySnippet(msgbase, hdr, maxLen) {
	maxLen = maxLen || 200;
	try {
		var body = msgbase.get_msg_body(hdr, false, false, false); // no tails, no plain, no stripping
		if (!body) return null;
		// Clean up: remove kludge lines (lines starting with @ or Ctrl-A)
		body = body.replace(/^[@\x01][^\r\n]*[\r\n]*/gm, "");
		// Remove Ctrl-A attribute codes (Ctrl-A followed by any char)
		body = body.replace(/\x01./g, "");
		// Remove ANSI escape sequences
		body = body.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
		// Remove other control characters except newlines
		body = body.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, "");
		// Normalize whitespace
		body = body.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
		if (body.length > maxLen) {
			body = body.substr(0, maxLen) + "...";
		}
		return body || null;
	} catch (e) {
		return null;
	}
}

// Get list of all accessible message groups and subs
function getAreaSummary() {
var groups = [];
var totalSubs = 0;
var totalPosts = 0;

for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
var grp = msg_area.grp_list[gi];
var subs = [];
var grpPosts = 0;

for (var si = 0; si < grp.sub_list.length; si++) {
var sub = grp.sub_list[si];
if (isBlacklisted(sub.code)) continue;
var posts = coerceNum(sub.posts);
grpPosts += posts;
subs.push({
code: sub.code,
name: sub.name,
posts: posts
});
}

groups.push({
name: grp.name,
description: grp.description,
subCount: subs.length,
totalPosts: grpPosts,
subs: subs.slice(0, 10)
});

totalSubs += subs.length;
totalPosts += grpPosts;
}

return {
groupCount: groups.length,
subCount: totalSubs,
totalPosts: totalPosts,
groups: groups.slice(0, 10)
};
}

// Find a sub by code (case-insensitive, fuzzy match)
function findSub(code) {
var codeLower = code.toLowerCase().replace(/[^a-z0-9]/g, "");

if (msg_area.sub[code]) {
return msg_area.sub[code];
}

var keys = safeKeys(msg_area.sub);
for (var i = 0; i < keys.length; i++) {
if (keys[i].toLowerCase() === code.toLowerCase()) {
return msg_area.sub[keys[i]];
}
}

for (var i = 0; i < keys.length; i++) {
var keyNorm = keys[i].toLowerCase().replace(/[^a-z0-9]/g, "");
if (keyNorm.indexOf(codeLower) !== -1 || codeLower.indexOf(keyNorm) !== -1) {
return msg_area.sub[keys[i]];
}
}

for (var i = 0; i < keys.length; i++) {
var sub = msg_area.sub[keys[i]];
var nameNorm = (sub.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
if (nameNorm.indexOf(codeLower) !== -1 || codeLower.indexOf(nameNorm) !== -1) {
return sub;
}
}

return null;
}

// Find a group by name (case-insensitive, fuzzy match)
function findGroup(name) {
var nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, "");

for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
var grp = msg_area.grp_list[gi];
// Exact match
if (grp.name.toLowerCase() === name.toLowerCase()) {
return grp;
}
}

// Normalized contains match
for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
var grp = msg_area.grp_list[gi];
var grpNorm = grp.name.toLowerCase().replace(/[^a-z0-9]/g, "");
if (grpNorm.indexOf(nameLower) !== -1 || nameLower.indexOf(grpNorm) !== -1) {
return grp;
}
}

return null;
}

// Get subs belonging to a specific group
function getGroupSubs(groupName) {
var grp = findGroup(groupName);
if (!grp) return null;

var subs = [];
for (var si = 0; si < grp.sub_list.length; si++) {
var sub = grp.sub_list[si];
if (isBlacklisted(sub.code)) continue;
subs.push(sub);
}
return { group: grp, subs: subs };
}

// Get stats for a specific sub-board
function getSubStats(subCode) {
var sub = findSub(subCode);
if (!sub) return null;

var result = {
code: sub.code,
name: sub.name,
description: sub.description,
groupName: sub.grp_name,
posts: coerceNum(sub.posts),
maxMsgs: sub.max_msgs,
maxAge: sub.max_age
};

try {
var msgbase = new MsgBase(sub.code);
if (msgbase.open()) {
result.firstMsg = msgbase.first_msg;
result.lastMsg = msgbase.last_msg;
result.totalMsgs = msgbase.total_msgs;
msgbase.close();
}
} catch (e) {
ctx.dlog("messages getSubStats error: " + e);
}

return result;
}

// Get recent messages from a sub (with body snippets)
function getSubRecent(subCode, limit) {
limit = Math.min(coerceNum(limit) || 20, 50);

var sub = findSub(subCode);
if (!sub) return null;
if (isBlacklisted(sub.code)) return { subCode: sub.code, subName: sub.name, count: 0, messages: [], error: "this sub is not available" };

var messages = [];

try {
var msgbase = new MsgBase(sub.code);
if (!msgbase.open()) {
ctx.dlog("messages getSubRecent: failed to open " + sub.code + ": " + msgbase.error);
return { subCode: sub.code, subName: sub.name, count: 0, messages: [], error: "failed to open: " + msgbase.error };
}

var allHeaders = msgbase.get_all_msg_headers(false, false);

if (!allHeaders) {
msgbase.close();
ctx.dlog("messages getSubRecent: get_all_msg_headers returned null for " + sub.code);
return { subCode: sub.code, subName: sub.name, count: 0, messages: [] };
}

var headerArr = [];
for (var num in allHeaders) {
if (allHeaders.hasOwnProperty(num)) {
var hdr = allHeaders[num];
if (hdr.attr & MSG_DELETE) continue;
headerArr.push(hdr);
}
}

headerArr.sort(function(a, b) {
return coerceNum(b.when_written_time) - coerceNum(a.when_written_time);
});

for (var i = 0; i < Math.min(headerArr.length, limit); i++) {
var hdr = headerArr[i];
var snippet = getBodySnippet(msgbase, hdr, 200);
messages.push({
number: hdr.number,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
replyTo: hdr.thread_back || null,
body: snippet
});
}

msgbase.close();

} catch (e) {
ctx.dlog("messages getSubRecent error: " + e);
return { subCode: sub.code, subName: sub.name, count: 0, messages: [], error: String(e) };
}

return {
subCode: sub.code,
subName: sub.name,
count: messages.length,
messages: messages
};
}

// Get recent activity across all subs (or filtered by group)
function getRecentActivity(limit, groupFilter) {
limit = Math.min(coerceNum(limit) || 20, 50);

var allMessages = [];
var matchedGroup = null;
var matchedSub = null;

// If group filter specified, only scan subs in that group
var subsWithPosts = [];
if (groupFilter) {
var grpInfo = getGroupSubs(groupFilter);
if (!grpInfo) {
// Group not found - try to find it as a sub-board instead
var sub = findSub(groupFilter);
if (sub && !isBlacklisted(sub.code)) {
// Found as a sub-board! Return its recent messages with a helpful note
matchedSub = sub;
subsWithPosts.push({ key: sub.code, sub: sub, posts: coerceNum(sub.posts) });
} else {
// Return available groups as suggestions
var groupNames = [];
for (var gi = 0; gi < msg_area.grp_list.length; gi++) {
groupNames.push(msg_area.grp_list[gi].name);
}
return { count: 0, messages: [], error: "group not found: " + groupFilter + ". Available groups: " + groupNames.join(", ") + ". Hint: If you meant a sub-board, use getSubRecentMessages instead." };
}
} else {
matchedGroup = grpInfo.group.name;
for (var i = 0; i < grpInfo.subs.length; i++) {
var sub = grpInfo.subs[i];
var posts = coerceNum(sub.posts);
if (posts > 0) {
subsWithPosts.push({ key: sub.code, sub: sub, posts: posts });
}
}
}
} else {
var keys = safeKeys(msg_area.sub);
for (var i = 0; i < keys.length; i++) {
var sub = msg_area.sub[keys[i]];
if (isBlacklisted(sub.code)) continue;
var posts = coerceNum(sub.posts);
if (posts > 0) {
subsWithPosts.push({ key: keys[i], sub: sub, posts: posts });
}
}
}

subsWithPosts.sort(function(a, b) { return b.posts - a.posts; });

var subsToScan = Math.min(subsWithPosts.length, 20);

for (var i = 0; i < subsToScan; i++) {
var sub = subsWithPosts[i].sub;

try {
var msgbase = new MsgBase(sub.code);
if (!msgbase.open()) continue;

var total = msgbase.total_msgs;
var scanCount = Math.min(10, total);

for (var j = total - 1; j >= 0 && j >= total - scanCount; j--) {
try {
var hdr = msgbase.get_msg_header(true, j, false);
if (!hdr) continue;
if (hdr.attr & MSG_DELETE) continue;

var snippet = getBodySnippet(msgbase, hdr, 150);
allMessages.push({
subCode: sub.code,
subName: sub.name,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
body: snippet
});
} catch (e) {}
}

msgbase.close();
} catch (e) {
ctx.dlog("getRecentActivity error on " + sub.code + ": " + e);
}
}

allMessages.sort(function(a, b) {
return coerceNum(b.date) - coerceNum(a.date);
});

var result = {
count: Math.min(allMessages.length, limit),
messages: allMessages.slice(0, limit)
};
if (matchedGroup) {
result.group = matchedGroup;
}
if (matchedSub) {
result.sub = matchedSub.code;
result.subName = matchedSub.name;
result.note = "Matched as sub-board '" + matchedSub.code + "' (not a group). Use getSubRecentMessages for sub-boards.";
}
return result;
}

// Get posts by a specific user across all subs
// Options:
//   username   - the user to search for (required)
//   limit      - max results (default 20, max 200)
//   maxScan    - max messages per sub (default 200, 0 = unlimited)
//   deep       - if true, uses get_all_msg_headers() for comprehensive search
function getUserPosts(options) {
var username = options.username;
if (!username) {
return { error: "username required", count: 0, posts: [] };
}
var userLower = username.toLowerCase();
var limit = coerceNum(options.limit) || 20;
if (limit > 200) limit = 200;
var maxScan = (typeof options.maxScan === "number") ? options.maxScan : 200;
var deepSearch = Boolean(options.deep);

var posts = [];
var subsScanned = 0;
var messagesScanned = 0;
var keys = safeKeys(msg_area.sub);

var subsWithPosts = [];
for (var i = 0; i < keys.length; i++) {
var sub = msg_area.sub[keys[i]];
if (isBlacklisted(sub.code)) continue;
var postCount = coerceNum(sub.posts);
if (postCount > 0) {
subsWithPosts.push({ key: keys[i], sub: sub, posts: postCount });
}
}

subsWithPosts.sort(function(a, b) { return b.posts - a.posts; });

// When not deep searching, limit subs scanned
var maxSubs = deepSearch ? subsWithPosts.length : Math.min(subsWithPosts.length, 40);

for (var i = 0; i < maxSubs && posts.length < limit; i++) {
var sub = subsWithPosts[i].sub;
subsScanned++;

try {
var msgbase = new MsgBase(sub.code);
if (!msgbase.open()) continue;

var total = msgbase.total_msgs;
if (total === 0) {
msgbase.close();
continue;
}

if (deepSearch) {
// Comprehensive search using get_all_msg_headers
var allHeaders = msgbase.get_all_msg_headers(false, false);
if (!allHeaders) {
msgbase.close();
continue;
}

for (var num in allHeaders) {
if (allHeaders.hasOwnProperty(num) && posts.length < limit) {
var hdr = allHeaders[num];
messagesScanned++;
if (hdr.attr & MSG_DELETE) continue;

var fromLower = String(hdr.from || "").toLowerCase();
if (fromLower === userLower || fromLower.indexOf(userLower) !== -1) {
posts.push({
subCode: sub.code,
subName: sub.name,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
body: getBodySnippet(msgbase, hdr, 150)
});
}
}
}
} else {
// Standard scan: iterate backwards
var scanLimit = (maxScan > 0) ? Math.min(maxScan, total) : total;

for (var j = total - 1; j >= 0 && j >= total - scanLimit && posts.length < limit; j--) {
messagesScanned++;
try {
var hdr = msgbase.get_msg_header(true, j, false);
if (!hdr) continue;
if (hdr.attr & MSG_DELETE) continue;

var fromLower = String(hdr.from || "").toLowerCase();
if (fromLower === userLower || fromLower.indexOf(userLower) !== -1) {
posts.push({
subCode: sub.code,
subName: sub.name,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
body: getBodySnippet(msgbase, hdr, 150)
});
}
} catch (e) {}
}
}

msgbase.close();
} catch (e) {
ctx.dlog("getUserPosts error on " + sub.code + ": " + e);
}
}

posts.sort(function(a, b) {
return coerceNum(b.date) - coerceNum(a.date);
});

var result = {
user: username,
count: posts.length,
posts: posts,
stats: {
subsScanned: subsScanned,
messagesScanned: messagesScanned
}
};
if (deepSearch) result.deep = true;

return result;
}

// List available subs for discovery
function listSubs() {
var subs = [];
var keys = safeKeys(msg_area.sub);

for (var i = 0; i < keys.length; i++) {
var sub = msg_area.sub[keys[i]];
if (isBlacklisted(sub.code)) continue;
subs.push({
code: sub.code,
name: sub.name,
groupName: sub.grp_name,
posts: coerceNum(sub.posts)
});
}

subs.sort(function(a, b) {
return b.posts - a.posts;
});

return {
count: subs.length,
subs: subs.slice(0, 30)
};
}

// Search messages across all subs by subject/body containing text
// Options:
//   query      - text to search for in subject/body
//   from       - (optional) filter by author name
//   limit      - (optional) max results to return (default 20, max 200)
//   maxScan    - (optional) max messages to scan per sub (default 100, 0 = unlimited)
//   deep       - (optional) if true, uses get_all_msg_headers() for comprehensive search
//   subCode    - (optional) limit search to a specific sub
function searchMessages(options) {
var query = options.query ? String(options.query).toLowerCase() : "";
var fromFilter = options.from ? String(options.from).toLowerCase() : null;
var limit = coerceNum(options.limit) || 20;
if (limit > 200) limit = 200; // Cap at 200 to prevent runaway responses
var maxScan = (typeof options.maxScan === "number") ? options.maxScan : 100;
var deepSearch = Boolean(options.deep);
var subCodeFilter = options.subCode ? String(options.subCode) : null;

// Must have at least one search criterion
if (!query && !fromFilter) {
return { error: "must specify query and/or from parameter", count: 0, messages: [] };
}

var matches = [];
var subsScanned = 0;
var messagesScanned = 0;

// Build list of subs to search
var subsToSearch = [];
if (subCodeFilter) {
// Search only the specified sub
var sub = findSub(subCodeFilter);
if (!sub) {
return { error: "sub not found: " + subCodeFilter, count: 0, messages: [] };
}
if (isBlacklisted(sub.code)) {
return { error: "sub not available", count: 0, messages: [] };
}
subsToSearch.push({ key: sub.code, sub: sub, posts: coerceNum(sub.posts) });
} else {
// Search all subs with posts, sorted by post count
var keys = safeKeys(msg_area.sub);
for (var i = 0; i < keys.length; i++) {
var sub = msg_area.sub[keys[i]];
if (isBlacklisted(sub.code)) continue;
if (coerceNum(sub.posts) > 0) {
subsToSearch.push({ key: keys[i], sub: sub, posts: coerceNum(sub.posts) });
}
}
subsToSearch.sort(function(a, b) { return b.posts - a.posts; });
}

// When not deep searching, limit subs to prevent long scans
var maxSubs = deepSearch ? subsToSearch.length : Math.min(subsToSearch.length, 30);

for (var i = 0; i < maxSubs && matches.length < limit; i++) {
var sub = subsToSearch[i].sub;
subsScanned++;

try {
var msgbase = new MsgBase(sub.code);
if (!msgbase.open()) continue;

var total = msgbase.total_msgs;
if (total === 0) {
msgbase.close();
continue;
}

if (deepSearch) {
// Use get_all_msg_headers for comprehensive search (like DDMsgReader)
var allHeaders = msgbase.get_all_msg_headers(false, false);
if (!allHeaders) {
msgbase.close();
continue;
}

// Build array and sort by date descending
var headerArr = [];
for (var num in allHeaders) {
if (allHeaders.hasOwnProperty(num)) {
var hdr = allHeaders[num];
if (hdr.attr & MSG_DELETE) continue;
headerArr.push(hdr);
}
}
headerArr.sort(function(a, b) {
return coerceNum(b.when_written_time) - coerceNum(a.when_written_time);
});

// Scan all messages in this sub (or up to maxScan if specified)
var scanCount = (maxScan > 0) ? Math.min(headerArr.length, maxScan) : headerArr.length;
for (var h = 0; h < scanCount && matches.length < limit; h++) {
var hdr = headerArr[h];
messagesScanned++;

// Check from filter first (if specified)
var fromName = String(hdr.from || "").toLowerCase();
if (fromFilter && fromName.indexOf(fromFilter) === -1) continue;

// Check query in subject and body (if specified)
var queryMatched = !query; // If no query, consider it matched
if (query) {
var subject = String(hdr.subject || "").toLowerCase();
if (subject.indexOf(query) !== -1) {
queryMatched = true;
} else {
// Check body
try {
var bodyText = msgbase.get_msg_body(hdr, false, false, false);
if (bodyText && bodyText.toLowerCase().indexOf(query) !== -1) {
queryMatched = true;
}
} catch (e) {}
}
}

if (queryMatched) {
matches.push({
subCode: sub.code,
subName: sub.name,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
body: getBodySnippet(msgbase, hdr, 150)
});
}
}
} else {
// Standard scan: iterate backwards from most recent
var scanLimit = (maxScan > 0) ? Math.min(maxScan, total) : total;

for (var j = total - 1; j >= 0 && j >= total - scanLimit && matches.length < limit; j--) {
messagesScanned++;
try {
var hdr = msgbase.get_msg_header(true, j, false);
if (!hdr) continue;
if (hdr.attr & MSG_DELETE) continue;

// Check from filter first (if specified)
var fromName = String(hdr.from || "").toLowerCase();
if (fromFilter && fromName.indexOf(fromFilter) === -1) continue;

// Check query in subject first (cheap)
var queryMatched = !query;
var subject = String(hdr.subject || "").toLowerCase();
if (query) {
if (subject.indexOf(query) !== -1) {
queryMatched = true;
} else {
// Check body
try {
var bodyText = msgbase.get_msg_body(hdr, false, false, false);
if (bodyText && bodyText.toLowerCase().indexOf(query) !== -1) {
queryMatched = true;
}
} catch (e) {}
}
}

if (queryMatched) {
matches.push({
subCode: sub.code,
subName: sub.name,
from: hdr.from,
to: hdr.to,
subject: hdr.subject,
date: hdr.when_written_time,
body: getBodySnippet(msgbase, hdr, 150)
});
}
} catch (e) {}
}
}

msgbase.close();
} catch (e) {
ctx.dlog("searchMessages error on " + sub.code + ": " + e);
}
}

matches.sort(function(a, b) {
return coerceNum(b.date) - coerceNum(a.date);
});

var result = {
count: matches.length,
messages: matches,
stats: {
subsScanned: subsScanned,
messagesScanned: messagesScanned
}
};
if (query) result.query = query;
if (fromFilter) result.from = fromFilter;
if (deepSearch) result.deep = true;

return result;
}

// =========================================================================
// CREATE OPERATIONS - Post a message to a whitelisted sub
// =========================================================================

// Get list of subs that allow posting via API
function getWritableSubs() {
	if (!whitelist) return [];
	var codes = whitelist.getWhitelistedSubs();
	var result = [];
	for (var i = 0; i < codes.length; i++) {
		var sub = findSub(codes[i]);
		if (sub && !isBlacklisted(sub.code)) {
			result.push({
				code: sub.code,
				name: sub.name,
				groupName: sub.grp_name
			});
		}
	}
	return result;
}

// Post a message to a whitelisted sub
// Options:
//   subCode  - the sub-board code to post to (required)
//   from     - sender name (required)
//   to       - recipient name (default: "All")
//   subject  - message subject (required)
//   body     - message body text (required)
//   replyTo  - message number to reply to (optional)
function postMessage(options) {
	// Validate required fields
	if (!options.subCode) {
		return { success: false, error: "subCode is required" };
	}
	if (!options.from || !String(options.from).trim()) {
		return { success: false, error: "from (sender name) is required" };
	}
	if (!options.subject || !String(options.subject).trim()) {
		return { success: false, error: "subject is required" };
	}
	if (!options.body || !String(options.body).trim()) {
		return { success: false, error: "body is required" };
	}

	var subCode = String(options.subCode);
	var from = String(options.from).trim();
	var to = options.to ? String(options.to).trim() : "All";
	var subject = String(options.subject).trim();
	var body = String(options.body);
	var replyTo = options.replyTo ? coerceNum(options.replyTo) : null;

	// Check whitelist
	if (!whitelist) {
		return { success: false, error: "whitelist not loaded - CREATE operations disabled" };
	}
	if (!whitelist.isSubWhitelisted(subCode)) {
		var allowed = whitelist.getWhitelistedSubs();
		return { 
			success: false, 
			error: "sub '" + subCode + "' is not whitelisted for posting",
			allowedSubs: allowed
		};
	}

	// Find the sub
	var sub = findSub(subCode);
	if (!sub) {
		return { success: false, error: "sub not found: " + subCode };
	}
	if (isBlacklisted(sub.code)) {
		return { success: false, error: "sub is not available" };
	}

	// Validate field lengths
	if (from.length > 25) {
		return { success: false, error: "from name too long (max 25 chars)" };
	}
	if (to.length > 25) {
		return { success: false, error: "to name too long (max 25 chars)" };
	}
	if (subject.length > 70) {
		return { success: false, error: "subject too long (max 70 chars)" };
	}
	if (body.length > 64000) {
		return { success: false, error: "body too long (max 64000 chars)" };
	}

	// Open the message base
	var msgbase;
	try {
		msgbase = new MsgBase(sub.code);
		if (!msgbase.open()) {
			return { success: false, error: "failed to open message base: " + msgbase.error };
		}
	} catch (e) {
		return { success: false, error: "exception opening message base: " + String(e) };
	}

	try {
		// Build the header
		var hdr = {
			to: to,
			from: from,
			subject: subject
		};

		// If this is a reply, get the reply chain info
		if (replyTo) {
			try {
				var origHdr = msgbase.get_msg_header(false, replyTo, false);
				if (origHdr) {
					hdr.thread_back = origHdr.number;
					// Get the thread_id from the original, or use its number as thread root
					hdr.thread_id = origHdr.thread_id || origHdr.number;
				}
			} catch (e) {
				// Ignore errors getting reply header
			}
		}

		// Save the message
		var result = msgbase.save_msg(hdr, body);
		
		if (!result) {
			var err = msgbase.error || "unknown error";
			msgbase.close();
			return { success: false, error: "failed to save message: " + err };
		}

		// Get the saved message number
		var savedNumber = msgbase.last_msg;
		
		msgbase.close();

		return {
			success: true,
			subCode: sub.code,
			subName: sub.name,
			messageNumber: savedNumber,
			from: from,
			to: to,
			subject: subject,
			replyTo: replyTo || null
		};

	} catch (e) {
		try { msgbase.close(); } catch (e2) {}
		return { success: false, error: "exception saving message: " + String(e) };
	}
}

function match(packet) {
var loc = String(packet.location || "");
var oper = String(packet.oper || "").toUpperCase();

// CREATE operations
if (oper === "CREATE" || oper === "WRITE") {
	if (loc === "messages/post" || loc.indexOf("messages/sub/") === 0) {
		return true;
	}
}

// READ operations
return (loc === "messages/summary" ||
loc === "messages/subs" ||
loc === "messages/writable" ||
loc === "messages/activity" ||
loc === "messages/search" ||
loc.indexOf("messages/group/") === 0 ||
loc.indexOf("messages/sub/") === 0 ||
loc.indexOf("messages/user/") === 0 ||
loc === "__messages_probe");
}

function handle(ctx, client, packet) {
var location = String(packet.location || "");
var oper = String(packet.oper || "").toUpperCase();

// Handle CREATE/WRITE operations
if (oper === "CREATE" || oper === "WRITE") {
	// POST to messages/post or messages/sub/{code}/post
	if (location === "messages/post") {
		var data = packet.data || {};
		var result = postMessage({
			subCode: data.subCode,
			from: data.from,
			to: data.to,
			subject: data.subject,
			body: data.body,
			replyTo: data.replyTo
		});
		ctx.sendResponse(client, "CREATE", location, result);
		return;
	}

	// POST to messages/sub/{code}/post
	if (location.indexOf("messages/sub/") === 0 && location.indexOf("/post") !== -1) {
		var path = location.substr("messages/sub/".length);
		var parts = path.split("/");
		var subCode = decodeURIComponent(parts[0]);
		
		var data = packet.data || {};
		var result = postMessage({
			subCode: subCode,
			from: data.from,
			to: data.to,
			subject: data.subject,
			body: data.body,
			replyTo: data.replyTo
		});
		ctx.sendResponse(client, "CREATE", location, result);
		return;
	}

	ctx.sendError(client, location, "CREATE not supported for this endpoint");
	return;
}

if (location === "__messages_probe") {
ctx.sendResponse(client, "READ", location, {
route: "messages",
endpoints: ["messages/summary", "messages/subs", "messages/writable", "messages/activity", 
            "messages/search", "messages/group/{groupName}", "messages/sub/{code}", 
            "messages/sub/{code}/recent", "messages/user/{username}"],
createEndpoints: ["messages/post", "messages/sub/{code}/post"],
note: "CREATE operations require oper='CREATE' and are limited to whitelisted subs"
});
return;
}

if (location === "messages/summary") {
ctx.sendResponse(client, "READ", location, getAreaSummary());
return;
}

if (location === "messages/subs") {
ctx.sendResponse(client, "READ", location, listSubs());
return;
}

if (location === "messages/writable") {
var writable = getWritableSubs();
ctx.sendResponse(client, "READ", location, {
	count: writable.length,
	subs: writable,
	note: "These subs are whitelisted for CREATE/POST operations"
});
return;
}

if (location === "messages/activity") {
var limit = packet.data && packet.data.limit ? coerceNum(packet.data.limit) : 20;
var group = packet.data && packet.data.group ? String(packet.data.group) : null;
ctx.sendResponse(client, "READ", location, getRecentActivity(limit, group));
return;
}

// Group-specific recent messages: messages/group/{groupName}
if (location.indexOf("messages/group/") === 0) {
var groupName = decodeURIComponent(location.substr("messages/group/".length));
if (!groupName) {
ctx.sendError(client, location, "missing group name");
return;
}
var limit = packet.data && packet.data.limit ? coerceNum(packet.data.limit) : 20;
ctx.sendResponse(client, "READ", location, getRecentActivity(limit, groupName));
return;
}

if (location === "messages/search") {
var data = packet.data || {};
var query = data.query ? String(data.query) : "";
var from = data.from ? String(data.from) : null;
// Must have at least one search criterion
if (!query && !from) {
ctx.sendError(client, location, "must specify query and/or from parameter");
return;
}
var opts = {
query: query,
from: from,
limit: data.limit ? coerceNum(data.limit) : 20,
maxScan: (typeof data.maxScan === "number") ? data.maxScan : 100,
deep: Boolean(data.deep),
subCode: data.subCode ? String(data.subCode) : null
};
ctx.sendResponse(client, "READ", location, searchMessages(opts));
return;
}

if (location.indexOf("messages/sub/") === 0) {
var path = location.substr("messages/sub/".length);
var parts = path.split("/");
var subCode = decodeURIComponent(parts[0]);
var action = parts[1] || "stats";

if (!subCode) {
ctx.sendError(client, location, "missing sub code");
return;
}

if (action === "recent") {
var limit = packet.data && packet.data.limit ? coerceNum(packet.data.limit) : 20;
var result = getSubRecent(subCode, limit);
if (!result) {
var subs = listSubs();
var suggestions = subs.subs.slice(0, 10).map(function(s) { return s.code; });
ctx.sendError(client, location, "sub not found: " + subCode + ". Try: " + suggestions.join(", "));
return;
}
ctx.sendResponse(client, "READ", location, result);
return;
}

var stats = getSubStats(subCode);
if (!stats) {
var subs = listSubs();
var suggestions = subs.subs.slice(0, 10).map(function(s) { return s.code; });
ctx.sendError(client, location, "sub not found: " + subCode + ". Try: " + suggestions.join(", "));
return;
}
ctx.sendResponse(client, "READ", location, stats);
return;
}

if (location.indexOf("messages/user/") === 0) {
var username = decodeURIComponent(location.substr("messages/user/".length));
if (!username) {
ctx.sendError(client, location, "missing username");
return;
}
var data = packet.data || {};
var opts = {
username: username,
limit: data.limit ? coerceNum(data.limit) : 20,
maxScan: (typeof data.maxScan === "number") ? data.maxScan : 200,
deep: Boolean(data.deep)
};
ctx.sendResponse(client, "READ", location, getUserPosts(opts));
return;
}

ctx.sendError(client, location, "unknown messages location");
}

return { name: name, match: match, handle: handle };
}
