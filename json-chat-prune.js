/* json-chat-prune.js - cap per-channel history in the chat JSON db
 *
 * Every chat writer (avatar_chat.js, future_shell chat, the Go universal
 * door and its Slack/Telegram bridges, MRC) PUSHes onto
 * channels.<name>.history and nobody ever trims it, so chat.json grew
 * without bound. Once the single-line file passed json-db's 512KB
 * readAll() line buffer the parse failed and both JSON services fell
 * into a restart loop (Sep 2026). The service is the one chokepoint all
 * writers share, so the cap lives here and is loaded by
 * my-json-service.js and json-service-private.js.
 *
 * Cap comes from ctrl/json-db.ini: chat_history_max = N (default 100).
 */

var CHAT_HISTORY_MAX_DEFAULT = 100;

function chatHistoryMax() {
	var max = CHAT_HISTORY_MAX_DEFAULT;
	var ini = new File(system.ctrl_dir + "json-db.ini");
	if (ini.open("r", true)) {
		var n = Number(ini.iniGetValue(null, "chat_history_max", max));
		ini.close();
		if (n > 0)
			max = Math.floor(n);
	}
	return max;
}

/* Trim channels.*.history in place; returns number of entries dropped.
 * Only masterData is touched: the shadow's per-index entries carry lock /
 * subscriber info for individual messages, which nothing uses, and push()
 * simply reuses whatever shadow slot exists at the new index. */
function pruneChatHistory(db, max) {
	if (!db || !db.masterData || !db.masterData.data)
		return 0;
	var channels = db.masterData.data.channels;
	if (!channels || typeof channels != "object")
		return 0;
	if (!(max > 0))
		max = CHAT_HISTORY_MAX_DEFAULT;
	var dropped = 0;
	for (var name in channels) {
		var ch = channels[name];
		if (!ch || !(ch.history instanceof Array))
			continue;
		var overflow = ch.history.length - max;
		if (overflow <= 0)
			continue;
		ch.history.splice(0, overflow);
		dropped += overflow;
	}
	if (dropped > 0)
		db.settings.UPDATES = true;
	return dropped;
}
