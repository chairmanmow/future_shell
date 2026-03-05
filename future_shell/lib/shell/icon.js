"use strict";

function Icon(iconFrame, labelFrame, data, logit) {
    this.logit = logit;
    this.iconFrame = iconFrame;
    this.labelFrame = labelFrame;
    this.data = data;
    if (this.iconFrame && typeof this.iconFrame.open === 'function') this.iconFrame.open();
    if (this.labelFrame && typeof this.labelFrame.open === 'function') this.labelFrame.open();
}

Icon.prototype.render = function () {
    if (!this.iconFrame || !this.labelFrame) return;
    var iconW = this.iconFrame.width;
    var iconH = this.iconFrame.height;
    var hasBg = typeof this.data.iconBg !== 'undefined';
    var hasFg = typeof this.data.iconFg !== 'undefined';
    var loaded = false;
    if (this.data.avatarObj && this.data.avatarObj.data) {
        loaded = this._renderAvatar(iconW, iconH);
    } else if (this.data.iconFile) {
        loaded = this._renderIconFile(iconW, iconH);
    }
    // Dynamic recolor: if a recolorPalette was provided and a template loaded, recolor in-place
    if (loaded && this.data.recolorPalette) {
        try { this._recolorNewsTemplate(this.data.recolorPalette); } catch (_erc) { }
    }
    if (!loaded && (hasBg || hasFg)) {
        this._renderFallbackBg(hasBg, hasFg);
    }
    this._renderLabel(iconW);
    if (typeof this.iconFrame.makeContentTransparent === 'function') {
        this.iconFrame.makeContentTransparent();
    } else {
        this.iconFrame.transparent = true;
    }
    if (loaded) this._applyIconTransparency();
    this.iconFrame.transparent = true;
    if (typeof this.iconFrame.cycle === 'function') this.iconFrame.cycle();
    if (this.data && this.data._fileAreaInstance) {
        try {
            dbug('[FileArea#' + this.data._fileAreaInstance + '] Icon.render complete labelAttr=' + (this.labelFrame ? this.labelFrame.attr : 'n/a') + ' absIndex=' + (this.data._cellAbsIndex !== undefined ? this.data._cellAbsIndex : 'n/a'), 'icon');
        } catch (_) { }
    }
};

Icon.prototype._renderAvatar = function (iconW, iconH) {
    var bin = base64_decode(this.data.avatarObj.data);
    if (typeof this.iconFrame.load_bin === 'function') {
        this.iconFrame.load_bin(bin, 10, 6);
        return true;
    } else if (typeof this.iconFrame.blit === 'function') {
        this.iconFrame.blit(bin, 10, 6, 0, 0);
        return true;
    } else {
        this.iconFrame.clear(ICSH_ATTR('FRAME_STANDARD'));
        return false;
    }
};

Icon.prototype._renderIconFile = function (iconW, iconH) {
    var modsDir = system.mods_dir;
    var iconFile = this.data.iconFile;
    // Search paths: newsreader subdirectory first, then main assets
    var searchPaths = [
        modsDir + "future_shell/assets/newsreader/" + iconFile,
        modsDir + "future_shell/assets/" + iconFile
    ];
    for (var sp = 0; sp < searchPaths.length; sp++) {
        var binPath = searchPaths[sp] + ".bin";
        var ansPath = searchPaths[sp] + ".ans";
        if (file_exists(binPath)) {
            try {
                this.iconFrame.load(binPath, iconW, iconH);
                this.redraw();
                return true;
            } catch (e1) {
                dbug("Error loading bin: " + e1, "icon");
            }
        } else if (file_exists(ansPath)) {
            try {
                this.iconFrame.load(ansPath, iconW, iconH);
                return true;
            } catch (e2) {
                dbug("Error loading ans: " + e2, "icon");
            }
        }
    }
    dbug("Icon file does not exist: " + iconFile + " (checked newsreader/ and assets/)", "icon");
    return false;
};

