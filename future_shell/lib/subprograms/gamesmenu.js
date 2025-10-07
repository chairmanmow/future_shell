// gamesmenu.js
// Returns an array of menu items for all accessible games/doors for the current user
var ICON_LOOKUP = {
}

// Dynamically build an icon filename lookup from the icons directory (.ans/.bin)
// Key: UPPERCASE base filename (without extension) -> value: original base name
var DYNAMIC_ICON_FILES = (function () {
	var map = {};
	try {
		// js.exec_dir ends with subfunctions/ for this script; go up one to lib/ and into icons/
		var iconPathBase = "future_shell/assets/"
		var iconDir = system.mods_dir + iconPathBase;
		var list = directory(iconDir) || [];
		var patterns = [iconDir + "*.ans", iconDir + "*.bin"];
		for (var p = 0; p < patterns.length; p++) {
			var list = directory(patterns[p]) || [];
			for (var i = 0; i < list.length; i++) {
				var full = list[i];
				var name = full.substring(full.lastIndexOf('/') + 1); // filename.ext
				var base = name.replace(/\.(ans|bin)$/i, '');
				if (!base) continue;
				map[base.toUpperCase()] = base; // store original base (without extension)
			}
		}
	} catch (e) {
		log("[ERR] getting icons for icon dir" + JSON.stringify(e));
		// Swallow any FS errors silently; fallback logic will still work
	}
	return map;
})();

function getItemsForXtrnSection(index) {
	if (typeof xtrn_area === 'undefined' || !xtrn_area.sec_list) return [];
	var items = [];
	var gameSec = xtrn_area.sec_list[index];
	if (!gameSec || !gameSec.can_access || !gameSec.prog_list) return items;
	for (var p = 0; p < gameSec.prog_list.length; p++) {
		var prog = gameSec.prog_list[p];
		if (!prog.can_access) continue;
		// Deterministic color from label/code
		var colorSeed = prog.name + prog.code;
		// NOTE: Dynamic rotating background colors. Could be externalized later via
		// a GAMESMENU_BG_x list in [Colors] or a dedicated [GamesMenu] section.
		// Leaving hard-coded by design for now (distinct behavioral palette rather
		// than a static semantic surface). If customization desired, convert to
		// keys like GAMESMENU_BG1..N and resolve with ICSH_VALS.
		var bgColors = [BG_BLUE, BG_CYAN, BG_GREEN, BG_BROWN, BG_MAGENTA, BG_LIGHTGRAY, BG_RED];
		var fgColors = [WHITE, BLACK, LIGHTGRAY, YELLOW, CYAN, GREEN, MAGENTA];
		var hash = 0;
		for (var i = 0; i < colorSeed.length; i++) hash = ((hash << 5) - hash) + colorSeed.charCodeAt(i);
		hash = Math.abs(hash);
		var iconBg = bgColors[hash % bgColors.length];
		var iconFg = fgColors[(hash >> 3) % fgColors.length];
		var item = {
			label: prog.name,
			type: "item",
			hotkey: null,
			action: (function (code, name) {
				return function () { this.runExternal(function () { bbs.exec_xtrn(code); }, { programId: code }); };
			})(prog.code, prog.name)
		};
		var codeUpper = prog.code.toUpperCase();
		// 1) User-specified custom icon mapping (explicit override)
		if (ICON_LOOKUP.hasOwnProperty(codeUpper)) {
			item.iconFile = ICON_LOOKUP[codeUpper];
		}
		// 2) Else if a matching .ans/.bin file exists (case-insensitive base name match)
		else if (DYNAMIC_ICON_FILES.hasOwnProperty(codeUpper)) {
			item.iconFile = DYNAMIC_ICON_FILES[codeUpper];
		}
		// 3) Fallback to generated color tile
		else {
			item.iconBg = iconBg;
			item.iconFg = iconFg;
		}
		items.push(item);
	}
	items.sort(function (a, b) {
		var la = a.label.toLowerCase();
		var lb = b.label.toLowerCase();
		if (la < lb) return -1;
		if (la > lb) return 1;
		return 0;
	});
	return items;
}
