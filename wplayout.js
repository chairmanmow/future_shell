load("frame.js");

if(!js.global.frame instanceof Frame)
	js.global.frame = new Frame();
	
var outputFrame = new Frame(
	x=		1,
	y=		3,
	width=	console.screen_columns - 25,
	height=	console.screen_rows-2,
	attr= BG_BLUE|YELLOW,
	parent=	js.global.frame
);

var statusFrame = new Frame(
	x=		1,
	y=		1,
	width=	console.screen_columns - 25,
	height=	2,
	attr= BG_GREEN|LIGHTGREEN,
	parent=	js.global.frame
);


var menuFrame = new Frame(
	x=		outputFrame.width + 1,
	y=		1,
	width=	25,
	height=	Math.ceil(console.screen_rows/2),
	attr= BG_RED|WHITE,
	parent=	js.global.frame
);

var otherFrame = new Frame(
	x=		outputFrame.width + 1,
	y=		menuFrame.height + 1,
	width=	25,
	height=	Math.floor(console.screen_rows/2),
	attr= BG_CYAN|BLACK,
	parent=	js.global.frame
);

function openFrames(){
outputFrame.open();
menuFrame.open();
otherFrame.open();
statusFrame.open();
}

function fixFrames()
{
outputFrame.invalidate();
menuFrame.invalidate();
otherFrame.invalidate();
statusFrame.invalidate();
}

function clearFrames()
{
outputFrame.clear();
otherFrame.clear();
statusFrame.clear();
}

openFrames();

