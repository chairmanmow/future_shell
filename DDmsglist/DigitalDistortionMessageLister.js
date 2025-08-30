/* This is a script that lists the messages in the current
 * message sub-group, with the following features:
 * - Forward & reverse navigation through the list
 * - Gives users the ability to read & reply to a message in the list
 * - Configurable colors
 *
 * Author: Eric Oulashin (AKA Nightfox)
 * BBS: Digital Distortion
 * BBS address: digdist.bbsindex.com
 *
 * Date       Author            Description
 * 2009-04-08 Eric Oulashin     Created
 *  ...Some version comments removed...
 * 2011-01-28 Eric Oulashin     Version 1.25
 *                              Updated to use console.putmsg() to
 *                              output the message body so that it
 *                              will honor color code settings, etc.
 *                              Also, shortened the subject length by
 *                              1 character so that the lines don't
 *                              take up the full width of the screen.
 *                              I made this change to improve behavior
 *                              in terminals that didn't seem to like
 *                              this very much (i.e., Flash-based telnet
 *                              apps).
 * 2011-06-17 Eric Oulashin     Version 1.26
 *                              Improved the display of the bottom help
 *                              line for lightbar mode.
 * 2011-10-07 Eric Oulashin     Version 1.27
 *                              If a message's "from" name is blank, this
 *                              script will now set the "from" name to "All"
 *                              in the header, which will prevent Synchronet
 *                              from crashing; as a side effect, that will
 *                              have the user's reply go to "All".
 * 2012-03-07 Eric Oulashin     Versoin 1.28
 *                              Added color settings for the message info
 *                              lines for messages written to the user and
 *                              messages written from the user.
 * 2012-12-01 Eric Oulashin     Version 1.29
 *                              Added a new configuration file option for
 *                              the behavior section, promptConfirmReadMessage,
 *                              which sets whether or not to prompt the user
 *                              to confirm that they want to read a message
 *                              that they've selected to read.
 *                              Bug fix: In lightbar mode, after reading a
 *                              message to by typing its number, the script
 *                              now honors the promptToContinueListingMessages
 *                              configuration option.
 * 2012-12-09 Eric Oulashin     Version 1.30
 *                              Bug fix: When outputting a message, it now
 *                              word-wraps the message to fit on the user's
 *                              screen so that it looks good (no broken words
 *                              across lines).
 * 2012-12-30 Eric Oulashin     Version 1.31
 *                              Updated DigDistMsgLister_ReadMessage() so
 *                              that just before replying to a message in a
 *                              sub-board, it will write a file to the node
 *                              directory containing the following information
 *                              so that message editors (i.e., SlyEdit v1.18
 *                              and later) can use it in place of the bbs
 *                              object variables, since this message lister
 *                              can't modify the bbs object variables:
 *                              - The highest message number in the sub-board (last message)
 *                              - The total number of messages in the sub-board
 *                              - The number of the message being read
 *                              - The current sub-board code
 * 2013-01-11 Eric Oulashin     Version 1.32
 * 2013-01-12                   Updated to use the msghdr .ans/.asc file in
 *                              the sbbs/text/menu directory, if it exists,
 *                              to display the message header information.
 *                              If no msghdr file exists, then it will
 *                              use default header text.  The name of this
 *                              file is configurable with the configuration
 *                              setting msgHdrTextFileName in the .cfg file.
 *                              It will default to msghdr, which is what
 *                              Synchronet uses.
 *                              Also, the .cfg file may now be placed in the
 *                              sbbs/ctrl directory if desired.  This script will
 *                              look for the .cfg file first in the sbbs/ctrl
 *                              directory, and if the .cfg file is not there,
 *                              it will be assumed that the .cfg file is in the
 *                              same directory as this script.
 * 2013-04-20 Eric Oulashin     Version 1.33
 *                              Updated so that sysops can delete and edit
 *                              any message, including ones they didn't write.
 * 2013-05-14 Eric Oulashin     Version 1.34
 *                              Updated DigDistMsgLister_ReadMessage() so that
 *                              it writes the absolute message number
 *                              (message.number, the same as bbs.msg_number)
 *                              instead of the message offset to
 *                              DDML_SyncSMBInfo.txt.  This was due to a change
 *                              in SlyEdit 1.25 (also released 2013-05-14).
 * 2013-05-17 Eric Oulashin     Version 1.35
 *                              Updated so that when writing DDML_SyncSMBInfo.txt,
 *                              it writes bbs.msg_number only for Synchronet
 *                              3.16 builds starting on May 12, 2013 and to use
 *                              bbs.smb_curmsg before that build date.  May 12,
 *                              2013 was right after Digital Man put in his change
 *                              to make bbs.msg_number work in JavaScript scripts,
 *                              and it's accurate in all situations.
 * 2013-05-23 Eric Oulashin     Version 1.36
 *                              When writing DDML_SyncSMBInfo.txt, it now always
 *                              writes the message number, rather than either
 *                              the message number or offset depending on the
 *                              Synchronet version & build date.  This simplifies
 *                              SlyEdit's job of determining which to use,
 *                              since SlyEdit can now just test whether
 *                              bbs.msg_number is > 0 or if DDML_SyncSMBInfo.txt
 *                              exists to decide whether to use the message
 *                              number (and if not, uses the offset).  No more
 *                              checking the Synchronet version & build date.
 *                              Sysops who use SlyEdit now must update SlyEdit
 *                              to version 1.27 or newer.
 */

/* Command-line arguments:
   1 (argv[0]): Boolean - Whether or not to run the message list (if false,
                then this file will just provide the DigDistMsgLister class).
*/

load("sbbsdefs.js");

// This script requires Synchronet version 3.15 or higher.
// Exit if the Synchronet version is below the minimum.
if (system.version_num < 31500)
{
	var message = "nhyi* Warning:nhw Digital Distortion Message Lister "
	             + "requires version g3.15w or\r\n"
	             + "higher of Synchronet.  This BBS is using version g" + system.version
	             + "w.  Please notify the sysop.";
	console.crlf();
	console.print(message);
	console.crlf();
	console.pause();
	exit();
}

// These functions return the version number and version date.
function getVersion()
{
   return "1.36";
}
function getVerDate()
{
   return "2013-05-23";
}

// Keyboard key codes (these are declared with "var" rather than "const" to avoid
// re-declaration errors).
var CTRL_M = "\x0d";
var KEY_ENTER = CTRL_M;

// Navigational key characters (for display)
var UP_ARROW = "";
var DOWN_ARROW = "";

// gIsSysop stores whether or not the user is a sysop.
var gIsSysop = user.compare_ars("SYSOP"); // Whether or not the user is a sysop
// Store whether or not the Synchronet compile date is at least May 12, 2013
// so that we don't have to call compileDateAtLeast2013_05_12() multiple times.
var gSyncCompileDateAtLeast2013_05_12 = compileDateAtLeast2013_05_12();

// Determine whether or not to execute the message listing code, based
// on the first program argument (a boolean).
var executeThisScript = true;
if (typeof(argv[0]) != "undefined")
	executeThisScript = argv[0];

if (executeThisScript)
{
	// Write a note in the log that the user is listing messages for the sub-board
	bbs.log_str(user.alias + " is listing messages for sub-board: " + bbs.cursub_code);
	//global.log(LOG_INFO, user.alias + " is listing messages for sub-board: " + bbs.cursub_code);

	// Create an instance of my DigDistMsgLister class and use it to list the
	// messages.
	var msgLister = new DigDistMsgLister(bbs.cursub_code);

   // List the messages.  Note: If there are no messages in the sub-board,
   // ListMessages() will tell the user so and return.
	msgLister.ListMessages();
}

// End of script execution

function canDoHighASCIIAndANSI()
{
	//return (console.term_supports(USER_ANSI) && (user.settings & USER_NO_EXASCII == 0));
	return (console.term_supports(USER_ANSI));
}

///////////////////////////////////////////////////////////////////////////////////
// DigDistMsgLister class stuff

