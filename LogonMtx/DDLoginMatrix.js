/* This is a login matrix script for Synchronet.
 * If the user's terminal supports ANSI, this will display an ANSI
 * graphic and a lightbar menu with logon options.  If the user's
 * terminal doesn't support ANSI, this will do a more traditional
 * login sequence.
 *
 * Author: Eric Oulashin (AKA Nightfox)
 * BBS: Digital Distortion
 * BBS address: digdist.bbsindex.com
 *
 * Date       Author            Description
 * 2009-06-12 Eric Oulashin     Started
 ...Removed some comments...
 * 2011-02-10 Eric Oulashin     Version 1.07
 *                              Removed the exit(); call at the
 *                              end of the script so that when
 *                              included in other JavaScript scripts,
 *                              the other script can continue executing.
 * 2011-02-11 Eric Oulashin     Version 1.08
 *                              Added support for playing a sound
 *                              when the user logs in successfully.
 * 2013-05-27 Eric Oulashin     Version 1.09
 *                              Fix to make random theme selection work in
 *                              Linux/UNIX (used * instead of *.*, which works
 *                              in both *nix and Windows).
 */

load("sbbsdefs.js");

//var VERSION = "1.09";
//var VER_DATE = "2013-05-27";

// Program arguments:
// 0: Greeting file to display for the traditional login sequence,
//    relative to Synchronet's text/menu directory.  Defaults to
//    "../answer", which is the normal greeting file.
var gTraditionalGreetingFile = "../answer";
if (typeof(argv[0]) != "undefined")
   gTraditionalGreetingFile = argv[0];

// Box-drawing/border characters: Single-line
const UPPER_LEFT_SINGLE = "Ú";
const HORIZONTAL_SINGLE = "Ä";
const UPPER_RIGHT_SINGLE = "¿";
const VERTICAL_SINGLE = "³";
const LOWER_LEFT_SINGLE = "À";
const LOWER_RIGHT_SINGLE = "Ù";
const T_SINGLE = "Â";
const LEFT_T_SINGLE = "Ã";
const RIGHT_T_SINGLE = "´";
const BOTTOM_T_SINGLE = "Á";
const CROSS_SINGLE = "Å";
// Box-drawing/border characters: Double-line
const UPPER_LEFT_DOUBLE = "É";
const HORIZONTAL_DOUBLE = "Í";
const UPPER_RIGHT_DOUBLE = "»";
const VERTICAL_DOUBLE = "º";
const LOWER_LEFT_DOUBLE = "È";
const LOWER_RIGHT_DOUBLE = "¼";
const T_DOUBLE = "Ë";
const LEFT_T_DOUBLE = "Ì";
const RIGHT_T_DOUBLE = "¹";
const BOTTOM_T_DOUBLE = "Ê";
const CROSS_DOUBLE = "Î";
// Box-drawing/border characters: Vertical single-line with horizontal double-line
const UPPER_LEFT_VSINGLE_HDOUBLE = "Õ";
const UPPER_RIGHT_VSINGLE_HDOUBLE = "¸";
const LOWER_LEFT_VSINGLE_HDOUBLE = "Ô";
const LOWER_RIGHT_VSINGLE_HDOUBLE = "¾";
// Other special characters
const DOT_CHAR = "ú";
const THIN_RECTANGLE_LEFT = "Ý";
const THIN_RECTANGLE_RIGHT = "Þ";
const BLOCK1 = "°"; // Dimmest block
const BLOCK2 = "±";
const BLOCK3 = "²";
const BLOCK4 = "Û"; // Brightest block
// Keyboard keys
const CTRL_M = "\x0d";
const CR = CTRL_M;
const KEY_ENTER = CTRL_M;
const KEY_ESC = "\x1b";

var guestExists = (system.matchuser("guest") > 0);

///////////////////////////
// Script execution code //
///////////////////////////

// Figure out the the script's execution directory.
// This code is a trick that was created by Deuce, suggested by Rob
// Swindell as a way to detect which directory the script was executed
// in.  I've shortened the code a little.
// Note: gStartupPath will include the trailing slash.
var gStartupPath = '.';
try { throw dig.dist(dist); } catch(e) { gStartupPath = e.fileName; }
gStartupPath = backslash(gStartupPath.replace(/[\/\\][^\/\\]*$/,''));

// Get the main configuration options from DDLoginMatrix.cfg
var gMainCfgObj = getDDMatrixConfig(gStartupPath);

// Load the language strings from the specified language file.
var gMatrixLangStrings = new MatrixLangStrings();
var gStdLangStrings = new StdLangStrings();
var gGenLangStrings = new GeneralLangStrings();
loadLangStrings(gStartupPath + "DDLoginMatrixLangFiles/" + gMainCfgObj.Language + ".lng");

// The following 2 lines are only required for "Re-login" capability
bbs.logout();
system.node_list[bbs.node_num-1].status = NODE_LOGON;

// If the UseMatrix option is true and the user's terminal supports ANSI,
// then do the matrix-style login.  Otherwise, do the standard login.
if (gMainCfgObj.UseMatrix && console.term_supports(USER_ANSI))
   loginMatrix();
else
   loginStandard();

// If the user logged in, then play the login sound if configured
// to do so.
if (user.number > 0)
{
	if (gMainCfgObj.PlaySound && (gMainCfgObj.SoundFile != ""))
		sound(gMainCfgObj.SoundFile);
}

// End of script execution

//////////////////////////////////////////////////////////////////////////////////
// Functions

