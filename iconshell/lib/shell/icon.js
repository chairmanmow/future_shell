
function Icon(iconFrame, labelFrame, data, logit) {
    this.logit = logit;
    if(this.logit) log("Icon constructor called with data: " + JSON.stringify(data));
    //if (!(this instanceof Icon)) return new Icon(iconFrame, labelFrame, data);
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
        this.iconFrame.clear(BG_BLACK|LIGHTGRAY);
        return false;
    }
};

Icon.prototype._renderIconFile = function(iconW, iconH) {
    if(this.logit) log("Loading icon file: " + this.data.iconFile);
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
            if(this.logit) log("FOUND ANS" + ansPath)
            return true;
        } catch (e2) {
            dbug("Error loading ans: " + e2, "icon");
        }
    } else {
        if(this.logit) log("COULDNT FIND FILE! ANS OR BIN")
        dbug("Icon file does not exist: " + binPath + " or " + ansPath, "icon");
    }
    return false;
};

Icon.prototype._renderFallbackBg = function(hasBg, hasFg) {
    if(this.logit) log("FALLBACK CLEAR: loaded=false, hasBg=" + hasBg + ", hasFg=" + hasFg + ", iconFile=" + this.data.iconFile + ", label=" + this.data.label);
    var iconAttr = (hasBg ? this.data.iconBg : 0) | (hasFg ? this.data.iconFg : 0);
    this.iconFrame.clear(iconAttr);
};

Icon.prototype._renderLabel = function(iconW) {
    this.labelFrame.clear(BG_BLACK|LIGHTGRAY);
    this.labelFrame.home();
    var name = this.data.label || "";
    var hotkey = this.data.hotkey || null;
    var labelOut = "";
    var usedHotkey = false;
    for (var i = 0; i < name.length; i++) {
        var c = name[i];
        if (!usedHotkey && hotkey && c.toUpperCase() === hotkey) {
            labelOut += "\x01h\x01b" + c + "\x01n";
            usedHotkey = true;
        } else {
            labelOut += c;
        }
    }
    var start = Math.max(0, Math.floor((iconW - name.length) / 2));
    var pad = repeatChar(" ", start);
    this.labelFrame.putmsg(pad + labelOut.substr(0, iconW));
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

