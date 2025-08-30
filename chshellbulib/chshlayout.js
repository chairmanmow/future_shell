load("sbbsdefs.js");
load("frame.js");

// ########################### COLOR VARIABLES AND DECLARATIONS v . 2 #######################################

//RSS ticker colors
	var channelTitleBG = BG_RED;
	var channelUpdateTimeBG = BG_GREEN;
	var itemUpdateTimeBG = BG_BLACK;
	
	var channelTitleFG = YELLOW;
	var channelUpdateTimeFG = CYAN;
	var itemUpdateFG = YELLOW;
	var itemUpdateTimeFG = CYAN;

//BG COLORS
chatOutputBG = BG_BLACK;
chatInputBG = BG_LIGHTGRAY;
msgBoardBG = BG_RED;
msgBoardDateBG = BG_BLUE;
msgBoardNameBG = BG_MAGENTA;
msgBoardNameMeBG = BG_GREEN;
msgBoardTopicBG = BG_RED;
msgBoardTitleBG = BG_BROWN;
dynamicFrameBG = BG_MAGENTA;
alertFrameBG = BG_CYAN;
menuFrameBG = BG_BLUE;
menuBarFrameBG = BG_BLACK;
chatOutputChnMeBG = BG_BLACK;
chatOutputChnYouBG = BG_BLACK;
chatOutputNickMeBG = BG_CYAN;
chatOutputNickYouBG = BG_BLUE;
chatOutputMsgMeBG = BG_BLACK;
chatOutputMsgYouBG = BG_BLACK;
chanJoinBG = BG_CYAN;
infoFrameABG = BG_BLACK;
infoFrameBBG = BG_GREEN;
infoFrameCBG = BG_GREEN;

// Foreground colors

chatOutputFG = GREEN;
chatInputFG = RED;
msgBoardFG = MAGENTA;
msgBoardDateFG = YELLOW;
msgBoardNameFG = YELLOW;
msgBoardNameMeFG = LIGHTCYAN;
msgBoardTopicFG = LIGHTCYAN;
msgBoardTitleFG = WHITE;
dynamicFrameFG = YELLOW;
alertFrameFG = DARKGRAY;
menuFrameFG = BLACK;
menuBarFrameFG = LIGHTCYAN;
chatOutputChnMeFG = CYAN;
chatOutputChnYouFG = GREEN;
chatOutputNickMeFG = RED;
chatOutputNickYouFG = LIGHTMAGENTA;
chatOutputMsgMeFG = RED;
chatOutputMsgYouFG = YELLOW;
chanJoinFG = YELLOW;
infoFrameAFG = LIGHTRED;
infoFrameBFG = WHITE;
infoFrameCFG = LIGHTCYAN;


//this draws the in the top right frame a menu and is mostly a stub for now as it's easy
function drawMenu()
{

	menuFrame.load("/sbbs/testjs/13x40.txt");
	menuFrame.draw();
}

// neccessary to set up frames

if(!js.global.frame instanceof Frame)
	js.global.frame = new Frame();

// FRAME DECLARATIONS - declared here are all the frames and their settings
var xScreenColumns = console.screen_columns;
var yScreenRows = console.screen_rows;

var alertFrame = new Frame(
	x=		1,
	y=		1,
	width=	80,
	height=	1,
	attr= dynamicFrameBG|dynamicFrameFG,
	parent=	js.global.frame
);
var chatOutputHeight = yScreenRows-12;

var chatOutput = new Frame(
	x=		1,
	y=		2,
	width=	40,
	height=	chatOutputHeight,
	attr= chatOutputBG|chatOutputFG,
	parent=	js.global.frame
);
var chatInputYpos = yScreenRows-10;

var chatInput = new Frame(
	x=		1,
	y=		chatInputYpos,
	width=	40,
	height=	4,
	attr= chatInputBG|chatInputFG,
	parent=	js.global.frame
);
var chatInputFeedback = new Frame(
	x=		1,
	y=		chatInputYpos + 4,
	width=	40,
	height=	1,
	attr= BG_BLACK|RED,
	parent=	js.global.frame
);

	// ###### THIS DECLARATION LOOKS DECEIVING
var alertFrameYpos = yScreenRows-5;  // the nomenclature of the variables is screwy here because i changed the name of the frames but this should draw properly for dynamicFrame

var dynamicFrame = new Frame(
	x=		1,
	y=		alertFrameYpos,
	width=	40,
	height=	6,
	attr= alertFrameBG|alertFrameFG,
	parent=	js.global.frame
);

var menuBarFrame = new Frame(
	x=		41,
	y=		2,
	width=	40,
	height=	1,
	attr= menuBarFrameBG|menuBarFrameFG,
	parent=	js.global.frame
);
var menuFrame = new Frame(
	x=		41,
	y=		3,
	width=	40,
	height=	13,
	attr= menuFrameBG|menuFrameFG,
	parent=	js.global.frame
);
var infoFrameA = new Frame(
x=		41,
	y=		16,
	width=	40,
	height=	1,
	attr= infoFrameABG|infoFrameAFG,
	parent=	js.global.frame
	)

	var infoFrameB = new Frame(
x=		41,
	y=		17,
	width=	40,
	height=	1,
	attr= infoFrameBBG|infoFrameBFG,
	parent=	js.global.frame
	)
	

	
var subBoardFrameTitle = new Frame(
	x=		41,
	y=		18,
	width=	40,
	height=	1,
	attr= msgBoardTitleBG|msgBoardTitleFG,
	parent=	js.global.frame
);


var subBoardFrameHeight = yScreenRows-19;

var subBoardFrame = new Frame(
	x=		41,
	y=		19,
	width=	40,
	height=	subBoardFrameHeight,
	attr= msgBoardBG|msgBoardFG,
	parent=	js.global.frame
);
	var infoFrameC = new Frame(
	x=		41,
	y=		19 + subBoardFrameHeight,
	width=	40,
	height=	1,
	attr= infoFrameCBG|infoFrameCFG,
	parent=	js.global.frame
	)	


