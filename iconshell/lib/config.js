load("iconshell/lib/whosonline.js");
load("iconshell/lib/gamesmenu.js");

var ICSH_CONSTANTS = {
    "ICON_W":12,
    "ICON_H":6
}

// IconShell configuration: menu structure, labels, icons, and actions
var ICSH_CONFIG = {
	label: "Home",
	type: "folder",
    "viewId":"view1",
	children: [
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
