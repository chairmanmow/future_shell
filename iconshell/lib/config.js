
load("iconshell/lib/whosonline.js");
load("iconshell/lib/gamesmenu.js");

// Centralized color configuration for IconShell
var ICSH_VALS = {
	ROOT:   { BG: BG_BLACK,     FG: LIGHTGRAY },
	VIEW:   { BG: BG_BLACK,     FG: LIGHTGRAY },
	CRUMB:  { BG: BG_BLUE,      FG: WHITE     },
	SELECTED: { BG: BG_BLUE,    FG: WHITE     },
	LABEL:  { BG: BG_BLACK,     FG: LIGHTGRAY },
	UPITEM: { BG: BG_LIGHTGRAY, FG: BLACK     },
	ANIMATION: { COLOR: GREEN },
	EXTERNAL_BG: BG_BLACK,
	EXTERNAL_FG: LIGHTGRAY
	// Add more as needed for other UI elements
};

// IconShell configuration: menu structure, labels, icons, and actions
var ICSH_CONFIG = {
	label: "Home",
	type: "folder",
    "viewId":"view1",
	children: [{
			label: "Chat",
			type: "item",
			iconFile: "chat",
			action: function() {
				this.launchSubprogram("chat", this.chat);
			}
		},
		{
			label: "Games",
			type: "folder",
			iconFile: "redman",
            "viewId":"view2",
			get children() {
				// Always return a fresh array for hotkey assignment
				return getItemsForXtrnSection(1);
			}
		},
				{
			label: "Apps",
			type: "folder",
			iconFile: "redman",
            "viewId":"view10",
			get children() {
				// Always return a fresh array for hotkey assignment
				return getItemsForXtrnSection(0);
			}
		},
		{ label: "Messages", viewId:"view3",  type: "item", iconFile:"messages", action: function(){ this.runExternal(function(){ bbs.exec_xtrn("ECREADER"); }); } },
		{ label: "Files", viewId:"view4",   type: "item", iconFile:"folder", action:function(){ this.runExternal(function(){ bbs.exec_xtrn("ANSIVIEW"); }); } },
		{
			label: "Who",
			type: "folder",
			iconFile: "whosonline",
            viewId:"view5",
			get children() {
				// Always return a fresh array for hotkey assignment
				return getOnlineUserIcons();
			}
		},
		{ label: "Settings", type: "item", iconFile: "mario",viewId:"view7", action: function() {
			if (typeof bbs.user_config === 'function') {
				bbs.user_config();
			} else {
				console.clear();
				console.putmsg("\x01h\x01cUser settings editor not available.\x01n\r\n");
				mswait(1000);
			}
		} },
		{ label: "Exit",      type: "item", iconFile:"exit", action: function(){ throw("Exit Shell"); } }
	]
};

// Do not change.
var ICSH_CONSTANTS = {
    "ICON_W":12,
    "ICON_H":6
}


