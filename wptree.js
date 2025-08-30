load("tree.js");

var tree=new Tree(menuFrame,"My Menu");
tree.colors = {
		fg:LIGHTMAGENTA,
		// non-current item/empty space background 
		bg:BG_BLUE,
		// current item foreground
		lfg:LIGHTGREEN,
		// current item background
		lbg:BG_GREEN,
		// current tree heading foreground
		cfg:WHITE,
		// current tree heading background
		cbg:BG_BLACK,
		// disabled item foreground
		dfg:DARKGRAY,
		// hotkey foreground
		kfg:YELLOW,
		// tree branch foreground
		tfg:BLUE,
		// tree heading foreground
		hfg:WHITE,
		// tree heading background
		hbg:BG_BLUE,
		// tree expansion foreground
		xfg:LIGHTCYAN
	}
	
tree.addItem("quit",quitApp);
tree.addItem("reqyest start",requestStart);
tree.addItem("get routes",getBody);
tree.addItem("request headers",requestHeaders);

tree.open();

function quitApp() {
loopCtl = 0;
}

