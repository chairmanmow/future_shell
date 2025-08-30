/* This script uses the Digital Distortion Message Lister
 * class to list messages in reverse.
 *
 * Author: Eric Oulashin (AKA Nightfox)
 * BBS: Digital Distortion
 * BBS address: digdist.bbsindex.com
 *
 * Date       User              Description
 * 2009-05-27 Eric Oulashin     Created
 * 2009-05-28 Eric Oulashin     Updated the path for loading
 *                              DigitalDistortionMessageLister.js because I
 *                              decided to move my scripts into their own
 *                              directory.
 * 2009-06-12 Eric Oulashin     Updated for version 1.09.
 */

// Determine the directory where this script was executed from.
// This code is a trick that was created by Deuce, suggested by Rob Swindell.
var startup_path = '.';
try { throw dig.dist(dist); } catch(e) { startup_path = e.fileName; }
startup_path = backslash(startup_path.replace(/[\/\\][^\/\\]*$/,''));

// Load the Digital Distortion message lister class
load(startup_path + "DigitalDistortionMessageLister.js", false);

// Write a note in the log that the user is listing messages for the sub-board
bbs.log_str(user.alias + " is listing messages for sub-board: " + bbs.cursub_code);
//global.log(LOG_INFO, user.alias + " is listing messages for sub-board: " + bbs.cursub_code);

// Create an instance of my DigDistMsgLister class and use it to list the
// messages.
var msgLister = new DigDistMsgLister(bbs.cursub_code);

// Override the reverseOrder property, seting it to true.
msgLister.reverseOrder = true;

// List the messages.  Note: If there are no messages in the sub-board,
// ListMessages() will tell the user so and return.
msgLister.ListMessages();