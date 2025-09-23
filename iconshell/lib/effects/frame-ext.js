/*	'color' may be a colour def (LIGHTBLUE, etc.) or an array of same
	'title', if present, must have x, y, attr, and text properties */
Frame.prototype.drawBorder = function(color, title) {
	this.pushxy();
	var theColor = color;
	if (Array.isArray(color)) {
		var sectionLength = Math.round(this.width / color.length);
	}
	for (var y = 1; y <= this.height; y++) {
		for (var x = 1; x <= this.width; x++) {
			if (x > 1 && x < this.width && y > 1 && y < this.height) continue;
			var msg;
			this.gotoxy(x, y);
			if (y === 1 && x === 1) {
				msg = ascii(218);
			} else if (y === 1 && x === this.width) {
				msg = ascii(191);
			} else if (y === this.height && x === 1) {
				msg = ascii(192);
			} else if (y === this.height && x === this.width) {
				msg = ascii(217);
			} else if (x === 1 || x === this.width) {
				msg = ascii(179);
			} else {
				msg = ascii(196);
			}
			if (Array.isArray(color)) {
				if (x === 1) {
					theColor = color[0];
				} else if (x % sectionLength === 0 && x < this.width) {
					theColor = color[x / sectionLength];
				} else if (x === this.width) {
					theColor = color[color.length - 1];
				}
			}
			this.putmsg(msg, theColor);
		}
	}
	if (typeof title === 'object') {
		this.gotoxy(title.x, title.y);
		this.attr = title.attr;
		this.putmsg(ascii(180) + title.text + ascii(195));
	}
	this.popxy();
}

/*	Word-wrap and centre a string that may span multiple lines, and may already
	be multi-line itself. */
Frame.prototype.centerWrap = function (str) {
	var self = this;
	var arr = [''];
	str.split('\r\n').forEach(
		function (line, i, a) {
			line.split(' ').forEach(
				function (word) {
					if ((arr[arr.length - 1] + ' ' + word).length <=
							self.width
					) {
						arr[arr.length - 1] += (' ' + word);
					} else if (word.length > self.width) {
						arr.push(word.substr(0, self.width - 1) + '-');
						arr.push(word.substr(self.width - 1));
					} else {
						arr.push(word);
					}
				}
			);
			if (i < a.length - 1) arr.push('');
		}
	);
	arr.forEach(
		function (word, i, a) {
			self.center(skipsp(truncsp(word)));
			if (i < a.length - 1) self.crlf();
		}
	);
}

// Center this frame within other frame 'p', or the terminal if 'p' is omitted
Frame.prototype.centralize = function (p) {
	if (typeof p === 'undefined') {
		var p = {
			x : 1,
			y : 1,
			width : console.screen_columns,
			height : console.screen_rows
		};
	}
	var xy = {
		x : p.x + Math.floor((p.width - this.width) / 2),
		y : p.y + Math.floor((p.height - this.height) / 2)
	};
	this.moveTo(xy.x, xy.y);
}

/*	Expand to the size of the parent frame, optionally leaving x and / or
	y padding between this frame and its parent. */
Frame.prototype.nest = function (paddingX, paddingY) {
	if (typeof this.parent === 'undefined') return;
	var xOffset = (typeof paddingX === 'number' ? paddingX : 0);
	var yOffset = (typeof paddingY === 'number' ? paddingY : 0);
	this.x = this.parent.x + xOffset;
	this.y = this.parent.y + yOffset;
	this.width = this.parent.width - (xOffset * 2);
	this.height = this.parent.height - (yOffset * 2);
}

Frame.prototype.makeContentTransparent = function(){
	/*
		Convert interior cells that look like "background fill" into truly transparent cells so
		lower frames show through. Rules:
		  - Skip border (outermost rectangle) entirely.
		  - A cell is considered empty if char is undefined/space and attr background matches this.attr background.
		  - We preserve any cell with a printable char or a different background (content).
		Implementation detail:
		  Frame.setData(x,y,undefined,0,false) removes stored char/attr (makes transparent when frame.transparent=true).
	*/
	try {
		var width = this.width||0, height=this.height||0;
		if(width<=0||height<=0){ this.transparent=true; return; }
		// Determine this frame's background (low 4 bits of attr if standard Synchronet color encoding)
		var frameBg = (this.attr !== undefined && this.attr !== null) ? (this.attr & 0xF0) : null; // BG bits (assuming 0xF0 mask)
		for(var y=2; y<=height-1; y++){ // interior rows only
			for(var x=2; x<=width-1; x++){ // interior cols only
				// Peek existing cell if API available; fall back to heuristic blank replacement.
				var ch, attr;
				try {
					if(typeof this.getData === 'function'){
						var d=this.getData(x-1,y-1); // expect {ch,attr}
						if(d){ ch=d.ch; attr=d.attr; }
					}
				} catch(_){}
				if(ch === undefined || ch === null) ch = ' ';
				var bgMatch = false;
				if(attr === undefined || attr === null){
					// If attr missing treat as same background
					bgMatch = true;
				} else if(frameBg !== null){
					bgMatch = ((attr & 0xF0) === frameBg);
				}
				var looksEmpty = bgMatch && (ch === ' ' || ch === '' || ch === undefined);
				if(looksEmpty){
					try { this.setData(x-1,y-1,undefined,0,false); } catch(_){}
				}
			}
		}
		this.transparent = true;
		// Final cycle if available to refresh composed screen (callers may also cycle root)
		if(typeof this.cycle === 'function') try { this.cycle(); } catch(_){}
	} catch(e){
		try { log(LOG_WARNING, 'makeContentTransparent error: '+e); } catch(_){}
		this.transparent = true; // still enable transparency
	}
}
