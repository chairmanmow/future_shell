// content_extractor.js — HTML tokenizer + article content finder for TextBrowser
// Converts raw HTML into a flat token stream suitable for terminal rendering.

var STRIP_TAGS = [
    'script', 'style', 'noscript', 'svg', 'canvas', 'template',
    'nav', 'footer', 'aside', 'header', 'form', 'iframe', 'object',
    'button', 'input', 'select', 'textarea', 'figcaption', 'menu'
];

var CONTENT_SELECTORS = [
    { tag: 'article' },
    { tag: 'main' },
    { tag: 'div', classMatch: /\b(content|entry.content|post.content|article.body|story.body|entry.body|post.body|single.content)\b/i },
    { tag: 'div', idMatch: /\b(content|article|story|post|main|entry)\b/i },
    { tag: 'section', classMatch: /\b(content|article|entry)\b/i }
];

var VOID_TAGS = {
    area:1, base:1, br:1, col:1, embed:1, hr:1, img:1, input:1,
    link:1, meta:1, param:1, source:1, track:1, wbr:1
};

var BLOCK_TAGS = {
    address:1, article:1, aside:1, blockquote:1, dd:1, details:1,
    dialog:1, div:1, dl:1, dt:1, fieldset:1, figcaption:1, figure:1,
    footer:1, form:1, h1:1, h2:1, h3:1, h4:1, h5:1, h6:1, header:1,
    hgroup:1, hr:1, li:1, main:1, nav:1, ol:1, p:1, pre:1, section:1,
    summary:1, table:1, tr:1, ul:1
};

function tokenize(html) {
    var tokens = [];
    var i = 0;
    var len = html.length;
    var textStart = 0;

    while (i < len) {
        if (html.charAt(i) === '<') {
            if (i > textStart) {
                tokens.push({ type: 'text', text: html.substring(textStart, i) });
            }
            if (html.substring(i, i + 4) === '<!--') {
                var commentEnd = html.indexOf('-->', i + 4);
                if (commentEnd === -1) { i = len; textStart = len; break; }
                i = commentEnd + 3;
                textStart = i;
                continue;
            }
            if (html.charAt(i + 1) === '!' || html.charAt(i + 1) === '?') {
                var gtPos = html.indexOf('>', i + 2);
                if (gtPos === -1) { i = len; textStart = len; break; }
                i = gtPos + 1;
                textStart = i;
                continue;
            }
            var tagEnd = _findTagEnd(html, i);
            if (tagEnd === -1) { i = len; textStart = len; break; }
            var tagStr = html.substring(i + 1, tagEnd);
            var token = _parseTag(tagStr);
            if (token) tokens.push(token);
            i = tagEnd + 1;
            textStart = i;
        } else {
            i++;
        }
    }
    if (textStart < len) {
        tokens.push({ type: 'text', text: html.substring(textStart) });
    }
    return tokens;
}

function _findTagEnd(html, start) {
    var i = start + 1;
    var len = html.length;
    while (i < len) {
        var ch = html.charAt(i);
        if (ch === '>') return i;
        if (ch === '"' || ch === "'") {
            var q = ch;
            i++;
            while (i < len && html.charAt(i) !== q) i++;
        }
        i++;
    }
    return -1;
}

function _parseTag(tagStr) {
    tagStr = tagStr.replace(/^\s+|\s+$/g, '');
    if (!tagStr) return null;
    if (tagStr.charAt(0) === '/') {
        var closeName = tagStr.substring(1).replace(/[\s\/\>].*$/, '').toLowerCase();
        if (closeName) return { type: 'close', tag: closeName };
        return null;
    }
    var selfClose = (tagStr.charAt(tagStr.length - 1) === '/');
    if (selfClose) tagStr = tagStr.substring(0, tagStr.length - 1);
    var m = tagStr.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (!m) return null;
    var tagName = m[1].toLowerCase();
    var attrs = {};
    var attrRe = /\b(class|id|href|src|alt|role|itemprop)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;
    var am;
    while ((am = attrRe.exec(tagStr)) !== null) {
        attrs[am[1].toLowerCase()] = am[2] || am[3] || am[4] || '';
    }
    var isVoid = !!(VOID_TAGS[tagName]) || selfClose;
    return { type: isVoid ? 'void' : 'open', tag: tagName, attrs: attrs };
}

function _stripNoiseTags(tokens) {
    var result = [];
    var skipDepth = {};
    for (var i = 0; i < STRIP_TAGS.length; i++) skipDepth[STRIP_TAGS[i]] = 0;
    for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        if (tok.type === 'open' && skipDepth.hasOwnProperty(tok.tag)) {
            skipDepth[tok.tag]++;
            continue;
        }
        if (tok.type === 'close' && skipDepth.hasOwnProperty(tok.tag)) {
            if (skipDepth[tok.tag] > 0) skipDepth[tok.tag]--;
            continue;
        }
        var skipping = false;
        for (var s = 0; s < STRIP_TAGS.length; s++) {
            if (skipDepth[STRIP_TAGS[s]] > 0) { skipping = true; break; }
        }
        if (skipping) continue;
        result.push(tok);
    }
    return result;
}

function _findContentRegion(tokens) {
    for (var s = 0; s < CONTENT_SELECTORS.length; s++) {
        var sel = CONTENT_SELECTORS[s];
        var region = _extractRegion(tokens, sel);
        if (region && region.length > 0) {
            var textLen = 0;
            for (var r = 0; r < region.length; r++) {
                if (region[r].type === 'text') textLen += region[r].text.length;
            }
            if (textLen > 100) return region;
        }
    }
    return null;
}

function _extractRegion(tokens, sel) {
    for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        if (tok.type !== 'open') continue;
        if (tok.tag !== sel.tag) continue;
        if (sel.classMatch && !(sel.classMatch.test(tok.attrs['class'] || ''))) continue;
        if (sel.idMatch && !(sel.idMatch.test(tok.attrs.id || ''))) continue;
        var depth = 1;
        var region = [];
        for (var j = i + 1; j < tokens.length; j++) {
            var inner = tokens[j];
            if (inner.type === 'open' && inner.tag === sel.tag) depth++;
            if (inner.type === 'close' && inner.tag === sel.tag) {
                depth--;
                if (depth === 0) break;
            }
            region.push(inner);
        }
        return region;
    }
    return null;
}

function _extractTitle(tokens) {
    for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'open' && tokens[i].tag === 'title') {
            var parts = [];
            for (var j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'close' && tokens[j].tag === 'title') break;
                if (tokens[j].type === 'text') parts.push(tokens[j].text);
            }
            var title = parts.join('').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
            return title || null;
        }
    }
    return null;
}

function extractContent(html) {
    if (!html || typeof html !== 'string') return { tokens: [], title: null };
    var allTokens = tokenize(html);
    var title = _extractTitle(allTokens);
    var cleaned = _stripNoiseTags(allTokens);
    var contentTokens = _findContentRegion(cleaned);
    if (!contentTokens) {
        contentTokens = _extractRegion(cleaned, { tag: 'body' });
        if (!contentTokens) contentTokens = cleaned;
    }
    allTokens = null;
    cleaned = null;
    return { tokens: contentTokens, title: title };
}

({
    tokenize: tokenize,
    extractContent: extractContent,
    BLOCK_TAGS: BLOCK_TAGS,
    VOID_TAGS: VOID_TAGS
});
