"use strict";

load("future_shell/config/config.js");
// -------------------- Helpers --------------------
load("future_shell/lib/shell/index.js");

function IconShell() {
        this.currentView = "view1";  // first set inside init, reset when changing folders
        this.viewHotkeys = {}; // first set inside init, reset when changing folders
        this.init();
        this.main();
}
