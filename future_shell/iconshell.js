load("future_shell/config/config.js");
// -------------------- Helpers --------------------
load("future_shell/lib/shell/index.js");

function IconShell() {
        this.currentView = "view1";  // first set inside init, reset when changing folders
        this.viewHotkeys = {}; // first set inside init, reset when changing folders
        this.init();
        // Provide persistent HelloWorld instance (similar to chat)
        if (typeof HelloWorld === 'function' && !this.helloWorld) {
                this.helloWorld = new HelloWorld();
        }
        this.main();
}
