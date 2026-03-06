// terminal_renderer.js — Convert HTML token stream to Ctrl-A formatted terminal lines

var NORMAL       = '\x01n';
var BOLD         = '\x01h';
var HEADING1_CLR = '\x01n\x01h\x01y';
var HEADING2_CLR = '\x01n\x01h\x01c';
var HEADING3_CLR = '\x01n\x01h\x01m';
var HEADING4_CLR = '\x01n\x01h\x01g';
var HEADING5_CLR = '\x01n\x01h\x01b';
var HEADING6_CLR = '\x01n\x01h\x01r';
var BOLD_CLR     = '\x01n\x01h';
var ITALIC_CLR   = '\x01n\x01c';
var UNDERLINE_CLR= '\x01n\x01b';
var STRIKE_CLR   = '\x01n\x018';
var LINK_CLR     = '\x01n\x01h\x01c';
var FOOTNOTE_CLR = '\x01n\x01c';
var QUOTE_CLR    = '\x01n\x01h\x01k';
var PRE_CLR      = '\x01n\x01g';
var HR_CLR       = '\x01n\x01h\x01k';

var HEADING_DECORATIONS = {
    h2: { left: '%%% ', right: ' %%%' },
    h3: { left: '--- ', right: ' ---' },
    h4: { left: '-=< ', right: ' >=-' },
    h5: { left: '... ', right: ' ...' },
    h6: { left: '___ ', right: ' ___' }
};

var INLINE_FORMAT = {
    b: BOLD_CLR, strong: BOLD_CLR,
    i: ITALIC_CLR, em: ITALIC_CLR, cite: ITALIC_CLR,
    u: UNDERLINE_CLR, ins: UNDERLINE_CLR,
    s: STRIKE_CLR, strike: STRIKE_CLR, del: STRIKE_CLR
};

var PARA_TAGS = { p:1, div:1, section:1, article:1, main:1 };

var _UNICODE_ASCII = {};
_UNICODE_ASCII['\u2018'] = "'";
_UNICODE_ASCII['\u2019'] = "'";
_UNICODE_ASCII['\u201C'] = '"';
_UNICODE_ASCII['\u201D'] = '"';
_UNICODE_ASCII['\u2013'] = '-';
_UNICODE_ASCII['\u2014'] = '--';
_UNICODE_ASCII['\u2026'] = '...';
_UNICODE_ASCII['\u00A0'] = ' ';
_UNICODE_ASCII['\u200B'] = '';
_UNICODE_ASCII['\u2022'] = '*';
_UNICODE_ASCII['\u00AB'] = '<<';
_UNICODE_ASCII['\u00BB'] = '>>';
_UNICODE_ASCII['\u00A9'] = '(C)';
_UNICODE_ASCII['\u00AE'] = '(R)';
_UNICODE_ASCII['\u2122'] = '(TM)';
_UNICODE_ASCII['\u00B0'] = 'deg';

function _decodeText(text) {
    text = text.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
        var cp = parseInt(hex, 16);
        if (cp < 128) return String.fromCharCode(cp);
        var uc = String.fromCharCode(cp);
        return _UNICODE_ASCII[uc] || uc;
    });
    text = text.replace(/&#(\d+);/g, function (m, dec) {
        var cp = parseInt(dec, 10);
        if (cp < 128) return String.fromCharCode(cp);
        var uc = String.fromCharCode(cp);
        return _UNICODE_ASCII[uc] || uc;
    });
    if (typeof html_decode === 'function') {
        text = html_decode(text);
    } else {
        text = text.replace(/&amp;/gi, '&');
        text = text.replace(/&lt;/gi, '<');
        text = text.replace(/&gt;/gi, '>');
        text = text.replace(/&quot;/gi, '"');
        text = text.replace(/&apos;/gi, "'");
        text = text.replace(/&nbsp;/gi, ' ');
    }
    for (var uc in _UNICODE_ASCII) {
        if (_UNICODE_ASCII.hasOwnProperty(uc) && text.indexOf(uc) >= 0) {
            text = text.split(uc).join(_UNICODE_ASCII[uc]);
        }
    }
    return text;
}

function _wordWrap(text, width) {
    if (!text) return [''];
    if (typeof word_wrap === 'function') {
        var wrapped = word_wrap(text, width, width * 100, false);
        return wrapped.split(/\r?\n/);
    }
    var lines = [];
    var words = text.split(/(\s+)/);
    var line = '';
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (!word) continue;
        if (line.length + word.length > width && line.length > 0) {
            lines.push(line.replace(/\s+$/, ''));
            line = word.replace(/^\s+/, '');
        } else {
            line += word;
        }
    }
    if (line) lines.push(line.replace(/\s+$/, ''));
    if (lines.length === 0) lines.push('');
    return lines;
}

