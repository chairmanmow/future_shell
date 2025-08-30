// this file has a lot of functions for maintaining the frames
// refreshScreen and fixFrame are called often
// the other functions are mainly for first draws and initialization
load ("frame.js");

function refreshScreen() {
	console.clear();
	msgList(); 
	initDraw();
	fixFrame();
	initChat();
	chatInputFeedback.center("Type a message to chat", BG_BLACK|chatInputFG);
	console.gotoxy(1,1);
	chatOutput.refresh();
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

	
// just some shit code to initialize the program outside of main() mostly related to frame dta

function firstDraw(){
menuBarFrame.cleartoeol();
menuBarFrame.center("PRESS TAB TO SELECT MENU", menuBarFrameBG|menuBarFrameFG);
infoFrameA.clear();
infoFrameA.center("Press TAB to select menu", BG_BLACK|YELLOW);
infoFrameA.cycle();
}

function openFrames() {
	subBoardFrame.open();
	menuFrame.open();
	menuFrame.open();
	dynamicFrame.open();
	chatInput.open();
	chatOutput.open();
	alertFrame.open();
	menuBarFrame.open();
	subBoardFrameTitle.open();
	chatInputFeedback.open();
	infoFrameA.open();
	infoFrameB.open();
	infoFrameC.open();
}

function initDraw (){
	firstDraw();
	
	infoFrameA.draw();  
	infoFrameB.draw();
	infoFrameC.draw();
	subBoardFrame.draw();  // draw all the frames 
	menuFrame.draw();
	dynamicFrame.draw();
	chatOutput.draw();
	chatInput.draw();
	alertFrame.draw();
	subBoardFrameTitle.draw();
	menuBarFrame.draw();
	chatInputFeedback.draw();
	drawMenu();
}