// DigDistMsgLister class constructor: Constructs a
// DigDistMsgLister object, to be used for listing messages
// in a message area.
//
// Parameters:
//  pSubBoardCode: Optional - The Synchronet sub-board code, or "mail"
//                 for personal email.
function DigDistMsgLister(pSubBoardCode)
{
	// this.colors will be an array of colors to use in the message list
	this.colors = getDefaultColors();
	this.msgbase = null;    // Will be a MsgBase object.
	this.subBoardCode = ""; // The message sub-board code
	if (pSubBoardCode != null)
		this.subBoardCode = pSubBoardCode;

	// This property controls whether or not the user will be prompted to
	// continue listing messages after selecting a message to read.
	this.promptToContinueListingMessages = false;
	// Whether or not to prompt the user to confirm to read a message
	this.promptToReadMessage = false;

	// String lengths for the columns to write
	// Fixed field widths: Message number, date, and time
	this.MSGNUM_LEN = 4;
	this.DATE_LEN = 10; // i.e., YYYY-MM-DD
	this.TIME_LEN = 8;  // i.e., HH:MM:SS
	// Variable field widths: From, to, and subject (based on a screen width of
	// 80 columns)
	this.FROM_LEN = (console.screen_columns * (15/80)).toFixed(0);
	this.TO_LEN = (console.screen_columns * (15/80)).toFixed(0);
	this.SUBJ_LEN = (console.screen_columns * (22/80)).toFixed(0);

	// Whether or not the user chose to read a message
	this.readAMessage = false;
	// Whether or not the user denied confirmation to read a message
	this.deniedReadingMessage = false;

	// interfaceStyle contains the message listing style and can be one of the
	// following two options:
	// "Traditional":
	// "Lightbar":
	this.interfaceStyle = "Lightbar";

	// reverseOrder stores whether or not to arrange the list
	// descending by date (basically, go through the list backward).
	this.reverseOrder = false;

	// displayBoardInfoInHeader specifies whether or not to display
	// the message group and sub-board lines in the header at the
	// top of the screen (an additional 2 lines).
	this.displayBoardInfoInHeader = false;

  // displayMessageDateImported specifies whether or not to use the message
  // import date as the date displayed.  If false, it will use the message
  // written date.
  this.displayMessageDateImported = true;

  // The name of the message header file (without extension) in the
  // sbbs/text/menu directory
  this.msgHdrTextFileName = "msghdr";

	// Construct the header format string
	this.sHdrFormatStr = "%" + this.MSGNUM_LEN + "s %-" + this.FROM_LEN + "s %-"
	                   + this.TO_LEN + "s %-" + this.SUBJ_LEN + "s %-"
	                   + this.DATE_LEN + "s %-" + this.TIME_LEN + "s";
	// If the user's terminal doesn't support ANSI, then append a newline to
	// the end of the format string (we won't be able to move the cursor).
	if (!canDoHighASCIIAndANSI())
		this.sHdrFormatStr += "\r\n";

	// Set the function pointers for the object
	this.ListMessages = DigDistMsgLister_ListMessages;
	this.ListMessages_Traditional = DigDistMsgLister_ListMessages_Traditional;
	this.ListMessages_Lightbar = DigDistMsgLister_ListMessages_Lightbar;
	this.PromptContinueOrReadMsg = DigDistMsgLister_PromptContinueOrReadMsg;
	this.WriteScreenTopHeader = DigDistMsgLister_WriteScreenTopHeader;
	this.ReadMessage = DigDistMsgLister_ReadMessage;
	this.PrintMessageInfo = DigDistMsgLister_PrintMessageInfo;
	this.ListScreenfulOfMessages = DigDistMsgLister_ListScreenfulOfMessages;
	this.DisplayHelp = DigDistMsgLister_DisplayHelp;
	this.DisplayTraditionalHelp = DigDistMsgLister_DisplayTraditionalHelp;
	this.DisplayLightbarHelp = DigDistMsgLister_DisplayLightbarHelp;
	this.DisplayMessageListNotesHelp = DigDistMsgLister_DisplayMessageListNotesHelp;
	this.SetPauseTextAndLightbarHelpLine = DigDistMsgLister_SetPauseTextAndLightbarHelpLine;
	this.EditExistingMsg = DigDistMsgLister_EditExistingMsg;
	this.CanDelete = DigDistMsgLister_CanDelete;
	this.CanEdit = DigDistMsgLister_CanEdit;
	this.CanQuote = DigDistMsgLister_CanQuote;
	this.ReadConfigFile = DigDistMsgLister_ReadConfigFile;
	this.displayMsgHeader = DigDistMsgLister_DisplayMsgHeader;
	this.getMsgHdrFullFilename = DigDistMsgLister_GetMsgHdrFullFilename;

	// Read the settings from the config file.
	this.ReadConfigFile();
	// Construct the message information format string.  These must be done after
	// reading the configuration file, because the configuration file specifies the
	// colors to use.
	this.sMsgInfoFormatStr = this.colors["msgNum"] + "%" + this.MSGNUM_LEN + "d%s"
	                       + this.colors["from"]
	                       + "%-" + this.FROM_LEN + "s " + this.colors["to"] + "%-"
	                       + this.TO_LEN + "s " + this.colors["subject"] + "%-"
	                       + this.SUBJ_LEN + "s " + this.colors["date"]
	                       + "%-" + this.DATE_LEN + "s " + this.colors["time"]
	                       + "%-" + this.TIME_LEN + "s";
  // Message information format string with colors to use when the message is
  // written to the user.
  this.sMsgInfoToUserFormatStr = this.colors["toUserMsgNum"] + "%" + this.MSGNUM_LEN + "d%s"
	                       + this.colors["toUserFrom"]
	                       + "%-" + this.FROM_LEN + "s " + this.colors["toUserTo"] + "%-"
	                       + this.TO_LEN + "s " + this.colors["toUserSubject"] + "%-"
	                       + this.SUBJ_LEN + "s " + this.colors["toUserDate"]
	                       + "%-" + this.DATE_LEN + "s " + this.colors["toUserTime"]
	                       + "%-" + this.TIME_LEN + "s";
	// Message information format string with colors to use when the message is
  // from the user.
  this.sMsgInfoFromUserFormatStr = this.colors["fromUserMsgNum"] + "%" + this.MSGNUM_LEN + "d%s"
	                       + this.colors["fromUserFrom"]
	                       + "%-" + this.FROM_LEN + "s " + this.colors["fromUserTo"] + "%-"
	                       + this.TO_LEN + "s " + this.colors["fromUserSubject"] + "%-"
	                       + this.SUBJ_LEN + "s " + this.colors["fromUserDate"]
	                       + "%-" + this.DATE_LEN + "s " + this.colors["fromUserTime"]
	                       + "%-" + this.TIME_LEN + "s";
	// Highlighted message information line (used for the lightbar interface)
	this.sMsgInfoFormatHighlightStr = this.colors["msgHighlightBkg"] + "hy"
	                       + "%" + this.MSGNUM_LEN + "d%sc%-" + this.FROM_LEN
	                       + "s " + "c" + "%-" + this.TO_LEN + "s " + "c" + "%-"
	                       + this.SUBJ_LEN + "s " + "w"
	                       + "%-" + this.DATE_LEN + "s " + "w"
	                       + "%-" + this.TIME_LEN + "s";
	// If the user's terminal doesn't support ANSI, then append a newline to
	// the end of the format string (we won't be able to move the cursor).
	if (!canDoHighASCIIAndANSI())
	{
		this.sMsgInfoFormatStr += "\r\n";
		this.sMsgInfoToUserFormatStr += "\r\n";
		this.sMsgInfoFromUserFormatStr += "\r\n";
		this.sMsgInfoFormatHighlightStr += "\r\n";
	}
}
// For the DigDistMsgLister class: Performs the message listing, given a
// sub-board code.
//
// Paramters:
//  pSubBoardCode: Optional - The Synchronet sub-board code, or "mail"
//                 for personal email.
function DigDistMsgLister_ListMessages(pSubBoardCode)
{
   if (pSubBoardCode != null)
      this.subBoardCode = pSubBoardCode;

   // If the sub-board code is not valid, then return with an error.
   if (this.subBoardCode == "")
   {
      console.print("nhyWarning: wThe Message Lister script connot continue because no message\r\n");
      console.print("sub-board was specified. Please notify the sysop.\r\np");
      return;
   }

   // Open the current message sub-board.  If it opened, then list
	// the messages.
	this.msgbase = null;
	this.msgbase = new MsgBase(this.subBoardCode);
	if (this.msgbase.open())
	{
		// If there are no messages in the current sub-board, then let the
		// user know and exit.
		if (this.msgbase.total_msgs == 0)
		{
			this.msgbase.close();
			this.msgbase = null;
			console.clear("n");
			console.center("nhyThere are no messages in this message sub-board.\r\np");
			return;
		}
   }

   // Construct the traditional UI pause text and the line of help text for lightbar
   // mode.  This adds the delete and edit keys if the user is allowed to delete & edit
	// messages.
	this.SetPauseTextAndLightbarHelpLine();

   // If this.reverseOrder is the string "ASK", prompt the user for whether
   // they want to list the messages in reverse order.
   if ((typeof(this.reverseOrder) == "string") && (this.reverseOrder.toUpperCase() == "ASK"))
   {
      if (numMessages(bbs.cursub_code) > 0)
         this.reverseOrder = !console.noyes("ncList in reverse (newest on top)");
   }

   // List the messages using the lightbar or traditional interface, depending
   // on what this.interfaceStyle is set to.  The lightbar interface requires ANSI.
   if ((this.interfaceStyle.toUpperCase() == "LIGHTBAR") && canDoHighASCIIAndANSI())
	//if ((this.interfaceStyle.toUpperCase() == "LIGHTBAR") && console.term_supports(USER_ANSI))
		this.ListMessages_Lightbar();
	else
		this.ListMessages_Traditional();

   // Close the message base object, re-enable the normal text attribute, and
   // clear the screen.
	this.msgbase.close();
	this.msgbase = null;
	console.clear("n");
}
// For the DigDistMsgLister class: Performs the message listing, given a
// sub-board code.  This version uses a traditional user interface, prompting
//  the user at the end of each page to continue, quit, or read a message.
// Note: This function requires this.msgbase to be valid and open.
function DigDistMsgLister_ListMessages_Traditional()
{
	// Reset this.readAMessage and deniedReadingmessage to false, in case the
	// message listing has previously ended with them set to true.
	this.readAMessage = false;
	this.deniedReadingMessage = false;

	// this.msgbase must be valid before continuing.
	if ((typeof(this.msgbase) == "undefined") || (this.msgbase == null))
	{
      console.center("nhyError: wUnable to list messages because the sub-board is not open.\r\np");
      return;
	}
	else if (!this.msgbase.is_open)
	{
      console.center("nhyError: wUnable to list messages because the sub-board is not open.\r\np");
      return;
	}

   // nMaxLines stores the maximum number of lines to write.  It's the number
   // of rows on the user's screen - 3 to make room for the header line
   // at the top, the question line at the bottom, and 1 extra line at
   // the bottom of the screen so that displaying carriage returns
   // doesn't mess up the position of the header lines at the top.
   var nMaxLines = console.screen_rows-3;
   var nListStartLine = 2; // The first line number on the screen for the message list
   // If we will be displaying the message group and sub-board in the
   // header at the top of the screen (an additional 2 lines), then
   // update nMaxLines and nListStartLine to account for this.
   if (this.displayBoardInfoInHeader)
   {
      nMaxLines -= 2;
      nListStartLine += 2;
   }

   // If the user's terminal doesn't support ANSI, then re-calculate
   // nMaxLines - we won't be keeping the headers at the top of the
   // screen.
   if (!canDoHighASCIIAndANSI())
   //if (!console.term_supports(USER_ANSI))
      nMaxLines = console.screen_rows - 2;

   // Clear the screen and write the header at the top
   console.clear("n");
   this.WriteScreenTopHeader();

   // Write the message list
   var topMsgIndex = this.reverseOrder ? this.msgbase.total_msgs-1 : 0;
   var continueOn = true;
   var retvalObj = null;
   var curpos = null; // Current character position
   var lastScreen = false;
   while (continueOn)
   {
      // Go to the top and write the current page of message information,
      // then update curpos.
      console.gotoxy(1, nListStartLine);
      lastScreen = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
      curpos = console.getxy();
      clearToEOS(curpos.y);
      console.gotoxy(curpos);
      // Prompt the user whether or not to continue or to read a message
      // (by message number).
      if (this.reverseOrder)
         retvalObj = this.PromptContinueOrReadMsg((topMsgIndex == this.msgbase.total_msgs-1), lastScreen);
      else
         retvalObj = this.PromptContinueOrReadMsg((topMsgIndex == 0), lastScreen);
      continueOn = retvalObj.continueOn;
      if (continueOn)
      {
         // If the user chose to go to the previous page of listings,
         // then subtract the appropriate number of messages from
         // topMsgIndex in order to do so.
         if (retvalObj.userInput == "P")
         {
            if (this.reverseOrder)
            {
               topMsgIndex += nMaxLines;
               // If we go past the beginning, then we need to reset
               // msgNum so we'll be at the beginning of the list.
               if (topMsgIndex >= this.msgbase.total_msgs)
                  topMsgIndex = this.msgbase.total_msgs - 1;
            }
            else
            {
               topMsgIndex -= nMaxLines;
               // If we go past the beginning, then we need to reset
               // msgNum so we'll be at the beginning of the list.
               if (topMsgIndex < 0)
                  topMsgIndex = 0;
            }
         }
         // If the user chose to go to the next page, update
         // topMsgIndex appropriately.
         else if (retvalObj.userInput == "N")
         {
            if (this.reverseOrder)
               topMsgIndex -= nMaxLines;
            else
               topMsgIndex += nMaxLines;
         }
         // First page
         else if (retvalObj.userInput == "F")
         {
            if (this.reverseOrder)
               topMsgIndex = this.msgbase.total_msgs - 1;
            else
               topMsgIndex = 0;
         }
         // Last page
         else if (retvalObj.userInput == "L")
         {
            if (this.reverseOrder)
            {
               topMsgIndex = (this.msgbase.total_msgs % nMaxLines) - 1;
               // If topMsgIndex is now invalid (below 0), then adjust it
               // to properly display the last page of messages.
               if (topMsgIndex < 0)
                  topMsgIndex = nMaxLines - 1;
            }
            else
            {
               topMsgIndex = this.msgbase.total_msgs - (this.msgbase.total_msgs % nMaxLines);
               if (topMsgIndex >= this.msgbase.total_msgs)
                  topMsgIndex = this.msgbase.total_msgs - nMaxLines;
            }
         }
         // D: Delete a message
         else if (retvalObj.userInput == "D")
         {
            if (this.CanDelete())
            {
               console.print("ncNumber of the message to be deleted (or hENTERnc to cancel)gh: c");
               var msgNum = console.getnum(this.msgbase.total_msgs);
               if (msgNum > 0)
               {
                  // Only let the user delete one of their own messages or the user
                  // is a sysop.
                  var msgHeader = this.msgbase.get_msg_header(true, msgNum-1);
                  if (gIsSysop || (msgHeader.from == user.name) || (msgHeader.from == user.alias))
                  {
                     var delMsg = !console.noyes("nhyDeletenc message #h" +
                                                 msgNum + "nc: Are you sure");
                     if (delMsg)
                     {
                        if (this.msgbase.remove_msg(true, msgNum-1))
                        {
                           console.print("ncMessage #h" + msgNum +
                                         "nc has been marked for deletion.\r\np");
                        }
                     }
                  }
                  else
                  {
                     console.print("nhwCannot delete message #y" + msgNum +
                                   " wbecause it's not yours or you're not a sysop.\r\np");
                  }
               }

               // Refresh the top header on the screen for continuing to list
               // messages.
               console.clear("n");
               this.WriteScreenTopHeader();
            }
         }
         // E: Edit a message
         else if (retvalObj.userInput == "E")
         {
            if (this.CanEdit())
            {
               console.print("ncNumber of the message to be edited (or hENTERnc to cancel)gh: c");
               var msgNum = console.getnum(this.msgbase.total_msgs);
               // If the user entered a valid message number, then let the
               // user edit the message.
               if (msgNum > 0)
                  var returnObj = this.EditExistingMsg(msgNum-1);

               // Refresh the top header on the screen for continuing to list
               // messages.
               console.clear("n");
               this.WriteScreenTopHeader();
            }
         }
         // G: Go to a specific message by # (place that message on the top)
         else if (retvalObj.userInput == "G")
         {
            console.print("ncGo to message # (or hENTERnc to cancel)gh: c");
            var msgNum = console.getnum(this.msgbase.total_msgs);
            if (msgNum > 0)
               topMsgIndex = msgNum - 1;

            // Refresh the top header on the screen for continuing to list
            // messages.
            console.clear("n");
            this.WriteScreenTopHeader();
         }
         // ?: Display help
         else if (retvalObj.userInput == "?")
         {
            console.clear("n");
            this.DisplayHelp(true);
            console.clear("n");
            this.WriteScreenTopHeader();
         }

         // If the user chose to read a message or denied confirmation, then:
         // - Re-draw the column headers at the top of the screen.
         // - Subtract nMaxLines from msgNum so that this script displays
         //   the same page where the user left off.
         if (this.readAMessage || this.deniedReadingMessage)
         {
				if (canDoHighASCIIAndANSI())
            //if (console.term_supports(USER_ANSI))
               this.WriteScreenTopHeader();
         }
         this.readAMessage = false;
         this.deniedReadingMessage = false;

         // If the user's terminal doesn't support ANSI, then adjust
         // nMaxLines to 1 less than the number of screen rows, because
         // after the first page, we no longer need to display the message
         // list header line.
         if (!canDoHighASCIIAndANSI())
         //if (!console.term_supports(USER_ANSI))
            nMaxLines = console.screen_rows - 1;
      }
   }
}
// For the DigDistMsgLister class: Performs the message listing, given a
// sub-board code.  This verison uses a lightbar interface for message
// navigation.  Note: This function requires this.msgbase to be valid and
// open.
function DigDistMsgLister_ListMessages_Lightbar()
{
	// This method is only supported if the user's terminal supports
	// ANSI.
	if (!canDoHighASCIIAndANSI())
	//if (!console.term_supports(USER_ANSI))
	{
		console.print("\r\nhySorry, an ANSI terminal is required for this operation.nw\r\n");
		console.pause();
		return;
	}

	// Reset this.readAMessage and deniedReadingMessage to false, in case the
	// message listing has previously ended with them set to true.
	this.readAMessage = false;
	this.deniedReadingMessage = false;

   // this.msgbase must be valid before continuing.
	if ((typeof(this.msgbase) == "undefined") || (this.msgbase == null))
	{
      console.center("nhyError: wUnable to list messages because the sub-board is not open.\r\np");
      return;
	}
	else if (!this.msgbase.is_open)
	{
      console.center("nhyError: wUnable to list messages because the sub-board is not open.\r\np");
      return;
	}

   // This function will be used for displaying the help line at
   // the bottom of the screen.
   function DisplayHelpLine(pHelpLineText)
   {
      console.gotoxy(1, console.screen_rows);
      console.print(pHelpLineText);
      console.cleartoeol("n");
   }

   // nMaxLines stores the maximum number of lines to write.  It's the number
   // of rows on the user's screen - 3 to make room for the header line
   // at the top, the question line at the bottom, and 1 extra line at
   // the bottom of the screen so that displaying carriage returns
   // doesn't mess up the position of the header lines at the top.
   var nMaxLines = console.screen_rows-2;
   var nListStartLine = 2; // The first line number on the screen for the message list
   // If we will be displaying the message group and sub-board in the
   // header at the top of the screen (an additional 2 lines), then
   // update nMaxLines and nListStartLine to account for this.
   if (this.displayBoardInfoInHeader)
   {
      nMaxLines -= 2;
      nListStartLine += 2;
   }

   // Clear the screen and write the header at the top
   console.clear("n");
   this.WriteScreenTopHeader();
   DisplayHelpLine(this.sLightbarModeHelpLine);

   // Set the cursor position to the first line where the list should start
   console.gotoxy(1, nListStartLine);

   // Write the first page of message listings.
   var topMsgIndex = 0;
   if (this.reverseOrder)
      topMsgIndex = this.msgbase.total_msgs - 1;
   var lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);

   // Move the cursor to the first message line
   console.gotoxy(1, nListStartLine);
   var curpos = console.getxy(); // Keeps track of the current cursor position
   // User input loop
   var selectedMsgIndex = topMsgIndex; // The index of the selected message
   var bottomMsgIndex = 0;
   var userInput = "";
   var msgHeader = null;
   var continueOn = true;
   while (continueOn)
   {
      bbs.command_str = ""; // To prevent weirdness

      // Calculate the message number (0-based) of the message
      // appearing on the bottom of the screen.
      if (this.reverseOrder)
      {
         bottomMsgIndex = topMsgIndex - nMaxLines + 1;
         if (bottomMsgIndex < 0)
            bottomMsgIndex = 0;
      }
      else
      {
         bottomMsgIndex = topMsgIndex + nMaxLines - 1;
         if (bottomMsgIndex >= this.msgbase.total_msgs)
            bottomMsgIndex = this.msgbase.total_msgs - 1;
      }

      // Write the current message information with highlighting colors
      msgHeader = this.msgbase.get_msg_header(true, selectedMsgIndex, true);
      this.PrintMessageInfo(msgHeader, true);
      console.gotoxy(curpos); // Make sure the cursor is still in the right place

      // Get a key from the user (upper-case) and take appropriate action.
      userInput = console.getkey(K_UPPER | K_NOCRLF);
      // Q: Quit
      if (userInput == "Q")
      {
         // Quit
         continueOn = false;
         break;
      }
      // ?: Show help
      else if (userInput == "?")
      {
         // Display help
         console.print("n"); // Remove any background color
         console.clear("n");
         this.DisplayHelp(true);

         // Re-draw the message list on the screen
         console.clear("n");
         this.WriteScreenTopHeader();
         DisplayHelpLine(this.sLightbarModeHelpLine);
         console.gotoxy(1, nListStartLine);
         lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
         console.gotoxy(curpos); // Put the cursor back where it should be
      }
      // Up arrow: Highlight the previous message
      else if (userInput == KEY_UP)
      {
         // Make sure selectedMsgIndex is within bounds before moving down.
         if (this.reverseOrder)
         {
            if (selectedMsgIndex >= this.msgbase.total_msgs-1)
               continue;
         }
         else
         {
            if (selectedMsgIndex <= 0)
               continue;
         }

         // Print the current message information with regular colors
         this.PrintMessageInfo(msgHeader, false);

         if (this.reverseOrder)
            ++selectedMsgIndex;
         else
            --selectedMsgIndex;

         // If the current screen row is above the first line allowed, then
         // move the cursor up one row.
         if (curpos.y > nListStartLine)
         {
            console.gotoxy(1, curpos.y-1);
            curpos.x = 1;
            --curpos.y;
         }
         else
         {
            // Go onto the previous page, with the cursor highlighting
            // the last message on the page.
            if (this.reverseOrder)
               topMsgIndex = selectedMsgIndex + nMaxLines - 1;
            else
               topMsgIndex = selectedMsgIndex - nMaxLines + 1;

            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(1, nListStartLine+nMaxLines-1);
            curpos.x = 1;
            curpos.y = nListStartLine+nMaxLines-1;
         }
      }
      // Down arrow: Highlight the next message
      else if (userInput == KEY_DOWN)
      {
         // Make sure selectedMsgIndex is within bounds before moving down.
         if (this.reverseOrder)
         {
            if (selectedMsgIndex <= 0)
               continue;
         }
         else
         {
            if (selectedMsgIndex >= this.msgbase.total_msgs-1)
               continue;
         }

         // Print the current message information with regular colors
         this.PrintMessageInfo(msgHeader, false);

         if (this.reverseOrder)
            --selectedMsgIndex;
         else
            ++selectedMsgIndex;

         // If the current screen row is below the last line allowed, then
         // move the cursor down one row.
         if (curpos.y < nListStartLine+nMaxLines-1)
         {
            console.gotoxy(1, curpos.y+1);
            curpos.x = 1;
            ++curpos.y;
         }
         else
         {
            // Go onto the next page, with the cursor highlighting
            // the first message on the page.
            console.gotoxy(1, nListStartLine);
            topMsgIndex = selectedMsgIndex;
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            // If we were on the last page, then clear the screen from
            // the current line to the end of the screen.
            if (lastPage)
            {
               curpos = console.getxy();
               clearToEOS(curpos.y);
               // Make sure the help line is still there
               DisplayHelpLine(this.sLightbarModeHelpLine);
            }

            // Move the cursor to the top of the list
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
         }
      }
      // HOME key: Go to the first message on the screen
      else if (userInput == KEY_HOME)
      {
         // Print the current message information with regular colors
         this.PrintMessageInfo(msgHeader, false);
         // Go to the first message of the current page
         if (this.reverseOrder)
            selectedMsgIndex += (curpos.y - nListStartLine);
         else
            selectedMsgIndex -= (curpos.y - nListStartLine);
         // Move the cursor to the first message line
         console.gotoxy(1, nListStartLine);
         curpos.x = 1;
         curpos.y = nListStartLine;
      }
      // END key: Go to the last message on the screen
      else if (userInput == KEY_END)
      {
         // Print the current message information with regular colors
         this.PrintMessageInfo(msgHeader, false);
         // Update the selected message #
         selectedMsgIndex = bottomMsgIndex;
         // Go to the last message of the current page
         if (this.reverseOrder)
            curpos.y = nListStartLine + topMsgIndex - bottomMsgIndex;
         else
            curpos.y = nListStartLine + bottomMsgIndex - topMsgIndex;
         console.gotoxy(curpos);
      }
      // Enter key: Select a message to read
      else if (userInput == KEY_ENTER)
      {
         var originalCurpos = console.getxy();

         // Allow the user to read the current message.
         var readMsg = true;
         if (this.promptToReadMessage)
         {
           // Confirm with the user whether to read the message.
           var sReadMsgConfirmText = this.colors["readMsgConfirm"]
                              + "Read message "
                              + this.colors["readMsgConfirmNumber"]
                              + +(msgHeader.offset+1)
                              + this.colors["readMsgConfirm"]
                              + ": Are you sure";
           console.gotoxy(1, console.screen_rows);
           console.print("n");
           console.clearline();
           readMsg = console.yesno(sReadMsgConfirmText);
         }
         var repliedToMessage = false;
         if (readMsg)
         {
            this.readAMessage = true;
            console.clear("n");
            repliedToMessage = this.ReadMessage(msgHeader.offset);
         }
         else
            this.deniedReadingMessage = true;

         // Ask the user if  they want to continue reading messages
         if (this.promptToContinueListingMessages)
         {
            continueOn = console.yesno(this.colors["afterReadMsg_ListMorePrompt"] +
                                       "Continue listing messages");
         }
         // If the user chose to continue reading messages, then refresh
         // the screen.  Even if the user chooses not to read the message,
         // the screen needs to be re-drawn so it appears properly.
         if (continueOn)
         {
            console.clear("n");
            this.WriteScreenTopHeader();
            DisplayHelpLine(this.sLightbarModeHelpLine);
            console.gotoxy(1, nListStartLine);
            // If we're dispaying in reverse order and the user replied
            // to the message, then we'll have to re-arrange the screen
            // a bit to make way for the new message that will appear
            // in the list.
            if (this.reverseOrder && repliedToMessage)
            {
               // Make way for the new message, which will appear at the
               // top.
               ++topMsgIndex;
               // If the cursor is below the bottommost line displaying
               // messages, then advance the cursor down one position.
               // Otherwise, increment selectedMsgIndex (since a new message
               // will appear at the top, the previous selected message
               // will be pushed to the next page).
               if (curpos.y < console.screen_rows - 1)
               {
                  ++originalCurpos.y;
                  ++curpos.y;
               }
               else
                  ++selectedMsgIndex;
            }
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(originalCurpos); // Put the cursor back where it should be
         }
      }
      // N: Next page
      else if (userInput == "N")
      {
         // Next page
         if (!lastPage)
         {
            if (this.reverseOrder)
               topMsgIndex -= nMaxLines;
            else
               topMsgIndex += nMaxLines;
            selectedMsgIndex = topMsgIndex;
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);

            // If we were on the last page, then clear the screen from
            // the current line to the end of the screen.
            if (lastPage)
            {
               curpos = console.getxy();
               clearToEOS(curpos.y);
               // Make sure the help line is still there
               DisplayHelpLine(this.sLightbarModeHelpLine);
            }

            // Move the cursor back to the first message info line
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
         }
      }
      // P: Previous page
      else if (userInput == "P")
      {
         var canGoToPrevious = false;
         if (this.reverseOrder)
            canGoToPrevious = (topMsgIndex < this.msgbase.total_msgs-1);
         else
            canGoToPrevious = (topMsgIndex > 0);

         if (canGoToPrevious > 0)
         {
            if (this.reverseOrder)
               topMsgIndex += nMaxLines;
            else
               topMsgIndex -= nMaxLines;
            selectedMsgIndex = topMsgIndex;
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
         }
      }
      // F: First page
      else if (userInput == "F")
      {
         var canGoToFirst = false;
         if (this.reverseOrder)
            canGoToFirst = (topMsgIndex < this.msgbase.total_msgs-1);
         else
            canGoToFirst = (topMsgIndex > 0);

         if (canGoToFirst)
         {
            if (this.reverseOrder)
               topMsgIndex = this.msgbase.total_msgs - 1;
            else
               topMsgIndex = 0;
            selectedMsgIndex = topMsgIndex;
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
         }
      }
      // L: Last page
      else if (userInput == "L")
      {
         if (!lastPage)
         {
            // Set the top message index.  If topMsgIndex is beyond the last
            // message in the sub-board, then move back a full page of messages.
            if (this.reverseOrder)
            {
               topMsgIndex = (this.msgbase.total_msgs % nMaxLines) - 1;
               // If topMsgIndex is now invalid (below 0), then adjust it
               // to properly display the last page of messages.
               if (topMsgIndex < 0)
                  topMsgIndex = nMaxLines - 1;
            }
            else
            {
               topMsgIndex = this.msgbase.total_msgs - (this.msgbase.total_msgs % nMaxLines);
               if (topMsgIndex >= this.msgbase.total_msgs)
                  topMsgIndex = this.msgbase.total_msgs - nMaxLines;
            }

            selectedMsgIndex = topMsgIndex;
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            // If we were on the last page, then clear the screen from
            // the current line to the end of the screen.
            if (lastPage)
            {
               curpos = console.getxy();
               clearToEOS(curpos.y);
               // Make sure the help line is still there
               DisplayHelpLine(this.sLightbarModeHelpLine);
            }

            // Move the cursor back to the first message info line
            console.gotoxy(1, nListStartLine);
            curpos.x = 1;
            curpos.y = nListStartLine;
         }
      }
      // Numeric digit: The start of a number of a message to read
      else if (userInput.match(/[0-9]/))
      {
         var originalCurpos = console.getxy();

         // Put the user's input back in the input buffer to
         // be used for getting the rest of the message number.
         console.ungetstr(userInput);
         // Move the cursor to the bottom of the screen and
         // prompt the user for the message number.
         console.gotoxy(1, console.screen_rows);
         console.print("n");
         console.clearline();
         console.print("cRead message #: h");
         userInput = console.getnum(this.msgbase.total_msgs);
         if (userInput > 0)
         {
            // Confirm with the user whether to read the message
            var readMsg = true;
            if (this.promptToReadMessage)
            {
               var sReadMsgConfirmText = this.colors["readMsgConfirm"]
                                  + "Read message "
                                  + this.colors["readMsgConfirmNumber"]
                                  + userInput + this.colors["readMsgConfirm"]
                                  + ": Are you sure";
               readMsg = console.yesno(sReadMsgConfirmText);
            }
            if (readMsg)
            {
               this.readAMessage = true;
               this.ReadMessage(userInput-1);
            }
            else
               this.deniedReadingMessage = true;

            // Prompt the user whether or not to continue listing
            // messages.
            if (this.promptToContinueListingMessages)
            {
               continueOn = console.yesno(this.colors["afterReadMsg_ListMorePrompt"] +
                                          "Continue listing messages");
            }
         }

         // If the user chose to continue listing messages, then re-draw
         // the screen.
         if (continueOn)
         {
            console.clear("n");
            this.WriteScreenTopHeader();
            DisplayHelpLine(this.sLightbarModeHelpLine);
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(originalCurpos); // Put the cursor back where it should be
         }
      }
      // DEL key: Delete a message
      else if (userInput == KEY_DEL)
      {
         if (this.CanDelete())
         {
            var originalCurpos = console.getxy();

            console.gotoxy(1, console.screen_rows);
            console.print("n");
            console.clearline();

            // Only let the user delete the message if they're the
            // sysop or they wrote the message.
            if (gIsSysop || (msgHeader.from == user.name) || (msgHeader.from == user.alias))
            {
               // Ask the user if they really want to delete the message
               var delMsg = !console.noyes("nhyDeletenc message #h" +
                                            +(msgHeader.offset+1) + "nc: Are you sure");
               if (delMsg)
               {
                  if (this.msgbase.remove_msg(true, msgHeader.offset))
                  {
                     console.print("ncMessage #h" + +(msgHeader.offset+1) +
                                   "nc has been marked for deletion.\r\n");
                     console.pause();
                  }
               }
            }
            else
            {
               console.print("nhwCannot delete message #y" + +(msgHeader.offset+1) +
                             " wbecause it's not yours or you're not a sysop.");
               console.crlf();
               console.pause();
               DisplayHelpLine(this.sLightbarModeHelpLine);
            }

            // Refresh the screen
            console.clear("n");
            this.WriteScreenTopHeader();
            DisplayHelpLine(this.sLightbarModeHelpLine);
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(originalCurpos); // Put the cursor back where it should be
         }
      }
      // E: Edit a message
      else if (userInput == "E")
      {
         if (this.CanEdit())
         {
            var originalCurpos = console.getxy();

            // Ask the user if they really want to edit the message
            console.gotoxy(1, console.screen_rows);
            console.print("n");
            console.clearline();
            // Let the user edit the message
            var returnObj = this.EditExistingMsg(msgHeader.offset);
            // Refresh the screen
            console.clear("n");
            this.WriteScreenTopHeader();
            DisplayHelpLine(this.sLightbarModeHelpLine);
            console.gotoxy(1, nListStartLine);
            lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
            console.gotoxy(originalCurpos); // Put the cursor back where it should be
         }
      }
      // G: Go to a specific message by # (highlight or place that message on the top)
      else if (userInput == "G")
      {
         var originalCurpos = console.getxy();

         // Move the cursor to the bottom of the screen and
         // prompt the user for a message number.
         console.gotoxy(1, console.screen_rows);
         console.print("n");
         console.clearline();
         console.print("ncGo to message # (or hENTERnc to cancel)gh: c");
         userInput = console.getnum(this.msgbase.total_msgs);
         if (userInput > 0)
         {
            // If the message is on the current page, then just go to and
            // highlight it.  Otherwise, set the user's selected message on the
            // top of the page.  We also have to make sure that curpos.y and
            // originalCurpos.y are set correctly.
            var chosenMsgIndex = userInput - 1;
            //if (chosenMsgIndex <= bottomMsgIndex)
            if ((chosenMsgIndex <= bottomMsgIndex) && (chosenMsgIndex >= topMsgIndex))
            {
               selectedMsgIndex = chosenMsgIndex;
               originalCurpos.y = curpos.y = selectedMsgIndex - topMsgIndex + nListStartLine;
            }
            else
            {
               topMsgIndex = selectedMsgIndex = chosenMsgIndex;
               originalCurpos.y = curpos.y = nListStartLine;
            }
         }

         // Clear & re-draw the screen, at least to fix any
         // alignment problems caused by newline output after
         // the user inputs their choice.
         console.clear("n");
         this.WriteScreenTopHeader();
         DisplayHelpLine(this.sLightbarModeHelpLine);
         console.gotoxy(1, nListStartLine);
         lastPage = this.ListScreenfulOfMessages(topMsgIndex, nMaxLines);
         console.gotoxy(originalCurpos); // Put the cursor back where it should be
      }
   }
}
// For the DigDistMsgListerClass: Prints a line of information about
// a message.
//
// Parameters:
//  pMsgHeader: The message header object, returned by MsgBase.get_msg_header().
//  pHighlight (optional): Boolean, whether or not to highlight the line or
//                         use the standard colors.
function DigDistMsgLister_PrintMessageInfo(pMsgHeader, pHighlight)
{
	// pMsgHeader must be a valid object.
	if (typeof(pMsgHeader) == "undefined")
		return;
	if (pMsgHeader == null)
		return;

	var highlight = false;
	if (typeof(pHighlight) != "undefined")
		highlight = pHighlight;

   // Determine if the message has been deleted.
   var msgDeleted = ((pMsgHeader.attr & MSG_DELETE) == MSG_DELETE);

   // Get the message's import date & time as strings.  If
   // this.displayMessageDateImported is true, use the message import date.
   // Otherwise, use the message written date.
   var sDate;
   var sTime;
   if (this.displayMessageDateImported)
   {
      sDate = strftime("%Y-%m-%d", pMsgHeader.when_imported_time);
      sTime = strftime("%H:%M:%S", pMsgHeader.when_imported_time);
   }
   else
   {
      sDate = strftime("%Y-%m-%d", pMsgHeader.when_written_time);
      sTime = strftime("%H:%M:%S", pMsgHeader.when_written_time);
   }

	// Write the message header information.
	// Note: The message header has the following fields:
	// 'number': The message number
	// 'offset': The message offset
	// 'to': Who the message is directed to (string)
	// 'from' Who wrote the message (string)
	// 'subject': The message subject (string)
	// 'date': The date - Full text (string)
	// To access one of these, use brackets; i.e., msgHeader['to']
	if (highlight)
	{
		printf(this.sMsgInfoFormatHighlightStr,
			   pMsgHeader.offset+1,
			   (msgDeleted ? "ri*nh" + this.colors["msgHighlightBkg"] : " "),
			   pMsgHeader.from.substr(0, this.FROM_LEN),
			   pMsgHeader.to.substr(0, this.TO_LEN),
			   pMsgHeader.subject.substr(0, this.SUBJ_LEN),
			   sDate, sTime);
	}
	else
	{
    // Determine whether to use the normal, "to-user", or "from-user" format string.
    // The differences are the colors.  Then, output the message information line.
    var toNameUpper = pMsgHeader.to.toUpperCase();
    var msgIsToUser = ((toNameUpper == user.alias.toUpperCase()) || (toNameUpper == user.name.toUpperCase()) || (toNameUpper == user.handle.toUpperCase()));
		var fromNameUpper = pMsgHeader.from.toUpperCase();
		var msgIsFromUser = ((fromNameUpper == user.alias.toUpperCase()) || (fromNameUpper == user.name.toUpperCase()) || (fromNameUpper == user.handle.toUpperCase()));
		printf((msgIsToUser ? this.sMsgInfoToUserFormatStr :
		        (msgIsFromUser ? this.sMsgInfoFromUserFormatStr :
		        this.sMsgInfoFormatStr)),
			   pMsgHeader.offset+1,
			   (msgDeleted ? "ri*n" : " "),
			   pMsgHeader.from.substr(0, this.FROM_LEN),
			   pMsgHeader.to.substr(0, this.TO_LEN),
			   pMsgHeader.subject.substr(0, this.SUBJ_LEN),
			   sDate, sTime);
	}
}
// For the DigDistMsgListerClass: Prompts the user to continue or read
// a message (by number).
//
// Parameters:
//  pStart: Whether or not we're on the first page (true or false)
//  pEnd: Whether or not we're at the last page (true or false)
//
// Return value: An array containing the following elements:
//               0: Boolean, whether or not the user wants to continue
//                  listing the messages (true or false).
//               1: The user's input
function DigDistMsgLister_PromptContinueOrReadMsg(pStart, pEnd)
{
	var continueOn = true;

	// Prompt the user whether or not to continue or to read a message
	// (by message number).  Make use of the different prompt texts,
	// depending whether we're at the beginning, in the middle, or at
	// the end of the message list.
	var userInput = "";
	var allowedKeys = "?G"; // ? = help, G = Go to message #
	if (this.CanDelete())
      allowedKeys += "D"; // Delete
   if (this.CanEdit())
      allowedKeys += "E"; // Edit
	if (pStart && pEnd)
	{
		// This is the only page.
		console.print(this.sOnlyOnePageContinuePrompt);
		// Get input from the user.  Allow only Q (quit).
		allowedKeys += "Q";
	}
	else if (pStart)
	{
		// We're on the first page.
		console.print(this.sStartContinuePrompt);
		// Get input from the user.  Allow only L (last), N (next), or Q (quit).
		allowedKeys += "LNQ";
	}
	else if (pEnd)
	{
		// We're on the last page.
		console.print(this.sEndContinuePrompt);
		// Get input from the user.  Allow only F (first), P (previous), or Q (quit).
		allowedKeys += "FPQ";
	}
	else
	{
		// We're neither on the first nor last page.  Allow F (first), L (last),
		// N (next), P (previous), or Q (quit).
		console.print(this.sContinuePrompt);
		allowedKeys += "FLNPQ";
	}
	// Get the user's input.  Allow the keys in allowedKeys or a number from 1
	// to the highest message number.
	userInput = console.getkeys(allowedKeys, this.msgbase.total_msgs).toString();
	if (userInput == "Q")
		continueOn = false;

	// If the user has typed all numbers, then read that message.
	if ((userInput != "") && /^[0-9]+$/.test(userInput))
	{
		// Confirm with the user whether to read the message
		var readMsg = true;
		if (this.promptToReadMessage)
		{
		   var sReadMsgConfirmText = this.colors["readMsgConfirm"]
			   					 + "Read message "
					   			 + this.colors["readMsgConfirmNumber"]
							   	 + userInput + this.colors["readMsgConfirm"]
								    + ": Are you sure";
       readMsg = console.yesno(sReadMsgConfirmText);
    }
		if (readMsg)
		{
			this.readAMessage = true;
			this.ReadMessage(userInput-1);
		}
		else
			this.deniedReadingMessage = true;

		// Prompt the user whether or not to continue listing
		// messages.
		if (this.promptToContinueListingMessages)
    {
         continueOn = console.yesno(this.colors["afterReadMsg_ListMorePrompt"] +
                                    "Continue listing messages");
    }
	}

	// Make sure color highlighting is turned off
	console.print("n");

	// Fill a return object with the required values, and return it.
	var returnObj = new Object();
	returnObj.continueOn = continueOn;
	returnObj.userInput = userInput;
	return returnObj;
}
// For the DigDistMsgLister Class: Given a message number of a message in the
// current message area, shows the message to the user and allows the user to
// respond.
//
// Parameters:
//  pOffset: The offset of the message to be read
//
// Return value: Boolean - Whether or not the user replied to the message.
function DigDistMsgLister_ReadMessage(pOffset)
{
   // Get the message header
	var msgHeader = this.msgbase.get_msg_header(true, pOffset, false);
	if (msgHeader == null)
	{
      console.print("ncUnable to retrieve that message. Press a key: n");
      console.inkey(K_NONE);
      return false;
	}

   var repliedToMessage = false;

	 // Show the message header.
	 this.displayMsgHeader(msgHeader);

   // Show the message body.  Make sure the text is word-wrapped
   // so that it looks good.
   var msgText = this.msgbase.get_msg_body(true, msgHeader.offset);
   var msgTextWrapped = word_wrap(msgText, console.screen_columns-1);
	 console.print(this.colors["msgBody"]);
	 console.putmsg(msgTextWrapped);

	// Hack: If the "from" name in the header is blank (as it might be sometimes), then
	// set it to "All".  This prevents Synchronet from crashing, and it will also default
	// the "to" name in the user's reply to "All".
	if (msgHeader["from"] == "")
		msgHeader["from"] = "All";

   // Mark the message as read, if it was written to the current
   // user.
   var msgToUpper = msgHeader["to"].toUpperCase();
   if ((msgToUpper == user.alias.toUpperCase()) || (msgToUpper == user.name.toUpperCase()))
   {
      msgHeader.attr = (msgHeader.attr | MSG_READ);
      var wroteHeader = this.msgbase.put_msg_header(true, msgHeader.offset, msgHeader);
   }

	// Allow the user to reply to the message.
	// Note: console.noyes() returns false when the user selects Yes.
	if (!console.noyes("ncEnd of message.  Reply"))
	{
		// No special behavior in the reply
		var replyMode = WM_NONE;

		// If quoting is allowed in the sub-board, then write QUOTES.TXT in
		// the node directory to allow the user to quote the original message.
		var quoteFile = null;
		if (this.CanQuote())
		{
			quoteFile = new File(system.node_dir + "QUOTES.TXT");
			if (quoteFile.open("w"))
			{
				quoteFile.write(word_wrap(msgText, 79));
				quoteFile.close();
				// Let the user quote in the reply
				replyMode = WM_QUOTE;
			}
		}

		// Note: The following commented-out code was a kludge that
		// no longer seems necessary with recent (3.15) builds of
		// Synchronet.
		/*
		// If posting in a local group, then the 'from' and 'to' names
		// in the message header must be swapped in order to have the
		// correct 'to' name in the reply.
		if (msgHeader.from_net_type == NET_NONE)
		{
			var fromBackup = msgHeader.from;
			msgHeader.from = msgHeader.to;
			msgHeader.to = fromBackup;
		}
		*/

		// If the user is listing personal e-mail, then we need to call
		// bbs.email() to leave a reply; otherwise, use bbs.post_msg().
		if (this.subBoardCode == "mail")
		{
			// The reply mode must be WM_EMAIL in order to send personal email.
			// Also, add WM_QUOTE if quoting was set.
			replyMode = (replyMode == WM_QUOTE ? WM_EMAIL | WM_QUOTE : WM_EMAIL);
			// Look up the user number of the "from" user name in the message header
			var userNumber = system.matchuser(msgHeader.from);
			if (userNumber != 0)
				repliedToMessage = bbs.email(userNumber, replyMode, "", msgHeader["subject"]);
			else
				console.print("nhyFailed to find user # for w" + msgHeader.from + "\r\n");
		}
		else
		{
			// The user is posting in a public message sub-board.
			// Open a file in the node directory and write some information
			// about the current sub-board and message being read:
			// - The highest message number in the sub-board (last message)
			// - The total number of messages in the sub-board
			// - The number of the message being read
			// - The current sub-board code
			// This is for message editors that need to access the message
			// base (i.e., SlyEdit).  Normally (in Synchronet's message read
			// propmt), this information is stored in bbs.smb_last_msg,
			// bbs.smb_total_msgs, and bbs.smb_curmsg, but this message lister
			// can't change those values.  Thus, we need to write them to a file.
			var msgBaseInfoFile = new File(system.node_dir + "DDML_SyncSMBInfo.txt");
			if (msgBaseInfoFile.open("w"))
			{
        msgBaseInfoFile.writeln(this.msgbase.last_msg.toString()); // Highest message #
        msgBaseInfoFile.writeln(this.msgbase.total_msgs.toString()); // Total # messages
				// Message number (Note: For SlyEdit, requires SlyEdit 1.27 or newer).
				msgBaseInfoFile.writeln(msgHeader.number.toString()); // # of the message being read (New: 2013-05-14)
				// Old: Using either the message number or offset:
				/*// Message number/offset:
				// If the Synchronet version is at least 3.16 and the Synchronet compile
        // date is at least May 12, 2013, then use bbs.msg_number.  Otherwise,
        // use bbs.smb_curmsg.  bbs.msg_number is the absolute message number and
        // is always accurate, but bbs.msg_number only works properly in the
        // Synchronet 3.16 daily builds starting on May 12, 2013, which was right
        // after Digital Man committed his fix to make bbs.msg_number work properly.
        if ((system.version_num >= 3.16) && gSyncCompileDateAtLeast2013_05_12)
          msgBaseInfoFile.writeln(msgHeader.number.toString()); // # of the message being read (New: 2013-05-14)
        else
          msgBaseInfoFile.writeln(pOffset.toString()); // Offset of the message (for older builds of Synchronet)*/
				msgBaseInfoFile.writeln(this.subBoardCode); // Sub-board code
				msgBaseInfoFile.close();
			}

			// Let the user post the message.  Then, delete the message base info
			// file.
			repliedToMessage = bbs.post_msg(this.subBoardCode, replyMode, msgHeader);
			msgBaseInfoFile.remove();
    }

		// Delete the quote file
		if (quoteFile != null)
         quoteFile.remove();
	}

	return repliedToMessage;
}
// For the DigDistMsgLister Class: Writes the message columns at the top of the
// screen.
function DigDistMsgLister_WriteScreenTopHeader()
{
	console.home();

	// If we will be displaying the message group and sub-board in the
	// header at the top of the screen (an additional 2 lines), then
	// update nMaxLines and nListStartLine to account for this.
	if (this.displayBoardInfoInHeader && canDoHighASCIIAndANSI())
	//if (this.displayBoardInfoInHeader && console.term_supports(USER_ANSI))
	{
		var curpos = console.getxy();
      // Figure out the message group name
		var msgGroupName = "";
		if (this.msgbase.cfg != null)
         msgGroupName = msg_area.grp_list[this.msgbase.cfg.grp_number].description;
      else
         msgGroupName = "Unspecified";
      // Figure out the sub-board name
      var subBoardName = "";
      if (this.msgbase.cfg != null)
         subBoardName = this.msgbase.cfg.description;
      else if ((this.msgbase.subnum == -1) || (this.msgbase.subnum == 65535))
         subBoardName = "Electronic Mail";
      else
         subBoardName = "Unspecified";

      // Display the message group name
      console.print(this.colors["headerMsgGroupText"] + "Msg group: " +
                    this.colors["headerMsgGroupName"] + msgGroupName);
		console.cleartoeol(); // Fill to the end of the line with the current colors
		// Display the sub-board name on the next line
		++curpos.y;
		console.gotoxy(curpos);
		console.print(this.colors["headerSubBoardText"] + "Sub-board: " +
                    this.colors["headerMsgSubBoardName"] + subBoardName);
		console.cleartoeol(); // Fill to the end of the line with the current colors
		++curpos.y;
		console.gotoxy(curpos);
	}

	// Write the message listing column headers
	printf(this.colors["listColHeader"] + this.sHdrFormatStr, "Msg#", "From", "To", "Subject", "Date", "Time");

	// Set the normal text attribute
	console.print("n");
}
// For the DigDistMsgLister Class: Lists a screenful of message header information.
//
// Parameters:
//  pTopIndex: The index (offset) of the top message
//  pMaxLines: The maximum number of lines to output to the screen
//
// Return value: Boolean, whether or not the last message output to the
//               screen is the last message in the sub-board.
function DigDistMsgLister_ListScreenfulOfMessages(pTopIndex, pMaxLines)
{
   var atLastPage = false;

	var curpos = console.getxy();
	var msgIndex = 0;
	if (this.reverseOrder)
	{
      var endIndex = pTopIndex - pMaxLines + 1; // The index of the last message to display
      for (msgIndex = pTopIndex; (msgIndex >= 0) && (msgIndex >= endIndex); --msgIndex)
      {
         // The following line which sets console.line_counter to 0 is a
         // kludge to disable Synchronet's automatic pausing after a
         // screenful of text, so that this script can have more control
         // over screen pausing.
         console.line_counter = 0;

         // Get the message header (it will be a MsgHeader object) and
         // display it.
         msgHeader = this.msgbase.get_msg_header(true, msgIndex, true);
         if (msgHeader == null)
            continue;

         // Display the message info
         this.PrintMessageInfo(msgHeader, false);
         ++curpos.y;
         console.gotoxy(curpos);
      }

      atLastPage = (msgIndex < 0);
	}
	else
	{
      var endIndex = pTopIndex + pMaxLines; // One past the last message index to display
      for (msgIndex = pTopIndex; (msgIndex < this.msgbase.total_msgs) && (msgIndex < endIndex); ++msgIndex)
      {
         // The following line which sets console.line_counter to 0 is a
         // kludge to disable Synchronet's automatic pausing after a
         // screenful of text, so that this script can have more control
         // over screen pausing.
         console.line_counter = 0;

         // Get the message header (it will be a MsgHeader object) and
         // display it.
         msgHeader = this.msgbase.get_msg_header(true, msgIndex, true);
         if (msgHeader == null)
            continue;

         // Display the message info
         this.PrintMessageInfo(msgHeader, false);
         ++curpos.y;
         console.gotoxy(curpos);
      }

      atLastPage = (msgIndex == this.msgbase.total_msgs);
   }

   return atLastPage;
}
// For the DigDistMsgLister Class: Displays general help.
//
// Parameters:
//  pPauseAtEnd: Boolean, whether or not to pause at the end.
function DigDistMsgLister_DisplayHelp(pPauseAtEnd)
{
	DisplayProgramInfo();

	// Display help specific to which interface is being used.
	if (this.interfaceStyle == "Traditional")
		this.DisplayTraditionalHelp(false);
	else if (this.interfaceStyle == "Lightbar")
		this.DisplayLightbarHelp(false);

	// If pPauseAtEnd is true, then output a newline and
	// prompt the user whether or not to continue.
	if (pPauseAtEnd)
		console.pause();
}
// For the DigDistMsgLister Class: Displays help specific to the page-end
// interface.
//
// Parameters:
//  pDisplayHeader: Whether or not to display a help header at the beginning
//  pPauseAtEnd: Boolean, whether or not to pause at the end.
function DigDistMsgLister_DisplayTraditionalHelp(pDisplayHeader, pPauseAtEnd)
{
	// If pDisplayHeader is true, then display the program information.
	if (pDisplayHeader)
		DisplayProgramInfo();

   console.print("n" + this.colors["helpScreen"]);
   displayTextWithLineBelow("Page navigation and message selection", false,
                            this.colors["helpScreen"], "kh");
	console.print(this.colors["helpScreen"]);
	console.print("The message lister will display a page of message header information.  At\r\n");
	console.print("the end of each page, a prompt is displayed, allowing you to navigate to\r\n");
	console.print("the next page, previous page, first page, or the last page.  If you would\r\n");
	console.print("like to read a message, you may type the message number, followed by\r\n");
	console.print("the enter key if the message number is short.  To quit the listing, press\r\n");
	console.print("the Q key.\r\n\r\n");
	this.DisplayMessageListNotesHelp();
	console.crlf();
	console.crlf();
	displayTextWithLineBelow("Summary of the keyboard commands:", false,
	                         this.colors["helpScreen"], "kh");
	console.print(this.colors["helpScreen"]);
	console.print("nhcN" + this.colors["helpScreen"] + ": Go to the next page\r\n");
	console.print("nhcP" + this.colors["helpScreen"] + ": Go to the previous page\r\n");
	console.print("nhcF" + this.colors["helpScreen"] + ": Go to the first page\r\n");
	console.print("nhcL" + this.colors["helpScreen"] + ": Go to the last page\r\n");
	console.print("nhcG" + this.colors["helpScreen"] + ": Go to a specific message by number (the message will appear at the top\r\n" +
	              "   of the list)\r\n");
	console.print("nhcNumber" + this.colors["helpScreen"] + ": Read the message corresponding with that number\r\n");
	console.print("nhcQ" + this.colors["helpScreen"] + ": Quit\r\n");
	console.print("nhc?" + this.colors["helpScreen"] + ": Show this help screen\r\n\r\n");
	//console.print("The following commands are available only if you have permission to do so:\r\n");
	if (this.CanDelete())
      console.print("nhcD" + this.colors["helpScreen"] + ": Mark a message for deletion\r\n");
	if (this.CanEdit())
      console.print("nhcE" + this.colors["helpScreen"] + ": Edit an existing message\r\n");

	// If pPauseAtEnd is true, then output a newline and
	// prompt the user whether or not to continue.
	if (pPauseAtEnd)
		console.pause();
}
// For the DigDistMsgLister Class: Displays help specific to the lightbar
// interface.
//
// Parameters:
//  pDisplayHeader: Whether or not to display a help header at the beginning
//  pPauseAtEnd: Boolean, whether or not to pause at the end.
function DigDistMsgLister_DisplayLightbarHelp(pDisplayHeader, pPauseAtEnd)
{
	// If pDisplayHeader is true, then display the program information.
	if (pDisplayHeader)
		DisplayProgramInfo();

   displayTextWithLineBelow("Lightbar interface: Page navigation and message selection",
	                         false, this.colors["helpScreen"], "kh");
	console.print(this.colors["helpScreen"]);
	console.print("The message lister will display a page of message header information.  You\r\n");
	console.print("may use the up and down arrows to navigate the list of messages.  The\r\n");
	console.print("currently-selected message will be highlighted as you navigate through\r\n");
	console.print("the list.  To read a message, navigate to the desired message and press\r\n");
	console.print("the enter key.  You can also read a message by typing its message number.\r\n");
	console.print("To quit out of the message list, press the Q key.\r\n\r\n");
	this.DisplayMessageListNotesHelp();
	console.crlf();
	console.crlf();
	displayTextWithLineBelow("Summary of the keyboard commands:", false,
	                         this.colors["helpScreen"], "kh");
	console.print(this.colors["helpScreen"]);
	console.print("nhcDown arrow" + this.colors["helpScreen"] + ": Move the cursor down/select the next message\r\n");
	console.print("nhcUp arrow" + this.colors["helpScreen"] + ": Move the cursor up/select the previous message\r\n");
	console.print("nhcN" + this.colors["helpScreen"] + ": Go to the next page\r\n");
	console.print("nhcP" + this.colors["helpScreen"] + ": Go to the previous page\r\n");
	console.print("nhcF" + this.colors["helpScreen"] + ": Go to the first page\r\n");
	console.print("nhcL" + this.colors["helpScreen"] + ": Go to the last page\r\n");
	console.print("nhcG" + this.colors["helpScreen"] + ": Go to a specific message by number (the message will be highlighted and\r\n" +
	              "   may appear at the top of the list)\r\n");
	console.print("nhcENTER" + this.colors["helpScreen"] + ": Read the selected message\r\n");
	console.print("nhcNumber" + this.colors["helpScreen"] + ": Read the message corresponding with that number\r\n");
	console.print("nhcQ" + this.colors["helpScreen"] + ": Quit\r\n");
	console.print("nhc?" + this.colors["helpScreen"] + ": Show this help screen\r\n");
	if (this.CanDelete())
      console.print("nhcDEL" + this.colors["helpScreen"] + ": Mark the selected message for deletion\r\n");
	if (this.CanEdit())
      console.print("nhcE" + this.colors["helpScreen"] + ": Edit the selected message\r\n");

	// If pPauseAtEnd is true, then output a newline and
	// prompt the user whether or not to continue.
	if (pPauseAtEnd)
		console.pause();
}
// For the DigDistMsgLister class: Displays the message list notes for the
// help screens.
function DigDistMsgLister_DisplayMessageListNotesHelp()
{
   displayTextWithLineBelow("Notes about the message list:", false,
                            this.colors["helpScreen"], "nkh")
   console.print(this.colors["helpScreen"]);
	console.print("If a message has been marked for deletion, it will appear with a blinking\r\n");
	console.print("red asterisk (nhri*" + "n" + this.colors["helpScreen"] + ") in");
	console.print(" after the message number in the message list.");
}
// For the DigDistMsgLister Class: Sets the traditional UI pause prompt text
// strings, and also sets sLightbarModeHelpLine, the text string for the
// lightbar help line.  This checks with this.msgbase to determine if the
// user is allowed to delete or edit messages, and if so, adds the appropriate
// keys to the prompt & help text.
function DigDistMsgLister_SetPauseTextAndLightbarHelpLine()
{
   var helpLineHotkeyColor = "r";
	var helpLineNormalColor = "b";
	var helpLineParenColor = "m";

   if (this.msgbase != null)
   {
      // Set the traditional UI pause prompt text.
      // If the user can delete messages, then append D as a valid key.
      // If the user can edit messages, then append E as a valid key.
      this.sStartContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Nnc)"
                             + this.colors["contPromptMain"]
                             + "ext, nc(" + this.colors["contPromptHotkeys"] + "Lnc)"
                             + this.colors["contPromptMain"]
                             + "ast, nc(" + this.colors["contPromptHotkeys"] + "Gnc)"
                             + this.colors["contPromptMain"]
                             + "o, "
      if (this.CanDelete())
      {
         this.sStartContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Dnc)" + this.colors["contPromptMain"] + "el, ";
      }
      if (this.CanEdit())
      {
         this.sStartContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Enc)" + this.colors["contPromptMain"] + "dit, ";
      }
      this.sStartContinuePrompt += "nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#" +
                            this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];

      this.sContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Nnc)"
                             + this.colors["contPromptMain"]
                             + "ext, c(" + this.colors["contPromptHotkeys"] + "Pnc)"
                             + this.colors["contPromptMain"]
                             + "rev, nc(" + this.colors["contPromptHotkeys"] + "Fnc)"
                             + this.colors["contPromptMain"]
                             + "irst, nc(" + this.colors["contPromptHotkeys"] + "Lnc)"
                             + this.colors["contPromptMain"]
                             + "ast, nc(" + this.colors["contPromptHotkeys"] + "Gnc)"
                             + this.colors["contPromptMain"]
                             + "o, "
      if (this.CanDelete())
      {
         this.sContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Dnc)" + this.colors["contPromptMain"] + "el, ";
      }
      if (this.CanEdit())
      {
         this.sContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Enc)" + this.colors["contPromptMain"] + "dit, ";
      }
      this.sContinuePrompt += "nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];

      this.sEndContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Pnc)"
                             + this.colors["contPromptMain"]
                             + "rev, nc(" + this.colors["contPromptHotkeys"] + "Fnc)"
                             + this.colors["contPromptMain"]
                             + "irst, nc(" + this.colors["contPromptHotkeys"] + "Gnc)"
                             + this.colors["contPromptMain"]
                             + "o, "
      if (this.CanDelete())
      {
         this.sEndContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Dnc)" + this.colors["contPromptMain"] + "el, ";
      }
      if (this.CanEdit())
      {
         this.sEndContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Enc)" + this.colors["contPromptMain"] + "dit, ";
      }
      this.sEndContinuePrompt += "nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];

      this.sOnlyOnePageContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Gnc)"
                             + this.colors["contPromptMain"]
                             + "o, "
      if (this.CanDelete())
      {
         this.sOnlyOnePageContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Dnc)" + this.colors["contPromptMain"] + "el, ";
      }
      if (this.CanEdit())
      {
         this.sOnlyOnePageContinuePrompt += "nc(" + this.colors["contPromptHotkeys"]
                       + "Enc)" + this.colors["contPromptMain"] + "dit, ";
      }
      this.sOnlyOnePageContinuePrompt += "nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];

      // Set the lightbar help text
      var extraCommas = true; // Whether there's room for commas between the last options
      this.sLightbarModeHelpLine = "n7" + helpLineHotkeyColor + UP_ARROW
	              + helpLineNormalColor + ", " + helpLineHotkeyColor + DOWN_ARROW
	              + helpLineNormalColor + ", " + helpLineHotkeyColor + "ENTER"
	              + helpLineNormalColor + ", " + helpLineHotkeyColor + "HOME"
	              + helpLineNormalColor + ", " + helpLineHotkeyColor + "END";
      // If the user can delete messages, then append DEL as a valid key.
      if (this.CanDelete())
      {
         this.sLightbarModeHelpLine += helpLineNormalColor + ", "
                                     + helpLineHotkeyColor + "DEL";
         extraCommas = false;
      }
      this.sLightbarModeHelpLine += helpLineNormalColor + ", " + helpLineHotkeyColor
                                  + "#" + helpLineNormalColor + ", ";
      // If the user can edit messages, then append E as a valid key.
      if (this.CanEdit())
      {
         this.sLightbarModeHelpLine += helpLineHotkeyColor
                 + "E" + helpLineParenColor + ")" + helpLineNormalColor + "dit "
      }
      this.sLightbarModeHelpLine += helpLineHotkeyColor + "N"
					  + helpLineParenColor + ")"
					  + helpLineNormalColor + (extraCommas ? "ext, " : "ext ")
					  + helpLineHotkeyColor + "P"
					  + helpLineParenColor + ")"
					  + helpLineNormalColor + (extraCommas ? "rev, " : "rev ")
					  + helpLineHotkeyColor + "F"
					  + helpLineParenColor
					  + ")" + helpLineNormalColor + (extraCommas ? "irst, " : "irst ")
					  + helpLineHotkeyColor + "L"
					  + helpLineParenColor + ")" + helpLineNormalColor
					  + (extraCommas ? "ast, " : "ast ")
					  + helpLineHotkeyColor + "G" + helpLineParenColor + ")"
					  + helpLineNormalColor + (extraCommas ? "o, " : "o ")
					  + helpLineHotkeyColor + "Q" + helpLineParenColor + ")"
					  + helpLineNormalColor + (extraCommas ? "uit, " : "uit ")
					  + helpLineHotkeyColor + "?";
   }
   else
   {
      // this.msgbase is null, so construct the default pause & help text (without
      // the delete & edit keys).

      // Set the traditional UI pause prompt text
      this.sStartContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Nnc)"
                             + this.colors["contPromptMain"]
                            + "ext, nc(" + this.colors["contPromptHotkeys"] + "Lnc)"
                            + this.colors["contPromptMain"]
                            + "ast, nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#" +
                            this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];
      this.sContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Nnc)"
                             + this.colors["contPromptMain"]
                            + "ext, c(" + this.colors["contPromptHotkeys"] + "Pnc)"
                            + this.colors["contPromptMain"]
                            + "rev, nc(" + this.colors["contPromptHotkeys"] + "Fnc)"
                            + this.colors["contPromptMain"]
                            + "irst, nc(" + this.colors["contPromptHotkeys"] + "Lnc)"
                            + this.colors["contPromptMain"]
                            + "ast, nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];
      this.sEndContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Pnc)"
                            + this.colors["contPromptMain"]
                            + "rev, nc(" + this.colors["contPromptHotkeys"] + "Fnc)"
                            + this.colors["contPromptMain"]
                            + "irst, nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];
      this.sOnlyOnePageContinuePrompt = "nc(" + this.colors["contPromptHotkeys"] + "Qnc)"
                            + this.colors["contPromptMain"]
                            + "uit, message " + this.colors["contPromptHotkeys"] + "#"
                            + this.colors["contPromptMain"] + ", or " + this.colors["contPromptHotkeys"]
                            + "?" + this.colors["contPromptMain"] + ": "
                            + this.colors["contPromptUserInput"];

      // Set the lightbar help line
      this.sLightbarModeHelpLine = "n7" + helpLineHotkeyColor + UP_ARROW
	          + helpLineNormalColor + ", " + helpLineHotkeyColor + DOWN_ARROW
					  + helpLineNormalColor + ", " + helpLineHotkeyColor + "ENTER"
					  + helpLineNormalColor + ", " + helpLineHotkeyColor + "HOME"
					  + helpLineNormalColor + ", " + helpLineHotkeyColor + "END"
					  + helpLineNormalColor + ", " + helpLineHotkeyColor + "N"
					  + helpLineParenColor + ")"
					  + helpLineNormalColor + "ext, " + helpLineHotkeyColor + "P"
					  + helpLineParenColor + ")"
					  + helpLineNormalColor + "rev, " + helpLineHotkeyColor + "F"
					  + helpLineParenColor
					  + ")" + helpLineNormalColor + "irst, " + helpLineHotkeyColor + "L"
					  + helpLineParenColor + ")" + helpLineNormalColor + "ast, "
					  + helpLineHotkeyColor + "Q" + helpLineParenColor + ")"
					  + helpLineNormalColor + "uit, " + helpLineHotkeyColor
					  + "#" + helpLineNormalColor + " or " + helpLineHotkeyColor + "?";
   }
   // Add spaces to the end of sLightbarModeHelpLine up until one char
   // less than the width of the screen.
   var lbHelpLineLen = strip_ctrl(this.sLightbarModeHelpLine).length;
   var numChars = console.screen_columns - lbHelpLineLen - 3;
   if (numChars > 0)
   {
		// Gradient block characters: АБВл
		// Add characters on the left and right of the line so that the
		// text is centered.
		var numLeft = Math.floor(numChars / 2);
		var numRight = numChars - numLeft;
		for (var i = 0; i < numLeft; ++i)
			this.sLightbarModeHelpLine = "л" + this.sLightbarModeHelpLine;
		this.sLightbarModeHelpLine = "nw" + this.sLightbarModeHelpLine;
		this.sLightbarModeHelpLine += "nw";
		for (var i = 0; i < numRight; ++i)
			this.sLightbarModeHelpLine += "л";
	}
}
// For the DigDistMsgLister class: Reads DigitalDistortionMessageLister.cfg
// and sets the object properties accordingly.
function DigDistMsgLister_ReadConfigFile()
{
   // Determine the script's startup directory.
   // This code is a trick that was created by Deuce, suggested by Rob Swindell
   // as a way to detect which directory the script was executed in.  I've
   // shortened the code a little.
   var startup_path = '.';
   try { throw dig.dist(dist); } catch(e) { startup_path = e.fileName; }
   startup_path = backslash(startup_path.replace(/[\/\\][^\/\\]*$/,''));

   // Open the configuration file.  First look for it in the sbbs/ctrl
   // directory, and if it doesn't exist there, assume it's in the same
   // directory as this script.
   var cfgFilename = system.ctrl_dir + "DigitalDistortionMessageLister.cfg";
   if (!file_exists(cfgFilename))
     cfgFilename = startup_path + "DigitalDistortionMessageLister.cfg";
   var cfgFile = new File(cfgFilename);
   if (cfgFile.open("r"))
   {
      var settingsMode = "behavior";
      var fileLine = null;     // A line read from the file
      var equalsPos = 0;       // Position of a = in the line
      var commentPos = 0;      // Position of the start of a comment
      var setting = null;      // A setting name (string)
      var settingUpper = null; // Upper-case setting name
      var value = null;        // To store a value for a setting (string)
      var valueUpper = null;   // Upper-cased value for a setting (string)
      while (!cfgFile.eof)
      {
         // Read the next line from the config file.
         fileLine = cfgFile.readln(2048);

         // fileLine should be a string, but I've seen some cases
         // where it isn't, so check its type.
         if (typeof(fileLine) != "string")
            continue;

         // If the line starts with with a semicolon (the comment
         // character) or is blank, then skip it.
         if ((fileLine.substr(0, 1) == ";") || (fileLine.length == 0))
            continue;

         // If in the "behavior" section, then set the behavior-related variables.
         if (fileLine.toUpperCase() == "[BEHAVIOR]")
         {
            settingsMode = "behavior";
            continue;
         }
         else if (fileLine.toUpperCase() == "[COLORS]")
         {
            settingsMode = "colors";
            continue;
         }

         // If the line has a semicolon anywhere in it, then remove
         // everything from the semicolon onward.
         commentPos = fileLine.indexOf(";");
         if (commentPos > -1)
            fileLine = fileLine.substr(0, commentPos);

         // Look for an equals sign, and if found, separate the line
         // into the setting name (before the =) and the value (after the
         // equals sign).
         equalsPos = fileLine.indexOf("=");
         if (equalsPos > 0)
         {
            // Read the setting & value, and trim leading & trailing spaces.
            setting = trimSpaces(fileLine.substr(0, equalsPos), true, false, true);
            settingUpper = setting.toUpperCase();
            value = trimSpaces(fileLine.substr(equalsPos+1), true, false, true);
            valueUpper = value.toUpperCase();

            if (settingsMode == "behavior")
            {
               // Set the appropriate valueUpper in the settings object.
               if (settingUpper == "INTERFACESTYLE")
               {
                  // Ensure that the first character is uppercase and the
                  // rest is lower-case.
                  if ((valueUpper == "LIGHTBAR") || (valueUpper == "TRADITIONAL"))
                  {
                     this.interfaceStyle = valueUpper.substr(0, 1).toUpperCase()
                                          + valueUpper.substr(1).toLowerCase();
                  }
               }
               else if (settingUpper == "DISPLAYBOARDINFOINHEADER")
                  this.displayBoardInfoInHeader = (valueUpper == "TRUE");
               // Note: this.reverseOrder can be true, false, or "ASK"
               else if (settingUpper == "REVERSEORDER")
                  this.reverseOrder = (valueUpper == "ASK" ? "ASK" : (valueUpper == "TRUE"));
               else if (settingUpper == "PROMPTTOCONTINUELISTINGMESSAGES")
                  this.promptToContinueListingMessages = (valueUpper == "TRUE");
               else if (settingUpper == "PROMPTCONFIRMREADMESSAGE")
                  this.promptToReadMessage = (valueUpper == "TRUE");
               // messageDateDisplayed: imported or written
               else if (settingUpper == "MESSAGEDATEDISPLAYED")
                  this.displayMessageDateImported = (valueUpper.toUpperCase() == "IMPORTED");
               // Name of the message header file (without extension) in sbbs/text/menu
               else if (settingUpper == "MSGHDRTEXTFILENAME")
                  this.msgHdrTextFileName = (value.length == 0 ? "msghdr" : value);
            }
            else if (settingsMode == "colors")
               this.colors[setting] = value;
         }
      }

      cfgFile.close();
   }
}
// For the DigDistMsgLister class: Lets the user edit an existing message.
//
// Parameters:
//  pMsgIndex: The index of the message to edit
//
// Return value: An object with the following parameters:
//               userCannotEdit: Boolean - True if the user can't edit, false if they can
//               userConfirmed: Boolean - Whether or not the user confirmed editing
//               msgEdited: Boolean - Whether or not the message was edited
function DigDistMsgLister_EditExistingMsg(pMsgIndex)
{
   var returnObj = new Object();
   returnObj.userCannotEdit = false;
   returnObj.userConfirmed = false;
   returnObj.msgEdited = false;

   // Only let the user edit the message if they're a sysop or
   // if they wrote the message.
   var msgHeader = this.msgbase.get_msg_header(true, pMsgIndex);
   if (!gIsSysop && (msgHeader.from != user.name) && (msgHeader.from != user.alias))
   {
      console.print("nhwCannot edit message #y" + +(pMsgIndex+1) +
                    " wbecause it's not yours or you're not a sysop.\r\np");
      returnObj.userCannotEdit = true;
      return returnObj;
   }

   // Confirm the action with the user (default to no).
   returnObj.userConfirmed = !console.noyes("ncEdit message #h" +
                                            +(pMsgIndex+1) + "nc: Are you sure");
   if (!returnObj.userConfirmed)
      return returnObj;

   // Dump the message body to a temporary file in the node dir
   var originalMsgBody = this.msgbase.get_msg_body(true, pMsgIndex);
   var tempFilename = system.node_dir + "DDMsgLister_message.txt";
   var tmpFile = new File(tempFilename);
   if (tmpFile.open("w"))
   {
      var wroteToTempFile = tmpFile.write(word_wrap(originalMsgBody, 79));
      tmpFile.close();
      // If we were able to write to the temp file, then let the user
      // edit the file.
      if (wroteToTempFile)
      {
         // The following lines set some attributes in the bbs object
         // in an attempt to make the "To" name and subject appear
         // correct in the editor.
         // TODO: On May 14, 2013, Digital Man said bbs.msg_offset will
         // probably be removed because it doesn't provide any benefit.
         // bbs.msg_number is a unique message identifier that won't
         // change, so it's probably best for scripts to use bbs.msg_number
         // instead of offsets.
         bbs.msg_to = msgHeader.to;
         bbs.msg_to_ext = msgHeader.to_ext;
         bbs.msg_subject = msgHeader.subject;
         bbs.msg_offset = msgHeader.offset;
         bbs.msg_number = msgHeader.number;

         // Let the user edit the temporary file
         console.editfile(tempFilename);
         // Load the temp file back into msgBody and have this.msgbase
         // save the message.
         if (tmpFile.open("r"))
         {
            var newMsgBody = tmpFile.read();
            tmpFile.close();
            // If the new message body is different from the original message
            // body, then go ahead and save the message and mark the original
            // message for deletion. (Checking the new & original message
            // bodies seems to be the only way to check to see if the user
            // aborted out of the message editor.)
            if (newMsgBody != originalMsgBody)
            {
               var newHdr = { to: msgHeader.to, to_ext: msgHeader.to_ext, from: msgHeader.from,
                              from_ext: msgHeader.from_ext, attr: msgHeader.attr,
                              subject: msgHeader.subject };
               var savedNewMsg = this.msgbase.save_msg(newHdr, newMsgBody);
               // If the message was successfully saved, then mark the original
               // message for deletion and output a message to the user.
               if (savedNewMsg)
               {
                  returnObj.msgEdited = true;
                  var message = "ncThe edited message has been saved as a new message.";
                  if (this.msgbase.remove_msg(true, pMsgIndex))
                     message += "  The original has been\r\nmarked for deletion.";
                  else
                     message += "  hyHowever, the original\r\ncould not be marked for deletion.";
                  message += "\r\np";
                  console.print(message);
               }
               else
                  console.print("\r\n\1n\1h\1yError: \1wFailed to save the new message\r\np");
            }
         }
         else
         {
            console.print("\r\n\1n\1h\1yError: \1wUnable to read the temporary file\r\n");
            console.print("Filename: \1b" + tempFilename + "\r\n");
            console.pause();
         }
      }
      else
      {
         console.print("\r\n\1n\1h\1yError: \1wUnable to write to temporary file\r\n");
         console.print("Filename: \1b" + tempFilename + "\r\n");
         console.pause();
      }
   }
   else
   {
      console.print("\r\n\1n\1h\1yError: \1wUnable to open a temporary file for writing\r\n");
      console.print("Filename: \1b" + tempFilename + "\r\n");
      console.pause();
   }
   // Delete the temporary file from disk.
   tmpFile.remove();

   return returnObj;
}
// For the DigDistMsgLister Class: Returns whether or not the user can delete
// messages.
function DigDistMsgLister_CanDelete()
{
   var canDelete = gIsSysop;
   if ((this.msgbase != null) && (this.msgbase.cfg != null))
      canDelete = canDelete || ((this.msgbase.cfg.settings & SUB_DEL) == SUB_DEL);
   return canDelete;
}
// For the DigDistMsgLister Class: Returns whether or not the user can edit
// messages.
function DigDistMsgLister_CanEdit()
{
   var canDelete = gIsSysop;
   if ((this.msgbase != null) && (this.msgbase.cfg != null))
      canDelete = canDelete || ((this.msgbase.cfg.settings & SUB_EDIT) == SUB_EDIT);
   return canDelete;
}
// For the DigDistMsgLister Class: Returns whether or not message quoting
// is enabled.
function DigDistMsgLister_CanQuote()
{
   var canQuote = gIsSysop;
   if ((this.msgbase != null) && (this.msgbase.cfg != null))
      canQuote = canQuote || ((this.msgbase.cfg.settings & SUB_QUOTE) == SUB_QUOTE);
   return canQuote;
}

