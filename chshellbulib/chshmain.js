js.branch_limit = 0;
load("sbbsdefs.js")
load("frame.js")
load("str_cmds.js");
load("chshlayout.js");
load("chsh-chat-funcs.js");
load("chsh-ctl-funcs.js");
load("chsh-maint-funcs.js");
load("chsh-msg-funcs.js");
load("json-chat.js");
load("json-client.js");
load("coldfuncs.js");
load("event-timer.js");
load("rss-atom.js");
load("rss-ticker.js");


var menuCtrl = 0;  // this variable is set to either 1 or 0 by the program depending on whether you are in chat or MENU MODE

var stop = new String;  //placeholder for command string to manage the global loop in main
stop = "go";  //set string to a value other than null probably unneccessary

//  ############## CHAT LOOP ####################  this is  my loop to keep chat going
// the program can be aborted with Ctrl-Q while in this loop
function chatLoop()
	{
	while(stop != "stop")   //start chat loop
	{
		chatMain();
		rssTicker();
		chat.cycle();
		chatOutput.draw();
	}
	}
	
// ######### FUNCTION TO FIX ERRORS AND REBOOT LOOP AFTER EXECUTING MENU OPTION #####
function resumeMain()
{
	refreshScreen();
	chatLoop();
	while(1)
	{
	if(menuCtrl == 1)
	{
	menuControl();
	}
	
}
}
function main()
{	
	resumeMain();	
}

main();

	