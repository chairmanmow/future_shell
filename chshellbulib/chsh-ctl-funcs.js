// THIS NEEDS FIXING WITH REGARDS TO MAYBE LOADING IN ANSI AS OPPOSE TO THE GHETOO PUT MESSAGES
function switchOutMenu(){
	infoFrameA.clear();
	infoFrameA.center("Press TAB to select menu", BG_BLACK|YELLOW);
	infoFrameA.cycle();
				menuBarFrame.cleartoeol();
				menuBarFrame.center("CHAT MODE ON. MENU DISABLED\r", menuBarFrameBG|menuBarFrameFG);
				menuBarFrame.cycle();
				alertFrameInit();
				menuCtrl = 0;
				chatInput.gotoxy(1,3);
				alertFrame.cycle();
}
var caseDesc = new String;

function menuControl()
{
  // for Command Confirm to describe the item etc before exiting the loop
	
	menuBarFrame.clear();
	menuBarFrame.center("MENU MODE IS ACTIVE\r", menuBarFrameBG|menuBarFrameFG);// THIS NEEDS FIXING WITH REGARDS TO MAYBE LOADING IN ANSI AS OPPOSE TO THE GHETOO PUT MESSAGES
	infoFrameA.clear();
	infoFrameA.center("Make a selection from above", BG_BLACK|GREEN);
	infoFrameA.cycle();
	drawMenu();  // this looks extraneous
	var menuTimer = new Timer();
	var switchEvent = menuTimer.addEvent(14000,1,switchOutMenu);
	menuBarFrame.cycle();
	tickerTimer.cycle();
		while(menuCtrl == 1)
				{
				menuTimer.cycle();
				chat.cycle();
				chatOutput.cycle();
			var k2 = console.inkey(timeout = 6900,K_UPPER);  // this variable is called k2 because it represents a similar function to k in chatMain()
				
				if(k2) 
					{
			switch(k2.toUpperCase()) {
			case '\t':   // this is what happens when the menu is aborted
				switchOutMenu(); 
				return;
			case 'A':
			caseDesc = "\1yA\1cuto BBS Message";
			commandConfirm();
			bbs.auto_msg();
			refreshScreen();
			return;

		case 'B':
			caseDesc = "\1yB\1crowse New Messages";
			commandConfirm();
			console.print("\r\nchBrowse/New Message Scan\r\n");
			bbs.scan_subs(SCAN_NEW|SCAN_BACK);
			refreshScreen();
			return;

		case 'C':
			caseDesc = "\1yC\1chat Section";
			commandConfirm();
			load("chat_sec.js");
			refreshScreen();
			return;

		case 'D':
			caseDesc = "\1yD\1cefault User Settings";
			commandConfirm();
			bbs.user_config();
			refreshScreen();
			return;

		case 'E':
			caseDesc = "\1yE\1c-mail";
			commandConfirm();
			email();
			refreshScreen();
			return;

		case 'F':
			caseDesc = "\1yF\1cind Text in Message Groups";
			commandConfirm();
			console.print("\r\nchFind Text in Messages\r\n");
			bbs.scan_subs(SCAN_FIND);
			return;
		case '/T':
			caseDesc = "\1yF\1cind Text in Message Groups";
			commandConfirm();
			bbs.scan_subs(SCAN_FIND,true);
			refreshScreen();
			return;

		case 'T':
			caseDesc = "\1yG\1chetto Text Section";
			commandConfirm();
			bbs.text_sec();
			refreshScreen();
			return;

		case 'I':
			caseDesc = "\1yI\1cnfo for this BBS";
			commandConfirm();
			main_info();
			refreshScreen();
			return;

		case 'Q':
			caseDesc = "\1yJ\1cump to Another Forum";
			commandConfirm();
			if(!msg_area.grp_list.length)
				refreshScreen();
			while(1) {
				var orig_grp=bbs.curgrp;
				var i=0;
				var j=0;
				if(msg_area.grp_list.length>1) {
					if(file_exists(system.text_dir+"menu/grps.*"))
						bbs.menu("grps");
					else {
						console.putmsg(bbs.text(CfgGrpLstHdr),P_SAVEATR);
						for(i=0; i<msg_area.grp_list.length; i++) {
							if(i==bbs.curgrp)
								console.print('*');
							else
								console.print(' ');
							if(i<9)
								console.print(' ');
							if(i<99)
								console.print(' ');
							console.putmsg(format(bbs.text(CfgGrpLstFmt),i+1,msg_area.grp_list[i].description),P_SAVEATR);
						}
					}
					console.mnemonics(format(bbs.text(JoinWhichGrp),bbs.curgrp+1));
					j=get_next_num(msg_area.grp_list.length,false);
					if(j<0)
						refreshScreen();
					if(!j)
						j=bbs.curgrp;
					else
						j--;
				}
				bbs.curgrp=j;
				if(file_exists(system.text_dir+"menu/subs"+(bbs.curgrp+1)))
					bbs.menu("subs"+(bbs.curgrp+1));
				else {
					commandConfirm();
					console.putmsg(format(bbs.text(SubLstHdr), msg_area.grp_list[j].description),P_SAVEATR);
					for(i=0; i<msg_area.grp_list[j].sub_list.length; i++) {
						var msgbase=new MsgBase(msg_area.grp_list[j].sub_list[i].code);
						if(msgbase==undefined)
							continue;
						if(!msgbase.open())
							continue;
						if(i==bbs.cursub)
							console.print('*');
						else
							console.print(' ');
						if(i<9)
							console.print(' ');
						if(i<99)
							console.print(' ');
						console.putmsg(format(bbs.text(SubLstFmt),i+1, msg_area.grp_list[j].sub_list[i].description,"",msgbase.total_msgs),P_SAVEATR);
						msgbase.close();
					}
				}
				console.mnemonics(format(bbs.text(JoinWhichSub),bbs.cursub+1));
				i=get_next_num(msg_area.grp_list[j].sub_list.length,false);
				if(i==-1) {
					if(msg_area.grp_list.length==1) {
						bbs.curgrp=orig_grp;
						refreshScreen();
					}
					continue;
				}
				if(!i)
					i=bbs.cursub;
				else
					i--;
				bbs.cursub=i;
				refreshScreen();
				return;
}
		case 'L':
			caseDesc = "\1yL\1cist Node Activity";
			commandConfirm();
			bbs.list_nodes();
			refreshScreen();
			return;

		case 'B':
			caseDesc = "\1yM\1canage Time Bank";
			commandConfirm();
			bbs.time_bank();
			refreshScreen();
			return;

		case 'N':
			caseDesc = "\1yN\1cew Message Scan";
			commandConfirm();
			console.print("\r\nchNew Message Scan\r\n");
			bbs.scan_subs(SCAN_NEW);
			refreshScreen();
			return;

		case '/N':
			caseDesc = "\1yN\1cew Message Scan";
			commandConfirm();
			bbs.scan_subs(SCAN_NEW,true);
			refreshScreen();
			return;

		case 'K':
			caseDesc = "\1yBK\1cill Session \1r\1h  WARNING THIS WILL LOG YOU OFF!";
			commandConfirm();
			if(bbs.batch_dnload_total) {
				if(console.yesno(bbs.text(DownloadBatchQ))) {
					bbs.batch_download();
					bbs.logoff();
					refreshScreen();
					return;
				}
			}
			else
				bbs.logoff();
				refreshScreen();
				
			return;

		case '/O':
			commandConfirm();
			if(bbs.batch_dnload_total) {
				if(console.yesno(bbs.text(DownloadBatchQ))) {
					bbs.batch_download();
					bbs.hangup();
				}
			}
			else
				bbs.hangup();
				refreshScreen();
			return;

		case 'P':
			caseDesc = "\1yP\1cost a Message";
			commandConfirm();
			bbs.post_msg();
			refreshScreen();
			return;

		/*case 'Q':	
			caseDesc = "\1yQ\1cWK PACKET SECTION";
			commandConfirm();
			bbs.qwk_sec();
			refreshScreen();
		*/	return;

		case 'R':
			caseDesc = "\1yR\1cead Forums";
			commandConfirm();
			bbs.scan_posts();
			refreshScreen();
			return;

		case 'Y':
			caseDesc = "\1yY\1cour messages";
			commandConfirm();
			console.print("\r\nchScan for Messages Posted to You\r\n");
			bbs.scan_subs(SCAN_TOYOU);
			refreshScreen();
			return;

		case '/S':
			caseDesc = "\1yS\1ccan for Messages To You";
			commandConfirm();
			console.print("\r\nchScan for Messages Posted to You\r\n");
			bbs.scan_subs(SCAN_TOYOU,true);
			refreshScreen();
			return;

		case 'U':
			caseDesc = "\1yU\1cserlist Display";
			commandConfirm();
			console.print("\r\nchList Users\r\n");
			console.mnemonics("\r\n~Logons Today, ~Sub-board, or ~All: ");
			switch(get_next_keys("LSA",false)) {
				case 'L':
					bbs.list_logons();
					refreshScreen();
					return;
				case 'S':
					bbs.list_users(UL_SUB);
					refreshScreen();
					return;
				case 'A':
					bbs.list_users(UL_ALL);
					refreshScreen();
					return;
			}
			// fall-through for CR, Ctrl-C, etc
			refreshScreen();
			return;

		case '/U':
			caseDesc = "\1yU\1cserlist Display (Entire)";
			commandConfirm();
			bbs.list_users(UL_ALL);
			refreshScreen();
			return;
			
		case 'G':
			caseDesc = "\1ce\1yX\1ctra SPECIAL FUN";
			commandConfirm();
			bbs.xtrn_sec();
			refreshScreen();
			return;

		case 'V':
			caseDesc = "\1yV\1ciew messages in Forum";
			commandConfirm();
			load("../xtrn/ddml_136/DigitalDistortionMessageLister.js")
			// console.print("\r\nchContinuous New Message Scan\r\n");
			// bbs.scan_subs(SCAN_NEW|SCAN_CONST);
			refreshScreen();
			return;
			
			case '/F':
			caseDesc = "FILE TRANSFER";
			commandConfirm();
			load("../xtrn/ddac_105/DDFileAreaChooser.js")
			refreshScreen();
			return;
			
			case 'J':
			caseDesc = "Change message Areas";
			commandConfirm();
			load("../xtrn/ddac_105/DDMsgAreaChooser.js")
			refreshScreen();
			return;

		case '/Z':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			bbs.scan_subs(SCAN_NEW|SCAN_CONST,true);
			refreshScreen();
			return;

		case '*':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			if(!msg_area.grp_list.length)
				refreshScreen();
				return;
			if(file_exists(system.text_dir+"menu/subs"+(bbs.cursub+1)))
				bbs.menu("subs"+(bbs.cursub+1));
			else {
				var i;

				console.clear();
				console.putmsg(format(bbs.text(SubLstHdr), msg_area.grp_list[bbs.curgrp].description),P_SAVEATR);
				for(i=0; i<msg_area.grp_list[bbs.curgrp].sub_list.length; i++) {
					var msgbase=new MsgBase(msg_area.grp_list[bbs.curgrp].sub_list[i].code);
					if(msgbase==undefined)
						continue;
					if(!msgbase.open())
						continue;
					if(i==bbs.cursub)
						console.print('*');
					else
						console.print(' ');
					if(i<9)
						console.print(' ');
					if(i<99)
						console.print(' ');
					console.putmsg(format(bbs.text(SubLstFmt),i+1, msg_area.grp_list[bbs.curgrp].sub_list[i].description,"",msgbase.total_msgs),P_SAVEATR);
					msgbase.close();
				}
			}
			return;

		case '/*':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			if(msg_area.grp_list.length) {
				var i=0;
				if(file_exists(system.text_dir+"menu/grps.*"))
					bbs.menu("grps");
				else {
					console.putmsg(bbs.text(GrpLstHdr),P_SAVEATR);
					for(i=0; i<msg_area.grp_list.length; i++) {
						if(i==bbs.curgrp)
							console.print('*');
						else
							console.print(' ');
						if(i<9)
							console.print(' ');
						if(i<99)
							console.print(' ');
						// We use console.putmsg to expand ^A, @, etc
						console.putmsg(format(bbs.text(GrpLstFmt),i+1,msg_area.grp_list[i].description,"",msg_area.grp_list[i].sub_list.length),P_SAVEATR);
					}
				}
			}
			refreshScreen();
			return;

		case '&':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			main_cfg();
			refreshScreen();
			return;

		case '#':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			console.print("\r\nchType the actual number, not the symbol.\r\n");
			refreshScreen();
			return;

		case '/#':
			caseDesc = "\1yZ\1cooming Messing Scan";
			commandConfirm();
			console.print("\r\nchType the actual number, not the symbol.\r\n");
			refreshScreen();
			return;
			
			
	default:  // gives the user some instructions as far as how to proceed if they hit a wrong key
				infoFrameA.clear();
				infoFrameA.center("Not a valid selection. Try again.");
				infoFrameA.cycle();
				break;
					}
				}
				

		}
}