function DigDistMsgLister_DisplayMsgHeader(pMsgHdrObj)
{
  if (pMsgHdrObj == null)
    return;

  // Note: The message header has the following fields:
	// 'number': The message number
	// 'offset': The message offset
	// 'to': Who the message is directed to (string)
	// 'from' Who wrote the message (string)
	// 'subject': The message subject (string)
	// 'date': The date - Full text (string)

  // Generate a string containing the message's import date & time.
  //var dateTimeStr = strftime("%Y-%m-%d %H:%M:%S", msgHeader.when_imported_time)
  // Use the date text in the message header, without the time
  // zone offset at the end.
  var dateTimeStr = pMsgHdrObj["date"].replace(/ [-+][0-9]+$/, "");

  // Generate a string describing the message attributes
  var msgAttrStr = "";
	if ((pMsgHdrObj.attr & MSG_DELETE) == MSG_DELETE)
    msgAttrStr += "DEL";
  if ((pMsgHdrObj.attr & MSG_PRIVATE) == MSG_PRIVATE)
  {
    if (msgAttrStr.length > 0)
      msgAttrStr += ", ";
    msgAttrStr += "PRIV";
  }

  // Check to see if there is a msghdr file in the sbbs/text/menu
  // directory.  If there is, then use it to display the message
  // header information.  Otherwise, output a default message header.
  var msgHdrFileOpened = false;
  var msgHdrFilename = this.getMsgHdrFullFilename();
  if (msgHdrFilename.length > 0)
  {
    var msgHdrFile = new File(msgHdrFilename);
    if (msgHdrFile.open("r"))
    {
      msgHdrFileOpened = true;
      var fileLine = null; // To store a line read from the file
      while (!msgHdrFile.eof)
      {
         // Read the next line from the header file
         fileLine = msgHdrFile.readln(2048);

         // fileLine should be a string, but I've seen some cases
         // where it isn't, so check its type.
         if (typeof(fileLine) != "string")
            continue;

         // Message variables (@-codes) to replace in the line:
         // @MSG_FROM@, @MSG_TO@, @MSG_SUBJECT@, @MSG_DATE@, @MSG_ATTR@
         console.putmsg(fileLine.replace(/@MSG_FROM@/gi, pMsgHdrObj["from"])
                                .replace(/@MSG_TO@/gi, pMsgHdrObj["to"])
                                .replace(/@MSG_SUBJECT@/gi, pMsgHdrObj["subject"])
                                .replace(/@MSG_DATE@/gi, dateTimeStr)
                                .replace(/@MSG_ATTR@/gi, msgAttrStr));
         console.crlf();
      }
      msgHdrFile.close();
    }
  }

  // If the msghdr file didn't open (or doesn't exist), then output the default
  // header.
  if (!msgHdrFileOpened)
  {
    // msghdr file not found in the sbbs/text/menu directory, so output
    // a default header.
    console.print("nwАБВлллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллллВБА");
    console.crlf();
    console.print("nwАБВлнcFromwh: b" + pMsgHdrObj["from"]);
    console.crlf();
    console.print("nwАБВлнcTo  wh: b" + pMsgHdrObj["to"]);
    console.crlf();
    console.print("nwАБВлнcSubjwh: b" + pMsgHdrObj["subject"]);
    console.crlf();
    console.print("nwАБВлнcDatewh: b" + dateTimeStr);
    console.crlf();
    console.print("nwАБВлнcAttrwh: b" + msgAttrStr);
    console.crlf();
  }
}