function loginMatrix()
{
   // Get a random theme configuration and use it to configure the
   // background, menu, etc.
   var themeCfgObj = getThemeCfg(gStartupPath, gMainCfgObj.MatrixTheme);

   // Construct the matrix menu
   const LOGIN = 0;
   const NEWUSER = 1;
   const GUEST = 2;
   const RETRIEVE_PASSWORD = 3;
   const EMAIL_SYSOP = 4;
   const DISCONNECT = 5;
   const PAGE_SYSOP = 6;

   // Create the menu and add the menu items
   var matrixMenu = new DDMatrixMenu(themeCfgObj.MenuX, themeCfgObj.MenuY);
   matrixMenu.addItem(gMatrixLangStrings.LOGIN, LOGIN);
   if (gMainCfgObj.MenuDisplayNewUser && ((system.settings & SYS_CLOSED) == 0))
      matrixMenu.addItem(gMatrixLangStrings.NEWUSER, NEWUSER);
   if (guestExists && gMainCfgObj.MenuDisplayGuestAccountIfExists)
      matrixMenu.addItem(gMatrixLangStrings.GUEST, GUEST);
   if (gMainCfgObj.MenuDisplayRetrievePassword)
      matrixMenu.addItem(gMatrixLangStrings.RETRIEVE_PASSWORD, RETRIEVE_PASSWORD);
   if (gMainCfgObj.MenuDisplayEmailSysop)
      matrixMenu.addItem(gMatrixLangStrings.EMAIL_SYSOP, EMAIL_SYSOP);
   if (gMainCfgObj.MenuDisplayPageSysop)
      matrixMenu.addItem(gMatrixLangStrings.PAGE_SYSOP, PAGE_SYSOP);
   matrixMenu.addItem(gMatrixLangStrings.DISCONNECT, DISCONNECT);
   // Set the menu colors and other options
   matrixMenu.colors.border = themeCfgObj.MenuColor_Border;
   matrixMenu.colors.unselected = themeCfgObj.MenuColor_Unselected;
   matrixMenu.colors.selected = themeCfgObj.MenuColor_Selected;
   matrixMenu.colors.hotkey = themeCfgObj.MenuColor_Hotkey;
   matrixMenu.borderStyle = themeCfgObj.MenuBorders;
   matrixMenu.clearSpaceAroundMenu = themeCfgObj.ClearSpaceAroundMenu;
   matrixMenu.clearSpaceColor = themeCfgObj.MenuColor_ClearAroundMenu;
   matrixMenu.clearSpaceTopText = themeCfgObj.MenuColor_ClearAroundMenu
                                + randomDimBrightString(themeCfgObj.MenuTitle, "w");
   matrixMenu.displayClearSpaceTopText = themeCfgObj.DisplayMenuTitle;
   matrixMenu.timeoutMS = gMainCfgObj.MenuTimeoutMS;

   // Logon loop
   var continueOn = true;
   for (var loopVar = 0; (loopVar < 10) && continueOn; ++loopVar)
   {
      // The "node sync" is required for sysop interruption/chat/etc.
      bbs.nodesync();

      // Clear the screen and display the initial background file
      console.print("qn");
      console.clear();
      bbs.menu(themeCfgObj.InitialBackgroundFilename);

      // Show the matrix menu and respond to the user's choice.
      var doNewUser = false;
      matrixMenu.selectedItemIndex = 0;
      var returnObj = matrixMenu.doInputLoop();
      switch (returnObj.returnVal)
      {
         case LOGIN:
            // Clear the screen and display the login background file, if
            // one is specified.
            console.clear("n");
            if (themeCfgObj.LoginBackgroundFilename.length > 0)
               bbs.menu(themeCfgObj.LoginBackgroundFilename);

            // Draw boxes for the username, password, and status.
            // First, calculate the box sizes.
            var usernamePrompt = gMatrixLangStrings.USERNAME_PROMPT;
            if (gMainCfgObj.AllowUserNumber)
               var usernamePrompt = gMatrixLangStrings.USERNAME_OR_NUM_PROMPT;
            var passwordPrompt = gMatrixLangStrings.PASSWORD_PROMPT;
            var usernameBoxInnerWidth = themeCfgObj.UsernameLength + usernamePrompt.length + 1;
            var usernameBoxWidth = usernameBoxInnerWidth + 2;
            var passwordBoxInnerWidth = themeCfgObj.PasswordLength + passwordPrompt.length + 1;
            var passwordBoxWidth = passwordBoxInnerWidth + 2;
            var statusBoxWidth = themeCfgObj.StatusBoxInnerWidth + 2;

            // Username box
            drawOneLineInputBox(themeCfgObj.UsernameX, themeCfgObj.UsernameY,
                                usernameBoxWidth, "double",
                                themeCfgObj.UsernameBoxBorderColor,
                                themeCfgObj.UsernameBoxBkgColor,
                                themeCfgObj.UsernamePromptColor + usernamePrompt);

            // Password box
            drawOneLineInputBox(themeCfgObj.PasswordX, themeCfgObj.PasswordY,
                                passwordBoxWidth, "double",
                                themeCfgObj.PasswordBoxBorderColor,
                                themeCfgObj.PasswordBoxBkgColor,
                                themeCfgObj.PasswordPromptColor + passwordPrompt);

            // Status box
            drawOneLineInputBox(themeCfgObj.StatusX, themeCfgObj.StatusY,
                                statusBoxWidth, "double",
                                themeCfgObj.StatusBoxBorderColor,
                                themeCfgObj.StatusBoxBkgColor);

            // Figure out the screen positions for the username & password inputs,
            // and the status text line
            var usernameX = themeCfgObj.UsernameX + usernamePrompt.length + 2;
            var usernameY = themeCfgObj.UsernameY + 1;
            var passwordX = themeCfgObj.PasswordX + passwordPrompt.length + 2;
            var passwordY = themeCfgObj.PasswordY + 1;
            var statusX = themeCfgObj.StatusX + 1;
            var statusY = themeCfgObj.StatusY + 1;

            // Set the text for prompting the user to enter their username/number.
            var enterUsernameAndPasswordStr = "";
            if (gMainCfgObj.AllowUserNumber && ((bbs.node_settings & NM_NO_NUM) == 0))
               enterUsernameAndPasswordStr = randomDimBrightString(format("%-" + usernameBoxWidth + "s", gMatrixLangStrings.USERNAME_NUM_PASS_PROMPT), "w");
            else
               enterUsernameAndPasswordStr = randomDimBrightString(format("%-" + usernameBoxWidth + "s", gMatrixLangStrings.USERNAME_PASS_PROMPT), "w");

            // Prompt for username & password.  Give the user 10 chances.
            var loggedOn = false;    // Whether or not the user successfully logged on
            var returnToLogonMenu = false; // Whether or not to display the logon menu again
            var loginAttempts = 0;
            for (; loginAttempts < gMainCfgObj.MaxLoginAttempts; ++loginAttempts)
            {
               // Prepare to prompt for the username
               console.gotoxy(usernameX-11, usernameY-2);
               console.print(enterUsernameAndPasswordStr);
               console.gotoxy(usernameX, usernameY);
               // If this is the not the first time through the loop,
               // then clear the username input.
               if (loginAttempts > 0)
               {
                  flashMessage(usernameX, usernameY, "", 0, usernameBoxInnerWidth-10,
                               true, themeCfgObj.UsernameBoxBkgColor);
                  console.gotoxy(usernameX, usernameY);
               }
               console.print(themeCfgObj.UsernameTextColor);
               // Prompt for the username
               var username = console.getstr(themeCfgObj.UsernameLength, K_UPRLWR | K_TAB);
               // If the username is blank, then we want to return to the logon menu
               // (set returnToLogonMenu to true and break out of this
               // username/password loop).
               if (username.length == 0)
               {
                  returnToLogonMenu = true;
                  break;
               }

               truncsp(username);

               // If the user typed "new", then let them create a new
               // user account.  Set doNewUser to true and break out
               // of the username/password loop.
               if (username.toUpperCase() == gGenLangStrings.NEW.toUpperCase())
               {
                  doNewUser = true;
                  break;
               }

               // If we get here, then the user didn't enter "new".
               // If user numbers are allowed and the username contains
               // all digits, then set userNum to what the user entered.
               // Otherwise, look for the user number that matches the
               // username.
               var userNum = 0;
               if (gMainCfgObj.AllowUserNumber && ((bbs.node_settings & NM_NO_NUM) == 0) &&
                   username.match(/^[0-9]+$/))
               {
                  userNum = +username;
               }
               else
                  userNum = system.matchuser(username);

               // If the user number is valid, then we can continue and
               // prompt for a password.
               if ((userNum > 0) && (system.username(userNum).length > 0))
               {
                  // If the user didn't enter "guest", go to the password
                  // prompt location and get ready to prompt for the password.
                  if (username != "guest")
                  {
                     console.gotoxy(passwordX, passwordY);
                     // If this is the not the first time through the loop,
                     // then clear the password.
                     if (loginAttempts > 0)
                     {
                        flashMessage(passwordX, passwordY, "", 0, passwordBoxInnerWidth-10,
                                     true, themeCfgObj.PasswordTextColor);
                        console.gotoxy(passwordX, passwordY);
                     }
                  }

                  // Temporarily blank the "Unknown user" and "Invalid Logon" text strings
                  bbs.replace_text(390, "");
                  bbs.replace_text(391, "");

                  // Prompt for the password
                  if (bbs.login(username, themeCfgObj.PasswordTextColor))
                  {
                     console.clear();
                     bbs.logon();
                     loggedOn = true;
                     continueOn = false; // For the outer loop
                     break;
                  }
                  else
                  {
                     // Go to the status box and tell the user the login
                     // was invalid.
                     flashMessage(statusX, statusY, themeCfgObj.StatusTextColor +
                                  gMatrixLangStrings.INVALID_LOGIN, 1500,
                                  themeCfgObj.StatusBoxInnerWidth,
                                  (loginAttempts > 0));
                     // Clear the password from the password box
                     flashMessage(passwordX, passwordY, "", 0, passwordBoxInnerWidth-10,
                                  true, themeCfgObj.PasswordBoxBkgColor);
                     // Clear the status from the status box
                     flashMessage(statusX, statusY, "", 0, themeCfgObj.StatusBoxInnerWidth,
                                  true, themeCfgObj.StatusBoxBkgColor);
                  }

                  // Revert the "Unknown user" and "Invalid Logon" text strings
                  // back to their defaults.
                  bbs.revert_text(390);
                  bbs.revert_text(391);
               }
               else
               {
                  var errorMsg = "";
                  if (gMainCfgObj.AllowUserNumber)
                     errorMsg = gMatrixLangStrings.UNKNOWN_USERNAME_OR_NUM;
                  else
                     errorMsg = gMatrixLangStrings.UNKNOWN_USERNAME;

                  // Go to the status box and tell the user that the
                  // username/number is unknown.
                  flashMessage(statusX, statusY, themeCfgObj.StatusTextColor +
                               errorMsg, 1500, themeCfgObj.StatusBoxInnerWidth,
                               (loginAttempts > 0));
                  // Clear the status text from the status box
                  flashMessage(statusX, statusY, "", 0, themeCfgObj.StatusBoxInnerWidth,
                               true, themeCfgObj.StatusBoxBkgColor);
               }
            }

            // If we shouldn't return to the menu or do the new user login,
            // then quit the main menu loop.
            if (!returnToLogonMenu && !doNewUser)
            {
               continueOn = false; // For the outer loop
               // If the user didn't log on, then hang up.
               if (!loggedOn)
               {
                  console.clear("n");
                  console.gotoxy(1, 1);
                  console.print(gMatrixLangStrings.LOGIN_ATTEMPTS_FAIL_MSG.replace("#", gMainCfgObj.MaxLoginAttempts));
                  bbs.hangup();
               }
            }
            break;
         case NEWUSER:
            // Only allow new users if the system's "closed" setting is false.
            doNewUser = ((system.settings & SYS_CLOSED) == 0);
            break;
         case GUEST:
            if (bbs.login("guest", themeCfgObj.PasswordPromptColor +
                          gMatrixLangStrings.PASSWORD_PROMPT + " " +
                          themeCfgObj.PasswordTextColor))
            {
               continueOn = false; // For the outer loop
               console.clear("n");
               bbs.logon();
               loggedOn = true;
               break;
            }
            else
            {
               console.gotoxy(themeCfgObj.MenuX, themeCfgObj.MenuY);
               console.print(gMatrixLangStrings.GUEST_ACCT_FAIL);
               mswait(1500);
            }
            break;
         case RETRIEVE_PASSWORD:
            console.clear("n");
            // Prompt the user for their username
            console.print(gStdLangStrings.USERNAME_PROMPT + "n: ");
            var userName = console.getstr(25, K_UPRLWR | K_TAB);
            emailAcctInfo(userName, false, true);
            break;
         case EMAIL_SYSOP:
            console.clear("n");
            bbs.email(1);
            if (console.yesno(gMatrixLangStrings.LOGOFF_CONFIRM_TEXT))
            {
               console.print(gMatrixLangStrings.DISCONNECT_MESSAGE);
               continueOn = false; // For the outer loop
               bbs.hangup();
            }
            break;
         case PAGE_SYSOP:
            console.clear("nc");
            var sysopPaged = bbs.page_sysop();
            console.crlf();
            if (sysopPaged)
               console.print(gMatrixLangStrings.SYSOP_HAS_BEEN_PAGED + "\r\n");
            else
               console.print(gMatrixLangStrings.UNABLE_TO_PAGE_SYSOP + "\r\n");
            console.pause();
            break;
         case DISCONNECT:
            console.clear("n");
            console.print(gMatrixLangStrings.DISCONNECT_MESSAGE);
            continueOn = false; // For the outer loop
            bbs.hangup();
            break;
         default:
            // If the user's input is blank, that probably means the
            // input timeout was hit, so disconnect the user.
            if (returnObj.userInput.length == 0)
            {
               // We probably hit tine input timeout, so disconnect the user.
               console.clear("n");
               console.print("nhw" + system.name + ": " +
                             gMatrixLangStrings.INPUT_TIMEOUT_REACHED);
               continueOn = false; // For the outer loop
               bbs.hangup();
            }
            break;
      }

      // If the user wants to create a new user account, then do it.
      if (doNewUser)
      {
         console.clear("n");
         if (bbs.newuser())
         {
            bbs.logon();
            continueOn = false; // For the outer loop
         }
         else
            continue;
      }
   }
}

