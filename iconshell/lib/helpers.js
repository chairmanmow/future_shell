// Helper functions for IconShell and related modules

// function buildIconGrid(parentFrame, items) {
// 	var iconW = ICSH_CONSTANTS.ICON_W;
// 	var iconH = ICSH_CONSTANTS.ICON_H;
// 	var labelH = 1;
// 	var cellW = iconW + 2;
// 	var cellH = iconH + labelH + 2;
// 	var cols = Math.max(1, Math.floor(parentFrame.width / cellW));
// 	var maxRows = Math.max(1, Math.floor(parentFrame.height / cellH));
// 	if (maxRows < 1 || cols < 1) {
// 		var msg = "[Screen too small for icons]";
// 		var msgX = Math.max(1, Math.floor((parentFrame.width - msg.length) / 2));
// 		var msgY = Math.max(1, Math.floor(parentFrame.height / 2));
// 		parentFrame.gotoxy(msgX, msgY);
// 		parentFrame.putmsg(msg);
// 		return { cells: [], cols: 0, rows: 0, iconW: iconW, iconH: iconH };
// 	}
// 	var maxIcons = cols * maxRows;
// 	var cells = [];
// 	var Icon = load("iconshell/lib/icon.js");
// 	for (var i = 0; i < items.length && i < maxIcons; i++) {
// 		var col = i % cols;
// 		var row = Math.floor(i / cols);
// 		var x = (col * cellW) + 2;
// 		var y = (row * cellH) + 1;
// 		var hasBg = typeof items[i].iconBg !== 'undefined';
// 		var hasFg = typeof items[i].iconFg !== 'undefined';
// 		var iconAttr = 0;
// 		if (hasBg || hasFg) {
// 			iconAttr = (hasBg ? items[i].iconBg : 0) | (hasFg ? items[i].iconFg : 0);
// 		}
// 		var iconFrame = new Frame(x, y, iconW, iconH, iconAttr, parentFrame);
// 		var labelFrame = new Frame(x, y + iconH, iconW, labelH, BG_BLACK|LIGHTGRAY, parentFrame);
// 		var iconObj = new Icon(iconFrame, labelFrame, items[i]);
// 		iconObj.render();
// 		cells.push({ icon: iconFrame, label: labelFrame, item: items[i], iconObj: iconObj });
// 	}
// 	var rows = Math.ceil(Math.min(items.length, maxIcons) / cols);
// 	return { cells: cells, cols: cols, rows: rows, iconW: iconW, iconH: iconH };
// }



function execItem(name) {
	// Placeholder integration point for doors/external commands
	// e.g., bbs.exec_xtrn("INTERNAL_CODE");
	console.clear();
	console.crlf();
	console.putmsg("\x01h\x01cLaunching: \x01w" + name + "\x01n");
	console.crlf();
	mswait(600);
}

function repeatChar(ch, n) {
	var out = "";
	while (n-- > 0) out += ch;
	return out;
}


