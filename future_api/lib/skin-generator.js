// sbbs/mods/future_api/lib/skin-generator.js
//
// Server-side random character/skin generator for Futureland tracks.
//
// This is a faithful port of the "Randomize" button in the web Rock Star
// Designer (webv4_custom/root/js/rockstar-designer.js) so that a randomized
// skin can be produced on-box, with no browser or bot involvement.
//
// Also provides a minimal ID3v2 TPE1 (artist) reader so the upload handler
// can decide whether a freshly-uploaded song is a generic "Vektrax" track.
//
// Exposes a single global: FutureSkinGenerator
//   .generateRandomSkinJSON()  -> JSON string (CHARACTERS-compatible def)
//   .readMp3Artist(path)       -> artist string from ID3 TPE1, or ''
//   .charPathFor(path)         -> sidecar .char.json path for a media file

var FutureSkinGenerator = (function () {
	'use strict';

	// -- hex/rgb helpers (ported verbatim) -------------------------
	function hexToRgb(hex) {
		hex = hex.replace('#', '');
		if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
		var n = parseInt(hex, 16);
		return ((n>>16)&255) + ',' + ((n>>8)&255) + ',' + (n&255);
	}
	function hue2rgb(p, q, t) {
		if (t < 0) t += 1; if (t > 1) t -= 1;
		if (t < 1/6) return p + (q - p) * 6 * t;
		if (t < 1/2) return q;
		if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
		return p;
	}
	function hslToHex(h, s, l) {
		h /= 360; s /= 100; l /= 100;
		var r, g, b;
		if (s === 0) { r = g = b = l; }
		else {
			var q2 = l < 0.5 ? l * (1 + s) : l + s - l * s;
			var p2 = 2 * l - q2;
			r = hue2rgb(p2, q2, h + 1/3);
			g = hue2rgb(p2, q2, h);
			b = hue2rgb(p2, q2, h - 1/3);
		}
		return '#' + [r, g, b].map(function (x) {
			var hx = Math.round(x * 255).toString(16);
			return hx.length === 1 ? '0' + hx : hx;
		}).join('');
	}
	function deepClone(obj) {
		if (obj === null || typeof obj !== 'object') return obj;
		if (Array.isArray(obj)) return obj.map(deepClone);
		var out = {};
		for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = deepClone(obj[k]);
		return out;
	}

	// -- face profiles & presets (ported verbatim) -----------------
	var DEFAULT_PROFILES = {
		round: [
			[0.00,-0.76],[0.25,-0.67],[0.41,-0.54],[0.50,-0.38],[0.53,-0.20],
			[0.52,-0.03],[0.50,0.12],[0.48,0.26],[0.45,0.38],[0.40,0.48],
			[0.33,0.56],[0.22,0.62],[0.00,0.65]
		],
		angular: [
			[0.00,-0.80],[0.22,-0.70],[0.38,-0.58],[0.48,-0.42],[0.52,-0.25],
			[0.50,-0.08],[0.46,0.08],[0.44,0.22],[0.42,0.36],[0.37,0.48],
			[0.28,0.58],[0.15,0.65],[0.00,0.68]
		],
		blocky: [
			[0.00,-0.78],[0.24,-0.68],[0.40,-0.56],[0.50,-0.40],[0.53,-0.22],
			[0.52,-0.05],[0.50,0.10],[0.48,0.24],[0.46,0.36],[0.43,0.46],
			[0.38,0.54],[0.28,0.60],[0.00,0.63]
		],
		chiseled: [
			[0.00,-0.82],[0.18,-0.74],[0.34,-0.64],[0.47,-0.50],[0.52,-0.36],
			[0.53,-0.22],[0.51,-0.08],[0.48,0.06],[0.46,0.18],[0.44,0.30],
			[0.42,0.40],[0.38,0.50],[0.30,0.58],[0.18,0.64],[0.00,0.67]
		],
		wide: [
			[0.00,-0.80],[0.20,-0.72],[0.36,-0.62],[0.48,-0.48],[0.54,-0.34],
			[0.56,-0.20],[0.54,-0.06],[0.52,0.06],[0.50,0.18],[0.48,0.28],
			[0.46,0.38],[0.42,0.46],[0.36,0.54],[0.25,0.60],[0.00,0.63]
		]
	};

	var DEFAULT_SKELETON = {
		neck:{x:0,y:0}, shoulderL:{x:-0.18,y:0.06}, shoulderR:{x:0.18,y:0.06},
		elbowL:{x:-0.24,y:0.20}, elbowR:{x:0.24,y:0.20},
		handL:{x:-0.20,y:0.32}, handR:{x:0.20,y:0.32},
		hip:{x:0,y:0.32}, hipL:{x:-0.10,y:0.32}, hipR:{x:0.10,y:0.32},
		kneeL:{x:-0.12,y:0.46}, kneeR:{x:0.12,y:0.46},
		footL:{x:-0.14,y:0.58}, footR:{x:0.14,y:0.58}
	};
	var DEFAULT_BONES = [
		['neck','shoulderL'],['neck','shoulderR'],['shoulderL','shoulderR'],
		['shoulderL','elbowL'],['shoulderR','elbowR'],
		['elbowL','handL'],['elbowR','handR'],['neck','hip'],
		['hip','hipL'],['hip','hipR'],['hipL','kneeL'],['hipR','kneeR'],
		['kneeL','footL'],['kneeR','footR']
	];
	var ALL_MOVES = ['idle_sway','two_step','running_man','cabbage_patch',
	                 'robot','raise_the_roof','shuffle','disco_point'];

	// -- hair generators (ported verbatim) -------------------------
	function genShortSpiky(c) {
		var out = [];
		for (var i = 0; i < 8; i++) {
			var a = (i/8)*Math.PI - Math.PI/2;
			out.push({ rx: Math.sin(a)*0.20, ry: 0.46+Math.cos(a)*0.08, rz: 0.02,
				len: 0.25+Math.random()*0.15, color: c, width: 1.4, freq: i/8,
				dir: { dx: Math.sin(a)*0.5, dy: 0.8, dz: 0.3 } });
		}
		return out;
	}
	function genLongFlowing(c) {
		var out = [];
		for (var i=0;i<7;i++){var t=i/6;out.push({rx:-0.48+t*0.30,ry:0.20-t*0.10,rz:t*0.42,len:1.10-t*0.25,color:c,width:1.5,freq:t*0.42});}
		for (var j=0;j<7;j++){var t2=j/6;out.push({rx:0.48-t2*0.30,ry:0.20-t2*0.10,rz:t2*0.42,len:1.10-t2*0.25,color:c,width:1.5,freq:0.50+t2*0.42});}
		for (var k=0;k<5;k++){var t3=(k-2)/2;out.push({rx:t3*0.15,ry:0.50,rz:0.02,len:0.55,color:c,width:1.3,freq:0.2+k*0.08,dir:{dx:t3*0.30,dy:-0.60,dz:0.50}});}
		return out;
	}
	function genMohawk(c) {
		var out = [];
		for (var i=0;i<10;i++){var t=i/9;var zP=0.46-t*0.88;
			out.push({rx:0,ry:0.30+t*0.22,rz:zP,len:0.40+Math.sin(t*Math.PI)*0.30,
			color:c,width:1.8,freq:t,dir:{dx:0,dy:0.90,dz:zP>0?0.30:-0.30}});}
		return out;
	}
	function genSlickedBack(c) {
		var out = [];
		for (var i=0;i<5;i++){var t=(i-2)/2;out.push({rx:t*0.16,ry:0.32,rz:0.46,len:0.50,color:c,width:1.6,freq:0.08+i*0.07,dir:{dx:t*0.05,dy:-0.08,dz:-0.95}});}
		for (var j=0;j<3;j++){var t2=(j-1)/1.5;out.push({rx:t2*0.12,ry:0.48,rz:0.02,len:0.55,color:c,width:1.5,freq:0.20+j*0.08,dir:{dx:t2*0.06,dy:-0.08,dz:-0.95}});}
		out.push({rx:-0.46,ry:0.18,rz:0.06,len:0.35,color:c,width:1.3,freq:0.42,dir:{dx:-0.25,dy:-0.40,dz:-0.70}});
		out.push({rx:0.46,ry:0.18,rz:0.06,len:0.35,color:c,width:1.3,freq:0.50,dir:{dx:0.25,dy:-0.40,dz:-0.70}});
		out.push({rx:0,ry:0.40,rz:-0.42,len:0.42,color:c,width:1.4,freq:0.70});
		return out;
	}
	function genPigtails(c) {
		var out = [];
		[-1,1].forEach(function(s){
			for(var i=0;i<6;i++){var t=i/5;out.push({rx:s*(0.44+t*0.04),ry:0.10+t*0.08,rz:t*0.10,len:0.90+t*0.20,color:c,width:1.5,freq:s>0?0.50+t*0.08:t*0.08});}
		});
		for(var j=0;j<4;j++){var t2=(j-1.5)/2;out.push({rx:t2*0.12,ry:0.50,rz:0.02,len:0.20,color:c,width:1.2,freq:0.30+j*0.05,dir:{dx:t2*0.20,dy:-0.60,dz:0.50}});}
		return out;
	}

	var HAIR_PRESETS = { none:null, short_spiky:genShortSpiky, long_flowing:genLongFlowing,
		mohawk:genMohawk, slicked_back:genSlickedBack, pigtails:genPigtails };
	var HAT_TYPES = ['none','cowboy','baseballcap','afro'];
	var EYE_SHAPES = ['round','round_filled','square','square_filled','xeye','clippy','visor'];
	var MOUTH_TYPES = ['normal','pucker','smiley','slot'];
	var TEETH_TYPES = ['none','teeth','bucktooth'];
	var FACE_SHAPES = Object.keys(DEFAULT_PROFILES).concat('boxy');

	// -- default character state (ported verbatim) -----------------
	function buildDefaultChar() {
		return {
			name: '', faceShape: 'round',
			profile: deepClone(DEFAULT_PROFILES.round), ringN: 16,
			headShape: null, boxDims: { w: 0.48, h: 0.52, d: 0.28 },
			wireColor: '#33FF33', wireRGB: '51,255,51',
			accentColor: '#FFAA00', accentRGB: '255,170,0',
			eyeShape: 'round', eyeSize: 0.08, eyeSpacing: 0.18,
			eyeHeight: -0.03, eyeColor: null, eyeOutlineColor: null,
			hasEyebrows: false, eyebrowColor: '#996633',
			eyebrowWidth: 2.0, eyebrowThickness: 0.018,
			mouthType: 'normal', mouthWidth: 0.25, mouthY: -0.45, lipColor: '#FFAA00',
			teethType: 'none', teethColor: '#FFFFFF',
			hasNose: true,
			hairStyle: 'none', hairColor: '#FF55FF',
			hatType: 'none', hatColor: '#AA6622', hatBandColor: '#664411', hatText: '',
			facialHairType: 'none', facialHairColor: '#996633',
			hasEyelashes: false, eyelashLength: 0.035, eyelashColor: '#FFFF55',
			hasMascara: false,
			clothingUpper: '#4499FF', clothingSkin: '#FFCC88',
			clothingTorso: '#4499FF', clothingLower: '#8899AA',
			clothingFeet: '#CCDDFF', hasSkirt: false, bodyRainbow: false
		};
	}

	// -- randomize (ported verbatim; operates on a passed-in state) -
	function randomize(c) {
		c.faceShape=FACE_SHAPES[Math.floor(Math.random()*FACE_SHAPES.length)];
		if(c.faceShape==='boxy'){c.headShape='box';c.profile=deepClone(DEFAULT_PROFILES.round);}
		else{c.headShape=null;c.profile=deepClone(DEFAULT_PROFILES[c.faceShape]);}
		c.wireColor=hslToHex(Math.random()*360,70+Math.random()*30,50+Math.random()*30); c.wireRGB=hexToRgb(c.wireColor);
		c.accentColor=hslToHex(Math.random()*360,60+Math.random()*40,50+Math.random()*30); c.accentRGB=hexToRgb(c.accentColor);
		c.eyeShape=EYE_SHAPES[Math.floor(Math.random()*EYE_SHAPES.length)];
		c.eyeSize=0.05+Math.random()*0.06; c.eyeSpacing=0.12+Math.random()*0.10; c.eyeHeight=-0.10+Math.random()*0.12;
		c.eyeColor=Math.random()>0.4?hslToHex(Math.random()*360,60,55):null;
		c.eyeOutlineColor=Math.random()>0.6?hslToHex(Math.random()*360,50,50):null;
		c.hasEyebrows=Math.random()>0.4; c.eyebrowColor=hslToHex(Math.random()*360,40,40);
		c.eyebrowWidth=1.5+Math.random()*2; c.eyebrowThickness=0.012+Math.random()*0.018;
		c.lipColor=hslToHex(Math.random()*360,60+Math.random()*40,45+Math.random()*30);
		c.mouthType=MOUTH_TYPES[Math.floor(Math.random()*MOUTH_TYPES.length)];
		c.teethType=TEETH_TYPES[Math.floor(Math.random()*TEETH_TYPES.length)];
		c.mouthWidth=0.15+Math.random()*0.20; c.mouthY=-0.56+Math.random()*0.10;
		c.hasNose=Math.random()>0.2;
		var hk=Object.keys(HAIR_PRESETS); c.hairStyle=hk[Math.floor(Math.random()*hk.length)];
		c.hairColor=hslToHex(Math.random()*360,70,55);
		c.hatType=Math.random()>0.7?HAT_TYPES[1+Math.floor(Math.random()*(HAT_TYPES.length-1))]:'none';
		c.hatColor=hslToHex(Math.random()*360,50,40); c.hatBandColor=hslToHex(Math.random()*360,40,30);
		c.facialHairType=Math.random()>0.7?'moustache':'none'; c.facialHairColor=hslToHex(Math.random()*60,50,40);
		c.hasMascara=Math.random()>0.7; c.hasEyelashes=Math.random()>0.6; c.eyelashLength=0.015+Math.random()*0.10; c.eyelashColor=hslToHex(Math.random()*360,70,65);
		c.clothingUpper=hslToHex(Math.random()*360,60,50); c.clothingSkin=hslToHex(20+Math.random()*30,50+Math.random()*30,60+Math.random()*25);
		c.clothingTorso=hslToHex(Math.random()*360,60,50); c.clothingLower=hslToHex(Math.random()*360,40,40);
		c.clothingFeet=hslToHex(Math.random()*360,30,50); c.hasSkirt=Math.random()>0.7; c.bodyRainbow=Math.random()>0.85;
		return c;
	}

	// -- build a CHARACTERS-compatible def from state (ported) ------
	function buildCharDef(c) {
		var m = { y: c.mouthY, hw: c.mouthWidth, z: c.headShape==='box' ? c.boxDims.d+0.01 : 0.46, segs: 8, teeth: false, bucktooth: false, pucker: false, smiley: false };
		if (c.mouthType === 'slot') { m.slot = true; }
		else if (c.mouthType === 'pucker') { m.pucker = true; m.segs = 12; }
		else if (c.mouthType === 'smiley') { m.smiley = true; }
		if (c.teethType === 'teeth') { m.teeth = true; m.teethColor = hexToRgb(c.teethColor); m.segs = Math.max(m.segs, 10); }
		else if (c.teethType === 'bucktooth') { m.bucktooth = true; m.bucktoothColor = hexToRgb(c.teethColor); }

		var hair = null;
		if (c.hairStyle !== 'none' && HAIR_PRESETS[c.hairStyle]) {
			hair = HAIR_PRESETS[c.hairStyle](c.hairColor);
		}

		var hat = null;
		if (c.hatType !== 'none') {
			hat = { type: c.hatType, color: c.hatColor, rgb: hexToRgb(c.hatColor) };
			if (c.hatType === 'cowboy') { hat.bandColor = c.hatBandColor; hat.bandRGB = hexToRgb(c.hatBandColor); }
			else if (c.hatType === 'baseballcap') { hat.brimColor = c.hatColor; hat.brimRGB = hexToRgb(c.hatColor); if (c.hatText) hat.text = c.hatText; }
			else if (c.hatType === 'afro') { hat.height=0.62; hat.radiusX=0.68; hat.radiusZ=0.56; hat.rings=8; hat.honeycombSegs=14; hat.fluffiness=0.05; }
		}

		var fh = null;
		if (c.facialHairType !== 'none') {
			fh = { type: c.facialHairType, color: c.facialHairColor, rgb: hexToRgb(c.facialHairColor),
			       width: 1.8, spread: 0.22, droop: 0.06, curl: 0.02 };
		}

		var def = {
			name: c.name || 'Custom Character',
			headShape: c.headShape || null,
			boxDims: c.headShape === 'box' ? deepClone(c.boxDims) : null,
			profile: c.headShape === 'box' ? deepClone(DEFAULT_PROFILES.round) : deepClone(c.profile), ringN: c.ringN,
			eyes: {
				left:  { x: -c.eyeSpacing, y: c.eyeHeight, z: c.headShape==='box' ? c.boxDims.d+0.01 : 0.46, r: c.eyeSize },
				right: { x:  c.eyeSpacing, y: c.eyeHeight, z: c.headShape==='box' ? c.boxDims.d+0.01 : 0.46, r: c.eyeSize }
			},
			eyeShape: c.eyeShape,
			eyeColor: c.eyeColor ? { hex: c.eyeColor, rgb: hexToRgb(c.eyeColor) } : null,
			eyeOutlineColor: c.eyeOutlineColor ? { hex: c.eyeOutlineColor, rgb: hexToRgb(c.eyeOutlineColor) } : null,
			mascara: c.hasMascara,
			eyelashes: c.hasEyelashes ? { count:6,length:c.eyelashLength,color:c.eyelashColor,rgb:hexToRgb(c.eyelashColor),width:1.0,reactive:true,bottom:true } : null,
			eyebrows: c.hasEyebrows ? { color:c.eyebrowColor,rgb:hexToRgb(c.eyebrowColor),width:c.eyebrowWidth,
				innerOff:{dx:0,dy:0.06,dz:0.02}, outerOff:{dx:0.12,dy:0.08,dz:0}, thickness:c.eyebrowThickness } : null,
			mouth: m,
			lipColor: c.lipColor, lipRGB: hexToRgb(c.lipColor),
			nose: c.hasNose ? (c.headShape==='box' ? {
				bridge:[[0,-0.14,c.boxDims.d+0.06],[0,-0.28,c.boxDims.d+0.09],[0,-0.32,c.boxDims.d+0.10]],
				base:[[-0.06,-0.34,c.boxDims.d+0.04],[0,-0.32,c.boxDims.d+0.10],[0.06,-0.34,c.boxDims.d+0.04]]
			} : {
				bridge:[[0,-0.14,0.54],[0,-0.28,0.57],[0,-0.32,0.58]],
				base:[[-0.06,-0.34,0.52],[0,-0.32,0.58],[0.06,-0.34,0.52]]
			}) : null,
			wireColor: c.wireColor, wireRGB: hexToRgb(c.wireColor),
			accentColor: c.accentColor, accentRGB: hexToRgb(c.accentColor),
			hair: hair, hat: hat, facialHair: fh,
			ledIndicators: null, shutter: null, chinGuard: null,
			body: {
				color: c.wireColor, rgb: hexToRgb(c.wireColor),
				skeleton: deepClone(DEFAULT_SKELETON), bones: deepClone(DEFAULT_BONES),
				lineWidth: 1.8, glowWidth: 6, scanSpeed: 0.003, moves: ALL_MOVES.slice(),
				rainbow: c.bodyRainbow,
				clothing: {
					upper:{color:c.clothingUpper,rgb:hexToRgb(c.clothingUpper)},
					skin:{color:c.clothingSkin,rgb:hexToRgb(c.clothingSkin)},
					torso:{color:c.clothingTorso,rgb:hexToRgb(c.clothingTorso)},
					lower:{color:c.clothingLower,rgb:hexToRgb(c.clothingLower)},
					feet:{color:c.clothingFeet,rgb:hexToRgb(c.clothingFeet)}
				}
			}
		};
		if (c.hasSkirt) def.body.skirt = { hemPoints:5, hemY:0.46, hemSpread:0.18, sway:0.03, zone:'lower' };
		return def;
	}

	function generateRandomSkinJSON() {
		var c = randomize(buildDefaultChar());
		c.name = 'Random Skin';
		return JSON.stringify(buildCharDef(c));
	}

	// -- sidecar path (matches webv4 files.ssjs charPathFor) -------
	function charPathFor(filePath) {
		if (/\.[^\\/]+$/.test(filePath)) {
			return filePath.replace(/\.[^\\/]+$/, '.char.json');
		}
		return filePath + '.char.json';
	}

	// -- minimal ID3v2 TPE1 (artist) reader ------------------------
	// Returns the artist text with NULs stripped (handles UTF-16 ASCII), or ''.
	function syncsafe(b0, b1, b2, b3) {
		return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
	}
	function be32(b0, b1, b2, b3) {
		return ((b0 & 0xff) << 24) | ((b1 & 0xff) << 16) | ((b2 & 0xff) << 8) | (b3 & 0xff);
	}
	function readMp3Artist(path) {
		var f = new File(path);
		if (!f.open('rb')) return '';
		var raw;
		try {
			// Read enough to cover a typical ID3 tag header + early frames.
			var header = f.read(10);
			if (!header || header.length < 10 ||
			    header.charCodeAt(0) !== 0x49 || header.charCodeAt(1) !== 0x44 || header.charCodeAt(2) !== 0x33) {
				return ''; // no "ID3" magic
			}
			var major = header.charCodeAt(3);
			var tagSize = syncsafe(header.charCodeAt(6), header.charCodeAt(7), header.charCodeAt(8), header.charCodeAt(9));
			var toRead = Math.min(tagSize, 256 * 1024);
			raw = f.read(toRead) || '';
		} finally {
			f.close();
		}
		if (!raw.length) return '';

		var b = [];
		for (var i = 0; i < raw.length; i++) b.push(raw.charCodeAt(i) & 0xff);

		var off = 0, guard = 0;
		while (off + 10 <= b.length && guard++ < 512) {
			var id = String.fromCharCode(b[off], b[off+1], b[off+2], b[off+3]);
			if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding / end of frames
			var size = (major >= 4)
				? syncsafe(b[off+4], b[off+5], b[off+6], b[off+7])
				: be32(b[off+4], b[off+5], b[off+6], b[off+7]);
			if (size <= 0 || off + 10 + size > b.length + 4) break;
			if (id === 'TPE1') {
				var start = off + 10 + 1; // skip 1-byte encoding marker
				var end = off + 10 + size;
				var s = '';
				for (var j = start; j < end && j < b.length; j++) {
					// skip NULs and UTF-16 BOM bytes so ASCII text comes out clean
					if (b[j] !== 0 && b[j] !== 0xFF && b[j] !== 0xFE) s += String.fromCharCode(b[j]);
				}
				return s.replace(/^\s+|\s+$/g, '');
			}
			off += 10 + size;
		}
		return '';
	}

	return {
		generateRandomSkinJSON: generateRandomSkinJSON,
		readMp3Artist: readMp3Artist,
		charPathFor: charPathFor
	};
})();