// Performs the loop for the standard (non-matrix) login.
function loginStandard()
{
   var returnVal = true;

   if (gTraditionalGreetingFile.length > 0)
      bbs.menu(gTraditionalGreetingFile);
   for (var loopVar = 0; loopVar < 10; ++loopVar)
   {
      // The "node sync" is required for sysop interruption/chat/etc.
      bbs.nodesync();

      returnVal = doLogin(loopVar == 0);
      if (returnVal)
         break;

      // Password failure counts as 2 attempts
      ++loopVar;
   }

   return returnVal;
}

// Helper for loginStandard() - Performs the username & password input.
function doLogin(pFirstTime)
{
   // Display login prompt
   console.print("\r\n" + gStdLangStrings.USERNAME_PROMPT);
   if (((bbs.node_settings & NM_NO_NUM) == 0) && gMainCfgObj.AllowUserNumber)
      console.print(gStdLangStrings.OR_NUMER_PROMPT);
   if ((system.settings & SYS_CLOSED) == 0)
      console.print("\r\n" + gStdLangStrings.NEW_USER_INFO);
   if (guestExists && gMainCfgObj.MenuDisplayGuestAccountIfExists)
      console.print("\r\n" + gStdLangStrings.GUEST_INFO);
   console.print("\r\n" + gStdLangStrings.LOGIN_PROMPT);

   // Get login string
   var str = console.getstr(25, // maximum user name length
                            K_UPRLWR | K_TAB); // getkey/str mode flags
   truncsp(str);
   if (str.length == 0) // blank
      return false;

   // Set the color to high white on black background, and output
   // a couple blank lines for spacing after the login ANSI.
   console.print("nhw\r\n\r\n");

   // New user application?
   if (str.toUpperCase() == gGenLangStrings.NEW.toUpperCase())
   {
      if (bbs.newuser())
      {
         bbs.logon();
         exit();
      }
      return true;
   }

   // Continue normal login (prompting for password)
   var retval = true;
   if (bbs.login(str, gStdLangStrings.PASSWORD_PROMPT))
      bbs.logon();
   else
   {
      if (gMainCfgObj.MenuDisplayRetrievePassword)
         retval = emailAcctInfo(str, true, false);
   }

   return retval;
}

// This function handles emailing the user's account information to the user.
//
// Parameters:
//  pUsername: The user's username
//  pAskIfForgotPass: Boolean - Whether or not to prompt the user whether or
//                    not they forgot their password before doing the lookup.
//  pPauseAfterMessages: Boolean - Whether or not to pause after displaying
//                       messages.  Optional.
function emailAcctInfo(pUsername, pAskIfForgotPass, pPauseAfterMessages)
{
   if (pUsername.length == 0)
      return false;

   var pauseAfterMsgs = false;
   if (pPauseAfterMessages != null)
      pauseAfterMsgs = pPauseAfterMessages;

   var retval = true;

   var usernum = system.matchuser(pUsername);
   if (usernum > 0)
   {
      var theUser = new User(usernum);
      // Make sure the user is a valid and active user, is not a sysop,
      // and  has an internet email address.
      var continueOn = (!(theUser.settings&(USER_DELETED|USER_INACTIVE))
                        && theUser.security.level < 90
                        && netaddr_type(theUser.netmail) == NET_INTERNET);
      // If the user can retrieve their password and if pAskIfForgotPass is
      // true, then ask the user if they forgot their password.
      if (continueOn && pAskIfForgotPass)
         continueOn = !console.noyes(gGenLangStrings.DID_YOU_FORGET_PASSWORD_CONFIRM);
      // If we can send the user their account info, then go ahead and do it.
      if (continueOn)
      {
         console.print(gGenLangStrings.EMAIL_ADDR_CONFIRM_PROMPT);
         var email_addr = console.getstr(50);
         if (email_addr.toLowerCase() == theUser.netmail.toLowerCase())
         {
            var msgbase = new MsgBase("mail");
            if (msgbase.open() == false)
            {
               console.print("\r\n" + msgbase.last_error + "\r\n");
               if (pauseAfterMsgs)
                  console.pause();
               alert(log(LOG_ERR,"!ERROR " + msgbase.last_error));
            }
            else
            {
               var hdr =
               {
                  to: theUser.alias,
                  to_net_addr: theUser.netmail, 
                  to_net_type: NET_INTERNET,
                  from: system.operator, 
                  from_ext: "1", 
                  subject: system.name + " user account information"
               };

               var msgtxt = gGenLangStrings.ACCT_INFO_REQUESTED_ON_TIME + " "
                           + system.timestr() + "\r\n";
               msgtxt += gGenLangStrings.BY + " " + client.host_name + " [" +
                         client.ip_address +"] " + gGenLangStrings.VIA + " " +
                         client.protocol + " (TCP " + gGenLangStrings.PORT + " " +
                         client.port + "):\r\n\r\n";
               msgtxt += gGenLangStrings.INFO_ACCT_NUM + " " + theUser.number + "\r\n";
               msgtxt += gGenLangStrings.INFO_CREATED + " " + system.timestr(theUser.stats.firston_date) + "\r\n";
               msgtxt += gGenLangStrings.INFO_LAST_ON + " " + system.timestr(theUser.stats.laston_date) + "\r\n";
               msgtxt += gGenLangStrings.INFO_CONNECT + " " + theUser.host_name + " [" + theUser.ip_address + "] " +
                         gGenLangStrings.VIA + " " + theUser.connection + "\r\n";
               msgtxt += gGenLangStrings.INFO_PASSWORD + " " + theUser.security.password + "\r\n";

               if (msgbase.save_msg(hdr, msgtxt))
               {
                  console.print("\r\n" + gGenLangStrings.ACCT_INFO_EMAILED_TO + theUser.netmail + "\r\n");
                  if (pauseAfterMsgs)
                     console.pause();
               }
               else
               {
                  console.print("\r\n" + gGenLangStrings.ERROR_SAVING_BULKMAIL_MESSAGE + " " +
                                msgbase.last_error + "\r\n");
                  if (pauseAfterMsgs)
                     console.pause();
                  alert(log(LOG_ERR,"!ERROR " + msgbase.last_error));
               }

               msgbase.close();
            }
            retval = true;
         }
         else
         {
            alert(log(LOG_WARNING, gStdLangStrings.INFO_INCORRECT_EMAIL_ADDR + " " + email_addr));
            console.print("\r\n" + gGenLangStrings.INFO_INCORRECT_EMAIL_ADDR + " " + email_addr +
                          "\r\n");
            if (pauseAfterMsgs)
               console.pause();
            retval = false;
         }
      }
      else
      {
         console.print("\r\n" + gGenLangStrings.UNABLE_TO_RETRIEVE_ACCT_INFO + "\r\n");
         if (pauseAfterMsgs)
            console.pause();
         retval = false;
      }
   }
   else
   {
      console.print("\r\n" + gStdLangStrings.UNKNOWN_USERNAME + "\r\n");
      if (pauseAfterMsgs)
         console.pause();
   }

   return retval;
}

