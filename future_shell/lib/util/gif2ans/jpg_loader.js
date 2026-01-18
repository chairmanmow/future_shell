// jpg_loader.js — resilient SOF0/SOF2 JPEG decoder for Synchronet JS
"use strict";
// Bakes in: robust entropy marker handling, bounded resync, table fallbacks,
// mid-stream DHT/DQT, MCU-ordered non-interleaved scans, EXIF/APP14.
// Export: JPGLoaderFactory() -> { decode(bytes), looksJPG(bytes), inspect(bytes) }

function JPGLoaderFactory() {

    /* -------------------- CONFIG/DEBUG -------------------- */
    var DEBUG = false;                 // set false to quiet
    var RESILIENT = true;             // enable bounded resync + soft fallbacks
    var RESYNC_MAX_SHIFT = 7;         // try up to N bit drops when desynced
    var stats = { huffResync: 0, huffSoftDC: 0, huffSoftAC: 0 };

    function dbg() {
        if (!DEBUG) return;
        var s = "[jpg] " + Array.prototype.slice.call(arguments).join(" ");
        try { log(s); } catch (e) { try { print(s); } catch (_) { } }
    }

    /* -------------------- BITSTREAM ---------------------- */
    function BS(b) {
        this.b = b; this.p = 0; this.v = 0; this.n = 0; this.len = b.length; this.peekedMarker = null;
    }
    BS.prototype.marker = function () {
        var c;
        // find 0xFF
        do { c = this.u8(); } while (c !== 0xFF);
        // skip fill 0xFF bytes
        do { c = this.u8(); } while (c === 0xFF);
        // return the marker code byte (e.g. 0xC0, 0xDA, 0xD9, etc.)
        return c;
    };
    BS.prototype.u8 = function () { if (this.p >= this.len) throw "JPG truncated"; return this.b.charCodeAt(this.p++) & 255; };
    BS.prototype.u16 = function () { return (this.u8() << 8) | this.u8(); };
    BS.prototype.snap = function () { return { p: this.p, v: this.v, n: this.n, m: this.peekedMarker }; };
    BS.prototype.restore = function (s) { this.p = s.p; this.v = s.v; this.n = s.n; this.peekedMarker = s.m; };
    BS.prototype.u8bit = function () {
        if (this.n === 0) {
            var b = this.u8();
            if (b === 0xFF) {
                var n = this.u8();
                if (n === 0x00) {
                    // stuffed FF00 -> treat as data 0xFF then continue
                } else if (n === 0xFF) {
                    // fill bytes; keep eating FFs
                    do { n = this.u8(); } while (n === 0xFF);
                    if (n !== 0x00) { this.peekedMarker = n; throw "__MARKER__"; }
                } else {
                    // real marker encountered inside entropy
                    this.peekedMarker = n; throw "__MARKER__";
                }
            }
            this.v = b; this.n = 8;
        }
        var bit = (this.v >> 7) & 1; this.v <<= 1; this.n--; return bit;
    };
    function findNextMarker(bs) {
        bs.n = 0;
        while (true) {
            var b;
            do { b = bs.u8(); } while (b !== 0xFF);
            do { b = bs.u8(); } while (b === 0xFF);
            if (b === 0x00) continue;   // stuffed
            return b;                   // real marker code
        }
    }
    function nextMarker(bs) {
        if (bs.peekedMarker !== null) {
            var m = bs.peekedMarker; bs.peekedMarker = null; bs.n = 0; return m;
        }
        return findNextMarker(bs);
    }

    /* ------------------ HUFFMAN TABLE ------------------- */
    function HTable(codeLengths) {
        var maxLen = 0, i; for (i = 0; i < codeLengths.length; i++) if (codeLengths[i] > maxLen) maxLen = codeLengths[i];
        var bl_count = new Array(maxLen + 1); for (i = 0; i <= maxLen; i++) bl_count[i] = 0;
        for (i = 0; i < codeLengths.length; i++) if (codeLengths[i]) bl_count[codeLengths[i]]++;
        var code = 0, next = new Array(maxLen + 1); bl_count[0] = 0;
        for (i = 1; i <= maxLen; i++) { code = (code + bl_count[i - 1]) << 1; next[i] = code; }
        this.map = {}; this.max = maxLen;
        for (var sym = 0; sym < codeLengths.length; sym++) {
            var len = codeLengths[sym]; if (!len) continue;
            var c = next[len]++; this.map[(len << 16) | c] = sym;
        }
    }
    HTable.prototype.decode = function (bs, ctx) {
        try {
            var code = 0;
            for (var len = 1; len <= this.max; len++) {
                code = (code << 1) | bs.u8bit();
                var key = (len << 16) | code;
                if (this.map[key] !== undefined) return this.map[key];
            }
            if (!RESILIENT) throw "Huff decode hardfail";
            // bounded resync: try skipping 1..N bits
            var snap = bs.snap();
            for (var drop = 1; drop <= RESYNC_MAX_SHIFT; drop++) {
                try {
                    bs.restore(snap);
                    for (var i = 0; i < drop; i++) bs.u8bit();
                    var code2 = 0;
                    for (var len2 = 1; len2 <= this.max; len2++) {
                        code2 = (code2 << 1) | bs.u8bit();
                        var key2 = (len2 << 16) | code2;
                        if (this.map[key2] !== undefined) { stats.huffResync++; return this.map[key2]; }
                    }
                } catch (e) { if (e === "__MARKER__") throw e; /* keep trying */ }
            }
            throw "Huff decode fail";
        } catch (e) {
            if (e === "__MARKER__") throw e;
            // enrich & throw up; call-sites may soft-fallback
            var where = ctx ? (" scan(Ss=" + ctx.Ss + ",Se=" + ctx.Se + ",Ah=" + ctx.Ah + ",Al=" + ctx.Al + ")"
                + " compId=" + ctx.compId + " MCU=(" + ctx.mx + "," + ctx.my + ") hv=(" + ctx.h + "," + ctx.v + ")"
                + " k=" + (ctx.k === undefined ? "-" : ctx.k)) : "";
            throw "Huff decode fail " + where;
        }
    };

    function makeEOBOnlyACTable() {
        var lens = new Array(256); for (var i = 0; i < 256; i++) lens[i] = 0;
        lens[0x00] = 1; return new HTable(lens);
    }
    function makeZeroDCTable() {
        var lens = new Array(256); for (var i = 0; i < 256; i++) lens[i] = 0;
        lens[0x00] = 1; return new HTable(lens);
    }

    /* ------------------- IDCT/UTIL --------------------- */
    var zig = [0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53, 10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63];

    function idct8x8(src, dst, off) {
        var t = new Int32Array(64);
        for (var i = 0; i < 8; i++) {
            var p0 = src[i * 8 + 0], p1 = src[i * 8 + 1], p2 = src[i * 8 + 2], p3 = src[i * 8 + 3], p4 = src[i * 8 + 4], p5 = src[i * 8 + 5], p6 = src[i * 8 + 6], p7 = src[i * 8 + 7];
            var z1 = (p2 + p6) * 4433, tmp2 = z1 - p6 * 15137, tmp3 = z1 + p2 * 6270;
            var tmp0 = (p0 + p4) << 13, tmp1 = (p0 - p4) << 13;
            var tmp10 = tmp0 + tmp3, tmp13 = tmp0 - tmp3, tmp11 = tmp1 + tmp2, tmp12 = tmp1 - tmp2;
            var z0 = p7 + p1, z2 = p7 + p3, z3 = p5 + p1, z1b = p5 + p3, z4 = (z2 + z3) * 9633;
            p7 *= 2446; p5 *= 16819; p3 *= 25172; p1 *= 12299; z2 *= -7373; z3 *= -20995; z0 *= -16069; z1b *= -3196;
            var z5 = z4 + z1b + z3, z6 = z4 + z0 + z2;
            t[i * 8 + 0] = (tmp10 + z5 + 1024) >> 11; t[i * 8 + 7] = (tmp10 - z5 + 1024) >> 11;
            t[i * 8 + 1] = (tmp11 + z6 + 1024) >> 11; t[i * 8 + 6] = (tmp11 - z6 + 1024) >> 11;
            t[i * 8 + 2] = (tmp12 + (z4 + z0 + z3) + 1024) >> 11; t[i * 8 + 5] = (tmp12 - (z4 + z0 + z3) + 1024) >> 11;
            t[i * 8 + 3] = (tmp13 + (z4 + z1b + z2) + 1024) >> 11; t[i * 8 + 4] = (tmp13 - (z4 + z1b + z2) + 1024) >> 11;
        }
        for (var i2 = 0; i2 < 8; i2++) {
            var p0 = t[0 * 8 + i2], p1 = t[1 * 8 + i2], p2 = t[2 * 8 + i2], p3 = t[3 * 8 + i2], p4 = t[4 * 8 + i2], p5 = t[5 * 8 + i2], p6 = t[6 * 8 + i2], p7 = t[7 * 8 + i2];
            var z1 = (p2 + p6) * 4433, tmp2 = z1 - p6 * 15137, tmp3 = z1 + p2 * 6270;
            var tmp0 = (p0 + p4) << 13, tmp1 = (p0 - p4) << 13;
            var tmp10 = tmp0 + tmp3, tmp13 = tmp0 - tmp3, tmp11 = tmp1 + tmp2, tmp12 = tmp1 - tmp2;
            var z0 = p7 + p1, z2 = p7 + p3, z3 = p5 + p1, z1b = p5 + p3, z4 = (z2 + z3) * 9633;
            p7 *= 2446; p5 *= 16819; p3 *= 25172; p1 *= 12299; z2 *= -7373; z3 *= -20995; z0 *= -16069; z1b *= -3196;
            var z5 = z4 + z1b + z3, z6 = z4 + z0 + z2;
            var d0 = (tmp10 + z5 + 8192) >> 14, d7 = (tmp10 - z5 + 8192) >> 14;
            var d1 = (tmp11 + z6 + 8192) >> 14, d6 = (tmp11 - z6 + 8192) >> 14;
            var d2 = (tmp12 + (z4 + z0 + z3) + 8192) >> 14, d5 = (tmp12 - (z4 + z0 + z3) + 8192) >> 14;
            var d3 = (tmp13 + (z4 + z1b + z2) + 8192) >> 14, d4 = (tmp13 - (z4 + z1b + z2) + 8192) >> 14;
            dst[off + 0 * 8 + i2] = d0; dst[off + 7 * 8 + i2] = d7; dst[off + 1 * 8 + i2] = d1; dst[off + 6 * 8 + i2] = d6;
            dst[off + 2 * 8 + i2] = d2; dst[off + 5 * 8 + i2] = d5; dst[off + 3 * 8 + i2] = d3; dst[off + 4 * 8 + i2] = d4;
        }
    }
    function clamp8(v) { return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }

    /* -------------------- STATE ------------------------- */
    function JPGState() {
        this.DQT = []; this.DHT_dc = []; this.DHT_ac = [];
        this.width = 0; this.height = 0; this.comps = []; this.Hmax = 0; this.Vmax = 0;
        this.restartInterval = 0; this.progressive = false;
        this.exif_orient = 1; this.adobe_transform = 0;
    }

    /* --------------- APP1/APP14 PARSERS ---------------- */
    function parseAPP1Exif(bs, len, st) {
        var end = bs.p + (len - 2);
        if (bs.u8() !== 0x45 || bs.u8() !== 0x78 || bs.u8() !== 0x69 || bs.u8() !== 0x66 || bs.u8() !== 0x00 || bs.u8() !== 0x00) { bs.p = end; return; }
        var t0 = bs.u8(), t1 = bs.u8(); var le = (t0 === 0x49 && t1 === 0x49);
        function u16() { var a = bs.u8(), b = bs.u8(); return le ? (a | (b << 8)) : ((a << 8) | b); }
        function u32() { var a = bs.u8(), b = bs.u8(), c = bs.u8(), d = bs.u8(); return le ? (a | (b << 8) | (c << 16) | (d << 24)) : ((a << 24) | (b << 16) | (c << 8) | d); }
        if (u16() !== 0x2A) { bs.p = end; return; }
        var ifdOff = u32(), base = bs.p - 4;
        function seek(off) { bs.p = base + off; }
        function readIFD(off) {
            if (!off) return;
            seek(off);
            var n = u16();
            for (var i = 0; i < n; i++) {
                var tag = u16(), type = u16(), count = u32(), valOff = u32();
                if (tag === 0x0112) {
                    var orient = 1;
                    if (type === 3 && count === 1) orient = valOff & 0xFFFF;
                    else { var save = bs.p; seek(valOff); if (type === 3) orient = u16(); bs.p = save; }
                    st.exif_orient = orient;
                }
            }
            var next = u32(); if (next) readIFD(next);
        }
        readIFD(ifdOff);
        bs.p = end;
    }
    function parseAPP14Adobe(bs, len, st) {
        var end = bs.p + (len - 2);
        if (bs.u8() === 0x41 && bs.u8() === 0x64 && bs.u8() === 0x6F && bs.u8() === 0x62 && bs.u8() === 0x65 && bs.u8() === 0x00) {
            bs.u16(); bs.u16(); bs.u16();
            st.adobe_transform = bs.u8(); // 0=Unknown/CMYK, 1=YCbCr, 2=YCCK
        }
        bs.p = end;
    }

    /* ---------------- MARKER READERS ------------------- */
    function readDQT(bs, len, st) {
        var end = bs.p + (len - 2);
        while (bs.p < end) {
            var pqTq = bs.u8(), pq = pqTq >> 4, tq = pqTq & 15;
            if (pq !== 0) throw "Only 8-bit quant supported";
            var q = new Int32Array(64);
            for (var i = 0; i < 64; i++) q[zig[i]] = bs.u8();
            st.DQT[tq] = q;
            for (var ci = 0; ci < st.comps.length; ci++) {
                if (st.comps[ci].tq === tq) st.comps[ci].q = q;
            }
        }
    }
    function readDHT(bs, len, st) {
        var end = bs.p + (len - 2);
        while (bs.p < end) {
            var tcTh = bs.u8(), tc = (tcTh >> 4) & 15, th = tcTh & 15;
            var counts = new Array(16), total = 0;
            for (var i = 0; i < 16; i++) { counts[i] = bs.u8(); total += counts[i]; }
            var symbols = new Array(total);
            for (i = 0; i < total; i++) symbols[i] = bs.u8();
            var maxSym = 256, lens = new Array(maxSym);
            for (i = 0; i < maxSym; i++) lens[i] = 0;
            var idx = 0;
            for (var L = 1; L <= 16; L++) for (var n = 0; n < counts[L - 1]; n++) { var sym = symbols[idx++]; lens[sym] = L; }
            var ht = new HTable(lens);
            if (tc === 0) st.DHT_dc[th] = ht; else st.DHT_ac[th] = ht;
            dbg("DHT", (tc === 0 ? "DC" : "AC"), "id=" + th, "maxLen=" + ht.max, "codes=" + total);
        }
    }
    function readSOF(bs, len, st, progressive) {
        var precision = bs.u8(); if (precision !== 8) throw "Only 8-bit JPEG supported";
        st.height = bs.u16(); st.width = bs.u16();
        var Nf = bs.u8(); st.comps = []; st.Hmax = 0; st.Vmax = 0;
        for (var i = 0; i < Nf; i++) {
            var id = bs.u8(), hv = bs.u8(), h = (hv >> 4) & 15, v = hv & 15, tq = bs.u8();
            var c = { id: id, h: h, v: v, tq: tq, q: null }; st.comps.push(c);
            if (h > st.Hmax) st.Hmax = h; if (v > st.Vmax) st.Vmax = v;
        }
        for (i = 0; i < st.comps.length; i++) st.comps[i].q = st.DQT[st.comps[i].tq];
        st.progressive = !!progressive;
    }
    function readDRI(bs, len, st) { st.restartInterval = bs.u16(); }
    function readSOS(bs, len, st) {
        var Ns = bs.u8(), comps = [];
        for (var i = 0; i < Ns; i++) {
            var cs = bs.u8(), tdta = bs.u8(), td = (tdta >> 4) & 15, ta = tdta & 15;
            comps.push({ cs: cs, td: td, ta: ta });
        }
        var Ss = bs.u8(), Se = bs.u8(), AhAl = bs.u8(), Ah = (AhAl >> 4) & 15, Al = AhAl & 15;
        var scan = [];
        for (var j = 0; j < comps.length; j++) {
            scan.push({ cs: comps[j].cs, td: comps[j].td, ta: comps[j].ta });
        }
        return { scan: scan, Ss: Ss, Se: Se, Ah: Ah, Al: Al };
    }

    /* ------------------- INSPECTOR --------------------- */
    function inspectJPEG(bytes) {
        var bs = new (function B(b) { this.b = b; this.p = 0; this.u8 = function () { return this.b.charCodeAt(this.p++) & 255 }; this.u16 = function () { return (this.u8() << 8) | this.u8() }; this.marker = function () { var c; do { c = this.u8() } while (c !== 0xFF); do { c = this.u8() } while (c === 0xFF); return c }; })(bytes);
        if (bs.u8() !== 0xFF || bs.u8() !== 0xD8) throw "Not a JPEG";
        var width = 0, height = 0, progressive = false;
        while (true) {
            var m = bs.marker();
            if (m === 0xC0) { var l = bs.u16(); bs.u8(); height = bs.u16(); width = bs.u16(); bs.p += l - 2 - 1 - 2 - 2; }
            else if (m === 0xC2) { var l2 = bs.u16(); bs.u8(); height = bs.u16(); width = bs.u16(); bs.p += l2 - 2 - 1 - 2 - 2; progressive = true; }
            else if (m === 0xDA || m === 0xD9) break;
            else { var l3 = bs.u16(); bs.p += l3 - 2; }
        }
        return { width: width, height: height, progressive: progressive };
    }

    /* ------------------- DECODE ------------------------ */
    function decodeJPEG(bytes) {
        var bs = new BS(bytes), st = new JPGState();
        if (bs.u8() !== 0xFF || bs.u8() !== 0xD8) throw "Not a JPEG";

        var scans = [];
        // header phase
        while (true) {
            var m = bs.marker();
            if (m === 0xDA) { var l = bs.u16(); scans.push(readSOS(bs, l, st)); break; }
            else if (m === 0xC0) { var l0 = bs.u16(); readSOF(bs, l0, st, false); }
            else if (m === 0xC2) { var l2 = bs.u16(); readSOF(bs, l2, st, true); }
            else if (m === 0xDB) { var ldb = bs.u16(); readDQT(bs, ldb, st); }
            else if (m === 0xC4) { var l4 = bs.u16(); readDHT(bs, l4, st); }
            else if (m === 0xDD) { var ldd = bs.u16(); readDRI(bs, ldd, st); }
            else if (m === 0xE1) { var le1 = bs.u16(); parseAPP1Exif(bs, le1, st); }
            else if (m === 0xEE) { var lee = bs.u16(); parseAPP14Adobe(bs, lee, st); }
            else if (m === 0xD9) { break; }
            else { var lx = bs.u16(); bs.p += lx - 2; }
        }
        if (!st.width || !st.height) throw "Bad JPEG: missing dimensions";
        dbg("inspect", "w=" + st.width, "h=" + st.height, "progressive=" + st.progressive, "DRI=" + (st.restartInterval || 0));

        var Hmax = st.Hmax, Vmax = st.Vmax;
        var mcuCols = Math.ceil(st.width / (8 * Hmax)), mcuRows = Math.ceil(st.height / (8 * Vmax));

        var compIndexById = {}, blocksPerComp = [], i;
        for (i = 0; i < st.comps.length; i++) {
            var c = st.comps[i];
            compIndexById[c.id] = i;
            // Derive block grid from MCU geometry so padding-driven blocks stay addressable.
            var blocksAcross = mcuCols * c.h;
            var blocksDown = mcuRows * c.v;
            blocksPerComp[i] = {
                bw: blocksAcross,
                bh: blocksDown,
                stride: blocksAcross,
                count: blocksAcross * blocksDown
            };
        }

        var coeffs = []; for (i = 0; i < st.comps.length; i++) coeffs[i] = new Int32Array(blocksPerComp[i].count * 64);
        var dcPred = {}; for (i = 0; i < st.comps.length; i++) dcPred[st.comps[i].id] = 0;
        var eobrun = 0;
        function rstReset() { for (var id in dcPred) dcPred[id] = 0; eobrun = 0; }
        function rstSync() { bs.n = 0; var ff = bs.u8(); var mk = bs.u8(); if (ff !== 0xFF || mk < 0xD0 || mk > 0xD7) throw "RST sync fail"; }
        var rstCountdown = st.restartInterval || 0;

        function receive(s) { var v = 0; while (s--) v = (v << 1) | bs.u8bit(); return v; }
        function receiveExt(s) { var v = receive(s); if (s && (v >> (s - 1)) === 0) v -= (1 << s) - 1; return v; }
        function blockNumber(ci, mx, my, hx, vy) {
            var comp = st.comps[ci];
            var stride = blocksPerComp[ci].stride;
            var row = (my * comp.v) + vy;
            return row * stride + (mx * comp.h + hx);
        }

        /* --------- Baseline (single scan) ---------- */
        function decodeBaselineScan(scan) {
            bs.n = 0;
            var compsInScan = [];
            for (var k = 0; k < scan.scan.length; k++) {
                var cs = scan.scan[k].cs;
                var ci = compIndexById[cs];
                if (ci == null || ci < 0) throw "SOS references unknown component";
                compsInScan.push({
                    id: cs,
                    ci: ci,
                    H: st.comps[ci].h,
                    V: st.comps[ci].v,
                    td: scan.scan[k].td,
                    ta: scan.scan[k].ta
                });
            }

            function getDC(entry) {
                var ht = st.DHT_dc[entry.td];
                if (!ht) { ht = st.DHT_dc[0] || st.DHT_dc[1] || makeZeroDCTable(); }
                return ht;
            }
            function getAC(entry) {
                var ht = st.DHT_ac[entry.ta];
                if (!ht) { ht = st.DHT_ac[entry.ta ^ 1] || st.DHT_ac[0] || makeEOBOnlyACTable(); }
                return ht;
            }

            function handleMarkerDuringBaseline() {
                var mk = nextMarker(bs);
                if (mk >= 0xD0 && mk <= 0xD7) {
                    rstReset();
                    bs.n = 0;
                    return 'restart';
                }
                if (mk === 0xD9) return 'eoi';
                if (mk === 0xDA) return 'sos';
                if (mk === 0xDD) { var len = bs.u16(); bs.p += len - 2; return 'skip'; }
                if (mk === 0xDB) { var ldb = bs.u16(); readDQT(bs, ldb, st); return 'skip'; }
                if (mk === 0xC4) { var lc4 = bs.u16(); readDHT(bs, lc4, st); return 'skip'; }
                if (mk === 0xE1) { var le1 = bs.u16(); parseAPP1Exif(bs, le1, st); return 'skip'; }
                if (mk === 0xEE) { var lee = bs.u16(); parseAPP14Adobe(bs, lee, st); return 'skip'; }
                var len = bs.u16(); bs.p += len - 2; return 'skip';
            }

            var rstInt = st.restartInterval | 0;
            var rstCount = rstInt ? rstInt : 0;
            var totalMCU = mcuRows * mcuCols;

            function readHuff(ht, ctx) {
                return ht.decode(bs, ctx);
            }

            function decodeBlock(entry, mx, my, hx, vy) {
                var ci = entry.ci;
                var comp = st.comps[ci];
                var coeff = coeffs[ci];
                var off = blockNumber(ci, mx, my, hx, vy) * 64;
                for (var i = 0; i < 64; i++) coeff[off + i] = 0;

                var ctx = { Ss: 0, Se: 0, Ah: 0, Al: 0, compId: entry.id, mx: mx, my: my, h: entry.H, v: entry.V, k: 0 };
                var s, diff = 0;
                while (true) {
                    try {
                        s = readHuff(getDC(entry), ctx);
                        diff = (s === 0) ? 0 : receiveExt(s);
                        break;
                    } catch (e) {
                        if (e === '__MARKER__') {
                            var action = handleMarkerDuringBaseline();
                            if (action === 'restart') return 'restart';
                            if (action === 'eoi' || action === 'sos') return action;
                            continue;
                        }
                        stats.huffSoftDC++; diff = 0; break;
                    }
                }
                dcPred[entry.id] += diff;
                coeff[off] = dcPred[entry.id];

                var k = 1;
                while (k < 64) {
                    ctx.k = k;
                    var rs;
                    try {
                        rs = readHuff(getAC(entry), ctx);
                    } catch (e) {
                        if (e === '__MARKER__') {
                            var action2 = handleMarkerDuringBaseline();
                            if (action2 === 'restart') return 'restart';
                            if (action2 === 'eoi' || action2 === 'sos') return action2;
                            continue;
                        }
                        stats.huffSoftAC++;
                        break;
                    }
                    if (rs === 0) break;
                    if (rs === 0xF0) { k += 16; continue; }
                    var r = rs >> 4;
                    var sz = rs & 15;
                    k += r;
                    if (k >= 64) break;
                    coeff[off + zig[k]] = receiveExt(sz);
                    k++;
                }

                var q = comp.q;
                if (!q) throw "Quant table missing for comp id=" + entry.id;
                for (var ii = 0; ii < 64; ii++) coeff[off + ii] *= q[ii];
                return 'ok';
            }

            var mcu = 0;
            MCU_LOOP: while (mcu < totalMCU) {
                if (rstInt) {
                    if (rstCount === 0 && mcu !== 0) {
                        bs.n = 0;
                        var mk = nextMarker(bs);
                        if (mk < 0xD0 || mk > 0xD7) throw "Missing restart marker";
                        rstReset();
                        rstCount = rstInt;
                    }
                    rstCount--;
                }

                var mx = mcu % mcuCols;
                var my = (mcu / mcuCols) | 0;

                for (var ssi = 0; ssi < compsInScan.length; ssi++) {
                    var entry = compsInScan[ssi];
                    for (var vy = 0; vy < entry.V; vy++) {
                        for (var hx = 0; hx < entry.H; hx++) {
                            var res = decodeBlock(entry, mx, my, hx, vy);
                            if (res === 'restart') {
                                if (rstInt) rstCount = rstInt;
                                continue MCU_LOOP;
                            }
                            if (res === 'eoi' || res === 'sos') {
                                bs.n = 0;
                                return res;
                            }
                        }
                    }
                }

                mcu++;
            }
            bs.n = 0;
            return 'ok';
        }
        /* --------- Progressive scans (all cases) ---- */
        function decodeProgressiveScan(scan) {
            var Ss = scan.Ss, Se = scan.Se, Ah = scan.Ah, Al = scan.Al;
            bs.n = 0;
            dbg("scan begin", "Ss=" + Ss, "Se=" + Se, "Ah=" + Ah, "Al=" + Al, "rstInt=" + (st.restartInterval || 0));
            var HTdc = {}, HTac = {}, inScanById = {};
            for (var k = 0; k < scan.scan.length; k++) {
                var cs = scan.scan[k].cs;
                HTdc[cs] = st.DHT_dc[scan.scan[k].td] || st.DHT_dc[0] || st.DHT_dc[1] || makeZeroDCTable();
                HTac[cs] = st.DHT_ac[scan.scan[k].ta] || st.DHT_ac[scan.scan[k].ta ^ 1] || st.DHT_ac[0] || makeEOBOnlyACTable();
                inScanById[cs] = true;
            }
            rstCountdown = st.restartInterval || 0;
            var bit = 1 << Al;

            // Non-interleaved (Ns==1)
            if (scan.scan.length === 1) {
                var cs = scan.scan[0].cs, ci = -1; for (var i = 0; i < st.comps.length; i++) if (st.comps[i].id === cs) { ci = i; break; }
                if (ci < 0) throw "Scan references unknown componentId=" + cs;
                var c = st.comps[ci];
                var bw = blocksPerComp[ci].bw, bh = blocksPerComp[ci].bh;
                dbg("non-interleaved", "cs=" + cs, "ci=" + ci, "bw=" + bw, "bh=" + bh, "h=" + c.h, "v=" + c.v);

                // DC only
                if (Ss === 0 && Se === 0) {
                    if (Ah === 0) {
                        for (var my = 0; my < mcuRows; my++) {
                            for (var mx = 0; mx < mcuCols; mx++) {
                                var tdc, diff = 0;
                                try { tdc = HTdc[cs].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: cs, mx: mx, my: my, h: c.h, v: c.v }); diff = (tdc === 0) ? 0 : receiveExt(tdc); }
                                catch (e) { if (e === "__MARKER__") return; stats.huffSoftDC++; }
                                dcPred[cs] += diff;
                                for (var vy = 0; vy < c.v; vy++) for (var hx = 0; hx < c.h; hx++) {
                                    var bn = blockNumber(ci, mx, my, hx, vy), off = (bn * 64) | 0; coeffs[ci][off] = dcPred[cs] << Al;
                                }
                                if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                            }
                        }
                    } else {
                        var add = 1 << Al;
                        for (var my2 = 0; my2 < mcuRows; my2++) {
                            for (var mx2 = 0; mx2 < mcuCols; mx2++) {
                                for (var vy2 = 0; vy2 < c.v; vy2++) for (var hx2 = 0; hx2 < c.h; hx2++) {
                                    var bn2 = blockNumber(ci, mx2, my2, hx2, vy2), off2 = (bn2 * 64) | 0;
                                    try { if (bs.u8bit()) coeffs[ci][off2] += (coeffs[ci][off2] >= 0 ? add : -add); }
                                    catch (e) { if (e === "__MARKER__") return; }
                                }
                                if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                            }
                        }
                    }
                    return;
                }

                // AC bands (first/refine)
                if (Ah === 0) {
                    for (var by1 = 0; by1 < bh; by1++) for (var bx1 = 0; bx1 < bw; bx1++) {
                        var off1 = ((by1 * bw + bx1) * 64) | 0, kpos = Ss;
                        while (kpos <= Se) {
                            if (eobrun > 0) { eobrun--; break; }
                            var rs;
                            try { rs = HTac[cs].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: cs, mx: bx1, my: by1, h: c.h, v: c.v, k: kpos }); }
                            catch (e) { if (e === "__MARKER__") return; stats.huffSoftAC++; break; }
                            var r = rs >> 4, s = rs & 15;
                            if (s === 0) {
                                if (r === 0xF) { kpos += 16; continue; }
                                var extra = (r === 0) ? 0 : receive(r); eobrun = ((1 << r) + extra) - 1; break;
                            }
                            var zc = 0; while (kpos <= Se && zc < r) { if (coeffs[ci][off1 + zig[kpos]] === 0) zc++; kpos++; }
                            if (kpos > Se) break;
                            var val = receiveExt(s); coeffs[ci][off1 + zig[kpos]] = val * bit; kpos++;
                        }
                    }
                } else {
                    for (var by2 = 0; by2 < bh; by2++) for (var bx2 = 0; bx2 < bw; bx2++) {
                        var off2 = ((by2 * bw + bx2) * 64) | 0, k2 = Ss;
                        while (k2 <= Se) {
                            while (k2 <= Se) {
                                var zz = zig[k2], cv = coeffs[ci][off2 + zz];
                                if (cv !== 0) { try { if (bs.u8bit()) coeffs[ci][off2 + zz] += (cv > 0) ? bit : -bit; } catch (e) { if (e === "__MARKER__") return; } k2++; continue; }
                                break;
                            }
                            if (k2 > Se) break;
                            if (eobrun > 0) { eobrun--; break; }
                            var rs2;
                            try { rs2 = HTac[cs].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: cs, mx: bx2, my: by2, h: c.h, v: c.v, k: k2 }); }
                            catch (e) { if (e === "__MARKER__") return; stats.huffSoftAC++; break; }
                            var r2 = rs2 >> 4, s2 = rs2 & 15;
                            if (s2 === 0) {
                                if (r2 === 0xF) {
                                    var skipped = 0;
                                    while (k2 <= Se && skipped < 16) {
                                        var zzi = zig[k2];
                                        if (coeffs[ci][off2 + zzi] === 0) skipped++;
                                        else { try { if (bs.u8bit()) coeffs[ci][off2 + zzi] += (coeffs[ci][off2 + zzi] > 0) ? bit : -bit; } catch (e) { if (e === "__MARKER__") return; } }
                                        k2++;
                                    }
                                    continue;
                                } else {
                                    var extra2 = (r2 === 0) ? 0 : receive(r2); eobrun = ((1 << r2) + extra2) - 1; break;
                                }
                            }
                            var zeros = r2;
                            while (k2 <= Se) {
                                var zzk = zig[k2];
                                if (coeffs[ci][off2 + zzk] === 0) { if (zeros === 0) break; zeros--; }
                                else { try { if (bs.u8bit()) coeffs[ci][off2 + zzk] += (coeffs[ci][off2 + zzk] > 0) ? bit : -bit; } catch (e) { if (e === "__MARKER__") return; } }
                                k2++;
                            }
                            if (k2 <= Se) {
                                var sign = (function () { try { return bs.u8bit() ? -bit : bit; } catch (e) { if (e === "__MARKER__") return 0; throw e; } })();
                                if (sign !== 0) { coeffs[ci][off2 + zig[k2]] = sign; k2++; }
                            }
                        }
                    }
                }
                return;
            } // end non-interleaved

            // Interleaved (Ns>1)
            if (Ss === 0 && Se === 0) {
                if (Ah === 0) {
                    for (var my3 = 0; my3 < mcuRows; my3++) {
                        for (var mx3 = 0; mx3 < mcuCols; mx3++) {
                            for (var ciI = 0; ciI < st.comps.length; ciI++) {
                                var cI = st.comps[ciI]; if (!inScanById[cI.id]) continue;
                                var tdc, diff = 0;
                                try { tdc = HTdc[cI.id].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: cI.id, mx: mx3, my: my3, h: cI.h, v: cI.v }); diff = (tdc === 0) ? 0 : receiveExt(tdc); }
                                catch (e) { if (e === "__MARKER__") return; stats.huffSoftDC++; }
                                dcPred[cI.id] += diff;
                                for (var vy3 = 0; vy3 < cI.v; vy3++) for (var hx3 = 0; hx3 < cI.h; hx3++) {
                                    var bn3 = blockNumber(ciI, mx3, my3, hx3, vy3), off3 = bn3 * 64; coeffs[ciI][off3] = dcPred[cI.id] << Al;
                                }
                            }
                            if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                        }
                    }
                } else {
                    var add2 = 1 << Al;
                    for (var my4 = 0; my4 < mcuRows; my4++) {
                        for (var mx4 = 0; mx4 < mcuCols; mx4++) {
                            for (var ciR = 0; ciR < st.comps.length; ciR++) {
                                var cR = st.comps[ciR]; if (!inScanById[cR.id]) continue;
                                for (var vyR = 0; vyR < cR.v; vyR++) for (var hxR = 0; hxR < cR.h; hxR++) {
                                    var bn4 = blockNumber(ciR, mx4, my4, hxR, vyR), off4 = bn4 * 64;
                                    try { if (bs.u8bit()) coeffs[ciR][off4] += (coeffs[ciR][off4] >= 0 ? add2 : -add2); } catch (e) { if (e === "__MARKER__") return; }
                                }
                            }
                            if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                        }
                    }
                }
                return;
            }

            // Interleaved AC
            var bitB = 1 << Al;
            if (Ah === 0) {
                for (var my5 = 0; my5 < mcuRows; my5++) {
                    for (var mx5 = 0; mx5 < mcuCols; mx5++) {
                        for (var ci2 = 0; ci2 < st.comps.length; ci2++) {
                            var c2 = st.comps[ci2]; if (!inScanById[c2.id]) continue;
                            for (var vy5 = 0; vy5 < c2.v; vy5++) for (var hx5 = 0; hx5 < c2.h; hx5++) {
                                var bn5 = blockNumber(ci2, mx5, my5, hx5, vy5), off5 = bn5 * 64, k5 = Ss;
                                while (k5 <= Se) {
                                    if (eobrun > 0) { eobrun--; break; }
                                    var rsI;
                                    try { rsI = HTac[c2.id].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: c2.id, mx: mx5, my: my5, h: c2.h, v: c2.v, k: k5 }); }
                                    catch (e) { if (e === "__MARKER__") return; stats.huffSoftAC++; break; }
                                    var rI = rsI >> 4, sI = rsI & 15;
                                    if (sI === 0) {
                                        if (rI === 0xF) { k5 += 16; continue; }
                                        var extraI = (rI === 0) ? 0 : receive(rI); eobrun = ((1 << rI) + extraI) - 1; break;
                                    }
                                    var zc = 0; while (k5 <= Se && zc < rI) { if (coeffs[ci2][off5 + zig[k5]] === 0) zc++; k5++; }
                                    if (k5 > Se) break;
                                    var valI = receiveExt(sI); coeffs[ci2][off5 + zig[k5]] = valI * bitB; k5++;
                                }
                            }
                        }
                        if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                    }
                }
            } else {
                for (var my6 = 0; my6 < mcuRows; my6++) {
                    for (var mx6 = 0; mx6 < mcuCols; mx6++) {
                        for (var ci3 = 0; ci3 < st.comps.length; ci3++) {
                            var c3 = st.comps[ci3]; if (!inScanById[c3.id]) continue;
                            for (var vy6 = 0; vy6 < c3.v; vy6++) for (var hx6 = 0; hx6 < c3.h; hx6++) {
                                var bn6 = blockNumber(ci3, mx6, my6, hx6, vy6), off6 = bn6 * 64, k6 = Ss;
                                while (k6 <= Se) {
                                    while (k6 <= Se) {
                                        var zz = zig[k6], cv = coeffs[ci3][off6 + zz];
                                        if (cv !== 0) { try { if (bs.u8bit()) coeffs[ci3][off6 + zz] += (cv > 0) ? bitB : -bitB; } catch (e) { if (e === "__MARKER__") return; } k6++; continue; }
                                        break;
                                    }
                                    if (k6 > Se) break;
                                    if (eobrun > 0) { eobrun--; break; }
                                    var rsR;
                                    try { rsR = HTac[c3.id].decode(bs, { Ss: Ss, Se: Se, Ah: Ah, Al: Al, compId: c3.id, mx: mx6, my: my6, h: c3.h, v: c3.v, k: k6 }); }
                                    catch (e) { if (e === "__MARKER__") return; stats.huffSoftAC++; break; }
                                    var rR = rsR >> 4, sR = rsR & 15;
                                    if (sR === 0) {
                                        if (rR === 0xF) {
                                            var skipped = 0;
                                            while (k6 <= Se && skipped < 16) {
                                                var zzi = zig[k6];
                                                if (coeffs[ci3][off6 + zzi] === 0) skipped++;
                                                else { try { if (bs.u8bit()) coeffs[ci3][off6 + zzi] += (coeffs[ci3][off6 + zzi] > 0) ? bitB : -bitB; } catch (e) { if (e === "__MARKER__") return; } }
                                                k6++;
                                            }
                                            continue;
                                        } else {
                                            var extraR = (rR === 0) ? 0 : receive(rR); eobrun = ((1 << rR) + extraR) - 1; break;
                                        }
                                    }
                                    var zeros = rR;
                                    while (k6 <= Se) {
                                        var zzk = zig[k6];
                                        if (coeffs[ci3][off6 + zzk] === 0) { if (zeros === 0) break; zeros--; }
                                        else { try { if (bs.u8bit()) coeffs[ci3][off6 + zzk] += (coeffs[ci3][off6 + zzk] > 0) ? bitB : -bitB; } catch (e) { if (e === "__MARKER__") return; } }
                                        k6++;
                                    }
                                    if (k6 <= Se) {
                                        var sign = (function () { try { return bs.u8bit() ? -bitB : bitB; } catch (e) { if (e === "__MARKER__") return 0; throw e; } })();
                                        if (sign !== 0) { coeffs[ci3][off6 + zig[k6]] = sign; k6++; }
                                    }
                                }
                            }
                        }
                        if (st.restartInterval) { if (--rstCountdown === 0) { rstReset(); rstSync(); rstCountdown = st.restartInterval; } }
                    }
                }
            }
        } // progressive

        // entropy loop
        if (!st.progressive) {
            var scanIdx = 0;
            while (scanIdx < scans.length) {
                var status = decodeBaselineScan(scans[scanIdx]);
                if (status === 'eoi') break;
                if (status === 'sos') {
                    var len = bs.u16();
                    scans.push(readSOS(bs, len, st));
                    scanIdx = scans.length - 1;
                    continue;
                }

                scanIdx++;

                var mk = nextMarker(bs);
                if (mk === 0xDA) {
                    var l = bs.u16();
                    scans.push(readSOS(bs, l, st));
                    scanIdx = scans.length - 1;
                    continue;
                }
                if (mk === 0xD9) break;
                var l2 = bs.u16();
                if (mk === 0xDD) readDRI(bs, l2, st);
                else if (mk === 0xC4) readDHT(bs, l2, st);
                else if (mk === 0xDB) readDQT(bs, l2, st);
                else if (mk === 0xE1) parseAPP1Exif(bs, l2, st);
                else if (mk === 0xEE) parseAPP14Adobe(bs, l2, st);
                else { bs.p += l2 - 2; }
            }
        } else {
            while (true) {
                decodeProgressiveScan(scans[scans.length - 1]);
                var mk = nextMarker(bs);
                dbg("next marker", "0x" + mk.toString(16));
                if (mk === 0xDA) { var l = bs.u16(); scans.push(readSOS(bs, l, st)); continue; }
                if (mk === 0xD9) { break; }
                var l2 = bs.u16();
                if (mk === 0xDD) readDRI(bs, l2, st);
                else if (mk === 0xC4) readDHT(bs, l2, st);
                else if (mk === 0xDB) readDQT(bs, l2, st);
                else if (mk === 0xE1) parseAPP1Exif(bs, l2, st);
                else if (mk === 0xEE) parseAPP14Adobe(bs, l2, st);
                else bs.p += l2 - 2;
            }
        }

        // dequantize (for progressive) + IDCT to planes
        if (st.progressive) {
            for (i = 0; i < st.comps.length; i++) {
                var q = st.comps[i].q, buf = coeffs[i];
                for (var b = 0; b < buf.length; b += 64) for (var k = 0; k < 64; k++) buf[b + k] = (buf[b + k] | 0) * q[k];
            }
        }

        var width = st.width, height = st.height;
        var Y = new Int16Array(width * height), Cb = null, Cr = null;
        if (st.comps.length > 1) { Cb = new Int16Array(width * height); Cr = new Int16Array(width * height); }
        var idctB = new Int32Array(64);

        for (i = 0; i < st.comps.length; i++) {
            var c = st.comps[i], bw = blocksPerComp[i].bw, bh = blocksPerComp[i].bh, buf = coeffs[i];
            for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) {
                var off = (by * bw + bx) * 64; idct8x8(buf.subarray(off, off + 64), idctB, 0);
                var sx = (st.Hmax / c.h) | 0, sy = (st.Vmax / c.v) | 0;
                var ox = (bx * 8 * sx) | 0, oy = (by * 8 * sy) | 0;
                for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 8; xx++) {
                    var base = idctB[yy * 8 + xx] + 128; if (base < 0) base = 0; else if (base > 255) base = 255;
                    for (var ry = 0; ry < sy; ry++) {
                        var iy = oy + yy * sy + ry; if (iy >= height) continue; var row = iy * width;
                        for (var rx = 0; rx < sx; rx++) {
                            var ix = ox + xx * sx + rx; if (ix >= width) continue;
                            if (i === 0) Y[row + ix] = base; else if (i === 1) Cb[row + ix] = base; else Cr[row + ix] = base;
                        }
                    }
                }
            }
        }

        // color conversion
        var rgba = new Uint8Array(width * height * 4), p = 0;
        if (st.comps.length === 1) {
            for (i = 0; i < width * height; i++) { var v = Y[i] | 0; rgba[p++] = v; rgba[p++] = v; rgba[p++] = v; rgba[p++] = 255; }
        } else if (st.adobe_transform === 2 && Cb && Cr) {
            // YCCK -> approximate to RGB
            for (i = 0; i < width * height; i++) {
                var yv = Y[i] | 0, cb = (Cb[i] | 0) - 128, cr = (Cr[i] | 0) - 128;
                var C = 255 - clamp8(yv + ((116130 * cb) >> 16));
                var M = 255 - clamp8(yv + ((91881 * cr) >> 16));
                var Yy = 255 - clamp8(yv), K = 0;
                rgba[p++] = 255 - Math.min(255, C + K);
                rgba[p++] = 255 - Math.min(255, M + K);
                rgba[p++] = 255 - Math.min(255, Yy + K);
                rgba[p++] = 255;
            }
        } else {
            for (i = 0; i < width * height; i++) {
                var y = Y[i] | 0, cb2 = (Cb[i] | 0) - 128, cr2 = (Cr[i] | 0) - 128;
                var r = y + ((91881 * cr2) >> 16);
                var g = y - ((22554 * cb2 + 46802 * cr2) >> 16);
                var b = y + ((116130 * cb2) >> 16);
                rgba[p++] = clamp8(r); rgba[p++] = clamp8(g); rgba[p++] = clamp8(b); rgba[p++] = 255;
            }
        }

        // EXIF orientation
        if (st.exif_orient && st.exif_orient !== 1) {
            rgba = (function orient(src, w, h, o) {
                var dst; function idx(x, y) { return (y * w + x) << 2; } function idxy(x, y, ww) { return (y * ww + x) << 2; }
                switch (o) {
                    case 2: dst = new Uint8Array(src.length); for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var s = idx(w - 1 - x, y), d = idx(x, y); dst[d] = src[s]; dst[d + 1] = src[s + 1]; dst[d + 2] = src[s + 2]; dst[d + 3] = 255; } return dst;
                    case 3: dst = new Uint8Array(src.length); for (y = 0; y < h; y++) for (var x2 = 0; x2 < w; x2++) { var s2 = idx(w - 1 - x2, h - 1 - y), d2 = idx(x2, y); dst[d2] = src[s2]; dst[d2 + 1] = src[s2 + 1]; dst[d2 + 2] = src[s2 + 2]; dst[d2 + 3] = 255; } return dst;
                    case 4: dst = new Uint8Array(src.length); for (y = 0; y < h; y++) for (var x3 = 0; x3 < w; x3++) { var s3 = idx(x3, h - 1 - y), d3 = idx(x3, y); dst[d3] = src[s3]; dst[d3 + 1] = src[s3 + 1]; dst[d3 + 2] = src[s3 + 2]; dst[d3 + 3] = 255; } return dst;
                    case 5: dst = new Uint8Array(src.length); var W = h; for (y = 0; y < h; y++) for (var x4 = 0; x4 < w; x4++) { var s4 = idx(x4, y), d4 = idxy(y, x4, W); dst[d4] = src[s4]; dst[d4 + 1] = src[s4 + 1]; dst[d4 + 2] = src[s4 + 2]; dst[d4 + 3] = 255; } return dst;
                    case 6: dst = new Uint8Array(src.length); var W2 = h; for (y = 0; y < h; y++) for (var x5 = 0; x5 < w; x5++) { var s5 = idx(x5, y), d5 = idxy(h - 1 - y, x5, W2); dst[d5] = src[s5]; dst[d5 + 1] = src[s5 + 1]; dst[d5 + 2] = src[s5 + 2]; dst[d5 + 3] = 255; } return dst;
                    case 7: dst = new Uint8Array(src.length); var W3 = h; for (y = 0; y < h; y++) for (var x6 = 0; x6 < w; x6++) { var s6 = idx(x6, y), d6 = idxy(h - 1 - y, w - 1 - x6, W3); dst[d6] = src[s6]; dst[d6 + 1] = src[s6 + 1]; dst[d6 + 2] = src[s6 + 2]; dst[d6 + 3] = 255; } return dst;
                    case 8: dst = new Uint8Array(src.length); var W4 = h; for (y = 0; y < h; y++) for (var x7 = 0; x7 < w; x7++) { var s7 = idx(x7, y), d7 = idxy(y, w - 1 - x7, W4); dst[d7] = src[s7]; dst[d7 + 1] = src[s7 + 1]; dst[d7 + 2] = src[s7 + 2]; dst[d7 + 3] = 255; } return dst;
                    default: return src;
                }
            })(rgba, width, height, st.exif_orient);
            if (st.exif_orient >= 5 && st.exif_orient <= 8) { var tmp = width; width = height; height = tmp; }
        }

        if (RESILIENT) {
            var px = width * height, score = (stats.huffResync + stats.huffSoftDC + stats.huffSoftAC);
            dbg("resiliency", "resync=" + stats.huffResync, "softDC=" + stats.huffSoftDC, "softAC=" + stats.huffSoftAC, "pixels=" + px);
        }

        return { rgba: rgba, width: width, height: height };
    }

    function looksJPG(bytes) {
        var s = (typeof bytes === "string") ? bytes : bytes.toString();
        return s.length >= 3 && s.charCodeAt(0) === 0xFF && s.charCodeAt(1) === 0xD8 && s.charCodeAt(2) === 0xFF;
    }

    return { decode: decodeJPEG, looksJPG: looksJPG, inspect: inspectJPEG };
}