load("sbbsdefs.js");
load("frame.js");

function msgList(){
	var cursub = new String;
	var mbcode = new String;
	mbcode = bbs.cursub_code;
	var mb = new MsgBase(mbcode);
	mb.open();
	
	for(var mbi = 1; mbi <18; mbi++)
		{
			subBoardFrame.gotoxy(1,mbi);
			subBoardFrame.cleartoeol();
		}
			subBoardFrame.gotoxy(1,1);

var msgBoaoardToMeDateFG = LIGHTCYAN;
var msgBoaoardToMeDateBG = BG_GREEN;
var msgBoardnameToMeSenderNameFG = LIGHTMAGENTA;
var msgBoardnameToMeSenderNameBG = BG_BLUE;
var msgBoardToMeTopicFG = YELLOW;
var msgBoardToMeTopicBG = BG_RED;

for(var m = mb.last_msg; m >= mb.first_msg; m--) 
{
	
	var cursub2 = msg_area.grp_list[bbs.curgrp].sub_list[bbs.cursub].name;
	var curSubTotalMsgs = mb.total_msgs;
	var groupDescription = msg_area.grp_list[bbs.curgrp].description.substring(0,40);
	
    var header = mb.get_msg_header(m);
    if(header === null || header.attr&MSG_DELETE)
        continue;
        var msgTime = system.timestr(header.when_written_time);
        var msgTimeTrim = msgTime.substr(4,6);
        msgTimeTrim = msgTimeTrim.replace(" ","");
        var msgSubj = new String;  //creates a string to hold the full message subject
        msgSubj = header.subject; //puts the value of the message subject in the variable
        var fromLen = header.from.length;  // gets length of posters name
        var poster = header.from.substr(0,8);
        var subjLen = 40 - fromLen - 7;  //creates a variable to create the width of subject without spilling to a new line
        var msgSubjTrim = msgSubj.substr(0,subjLen);
			if(header.to == user.name || header.to == user.alias){
			subBoardFrame.putmsg(msgTimeTrim, msgBoaoardToMeDateBG|msgBoaoardToMeDateFG);
			}
	else
	{
    subBoardFrame.putmsg(msgTimeTrim, msgBoardDateBG|msgBoardDateFG);
	}
	if(header.from == user.name)
	{
	subBoardFrame.putmsg(poster, msgBoardNameMeBG|msgBoardNameMeFG);
	}
	else if(header.to == user.name || header.to == user.alias)
	{
	subBoardFrame.putmsg(poster, msgBoardnameToMeSenderNameBG|msgBoardnameToMeSenderNameFG);
	}
	else
	{
	subBoardFrame.putmsg(poster, msgBoardNameBG|msgBoardNameFG);
	}
	if(header.to == user.name || header.to == user.alias) {
	subBoardFrame.putmsg(msgSubjTrim, msgBoardToMeTopicBG|msgBoardToMeTopicFG);
	}
	else
	{
	subBoardFrame.putmsg(msgSubjTrim, msgBoardTopicBG|msgBoardTopicFG);
	}
    subBoardFrame.crlf(); 
    
}
subBoardFrameTitle.clear();
	subBoardFrameTitle.center(cursub2.substring(0,40));
	infoFrameB.clear();
	infoFrameB.center(groupDescription);
	infoFrameB.cycle();
	infoFrameC.clear();
	infoFrameC.center(curSubTotalMsgs + " Total Msgs in Sub-Forum");
	infoFrameC.cycle();
	subBoardFrameTitle.cycle();
mb.close();
}