// Returns the name of a random theme directory within the DDLoginMatrixThemes
// directory.
//
// Parameters:
//  pScriptDir: The script execution directory (with trailing slash)
//
// Return value: The name of a random theme directory within the
//               DDLoginMatrixThemes directory.
function randomMatrixThemeDir(pScriptDir)
{
   // Build an array of the directories in the DDLoginMatrixThemes
   // directory.
   var dirs = new Array(); // An array of the directory names
   var files = directory(pScriptDir + "DDLoginMatrixThemes/*");
   var pos = 0;  // For finding text positions in the filenames
   var filename = null;
   var seen = new Object(); // For storing directory names we've already seen
   for (var i in files)
   {
      if (file_isdir(files[i]))
      {
         // Look for "digdist" in the path and copy only the path
         // from that point.
         pos = files[i].indexOf("digdist");
         if (pos > 0)
            filename = files[i].substr(pos);
         else
            filename = files[i];

         // If we haven't seen the filename, then add it to the
         // dirs array.
         if (typeof(seen[filename]) == "undefined")
         {
            dirs.push(filename);
            seen[filename] = true;
         }
      }
   }

   // Return one of the directory names at random
   //return(dirs.length > 0 ? filenames[random(filenames.length)] : "");
   var dirName = "";
   // If the filenames array has some filenames in it, then get
   // one at random.  Also, fix the filename to have the correct
   // full path.
   if (dirs.length > 0)
   {
      dirName = dirs[random(dirs.length)];
      var pos = dirName.indexOf("DDLoginMatrixThemes");
      if (pos > -1)
         dirName = pScriptDir + dirName.substr(pos);
   }

   return dirName;
}

// Reads DDMatrixTheme.cfg in a random theme configuration
// directory and returns the configuration settings in an
// object.
//
// Parameters:
//  pScriptDir: The full path where the script is located (with trailing slash)
//  pWhichTheme: String - Specifies which theme configuration to get, or "Random"
//               to choose a random theme.
//
// Return value: An object containing the theme settings.
function getThemeCfg(pScriptDir, pWhichTheme)
{
   var themeDir = "";
   if (pWhichTheme.toLowerCase() == "random")
      themeDir = randomMatrixThemeDir(pScriptDir);
   else
      themeDir = pScriptDir + "/DDLoginMatrixThemes/" + pWhichTheme + "/";

   // Create cfgObject, the configuration object that we will
   // be returning.
   var cfgObj = new Object();
   cfgObj.InitialBackgroundFilename = themeDir + "InitialBackground";
   cfgObj.LoginBackgroundFilename = themeDir + "LoginBackground";
   cfgObj.MenuX = 43;
   cfgObj.MenuY = 8;
   cfgObj.MenuBorders = "double";
   cfgObj.ClearSpaceAroundMenu = true;
   cfgObj.MenuTitle = "Login menu";
   cfgObj.DisplayMenuTitle = true;
   cfgObj.MenuColor_Border = "hb";
   cfgObj.MenuColor_Unselected = "nhw";
   cfgObj.MenuColor_Selected = "n4hc";
   cfgObj.MenuColor_Hotkey = "hy";
   cfgObj.MenuColor_ClearAroundMenu = "n";
   cfgObj.UsernameX = 22;
   cfgObj.UsernameY = 7;
   cfgObj.UsernameLength = 25;
   cfgObj.UsernameBoxBorderColor = "nhg";
   cfgObj.UsernameBoxBkgColor = "n";
   cfgObj.UsernamePromptColor = "nc";
   cfgObj.UsernameTextColor = "hc";
   cfgObj.PasswordX = 22;
   cfgObj.PasswordY = 11;
   cfgObj.PasswordLength = 25;
   cfgObj.PasswordBoxBorderColor = "nhg";
   cfgObj.PasswordBoxBkgColor = "n";
   cfgObj.PasswordPromptColor = "nc";
   cfgObj.PasswordTextColor = "hc";
   cfgObj.StatusX = 22;
   cfgObj.StatusY = 15;
   cfgObj.StatusBoxInnerWidth = 35;
   cfgObj.StatusBoxBorderColor = "nhb";
   cfgObj.StatusBoxBkgColor = "n";
   cfgObj.StatusTextColor = "nhy";

   // If themeDir is a valid directory, then open DDMatrixTheme.cfg
   // in that directory.
   if (file_isdir(themeDir))
   {
      var cfgFilename = themeDir + "DDMatrixTheme.cfg";
      var cfgFile = new File(cfgFilename);
      var pos = 0; // Index of a character in one of the file lines
      var fileLine = "";
      var option = "";
      var optionValue = "";

      if (cfgFile.open("r"))
      {
         if (cfgFile.length > 0)
         {
            // Read each line from the config file and set the
            // various options in cfgObj.
            while (!cfgFile.eof)
            {
               // Read the line from the config file, look for a =, and
               // if found, read the option & value and set them
               // in cfgObj.
               fileLine = cfgFile.readln(512);

               // fileLine should be a string, but I've seen some cases
               // where it isn't, so check its type.
               if (typeof(fileLine) != "string")
                  continue;

               // If the line is blank or starts with with a semicolon
               // (the comment character), then skip it.
               if ((fileLine.length == 0) || (fileLine.substr(0, 1) == ";"))
                  continue;

               // Look for an = in the line, and if found, split into
               // option & value.
               pos = fileLine.indexOf("=");
               if (pos > -1)
               {
                  // Extract the option & value, trimming leading & trailing spaces.
                  option = trimSpaces(fileLine.substr(0, pos), true, false, true);
                  optionValue = trimSpaces(fileLine.substr(pos+1), true, false, true);

                  // Initial or logon background filename
                  if ((option == "InitialBackgroundFilename") || (option == "LoginBackgroundFilename"))
                  {
                     // If the value is non-blank, then set it in cfgObj.
                     // Otherwise, set the value in cfgObj to a blank string.
                     if (optionValue.length > 0)
                     {
                        cfgObj[option] = themeDir + optionValue;
                        // The filename path must be fixed to be a relative path.
                        // Look for ".." in the path and remove everything before
                        // that, but add another "../" before it.
                        var pos = cfgObj[option].indexOf("..");
                        if (pos > -1)
                           cfgObj[option] = "../" + cfgObj[option].substr(pos);
                     }
                     else
                        cfgObj[option] = "";
                  }
                  // Numeric options
                  else if ((option == "MenuX") || (option == "MenuY") ||
                            (option == "UsernameX") || (option == "UsernameY") ||
                            (option == "PasswordX") || (option == "PasswordY") ||
                            (option == "StatusX") || (option == "StatusY") ||
                            (option == "UsernameLength") || (option == "PasswordLength") ||
                            (option == "StatusBoxInnerWidth"))
                  {
                     cfgObj[option] = +optionValue;
                  }
                  else if (option == "MenuBorders")
                     cfgObj.MenuBorders = optionValue.toLowerCase();
                  else if ((option == "ClearSpaceAroundMenu") ||
                            (option == "DisplayMenuTitle"))
                  {
                     cfgObj[option] = (optionValue.toLowerCase() == "yes");
                  }
                  else if ((option == "MenuTitle") || (option == "MenuColor_Border") ||
                            (option == "MenuColor_Unselected") ||
                            (option == "MenuColor_Selected") ||
                            (option == "MenuColor_Hotkey") ||
                            (option == "MenuColor_ClearAroundMenu") ||
                            (option == "UsernameBoxBorderColor") ||
                            (option == "UsernameBoxBkgColor") ||
                            (option == "PasswordBoxBorderColor") ||
                            (option == "PasswordBoxBkgColor") ||
                            (option == "StatusBoxBorderColor") ||
                            (option == "StatusBoxBkgColor") ||
                            (option == "UsernamePromptColor") ||
                            (option == "UsernameTextColor") ||
                            (option == "PasswordPromptColor") ||
                            (option == "PasswordTextColor") ||
                            (option == "StatusTextColor"))
                  {
                     cfgObj[option] = optionValue;
                  }
               }
            }
         }

         cfgFile.close();
      }
   }

   return cfgObj;
}