// Returns the name of the msghdr file in the sbbs/text/menu directory.
// If the user's terminal supports ANSI, this first checks to see if an
// .ans version exists.  Otherwise, checks to see if an .asc version
// exists.  If neither are found, this function will return an empty
// string.
function DigDistMsgLister_GetMsgHdrFullFilename()
{
  // If the user's terminal supports ANSI and msghdr.ans exists
  // in the text/menu directory, then use that one.  Otherwise,
  // if msghdr.asc exists, then use that one.
  var ansiFileName = "menu/" + this.msgHdrTextFileName + ".ans";
  var asciiFileName = "menu/" + this.msgHdrTextFileName + ".asc";
  var msgHdrFilename = "";
  if (console.term_supports(USER_ANSI) && file_exists(system.text_dir + ansiFileName))
    msgHdrFilename = system.text_dir + ansiFileName;
  else if (file_exists(system.text_dir + asciiFileName))
    msgHdrFilename = system.text_dir + asciiFileName;
  return msgHdrFilename;
}


///////////////////////////////////////////////////////////////////////////////////
// Helper functions

// Displays the program information.
function DisplayProgramInfo()
{
   displayTextWithLineBelow("Digital Distortion Message Lister", true, "nch", "kh")
	console.center("ncVersion g" + getVersion() + " wh(b" + getVerDate() + "w)");
	console.crlf();
}

