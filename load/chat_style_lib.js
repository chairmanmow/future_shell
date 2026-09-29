/* chat_style_lib.js - one place for how a member's name is styled in chat.
 *
 * Both the terminal shell (fshell_ts, through its runtime seam) and the
 * website (webv4_custom) read and write the same record, so a colour picked
 * on one side shows on the other and on every network we bridge:
 *
 *   data/chat/nickstyle/NNNN.json
 *   { version: 1,
 *     colors: ['#ff0000', '', '#00ff00', ...],   one entry per character of
 *                                                 the alias ('' = default)
 *     tag: { text: 'sysop', fg: '#ffff55', bg: '' } }
 *
 * Colours are truecolor hex. Where a wire or a terminal cannot carry that
 * (MRC pipe codes, a 16-colour terminal) nearestCga() picks the closest of
 * the sixteen CGA colours, so a gradient still reads as one.
 *
 * Usage
 *   load('chat_style_lib.js');            ChatStyle.get(userNumber) ...
 *   var S = load({}, ...).getChatStyle(); (scoped form for the shell runtime)
 */

var ChatStyle = (function () {
	var VERSION = 1;
	var MAX_COLORS = 60;
	var MAX_TAG = 12;
	var dir = system.data_dir + 'chat/nickstyle/';
	var HEX = /^#[0-9a-f]{6}$/;
	var CGA_RGB = [
		[0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
		[170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
		[85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
		[255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]
	];

	function hex(value) {
		var s = String(value === undefined || value === null ? '' : value).replace(/^\s+|\s+$/g, '').toLowerCase();
		if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
		return HEX.test(s) ? s : '';
	}

	function cleanTag(value) {
		return String(value === undefined || value === null ? '' : value)
			.replace(/[^\x20-\x7e]/g, '')   /* printable ASCII only: every wire and terminal can show it */
			.replace(/\|/g, '')              /* never a pipe code */
			.replace(/^\s+|\s+$/g, '')
			.substr(0, MAX_TAG);
	}

	function empty() {
		return { version: VERSION, colors: [], tag: { text: '', fg: '', bg: '' } };
	}

	/* Anything -> a well-formed record. */
	function normalize(raw) {
		var out = empty();
		var src = raw && typeof raw === 'object' ? raw : {};
		var list = Object.prototype.toString.call(src.colors) === '[object Array]' ? src.colors : [];
		var i;
		for (i = 0; i < list.length && i < MAX_COLORS; i++) out.colors.push(hex(list[i]));
		while (out.colors.length && !out.colors[out.colors.length - 1].length) out.colors.pop();
		if (src.tag && typeof src.tag === 'object') {
			out.tag.text = cleanTag(src.tag.text);
			out.tag.fg = hex(src.tag.fg);
			out.tag.bg = hex(src.tag.bg);
		}
		if (!out.tag.text.length) out.tag.fg = out.tag.bg = '';
		return out;
	}

	function isEmpty(style) {
		var i;
		if (!style) return true;
		for (i = 0; i < style.colors.length; i++) if (style.colors[i].length) return false;
		return !style.tag.text.length;
	}

	function userNumber(value) {
		var n = parseInt(value, 10);
		return n > 0 ? n : 0;
	}

	function path(number) {
		return dir + format('%04u', number) + '.json';
	}

	function readJson(file) {
		var f, raw;
		if (!file_exists(file)) return null;
		f = new File(file);
		if (!f.open('r')) return null;
		try { raw = f.read() || ''; } finally { f.close(); }
		try { return JSON.parse(raw); } catch (e) { return null; }
	}

	function writeJson(file, data) {
		var tmp = file + '.tmp' + Math.floor(Math.random() * 1000000000);
		var f;
		if (!file_isdir(dir)) mkpath(dir);
		f = new File(tmp);
		if (!f.open('w+')) return false;
		try { f.write(JSON.stringify(data, null, 1)); } finally { f.close(); }
		if (!file_rename(tmp, file)) { try { file_remove(tmp); } catch (e) { } return false; }
		return true;
	}

	/* The stored record for an account (empty record when none). */
	function get(number) {
		var n = userNumber(number);
		if (!n) return empty();
		return normalize(readJson(path(n)));
	}

	/* Replace the record. `by` must be the owner or a sysop (0 = trusted
	   caller such as the shell running as that user). */
	function set(number, style, by) {
		var n = userNumber(number);
		var editor = userNumber(by);
		var clean;
		if (!n) return { ok: false, reason: 'no-such-user' };
		if (editor && editor !== n && !(typeof user === 'object' && user && user.number === editor && user.is_sysop)) {
			return { ok: false, reason: 'forbidden' };
		}
		clean = normalize(style);
		if (isEmpty(clean)) {
			if (file_exists(path(n))) file_remove(path(n));
			return { ok: true, style: clean };
		}
		if (!writeJson(path(n), clean)) return { ok: false, reason: 'write-failed' };
		return { ok: true, style: clean };
	}

	/* Colours lined up with `name`: one hex ('' = default) per character.
	   Stored colours are per character of the alias; a renamed or longer
	   name keeps what fits and pads with default. */
	function alignColors(colors, name) {
		var out = [];
		var length = String(name || '').length;
		var i;
		for (i = 0; i < length; i++) out.push(colors && i < colors.length ? (colors[i] || '') : '');
		return out;
	}

	/* What every renderer wants: { colors (aligned), tag, styled } */
	function forName(number, name) {
		var style = get(number);
		var colors = alignColors(style.colors, name);
		var styled = false;
		var i;
		for (i = 0; i < colors.length; i++) if (colors[i].length) { styled = true; break; }
		return { colors: colors, tag: style.tag, styled: styled || !!style.tag.text.length };
	}

	/* '#rrggbb' -> { r, g, b } */
	function rgb(value) {
		var h = hex(value);
		if (!h.length) return null;
		return { r: parseInt(h.substr(1, 2), 16), g: parseInt(h.substr(3, 2), 16), b: parseInt(h.substr(5, 2), 16) };
	}

	function toHex(r, g, b) {
		function two(v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }
		return '#' + two(r) + two(g) + two(b);
	}

	/* Closest of the sixteen CGA colours (index 0-15), -1 for default. */
	function nearestCga(value) {
		var c = rgb(value);
		var best = -1, bestDist = -1, i, d, dr, dg, db;
		if (!c) return -1;
		for (i = 0; i < CGA_RGB.length; i++) {
			dr = c.r - CGA_RGB[i][0]; dg = c.g - CGA_RGB[i][1]; db = c.b - CGA_RGB[i][2];
			d = dr * dr + dg * dg + db * db;
			if (bestDist < 0 || d < bestDist) { bestDist = d; best = i; }
		}
		return best;
	}

	function cgaHex(index) {
		var c = CGA_RGB[index & 15];
		return toHex(c[0], c[1], c[2]);
	}

	/* `name` painted with Mystic pipe codes (|00-|15), one code per colour
	   change, nearest CGA per character. `defaultFg` paints the unstyled
	   characters (0-15) so a partly coloured name stays readable. Black is
	   lifted to dark gray: it would vanish on the usual black background. */
	function pipeName(name, colors, defaultFg) {
		var out = '';
		var text = String(name || '');
		var aligned = alignColors(colors, text);
		var current = -1;
		var i, code;
		for (i = 0; i < text.length; i++) {
			code = aligned[i].length ? nearestCga(aligned[i]) : defaultFg;
			if (code === 0) code = 8;
			if (code < 0) code = 7;
			if (code !== current) { out += '|' + (code < 10 ? '0' : '') + code; current = code; }
			out += text.charAt(i);
		}
		return out;
	}

	/* Website colour runs ([{n, c}], c = '#rrggbb' or '') or null when plain. */
	function webRuns(name, colors) {
		var text = String(name || '');
		var aligned = alignColors(colors, text);
		var runs = [];
		var coloured = false;
		var i, c, last;
		if (!text.length) return null;
		for (i = 0; i < text.length; i++) {
			c = aligned[i];
			if (c.length) coloured = true;
			last = runs.length ? runs[runs.length - 1] : null;
			if (last && last.c === c) last.n++;
			else runs.push({ n: 1, c: c });
		}
		return coloured ? runs : null;
	}

	/* Fill helpers the editors share.
	   kind: 'solid' (a), 'gradient' (a -> b), 'rainbow', 'clear' */
	function preset(kind, length, a, b) {
		var out = [];
		var i, t, ca, cb, hue;
		var n = Math.max(0, parseInt(length, 10) || 0);
		if (kind === 'solid') { for (i = 0; i < n; i++) out.push(hex(a)); return out; }
		if (kind === 'gradient') {
			ca = rgb(a); cb = rgb(b);
			if (!ca || !cb) return preset('solid', n, a || b, '');
			for (i = 0; i < n; i++) {
				t = n > 1 ? i / (n - 1) : 0;
				out.push(toHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t));
			}
			return out;
		}
		if (kind === 'rainbow') {
			for (i = 0; i < n; i++) {
				hue = (i / Math.max(1, n)) * 360;
				out.push(hsvHex(hue, 0.85, 1));
			}
			return out;
		}
		for (i = 0; i < n; i++) out.push('');
		return out;
	}

	function hsvHex(h, s, v) {
		var c = v * s;
		var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
		var m = v - c;
		var r = 0, g = 0, b = 0;
		if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
		else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
		return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
	}

	return {
		VERSION: VERSION,
		MAX_TAG: MAX_TAG,
		MAX_COLORS: MAX_COLORS,
		get: get,
		set: set,
		normalize: normalize,
		isEmpty: isEmpty,
		forName: forName,
		alignColors: alignColors,
		nearestCga: nearestCga,
		cgaHex: cgaHex,
		pipeName: pipeName,
		webRuns: webRuns,
		preset: preset,
		hex: hex
	};
}());

/* load(scope, file) callers get the API from this function (a top-level
   function declaration always lands on the load scope); load(file) callers
   use `ChatStyle`. */
function getChatStyle() { return ChatStyle; }
try { if (typeof this === 'object' && this !== null && this.ChatStyle === undefined) this.ChatStyle = ChatStyle; } catch (e) { }

/* load(scope, file) returns the last expression: hand the scope back. */
this;
