/* Matrix rain background effect for IconShell
 * Usage: var rain = new MatrixRain({ parent:this.root }); rain.start(); in init()
 */
(function(){
    function MatrixRain(opts){
        opts = opts || {};
        this.parent = opts.parent; // required Frame
        this.cols = this.parent ? this.parent.width : 0;
        this.rows = this.parent ? this.parent.height : 0;
        this.drops = [];
        this.chars = opts.chars || '01';
        this.color = opts.color || (ICSH_VALS.RAIN_HEAD.FG | ICSH_VALS.RAIN_HEAD.BG);
        this.fadeColor = opts.fadeColor || (ICSH_VALS.RAIN_FADE_HIGH.FG | ICSH_VALS.RAIN_FADE_HIGH.BG);
    this.intervalMs = opts.intervalMs || 120;
    // Previous impl iterated every column each tick. Replace with capped random spawns.
    this.spawnChance = opts.spawnChance || 0.12; // retained for probability basis
    this.maxTrail = opts.maxTrail || 12;
    this.maxDrops = opts.maxDrops || Math.max(5, Math.floor(this.cols / 2));
    this.maxSpawnPerTick = opts.maxSpawnPerTick || Math.max(1, Math.floor(this.cols / 20));
    this.timeBudgetMs = opts.timeBudgetMs || 18; // soft budget per tick for drawing
        this.running = false;
        this._timer = null;
        this._lastCycle = 0;
        this._scratch = [];
    this._stoppedDirty = false;
    this._interrupt = false; // interrupt flag for early abort
    this.safeMode = (opts.safeMode !== undefined) ? opts.safeMode : true; // reduce attr churn
    this.deterministic = !!opts.deterministic; // cycle instead of random
    this._pairIdx = 0;
    this._trailIdx = 0;
    // Trail color palette (adds gray/white variation)
    // Static grayscale trio always available
    this._neutralColors = [WHITE, LIGHTGRAY, DARKGRAY].filter(function(c){return typeof c!=='undefined';});
    // Available low/high color pairs (fall back only to defined constants)
    this._colorPairs = [];
    function _addPair(lo,hi){ if(typeof lo!=='undefined' && typeof hi!=='undefined') self._colorPairs.push({low:lo, high:hi}); }
    var self = this;
    _addPair(MAGENTA, LIGHTMAGENTA);
    _addPair(BLUE, LIGHTBLUE);
    _addPair(RED, LIGHTRED);
    _addPair(CYAN, LIGHTCYAN);
    _addPair(GREEN, LIGHTGREEN);
    if(!this._colorPairs.length){ // fallback single pair (green)
        if(typeof GREEN!=='undefined' && typeof LIGHTGREEN!=='undefined') this._colorPairs.push({low:GREEN, high:LIGHTGREEN});
    }
    // Precompute color pools per pair (pair.low, pair.high + neutrals) to avoid per-frame allocation
    for(var cp=0; cp<this._colorPairs.length; cp++){
        var p=this._colorPairs[cp];
        p.colorPool = [p.low, p.high].concat(this._neutralColors);
    }
    // Object pool for drops to reduce GC churn
    this._dropPool = [];
    this._maxPool = 256;
    }

    MatrixRain.prototype._spawn = function(col){
        var len;
        if(this.deterministic){
            var span = Math.max(1, this.maxTrail-2);
            len = 3 + (this._pairIdx % span);
        } else {
            len = 3 + Math.floor(Math.random()* (this.maxTrail-2));
        }
        var pair;
        if(this.deterministic){
            pair = this._colorPairs[this._pairIdx % this._colorPairs.length];
            this._pairIdx++;
        } else {
            pair = this._colorPairs[Math.floor(Math.random()*this._colorPairs.length)] || this._colorPairs[0];
        }
        var d = (this._dropPool.length ? this._dropPool.pop() : {});
        d.c = col; d.y = 1; d.trail = len; d.pair = pair; d.seq = this._pairIdx; d.pool = pair.colorPool;
        this.drops.push(d);
    };

    MatrixRain.prototype._step = function(){
        if(!this.running) return;
        if(!this.parent || !this.parent.is_open) return;
        var f = this.parent;
        var startTime = Date.now();
        this._interrupt = false;
        // Spawn: attempt limited number of new drops instead of scanning every column
        if(this.drops.length < this.maxDrops){
            var spawnBudget = Math.min(this.maxSpawnPerTick, this.maxDrops - this.drops.length);
            var expected = Math.floor(this.cols * this.spawnChance);
            spawnBudget = Math.min(spawnBudget, Math.max(1, expected));
            for(var s=0; s<spawnBudget; s++){
                var col = 1 + Math.floor(Math.random()*this.cols);
                // Avoid starting two heads in same column same tick (optional)
                var conflict=false;
                for(var k=0;k<this.drops.length;k++){ if(this.drops[k].c===col && this.drops[k].y < 3){ conflict=true; break; } }
                if(conflict) continue;
                this._spawn(col);
            }
        }
        var drops = this.drops;
        var write = 0;
        var originalLen = drops.length;
        for(var i=0;i<originalLen && !this._interrupt;i++){
            var d=drops[i];
            // Draw head (single attribute)
            var headChar = this.deterministic
                ? this.chars.charAt(d.seq % this.chars.length)
                : this.chars.charAt(Math.floor(Math.random()*this.chars.length));
            var headAttr;
            if(this.deterministic){
                // Every 10th drop head white (if available)
                headAttr = (typeof WHITE!=='undefined' && (d.seq % 10 === 0)) ? (ICSH_VALS.RAIN_SPARK.FG | ICSH_VALS.RAIN_SPARK.BG) : (d.pair.high|BG_BLACK);
            } else {
                headAttr = (Math.random() < 0.10 && typeof WHITE !== 'undefined') ? (ICSH_VALS.RAIN_SPARK.FG | ICSH_VALS.RAIN_SPARK.BG) : (d.pair.high|BG_BLACK);
            }
            try { f.setData(d.c-1, d.y-1, headChar, headAttr, false); } catch(e){ this._interrupt = true; break; }
            if((i & 1) === 0 && (Date.now() - startTime) >= this.timeBudgetMs){
                // Early time budget check every other drop
            } else if(Date.now() - startTime < this.timeBudgetMs){
                var maxTrailRender = d.trail;
                for(var t=1;t<maxTrailRender && !this._interrupt;t++){
                    var yy = d.y - t; if(yy < 1) break;
                    var attr;
                    if(this.safeMode) {
                        var pool = d.pool; // precomputed
                        if(this.deterministic){
                            var sel = pool[this._trailIdx % pool.length];
                            this._trailIdx++;
                            attr = sel|ICSH_VALS.RAIN_DIM1.BG; // same BG
                        } else {
                            var selR = pool[Math.floor(Math.random()*pool.length)];
                            attr = selR|ICSH_VALS.RAIN_DIM1.BG;
                        }
                    } else {
                        // Intensity-based gradient: high -> low -> light gray -> dark gray
                        var intensity = (d.trail - t)/d.trail;
                        if(intensity > 0.75) attr = (d.pair.high|ICSH_VALS.RAIN_HEAD.BG);
                        else if(intensity > 0.5) attr = (d.pair.low|ICSH_VALS.RAIN_FADE_HIGH.BG);
                        else if(intensity > 0.25) attr = (ICSH_VALS.RAIN_DIM1.FG|ICSH_VALS.RAIN_DIM1.BG);
                        else attr = (ICSH_VALS.RAIN_DIM2.FG|ICSH_VALS.RAIN_DIM2.BG);
                    }
                    if((t & 1) || !this.safeMode){
                        var fadeChar = this.chars.charAt(Math.floor(Math.random()*this.chars.length));
                        try { f.setData(d.c-1, yy-1, fadeChar, attr, false); } catch(e){ this._interrupt = true; break; }
                    }
                    if(Date.now() - startTime >= this.timeBudgetMs) break;
                }
            }
            d.y++;
            if(d.y - d.trail < this.rows) {
                drops[write++] = d; // keep
            } else {
                // recycle finished drop
                if(this._dropPool.length < this._maxPool) this._dropPool.push(d);
            }
            if(Date.now() - startTime >= this.timeBudgetMs) {
                // Copy remaining unprocessed drops as-is
                for(var j=i+1;j<originalLen;j++) {
                    var od = drops[j];
                    if(od.y - od.trail < this.rows) drops[write++] = od; else if(this._dropPool.length < this._maxPool) this._dropPool.push(od);
                }
                break;
            }
        }
        drops.length = write;
        try { f.cycle(); } catch(e){}
    };

    MatrixRain.prototype.cycle = function(){
        // Backwards compatibility: if no timer attached, fall back to timestamp pacing
        if(this._timerEvent) return; // timer drives updates
        var now = Date.now();
        if(now - this._lastCycle >= this.intervalMs){
            this._lastCycle = now;
            this._step();
        }
    };

    MatrixRain.prototype.attachTimer = function(timer){
        if(!timer || typeof timer.addEvent !== 'function') return false;
        var self = this;
        if(this._timerEvent && this._timerEvent.abort !== undefined) this._timerEvent.abort = true;
        this._timerEvent = timer.addEvent(this.intervalMs, true, function(){
            if(self.running) self._step();
        });
        return true;
    };

    MatrixRain.prototype.start = function(){
        this.running = true;
        // Disable scrollback/history on parent if possible to avoid memory growth
        try {
            if(this.parent){
                if(typeof this.parent.v_scroll !== 'undefined') this.parent.v_scroll = false;
                if(this.parent.lines && this.parent.lines.length > (this.parent.height*2)){
                    // Trim any accumulated off-screen history
                    this.parent.lines = this.parent.lines.slice(0, this.parent.height);
                }
            }
        } catch(e){}
    };
    MatrixRain.prototype.stop = function(){
        this.running = false;
        this._stoppedDirty = true;
        this._interrupt = true;
    };

    MatrixRain.prototype.clear = function(){
        if(!this.parent || !this.parent.is_open) return;
        // Only wipe if we actually wrote recently
        if(this._stoppedDirty){
            try { this.parent.clear(); } catch(e){}
            this._stoppedDirty = false;
        }
    // Recycle existing drops instead of abandoning array references
    for(var i=0;i<this.drops.length;i++) if(this._dropPool.length < this._maxPool) this._dropPool.push(this.drops[i]);
    this.drops.length = 0;
    };

    MatrixRain.prototype.resize = function(){
        if(!this.parent) return;
        this.cols = this.parent.width; this.rows = this.parent.height;
    this.maxDrops = opts.maxDrops || Math.max(5, Math.floor(this.cols / 2));
    };

    MatrixRain.prototype.requestInterrupt = function(){ this._interrupt = true; };

    this.MatrixRain = MatrixRain;
})();