function _renderTdfHeading(text, width) {
    try {
        if (typeof loadfont !== 'function' || typeof output !== 'function') return null;
        if (typeof getwidth !== 'function') return null;
        var fontNames = ['future', 'small', 'thin', 'tiny', 'mini', 'simple'];
        var font = null;
        for (var i = 0; i < fontNames.length; i++) {
            try {
                font = loadfont(fontNames[i]);
                if (font) {
                    var fw = getwidth(text, font);
                    if (fw <= width) break;
                    font = null;
                }
            } catch (_) { font = null; }
        }
        if (!font) return null;
        var prevOpt = (typeof opt !== 'undefined') ? opt : undefined;
        opt = { width: width, ansi: true };
        var rendered = output(text, font);
        opt = prevOpt;
        if (!rendered) return null;
        var lines = rendered.split(/\r?\n/);
        while (lines.length && !lines[lines.length - 1].replace(/[\x01\x00-\x1f\s]/g, '')) {
            lines.pop();
        }
        return lines.length ? lines : null;
    } catch (e) {
        return null;
    }
}

function renderTokens(tokens, opts) {
    opts = opts || {};
    var width = opts.width || 79;
    var useTdf = (opts.tdf !== false);

    var lines = [];
    var links = [];
    var textBuf = '';
    var inPre = false;
    var preText = '';
    var inHeading = '';
    var headingText = '';
    var listStack = [];
    var blockquoteDepth = 0;
    var inLink = false;
    var linkText = '';
    var linkHref = '';
    var formatStack = [];

    function _quotePrefix() {
        if (blockquoteDepth <= 0) return '';
        var prefix = '';
        for (var d = 0; d < blockquoteDepth; d++) prefix += QUOTE_CLR + '| ' + NORMAL;
        return prefix;
    }

    var prefixWidth = function () { return blockquoteDepth * 2; };

    function _flushText() {
        if (!textBuf) return;
        var clean = textBuf.replace(/\s+/g, ' ');
        if (clean === ' ' && lines.length === 0) { textBuf = ''; return; }
        var wrapWidth = width - prefixWidth();
        if (wrapWidth < 20) wrapWidth = 20;
        var wrapped = _wordWrap(clean, wrapWidth);
        var prefix = _quotePrefix();
        for (var i = 0; i < wrapped.length; i++) {
            lines.push(prefix + wrapped[i] + NORMAL);
        }
        textBuf = '';
    }

    function _paraBreak() {
        _flushText();
        if (lines.length > 0 && lines[lines.length - 1] !== '') {
            lines.push('');
        }
    }

    function _currentFormat() {
        if (formatStack.length === 0) return NORMAL;
        return formatStack[formatStack.length - 1];
    }

    for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];

        if (tok.type === 'text') {
            var decoded = _decodeText(tok.text);
            if (inPre) { preText += decoded; continue; }
            if (inHeading) { headingText += decoded; continue; }
            if (inLink) { linkText += decoded; continue; }
            var fmt = _currentFormat();
            textBuf += fmt + decoded;
            continue;
        }

        if (tok.type === 'void') {
            if (tok.tag === 'br') {
                if (inPre) { preText += '\n'; continue; }
                if (inHeading) continue;
                _flushText();
                lines.push(_quotePrefix());
            } else if (tok.tag === 'hr') {
                _paraBreak();
                var hrWidth = width - prefixWidth();
                if (hrWidth < 4) hrWidth = 4;
                var hrLine = '';
                for (var h = 0; h < hrWidth; h++) hrLine += '-';
                lines.push(_quotePrefix() + HR_CLR + hrLine + NORMAL);
                lines.push('');
            } else if (tok.tag === 'img') {
                var alt = tok.attrs.alt || '';
                if (alt) textBuf += NORMAL + '[Image: ' + _decodeText(alt) + ']';
            }
            continue;
        }

        if (tok.type === 'open') {
            if (/^h[1-6]$/.test(tok.tag)) {
                _paraBreak();
                inHeading = tok.tag;
                headingText = '';
                continue;
            }
            if (PARA_TAGS[tok.tag]) { _paraBreak(); continue; }
            if (tok.tag === 'pre' || tok.tag === 'code') {
                _paraBreak();
                inPre = true;
                preText = '';
                continue;
            }
            if (tok.tag === 'blockquote') {
                _paraBreak();
                blockquoteDepth++;
                continue;
            }
            if (tok.tag === 'ul' || tok.tag === 'ol') {
                _paraBreak();
                listStack.push({ type: tok.tag, count: 0 });
                continue;
            }
            if (tok.tag === 'li') {
                _flushText();
                var li = listStack.length ? listStack[listStack.length - 1] : null;
                var indent = '';
                for (var ls = 0; ls < listStack.length; ls++) indent += '  ';
                if (li && li.type === 'ol') {
                    li.count++;
                    textBuf += _quotePrefix() + indent + BOLD + li.count + '. ' + NORMAL;
                } else {
                    textBuf += _quotePrefix() + indent + BOLD + '* ' + NORMAL;
                }
                continue;
            }
            if (tok.tag === 'a' && tok.attrs.href) {
                inLink = true;
                linkText = '';
                linkHref = tok.attrs.href;
                continue;
            }
            if (INLINE_FORMAT[tok.tag]) {
                formatStack.push(INLINE_FORMAT[tok.tag]);
                textBuf += INLINE_FORMAT[tok.tag];
                continue;
            }
            if (tok.tag === 'td' || tok.tag === 'th') { textBuf += ' '; continue; }
            if (tok.tag === 'tr') { _flushText(); lines.push(_quotePrefix()); continue; }
            continue;
        }

        if (tok.type === 'close') {
            if (/^h[1-6]$/.test(tok.tag) && inHeading === tok.tag) {
                var hText = headingText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
                hText = _decodeText(hText);
                inHeading = '';
                headingText = '';
                if (!hText) continue;
                if (tok.tag === 'h1') {
                    if (useTdf) {
                        var tdfLines = _renderTdfHeading(hText, width - prefixWidth());
                        if (tdfLines) {
                            var qp = _quotePrefix();
                            for (var tl = 0; tl < tdfLines.length; tl++) lines.push(qp + tdfLines[tl]);
                            lines.push('');
                            continue;
                        }
                    }
                    lines.push(_quotePrefix() + HEADING1_CLR + '*** ' + hText + ' ***' + NORMAL);
                    lines.push('');
                } else {
                    var hClr = ({ h2:HEADING2_CLR, h3:HEADING3_CLR, h4:HEADING4_CLR, h5:HEADING5_CLR, h6:HEADING6_CLR })[tok.tag] || HEADING2_CLR;
                    var decor = HEADING_DECORATIONS[tok.tag] || { left: '--- ', right: ' ---' };
                    lines.push(_quotePrefix() + hClr + decor.left + hText + decor.right + NORMAL);
                    lines.push('');
                }
                continue;
            }
            if (PARA_TAGS[tok.tag]) { _paraBreak(); continue; }
            if ((tok.tag === 'pre' || tok.tag === 'code') && inPre) {
                inPre = false;
                var preLines = preText.split('\n');
                var prfx = _quotePrefix();
                for (var pl = 0; pl < preLines.length; pl++) lines.push(prfx + PRE_CLR + preLines[pl] + NORMAL);
                preText = '';
                lines.push('');
                continue;
            }
            if (tok.tag === 'blockquote') {
                _paraBreak();
                if (blockquoteDepth > 0) blockquoteDepth--;
                continue;
            }
            if (tok.tag === 'ul' || tok.tag === 'ol') {
                _flushText();
                if (listStack.length) listStack.pop();
                if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
                continue;
            }
            if (tok.tag === 'li') { _flushText(); continue; }
            if (tok.tag === 'a' && inLink) {
                inLink = false;
                var displayText = linkText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
                displayText = _decodeText(displayText);
                if (linkHref && displayText) {
                    links.push(linkHref);
                    textBuf += LINK_CLR + displayText + FOOTNOTE_CLR + '[' + links.length + ']' + _currentFormat();
                } else if (displayText) {
                    textBuf += displayText;
                }
                linkText = '';
                linkHref = '';
                continue;
            }
            if (INLINE_FORMAT[tok.tag]) {
                for (var fi = formatStack.length - 1; fi >= 0; fi--) {
                    if (formatStack[fi] === INLINE_FORMAT[tok.tag]) {
                        formatStack.splice(fi, 1);
                        break;
                    }
                }
                textBuf += _currentFormat();
                continue;
            }
            if (tok.tag === 'table') { _paraBreak(); continue; }
            continue;
        }
    }

    _flushText();

    if (links.length > 0) {
        lines.push('');
        lines.push(NORMAL + HR_CLR + '--- Links ---' + NORMAL);
        for (var lk = 0; lk < links.length; lk++) {
            lines.push(FOOTNOTE_CLR + '[' + (lk + 1) + '] ' + NORMAL + links[lk]);
        }
    }

    var collapsed = [];
    var blankCount = 0;
    for (var c = 0; c < lines.length; c++) {
        if (lines[c] === '' || lines[c].replace(/[\x01\x00-\x1f\s]/g, '') === '') {
            blankCount++;
            if (blankCount <= 2) collapsed.push('');
        } else {
            blankCount = 0;
            collapsed.push(lines[c]);
        }
    }
    while (collapsed.length && collapsed[0] === '') collapsed.shift();
    while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop();

    return { lines: collapsed, links: links };
}

({ renderTokens: renderTokens });
