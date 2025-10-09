// Ensure core shell dependencies are loaded once per startup
(function loadShellDependencies(paths) {
	var seen = {};
	for (var i = 0; i < paths.length; i++) {
		var file = paths[i];
		if (!file || seen[file]) continue;
		seen[file] = true;
		load(file);
	}
})([
	"sbbsdefs.js",
	"load/frame.js", // Frame, Display, etc.
	"future_shell/lib/effects/frame-ext.js",
	"load/graphic.js",
	"json-client.js",
	"json-chat.js",
	"future_shell/lib/util/layout/modal.js",
	"future_shell/lib/util/lazy.js"
]);
