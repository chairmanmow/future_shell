load("iconshell/lib/config.js");
// -------------------- Helpers --------------------
load("iconshell/lib/shell/index.js");

function IconShell(){
        log("Instantiate Icon Shell 22");
        this.currentView = "view1";  // first set inside init, reset when changing folders
        this.viewHotkeys = {}; // first set inside init, reset when changing folders
        this.init();
        this.main();
}