// Reads the main configuration file, DDLoginMatrix.cfg, and returns
// an object containing the script configuration options.
//
// Parameters:
//  pScriptDir: The full path where the script is located (with trailing slash)
//
// Return object properties:
//  UseMatrix: Whether or not to use the matrix-style login
//  MenuTimeoutMS: The menu input timeout, in ms.
//  MenuDisplayNewUser: Boolean - Whether or not to display the new user menu option
//  MenuDisplayGuestAccountIfExists: Boolean - Whether or not to display the guest
//                                   account menu option, if the guest account exists
//  MenuDisplayRetrievePassword: Boolean - Whether or not to display the menu option
//                               for retrieving a user's password.
//  MenuDisplayEmailSysop: Boolean - Whether or not to display the "email sysop" menu option
//  MenuDisplayPageSysop: Boolean - Whether or not to display the "page sysop" menu option
//  MaxLoginAttempts: The maximum number of user login attempts
//  AllowUserNumber: Boolean - Whether or not to allow logging in via user number
//  MatrixTheme: A string specifying the theme to use.  "Random" specifies to choose a
//               random theme.
//  Language: The name of the language to use.  This will be the name of the file in the
//            DDLoginMatrixLangFiles directory without the extension.
function getDDMatrixConfig(pScriptDir)
{
   // Set up a config object with default values
   var cfgObj = new Object();
   cfgObj.UseMatrix = true;
   cfgObj.MenuTimeoutMS = 60000;
   cfgObj.MenuDisplayNewUser = true;
   cfgObj.MenuDisplayGuestAccountIfExists = true;
   cfgObj.MenuDisplayRetrievePassword = true;
   cfgObj.MenuDisplayEmailSysop = true;
   cfgObj.MenuDisplayPageSysop = true;
   cfgObj.MaxLoginAttempts = 3;
   cfgObj.AllowUserNumber = true;
   cfgObj.MatrixTheme = "Random";
   cfgObj.Language = "English";
   cfgObj.SoundFile = "";
   cfgObj.PlaySound = true;

   var cfgFile = new File(pScriptDir + "DDLoginMatrix.cfg");
   if (cfgFile.open("r"))
   {
      var pos = 0; // Index of a character in one of the file lines
      var fileLine = "";
      var option = "";
      var optionValue = "";
      if (cfgFile.length > 0)
      {
         // Read each line from the config file and set the
         // various options in cfgObj.
         while (!cfgFile.eof)
         {
            // Read the line from the config file, look for a =, and
            // if found, read the option & value and set them
            // in cfgObj.
            fileLine = cfgFile.readln(512);

            // fileLine should be a string, but I've seen some cases
            // where it isn't, so check its type.
            if (typeof(fileLine) != "string")
               continue;

            // If the line is blank or starts with with a semicolon
            // (the comment character), then skip it.
            if ((fileLine.length == 0) || (fileLine.substr(0, 1) == ";"))
               continue;

            // Look for an = in the line, and if found, split into
            // option & value.
            pos = fileLine.indexOf("=");
            if (pos > -1)
            {
               // Extract the option & value, trimming leading & trailing spaces.
               option = trimSpaces(fileLine.substr(0, pos), true, false, true);
               optionValue = trimSpaces(fileLine.substr(pos+1), true, false, true);

               if ((option == "MenuTimeoutMS") || (option == "MaxLoginAttempts"))
                  cfgObj[option] = +optionValue;
               else if ((option == "MatrixTheme") || (option == "Language") || (option == "SoundFile"))
                  cfgObj[option] = optionValue;
               else if ((option == "MenuDisplayNewUser") ||
                         (option == "MenuDisplayGuestAccountIfExists") ||
                         (option == "MenuDisplayEmailSysop") ||
                         (option == "MenuDisplayPageSysop") ||
                         (option == "AllowUserNumber") ||
                         (option == "MenuDisplayRetrievePassword") ||
                         (option == "UseMatrix") ||
                         (option == "PlaySound"))
               {
                  cfgObj[option] = (optionValue.toLowerCase() == "yes");
               }
            }
         }
      }
      cfgFile.close();

      // Do some bounds checking on the numeric settings.
      if (cfgObj.MenuTimeoutMS < 1)
         cfgObj.MenuTimeoutMS = 60000;
      if (cfgObj.MaxLoginAttempts < 1)
         cfgObj.MaxLoginAttempts = 3;
   }

   return cfgObj;
}

// Loads the language strings in gMatrixLangStrings, gStdLangStrings,
// and gGenLangStrings from a specified file.
//
// Paramaters:
//  pLangFile: The full path & filename of the file from which to load
//             the language strings
function loadLangStrings(pLangFile)
{
   // Try to find the correct filename case.  If unable to find it,
   // then just return.
   var langFilename = file_getcase(pLangFile);
   if (langFilename == undefined)
      return;

   // Open the language file ad start reading it.
   var langFile = new File(langFilename);
   if (langFile.open("r"))
   {
      if (langFile.length > 0)
      {
         var pos = 0; // Index of a character in one of the file lines
         var fileLine = "";
         var option = "";
         var optionValue = "";
         // String categories
         const CAT_MATRIX = 0;  // Strings for the login matrix
         const CAT_STD = 1;     // Strings for standard login
         const CAT_GEN = 2;     // General strings

         var strCategory = -1; // Will store the current string category

         // Read each line from the config file and set the
         // strings in the proper language string object.
         while (!langFile.eof)
         {
            // Read the line from the config file, look for a =, and
            // if found, read the option & value and set them
            // in cfgObj.
            fileLine = langFile.readln(512);

            // fileLine should be a string, but I've seen some cases
            // where it isn't, so check its type.
            if (typeof(fileLine) != "string")
               continue;

            // If the line is blank or starts with with a semicolon
            // (the comment character), then skip it.
            if ((fileLine.length == 0) || (fileLine.substr(0, 1) == ";"))
               continue;

            // Check for and set the string category
            if (fileLine.toUpperCase() == "[MATRIX]")
            {
               strCategory = CAT_MATRIX;
               continue;
            }
            else if (fileLine.toUpperCase() == "[STANDARD]")
            {
               strCategory = CAT_STD;
               continue;
            }
            else if (fileLine.toUpperCase() == "[GENERAL]")
            {
               strCategory = CAT_GEN;
               continue;
            }

            // Look for an = in the line, and if found, split into
            // option & value.
            pos = fileLine.indexOf("=");
            if (pos > -1)
            {
               // Extract the option & value, trimming leading & trailing spaces.
               option = trimSpaces(fileLine.substr(0, pos), true, false, true).toUpperCase();
               optionValue = trimSpaces(fileLine.substr(pos+1), true, false, true);
               // Set the option in the proper language object.
               switch (strCategory)
               {
                  case CAT_MATRIX:
                     gMatrixLangStrings[option] = optionValue;
                     break;
                  case CAT_STD:
                     gStdLangStrings[option] = optionValue;
                     break;
                  case CAT_GEN:
                     gGenLangStrings[option] = optionValue;
                     break;
               }
            }
         }
      }
      langFile.close();
   }
}