/**
 * Dynamically recolor a loaded newsitems.bin template in-place.
 * palette: { edge_fg, body_bg, text_fg, star_fg, title }
 *   edge_fg  - FG color for outline/border cells (bg=0 non-space)
 *   body_bg  - BG color for the paper interior (replaces bg=7)
 *   text_fg  - FG color for title text (original fg=1, bg=7)
 *   star_fg  - FG color for star accents (original fg=14, bg=7)
 *   title    - up to 6 chars to replace R1 text at C3-C8
 */
Icon.prototype._recolorNewsTemplate = function (palette) {
    var frame = this.iconFrame;
    if (!frame || !palette) return;
    var w = frame.width || 0;
    var h = frame.height || 0;
    if (w <= 0 || h <= 0) return;

    var edgeFg  = (typeof palette.edge_fg  === 'number') ? palette.edge_fg  : 7;
    var bodyBg  = (typeof palette.body_bg  === 'number') ? palette.body_bg  : 7;
    var textFg  = (typeof palette.text_fg  === 'number') ? palette.text_fg  : 1;
    var starFg  = (typeof palette.star_fg  === 'number') ? palette.star_fg  : 14;
    var title   = palette.title || '';

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var cell = frame.getData(x, y);
            if (!cell) continue;
            var ch = cell.ch;
            var at = cell.attr;
            if (typeof at !== 'number') continue;
            var code = (typeof ch === 'number') ? (ch & 0xFF) : (typeof ch === 'string' && ch.length ? ch.charCodeAt(0) & 0xFF : 0);
            var fg = at & 0x0F;
            var bg = (at >> 4) & 0x07;

            // Transparent corner cells: space with bg=0 → leave alone
            if (code === 0x20 && bg === 0) continue;

            // Edge cells: non-space with bg=0 → recolor fg
            if (bg === 0 && code !== 0x20) {
                frame.setData(x, y, ch, (edgeFg & 0x0F));
                continue;
            }

            // Star cells: fg=14 (Yellow) on bg=7
            if (fg === 14 && bg === 7) {
                frame.setData(x, y, ch, ((bodyBg & 0x07) << 4) | (starFg & 0x0F));
                continue;
            }

            // Text cells: fg=1 (Blue) on bg=7
            if (fg === 1 && bg === 7) {
                frame.setData(x, y, ch, ((bodyBg & 0x07) << 4) | (textFg & 0x0F));
                continue;
            }

            // Body cells with bg=7
            if (bg === 7) {
                var newFg = fg;
                if (fg === 0) {
                    newFg = (edgeFg !== bodyBg) ? edgeFg : 0;
                } else if (fg === 7) {
                    newFg = bodyBg & 0x0F;
                }
                frame.setData(x, y, ch, ((bodyBg & 0x07) << 4) | (newFg & 0x0F));
                continue;
            }
        }
    }

    // Stamp title text at R1, C3-C8 (6 chars), preserving stars at C2 and C9
    var tLen = 6;
    var tStart = 3;
    var titleAttr = ((bodyBg & 0x07) << 4) | (textFg & 0x0F);
    var bodyAttr = ((bodyBg & 0x07) << 4) | (bodyBg & 0x0F);
    if (title && title.length > 0) {
        var padded = title;
        if (padded.length > tLen) padded = padded.substr(0, tLen);
        // Center the title in 6 chars
        var padL = Math.floor((tLen - padded.length) / 2);
        var centered = '';
        for (var p = 0; p < padL; p++) centered += ' ';
        centered += padded;
        while (centered.length < tLen) centered += ' ';
        for (var i = 0; i < tLen; i++) {
            if (tStart + i < w && 1 < h) {
                frame.setData(tStart + i, 1, centered.charAt(i), titleAttr);
            }
        }
    } else {
        // Fill C3-C8 with body background when no title
        for (var i = 0; i < tLen; i++) {
            if (tStart + i < w && 1 < h) {
                frame.setData(tStart + i, 1, ' ', bodyAttr);
            }
        }
    }
};

Icon.prototype._renderFallbackBg = function (hasBg, hasFg) {
    var iconAttr = (hasBg ? this.data.iconBg : 0) | (hasFg ? this.data.iconFg : 0);
    this.iconFrame.clear(iconAttr);
};

