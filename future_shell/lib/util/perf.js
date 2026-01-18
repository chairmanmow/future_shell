// perf.js - lightweight runtime instrumentation for IconShell
"use strict";
// Collects metrics: frames created/closed, timers, events, key latency, chat redraw cost.
// Safe to load multiple times (idempotent).
if(typeof global === 'undefined') this.global = this;
(function(g){
    if(g.__ICSH_PERF__) return; // already installed
    var perf = {
        startTs: Date.now(),
        framesCreated:0, framesClosed:0,
        frameLivePeak:0, frameLiveCurrent:0,
        timersCreated:0, timersActive:0,
        eventsAdded:0, eventsFired:0, eventsAborted:0,
        staleEvents:0,
        keyEvents:0, keyBurstDrops:0,
        lastKeyTs:0, maxKeyGap:0,
        chatRedraws:0, chatRedrawMsTotal:0, chatRedrawMsMax:0,
        lastSecondTs: Date.now(),
        perSecond: { frames:0, events:0, keys:0 },
        _eventsMeta:[],
        frameTagLiveCounts:{},
        tick: function(){
            var now=Date.now();
            if(now - this.lastSecondTs >= 1000){
                this.perSecond.frames = 0;
                this.perSecond.events = 0;
                this.perSecond.keys = 0;
                this.lastSecondTs = now;
            }
            // Scan events for stale/aborted classification
            for(var i=0;i<this._eventsMeta.length;i++){
                var em=this._eventsMeta[i];
                if(!em) continue;
                if(em.handledAbort) continue;
                var ev=em.eventRef;
                if(ev && ev.abort){
                    this.eventsAborted++; em.handledAbort=true; continue;
                }
                if(!em.repeat && !em.fired){
                    var age=now - em.created;
                    var staleThreshold = Math.min(30000, (em.ms||0)*5 + 5000);
                    if(age > staleThreshold && !em.markedStale){
                        em.markedStale=true; this.staleEvents++;
                    }
                }
            }
        },
        snapshot: function(){
            return {
                uptimeMs: Date.now()-this.startTs,
                framesCreated:this.framesCreated,
                framesClosed:this.framesClosed,
                frameLive:this.frameLiveCurrent,
                framePeak:this.frameLivePeak,
                timersCreated:this.timersCreated,
                timersActive:this.timersActive,
                eventsAdded:this.eventsAdded,
                eventsFired:this.eventsFired,
                eventsAborted:this.eventsAborted,
                staleEvents:this.staleEvents,
                keyEvents:this.keyEvents,
                keyBurstDrops:this.keyBurstDrops,
                maxKeyGap:this.maxKeyGap,
                chatRedraws:this.chatRedraws,
                chatRedrawAvg:(this.chatRedraws? (this.chatRedrawMsTotal/this.chatRedraws).toFixed(2):0),
                chatRedrawMax:this.chatRedrawMsMax,
                frameTags:this.frameTagLiveCounts
            };
        },
        dump: function(){
            var s=this.snapshot();
            var msg='[perf] uptime='+(s.uptimeMs/1000).toFixed(1)+'s frames='+s.framesCreated+' live='+s.frameLive+' peak='+s.framePeak+
                ' timers='+s.timersActive+' events(fired/added)='+s.eventsFired+'/'+s.eventsAdded+
                ' keys='+s.keyEvents+' drops='+s.keyBurstDrops+' maxKeyGap='+s.maxKeyGap+'ms'+
                ' chatRedraws='+s.chatRedraws+' avg='+s.chatRedrawAvg+'ms max='+s.chatRedrawMax+'ms'+
                ' stale='+s.staleEvents+' aborted='+s.eventsAborted;
            // Top frame tags (up to 3)
            try {
                var tags = Object.keys(s.frameTags||{}).map(function(t){return {tag:t,c:s.frameTags[t]};});
                tags.sort(function(a,b){return b.c-a.c;});
                if(tags.length){
                    var top=tags.slice(0,3).map(function(t){return t.tag+':'+t.c;}).join(',');
                    msg += ' tags['+top+']';
                }
            }catch(_){ }
            try{ log(LOG_INFO,msg);}catch(e){}
        }
    };
    g.__ICSH_PERF__ = perf;
    // --- Patch Frame ---
    try {
        if(typeof Frame === 'function'){
            var _Frame = Frame;
            Frame = function(){
                perf.framesCreated++; perf.frameLiveCurrent++; if(perf.frameLiveCurrent>perf.frameLivePeak) perf.frameLivePeak=perf.frameLiveCurrent;
                return _Frame.apply(this, arguments);
            };
            Frame.prototype = _Frame.prototype;
            // Patch close()
            if(typeof _Frame.prototype.close === 'function'){
                var _close = _Frame.prototype.close;
                _Frame.prototype.close = function(){
                    if(!this.__perfClosed){ perf.framesClosed++; perf.frameLiveCurrent--; this.__perfClosed=true; }
                    if(this.__perfTag){
                        try{ if(perf.frameTagLiveCounts[this.__perfTag]>0) perf.frameTagLiveCounts[this.__perfTag]--; }catch(_){ }
                    }
                    return _close.apply(this, arguments);
                };
            }
        }
    } catch(e){ try{log(LOG_WARNING,'[perf] Frame patch error '+e);}catch(ex){} }
    // --- Patch Timer ---
    try {
        if(typeof Timer === 'function'){
            var _Timer = Timer;
            Timer = function(){ perf.timersCreated++; perf.timersActive++; return _Timer.apply(this, arguments); };
            Timer.prototype = _Timer.prototype;
            if(typeof _Timer.prototype.addEvent === 'function'){
                var _addEvent = _Timer.prototype.addEvent;
                _Timer.prototype.addEvent = function(ms,repeat,cb){
                    var meta = { created:Date.now(), ms:ms, repeat:!!repeat, fired:false, firedCount:0, cb:cb };
                    var wrapped = function(){
                        meta.fired=true; meta.firedCount++; perf.eventsFired++;
                        return cb.apply(this, arguments);
                    };
                    var ev = _addEvent.call(this, ms, repeat, wrapped);
                    meta.eventRef = ev;
                    perf.eventsAdded++;
                    perf._eventsMeta.push(meta);
                    return ev;
                };
            }
        }
    } catch(e2){ try{log(LOG_WARNING,'[perf] Timer patch error '+e2);}catch(ex2){} }
    // Chat redraw instrumentation hook
    g.__ICSH_INSTRUMENT_CHAT_REDRAW = function(startMs){
        var dur = Date.now()-startMs; var p=perf; p.chatRedraws++; p.chatRedrawMsTotal+=dur; if(dur>p.chatRedrawMsMax)p.chatRedrawMsMax=dur; };
    // Frame tagging helper (does not retain strong collections; counts only)
    g.ICSH_PERF_TAG = function(frame, tag){
        try{
            if(!frame || !tag) return;
            if(frame.__perfTag === tag) return;
            if(frame.__perfTag){ // switching tag
                var old=frame.__perfTag;
                if(perf.frameTagLiveCounts[old]>0) perf.frameTagLiveCounts[old]--;
            }
            frame.__perfTag = tag;
            if(!perf.frameTagLiveCounts[tag]) perf.frameTagLiveCounts[tag]=0;
            perf.frameTagLiveCounts[tag]++;
        }catch(e){}
    };
})(global);