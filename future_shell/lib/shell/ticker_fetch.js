// DEPRECATED: This file is no longer used. RSS fetching is now done inline
// in ticker.js to avoid a SEGV caused by SpiderMonkey's JS_IsRunning race
// condition in load(true,...) background threads (js_global.c:190).
// Safe to delete once the inline approach is confirmed stable.
// ticker_fetch.js — Background RSS fetch for the shell header ticker
// Spawned via: load(true, 'future_shell/lib/shell/ticker_fetch.js', feedUrl)
// Writes a result object to parent_queue and exits.
//
// NOTE: This uses a pure-JS RSS parser instead of rss-atom.js (which uses
// the native E4X `new XML()` parser).  E4X was removed from later SpiderMonkey
// versions due to stability bugs.  Running it inside a background thread
// context was the likely cause of recurring SEGV crashes that started when the
// ticker was introduced.
"use strict";

load('sbbsdefs.js');
load('http.js');

var url = argv[0] || '';
var result = { error: false, headlines: [], url: url };

// Map common Unicode codepoints to ASCII substitutes
var _unicodeMap = {
    '\u2018': "'",  '\u2019': "'",
    '\u201C': '"',  '\u201D': '"',
    '\u201A': "'",  '\u201B': "'",
    '\u201E': '"',  '\u201F': '"',
    '\u2032': "'",  '\u2033': '"',
    '\u2013': '-',  '\u2014': '--',
    '\u2015': '--',
    '\u2026': '...',
    '\u2022': '*',
    '\u00B7': '.',
    '\u2027': '.',
    '\u00A0': ' ',
    '\u2002': ' ',  '\u2003': ' ',
    '\u2009': ' ',  '\u200A': ' ',
    '\u00AB': '<<', '\u00BB': '>>',
    '\u2039': '<',  '\u203A': '>',
    '\u00AE': '(R)',
    '\u00A9': '(C)',
    '\u2122': '(TM)',
    '\u00B0': 'deg',
    '\u00BD': '1/2', '\u00BC': '1/4', '\u00BE': '3/4',
    '\u00D7': 'x',
    '\u00F7': '/',
    '\u2190': '<-', '\u2192': '->', '\u2191': '^', '\u2193': 'v',
    '\u00E9': 'e',  '\u00E8': 'e',  '\u00EA': 'e', '\u00EB': 'e',
    '\u00E0': 'a',  '\u00E1': 'a',  '\u00E2': 'a', '\u00E3': 'a', '\u00E4': 'a',
    '\u00F2': 'o',  '\u00F3': 'o',  '\u00F4': 'o', '\u00F5': 'o', '\u00F6': 'o',
    '\u00EC': 'i',  '\u00ED': 'i',  '\u00EE': 'i', '\u00EF': 'i',
    '\u00F9': 'u',  '\u00FA': 'u',  '\u00FB': 'u', '\u00FC': 'u',
    '\u00F1': 'n',  '\u00E7': 'c',  '\u00DF': 'ss',
    '\u00C9': 'E',  '\u00C8': 'E',  '\u00CA': 'E',
    '\u00C0': 'A',  '\u00C1': 'A',  '\u00C2': 'A',
    '\u200B': '',   '\u200C': '',   '\u200D': '',   '\uFEFF': ''
};

function _sanitizeTitle(str) {
    if (!str) return '';
    str = str.replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
    str = str.replace(/&#x([0-9A-Fa-f]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    str = str.replace(/&amp;/gi, '&');
    str = str.replace(/&lt;/gi, '<');
    str = str.replace(/&gt;/gi, '>');
    str = str.replace(/&quot;/gi, '"');
    str = str.replace(/&apos;/gi, "'");
    str = str.replace(/&nbsp;/gi, ' ');
    var out = '';
    for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (_unicodeMap[ch] !== undefined) {
            out += _unicodeMap[ch];
        } else if (ch.charCodeAt(0) > 126) {
            // Unknown non-ASCII: skip
        } else {
            out += ch;
        }
    }
    return out.replace(/  +/g, ' ').trim();
}

// Extract text content between XML tags using simple string search.
// Avoids native XML/E4X parser entirely — pure JS only.
function _getTagContent(xml, tagName) {
    var open = '<' + tagName;
    var close = '</' + tagName + '>';
    var start = xml.indexOf(open);
    if (start < 0) return '';
    var gt = xml.indexOf('>', start + open.length);
    if (gt < 0) return '';
    var end = xml.indexOf(close, gt + 1);
    if (end < 0) return '';
    return xml.substring(gt + 1, end);
}

// Split XML into <item> or <entry> blocks (RSS 2.0 / Atom)
function _splitItems(xml) {
    var items = [];
    var tagName = (xml.indexOf('<entry') >= 0) ? 'entry' : 'item';
    var open = '<' + tagName;
    var close = '</' + tagName + '>';
    var pos = 0;
    while (pos < xml.length && items.length < 50) {
        var start = xml.indexOf(open, pos);
        if (start < 0) break;
        var end = xml.indexOf(close, start);
        if (end < 0) break;
        items.push(xml.substring(start, end + close.length));
        pos = end + close.length;
    }
    return items;
}

// Extract link from an item block.  Handles both RSS <link>text</link>
// and Atom <link href="..." /> self-closing tags.
function _getItemLink(itemXml) {
    var link = _getTagContent(itemXml, 'link');
    if (link) return link.replace(/[\x00-\x1F]/g, '').trim();
    var m = itemXml.match(/<link[^>]+href\s*=\s*["']([^"']+)["']/i);
    return m ? m[1].replace(/[\x00-\x1F]/g, '').trim() : '';
}

try {
    if (!url) throw new Error('No feed URL provided');

    var http = new HTTPRequest();
    http.timeout = 5;
    var doc = http.Get(url);
    http = undefined;

    if (!doc || !doc.length) throw new Error('Empty response from ' + url);

    // Extract channel/feed title
    var source = '';
    var channelBlock = _getTagContent(doc, 'channel');
    if (channelBlock) {
        source = _sanitizeTitle(_getTagContent(channelBlock, 'title'));
    } else {
        source = _sanitizeTitle(_getTagContent(doc, 'title'));
    }

    // Parse items
    var itemBlocks = _splitItems(channelBlock || doc);
    for (var i = 0; i < itemBlocks.length; i++) {
        var title = _sanitizeTitle(_getTagContent(itemBlocks[i], 'title'));
        if (!title) continue;
        var link = _getItemLink(itemBlocks[i]);
        result.headlines.push({ title: title, link: link, source: source });
    }
    doc = undefined;
    channelBlock = undefined;
    itemBlocks = undefined;
} catch (e) {
    result.error = true;
    result.message = String(e);
}

parent_queue.write(result);
result = undefined;
