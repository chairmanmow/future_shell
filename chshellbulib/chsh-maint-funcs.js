load ("frame.js");


function refreshScreen()
{
console.clear();
	msgList(); 
	fixFrame();
	initChat();
	chatInputFeedback.center("Type a message to chat", BG_BLACK|chatInputFG);
	chatInputFeedback.cycle();
	
	subBoardFrame.top();
	menuFrame.top();
	menuFrame.top();
	dynamicFrame.top();
	chatInput.top();
	chatOutput.top();
	alertFrame.top();
	subBoardFrameTitle.top();	
	console.gotoxy(1,1);
	initDraw();
	chatOutput.refresh();
	subBoardFrame.draw();  // draw all the frames 
	menuFrame.draw();
	dynamicFrame.draw();
	chatOutput.draw();
	chatInput.draw();
	alertFrame.draw();
	subBoardFrameTitle.draw();
	menuBarFrame.draw();
	chatOutput.cycle();
	}

function fixFrame(){
	subBoardFrame.invalidate();
	menuFrame.invalidate();
	menuBarFrame.invalidate();
	dynamicFrame.invalidate();
	chatInput.invalidate();
	chatOutput.invalidate();
	alertFrame.invalidate();
	subBoardFrameTitle.invalidate();
	infoFrameA.invalidate();
	infoFrameB.invalidate();
	infoFrameC.invalidate();
	chatInputFeedback.invalidate();
	subBoardFrameTitle.cycle();
}

function alertFrameInit()
	{
				infoFrameA.clear();
				infoFrameA.center("Press TAB for Menu Mode", BG_BLACK|YELLOW);  // Most of these Warning Frame msg's can be moved to a function
				infoFrameA.cycle();
	}

	
// just some shit code to initialize the program outside of main() mostly related to frame dta


function firstDraw()
{
//default values to go in top right frame before program
//menuBarFrame.load("/sbbs/testjs/2x40.ans")

menuBarFrame.cleartoeol();
menuBarFrame.center("PRESS TAB TO SELECT MENU", menuBarFrameBG|menuBarFrameFG);
infoFrameA.clear();
infoFrameA.center("Press TAB to select menu", BG_BLACK|YELLOW);
infoFrameA.cycle();
menuBarFrame.cycle();
}

function initDraw ()
{

subBoardFrame.open();
menuFrame.open();
menuFrame.open();
dynamicFrame.open();
chatInput.open();
chatOutput.open();
alertFrame.open();
subBoardFrameTitle.open();
chatInputFeedback.open();
infoFrameA.open();
infoFrameB.open();
infoFrameC.open();
infoFrameA.draw();  // these look like they could be moved to first draw
infoFrameB.draw();
infoFrameC.draw();
chatInputFeedback.draw();
firstDraw();
drawMenu();
menuBarFrame.cycle(); 
}