Icon.prototype._renderLabel = function (iconW) {
    this.labelFrame.clear(ICSH_ATTR('FRAME_STANDARD'));
    if (typeof this.labelFrame.word_wrap !== 'undefined') this.labelFrame.word_wrap = false;
    var name = this.data.label || "";
    if (!name) return;
    var hotkey = this.data.hotkey ? ("" + this.data.hotkey).toUpperCase() : null;
    var maxChars = iconW;
    var visible = name.length > maxChars ? name.substr(0, maxChars) : name;
    var start = Math.max(0, Math.floor((maxChars - visible.length) / 2));
    this.labelFrame.gotoxy(start + 1, 1);
    var usedHotkey = false;
    for (var i = 0; i < visible.length; i++) {
        var ch = visible.charAt(i);
        if (!usedHotkey && hotkey && ch.toUpperCase() === hotkey) {
            this.labelFrame.putmsg("\x01h\x01b" + ch + "\x01n");
            usedHotkey = true;
        } else {
            this.labelFrame.putmsg(ch);
        }
    }
};

Icon.prototype.redraw = function () {
    //this.iconFrame.home();
    this.iconFrame.draw();
    this.iconFrame.open();
    this.iconFrame.cycle();
    //this.iconFrame.scrollTo(0, 0);
}

Icon.prototype._applyIconTransparency = function () {
    var frame = this.iconFrame;
    if (!frame || typeof frame.getData !== 'function' || typeof frame.clearData !== 'function') return;
    var width = frame.width || 0;
    var height = frame.height || 0;
    if (width <= 0 || height <= 0) {
        frame.transparent = true;
        return;
    }
    var blackFg = (typeof BLACK === 'number') ? (BLACK & 0x0F) : 0;
    var blackBg = (typeof BG_BLACK === 'number') ? ((BG_BLACK >> 4) & 0x07) : (blackFg & 0x07);
    var fullBlockCode = 219;
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var cell = frame.getData(x, y);
            var ch = cell ? cell.ch : undefined;
            var attr = cell ? cell.attr : null;
            if (typeof attr !== 'number') attr = null;
            if (this._shouldClearIconCell(ch, attr, blackFg, blackBg, fullBlockCode)) {
                frame.clearData(x, y, false);
            }
        }
    }
    frame.transparent = true;
    if (typeof frame.cycle === 'function') frame.cycle();
};

Icon.prototype._isTransparentIconCell = function (ch, attr, blackFg, blackBg, fullBlockCode) {
    return this._shouldClearIconCell(ch, attr, blackFg, blackBg, fullBlockCode);
};

Icon.prototype._shouldClearIconCell = function (ch, attr, blackFg, blackBg, fullBlockCode) {
    if (ch === undefined || ch === null) return true;
    var code = null;
    if (typeof ch === 'number') code = ch & 0xFF;
    else if (typeof ch === 'string' && ch.length) code = ch.charCodeAt(0) & 0xFF;
    else return true;
    if (code === 0) return true;
    if (code === 32) {
        if (attr === undefined || attr === null) return true;
        if (this._bgMatchesBlack(attr, blackBg)) return true;
    }
    if (attr === undefined || attr === null) return false;
    if (typeof attr !== 'number') return false;
    var fgNibble = attr & 0x0F;
    var bgIsBlack = this._bgMatchesBlack(attr, blackBg);
    if (fgNibble === blackFg && bgIsBlack) return true;
    if (code === fullBlockCode && fgNibble === blackFg) return true;
    return false;
};

Icon.prototype._bgMatchesBlack = function (attr, blackBgNibble) {
    if (typeof attr !== 'number') return false;
    var bgNibble = (attr >> 4) & 0x07; // ignore blink bit
    var target = blackBgNibble & 0x07;
    return bgNibble === target;
};

// Utility for centering label

if (typeof registerModuleExports !== 'function') {
    try { load('future_shell/lib/util/lazy.js'); } catch (_) { }
}

// Make Icon globally available and return module exports
registerModuleExports({ Icon: Icon });
