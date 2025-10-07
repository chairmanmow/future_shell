// basic helpers
load("future_shell/lib/util/helpers.js");
// shell/index.js

load("future_shell/lib/shell/dependencies.js");
// Explicitly load all shell module files in this directory

// Icon Shell prototypes
load("future_shell/lib/shell/shelllib.js");
load("future_shell/lib/shell/shell_frame_help.js");
load("future_shell/lib/shell/grid_nav.js");
load("future_shell/lib/shell/hotkeys.js");
load("future_shell/lib/shell/launch.js");
load("future_shell/lib/util/eye_candy.js");
load("future_shell/lib/util/debug.js");

// subclasses
var Icon = load("future_shell/lib/shell/icon.js");
load("future_shell/lib/shell/toast.js");

// subprograms
load("future_shell/lib/subprograms/chat.js");
load("future_shell/lib/util/mouse_hotspot_test.js");

