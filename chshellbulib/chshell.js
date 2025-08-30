js.branch_limit = 0;

load("sbbsdefs.js");
load("frame.js");  // for displaying frames
load("str_cmds.js"); // for working with strings
load("chshlayout.js");  // EDIT THIS FILE FOR LAYOUT CONFIGURATION
//load("chsh-chat-funcs.js");  // trying to move chat functions out of main run into problems
load("chsh-ctl-funcs.js");  // has most of the menu logic
load("chsh-maint-funcs.js");  // has things like screen redraws
load("chsh-msg-funcs.js");  // has the function that controls the bottom right frames
//load("rss-ticker.js");  // same problem with chat-funcs... moved to bottom of main
load("json-chat.js");  // needed for chat
load("json-client.js"); // see above
load("coldfuncs.js"); // i forget why i need this
load("event-timer.js");
load("rss-atom.js");

var tickerTimer = new Timer();
var timerCycle = new Timer();
var tickerTimerFeedTime = 15;  // interval in seconds
tickerTimerFeedTime = tickerTimerFeedTime * 1000;

var tickerEvent = tickerTimer.addEvent(tickerTimerFeedTime,true,tickerLoop);
var f = new Feed("http://www.grudgemirror.com/feed/");	
var rssItemIndex = 0;
var rssChannelIndex = 0;
var tickerLoopIndex = 0;
var rssArticleTitle = new Array();

var menuCtrl = 0;  // this variable is set to either 1 or 0 by the program depending on whether you are in chat or MENU MODE

var stop = new String;  //placeholder for command string to manage the global loop in main
stop = "go";  //set string to a value other than null probably unneccessary

//  ############## CHAT LOOP ####################  this is  my loop to keep chat going

function chatLoop() {
	while(stop != "stop")   //start chat loop
	{
		chatMain();
		rssTicker();
		chat.cycle();
		chatOutput.draw();
	}	
}