// This function returns an array of default colors used in the
// DigDistMessageLister class.
function getDefaultColors()
{
	var colorArray = new Array();

	// Header line: "Current msg group:"
	colorArray["headerMsgGroupText"] = "n4c"; // Normal cyan on blue background
	//colorArray["headerMsgGroupText"] = "n4w"; // Normal white on blue background

	// Header line: Message group name
	colorArray["headerMsgGroupName"] = "hc"; // High cyan
	//colorArray["headerMsgGroupName"] = "hw"; // High white

	// Header line: "Current sub-board:"
	colorArray["headerSubBoardText"] = "n4c"; // Normal cyan on blue background
	//colorArray["headerSubBoardText"] = "n4w"; // Normal white on blue background

	// Header line: Message sub-board name
	colorArray["headerMsgSubBoardName"] = "hc"; // High cyan
	//colorArray["headerMsgSubBoardName"] = "hw"; // High white
	// Line with column headers
	//colorArray["listColHeader"] = "hw"; // High white (keep blue background)
	colorArray["listColHeader"] = "nhw"; // High white on black background
	//colorArray["listColHeader"] = "hc"; // High cyan (keep blue background)
	//colorArray["listColHeader"] = "4hy"; // High yellow (keep blue background)

	// Header separator line
	colorArray["headerSeparatorLine"] = "hw";

	// Message information
	colorArray["msgNum"] = "nhy";
	//colorArray["msgNum"] = "nhw";
	colorArray["from"] = "nc";
	colorArray["to"] = "nc";
	colorArray["subject"] = "nc";
	colorArray["date"] = "hb";
	colorArray["time"] = "hb";
	// Message information for messages written to the user
  colorArray["toUserMsgNum"] = "nhy";
  colorArray["toUserFrom"] = "hg";
  colorArray["toUserTo"] = "hg";
  colorArray["toUserSubject"] = "hg";
  colorArray["toUserDate"] = "hb";
  colorArray["toUserTime"] = "hb";
  // Message information for messages from the user
  colorArray["fromUserMsgNum"] = "nhy";
  colorArray["fromUserFrom"] = "nc";
  colorArray["fromUserTo"] = "nc";
  colorArray["fromUserSubject"] = "nc";
  colorArray["fromUserDate"] = "hb";
  colorArray["fromUserTime"] = "hb";

   // Message highlight background color
   colorArray["msgHighlightBkg"] = "4";

	// Continue prompt colors
	colorArray["contPromptMain"] = "ng"; // Main text color
	colorArray["contPromptHotkeys"] = "hc"; // Hotkey color
	colorArray["contPromptUserInput"] = "hg"; // User input color

	// Message body color
	colorArray["msgBody"] = "nw";

	// Read message confirmation colors
	colorArray["readMsgConfirm"] = "nc";
	colorArray["readMsgConfirmNumber"] = "hc";
	// Prompt for continuing to list messages after reading a message
	colorArray["afterReadMsg_ListMorePrompt"] = "nc";

	// Help screen text color
	colorArray["helpScreen"] = "nhw";

	return colorArray;
}

