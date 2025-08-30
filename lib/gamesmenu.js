// gamesmenu.js
// Returns an array of menu items for all accessible games/doors for the current user
var ICON_LOOKUP = {
    "THEPIT":"gladiator",
    "TW2002BBSLINK":"ufo",
	"LORD":"reddragon",
	"LORD2":"reddragon",
	"JEOPARDY":"jeopardy",
    "MAZERACE":"maze",
    "FATFISH":"fish",
    "BOGGLE":"boggle",
    "TETRIS":"tetris",
    "SOKOBAN":"synkroban",
    "BULLSEYE":"bullseye",
    "CHICKEN":"chicken",
    "STARTREK":"spock",
    "GOOBLE":"pacman",
    "DICEWARZ":"dicewars",
    "DICEWAR2":"dicewars",
    "STARSTOX":"starstocks",
    "GO-FOR":"gopher",
    "SBJ":"blackjack",
    "UBERBLOX":"uberblox",
    "KNK":"kingcomputer",
    "MSWEEPER":"minesweeper",
    "DRUGLORD":"drugwars",
    "GTTRIVIA":"goodtimes",
    "LEMONS":"lemons",
    "THIRSTY":"thirstyville",
    "WORDEM":"wordem"
}

function getGamesMenuItems() {
	if (typeof xtrn_area === 'undefined' || !xtrn_area.sec_list) return [];
	var items = [];
	var gameSec = xtrn_area.sec_list[1];
	if (!gameSec || !gameSec.can_access || !gameSec.prog_list) return items;
	for (var p = 0; p < gameSec.prog_list.length; p++) {
		var prog = gameSec.prog_list[p];
		if (!prog.can_access) continue;
		// Deterministic color from label/code
		var colorSeed = prog.name + prog.code;
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
			hotkey:null,
			action: (function(code, name) {
				return function() { bbs.exec_xtrn(code); };
			})(prog.code, prog.name)
		};
		if (ICON_LOOKUP.hasOwnProperty(prog.code.toUpperCase())) {
			item.iconFile = ICON_LOOKUP[prog.code.toUpperCase()];
		} else {
			item.iconBg = iconBg;
			item.iconFg = iconFg;
		}
		items.push(item);
	}
	items.sort(function(a, b) {
		var la = a.label.toLowerCase();
		var lb = b.label.toLowerCase();
		if (la < lb) return -1;
		if (la > lb) return 1;
		return 0;
	});
	return items;
}

// Export for use in iconshell.js
if (typeof exports !== 'undefined') exports.getGamesMenuItems = getGamesMenuItems;
