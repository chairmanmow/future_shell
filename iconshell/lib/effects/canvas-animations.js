// canvas-animations.js
// Simple animation manager and a few lightweight animations for use in
// the future-login canvasFrame (Frame-based rendering).
// Each animation implements: init(frame), tick(), dispose()
// Animations should avoid blocking; keep work per tick minimal.

if(typeof(load) === 'function') {
	// assume frame.js already loaded by caller
}

(function(){
"use strict";

// Attempt to load Synchronet's event-timer library for lightweight scheduling.
try { if(typeof Timer === 'undefined') load('event-timer.js'); } catch(e) { /* optional */ }

function rand(a,b){ return a + Math.floor(Math.random()*(b-a+1)); }

// Base helper to write char at x,y (1-based) with optional attr
function put(frame,x,y,ch,attr){
	try {
		if(attr!==undefined) frame.attr=attr;
		frame.gotoxy(x,y); frame.putmsg(ch);
	} catch(e){}
}

// TV Static (CP437 noise)
function TvStatic(){
	this.chars = '\xB0\xB1\xB2\xDB .:;!+*=?%#@';
	this.colors = [WHITE,LIGHTGRAY,LIGHTCYAN,CYAN,LIGHTGREEN,LIGHTMAGENTA,LIGHTBLUE,LIGHTRED,YELLOW];
}
TvStatic.prototype.init = function(frame){ this.f=frame; };
TvStatic.prototype.tick = function(){
	var f=this.f; if(!f) return;
	var w=f.width, h=f.height;
	// Draw a sparse static: random subset per tick for performance
	for(var i=0;i<w*h/4;i++){
		var x=rand(1,w), y=rand(1,h);
		var ch=this.chars.charAt(rand(0,this.chars.length-1));
		f.gotoxy(x,y);
		f.attr=this.colors[rand(0,this.colors.length-1)];
		f.putmsg(ch);
	}
	f.cycle();
};
TvStatic.prototype.dispose = function(){};

// Matrix Rain (simplified)
function MatrixRain(){
	this.columns = [];
	this.glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*@';
}
MatrixRain.prototype.init = function(frame, opts){
	this.f=frame; this.columns=[];
	this.sparse = Math.max(1,(opts && opts.matrix_sparse)||1); // update 1/sparse of columns per tick
	this.phase = 0;
	for(var x=1;x<=frame.width;x++){
		if(Math.random()<0.6) this.columns.push({x:x,y:rand(1,frame.height),speed:rand(1,2)});
	}
};
MatrixRain.prototype.tick = function(){
	var f=this.f; if(!f) return;
	var h=f.height;
	f.attr=GREEN;
	var phaseMod = this.phase % this.sparse;
	for(var i=0;i<this.columns.length;i++){
		if((i % this.sparse)!==phaseMod) continue; // throttle column updates
		var c=this.columns[i];
		c.y += c.speed; if(c.y>h+5){ c.y=0; }
		var trailLen = 5;
		for(var t=0;t<trailLen;t++){
			var yy = c.y - t;
			if(yy>=1 && yy<=h){
				f.gotoxy(c.x,yy);
				var ch=this.glyphs.charAt(rand(0,this.glyphs.length-1));
				if(t===0) f.attr=WHITE; else if(t<3) f.attr=LIGHTGREEN; else f.attr=GREEN;
				f.putmsg(ch);
			}
		}
	}
	this.phase++;
	f.cycle();
};
MatrixRain.prototype.dispose = function(){};

// Game of Life (enhanced): wrap-around edges, half-block compression, color cycle, reseed on stagnation
function Life(){
	this.grid=null; this.next=null; this.w=0; this.h=0; this.tickCount=0; this.lastHash='';
	this.density=0.28; // initial fill
	this.reseedAfter=400; // fallback reseed timer
	this.stagnantFrames=0; this.maxStagnant=60; // reseed if unchanged pattern ~60 frames
	this.palette=[LIGHTGREEN,GREEN,LIGHTCYAN,CYAN,LIGHTMAGENTA,MAGENTA,YELLOW,WHITE];
	this.colorIndex=0;
}
Life.prototype._alloc = function(){
	this.grid=[]; this.next=[];
	for(var y=0;y<this.h;y++){
		var r=[], n=[]; for(var x=0;x<this.w;x++){ r.push(Math.random()<this.density?1:0); n.push(0);} this.grid.push(r); this.next.push(n);
	}
};
Life.prototype.init = function(frame){
	this.f=frame; this.w=frame.width; this.h=frame.height*2; // half-block vertical compression
	this._alloc(); this.tickCount=0; this.lastHash=''; this.stagnantFrames=0; this.colorIndex=0;
};
Life.prototype._step = function(){
	var w=this.w, h=this.h, g=this.grid, ngrid=this.next;
	for(var y=0;y<h;y++){
		var y1=(y+1)%h, y_1=(y-1+h)%h;
		for(var x=0;x<w;x++){
			var x1=(x+1)%w, x_1=(x-1+w)%w;
			var alive=g[y][x];
			var count = g[y_1][x_1]+g[y_1][x]+g[y_1][x1]
					   +g[y][x_1]              +g[y][x1]
					   +g[y1][x_1]+g[y1][x]+g[y1][x1];
			ngrid[y][x] = (alive && (count===2||count===3)) || (!alive && count===3) ? 1:0;
		}
	}
	var tmp=this.grid; this.grid=this.next; this.next=tmp;
};
Life.prototype._hash = function(){
	// lightweight hash: sample every 4th cell
	var g=this.grid, w=this.w, h=this.h, acc=0;
	for(var y=0;y<h;y+=4) for(var x=0;x<w;x+=4) acc = (acc*131 + g[y][x]) & 0x7fffffff;
	return acc.toString(36);
};
Life.prototype._draw = function(){
	var f=this.f; var w=this.w; var visH=Math.floor(this.h/2);
	f.gotoxy(1,1); f.attr=this.palette[this.colorIndex%this.palette.length];
	for(var vy=0; vy<visH; vy++){
		var yTop=vy*2, yBot=yTop+1; var line='';
		for(var x=0;x<w;x++){
			var top=this.grid[yTop][x], bot=this.grid[yBot][x];
			if(top && bot) line+='\xDB';
			else if(top) line+='\xDF';
			else if(bot) line+='\xDC';
			else line+=' ';
		}
		if(line.length>f.width) line=line.substr(0,f.width);
		f.putmsg(line+'\r\n');
	}
	f.cycle();
};
Life.prototype.tick = function(){
	if(!this.f) return;
	this._step();
	this.tickCount++;
	if(this.tickCount % 15 === 0) this.colorIndex++; // slow color cycle
	var h=this._hash();
	if(h===this.lastHash) this.stagnantFrames++; else this.stagnantFrames=0;
	this.lastHash=h;
	if(this.stagnantFrames>this.maxStagnant || this.tickCount>this.reseedAfter){
		this._alloc(); this.tickCount=0; this.stagnantFrames=0; this.colorIndex=0;
	}
	this._draw();
};
Life.prototype.dispose = function(){};

// Starfield: simple lateral parallax star scroller
function Starfield(){
	this.f=null; this.stars=[]; this.speedBase=0.6; this.charSet='.:*'; this.palette=[LIGHTGRAY,LIGHTCYAN,WHITE];
}
Starfield.prototype.init = function(frame, opts){
	this.f = frame; opts = opts || {};
	if(opts.star_speed !== undefined) this.speedBase = Math.max(0.1, parseFloat(opts.star_speed) || this.speedBase);
	var count = parseInt(opts.star_count, 10);
	if(isNaN(count) || count <= 0) count = Math.max(12, Math.floor((frame.width * frame.height) / 10));
	this.stars.length = 0;
	for(var i=0;i<count;i++) this.stars.push(this._spawn(frame));
};
Starfield.prototype._spawn = function(frame){
	return {
		x: 1 + Math.random() * frame.width,
		y: 1 + Math.random() * frame.height,
		speed: this.speedBase + Math.random() * this.speedBase,
		depth: Math.random()
	};
};
Starfield.prototype.tick = function(){
	var f=this.f; if(!f) return;
	try { f.clear(); } catch(e){}
	for(var i=0;i<this.stars.length;i++){
		var s=this.stars[i];
		s.x -= s.speed;
		if(s.x < 1){
			s.x = this.f.width;
			s.y = 1 + Math.random()*this.f.height;
			s.speed = this.speedBase + Math.random()*this.speedBase;
			s.depth = Math.random();
		}
		var cx = Math.round(s.x);
		var cy = Math.round(s.y);
		if(cx < 1 || cy < 1 || cx > this.f.width || cy > this.f.height) continue;
		var brightness = (s.depth < 0.33) ? 0 : (s.depth < 0.66 ? 1 : 2);
		var ch = this.charSet.charAt(Math.min(brightness, this.charSet.length-1));
		this.f.gotoxy(cx, cy);
		this.f.attr = (this.palette[Math.min(brightness,this.palette.length-1)] || LIGHTGRAY) | BG_BLACK;
		this.f.putmsg(ch);
	}
	this.f.cycle();
};
Starfield.prototype.dispose = function(){ this.stars.length = 0; };

// Fireflies: wandering glowing dots
function Fireflies(){
	this.f=null; this.entities=[]; this.tickCount=0; this.palette=[LIGHTGREEN,LIGHTCYAN,LIGHTMAGENTA,YELLOW];
}
Fireflies.prototype.init = function(frame, opts){
	this.f=frame; opts = opts || {};
	var count = parseInt(opts.firefly_count, 10);
	if(isNaN(count) || count <= 0) count = Math.max(4, Math.round(Math.min(14, (frame.width+frame.height)/3)));
	this.entities.length = 0;
	for(var i=0;i<count;i++){
		this.entities.push({
			x: 1 + Math.random()*frame.width,
			y: 1 + Math.random()*frame.height,
			dx: (Math.random()*0.8)-0.4,
			dy: (Math.random()*0.6)-0.3,
			colorIndex: rand(0,this.palette.length-1)
		});
	}
	this.tickCount = 0;
};
Fireflies.prototype.tick = function(){
	var f=this.f; if(!f) return;
	this.tickCount++;
	try { f.clear(); } catch(e){}
	for(var i=0;i<this.entities.length;i++){
		var e=this.entities[i];
		if(Math.random() < 0.2){
			e.dx += (Math.random()*0.2)-0.1;
			e.dy += (Math.random()*0.2)-0.1;
			e.dx = Math.max(-0.7, Math.min(0.7, e.dx));
			e.dy = Math.max(-0.5, Math.min(0.5, e.dy));
		}
		e.x += e.dx;
		e.y += e.dy;
		if(e.x < 1){ e.x = 1; e.dx = Math.abs(e.dx); }
		if(e.x > f.width){ e.x = f.width; e.dx = -Math.abs(e.dx); }
		if(e.y < 1){ e.y = 1; e.dy = Math.abs(e.dy); }
		if(e.y > f.height){ e.y = f.height; e.dy = -Math.abs(e.dy); }
		if(this.tickCount % 18 === 0 && Math.random() < 0.6){
			e.colorIndex = (e.colorIndex + 1) % this.palette.length;
		}
		var cx = Math.round(e.x);
		var cy = Math.round(e.y);
		if(cx < 1 || cy < 1 || cx > f.width || cy > f.height) continue;
		f.gotoxy(cx, cy);
		f.attr = (this.palette[e.colorIndex] || LIGHTGREEN) | BG_BLACK;
		f.putmsg('*');
	}
	f.cycle();
};
Fireflies.prototype.dispose = function(){ this.entities.length = 0; };

// SineWave: sweeping sine wave glyphs
function SineWave(){
	this.f=null; this.phase=0; this.freq=1.2; this.amp=3; this.speed=0.3; this.char='~'; this.palette=[LIGHTBLUE,CYAN,LIGHTCYAN,WHITE];
}
SineWave.prototype.init = function(frame, opts){
	this.f=frame; opts = opts || {};
	if(opts.wave_frequency !== undefined){ var fq = parseFloat(opts.wave_frequency); if(!isNaN(fq) && fq > 0) this.freq = fq; }
	var maxAmp = Math.max(1, Math.floor(frame.height/2));
	if(opts.wave_amplitude !== undefined){ var amp = parseFloat(opts.wave_amplitude); if(!isNaN(amp) && amp > 0) this.amp = Math.min(maxAmp, Math.max(1, amp)); }
	else this.amp = Math.max(1, Math.min(maxAmp, Math.floor(frame.height/2) - 1));
	if(opts.wave_speed !== undefined){ var sp = parseFloat(opts.wave_speed); if(!isNaN(sp) && sp > 0) this.speed = sp; }
	if(opts.wave_char){ this.char = String(opts.wave_char).charAt(0) || this.char; }
	this.phase = 0;
};
SineWave.prototype.tick = function(){
	var f=this.f; if(!f) return;
	this.phase += this.speed;
	try { f.clear(); } catch(e){}
	var mid = Math.floor(f.height/2) || 1;
	for(var x=1;x<=f.width;x++){
		var angle = (x/Math.max(1,f.width)) * Math.PI * 2 * this.freq + this.phase;
		var y = Math.round(mid + Math.sin(angle) * this.amp);
		if(y < 1) y = 1; if(y > f.height) y = f.height;
		f.gotoxy(x, y);
		var idx = ((x + Math.floor(this.phase)) % this.palette.length + this.palette.length) % this.palette.length;
		f.attr = (this.palette[idx] || LIGHTBLUE) | BG_BLACK;
		f.putmsg(this.char);
	}
	f.cycle();
};
SineWave.prototype.dispose = function(){};

// CometTrails: bouncing glowing comets with fading trails
function CometTrails(){
	this.f=null; this.comets=[]; this.palette=[WHITE,LIGHTCYAN,LIGHTBLUE,LIGHTGRAY];
}
CometTrails.prototype.init = function(frame, opts){
	this.f = frame; opts = opts || {};
	var count = parseInt(opts.comet_count, 10);
	if(isNaN(count) || count <= 0) count = Math.max(3, Math.floor((frame.width + frame.height) / 20));
	var speed = parseFloat(opts.comet_speed);
	if(isNaN(speed) || speed <= 0) speed = 0.8;
	this.comets.length = 0;
	for(var i=0;i<count;i++){
		var angle = Math.random() * Math.PI * 2;
		this.comets.push({
			x: 1 + Math.random()*frame.width,
			y: 1 + Math.random()*frame.height,
			dx: Math.cos(angle) * speed,
			dy: Math.sin(angle) * speed,
			trail: []
		});
	}
};
CometTrails.prototype._drawPoint = function(x,y,char,colorIdx){
	var f=this.f;
	var cx = Math.round(x);
	var cy = Math.round(y);
	if(cx < 1 || cy < 1 || cx > f.width || cy > f.height) return;
	f.gotoxy(cx, cy);
	f.attr = (this.palette[Math.min(colorIdx,this.palette.length-1)] || LIGHTGRAY) | BG_BLACK;
	f.putmsg(char);
};
CometTrails.prototype.tick = function(){
	var f=this.f; if(!f) return;
	try { f.clear(); } catch(e){}
	for(var i=0;i<this.comets.length;i++){
		var c=this.comets[i];
		c.x += c.dx;
		c.y += c.dy;
		if(c.x < 1){ c.x = 1; c.dx = Math.abs(c.dx); }
		if(c.x > f.width){ c.x = f.width; c.dx = -Math.abs(c.dx); }
		if(c.y < 1){ c.y = 1; c.dy = Math.abs(c.dy); }
		if(c.y > f.height){ c.y = f.height; c.dy = -Math.abs(c.dy); }
		c.trail.unshift({ x:c.x, y:c.y });
		if(c.trail.length > 10) c.trail.pop();
		for(var t=0;t<c.trail.length;t++){
			var entry = c.trail[t];
			var char = (t===0)?'@':(t<4?'*':'.');
			this._drawPoint(entry.x, entry.y, char, t);
		}
	}
	f.cycle();
};
CometTrails.prototype.dispose = function(){ this.comets.length = 0; };

// Plasma: colourful procedural plasma effect
function Plasma(){
	this.f=null; this.t=0; this.palette=[BLUE,LIGHTBLUE,LIGHTCYAN,CYAN,LIGHTMAGENTA,MAGENTA,LIGHTRED,YELLOW,WHITE];
}
Plasma.prototype.init = function(frame, opts){
	this.f = frame; opts = opts || {};
	this.speed = (!isNaN(parseFloat(opts.plasma_speed))) ? parseFloat(opts.plasma_speed) : 0.18;
	this.scale = (!isNaN(parseFloat(opts.plasma_scale))) ? parseFloat(opts.plasma_scale) : 0.12;
	this.t = 0;
};
Plasma.prototype.tick = function(){
	var f=this.f; if(!f) return;
	this.t += this.speed;
    for(var y=1;y<=f.height;y++){
        for(var x=1;x<=f.width;x++){
            var nx = x*this.scale;
            var ny = y*this.scale;
            var val = Math.sin(nx + this.t) + Math.sin((ny + this.t*0.7)*1.3) + Math.sin(Math.sqrt(nx*nx + ny*ny) + this.t*0.4);
            var norm = (val + 3) / 6; // 0..1
            var paletteIndex = Math.min(this.palette.length-1, Math.max(0, Math.floor(norm * this.palette.length)));
            var ch;
            if(norm < 0.2) ch = ' ';
            else if(norm < 0.4) ch = '.';
            else if(norm < 0.6) ch = '*';
            else if(norm < 0.8) ch = 'o';
            else ch = '@';
            f.setData(x-1, y-1, ch, (this.palette[paletteIndex] || LIGHTBLUE) | BG_BLACK, false);
        }
    }
    try { f.cycle(); } catch(e){}
};
Plasma.prototype.dispose = function(){};


// Animation Manager
function AnimationManager(frame, opts){
	this.frame=frame;
	this.opts=opts||{};
	this.animations={};
	this.order=[];
	this.current=null;
	this.lastSwitch=js.global ? js.global.uptime : time();
	this.interval = this.opts.switch_interval || 30; // seconds (external scheduler will trigger switches)
	this.prevName = null;
	this.fps = Math.max(1, this.opts.fps || 8);
	this._ownedFrames=[]; // frames created by animations (child frames) to close on dispose
	// Internal timers removed; external owner drives switching & rendering.
}
AnimationManager.prototype.add = function(name, ctor){ this.animations[name]=ctor; this.order.push(name); };
AnimationManager.prototype._pickNext = function(){
	if(!this.order.length) return null;
	// If explicit sequence provided and not in random mode
	if(!this.opts.random && this.opts.sequence && this.opts.sequence.length){
		if(this._seqIndex===undefined) this._seqIndex=0;
		var name = this.opts.sequence[this._seqIndex % this.opts.sequence.length];
		this._seqIndex++;
		return name;
	}
	// Random mode: pick any registered animation except the previous (avoid immediate repeat)
	if(this.opts.random){
		if(this.order.length===1) return this.order[0];
		var pick=null; var tries=0;
		do {
			pick = this.order[rand(0,this.order.length-1)];
			tries++;
		} while(pick===this.prevName && tries < 10);
		return pick;
	}
	// Default non-random mode (no sequence): weighted random avoiding immediate repeat
	if(this.order.length===1) return this.order[0];
	var name; var attempts=0;
	do {
		name = this.order[rand(0,this.order.length-1)];
		attempts++;
	} while(name===this.prevName && attempts<5);
	return name;
};
AnimationManager.prototype.start = function(name){
	// Dispose previous animation and any owned frames
	if(this.current && this.current.dispose){
		try { this.current.dispose(); } catch(e) {}
	}
	if(this._ownedFrames && this._ownedFrames.length){
		for(var i=0;i<this._ownedFrames.length;i++){
			try { if(this._ownedFrames[i]) this._ownedFrames[i].close(); } catch(e) {}
		}
		this._ownedFrames.length=0;
	}
	if(!name) name=this._pickNext();
	if(!name) return;
	var ctor=this.animations[name];
	if(!ctor) return;
	this.current = new ctor();
	// Provide a shallow wrapper opts with ownFrame registration hook
	var passOpts={};
	for(var k in this.opts) if(Object.prototype.hasOwnProperty.call(this.opts,k)) passOpts[k]=this.opts[k];
	var self=this;
	passOpts.ownFrame=function(fr){ if(fr) self._ownedFrames.push(fr); };
	try { this.current.init(this.frame, passOpts); } catch(initErr){ try { log(LOG_ERR,'animation init error '+name+': '+initErr); }catch(_){}; throw initErr; }
	if(this.opts.clear_on_switch){ try{ this.frame.clear(); }catch(e){} }
	if(this.opts.debug){ try{ log(LOG_DEBUG,'anim switch -> '+name); }catch(e){} }
	this.prevName = name;
	this.lastSwitch=time();
};
AnimationManager.prototype.tick = function(){
	if(!this.frame) return;
	if(!this.current) this.start();
	if(!this.current) return;
	try { this.current.tick(); } catch(e) { try{ log(LOG_ERR,'animation tick error '+(this.prevName||'?')+': '+e);}catch(_){}; throw e; }
};
AnimationManager.prototype.dispose = function(){
	// No internal timers to stop now.
	// Dispose current animation
	try { if(this.current && this.current.dispose) this.current.dispose(); } catch(e){}
	this.current=null;
	// Close any remaining owned frames
	if(this._ownedFrames){
		for(var i=0;i<this._ownedFrames.length;i++){
			try { if(this._ownedFrames[i]) this._ownedFrames[i].close(); } catch(e){}
		}
		this._ownedFrames.length=0;
	}
};

// Return module object instead of mutating global namespace
var moduleExports = {
	AnimationManager: AnimationManager,
	TvStatic: TvStatic,
	MatrixRain: MatrixRain,
	Life: Life,
	Starfield: Starfield,
	Fireflies: Fireflies,
	SineWave: SineWave,
	CometTrails: CometTrails,
	Plasma: Plasma
};

var _global = (typeof globalThis !== 'undefined') ? globalThis : (typeof js !== 'undefined' && js && js.global) ? js.global : undefined;
if (_global) {
	try { _global.CanvasAnimations = moduleExports; } catch(e){}
}

return moduleExports;

})();
