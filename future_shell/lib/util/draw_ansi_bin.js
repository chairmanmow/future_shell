// console-only ANSI / BIN / XBIN renderer (clean implementation)
"use strict";
// drawAnsiBin(inputPathOrBase, opts)
// opts: { bases:["answer","logon"], speed:0, pausing:true, forceSimple:false, autowrap:true, debug:false, pause:false, finalPause:false }
function dbg(msg) {
	try { if (typeof dbug === 'function') dbug(msg, 'paint'); } catch (_) { }
}
function drawAnsiBin(input, opts, cb) {
	if (!!cb) try { if (typeof dbug === 'function') dbug('DRAW ANSI BIN HAS CALLBACK', 'paint'); } catch (_) { }
	opts = opts || {};
	var debug = false;
	function dbg(msg) { if (debug) try { if (typeof dbug === 'function') dbug('[drawAnsiBin] ' + msg, 'paint'); } catch (e) { } }

	var bases = opts.bases || [];
	var forceSimple = opts.forceSimple === true;
	var enableAutoWrap = opts.autowrap !== false; // default true
	var explicitPath = false;
	if (input) {
		if (file_exists(input)) { explicitPath = true; dbg('Explicit path: ' + input); }
		else { bases.unshift(input); dbg('Treat input as basename: ' + input); }
	}
	if (!bases.length) bases = ['answer', 'logon', 'welcome'];
	dbg('Bases: ' + bases.join(','));

	// Load libs
	var Sauce, cterm, xbin, Ansi;
	try { Sauce = load({}, 'sauce_lib.js'); } catch (e) { dbg('No sauce_lib.js'); }
	try { cterm = load({}, 'cterm_lib.js'); } catch (e) { dbg('No cterm_lib.js'); }
	try { xbin = load({}, 'xbin_lib.js'); } catch (e) { dbg('No xbin_lib.js'); }
	try { Ansi = load({}, 'ansiterm_lib.js'); } catch (e) { dbg('No ansiterm_lib.js'); }

	var isSyncTerm = false; try { if (cterm && cterm.query_da() !== false) { isSyncTerm = true; dbg('SyncTERM detected'); } } catch (e) { dbg('cterm query failed'); }
	var finalPause = opts.finalPause === true || opts.pause === true; // treat pause as finalPause too
	var iceMode = (opts.iceMode || 'auto').toLowerCase(); // 'auto' | 'on' | 'off'
	var suppressBlink = opts.suppressBlink !== false; // default true: neutralize SGR 5 (blink) when ICE active so SyncTERM doesn't flash
	var earlyIceApplied = false; // track if we enabled ICE before content load
	var hideSauce = opts.hideSauce !== false; // default true: strip SAUCE record & COMNT blocks from displayed text

	var state = { speed: 0, pausing: true, syncTerm: isSyncTerm };
	if (typeof opts.speed === 'number') state.speed = opts.speed;
	if (opts.pausing === false) state.pausing = false;
	var speedMap = [0, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 76800, 115200];
	dbg('State speed=' + state.speed + ' pausing=' + state.pausing + ' syncTerm=' + state.syncTerm);

	function resolve(base) {
		if (base.indexOf('/') > -1 || base.indexOf('\\') > -1) return file_exists(base) ? base : null;
		var exts = ['.ans', '.asc', '.txt', '.bin', '.xb', '.xbin'];
		for (var i = 0; i < exts.length; i++) { var p = system.text_dir + base + exts[i]; if (file_exists(p)) return p; }
		try {
			var dir = directory(system.text_dir + base + '*');
			for (var d = 0; d < dir.length; d++) {
				var low = dir[d].toLowerCase();
				for (var k = 0; k < exts.length; k++) if (low == (system.text_dir + base + exts[k])) return dir[d];
			}
		} catch (e) { }
		return null;
	}

	var target = explicitPath ? input : null;
	if (!target) for (var b = 0; b < bases.length && !target; b++) target = resolve(bases[b]);
	if (!target) { dbg('No target resolved'); return false; }
	dbg('Target: ' + target);

	var ext = (file_getext(target) || '').toLowerCase();
	var sauce = null; if (Sauce) { try { sauce = Sauce.read(target); dbg('SAUCE ok'); } catch (e) { dbg('SAUCE fail ' + e); } }
	// If SyncTERM and SAUCE already declares ice_color and user wants ICE, set it early
	if (isSyncTerm && Ansi && !forceSimple) {
		if (iceMode !== 'off' && sauce && sauce.ice_color) {
			try { Ansi.send('ext_mode', 'set', 'bg_bright_intensity'); earlyIceApplied = true; dbg('Early ICE activation (from SAUCE)'); mswait(40); } catch (e) { dbg('Early ICE activation failed ' + e); }
		}
	}

	var saved_attr = console.attributes, saved_status = bbs.sys_status;
	bbs.sys_status &= (~SS_PAUSEON); bbs.sys_status |= SS_PAUSEOFF;

	var ok = false;
	try {
		if (isSyncTerm && Ansi && !forceSimple) { dbg('Pre-render sync delay'); mswait(60); }
		if (ext == '.bin' || ext == '.xb' || ext == '.xbin') ok = drawBinLike(target, sauce); else ok = drawAnsiLike(target, sauce);
		if (!ok && !explicitPath) {
			for (var r = 0; r < bases.length && !ok; r++) { try { bbs.ansi(bases[r]); ok = true; dbg('bbs.ansi fallback ' + bases[r]); } catch (e) { dbg('bbs.ansi fail ' + bases[r]); } }
		}
		if (finalPause && ok) {
			dbg('Final pause');
			if (cb) cb(true);
		}
	} finally {
		console.attributes = saved_attr;
		bbs.sys_status = saved_status;
		if (cb) { cb(true) };
	}
	return ok;

	function drawAnsiLike(path, sauce) {
		var enforceWidth = false, artCols = 0;
		if (sauce && sauce.cols && console.screen_columns > sauce.cols) { enforceWidth = true; artCols = sauce.cols; dbg('Enforce width ' + artCols); }
		var cached = null;
		var iceActive = false; // whether we will enable bg_bright_intensity
		function normalizeCRLF(txt) { var out = '', prev = ''; for (var i = 0; i < txt.length; i++) { var c = txt.charAt(i); if (c == '\n' && prev != '\r') out += '\r'; out += c; prev = c; } return out; }
		function detectIce(txt) {
			if (iceMode === 'off') return false;
			if (iceMode === 'on') return true;
			// auto: if SAUCE says so or blink attribute heavily used
			if (sauce && sauce.ice_color) return true;
			var m = txt.match(/\x1b\[[0-9;]*5m/g); // blink SGR occurrences
			if (!m) return false;
			// heuristic: if more than 2 blink codes or >1% of lines contain blink
			if (m.length >= 3) return true;
			// second heuristic: look for any 5m followed immediately by background color (4x) numbers
			return /\x1b\[[0-9;]*5;?4[0-7]/.test(txt);
		}
		function stripBlinkIfNeeded(txt) {
			// Replace any SGR containing 5 (blink) with same list minus 5 plus 25 (blink off)
			// Handles variants like ESC[5m, ESC[1;5;32m, ESC[32;5m etc.
			return txt.replace(/\x1b\[([0-9;]*?)m/g, function (full, codes) {
				if (codes.indexOf('5') === -1) return full; // no blink
				var parts = codes.split(';').filter(function (p) { return p !== '' && p !== '5'; });
				if (parts.indexOf('25') === -1) parts.push('25');
				return '\x1b[' + parts.join(';') + 'm';
			});
		}
		function loadContent() {
			if (cached === null) {
				cached = normalizeCRLF(readFileAll(path));
				if (hideSauce) {
					// Strip trailing SAUCE (128 bytes) and optional COMNT blocks referenced in that record.
					// Simple heuristic: look for SAUCE00 near EOF (last 512 bytes) and truncate at its starting offset.
					var tailWindow = cached.slice(-512);
					var saucePos = tailWindow.lastIndexOf('SAUCE00');
					if (saucePos > -1) {
						var globalPos = cached.length - 512 + saucePos;
						if (globalPos >= 0) {
							var originalLen = cached.length;
							cached = cached.substring(0, globalPos); // drop SAUCE and anything after
							dbg('Stripped SAUCE metadata bytes=' + (originalLen - cached.length));
						}
					}
				}
				iceActive = detectIce(cached);
				if (iceActive && suppressBlink) {
					var beforeLen = cached.length;
					cached = stripBlinkIfNeeded(cached);
					if (beforeLen !== cached.length) dbg('Blink sequences neutralized for ICE mode');
				}
				if (enforceWidth) cached = cursorWidthTransform(cached, artCols);
				dbg('iceActive=' + iceActive + ' (mode=' + iceMode + ') enforceWidth=' + (enforceWidth ? artCols : false));
			}
			return cached;
		}
		if (state.syncTerm && Ansi && !forceSimple) {
			try {
				if (enableAutoWrap) console.print('\x1b[?7h');
				Ansi.send('ext_mode', 'clear', 'cursor'); // hide cursor first
				// Pre-load to know if we need ICE bright backgrounds before setting speed (ordering can matter)
				var data = loadContent();
				if (iceActive && !earlyIceApplied) { dbg('Late ICE activation (heuristic/auto)'); try { Ansi.send('ext_mode', 'set', 'bg_bright_intensity'); mswait(40); earlyIceApplied = true; } catch (e) { dbg('Late ICE activation failed ' + e); } }
				// Use internal SyncTERM speed emulation only if requested (speed>0)
				if (state.speed > 0 && state.speed < speedMap.length) {
					try { Ansi.send('speed', 'set', state.speed); } catch (_) { }
				} else {
					try { Ansi.send('speed', 'set', 0); } catch (_) { }
				}
				console.gotoxy(1, 1);
				console.putmsg(data);
				// Ensure final attribute reset so subsequent shell output isn't stuck in last colors
				console.print('\x1b[0m');
			} catch (e) { dbg('SyncTERM branch error ' + e); return false; }
			finally {
				// Clear extended modes we enabled
				if (earlyIceApplied) { try { Ansi.send('ext_mode', 'clear', 'bg_bright_intensity'); dbg('Cleared bg_bright_intensity'); } catch (_) { } }
				try { Ansi.send('ext_mode', 'set', 'cursor'); } catch (_) { }
				try { Ansi.send('speed', 'clear'); } catch (_) { }
				// Disable autowrap if we turned it on explicitly (leave terminal predictable) optional
				if (enableAutoWrap) console.print('\x1b[?7l');
			}
			return true;
		}
		if (state.speed > 0 && state.speed < speedMap.length) return throttled(loadContent());
		console.gotoxy(1, 1); try { console.putmsg(loadContent()); return true; } catch (e) { dbg('putmsg failed ' + e); return false; }
	}

	function throttled(data) {
		var bytesPerTick = Math.max(1, Math.ceil((speedMap[state.speed] / 8) / 1000));
		if (!state.pausing) { bbs.sys_status &= (~SS_PAUSEON); bbs.sys_status |= SS_PAUSEOFF; }
		while (data.length) { console.print(data.substr(0, bytesPerTick)); data = data.substr(bytesPerTick); if (console.inkey(K_NONE, 1) !== '') break; }
		if (!state.pausing) { bbs.sys_status |= SS_PAUSEON; bbs.sys_status &= (~SS_PAUSEOFF); }
		return true;
	}

	function drawBinLike(path, sauce) { if (!cterm) return false; var is_xbin = /\.xb(in)?$/i.test(path); var f = new File(path); if (!f.open('rb')) return false; var image; try { if (is_xbin && xbin) image = xbin.read(f); else { if (!sauce || !sauce.cols || !sauce.rows) { f.close(); return false; } image = { width: sauce.cols, height: sauce.rows, flags: 0 }; if (sauce.ice_color && xbin) image.flags |= xbin.FLAG_NONBLINK; image.bin = f.read(image.width * image.height * 2); } } catch (e) { f.close(); return false; } f.close(); try { cterm.xbin_draw(image); } catch (e) { return false; } finally { try { cterm.xbin_cleanup(image); } catch (_) { } } return true; }

	function readFileAll(path) { var f = new File(path); if (!f.open('rb')) return ''; var d = f.read(f.length); f.close(); return d || ''; }

	function cursorWidthTransform(content, width) {
		if (width <= 0) return content;
		var ESC = '\x1b';
		var i = 0, len = content.length, out = '', col = 0;
		var activeAttrs = []; // track current SGR parameters for restoration
		function handleSGR(params) {
			if (params === '') { activeAttrs = []; return; }
			var list = params.split(';').filter(function (p) { return p !== ''; });
			// If 0 present, reset all following
			if (list.indexOf('0') !== -1) { activeAttrs = []; }
			// Build new attribute state (simple approach: keep last comprehensive set)
			// Remove 0 and duplicate 25 (blink off) etc.
			list = list.filter(function (p) { return p !== '0'; });
			if (list.length) activeAttrs = list; else if (list.length === 0) activeAttrs = [];
		}
		function sgrSeq() { return activeAttrs.length ? '\x1b[' + activeAttrs.join(';') + 'm' : ''; }
		while (i < len) {
			var ch = content.charAt(i);
			if (ch === ESC) {
				var seq = ch; i++;
				if (i < len && content.charAt(i) == '[') {
					seq += '['; i++;
					var param = '';
					while (i < len) { var c = content.charAt(i); seq += c; i++; if (c >= '@' && c <= '~') break; }
					var fin = seq.charAt(seq.length - 1);
					if (fin === 'm') { // SGR
						var m = seq.match(/\[([0-9;]*)m/); if (m) handleSGR(m[1]);
					} else if (fin === 'H' || fin === 'f') { var mm = seq.match(/\[(\d*);(\d*)[Hf]/); if (mm) { col = (parseInt(mm[2], 10) || 1) - 1; } else col = 0; }
					else if (fin === 'G') { var m2 = seq.match(/\[(\d*)G/); col = ((m2 && parseInt(m2[1], 10)) || 1) - 1; }
					else if (fin === 'C') { var m3 = seq.match(/\[(\d*)C/); col += (parseInt(m3 && m3[1], 10) || 1); }
					else if (fin === 'D') { var m4 = seq.match(/\[(\d*)D/); col = Math.max(0, col - (parseInt(m4 && m4[1], 10) || 1)); }
				}
				else if (i < len) { seq += content.charAt(i); i++; }
				out += seq; continue;
			}
			if (ch === '\r') { out += ch; col = 0; i++; continue; }
			if (ch === '\n') { out += ch; col = 0; i++; continue; }
			out += ch; col++; i++;
			if (col >= width) {
				// Clear any trailing background attributes by resetting, then restore for next line
				if (activeAttrs.length) { out += '\x1b[0m'; }
				out += '\r\n';
				if (activeAttrs.length) { out += sgrSeq(); }
				col = 0;
			}
		}
		return out;
	}
}
