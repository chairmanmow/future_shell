load("frame.js");
load("str_cmds.js");
load("json-chat.js");
load("json-client.js");

	var msgstring = new String;
	var chat_options = load("modopts.js","jsonchat");
	var chat_client = new JSONClient(chat_options.host,chat_options.port);
	var chat = new JSONChat(user.number,chat_client);
	var channels = [];
	var channels_map = [];
	var channel_index = 0;

		
function initChat() {

	chatInput.clear();
	chatInput.cycle();
	chat.join("#main");
}

	//  ####### MAIN CHAT FUNCTIONS ########
// this is the main chat loop which is largely unaltered from the original fschat with 2 changes to adapt for frame positioning

	function chatMain() {					
			for(var c in chat.channels) // check for channel messages and update local channel cache
				{
					var chan = chat.channels[c];				
					verifyLocalCache(chan);  // verify this channels presence in the local cache */			
							/* display any new messages */
						while(chan.messages.length > 0) 
			
							chatOutput.putmsg(printMessage(chan,chan.messages.shift()));
				}			
			updateLocalCache();	// synchronize local cache with chat client 			 				 				 	
			chatInput.gotoxy(1,1);  // This line was added to make sure the cursor takes input at the proper position on the screen
			getInput();  // This function is where the bulk of the action takes place that needs to be altered I think
			//  before or after this function is a possible place I've considered putting the code to fix the echo, but I don't think it's a good place			
			
		}
	
// this function has been unchanged aside for frame location and in some ways i dont understand how it works
// executed during chatMain for var c in chat.channels[c] to verify channels presence in local cache
// however it looks like it basically CHECKS TO SEE IF YOU'RE IN A CHANNEL AND IF YOU ARE TO DISPLAY A MESSAGE
// THAT YOU ARE JOINING THE CHANNEL AND TWEEKING SOME VARIABLES AFTERWARDS.

function verifyLocalCache(chan) {
	if(channels_map[chan.name] == undefined) {
		
			// dynamicFrame.attr = chat_settings.NOTICE_COLOR;
			dynamicFrame.cleartoeol();
		dynamicFrame.putmsg("joining channel: " + chan.name + " ", chanJoinBG|chanJoinFG);
		dynamicFrame.cleartoeol();
	
		
		channels_map[chan.name] = channels.length;
		channel_index = channels.length;
		channels.push(chan.name);
	}
}

// this function has been unchanged aside for frame location and in some ways i dont understand how it works
// executed after verify local cache runs and while loop when chan.msg.length is more than zero 
// which puts a message in the chatOutput printMessage(chan,chan.messages.shift())
// which probably means to put the channel output and shift an array so that it can reach zero
// however it looks like it basically CHECKS TO SEE IF YOU'RE IN A CHANNEL AND IF YOU'RE NOT TO DISPLAY A MESSAGE
// THAT YOU ARE PARTING THE CHANNEL AND TWEEKING/DELETING SOME VARIABLES AFTERWARDS

function updateLocalCache() {
	/* verify local channel cache */
	for(var c in channels_map) {
		if(!chat.channels[c.toUpperCase()]) {
		
			// dynamicFrame.attr = chat_settings.NOTICE_COLOR;
			dynamicFrame.cleartoeol();
			dynamicFrame.putmsg("parting channel: " + c);
			
			channels.splice(channels_map[c],1);
			delete channels_map[c];
			if(!channels[channel_index])
				channel_index = channels.length-1;
			}	
		}
	}

// This is the function that outputs a message and assembles the string for proper output into the local chatOutput frame
// I have made some changes to this from the original fschat, but they seem to be functioning as intended
// mostly for local display purpose since it only deals with putting messages into frames and not dealing with the chat variables themselves
	function chatInputClear(){
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
//
// I created the following variable(s) because ...ABOUT THE FOLLOWING VARIABLES
// the chatOutput was missing the first letter upon submission, (i.e. "ello" as oppose to "hello" which was also the variable k
// so msgString2 is intended to merge it with var k into one string for proper output, 
var msgString2 = new String;  // this is just a concatenated msgstring that includes inkey var k
var g = new String;  // this is just another container for getkey, inkey or getstr methods in case I need it to create a loop


// ############ THE LEGENDARY GET INPUT FUNCTION ####
// This function exists from the original FSchat program, and once you begin the program it will execute and come to this point
// A lot of it has been taken in some way from
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
				//chatInput.cycle();
				/* send a message to the current channel */
				msgString2 = k;
					while(k != '\r' && k != '\t')
		{
		g = console.getkey();
		chatInput.putmsg(g,BG_LIGHTGRAY|RED);  // AN ECHO WORKS HERE, BUT FOR ONE LETTERo, it's the characters after that that are a problem		
		msgString2 = msgString2 + g;
		chatInput.cycle(); 
		if(g == '\r' || g == '\n' || g == '\t')
		{
		if(g == '\t')
		{
		chatInputClear();
		menuCtrl = 1;
		menuControl();
		return;
		}
		else
		{
		break;
		}
		}
		} 	
			
				if(channels.length > 0) {
				
				msgString2 = msgString2 + '\n';
					  // new variable to see if we can concatenate the strings (so chat output isn't truncated missing variable k)
					//chatInput.putmsg(msgString2,BG_LIGHTGRAY|RED);  // this code needs to be altered and put somewhere else so it is dynamically updated
					//chatInput.cycle();  // this also needs to be put somewhere as it goes with the above lines
					chat.submit(channels[channel_index],msgString2);  // changed code
					chatInputClear();
				}
				/* if we have not joined any channels, we cant send any messages */
				else {
					// dynamicFrame.attr = chat_settings.ALERT_COLOR;
					dynamicFrame.cleartoeol();
					dynamicFrame.putmsg("you must join a channel first");
				}
				break;
			}
		}
		
	}
		