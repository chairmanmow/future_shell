// palette.js - centralized theme palette management for IconShell

if (typeof registerModuleExports !== 'function') {
	try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

var ThemeRegistry = (function () {
	var palettes = {};      // namespace -> { defaults, overrides }
	var resolved = {};      // namespace -> merged values (cached)

	function clone(obj) {
		if (!obj || typeof obj !== 'object') return {};
		var copy = {};
		for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) copy[k] = obj[k];
		return copy;
	}

	function merge(base, override) {
		var merged = clone(base);
		if (!override) return merged;
		for (var key in override) {
			if (!Object.prototype.hasOwnProperty.call(override, key)) continue;
			merged[key] = override[key];
		}
		return merged;
	}

	function register(namespace, defaults) {
		if (!namespace) throw new Error('Theme.registerPalette requires namespace');
		palettes[namespace] = palettes[namespace] || { defaults: {}, overrides: {} };
		palettes[namespace].defaults = clone(defaults || {});
		resolved[namespace] = merge(palettes[namespace].defaults, palettes[namespace].overrides);
		return resolved[namespace];
	}

	function applyOverrides(overrides) {
		if (!overrides || typeof overrides !== 'object') return;
		for (var namespace in overrides) {
			if (!Object.prototype.hasOwnProperty.call(overrides, namespace)) continue;
			palettes[namespace] = palettes[namespace] || { defaults: {}, overrides: {} };
			var current = palettes[namespace];
			current.overrides = clone(overrides[namespace]);
			resolved[namespace] = merge(current.defaults, current.overrides);
		}
	}

	function get(namespace, key, fallback) {
		if (!namespace) return fallback;
		if (!Object.prototype.hasOwnProperty.call(resolved, namespace)) {
			if (palettes[namespace]) {
				resolved[namespace] = merge(palettes[namespace].defaults, palettes[namespace].overrides);
			}
		}
		var palette = resolved[namespace];
		if (!palette) return fallback;
		if (typeof key === 'undefined') return palette;
		if (Object.prototype.hasOwnProperty.call(palette, key)) return palette[key];
		return fallback;
	}

	function list() {
		var all = {};
		for (var ns in resolved) if (Object.prototype.hasOwnProperty.call(resolved, ns)) all[ns] = clone(resolved[ns]);
		return all;
	}

	function clear(namespace) {
		if (typeof namespace === 'string') {
			delete palettes[namespace];
			delete resolved[namespace];
			return;
		}
		palettes = {};
		resolved = {};
	}

	return {
		registerPalette: register,
		applyOverrides: applyOverrides,
		get: get,
		list: list,
		clear: clear
	};
})();

registerModuleExports({ ThemeRegistry: ThemeRegistry });