// Draws a one-line text box, with (optionally) some text inside it.
//
// Parameters:
//  pX: The upper-left horizontal coordinate of the box
//  pY: The upper-left vertical coordinate of the box
//  pStyle: "single" for single-line border, or "double" for double-line border
//  pBorderColor: A Synchronet color code to use for the border
//  pInnerColor: A Synchronet color code to use when blanking out the inside of the box
//  pInnerText: Optional - Text to be displayed inside the box (color codes allowed)
function drawOneLineInputBox(pX, pY, pWidth, pStyle, pBorderColor, pInnerColor, pInnerText)
{
   // Determine which border characters to use, based on pStyle
   const UPPER_LEFT = (pStyle == "double" ? UPPER_LEFT_DOUBLE : UPPER_LEFT_SINGLE);
   const HORIZONTAL = (pStyle == "double" ? HORIZONTAL_DOUBLE : HORIZONTAL_SINGLE);
   const UPPER_RIGHT = (pStyle == "double" ? UPPER_RIGHT_DOUBLE : UPPER_RIGHT_SINGLE);
   const LOWER_LEFT = (pStyle == "double" ? LOWER_LEFT_DOUBLE : LOWER_LEFT_SINGLE);
   const VERTICAL = (pStyle == "double" ? VERTICAL_DOUBLE : VERTICAL_SINGLE);
   const LOWER_RIGHT = (pStyle == "double" ? LOWER_RIGHT_DOUBLE : LOWER_RIGHT_SINGLE);

   var innerWidth = pWidth - 2;

   // Top border
   console.gotoxy(pX, pY);
   console.print(pBorderColor + UPPER_LEFT);
   for (var i = 0; i < innerWidth; ++i)
      console.print(HORIZONTAL);
   console.print(UPPER_RIGHT);
   // Middle row
   console.gotoxy(pX, pY+1);
   console.print(VERTICAL);
   if (pInnerText != null)
      console.print(pInnerText);
   console.print(pInnerColor);
   for (var i = (pInnerText != null ? strip_ctrl(pInnerText).length : 0); i < innerWidth; ++i)
      console.print(" ");
   console.print(pBorderColor + VERTICAL);
   // Bottom border
   console.gotoxy(pX, pY+2);
   console.print(LOWER_LEFT);
   for (var i = 0; i < innerWidth; ++i)
      console.print(HORIZONTAL);
   console.print(LOWER_RIGHT);
}

// Flashes a message on the screen at a given location for a given amount of time.
//
// Parameters:
//  pX: The horizontal location on the screen of where to write the message
//  pY: The vertical location on the screen of where to write the message
//  pMessage: The message to write on the screen
//  pPauseMS: The amount of time (in milliseconds) to pause before erasing the message
//  pFieldWidth: The width of the line on the screen where the text is to be drawn.
//               This is used for clearing the field.  If 0 or null, this will not be used.
//  pClearFieldFirst: Boolean - Whether or not to clear the field first
//  pClearAttr: If not null, this specifies the attribute to use to clear the field.
//              If this is left off (or is null), this function will use Synchronet's
//              normal attribute.
function flashMessage(pX, pY, pMessage, pPauseMS, pFieldWidth, pClearFieldFirst, pClearAttr)
{
   console.gotoxy(pX, pY);
   if (pClearFieldFirst && (pFieldWidth != null) && (pFieldWidth > 0))
   {
      // Clear the box
      if ((typeof(pClearAttr) != "undefined") && (pClearAttr != null))
         console.print(pClearAttr);
      else
         console.print("n");

      for (var x = 0; x < pFieldWidth; ++x)
         console.print(" ");

      console.gotoxy(pX, pY);
   }
   console.print(pMessage);
   // Pause, and then clear the box
   if ((pPauseMS != null) && (pPauseMS > 0))
      mswait(pPauseMS);
   console.gotoxy(pX, pY);
   console.print("n");
   var messageLen = strip_ctrl(pMessage).length;
   for (var x = 0; x < messageLen; ++x)
      console.print(" ");
}

