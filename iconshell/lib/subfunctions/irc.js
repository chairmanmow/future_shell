// Chat / IRC Subprogram adapted from original chat_sec.js for IconShell framework
load('iconshell/lib/subfunctions/subprogram.js');
load('sbbsdefs.js');
load('nodedefs.js');
load('text.js');

(function(){
	// Load options (same precedence as original)
	var options = load('modopts.js','chat') || load('modopts.js','chat_sec') || {};
	if(options.irc === undefined) options.irc = true;
	if(options.finger === undefined) options.finger = true;
	if(options.imsg === undefined) options.imsg = true;
	if(options.irc_seclevel === undefined) options.irc_seclevel = 90;
	var irc_servers = options.irc_server ? options.irc_server.split(',') : ['irc.synchro.net 6667'];
	var irc_channels = options.irc_channel ? options.irc_channel.split(',') : ['#Synchronet'];
	function tidy(list){ var out=[]; for(var i=0;i<list.length;i++){ var s=(''+list[i]).trim(); if(s.length) out.push(s); } return out; }
	irc_servers = tidy(irc_servers); irc_channels = tidy(irc_channels);

	function IrcSection(opts){
		opts = opts || {}; opts.name = 'chat-section';
		Subprogram.call(this, opts);
		this.options = options;
		this.ircServers = irc_servers.slice();
        log("*** irc servers ***: " + JSON.stringify(this.ircServers));
		this.ircChannels = irc_channels.slice();
		this.listFrame = null; this.statusFrame = null;
		this.mode = 'menu';
	}
	if(typeof extend==='function') extend(IrcSection, Subprogram);

	IrcSection.prototype.enter = function(done){
		Subprogram.prototype.enter.call(this, done);
		this._ensureFrames();
		this._drawMenu();
	};

	IrcSection.prototype._ensureFrames = function(){
		if(!this.parentFrame){
			this.parentFrame = new Frame(1,1,console.screen_columns,console.screen_rows,BG_BLACK|LIGHTGRAY);
			this.parentFrame.open();
		}
		if(!this.listFrame){
			var h = Math.max(1,this.parentFrame.height-1);
			this.listFrame = new Frame(1,1,this.parentFrame.width,h,BG_BLACK|LIGHTGRAY,this.parentFrame); this.listFrame.open();
		}
		if(!this.statusFrame){
			this.statusFrame = new Frame(1,this.parentFrame.height,this.parentFrame.width,1,BG_BLUE|WHITE,this.parentFrame); this.statusFrame.open();
		}
	};

	IrcSection.prototype._status = function(msg){ if(!this.statusFrame) return; try{ this.statusFrame.clear(); this.statusFrame.gotoxy(1,1); this.statusFrame.putmsg((msg||'').substr(0,this.statusFrame.width)); this.statusFrame.cycle(); }catch(e){} };

	// Inline prompt within the status frame (echoes input). Returns null if aborted.
	IrcSection.prototype._promptStatus = function(label, initial){
		if(!this.statusFrame) return null;
		label = label || '';
		var maxw = this.statusFrame.width;
		var value = (initial||'');
		var pos = value.length;
		console.aborted = false;
		while(!console.aborted){
			try {
				this.statusFrame.clear();
				this.statusFrame.gotoxy(1,1);
				var shown = (label + value).substr(0,maxw);
				this.statusFrame.putmsg(shown);
				this.statusFrame.cycle();
			} catch(e){}
			var k = console.getkey(K_NOCRLF|K_NOSPIN|K_NOECHO);
			if(k==='\r') break;
			if(k==='\x1b'){ console.aborted=true; break; }
			if(k==='\b' || k==='\x7f') { if(pos>0){ value = value.substring(0,pos-1)+value.substring(pos); pos--; } continue; }
			if(k==='\x01'){ pos=0; continue; } // Ctrl-A home
			if(k==='\x05'){ pos=value.length; continue; } // Ctrl-E end
			if(k.length===1 && k>=' ' && k<='~') { value = value.substring(0,pos) + k + value.substring(pos); pos++; }
			if(value.length > (maxw - label.length)) { value = value.substring(0, maxw - label.length); pos = Math.min(pos, value.length); }
		}
		if(console.aborted) return null;
		return value.trim();
	};

	IrcSection.prototype._drawMenu = function(){
		var lf=this.listFrame; if(!lf) return; lf.clear();
		bbs.node_action = NODE_CHAT; bbs.nodesync();
		var keys = 'ACDJPQST?';
		if(this.options.imsg && user.compare_ars(this.options.imsg_requirements)) keys+='I';
		if(this.options.irc && user.compare_ars(this.options.irc_requirements)) keys+='R';
		if(this.options.finger && user.compare_ars(this.options.finger_requirements)) keys+='F';
		var lines = [
			'Chat / IRC Menu:',
			' A Toggle Activity Alerts',
			' C Page Sysop/Guru',
			' D Toggle Availability',
			(keys.indexOf('F')>=0?' F Finger Lookup':''),
			(keys.indexOf('I')>=0?' I Instant Msg Center':''),
			(keys.indexOf('J')>=0?' J Multinode Chat':''),
			(keys.indexOf('P')>=0?' P Private Chat':''),
			(keys.indexOf('R')>=0?' R IRC Connect':''),
			' S Toggle Split Screen',
			' T Page Guru',
			' Q Quit / ESC',
			' ? Redisplay Menu'
		];
		var y=1; for(var i=0;i<lines.length;i++){ var L=lines[i]; if(!L) continue; try{ lf.gotoxy(1,y++); lf.putmsg(L); }catch(e){} }
		lf.cycle();
		this._status('Keys: '+keys.split('').join(' '));
	};

	IrcSection.prototype._toggle = function(flag, userFlag, nodeFlag){
		try { var val = user.chat_settings ^= flag; if(nodeFlag) system.node_list[bbs.node_num-1].misc ^= nodeFlag; this._status('Now: '+((val & flag)?'OFF':'ON')); } catch(e){ this._status('Toggle error'); }
	};

	IrcSection.prototype._ircConnect = function(){
		if(!this.options.irc) { this._status('IRC disabled'); return; }
		var server = this.ircServers[0];
		if(this.ircServers.length>1){
			for(var i=0;i<this.ircServers.length;i++) console.uselect(i,'IRC Server',this.ircServers[i]);
			var s = console.uselect(); if(s>=0) server=this.ircServers[s]; else return;
		}
		if(user.security.level >= this.options.irc_seclevel || (user.security.exemptions & UFLAG_C)){
			server = this._promptStatus('Server: ', server) || ''; if(console.aborted||server.length<4) return;
		}
		var channelList = this.ircChannels;
		if(this.options[server] !== undefined) channelList = tidy(this.options[server].split(','));
		var chan = channelList[0];
		if(channelList.length>1){ for(var i=0;i<channelList.length;i++){ console.uselect(i,'IRC Channel',channelList[i]); } var c=console.uselect(); if(c>=0) chan=channelList[c]; else return; }
		else { chan = this._promptStatus('Channel: ', chan) || ''; if(console.aborted||!chan.length) return; }
		if(server.indexOf(' ')<0) server+=' 6667';
		log('IRC connect '+server+' '+chan);
		try { bbs.exec('?irc -a '+server+' '+chan); } catch(e){ this._status('IRC error'); }
	};

	IrcSection.prototype._handleKey = function(k){
		if(!k) return true;
		switch(k){
			case 'A': case 'a': this._toggle(CHAT_NOACT,null,NODE_AOFF); break;
			case 'S': case 's': this._toggle(CHAT_SPLITP); break;
			case 'D': case 'd': this._toggle(CHAT_NOPAGE,null,NODE_POFF); break;
			case 'F': case 'f': if(this.options.finger) { try { load('finger.js'); } catch(e){} } break;
			case 'I': case 'i': if(this.options.imsg) { try { load({},'sbbsimsg.js'); } catch(e){} } break;
			case 'R': case 'r': this._ircConnect(); break;
			case 'J': case 'j': try { bbs.multinode_chat(); } catch(e){} break;
			case 'P': case 'p': try { bbs.private_chat(); } catch(e){} break;
			case 'C': case 'c': try { if(!bbs.page_sysop() && !deny(format(bbs.text(ChatWithGuruInsteadQ), system.guru||'The Guru'))) bbs.page_guru(); } catch(e){} break;
			case 'T': case 't': try { bbs.page_guru(); } catch(e){} break;
			case '?': this._drawMenu(); break;
			case 'Q': case 'q': case '\x1b': this.exit(); return false;
			default: return true;
		}
		this._drawMenu();
		return true;
	};

	IrcSection.launch = function(shell, cb, opts){
		opts = opts || {}; opts.parentFrame = opts.parentFrame || (shell && shell.subFrame) || (shell && shell.root) || null; opts.shell = shell || opts.shell; var c = new IrcSection(opts); c.enter(cb); return c; };

	// export
	this.IrcSection = IrcSection;
})();