// This function returns the month number (1-based) from a capitalized
// month name.
//
// Parameters:
//  pMonthName: The name of the month
//
// Return value: The number of the month (1-12).
function getMonthNum(pMonthName)
{
	var monthNum = 1;

	if (pMonthName.substr(0, 3) == "Jan")
		monthNum = 1;
	else if (pMonthName.substr(0, 3) == "Feb")
		monthNum = 2;
	else if (pMonthName.substr(0, 3) == "Mar")
		monthNum = 3;
	else if (pMonthName.substr(0, 3) == "Apr")
		monthNum = 4;
	else if (pMonthName.substr(0, 3) == "May")
		monthNum = 5;
	else if (pMonthName.substr(0, 3) == "Jun")
		monthNum = 6;
	else if (pMonthName.substr(0, 3) == "Jul")
		monthNum = 7;
	else if (pMonthName.substr(0, 3) == "Aug")
		monthNum = 8;
	else if (pMonthName.substr(0, 3) == "Sep")
		monthNum = 9;
	else if (pMonthName.substr(0, 3) == "Oct")
		monthNum = 10;
	else if (pMonthName.substr(0, 3) == "Nov")
		monthNum = 11;
	else if (pMonthName.substr(0, 3) == "Dec")
		monthNum = 12;

	return monthNum;
}