// ###################### COMMAND CONFIRMATION ##########
// expand to local variable with case description (caseDesc) to confirm menus and clear screen

function commandConfirm() 
{
	k2 = "{"; // setting the command variable to an unused value in case the program tries to run twice
	infoFrameA.clear();
	console.clear();
	console.gotoxy(1,1);
	console.print("\1rYou have selected " + caseDesc + "\1g Advancing...");
	console.crlf();
	console.pause();
	/*
	var confirm = console.yesno("Press Enter/Yes to proceed or No to exit");
	if(confirm == false)
	{
	continue resumeMainLabel;
	}	
	*/
}


//  ############################### E-mail Section ################################

function email()
{
	var key;
	var i;
	while(1) {
		if(!(user.settings & USER_EXPERT))
			bbs.menu("e-mail");

		// async

		console.print("\r\nyhE-mail: n");
		key=get_next_keys("?SRFNUKQ\r");
		bbs.log_key(key);
		switch(key) {
			case '?':
				if(user.settings & USER_EXPERT)
					bbs.menu("e-mail");
				break;

			case 'S':
				console.print("_\r\nbhE-mail (User name or number): w");
				str=get_next_str("",40,K_UPRLWR,false);
				if(str==null || str=="")
					break;
				if(str=="Sysop")
					str="1";
				if(str.search(/\@/)!=-1)
					bbs.netmail(str);
				else {
					i=bbs.finduser(str);
					if(i>0)
						bbs.email(i,WM_EMAIL);
				}
				break;

			case 'U':
				console.print("_\r\nbhE-mail (User name or number): w");
				str=get_next_str("",40,K_UPRLWR,false);
				if(str==null || str=="")
					break;
				if(str=="Sysop")
					str="1";
				if(str.search(/\@/)!=-1)
					bbs.netmail(str,WM_FILE);
				else {
					i=bbs.finduser(str);
					if(i>0)
						bbs.email(i,WM_EMAIL|WM_FILE);
				}
				break;

			case 'R':
				bbs.read_mail(MAIL_YOUR);
				break;

			case 'F':
				bbs.email(1,WM_EMAIL,bbs.text(ReFeedback));
				break;

			case 'N':
				if(console.noyes("\r\nAttach a file"))
					i=WM_FILE;
				else
					i=0;
				console.putmsg(bbs.text(EnterNetMailAddress),P_SAVEATR);
				str=get_next_str("",60,K_LINE,false);
				if(str!=null && str !="")
					bbs.netmail(str,i);
				break;

			case 'K':
				bbs.read_mail(MAIL_SENT);
				break;

			case 'Q':
			default:
				return;
		}
	}
	return
}