var msgstring = new String;
var chat_options = load("modopts.js","jsonchat");
var chat_client = new JSONClient(chat_options.host,chat_options.port);
var chat = new JSONChat(user.number,chat_client);
var channels = [];
var channels_map = [];
var channel_index = 0;

		

	
// ######### FUNCTION TO FIX ERRORS AND REBOOT LOOP AFTER EXECUTING MENU OPTION #####
function resumeMain() {
try{
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
	catch(chat_client){
		if(chat_client =='socket disconnected'){
			chat_client.connect();
			}
		}
	}

		

// main function does pretty much jack shit

function main()
{	
	resumeMain();	
}

main();


//  ####### MAIN CHAT FUNCTIONS I WOULD LIKE TO MOVE THIS TO ANOTHER FILE BUT I'm RUNNING INTO ERRORS ########
// this is the main chat loop which is largely unaltered from the original fschat with 2 changes to adapt for frame positioning

function initChat() {

	chatInput.clear();
	chatInput.cycle();
	chat.join("#main");
}

function chatMain() {					
	for(var c in chat.channels) { // check for channel messages and update local channel cache
		//this is intended to catch a disconnected socket

		var chan = chat.channels[c];				
		verifyLocalCache(chan); // verify this channels presence in the local cache */				
			/* display any new messages */
		while(chan.messages.length > 0){
			chatOutput.putmsg(printMessage(chan,chan.messages.shift()));
			}
				
	updateLocalCache();	// synchronize local cache with chat client 			 				 				 	
	chatInput.gotoxy(1,1);  
	getInput();  // This function is where the bulk of the action takes place that needs to be altered I think
}
}
	
function verifyLocalCache(chan) {
	if(channels_map[chan.name] == undefined) {
			
		dynamicFrame.cleartoeol();
		dynamicFrame.putmsg("joining channel: " + chan.name + " ", chanJoinBG|chanJoinFG);
		dynamicFrame.cleartoeol();
			
		channels_map[chan.name] = channels.length;
		channel_index = channels.length;
		channels.push(chan.name);
	}
}

function updateLocalCache() {
	/* verify local channel cache */
	for(var c in channels_map) {
		if(!chat.channels[c.toUpperCase()]) {
			dynamicFrame.cleartoeol();
			dynamicFrame.putmsg("parting channel: " + c);
			
			channels.splice(channels_map[c],1);
			delete channels_map[c];
			if(!channels[channel_index])
				channel_index = channels.length-1;
			}	
		}}

function chatInputClear(){  // this is just a simple thing to clear the frame when something happens that would be logical
	chatInput.clear();
	chatInput.cycle();
}
function printMessage(chan,msg) {
		// I deleted part of the original fschat code here that was broken and commented out

 // I'm not sure what this if statement is for I don't know if I've encountered it yet while running the program
 // I put it in a frame where it would seem out of place just so I can see if I notice an oddball message string
 // pertaining to the user nick.
 		
	if(!msg.nick)
	{
			dynamicFrame.cleartoeol();
			dynamicFrame.putmsg(msg.str);
			dynamicFrame.cycle();
			return;
	}
		

		msgstring =  "[" + chan.name + "]" + msg.nick.name + ":" + msg.str;  // this is the original code to construct a msgstring variable
		
			
		if(msg.nick.name == user.handle)
		{
		chatOutput.putmsg(chan.name, chatOutputChnMeBG|chatOutputChnMeFG);
		chatOutput.putmsg(msg.nick.name, chatOutputNickMeBG|chatOutputNickMeFG);  		
		chatOutput.putmsg(":" + msg.str,chatOutputMsgMeBG|chatOutputMsgMeFG);
		
		}
		else
		{
		chatOutput.putmsg(chan.name, chatOutputChnYouBG|chatOutputChnYouFG);
		chatOutput.putmsg(msg.nick.name, chatOutputNickYouBG|chatOutputNickYouFG);  		
		chatOutput.putmsg(":" + msg.str,chatOutputMsgYouBG| chatOutputMsgYouFG);
		}
	}


// ############ THE LEGENDARY CHAT 100 lines of code GET INPUT FUNCTION ###############
// THIS FUNCTION DOES A LOT OF THINGS INCLUDING PROCESS CHAT INPUT
// AND ALLOWING YOU TO GET TO THE MENU CONTROL FUNCTION

var msgString2 = new String;  // this is just a concatenated msgstring that includes inkey var k
var g = new String;  // this is just another container for getkey, inkey or getstr methods in case I need it to create a loop
	
function getInput() {

	var k = console.inkey();  // This gets the user input
	chatInput.gotoxy(1,1);
	chatInput.putmsg(k);
	chatInput.cycle();		
	if(k) {
		switch(k) {
		/* quit chat */
		case '\x1b':
		case KEY_UP:
		chatOutput.scroll(0,-1);
		break;
		case KEY_DOWN:
		chatOutput.scroll(0,+1);
		break;
		case ctrl('R'):
			caseDesc = "Change RSS Feed";
			commandConfirm();
			changeRSSFeed();
			refreshScreen();
			break;
		/* do nothing for CRLF on a blank line */
		case '\r':
		chatOutput.end();
		break;
		case '\n':
		chatOutput.end();
		break;
		/* switch to the next channel in our channel list */
		case '~':
			if(channels.length > 1) {
				channel_index++;
				if(channel_index >= channels.length)
					channel_index = 0;
				// chatOutput.attributes = chat_settings.NOTICE_COLOR;
				chatOutput.putmsg("now chatting in: " + channels[channel_index]);
			}
			break;
case '\t':
menuCtrl= 1;
menuControl();
			return;
		/* process a user command */
		/* case '/':
			// chatInput.attributes = chat_settings.COMMAND_COLOR;
			chatInput.putmsg(k + console.getstr(500), BG_LIGHTGRAY|RED);
			chat.getcmd(channels[channel_index],console.getstr(500));
			break; */
		/* process a sysop command */
		/*case ';':
			if(user.compare_ars("SYSOP") || bbs.sys_status&SS_TMPSYSOP) {
				// chatInput.attributes = chat_settings.COMMAND_COLOR;
				chatInput.putmsg(k);
				str_cmds(console.getstr(500));
			}
			break; */
		/* process all other input */
		default:
			/* send a message on return or switch to menu on tab  */
			msgString2 = k;
				while(k != '\r' && k != '\t'){
					g = console.getkey();
					chatInput.putmsg(g,chatInputBG|chatInputFG);  		
					msgString2 = msgString2 + g;
					chatInput.cycle(); 
					if(g == '\r' || g == '\n' || g == '\t'){
						if(g == '\t') {
						chatInputClear();
						menuCtrl = 1;
						menuControl();
						return;
						}
					else {
					break;
					}
				}
			} 	
		
			if(channels.length > 0) {		
			msgString2 = msgString2 + '\n';
			chat.submit(channels[channel_index],msgString2);  // changed code
			chatInputClear();
		}
		/* if we have not joined any channels, we cant send any messages */
		else {
			dynamicFrame.cleartoeol();
			dynamicFrame.putmsg("you must join a channel first");
		}
		break;
		}
	}
	
}

	
// #################### RSS TICKER CODE ###################

function rssTicker(){
	while(tickerTimer.events.length > 0) {			
			// iterate events list and run any events that are scheduled
			tickerTimer.cycle();
			mswait(200);
			break;
	}
}	

	
	function rssHeadline() {
	alertFrame.clear();
	alertFrame.putmsg(f.channels[rssChannelIndex].title + " ", channelTitleBG|channelTitleFG);  
		var chanUpdateTimeTrim = f.channels[rssChannelIndex].updated.substring(0, f.channels[rssChannelIndex].updated.indexOf(" +0000"));
		alertFrame.putmsg("\1rLast Updated " + chanUpdateTimeTrim, channelUpdateTimeBG|channelUpdateTimeFG);
		alertFrame.cycle();
		tickerLoopIndex++;
	}
	
	function rssArticle() {
		alertFrame.clear();
			alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].title.substring(0,79), BG_MAGENTA|itemUpdateFG);
			//alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].author + "");
			var itemUpdateTimeTrim = f.channels[rssChannelIndex].items[rssItemIndex].date.updated.substring(0,f.channels[rssChannelIndex].items[rssItemIndex].date.updated.indexOf(" +0000"));
			alertFrame.putmsg(itemUpdateTimeTrim + "", itemUpdateTimeBG|itemUpdateTimeFG);
			//alertFrame.putmsg(f.channels[rssChannelIndex].items[rssItemIndex].body + "");	
			alertFrame.cycle();
			rssArticleTitle[rssItemIndex] = "\1r" + itemUpdateTimeTrim + "\1y=-="  + f.channels[rssChannelIndex].items[rssItemIndex].title
			tickerLoopIndex++;
			rssItemIndex++;
			
	}
	

	
function tickerLoop(){
		var noOfArticles = f.channels[rssChannelIndex].items.length;
		if (tickerLoopIndex == 0)
		{
		
		rssHeadline();
		return;
		}
		while(tickerLoopIndex >= 1 && rssItemIndex < noOfArticles - 1)
		{
		if(rssItemIndex == noOfArticles - 1)
		{
			rssItemIndex = 0;
			alertFrame.clear();
			rssHeadline();	
			return;
		}
		rssArticle();	
		return;
		}
		if(tickerLoopIndex >= noOfArticles)
			{
			alertFrame.putmsg(rssArticleTitle[rssItemIndex]);
			rssItemIndex++;
			tickerLoopIndex++;
			if(rssItemIndex == noOfArticles)
				{
				alertFrame.clear();
				rssHeadline();
				alertFrame.cycle();
				rssItemIndex = 0;	
				tickerLoopIndex++;				
				}
				tickerLoopIndex++;
				return;
		}
		tickerLoopIndex++;
		return;
		}
	
function changeRSSFeed()
{
	console.clear();
	console.putmsg("Enter a new RSS feed");
	f = console.getstr();
	tickerLoopIndex = 0;
}	