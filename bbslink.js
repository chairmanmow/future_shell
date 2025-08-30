//  ************************************************************
//  ************************************************************
//  ***                                                      ***
//  ***  BBSlink.net InterBBS Door Server Connection Script  ***
//  ***                                                      ***
//  ************************************************************
//  ************************************************************
//  
//  PLEASE DO NOT DISTRIBUTE THIS FILE
//  ==================================
//  
//  Version 1.2.1  1st April 2015
//  (C)2014-15 Mark Mearns. All Rights Reserved.
//
//  Thanks go to haliphax for cryptography advice.
//
//
//  USAGE:
//  =====
//  
//  1. Place this script in your Synchronet mods directory,
//     e.g. C:\SBBS\MODS (Windows) or /sbbs/mods/ (Linux).
//  2. Configure this script with the codes given for your system
//  3. Create an external program as normal in SCFG using the following
//     example as a guide - this example calls The Legend of The Red
//     Dragon (LORD) as the door to be accessed:
//  
//     +--------------------------------------------------------+
//     ?                     BBSlink - LORD                     ?
//     +--------------------------------------------------------?
//     ? Name                       InterBBS LORD               ?
//     ? Internal Code              BBSLORD                     ?
//     ? Start-up Directory         ../mods                     ?
//     ? Command Line               ?bbslink lord               ?
//     ? Clean-up Command Line                                  ?
//     ? Execution Cost             None                        ?
//     ? Access Requirements                                    ?
//     ? Execution Requirements                                 ?
//     ? Multiple Concurrent Users  Yes                         ?
//     ? Intercept I/O              No                          ?
//     ? Native Executable          No                          ?
//     ? Use Shell to Execute       No                          ?
//     ? Modify User Data           No                          ?
//     ? Execute on Event           No                          ?
//     ? Pause After Execution      No                          ?
//     ? BBS Drop File Type         None                        ?
//     ? Place Drop File In         Node Directory              ?
//     ? Time Options...                                        ?
//     +--------------------------------------------------------+
//
//     Note that this screen is from Synchronet for Linux, Windows versions
//     may vary, but the commands are all the same.
//
//  4. You can call different door games by changing the argument in the
//     command line, i.e. ?bbslink teos, ?bbslink lord2 or to show the user
//     a menu of all the available doors, ?bbslink menu - an up-to-date list
//     of available doors can be found at http://www.bbslink.net/install.php
//  
//  I hope you find BBSlink.net useful. Please guard your BBSlink login
//  credentials carefully, and should your system's authorisation code be
//  compromised, please contact me immediately for a new one.
//  
//  All feedback is greatly appreciated!
//  
//  Mark Mearns.



load("sbbsdefs.js");
load("http.js");

var host = "games.bbslink.net"; // Server address, usually 'games.bbslink.net'

var syscode = "future"; // Your system code
var authcode = "OJPfwdawTWPd"; // Your system's authorisation code
var schemecode = "RXy8MhGaPw9k"; // Scheme code


// ***********************************
// *** DO NOT EDIT BELOW THIS LINE ***
// ***********************************

function randomString(len, charSet) {
    charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < len; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}

if (argv[0]==null)
    {
    console.writeln("No door code passed to script");
    console.pause();
    exit();
    }

var xkey = randomString(6);
var doorcode = argv[0];
var scripttype = "JS";
var scriptver = "1.2.1";

gettkn = new HTTPRequest();
gettkn.SetupGet("http://" + host + "/token.php?key=" + xkey);
gettkn.SendRequest();
gettkn.ReadResponse();

var token = gettkn.body;

req = new HTTPRequest();
req.SetupGet("http://" + host + "/auth.php?key=" + xkey);
req.request_headers.push("X-User: " + user.number);
req.request_headers.push("X-System: " + syscode);
req.request_headers.push("X-Auth: " + md5_calc(authcode + token, hex=true));
req.request_headers.push("X-Code: " + md5_calc(schemecode + token, hex=true));
req.request_headers.push("X-Rows: " + console.screen_rows);
req.request_headers.push("X-Key: " + xkey);
req.request_headers.push("X-Door: " + doorcode);
req.request_headers.push("X-Token: " + token);
req.request_headers.push("X-Type: " + scripttype);
req.request_headers.push("X-Version: " + scriptver);
req.SendRequest();
req.ReadResponse();

if (req.body=="complete")
    {
        bbs.telnet_gate(host);
    }
else
    {
        console.writeln("An error occurred when contacting the door server:");
        console.writeln("[" + req.body + "]");
        console.writeln("");
        console.pause();
    }