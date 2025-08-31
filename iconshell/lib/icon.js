
function Icon(iconFrame, labelFrame, data) {
    if (!(this instanceof Icon)) return new Icon(iconFrame, labelFrame, data);
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
    // --- Avatar rendering support ---
    if (this.data.avatarObj && this.data.avatarObj.data) {
        // Draw avatar directly to the iconFrame using load_bin (if available)
        var bin = base64_decode(this.data.avatarObj.data);
        if (typeof this.iconFrame.load_bin === 'function') {
            this.iconFrame.load_bin(bin, 10, 6);
            loaded = true;
        } else if (typeof this.iconFrame.blit === 'function') {
            this.iconFrame.blit(bin, 10, 6, 0, 0);
            loaded = true;
        } else {
            // fallback: just clear the frame
            this.iconFrame.clear(BG_BLACK|LIGHTGRAY);
        }
    } else if (this.data.iconFile) {
        // If iconFile is defined and no avatar, load as before
        var iconPathBase = "iconshell/lib/icons/" + this.data.iconFile;
        var binPath = system.mods_dir + iconPathBase + ".bin";
        var ansPath = system.mods_dir + iconPathBase + ".ans";
        if (file_exists(binPath)) {
            try {
                this.iconFrame.load(binPath, iconW, iconH);
                loaded = true;
                this.redraw();
            } catch (e1) {
                dbug("Error loading bin: " + e1, "icon");
            }
        } else if (file_exists(ansPath)) {
            try {
                this.iconFrame.load(ansPath, iconW, iconH);
                loaded = true;
                this.iconFrame.scrollTo(0, 0);
            } catch (e2) {
                dbug("Error loading ans: " + e2, "icon");
            }
        } else {
            dbug("Icon file does not exist: " + binPath + " or " + ansPath, "icon");
        }
    }
    if (!loaded && (hasBg || hasFg)) {
        // fallback: just color background, no graphic, but only if bg/fg was set
        var iconAttr = (hasBg ? this.data.iconBg : 0) | (hasFg ? this.data.iconFg : 0);
        this.iconFrame.clear(iconAttr);
    }
    // Draw label with hotkey highlight
    this.labelFrame.clear(BG_BLACK|LIGHTGRAY);
    this.labelFrame.home();
    var name = this.data.label || "";
    var hotkey = this.data.hotkey || null;
    var labelOut = "";
    var usedHotkey = false;
    for (var i = 0; i < name.length; i++) {
        var c = name[i];
        if (!usedHotkey && hotkey && c.toUpperCase() === hotkey) {
            labelOut += "\x01h\x01b" + c + "\x01n"; // Highlight hotkey in blue
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
function repeatChar(ch, n) {
    var out = "";
    while (n-- > 0) out += ch;
    return out;
}

// Make Icon globally available for load()
this.Icon = Icon;