// Clears each line from a given line to the end of the screen.
//
// Parameters:
//  pStartLineNum: The line number to start at (1-based)
function clearToEOS(pStartLineNum)
{
	if (typeof(pStartLineNum) == "undefined")
		return;
	if (pStartLineNum == null)
		return;

	for (var lineNum = pStartLineNum; lineNum <= console.screen_rows; ++lineNum)
	{
		console.gotoxy(1, lineNum);
		console.clearline();
	}
}

// Returns the number of messages in a sub-board.
//
// Parameters:
//  pSubBoardCode: The sub-board code (i.e., from bbs.cursub_code)
//
// Return value: The number of messages in the sub-board, or 0
//               if the sub-board could not be opened.
function numMessages(pSubBoardCode)
{
   var messageCount = 0;

   var myMsgbase = new MsgBase(pSubBoardCode);
	if (myMsgbase.open())
		messageCount = myMsgbase.total_msgs;
	myMsgbase.close();
	myMsgbase = null;

	return messageCount;
}

// Removes multiple, leading, and/or trailing spaces
// The search & replace regular expressions used in this
// function came from the following URL:
//  http://qodo.co.uk/blog/javascript-trim-leading-and-trailing-spaces
//
// Parameters:
//  pString: The string to trim
//  pLeading: Whether or not to trim leading spaces (optional, defaults to true)
//  pMultiple: Whether or not to trim multiple spaces (optional, defaults to true)
//  pTrailing: Whether or not to trim trailing spaces (optional, defaults to true)
function trimSpaces(pString, pLeading, pMultiple, pTrailing)
{
	var leading = true;
	var multiple = true;
	var trailing = true;
	if(typeof(pLeading) != "undefined")
		leading = pLeading;
	if(typeof(pMultiple) != "undefined")
		multiple = pMultiple;
	if(typeof(pTrailing) != "undefined")
		trailing = pTrailing;

	// To remove both leading & trailing spaces:
	//pString = pString.replace(/(^\s*)|(\s*$)/gi,"");

	if (leading)
		pString = pString.replace(/(^\s*)/gi,"");
	if (multiple)
		pString = pString.replace(/[ ]{2,}/gi," ");
	if (trailing)
		pString = pString.replace(/(\s*$)/gi,"");

	return pString;
}