// This function takes a string and returns a copy of the string
// with randomly-alternating dim & bright versions of a color.
//
// Parameters:
//  pString: The string to convert
//  pColor: The name of the color to use
function randomDimBrightString(pString, pColor)
{
	// Return if an invalid string is passed in.
	if (typeof(pString) == "undefined")
		return "";
	if (pString == null)
		return "";

	// Set the color.  Default to green.
	var color = "g";
	if ((typeof(pColor) != "undefined") && (pColor != null))
      color = pColor;

	// Create a copy of the string without any control characters,
	// and then add our coloring to it.
	pString = strip_ctrl(pString);
	var returnString = "n" + color;
	var bright = false;     // Whether or not to use the bright version of the color
	var oldBright = bright; // The value of bright from the last pass
	for (var i = 0; i < pString.length; ++i)
	{
		// Determine if this character should be bright
		bright = (Math.floor(Math.random()*2) == 1);
		if (bright != oldBright)
		{
			if (bright)
				returnString += "h";
			else
				returnString += "n" + color;
		}

		// Append the character from pString.
		returnString += pString.charAt(i);

		oldBright = bright;
	}

	return returnString;
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
	if (typeof(pLeading) != "undefined")
		leading = pLeading;
	if (typeof(pMultiple) != "undefined")
		multiple = pMultiple;
	if (typeof(pTrailing) != "undefined")
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

//////////////////////////////////////////////////////////////////////////////////////////
// Language object functions

// Constructor for the MatrixLangStrings object, which contains strings
// for the matrix-style login.  Defaults to English string.s
function MatrixLangStrings()
{
   this.LOGIN = "&Log in";
   this.NEWUSER = "&New user";
   this.GUEST = "&Guest account";
   this.RETRIEVE_PASSWORD = "&Retrieve password";
   this.EMAIL_SYSOP = "&Email the sysop";
   this.PAGE_SYSOP = "&Page the sysop";
   this.DISCONNECT = "&Disconnect";
   this.USERNAME_NUM_PASS_PROMPT = "Enter your username/# and password";
   this.USERNAME_PASS_PROMPT = "Enter your username and password";
   this.USERNAME_OR_NUM_PROMPT = "Name / #:";
   this.USERNAME_PROMPT = "Username:";
   this.PASSWORD_PROMPT = "Password:";
   this.UNKNOWN_USERNAME_OR_NUM = "Unknown username/number";
   this.UNKNOWN_USERNAME = "Unknown username";
   this.LOGIN_ATTEMPTS_FAIL_MSG = "whUnable to log in after y#wattempts.";
   this.GUEST_ACCT_FAIL = "nhyError: wUnable to log into the guest account.";
   this.SYSOP_HAS_BEEN_PAGED = "hcThe sysop has been paged.";
   this.UNABLE_TO_PAGE_SYSOP = "hyUnable to page the sysop at this time.";
   this.LOGOFF_CONFIRM_TEXT = "Logoff";
   this.DISCONNECT_MESSAGE = "nhwHave a nice day!";
   this.INPUT_TIMEOUT_REACHED = "Input timeout reached.";
   this.INVALID_LOGIN = "Invalid login";
}

// Constructor for the StdLangStrings object, which contains strings for
// the standard-style login.  Defaults to English string.s
function StdLangStrings()
{
   this.USERNAME_PROMPT = "\r\nnhgEnter yUser Name";
   this.OR_NUMER_PROMPT = "g or yNumberg.";
   this.NEW_USER_INFO = "\r\ngIf you are a new user, enter w'yNeww'g.";
   this.GUEST_INFO = "\r\ngFor the guest account, enter w'yGuestw'g.";
   this.LOGIN_PROMPT = "\r\nNN:\b\b\bLogin: w";
   this.PASSWORD_PROMPT = "nchPW:\b\b\bPassword: w";
}

// Constructor for the GeneralLangStrings object, which contains strings
// for other things.  Defaults to English strings.
function GeneralLangStrings()
{
   this.EMAIL_ADDR_CONFIRM_PROMPT = "nchPlease confirm your Internet e-mail address: y";
   this.DID_YOU_FORGET_PASSWORD_CONFIRM = "Did you forget your password";
   this.ACCT_INFO_REQUESTED_ON_TIME = "Your user account information was requested on";
   this.BY = "by";
   this.VIA = "via";
   this.PORT = "port";
   this.NEW = "new";
   this.INFO_ACCT_NUM = "Account Number:";
   this.INFO_CREATED = "Created:";
   this.INFO_LAST_ON = "Last on:";
   this.INFO_CONNECT = "Connect:";
   this.INFO_PASSWORD = "Password:";
   this.INFO_INCORRECT_EMAIL_ADDR = "Incorrect e-mail address:";
   this.ACCT_INFO_EMAILED_TO = "nhyAccount information e-mailed to: w";
   this.ERROR_SAVING_BULKMAIL_MESSAGE = "Error saving bulkmail message:";
   this.UNKNOWN_USERNAME = "Unknown username";
   this.UNABLE_TO_RETRIEVE_ACCT_INFO = "nhyUnable to send you your password (no email address/invalid user/sysop).";
}

//////////////////////////////////////////////////////////////////////////////////////////
// DDMatrixMenu object functions

// Constructs a menu item for a DCT menu
function DDMatrixMenuItem()
{
   this.text = "";        // The item text
   this.hotkeyIndex = -1; // Index of the hotkey in the text (-1 for no hotkey).
   this.hotkey = "";      // The shortcut key for the item (blank for no hotkey).
   this.returnVal = 0;    // Return value for the item
}

// DDMatrixMenu constructor: Constructs a DCTEdit-style menu.
//
// Parameters:
//  pTopLeftX: The upper-left screen column
//  pTopLeftY: The upper-left screen row
function DDMatrixMenu(pTopLeftX, pTopLeftY)
{
   this.colors = new Object();
   // Unselected item colors
   this.colors.unselected = "n7k";
   // Selected item colors
   this.colors.selected = "nw";
   // Other colors
   this.colors.hotkey = "hw";
   this.colors.border = "n7k";

   this.topLeftX = 1; // Upper-left screen column
   if ((pTopLeftX != null) && (pTopLeftX > 0) && (pTopLeftX <= console.screen_columns))
      this.topLeftX = pTopLeftX;
   this.topLeftY = 1; // Upper-left screen row
   if ((pTopLeftY != null) && (pTopLeftY > 0) && (pTopLeftY <= console.screen_rows))
      this.topLeftY = pTopLeftY;
   this.width = 0;
   this.height = 0;
   this.selectedItemIndex = 0;

   // this.menuItems will contain DDMatrixMenuItem objects.
   this.menuItems = new Array();
   // hotkeyRetvals is an array, indexed by hotkey, that contains
   // the return values for each hotkey.
   this.hotkeyRetvals = new Array();

   // exitLoopKeys will contain keys that will exit the input loop
   // when pressed by the user, so that calling code can catch them.
   this.exitLoopKeys = new Array();

   // Border style: "single" or "double"
   this.borderStyle = "single";

   // clearSpaceAroundMenu controls whether or not to clear one space
   // around the menu when it is drawn.
   this.clearSpaceAroundMenu = false;
   // clearSpaceColor controls which color to use when drawing the
   // clear space around the menu.
   this.clearSpaceColor = "n";
   // clearSpaceTopText specifies text to display above the top of the
   // menu when clearing space around it.
   this.clearSpaceTopText = "";

   // This option specifies whether or not clearSpaceTopText should
   // be displayed.
   this.displayClearSpaceTopText = false;

   // Timeout (in milliseconds) for the input loop.  Default to 1 minute.
   this.timeoutMS = 60000;

   // Member functions
   this.addItem = DDMatrixMenu_AddItem;
   this.addExitLoopKey = DDMatrixMenu_AddExitLoopKey;
   this.displayItem = DDMatrixMenu_DisplayItem;
   this.doInputLoop = DDMatrixMenu_DoInputLoop;
   this.numItems = DDMatrixMenu_NumItems;
   this.removeAllItems = DDMatrixMenu_RemoveAllItems;
}
// Adds an item to the DDMatrixMenu.
//
// Parameters:
//  pText: The text of the menu item.  Note that a & precedes a hotkey.
//  pReturnVal: The value to return upon selection of the item
function DDMatrixMenu_AddItem(pText, pReturnVal)
{
   if (pText == "")
      return;

   var item = new DDMatrixMenuItem();
   item.returnVal = pReturnVal;
   // Look for a & in pText, and if one is found, use the next character as
   // its hotkey.
   var ampersandIndex = pText.indexOf("&");
   if (ampersandIndex > -1)
   {
      // If pText has text after ampersandIndex, then set up
      // the next character as the hotkey in the item.
      if (pText.length > ampersandIndex+1)
      {
         item.hotkeyIndex = ampersandIndex;
         item.hotkey = pText.substr(ampersandIndex+1, 1);
         // Set the text of the item.  The text should not include
         // the ampersand.
         item.text = pText.substr(0, ampersandIndex) + pText.substr(ampersandIndex+1);
         // Add the hotkey & return value to this.hotkeyRetvals
         this.hotkeyRetvals[item.hotkey.toUpperCase()] = pReturnVal;

         // If the menu is not wide enough for this item's text, then
         // update this.width.
         if (this.width < item.text.length + 2)
            this.width = item.text.length + 2;
         // Also update this.height
         if (this.height == 0)
            this.height = 3;
         else
            ++this.height;
      }
      else
      {
         // pText does not have text after ampersandIndex.
         item.text = pText.substr(0, ampersandIndex);
      }
   }
   else
   {
      // No ampersand was found in pText.
      item.text = pText;
   }

   // Add the item to this.menuItems
   this.menuItems.push(item);
}
// Adds a key that will exit the input loop when pressed by the user.
function DDMatrixMenu_AddExitLoopKey(pKey)
{
   this.exitLoopKeys[pKey] = true;
}
// Displays an item on the menu.
//
// Parameters:
//  pItemIndex: The index of the item in the menuItems array
//  pPrintBorders: Boolean - Whether or not to display the horizontal
//                 borders on each side of the menu item text.
function DDMatrixMenu_DisplayItem(pItemIndex, pPrintBorders)
{
   var printBorders = false;
   if (pPrintBorders != null)
      printBorders = pPrintBorders;

   // Determine whether to use the selected item color or unselected
   // item color.
   var itemColor = "";
   if (pItemIndex == this.selectedItemIndex)
      itemColor = this.colors.selected;
   else
      itemColor = this.colors.unselected;

   // Draw the borders (if applicable) and place the cursor where it
   // should be.
   //console.gotoxy(1, 1); console.print(pItemIndex + " - printBorders: " + printBorders); // Temporary
   if (printBorders)
   {
      console.gotoxy(this.topLeftX, this.topLeftY + pItemIndex + 1);
      console.print(this.colors.border);
      if (this.borderStyle == "single")
         console.print(VERTICAL_SINGLE);
      else if (this.borderStyle == "double")
         console.print(VERTICAL_DOUBLE);
   }
   else
      console.gotoxy(this.topLeftX+1, this.topLeftY + pItemIndex + 1);

   // If the menu item has a hotkey, then write the appropriate character
   // in the hotkey color.
   if (this.menuItems[pItemIndex].hotkeyIndex > -1)
   {
      console.print(itemColor +
                    this.menuItems[pItemIndex].text.substr(0, this.menuItems[pItemIndex].hotkeyIndex) +
                    this.colors.hotkey + this.menuItems[pItemIndex].hotkey + itemColor +
                    this.menuItems[pItemIndex].text.substr(this.menuItems[pItemIndex].hotkeyIndex + 1));
   }
   else
      console.print(itemColor + this.menuItems[pItemIndex].text);

   // If the item text isn't wide enough to fill the entire inner width, then
   // clear the line up until the right border.
   var innerWidth = this.width - 2;
   if (this.menuItems[pItemIndex].text.length < innerWidth)
   {
      for (var i = this.menuItems[pItemIndex].text.length; i < innerWidth; ++i)
         console.print(" ");
   }
   // Print the right border character if specified.
   if (printBorders)
   {
      if (this.borderStyle == "single")
         console.print(this.colors.border + VERTICAL_SINGLE);
      else if (this.borderStyle == "double")
         console.print(this.colors.border + VERTICAL_DOUBLE);
   }
}
// Displays the DCT menu and enters the input loop.
//
// Return value: An object containing the following properties:
//  returnVal: The return code of the item selected, or -1 if no
//             item was selected.
//  userInput: The last user input
function DDMatrixMenu_DoInputLoop()
{
   var returnObj = new Object();
   returnObj.returnVal = -1;
   returnObj.userInput = "";

   // If clearSpaceAroundMenu is true, then draw a blank row
   // above the menu.
   if (this.clearSpaceAroundMenu && (this.topLeftY > 1))
   {
      // If there is room, output a space to the left, diagonal
      // from the top-left corner of the menu.
      if (this.topLeftX > 1)
      {
         console.gotoxy(this.topLeftX-1, this.topLeftY-1);
         console.print(this.clearSpaceColor + " ");
      }
      else
         console.gotoxy(this.topLeftX, this.topLeftY-1);

      // If displayClearSpaceTopText is true, output this.clearSpaceTopText.
      var textLen = 0;
      if (this.displayClearSpaceTopText)
      {
         console.print(this.clearSpaceTopText);
         textLen = strip_ctrl(this.clearSpaceTopText).length;
      }
      // Output the rest of the blank space
      if (textLen < this.width)
      {
         var numSpaces = this.width - textLen;
         if (this.topLeftX + this.width < console.screen_columns)
            ++numSpaces;
         for (var i = 0; i < numSpaces; ++i)
            console.print(this.clearSpaceColor + " ");
      }
   }
   // If displayClearSpaceTopText is true and clearSpaceAroundMenu
   // is false and we can display clearSpaceTopText, then display it.
   else if (this.displayClearSpaceTopText && !this.clearSpaceAroundMenu &&
             (this.clearSpaceTopText.length > 0) && (this.topLeftY > 1))
   {
      // Display clearSpaceTopText above the menu.
      console.gotoxy(this.topLeftX, this.topLeftY-1);
      console.print(this.clearSpaceTopText);
   }

   // Before drawing the top border, if clearSpaceAroundMenu is
   // true, put space before the border.
   if (this.clearSpaceAroundMenu && (this.topLeftX > 1))
   {
      console.gotoxy(this.topLeftX-1, this.topLeftY);
      console.print(this.clearSpaceColor + " ");
   }
   else
      console.gotoxy(this.topLeftX, this.topLeftY);
   // Draw the top border
   var innerWidth = this.width - 2;
   if (this.borderStyle == "single")
   {
      console.print(this.colors.border + UPPER_LEFT_SINGLE);
      for (var i = 0; i < innerWidth; ++i)
         console.print(HORIZONTAL_SINGLE);
      console.print(this.colors.border + UPPER_RIGHT_SINGLE);
   }
   else if (this.borderStyle == "double")
   {
      console.print(this.colors.border + UPPER_LEFT_DOUBLE);
      for (var i = 0; i < innerWidth; ++i)
         console.print(HORIZONTAL_DOUBLE);
      console.print(this.colors.border + UPPER_RIGHT_DOUBLE);
   }
   // If clearSpaceAroundMenu is true, then put a space after the border.
   if (this.clearSpaceAroundMenu && (this.topLeftX + this.width < console.screen_columns))
      console.print(this.clearSpaceColor + " ");

   // Print the menu items (and side spaces outside the menu if
   // clearSpaceAroundMenu is true).
   var displayBorders = ((this.borderStyle == "single") || (this.borderStyle == "double"));
   var itemColor = "";
   for (var i = 0; i < this.menuItems.length; ++i)
   {
      // If the option for clearing a space around the menu is true, then output a space.
      if (this.clearSpaceAroundMenu && (this.topLeftX > 1))
      {
         console.gotoxy(this.topLeftX-1, this.topLeftY + i + 1);
         console.print(this.clearSpaceColor + " ");
      }
      // Display the menu item
      this.displayItem(i, displayBorders);
      // If the option for clearing a space around the menu is true, then output a space.
      if (this.clearSpaceAroundMenu && (this.topLeftX + this.width < console.screen_columns))
      {
         console.gotoxy(this.topLeftX + this.width, this.topLeftY + i + 1);
         console.print(this.clearSpaceColor + " ");
      }
   }

   // Before drawing the bottom border, if clearSpaceAroundMenu is
   // true, put space before the border.
   if (this.clearSpaceAroundMenu && (this.topLeftX > 1))
   {
      console.gotoxy(this.topLeftX - 1, this.topLeftY + this.height - 1);
      console.print(this.clearSpaceColor + " ");
   }
   else
      console.gotoxy(this.topLeftX, this.topLeftY + this.height - 1);
   // Draw the bottom border
   if (this.borderStyle == "single")
   {
      console.print(this.colors.border + LOWER_LEFT_SINGLE);
      for (var i = 0; i < innerWidth; ++i)
         console.print(HORIZONTAL_SINGLE);
      console.print(LOWER_RIGHT_SINGLE);
   }
   else if (this.borderStyle == "double")
   {
      console.print(this.colors.border + LOWER_LEFT_DOUBLE);
      for (var i = 0; i < innerWidth; ++i)
         console.print(HORIZONTAL_DOUBLE);
      console.print(LOWER_RIGHT_DOUBLE);
   }
   // If clearSpaceAroundMenu is true, then put a space after the border.
   if (this.clearSpaceAroundMenu && (this.topLeftX + this.width < console.screen_columns))
      console.print(this.clearSpaceColor + " ");

   // If clearSpaceAroundMenu is true, then draw a blank row
   // below the menu.
   if (this.clearSpaceAroundMenu && (this.topLeftY + this.height < console.screen_rows))
   {
      var numSpaces = this.width + 2;
      if (this.topLeftX > 1)
         console.gotoxy(this.topLeftX-1, this.topLeftY + this.height);
      else
      {
         console.gotoxy(this.topLeftX, this.topLeftY + this.height);
         --numSpaces;
      }

      if (this.topLeftX + this.width >= console.screen_columns)
         --numSpaces;

      for (var i = 0; i < numSpaces; ++i)
         console.print(this.clearSpaceColor + " ");
   }

   // Place the cursor on the line of the selected item
   console.gotoxy(this.topLeftX + 1, this.topLeftY + this.selectedItemIndex + 1);

   // Keep track of the current cursor position
   var curpos = new Object();
   curpos.x = this.topLeftX + 1;
   curpos.y = this.topLeftY + this.selectedItemIndex + 1;

   // Input loop
   const topItemLineNumber = this.topLeftY + 1;
   const bottomItemLineNumber = this.topLeftY + this.height - 1;
   var continueOn = true;
   while (continueOn)
   {
      // Get a key, (time out after the selected time), and take appropriate action.
		//returnObj.userInput = console.inkey(K_UPPER, this.timeoutMS);
		returnObj.userInput = console.getkey(K_UPPER);
		// If the user input is blank, then the timeout was probably hit, so quit.
		if (returnObj.userInput == "")
		{
         continueOn = false;
         break;
		}

      // Take appropriate action, depending on the user's keypress.
      switch (returnObj.userInput)
      {
         case KEY_ENTER:
            // Set returnObj.returnVal to the currently-selected item's returnVal,
            // and exit the input loop.
            returnObj.returnVal = this.menuItems[this.selectedItemIndex].returnVal;
            continueOn = false;
            break;
         case KEY_LEFT:
         case KEY_UP:
            // Go up one item

            if (this.menuItems.length > 1)
            {
               // If we're below the top menu item, then go up one item.  Otherwise,
               // go to the last menu item.
               var oldIndex = this.selectedItemIndex;
               if ((curpos.y > topItemLineNumber) && (this.selectedItemIndex > 0))
               {
                  --curpos.y;
                  --this.selectedItemIndex;
               }
               else
               {
                  curpos.y = bottomItemLineNumber - 1;
                  this.selectedItemIndex = this.menuItems.length - 1;
               }
               // Refresh the items on the screen so that the item colors
               // are updated.
               this.displayItem(oldIndex, false);
               this.displayItem(this.selectedItemIndex, false);
            }
            break;
         case KEY_RIGHT:
         case KEY_DOWN:
            // Go down one item

            if (this.menuItems.length > 1)
            {
               // If we're above the bottom menu item, then go down one item.  Otherwise,
               // go to the first menu item.
               var oldIndex = this.selectedItemIndex;
               if ((curpos.y < bottomItemLineNumber) && (this.selectedItemIndex < this.menuItems.length - 1))
               {
                  ++curpos.y;
                  ++this.selectedItemIndex;
               }
               else
               {
                  curpos.y = this.topLeftY + 1;
                  this.selectedItemIndex = 0;
               }
               // Refresh the items on the screen so that the item colors
               // are updated.
               this.displayItem(oldIndex, false);
               this.displayItem(this.selectedItemIndex, false);
            }
            break;
         case KEY_ESC:
            continueOn = false;
            break;
         default:
            // If the user's input is one of the hotkeys, then stop the
            // input loop and return with the return code for the hotkey.
            if (typeof(this.hotkeyRetvals[returnObj.userInput]) != "undefined")
            {
               returnObj.returnVal = this.hotkeyRetvals[returnObj.userInput];
               continueOn = false;
            }
            // If the user's input is one of the loop-exit keys, then stop
            // the input loop.
            else if (typeof(this.exitLoopKeys[returnObj.userInput]) != "undefined")
               continueOn = false;
            break;
      }
   }

   return returnObj;
}
// Returns the number of items in the menu.
function DDMatrixMenu_NumItems()
{
   return this.menuItems.length;
}
// Removes all items from a DDMatrixMenu.
function DDMatrixMenu_RemoveAllItems()
{
   this.width = 0;
   this.height = 0;
   this.selectedItemIndex = 0;
   this.menuItems = new Array();
   this.hotkeyRetvals = new Array();
   this.exitLoopKeys = new Array();
}