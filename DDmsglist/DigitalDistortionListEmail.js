/* This is a script that lists the user's email messages, using
 * the Digital Distortion message lister.
 *
 * Author: Eric Oulashin (AKA Nightfox)
 * BBS: Digital Distortion
 * BBS address: digdist.bbsindex.com
 *
 * Date       User              Description
 * 2009-05-26 Eric Oulashin     Created
 * 2009-05-28 Eric Oulashin     Updated the path for loading
 *                              DigitalDistortionMessageLister.js because I
 *                              decided to move my scripts into their own
 *                              directory.
 * 2009-07-23 Eric Oulashin     Updated where the user is asked to sort
 *                              descending: Added a crlf and changed the
 *                              prompt text.
 */

// Include the Digital Distortion message lister file,
// but don't execute it, because this script configures it
// specifically to read personal email.
load("/BBS/sbbs/xtrn/DigDist/DigitalDistortionMessageLister.js", false);

bbs.log_str(user.alias + " is listing/reading personal email.");

// Create an instance of my DigDistMsgLister class.
var msgLister = new DigDistMsgLister();
msgLister.interfaceStyle = "Lightbar";
msgLister.displayBoardInfoInHeader = true;

// If the user has emails, ask if they want to sort in reverse.
// Note: If console.noyes() returns false, that means the
// user chose Yes.
if (numMessages("mail") > 0)
{
   console.crlf();
   msgLister.reverseOrder = !console.noyes("\1n\1cSort in descending order");
}

// List the messages.  Note: If there are no messages,
// ListMessages() will tell the user so and return.
msgLister.ListMessages("mail");