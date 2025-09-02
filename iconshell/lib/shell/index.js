// basic helpers
load("iconshell/lib/util/helpers.js");
// shell/index.js

load("iconshell/lib/shell/dependencies.js");
// Explicitly load all shell module files in this directory

// Icon Shell prototypes
load("iconshell/lib/shell/shelllib.js");
load("iconshell/lib/shell/shell_frame_help.js");
load("iconshell/lib/shell/grid_nav.js");
load("iconshell/lib/shell/hotkeys.js");
load("iconshell/lib/shell/launch.js");
load("iconshell/lib/util/eye_candy.js");
load("iconshell/lib/util/debug.js");

// subclasses
var Icon = load("iconshell/lib/shell/icon.js");
load("iconshell/lib/shell/toast.js");

// subprograms
load("iconshell/lib/subfunctions/chat.js");
load("iconshell/lib/util/mouse_hotspot_test.js");

