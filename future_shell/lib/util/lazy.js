// lazy.js - shared helpers for memoizing expensive load() operations
"use strict";
(function (global) {
	if (global && typeof global.lazyLoadModule === 'function') return;

	var cache = global.__ICSH_LAZY_CACHE__ || {};
	global.__ICSH_LAZY_CACHE__ = cache;

	function resolveValue(result, context) {
		if (typeof result !== 'undefined') return result;
		return context;
	}

	function lazyLoadModule(path, opts) {
		opts = opts || {};
		var key = opts.cacheKey || path;
		var refresh = opts.refresh === true;
		if (!refresh && Object.prototype.hasOwnProperty.call(cache, key)) {
			return cache[key];
		}
		var ctxSpecified = Object.prototype.hasOwnProperty.call(opts, 'context');
		var ctx = ctxSpecified ? opts.context : {};
		var args = opts.args || [];
		var loaderArgs;
		var result;
		try {
			if (opts.useContext === false) {
				loaderArgs = [path].concat(args);
				result = load.apply(global, loaderArgs);
			} else {
				loaderArgs = [ctx, path].concat(args);
				result = load.apply(global, loaderArgs);
			}
		} catch (e) {
			if (opts.suppressErrors) return null;
			throw e;
		}
		var value = resolveValue(result, ctx);
		cache[key] = value;
		return value;
	}

	function lazyRequireSymbol(path, symbol, opts) {
		var mod = lazyLoadModule(path, opts);
		if (!symbol) return mod;
		if (mod && Object.prototype.hasOwnProperty.call(mod, symbol)) return mod[symbol];
		if (typeof global[symbol] !== 'undefined') return global[symbol];
		return undefined;
	}

	function registerModuleExports(map) {
		if (!map || typeof map !== 'object') return {};
		var target = typeof globalThis !== 'undefined' ? globalThis : global;
		if (!target) target = this;
		for (var key in map) {
			if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
			try {
				if (target && typeof target[key] === 'undefined') target[key] = map[key];
			} catch (e) { }
		}
		return map;
	}

	global.lazyLoadModule = lazyLoadModule;
	global.lazyRequireSymbol = lazyRequireSymbol;
	global.registerModuleExports = global.registerModuleExports || registerModuleExports;
})(this);
