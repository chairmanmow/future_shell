
function Icon(iconFrame, labelFrame, data, logit) {
    this.logit = logit;
    this.iconFrame = iconFrame;
    this.labelFrame = labelFrame;
    this.data = data;
    if (this.iconFrame && typeof this.iconFrame.open === 'function') this.iconFrame.open();
    if (this.labelFrame && typeof this.labelFrame.open === 'function') this.labelFrame.open();
}

Icon.prototype.render = function() {
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
    if (!loaded && (hasBg || hasFg)) {
        this._renderFallbackBg(hasBg, hasFg);
    }
    this._renderLabel(iconW);
    this.iconFrame.cycle();
};

Icon.prototype._renderAvatar = function(iconW, iconH) {
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

Icon.prototype._renderIconFile = function(iconW, iconH) {
    var iconPathBase = "iconshell/lib/icons/" + this.data.iconFile;
    var binPath = system.mods_dir + iconPathBase + ".bin";
    var ansPath = system.mods_dir + iconPathBase + ".ans";
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
    } else {
        dbug("Icon file does not exist: " + binPath + " or " + ansPath, "icon");
    }
    return false;
};

Icon.prototype._renderFallbackBg = function(hasBg, hasFg) {
    var iconAttr = (hasBg ? this.data.iconBg : 0) | (hasFg ? this.data.iconFg : 0);
    this.iconFrame.clear(iconAttr);
};

Icon.prototype._renderLabel = function(iconW) {
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

Icon.prototype.redraw = function(){
    //this.iconFrame.home();
    this.iconFrame.draw();
    this.iconFrame.open();
    this.iconFrame.cycle();
    //this.iconFrame.scrollTo(0, 0);
}

// Utility for centering label


// Make Icon globally available for load()
this.Icon = Icon;