//############################ Main Info Section	###############################

function main_info()
{
	var key;

	while(1) {
		if(!(user.settings & USER_EXPERT))
			bbs.menu("maininfo");

		// async

		console.print("\r\nyhInfo: n");
		key=get_next_keys("?QISVY\r");
		bbs.log_key(key);
		switch(key) {
			case '?':
				if(user.settings & USER_EXPERT)
				bbs.menu("maininfo");
				break;

			case 'I':
				bbs.sys_info();
				break;

			case 'S':
				bbs.sub_info();
				break;

			case 'Y':
				bbs.user_info();
				break;

			case 'V':
				bbs.ver();
				break;

			case 'Q':
			default:
				return;
		}
	}
}

//########################### Main Config Section  ##############################

function main_cfg()
{
	var key;
	var sub;

	while(1) {
		if(!(user.settings & USER_EXPERT))
			bbs.menu("maincfg");
		
		// async
		console.print("\r\nyhConfig: n");
		key=get_next_keys("?QNPIS\r");
		bbs.log_key(key);

		switch(key) {
			case '?':
				if(user.settings & USER_EXPERT)
					bbs.menu("maincfg");
				break;

			case 'N':
				bbs.cfg_msg_scan(SCAN_CFG_NEW);
				break;

			case 'S':
				bbs.cfg_msg_scan(SCAN_CFG_TOYOU);
				break;

			case 'P':
				bbs.cfg_msg_ptrs();
				break;

			case 'I':
				bbs.reinit_msg_ptrs();
				break;

			default:
				return;
		}
	}
}	