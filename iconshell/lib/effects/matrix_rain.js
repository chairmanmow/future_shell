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
        this.color = opts.color || (LIGHTGREEN|BG_BLACK);
        this.fadeColor = opts.fadeColor || (GREEN|BG_BLACK);
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
    }

    MatrixRain.prototype._spawn = function(col){
        var len = 3 + Math.floor(Math.random()* (this.maxTrail-2));
        var pair = this._colorPairs[Math.floor(Math.random()*this._colorPairs.length)] || {low:GREEN, high:LIGHTGREEN};
        this.drops.push({ c:col, y:1, trail:len, pair:pair });
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
        var remaining=[];
        for(var i=0;i<this.drops.length && !this._interrupt;i++){
            var d=this.drops[i];
            // Draw head (single attribute)
            var headChar = this.chars.charAt(Math.floor(Math.random()*this.chars.length));
            // Head uses the high color of its pair; occasional white flash for variation
            var headAttr = (Math.random() < 0.10 && typeof WHITE !== 'undefined') ? (WHITE|BG_BLACK) : (d.pair.high|BG_BLACK);
            try { f.setData(d.c-1, d.y-1, headChar, headAttr, false); } catch(e){ this._interrupt = true; break; }
            if(Date.now() - startTime < this.timeBudgetMs){
                var maxTrailRender = d.trail;
                for(var t=1;t<maxTrailRender && !this._interrupt;t++){
                    var yy = d.y - t; if(yy < 1) break;
                    var attr;
                    if(this.safeMode) {
                        // Random from pair (low/high) plus neutrals
                        var pool = [d.pair.low, d.pair.high].concat(this._neutralColors);
                        var sel = pool[Math.floor(Math.random()*pool.length)];
                        attr = sel|BG_BLACK;
                    } else {
                        // Intensity-based gradient: high -> low -> light gray -> dark gray
                        var intensity = (d.trail - t)/d.trail;
                        if(intensity > 0.75) attr = (d.pair.high|BG_BLACK);
                        else if(intensity > 0.5) attr = (d.pair.low|BG_BLACK);
                        else if(intensity > 0.25) attr = (LIGHTGRAY|BG_BLACK);
                        else attr = (DARKGRAY|BG_BLACK);
                    }
                    if((t & 1) || !this.safeMode){
                        var fadeChar = this.chars.charAt(Math.floor(Math.random()*this.chars.length));
                        try { f.setData(d.c-1, yy-1, fadeChar, attr, false); } catch(e){ this._interrupt = true; break; }
                    }
                    if(Date.now() - startTime >= this.timeBudgetMs) break;
                }
            }
            d.y++;
            if(d.y - d.trail < this.rows) remaining.push(d); // keep while any part visible
            if(Date.now() - startTime >= this.timeBudgetMs) {
                // Keep remaining drops for next tick without processing further
                for(var j=i+1;j<this.drops.length;j++) remaining.push(this.drops[j]);
                break;
            }
        }
        this.drops = remaining;
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

    MatrixRain.prototype.start = function(){ this.running = true; };
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
        this.drops = [];
    };

    MatrixRain.prototype.resize = function(){
        if(!this.parent) return;
        this.cols = this.parent.width; this.rows = this.parent.height;
    this.maxDrops = opts.maxDrops || Math.max(5, Math.floor(this.cols / 2));
    };

    MatrixRain.prototype.requestInterrupt = function(){ this._interrupt = true; };

    this.MatrixRain = MatrixRain;
})();
