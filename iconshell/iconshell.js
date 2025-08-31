/* mods/iconshell/iconshell.js
 * IconShell (advanced): icon-based GUI using Frame library.
 * - Arrow keys to move selection
 * - Enter to open folder/execute item
 * - ESC to go up a level, Q to log off
 */

load("sbbsdefs.js");
if (typeof K_MOUSE === 'undefined')
    var K_MOUSE = 0x80000000;
load("load/frame.js"); // Frame, Display, etc.
load("iconshell/lib/icon.js");

load("iconshell/lib/config.js");
load("load/graphic.js");
// -------------------- Helpers --------------------
load("iconshell/lib/helpers.js");
load("iconshell/lib/shelllib.js");
load("iconshell/lib/shell_frame_help.js");
load("iconshell/lib/debug.js");

function IconShell(){
    dbug("Starting up IconShell", "init");
    this.currentView = "view1";  // first set inside init, reset when changing folders
    this.viewHotkeys = {}; // first set inside init, reset when changing folders
    this.init();
    this.main();
}