// Displays some text with a solid horizontal line on the next line.
//
// Parameters:
//  pText: The text to display
//  pCenter: Whether or not to center the text.  Optional; defaults
//           to false.
//  pTextColor: The color to use for the text.  Optional; by default,
//              normal white will be used.
//  pLineColor: The color to use for the line underneath the text.
//              Optional; by default, bright black will be used.
function displayTextWithLineBelow(pText, pCenter, pTextColor, pLineColor)
{
   var centerText = false;
   if ((pCenter != null) && (typeof(pCenter) != "undefined"))
      centerText = pCenter;
   var textColor = "nw";
   if ((pTextColor != null) && (typeof(pTextColor) != "undefined"))
      textColor = pTextColor;
   var lineColor = "nkh";
   if ((pLineColor != null) && (typeof(pLineColor) != "undefined"))
      lineColor = pLineColor;

   // Output the text and a solid line on the next line.
   if (centerText)
   {
      console.center(textColor + pText);
      var solidLine = "";
      var textLength = strip_ctrl(pText).length;
      for (var i = 0; i < textLength; ++i)
         solidLine += "Ф";
      console.center(lineColor + solidLine);
   }
   else
   {
      console.print(textColor + pText);
      console.crlf();
      console.print(lineColor);
      var textLength = strip_ctrl(pText).length;
      for (var i = 0; i < textLength; ++i)
         console.print("Ф");
      console.crlf();
   }
}

// Returns whether the Synchronet compile date is at least May 12, 2013.  That
// was when Digital Man's change to make bbs.msg_number work when a script is
// running first went into the Synchronet daily builds.
function compileDateAtLeast2013_05_12()
{
  // system.compiled_when is in the following format:
  // May 12 2013 05:02

  var compileDateParts = system.compiled_when.split(" ");
  if (compileDateParts.length < 4)
    return false;

  // Convert the month to a 1-based number
  var compileMonth = 0;
  if (/^Jan/.test(compileDateParts[0]))
    compileMonth = 1;
  else if (/^Feb/.test(compileDateParts[0]))
    compileMonth = 2;
  else if (/^Mar/.test(compileDateParts[0]))
    compileMonth = 3;
  else if (/^Apr/.test(compileDateParts[0]))
    compileMonth = 4;
  else if (/^May/.test(compileDateParts[0]))
    compileMonth = 5;
  else if (/^Jun/.test(compileDateParts[0]))
    compileMonth = 6;
  else if (/^Jul/.test(compileDateParts[0]))
    compileMonth = 7;
  else if (/^Aug/.test(compileDateParts[0]))
    compileMonth = 8;
  else if (/^Sep/.test(compileDateParts[0]))
    compileMonth = 9;
  else if (/^Oct/.test(compileDateParts[0]))
    compileMonth = 10;
  else if (/^Nov/.test(compileDateParts[0]))
    compileMonth = 11;
  else if (/^Dec/.test(compileDateParts[0]))
    compileMonth = 12;

  // Get the compileDay and compileYear as numeric variables
  var compileDay = +compileDateParts[1];
  var compileYear = +compileDateParts[2];

  // Determine if the compile date is at least 2013-05-12
  var compileDateIsAtLeastMin = true;
  if (compileYear > 2013)
    compileDateIsAtLeastMin = true;
  else if (compileYear < 2013)
    compileDateIsAtLeastMin = false;
  else // compileYear is 2013
  {
    if (compileMonth > 5)
      compileDateIsAtLeastMin = true
    else if (compileMonth < 5)
      compileDateIsAtLeastMin = false;
    else // compileMonth is 5
      compileDateIsAtLeastMin = (compileDay >= 12);
  }

  return compileDateIsAtLeastMin;
}