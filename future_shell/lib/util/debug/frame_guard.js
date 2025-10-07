// Frame instrumentation guard
// Load early (e.g. in IconShell init) when diagnosing coordinate errors.
// Enable by setting global.ICSH_DEBUG_VALIDATE_FRAMES = true (or assign a function to global.ICSH_DEBUG_VALIDATE_SINK)
// It monkey-patches Frame prototype boundary check methods to emit detailed diagnostics on first failure occurrences.

(function(){
    if (typeof Frame === 'undefined') return; // environment not ready
    if (typeof global === 'undefined') this.global = this;
    var g = global || this;
    if (g.__FRAME_GUARD_INSTALLED__) return; // idempotent
    g.__FRAME_GUARD_INSTALLED__ = true;

    var sink = function(msg){ try { log('[FRAMEGUARD] ' + msg); } catch(_){ } };
    function enabled(){ return !!(g.ICSH_DEBUG_VALIDATE_FRAMES || g.ICSH_DEBUG_FRAMES); }
    if (typeof g.ICSH_DEBUG_VALIDATE_SINK === 'function') sink = g.ICSH_DEBUG_VALIDATE_SINK;

    function safe(obj, prop){ try { return obj && obj[prop]; } catch(_){ return undefined; } }

    var proto = Frame.prototype;
    var origCheckX = proto.__checkX__;
    var origCheckWidth = proto.__checkWidth__;

    proto.__checkX__ = function(x){
        var ok = origCheckX.call(this, x);
        if(!ok && enabled()){
            var p = safe(this,'parent');
            var pd = p && p.__properties__ ? p.__properties__.display : null;
            var d = this.__properties__ ? this.__properties__.display : null;
            sink('XFAIL x=' + x + ' parentDisplay=' + (pd?pd.x+','+pd.width:'?') + ' frameDisplay=' + (d?d.x+','+d.width:'?') + ' stack=' + (new Error().stack.split('\n').slice(1,4).join(' | ')) );
        }
        return ok;
    };

    proto.__checkWidth__ = function(x,width){
        var ok = origCheckWidth.call(this, x, width);
        if(!ok && enabled()){
            var p = safe(this,'parent');
            var pd = p && p.__properties__ ? p.__properties__.display : null;
            sink('WFAIL x=' + x + ' width=' + width + ' parentDisplay=' + (pd?pd.x+','+pd.width:'?') + ' stack=' + (new Error().stack.split('\n').slice(1,4).join(' | ')) );
        }
        return ok;
    };
})();
