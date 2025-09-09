// /sbbs/mods/customlogon.js
// Random ANSI/BIN/XBIN logon art using drawAnsiBin utility
"use strict";
load("sbbsdefs.js");
load("iconshell/lib/util/draw_ansi_bin.js");

var DEBUG=true;
function l(msg){ if(DEBUG) try { log('[customlogon] '+msg);} catch(e){} }

// Primary art directory candidates (first with files wins)
var artDirs=[
	system.text_dir + 'futureland/',
];
var patterns=['*.ans','*.asc','*.txt','*.bin','*.xb','*.xbin'];

function collect(dir){
	var out=[];
	for(var i=0;i<patterns.length;i++){
		try { var list=directory(dir+patterns[i]); for(var j=0;j<list.length;j++) out.push(list[j]); }
		catch(e){ l('dir error '+e+' '+dir+patterns[i]); }
	}
	return out;
}

var files=[], chosenDir=null;
for(var d=0; d<artDirs.length && !files.length; d++) { files=collect(artDirs[d]); if(files.length) chosenDir=artDirs[d]; }
// Filter out zero-length files (can cause apparent blank screen)
var preFilterCount = files.length;
files = files.filter(function(path){ try { var f=new File(path); if(!f.open('rb')) return false; var len=f.length; f.close(); if(len===0){ l('Skipping zero-length file '+path); return false;} return true; } catch(e){ l('Stat fail '+e+' '+path); return false; } });
if (preFilterCount !== files.length) l('Removed '+(preFilterCount-files.length)+' empty file(s)');
// Log each file size (debug aid)
for (var fi=0; fi<files.length; fi++) {
	if (fi<10) { // limit chatter
		try { var fL=new File(files[fi]); if(fL.open('rb')) { var flen=fL.length; fL.close(); l('File['+fi+'] '+files[fi]+' size='+flen); } } catch(e){}
	}
}
l('Chosen dir='+(chosenDir||'none')+' fileCount='+files.length);

// TEMP explicit test target override
var testTarget = null;
var target=null;
if (!!testTarget && file_exists(testTarget)) {
    target=testTarget;
    l('Test override target='+target);
} else if(files.length) { 
	var idx=Math.floor(Math.random()*files.length);
	if(idx<0||idx>=files.length){ l('Index OOB correction idx='+idx+' len='+files.length); idx=0; }
	target=files[idx]; l('Picked index='+idx+' path='+target); 
}

console.clear();
if(target) {
	if(!drawAnsiBin(target, {speed:8, pausing:true, debug:DEBUG, finalPause:true})) {
		l('Direct draw failed, fallback bases');
		drawAnsiBin(null, {bases:['answer','logon','welcome'], debug:DEBUG, finalPause:true});
	}
} else {
	l('No art files; using fallback bases');
	drawAnsiBin(null, {bases:['answer','logon','welcome'], debug:DEBUG, finalPause:true});
}