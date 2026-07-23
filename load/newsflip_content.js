/* newsflip_content.js — shared full-article content extraction for Newsflip.
 *
 * Used by BOTH the web API (webv4_custom/root/api/newsflip.ssjs) and the BBS
 * newsreader subprogram (future_shell). Both read/write the SAME on-disk cache
 * (system.data_dir + 'newsflip/content/<id>.json'), so a story fetched on one
 * surface is instantly available on the other.
 *
 * The win over the old feed-tag-only approach: when Mozilla Readability is
 * available we fetch the real article URL and extract clean full text from the
 * live page (handles modern/cluttered DOMs), falling back to the RSS
 * content:encoded / description tag when Readability is unavailable or empty.
 *
 * Usage:
 *   var NewsflipContent = load('newsflip_content.js');
 *   var result = NewsflipContent.getArticleContent(article);
 *   // result: { id, title, link, source, timestamp, image, content(HTML),
 *   //           hasContent(bool), extractor('readability'|'feed'|'cache'|'none') }
 *
 * NOTE: fetch + Readability shell-out both BLOCK (system.exec/HTTPRequest).
 * Callers should show a loading indicator. Bounded by /usr/bin/timeout.
 */

(function () {
    'use strict';

    var CACHE_DIR   = system.data_dir + 'newsflip/';
    var CONTENT_DIR = CACHE_DIR + 'content/';

    /* Readability lives in the text-browser door. Paths are overridable via
     * an optional newsflip/content_config.json so a move doesn't need a code
     * change. Defaults point at the known-good vendored install. */
    var DEFAULTS = {
        enabled: true,
        node_binary: '',                 // '' => auto-detect (PATH, then common dirs)
        readability_script: '/sbbs/text-browser/render/readability.js',
        readability_modules: '/sbbs/text-browser/render/node_modules/@mozilla/readability/package.json',
        timeout_s: 15,
        fetch_timeout_s: 15,
        user_agent: 'Mozilla/5.0 (compatible; SynchronetBBS/3.21; +https://synchro.net)'
    };

    var _cfg = null;
    function cfg() {
        if (_cfg) return _cfg;
        var c = {};
        for (var k in DEFAULTS) c[k] = DEFAULTS[k];
        try {
            var cf = new File(CACHE_DIR + 'content_config.json');
            if (cf.exists && cf.open('r')) {
                var raw = cf.read(); cf.close();
                var over = JSON.parse(raw);
                for (var ok in over) if (over.hasOwnProperty(ok)) c[ok] = over[ok];
            }
        } catch (e) {}
        _cfg = c;
        return c;
    }

    /* ── string / json sanitizers (kept byte-identical to newsflip.ssjs so the
     *    shared cache stays interchangeable between web and BBS) ──────────── */

    function asciiSafeJson(str) {
        var out = '';
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) {
                out += '\\u' + ('0000' + c.toString(16)).slice(-4);
            } else if (c > 0x7e) {
                out += '\\u' + ('0000' + c.toString(16)).slice(-4);
            } else {
                out += str.charAt(i);
            }
        }
        return out;
    }

    function cleanStr(s) {
        if (!s) return '';
        var out = '';
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) { out += ' '; }
            else if (c === 0x7f) { /* skip DEL */ }
            else { out += s.charAt(i); }
        }
        return out;
    }

    function decodeEntities(s) {
        if (!s) return s;
        return s.replace(/&#(\d+);/g, function (m, c) { return String.fromCharCode(parseInt(c, 10)); })
                .replace(/&#x([0-9a-fA-F]+);/g, function (m, c) { return String.fromCharCode(parseInt(c, 16)); })
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                .replace(/&rsquo;/g, '\u2019').replace(/&lsquo;/g, '\u2018')
                .replace(/&rdquo;/g, '\u201D').replace(/&ldquo;/g, '\u201C')
                .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
                .replace(/&hellip;/g, '\u2026').replace(/&nbsp;/g, ' ');
    }

    function stripTags(html) {
        if (!html) return '';
        return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    /* ── RSS/Atom fallback extraction (mirrors newsflip.ssjs) ────────────── */

    function extractTag(xml, tagName) {
        var re1 = new RegExp('<' + tagName + '[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</' + tagName + '>', 'i');
        var m1 = xml.match(re1);
        if (m1) return m1[1].replace(/^\s+|\s+$/g, '');
        var re2 = new RegExp('<' + tagName + '[^>]*>([\\s\\S]*?)</' + tagName + '>', 'i');
        var m2 = xml.match(re2);
        return m2 ? m2[1].replace(/^\s+|\s+$/g, '') : '';
    }

    function extractLink(xml) {
        var atom = xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
        if (atom) return atom[1];
        atom = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["']/i);
        if (atom) return atom[1];
        atom = xml.match(/<link[^>]*href=["']([^"']+)["']/i);
        if (atom) return atom[1];
        var rss = xml.match(/<link>([^<]+)<\/link>/i);
        if (rss) return rss[1].replace(/^\s+|\s+$/g, '');
        return '';
    }

    /* ── node / readability discovery (replicates text-browser.js logic) ─── */

    var _node;   // undefined=unprobed, null=none, string=path
    function nodeBinary() {
        if (_node !== undefined) return _node;
        _node = null;
        var c = cfg();
        if (c.node_binary && file_exists(c.node_binary)) { _node = c.node_binary; return _node; }
        try {
            var p = system.popen ? system.popen('command -v node 2>/dev/null') : '';
            p = (typeof p === 'string') ? p : (p && p.length ? p[0] : '');
            if (p) { p = p.replace(/[\r\n]+/g, '').replace(/^\s+|\s+$/g, ''); if (p && file_exists(p)) { _node = p; return _node; } }
        } catch (e) {}
        var cands = ['/usr/bin/node', '/usr/local/bin/node'];
        for (var i = 0; i < cands.length; i++) { if (file_exists(cands[i])) { _node = cands[i]; break; } }
        return _node;
    }

    var _avail;
    function readabilityAvailable() {
        if (_avail !== undefined) return _avail;
        var c = cfg();
        _avail = !!(c.enabled && nodeBinary() && file_exists(c.readability_script) && file_exists(c.readability_modules));
        return _avail;
    }

    function shellSingleQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

    function tmpPath(ext) {
        var dir = system.temp_dir || '/tmp/';
        return dir + 'nf_' + (+new Date()) + '_' + (Math.random() * 1e9 | 0) + (ext || '');
    }

    function removeTmp(path) { try { if (path && file_exists(path)) file_remove(path); } catch (e) {} }

    /* Run Readability over an HTML string; returns clean article HTML or ''. */
    function readabilityExtract(html, url) {
        if (!html || !readabilityAvailable()) return '';
        var c = cfg();
        var node = nodeBinary();
        var inF = tmpPath('.in.html');
        var outF = tmpPath('.out.json');
        try {
            var wf = new File(inF);
            if (!wf.open('wb')) return '';
            wf.write(html); wf.close();
            var cmd = '/usr/bin/timeout ' + (c.timeout_s | 0) + ' ' + shellSingleQuote(node)
                + ' ' + shellSingleQuote(c.readability_script)
                + ' ' + shellSingleQuote(inF)
                + ' ' + shellSingleQuote(url || '')
                + ' >' + shellSingleQuote(outF) + ' 2>/dev/null';
            system.exec(cmd);
            var rf = new File(outF);
            if (!rf.open('rb')) return '';
            var out = rf.read(); rf.close();
            if (!out || !out.length) return '';
            var obj = JSON.parse(out.toString());
            if (!obj || !obj.ok || !obj.content) return '';
            return obj.content;
        } catch (e) {
            try { log(LOG_ERR, 'newsflip_content: readability error: ' + e); } catch (_) {}
            return '';
        } finally {
            removeTmp(inF);
            removeTmp(outF);
        }
    }

    /* ── HTTP fetch ──────────────────────────────────────────────────────── */

    function fetchUrl(url) {
        if (!url || !/^https?:\/\//i.test(url)) return '';
        try {
            load('http.js');
            var req = new HTTPRequest();
            req.recv_timeout = cfg().fetch_timeout_s;
            try { req.request_headers = ['User-Agent: ' + cfg().user_agent]; } catch (e) {}
            var body = req.Get(url);
            return (body && body.length) ? body : '';
        } catch (e) {
            try { log(LOG_WARNING, 'newsflip_content: fetch error ' + url + ': ' + e); } catch (_) {}
            return '';
        }
    }

    /* Pull full content out of the article's own RSS/Atom feed (legacy path). */
    function feedTagContent(art) {
        if (!art || !art.feedUrl) return '';
        var xml = fetchUrl(art.feedUrl);
        if (!xml || xml.length <= 50) return '';
        var itemPat = /<item[\s>]([\s\S]*?)<\/item>/gi;
        var items = xml.match(itemPat);
        if (!items) { itemPat = /<entry[\s>]([\s\S]*?)<\/entry>/gi; items = xml.match(itemPat); }
        if (!items) return '';
        for (var i = 0; i < items.length; i++) {
            if (extractLink(items[i]) === art.link) {
                var content = extractTag(items[i], 'content:encoded');
                if (!content) {
                    var altContent = extractTag(items[i], 'content');
                    var altDesc = extractTag(items[i], 'description') || extractTag(items[i], 'summary');
                    content = (altContent && altContent.length > (altDesc || '').length) ? altContent : (altDesc || '');
                }
                return content || '';
            }
        }
        return '';
    }

    function contentPath(id) { return CONTENT_DIR + id + '.json'; }

    function readCache(id) {
        try {
            var p = contentPath(id);
            if (!file_exists(p)) return null;
            var f = new File(p);
            if (!f.open('r')) return null;
            var raw = f.read(); f.close();
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function writeCache(result) {
        try {
            if (!file_isdir(CONTENT_DIR)) mkdir(CONTENT_DIR);
            var f = new File(contentPath(result.id));
            if (!f.open('w')) return false;
            f.write(asciiSafeJson(JSON.stringify(result)));
            f.close();
            return true;
        } catch (e) { return false; }
    }

    /* ── public API ──────────────────────────────────────────────────────── */

    /* Get full content for an article object (must have at least id, link;
     * feedUrl/title/source/image/timestamp used when present).
     * opts.forceRefresh    bypass the on-disk cache
     * opts.preferFeed      skip Readability, use the feed-tag path only
     * Returns the cache-shaped result object (see file header). */
    function getArticleContent(art, opts) {
        opts = opts || {};
        if (!art || !art.id) return null;

        if (!opts.forceRefresh) {
            var cached = readCache(art.id);
            if (cached) { cached.extractor = cached.extractor || 'cache'; return cached; }
        }

        var content = '';
        var extractor = 'none';

        // Best path: fetch the real article page and run Readability over it.
        if (!opts.preferFeed && art.link && readabilityAvailable()) {
            var html = fetchUrl(art.link);
            if (html) {
                var clean = readabilityExtract(html, art.link);
                if (clean && stripTags(clean).length > 200) { content = clean; extractor = 'readability'; }
            }
        }

        // Fallback: extract the content tag from the article's RSS/Atom feed.
        if (!content) {
            var feedHtml = feedTagContent(art);
            if (feedHtml) { content = feedHtml; extractor = 'feed'; }
        }

        content = decodeEntities(content) || '';
        var textOnly = stripTags(content);

        var result = {
            id: art.id,
            title: art.title || '',
            link: art.link || '',
            source: art.source || '',
            timestamp: art.timestamp || 0,
            image: art.image || '',
            content: cleanStr(content),
            hasContent: textOnly.length > 200,
            extractor: extractor
        };

        writeCache(result);
        return result;
    }

    return {
        getArticleContent: getArticleContent,
        readabilityAvailable: readabilityAvailable,
        // exposed for reuse / testing
        stripTags: stripTags,
        decodeEntities: decodeEntities,
        cleanStr: cleanStr,
        asciiSafeJson: asciiSafeJson
    };

})();
