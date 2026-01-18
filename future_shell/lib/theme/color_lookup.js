"use strict";



function GeneralColorLookup(__namespace, __key) {
    var lookupNS = __namespace;
    var lookupKey = __key;
    log("GeneralColorLookup called with namespace/key: " + lookupNS + "/" + lookupKey);
    var fallback = BG_BLACK | LIGHTGRAY;
    function _colorCtrlFromEntry(entry) {
        if (entry === null || entry === undefined) return '';
        var fg = null;
        if (typeof entry === 'number') fg = entry & 0x0F;
        else if (typeof entry === 'object') {
            if (typeof entry.FG === 'number') fg = entry.FG & 0x0F;
            else if (typeof entry.COLOR === 'number') fg = entry.COLOR & 0x0F;
        }
        if (fg === null) return '';
        return FG_CTRL_MAP.hasOwnProperty(fg) ? FG_CTRL_MAP[fg] : '';
    }

    function resolveColor(namespace, key) {
        log('Resolving color for namespace/key: ' + namespace + '/' + key);
        // if (arguments.length === 1) {
        //     key = namespace;
        //     namespace = null;
        //     fallback = undefined;
        // } else if (arguments.length === 2) {
        //     fallback = key;
        //     key = namespace;
        //     namespace = null;
        // }
        // var ns = namespace;
        log('1.Using namespace: ' + namespace);
        if (typeof ThemeRegistry === 'undefined') {
            try {
                var _themeModule = load('future_shell/lib/theme/palette.js');
                if (_themeModule && _themeModule.ThemeRegistry) ThemeRegistry = _themeModule.ThemeRegistry;
            } catch (e) {
                log('Failed to load ThemeRegistry: ' + e.message);
            }
        }
        log('2.Using namespace: ' + namespace);

        if (typeof ThemeRegistry === 'undefined') {
            log('No valid namespace or ThemeRegistry found. Falling back to default color.');
            return fallback;
        }
        log('3.Using namespace: ' + namespace);

        var result = ThemeRegistry.get(namespace, key, null);
        log('4.Using namespace: ' + namespace);

        log('Resolved color for namespace/key: ' + namespace + '/' + key + ' - Result: ' + JSON.stringify(result));
        return result;
    };

    return _colorCtrlFromEntry(resolveColor(lookupNS, lookupKey));
}

if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

registerModuleExports({ GeneralColorLookup: GeneralColorLookup });