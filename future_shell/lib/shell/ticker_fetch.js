// ticker_fetch.js — Background RSS fetch for the shell header ticker
// Spawned via: load(true, 'future_shell/lib/shell/ticker_fetch.js', feedUrl)
// Writes a result object to parent_queue and exits.
"use strict";

load('sbbsdefs.js');
load('rss-atom.js');

var url = argv[0] || '';
var result = { error: false, headlines: [], url: url };

// Map common Unicode codepoints to ASCII substitutes
var _unicodeMap = {
    '\u2018': "'",  '\u2019': "'",  // smart single quotes
    '\u201C': '"',  '\u201D': '"',  // smart double quotes
    '\u201A': "'",  '\u201B': "'",  // single low-9 / reversed
    '\u201E': '"',  '\u201F': '"',  // double low-9 / reversed
    '\u2032': "'",  '\u2033': '"',  // prime / double prime
    '\u2013': '-',  '\u2014': '--', // en dash / em dash
    '\u2015': '--',                  // horizontal bar
    '\u2026': '...',                 // ellipsis
    '\u2022': '*',                   // bullet
    '\u00B7': '.',                   // middle dot
    '\u2027': '.',                   // hyphenation point
    '\u00A0': ' ',                   // non-breaking space
    '\u2002': ' ',  '\u2003': ' ',  // en/em space
    '\u2009': ' ',  '\u200A': ' ',  // thin/hair space
    '\u00AB': '<<', '\u00BB': '>>',  // guillemets
    '\u2039': '<',  '\u203A': '>',  // single guillemets
    '\u00AE': '(R)',                 // registered
    '\u00A9': '(C)',                 // copyright
    '\u2122': '(TM)',               // trademark
    '\u00B0': 'deg',                // degree
    '\u00BD': '1/2', '\u00BC': '1/4', '\u00BE': '3/4',  // fractions
    '\u00D7': 'x',                   // multiplication sign
    '\u00F7': '/',                   // division sign
    '\u2190': '<-', '\u2192': '->', '\u2191': '^', '\u2193': 'v', // arrows
    '\u00E9': 'e',  '\u00E8': 'e',  '\u00EA': 'e', '\u00EB': 'e', // accented e
    '\u00E0': 'a',  '\u00E1': 'a',  '\u00E2': 'a', '\u00E3': 'a', '\u00E4': 'a', // accented a
    '\u00F2': 'o',  '\u00F3': 'o',  '\u00F4': 'o', '\u00F5': 'o', '\u00F6': 'o', // accented o
    '\u00EC': 'i',  '\u00ED': 'i',  '\u00EE': 'i', '\u00EF': 'i', // accented i
    '\u00F9': 'u',  '\u00FA': 'u',  '\u00FB': 'u', '\u00FC': 'u', // accented u
    '\u00F1': 'n',  '\u00E7': 'c',  '\u00DF': 'ss', // n-tilde, c-cedilla, eszett
    '\u00C9': 'E',  '\u00C8': 'E',  '\u00CA': 'E',  // uppercase accented E
    '\u00C0': 'A',  '\u00C1': 'A',  '\u00C2': 'A',  // uppercase accented A
    '\u200B': '',   '\u200C': '',   '\u200D': '',   '\uFEFF': '' // zero-width chars
};

function _sanitizeTitle(str) {
    if (!str) return '';
    // Decode HTML entities that RSS feeds commonly contain
    str = str.replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
    str = str.replace(/&#x([0-9A-Fa-f]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    str = str.replace(/&amp;/gi, '&');
    str = str.replace(/&lt;/gi, '<');
    str = str.replace(/&gt;/gi, '>');
    str = str.replace(/&quot;/gi, '"');
    str = str.replace(/&apos;/gi, "'");
    str = str.replace(/&nbsp;/gi, ' ');
    // Replace known Unicode with ASCII substitutes
    var out = '';
    for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (_unicodeMap[ch] !== undefined) {
            out += _unicodeMap[ch];
        } else if (ch.charCodeAt(0) > 126) {
            // Unknown non-ASCII: skip it
        } else {
            out += ch;
        }
    }
    // Collapse multiple spaces
    return out.replace(/  +/g, ' ').trim();
}

try {
    if (!url) throw new Error('No feed URL provided');
    var feed = new Feed(url, 5);
    var channel = (feed.channels && feed.channels.length) ? feed.channels[0] : null;
    if (channel && channel.items) {
        var source = channel.title || '';
        for (var i = 0; i < channel.items.length; i++) {
            var item = channel.items[i];
            var title = _sanitizeTitle(item.title || '');
            if (!title) continue;
            result.headlines.push({ title: title, source: source });
        }
    }
} catch (e) {
    result.error = true;
    result.message = String(e);
}

parent_queue.write(result);
