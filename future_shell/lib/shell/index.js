"use strict";

var __ICSH_FORCE_RELOAD__ = (typeof globalThis !== 'undefined' && typeof globalThis.__ICSH_FORCE_RELOAD__ === 'boolean') ? globalThis.__ICSH_FORCE_RELOAD__ : (typeof __ICSH_FORCE_RELOAD__ === 'boolean' ? __ICSH_FORCE_RELOAD__ : false);

function loadModule(path) {
	return load(path, __ICSH_FORCE_RELOAD__);
}

function loadMany(paths) {
	for (var i = 0; i < paths.length; i++) loadModule(paths[i]);
}

function resolveExport(mod, name) {
	if (mod && typeof mod === 'object' && Object.prototype.hasOwnProperty.call(mod, name)) return mod[name];
	var root = typeof globalThis !== 'undefined' ? globalThis : this;
	if (root && typeof root[name] !== 'undefined') return root[name];
	return mod;
}

// basic helpers
loadModule("future_shell/lib/util/helpers.js");
// shell/index.js

loadModule("future_shell/lib/shell/dependencies.js");

// Icon Shell prototypes
loadMany([
	"future_shell/lib/shell/shelllib.js",
	"future_shell/lib/shell/shell_frame_help.js",
	"future_shell/lib/shell/grid_nav.js",
	"future_shell/lib/shell/hotkeys.js",
	"future_shell/lib/shell/launch.js",
	"future_shell/lib/effects/eye_candy.js",
	"future_shell/lib/util/debug.js"
]);

// subclasses
var Icon = resolveExport(loadModule("future_shell/lib/shell/icon.js"), 'Icon');
loadModule("future_shell/lib/shell/toast.js");

// subprograms
loadMany([
	"future_shell/lib/subprograms/chat.js",
]);
