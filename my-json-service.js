/*
 * my-json-service.js — futureland fork of /sbbs/exec/json-service.js (v1.39).
 *
 * Adds keepalive reaping of dead clients.  The stock service releases a
 * client's subscriptions only when socket.is_connected goes false, which
 * never happens for half-open TCP connections (peer crashed, NAT timeout,
 * carrier drop), so dead subscribers accumulate in every WHO roster until
 * the service restarts (json-db.js:128 carries the TODO for this).  Observed
 * 2026-07-28 on :10088: 54 subscriber entries on channels.main.messages for
 * 29 unique users, 26 half-open sockets from a single reconnecting host.
 *
 * The fork PINGs any client idle longer than KEEPALIVE_IDLE_MS and drops it
 * (close + release, which broadcasts UNSUBSCRIBE to remaining subscribers)
 * if no traffic arrives within KEEPALIVE_GRACE_MS.  Every known client
 * auto-answers {scope:"SOCKET",func:"PING"}: json-sock.js clients
 * (json-sock.js:58), fshell_ts (src/chat/json_service.ts classify()), and
 * the avatar_chat_universal Go door/bridges (internal/chat/transport.go:170).
 * Reaping also prevents broadcast writes from eventually blocking the whole
 * service on a dead socket's full TCP send buffer (sendJSON is blocking).
 *
 * Use per service entry in ctrl/services.ini (do NOT shadow the stock name;
 * json-service.js is referenced in many setups):
 *	[JSON]
 *	Port = 10088
 *	Options = STATIC | LOOP
 *	Command = my-json-service.js
 *
 * argv (all optional, positional):
 *	[0] service ini filename under ctrl/ (stock; default json-service.ini)
 *	[1] keepalive idle ms before a PING     (default 300000 = 5 min)
 *	[2] keepalive grace ms waiting for PONG (default 60000 = 1 min)
 *	[3] standalone listen port              (jsexec testing only)
 *	[4] chat database path                  (jsexec testing only)
 *
 * All changes vs stock are marked with "KEEPALIVE" comments.
 */

load("event-timer.js");
load("json-sock.js");
/* KEEPALIVE fork: my-json-db.js fixes the release-path UNSUBSCRIBE broadcast
   (stock notified a subscribe-time snapshot, so late joiners never heard
   leaves and dead sockets got writes) — required for reaped ghosts to
   disappear from connected clients' incremental user lists, not just WHO. */
load("my-json-db.js");
/* per-channel history cap for chat.json (see file header for why) */
load("json-chat-prune.js");

/**** SERVICE MODULES
 *
 * 	main service (socket service)
 * 		socket output
 * 		socket input
 * 		routing
 * 			module engine
 * 			service administration
 * 			chat engine
 *
 * 	module engine (game service)
 * 		database queries
 * 		module administration
 * 		module events
 *
 * 	event timer
 * 		timed events
 *
 * 	service administration
 * 		user authentication
 * 		service control
 * 		access control
 * 		service information
 *
 * 	chat engine
 * 		database queries
 * 		administration
 * */

/**** PACKET DATA
 *
 * 	module =
 * 		"SOCKET"
 * 		"SERVICE"
 * 		"CHAT"
 * 		(module name)
 *
 * 	func =
 * 		"QUERY"
 *		"ADMIN"
 *		(other function)
 *
 *	data =
 *		{..}
 *
 * */

/* KEEPALIVE: reaping configuration (argv[1]/argv[2]); [3]/[4] ease jsexec
   testing against a scratch port/database instead of the live ones */
var KEEPALIVE_IDLE_MS = Number(argv[1]) > 0 ? Number(argv[1]) : 300000;
var KEEPALIVE_GRACE_MS = Number(argv[2]) > 0 ? Number(argv[2]) : 60000;
var KEEPALIVE_SWEEP_MS = Math.min(15000, Math.max(1000, Math.floor(KEEPALIVE_GRACE_MS / 2)));
var CHAT_DB_FILE = argv[4] ? String(argv[4]) : (system.data_dir + "chat.json");

/* Running from jsexec presumably... */
if(js.global.server==undefined) {
	load("sockdefs.js");
	server={};
	server.socket=new Socket(SOCK_STREAM, 'JSONDB');
	server.socket.bind(Number(argv[3]) > 0 ? Number(argv[3]) : 10088,'127.0.0.1');
	server.socket.listen();
}

/* service module initialization file */
var timer;
var serviceIniFile;
var serviceIniFileDate;
init(argv[0]);

/* service init */
function init(fileName) {
	if(fileName != undefined) {
		if(file_exists(system.ctrl_dir + fileName))
			serviceIniFile = system.ctrl_dir + fileName;
		else
			throw("service initialization file missing: " + system.ctrl_dir + fileName);
	}
	else {
		serviceIniFile = system.ctrl_dir + "json-service.ini";
	}

	serviceIniFileDate = file_date(serviceIniFile);
	timer = new Timer();
	timer.addEvent(5000,true,checkUpdate);
	js.branch_limit=0;
}

/* main service loop */
function main() {
	while(!js.terminated) {
		service.cycle();
		chat.cycle();
		engine.cycle();
		timer.cycle();
	}
}

/* check service ini file for updates */
function checkUpdate() {
	if(file_date(serviceIniFile) > serviceIniFileDate)
		exit(0);
}

/* error values */
var errors = {
	UNKNOWN_MODULE:"Unknown module: %s",
	UNKNOWN_FUNCTION:"Unknown function: %s",
	UNKNOWN_COMMAND:"Unknown command: %s",
	UNKNOWN_USER:"User not found: %s",
	SERVICE_OFFLINE:"Service offline",
	MODULE_OFFLINE:"Module offline",
	IDENT_REQUIRED:"You must identify before using this command",
	NOT_AUTHORIZED:"You are not authorized to use that command",
	INVALID_PASSWORD:"Password incorrect"
};

/* server object */
service = new (function() {

	this.VERSION = "1.39";
	this.fileDate = file_date(serviceIniFile);
	this.online = true;
	this.sockets = [];
	this.denyhosts = [];
	this.timeout = 1;

	/* initialize server */
	this.init = function() {

		/* method called when socket is selected for reading */
		Socket.prototype.cycle = function() {
			var packet=this.recvJSON();
			/* if nothing was received, return */
			if(!packet)
				return false;
			/* KEEPALIVE: any complete packet proves the peer is alive */
			this.last_activity = Date.now();
			this.ping_pending = 0;
			/* if no module was specified, data assumed invalid */
			if(!packet.scope)
				return false;
			switch(packet.scope.toUpperCase()) {
			/* service administration */
			case "ADMIN":
				admin.process(this,packet);
				break;
			/* chat service */
			case "CHAT":
				chat.process(this,packet);
				break;
			/* socket data */
			case "SOCKET":
				service.process(this,packet);
				break;
			/* modular queries */
			default:
				engine.process(this,packet);
				break;
			}
		}

		/* configure server socket */
		server.socket.nonblocking = true;
		server.socket.cycle = function() {
			var client=this.accept();
			/* open and immediately close sockets if service is offline */
			if(!service.online) {
				client.close();
				return;
			}
			/* log and disconnect banned hosts */
			if(!service.verify(client)) {
				log(LOG_WARNING,"<--" + client.descriptor + ": " + client.remote_ip_address + " blocked");
				client.close();
				return;
			}

			/* log and initialize normal connections */
			log(LOG_INFO,"<--" + client.descriptor + ": " + client.remote_ip_address + " connected");
			client.nonblocking = true;
			client.id = client.descriptor;
			/* KEEPALIVE: liveness bookkeeping */
			client.last_activity = Date.now();
			client.ping_pending = 0;
			service.sockets.push(client);
			log(LOG_DEBUG,"JSON service clients: " + (service.sockets.length - 1));
		}

		this.sockets.push(server.socket);
		/* KEEPALIVE: periodic idle sweep on the shared event timer */
		timer.addEvent(KEEPALIVE_SWEEP_MS,true,function() { service.idleSweep(); });
		log(LOG_INFO,"server initialized (v" + this.VERSION + " keepalive fork; idle "
			+ KEEPALIVE_IDLE_MS + "ms, grace " + KEEPALIVE_GRACE_MS + "ms)");
	}
	/* process socket data */
	this.process = function(client,packet) {
		switch(packet.func.toUpperCase()) {
		case "PING":
			client.pingOut("PONG");
			break;
		case "PONG":
			client.pingIn(packet);
			break;
		default:
			error(client,"(service) " + errors.UNKNOWN_FUNCTION,packet.func);
			break;
		}
	}
	/* monitor sockets */
	this.cycle = function() {
		var active=socket_select(this.sockets,this.timeout);
		for each(var s in active) {
			this.sockets[s].cycle();
		}
		for(var s=1;s<this.sockets.length;s++) {
			if(!this.sockets[s].is_connected) {
				log(LOG_INFO,"<--" + this.sockets[s].descriptor + ": "
					+ this.sockets[s].remote_ip_address + " disconnected");
				this.release(this.sockets[s]);
				this.sockets.splice(s--,1);
			}
		}
	}
	/* KEEPALIVE: PING clients idle past the limit; close and release any that
	   never answer.  A half-open socket stays is_connected forever and would
	   otherwise hold its subscriptions — a ghost in every WHO roster — until
	   the service restarts.  close() feeds the cycle() reap path semantics;
	   release() broadcasts UNSUBSCRIBE to the remaining subscribers, so
	   connected clients' rosters heal on their own.  Uses its own
	   ping_pending stamp rather than json-sock's pingOut bookkeeping
	   (pingOut reads ping.time, which does not exist — always undefined). */
	this.idleSweep = function() {
		var now = Date.now();
		for(var s=1;s<this.sockets.length;s++) {
			var client=this.sockets[s];
			if(!client.is_connected)
				continue; /* next cycle() reaps these */
			if(client.last_activity == undefined) {
				client.last_activity = now;
				client.ping_pending = 0;
				continue;
			}
			if(client.ping_pending) {
				if(now - client.ping_pending >= KEEPALIVE_GRACE_MS) {
					log(LOG_INFO,"<--" + client.descriptor + ": " + client.remote_ip_address
						+ " keepalive timeout; dropping");
					client.close();
					this.release(client);
					this.sockets.splice(s--,1);
				}
			}
			else if(now - client.last_activity >= KEEPALIVE_IDLE_MS) {
				client.sendJSON({scope:"SOCKET",func:"PING",data:Date.now()});
				client.ping_pending = now;
			}
		}
	}
	/* check ip/host against ip/host.can && this.denyhosts[] */
	this.verify = function(client) {
		if(this.denyhosts[client.remote_ip_address])
			return false;
		if(system.trashcan("ip.can",client.remote_ip_address))
			return false;
		if(system.trashcan("ip-silent.can",client.remote_ip_address))
			return false;
		return true;
	}
	/* release all locks and auths for a socket */
	this.release = function(client) {
		engine.release(client);
		admin.release(client);
		chat.release(client);
		log(LOG_DEBUG,"JSON service clients: " + (this.sockets.length-1));
	}
	/* disconnect all clients and refuse new connections */
	this.close = function(client) {
		this.online = false;
		for(var s=1;s<this.sockets.length;s++) {
			if(this.sockets[s].descriptor != client.descriptor) {
				log(LOG_INFO,"<--" + this.sockets[s].descriptor + ": "
					+ this.sockets[s].remote_ip_address + " disconnected");
				this.sockets[s].close();
				this.release(this.sockets[s]);
				this.sockets.splice(s--,1);
			}
		}
		confirm(client,"Service offline");
	}
	/* open service for new connections */
	this.open = function(client) {
		this.online = true;
		confirm(client,"Service online");
	}
	this.init();
})();

/* chat handler */
chat = new (function() {
	/* KEEPALIVE fork: db path override for jsexec testing (argv[4]) */
	this.db = new JSONdb(CHAT_DB_FILE,"CHAT");
	this.authenticated = [];
	this.deny_hosts = [];

	/* HISTORY CAP: trim channels.*.history on load and once a minute so the
	   db file can never outgrow what the loader can parse */
	this.historyMax = chatHistoryMax();
	this.historyPruneMs = 60000;
	this.lastPrune = 0;
	this.prune = function() {
		this.lastPrune = Date.now();
		var dropped = pruneChatHistory(this.db, this.historyMax);
		if (dropped > 0)
			log(LOG_INFO, "chat history pruned: dropped " + dropped +
				" entries (cap " + this.historyMax + " per channel)");
		return dropped;
	};
	this.prune();

	this.cycle = function() {
		if (Date.now() - this.lastPrune >= this.historyPruneMs)
			this.prune();
		this.db.cycle();
	}
	this.process = function(client,packet) {
		switch(packet.func.toUpperCase()) {
		case "IDENT":
			this.ident(client,packet);
			break;
		case "BAN":
			if(!admin.verify(client,packet,90))
				break;
			this.ban(client,packet.ip);
			break;
		case "UNBAN":
			if(!admin.verify(client,packet,90))
				break;
			this.unban(client,packet.ip);
			break;
		case "QUERY":
			this.pushPrivate(packet);
			this.db.query(client,packet);
			break;
		default:
			error(client,"(chat) " + errors.UNKNOWN_FUNCTION,packet.func);
			break;
		}
	}
	/* futureland: native push for chat (mods/load/chat_push.js). This only
	   hands each write to that file's rules, reloading them whenever it or
	   the push/notify libraries change on disk, so changing who gets pushed
	   for what never needs a services recycle. Never blocks or alters the
	   write; a failure is logged and dropped. */
	this.chatPush = null;
	this.chatPushAt = -1;
	this.chatPushFiles = ["load/chat_push.js", "load/push_lib.js", "load/notify_lib.js"];
	this.pushPrivate = function(packet) {
		try {
			if(!packet.oper || String(packet.oper).toUpperCase() != "WRITE")
				return;
			var stamp = 0;
			for(var i = 0; i < this.chatPushFiles.length; i++)
				stamp = Math.max(stamp, file_date(system.mods_dir + this.chatPushFiles[i]));
			if(stamp != this.chatPushAt) {
				var scope = {};
				load(scope, system.mods_dir + "load/chat_push.js");
				this.chatPush = scope.getChatPush ? scope.getChatPush() : null;
				this.chatPushAt = stamp;
			}
			if(this.chatPush)
				this.chatPush.onWrite(packet, { db: this.db });
		} catch(e) {
			log(LOG_WARNING, "chat push: " + e);
		}
	}
	this.ident = function(client,data) {
		var username = data.username;
		var pw = data.pw;
		var usernum = system.matchuser(username);
		if(usernum  == 0) {
			error(client,"(chat) " + errors.UNKNOWN_USER,username);
			return false;
		}
		var usr = new User(usernum);
		var pass = md5_calc(usr.security.password.toUpperCase(),true);

		if(md5_calc(usr.security.password.toUpperCase(),true) != pw) {
			error(client,"(chat) " + errors.INVALID_PASSWORD);
			return false;
		}
		this.authenticated[client.descriptor] = usr;
		confirm(client,"Identified: " + username);
		return true;
	}
	this.ban = function(client,target) {
		if(client.remote_ip_address == target)
			return false;
		confirm(client,"Ban Added: " + target);
		this.denyhosts[target] = true;
	}
	this.unban = function(client,target) {
		if(client.remote_ip_address == target)
			return false;
		confirm(client,"Ban Removed: " + target);
		delete this.denyhosts[target];
	}
	this.release = function(client) {
		if(this.authenticated[client.id]) {
			log(LOG_DEBUG,"releasing auth: " + client.id);
			delete this.authenticated[client.id];
		}
		this.db.release(client);
	}
	log(LOG_DEBUG,"chat initialized");
})();

/* administrative tools */
admin = new (function() {
	this.authenticated = [];
	/* route packet to correct function */
	this.process = function(client,packet) {
		switch(packet.func.toUpperCase()) {
		case "IDENT":
			this.ident(client,packet);
			break;
		case "RESTART":
			if(!this.verify(client,packet,90))
				break;
			this.restart(client);
			break;
		case "BAN":
			if(!this.verify(client,packet,90))
				break;
			this.ban(client,packet.ip);
			break;
		case "UNBAN":
			if(!this.verify(client,packet,90))
				break;
			this.unban(client,packet.ip);
			break;
		case "CLOSE":
			if(!this.verify(client,packet,90))
				break;
			service.close(client);
			break;
		case "OPEN":
			if(!this.verify(client,packet,90))
				break;
			service.open(client);
			break;
		case "MODULES":
			if(!this.verify(client,packet,90))
				break;
			this.modules(client);
			break;
		case "TIME":
			this.time(client);
			break;
		default:
			error(client,"(admin) " + errors.UNKNOWN_FUNCTION,packet.func);
			break;
		}
	}
	/* release a socket from the list of authenticated users */
	this.time = function(client) {
		client.sendJSON({
			scope:undefined,
			func:"RESPONSE",
			oper:"TIME",
			data:time()
		});
	}
	this.release = function(client) {
		if(this.authenticated[client.id]) {
			log(LOG_DEBUG,"releasing auth: " + client.id);
			delete this.authenticated[client.id];
		}
	}
	this.modules = function(client) {
		var list = [];
		for each(var m in engine.modules) {
			list.push({name:m.name,status:m.online});
		}
		respond(client,list);
	}
	this.ident = function(client,data) {
		var username = data.username;
		var pw = data.pw;
		var usernum = system.matchuser(username);
		if(usernum  == 0) {
			error(client,"(admin) " + errors.UNKNOWN_USER,username);
			return false;
		}
		var usr = new User(usernum);
		if(md5_calc(usr.security.password.toUpperCase(),true) != pw) {
			error(client,"(admin) " + errors.INVALID_PASSWORD);
			return false;
		}
		this.authenticated[client.descriptor] = usr;
		confirm(client,"Identified: " + username);
		return true;
	}
	this.restart = function(client) {
		confirm(client,"Service Restarted");
		exit();
	}
	this.ban = function(client,target) {
		if(client.remote_ip_address == target)
			return false;
		confirm(client,"Ban Added: " + target);
		service.denyhosts[target] = true;
	}
	this.unban = function(client,target) {
		if(client.remote_ip_address == target)
			return false;
		confirm(client,"Ban Removed: " + target);
		delete service.denyhosts[target];
	}
	this.verify = function(client,packet,level) {
		if(!this.authenticated[client.id]) {
			error(client,"(admin) " + errors.IDENT_REQUIRED,packet.func);
			return false;
		}
		else if(this.authenticated[client.id].security.level < level) {
			error(client,"(admin) " + errors.NOT_AUTHORIZED,packet.func);
			return false;
		}
		return true;
	}
	log(LOG_DEBUG,"admin initialized");
})();

/* module handler */
engine = new (function() {
	this.modules = [];
	this.file = new File(serviceIniFile);

	/* load module list */
	this.init = function() {
		/* if there is no module initialization file, fuck it */
		if(!file_exists(this.file.name))
			return;
		this.file.open('r',true);
		var modules=this.file.iniGetAllObjects();
		this.file.close();
		for each(var m in modules) {
			try {
				this.modules[m.name.toUpperCase()]=new Module(m.name,m.dir,m.read,m.write);
				log(LOG_DEBUG,"loaded module: " + m.name);
			} catch (err) {
				log(LOG_ERROR, 'Failed to load module: ' + m.name + ', ' + err);
			}
		}
	}

	/* cycle module databases */
	this.cycle = function() {
		for each(var m in this.modules) {
			if(!m.online)
				continue;
			m.poll();
			m.db.cycle();
		}
	}

	/* process a module function */
	this.process = function(client,packet) {
		var module = this.modules[packet.scope.toUpperCase()];
		if(!module) {
			error(client,errors.UNKNOWN_MODULE,packet.scope);
			return false;
		}

		/* flag command as not handled */
		var handled = false;

		/* pass command to module method if it exists */
		if(module.commands && module.commands[packet.func.toUpperCase()])
			handled = module.commands[packet.func.toUpperCase()](client,packet);

		if(handled)
			return true;

		switch(packet.func.toUpperCase()) {
		case "QUERY":
			if(!this.verify(client,packet,module)) {
				error(client,"(" + module.name + ") " + errors.NOT_AUTHORIZED,packet.func);
				break;
			}
			module.db.query(client,packet);
			break;
		case "IDENT":
			break;
		case "RELOAD":
			if(!admin.verify(client,packet,90))
				break;
			if(module.queue)
				module.queue.write("RELOAD");
			confirm(client,module.name + " reloaded");
			module.init();
			break;
		case "CLOSE":
			if(!admin.verify(client,packet,90))
				break;
			module.online = false;
			confirm(client,module.name + " offline");
			break;
		case "STATUS":
			respond(client,module.online);
			break;
		case "OPEN":
			if(!admin.verify(client,packet,90))
				break;
			module.online = true;
			confirm(client,module.name + " online");
			break;
		case "READABLE":
			if(!admin.verify(client,packet,90))
				break;
			module.db.settings.KEEP_READABLE = !module.db.settings.KEEP_READABLE;
			break;
		case "SAVE":
			if(!admin.verify(client,packet,90))
				break;
			module.db.save();
			confirm(client,module.name + " data saved");
			break;
		case "READONLY":
			if(!admin.verify(client,packet,90))
				break;
			module.db.settings.READ_ONLY = !module.db.settings.READ_ONLY;
			break;
		default:
			error(client,"(" + module.name + ") " + errors.UNKNOWN_FUNCTION,packet.func);
			break;
		}

		return true;
	}

	/* verify a client's access to queries */
	this.verify = function(client,packet,module) {
		switch(packet.oper) {
		case "READ":
		case "SLICE":
			if(module.read > 0) {
				if(!admin.verify(client,packet,module.read)) {
					error(client,"(" + module.name + ") " + errors.NOT_AUTHORIZED,packet.oper);
					return false;
				}
			}
			break;
		case "WRITE":
		case "PUSH":
		case "POP":
		case "SHIFT":
		case "UNSHIFT":
		case "DELETE":
			if(module.write > 0) {
				if(!admin.verify(client,packet,module.write)) {
					error(client,"(" + module.name + ") " + errors.NOT_AUTHORIZED,packet.oper);
					return false;
				}
			}
			break;
		}
		return true;
	}

	/* release clients from module authentication and subscription */
	this.release = function(client) {
		for each(var m in this.modules) {
			m.db.release(client);
		}
	}

	/* module data */
	function Module(name, dir, read, write) {
		this.online = true;
		this.name = name;
		this.dir = backslash(fullpath(dir));
		this.queue = undefined;
		this.commands = {};
		this.read = read;
		this.write = write;
		this.db;

		this.poll = function() {
			if(this.queue != undefined) {
				var type = this.queue.poll();
				switch(type) {
					case "log":
						var data = this.queue.read(type);
						log(data.LOG_LEVEL,data.message);
						break;
					case true:
						var data = this.queue.read();
						//log(LOG_INFO,JSON.stringify(data));
						break;
					case false:
						break;
					default:
						var data = this.queue.read(type);
						log(LOG_ERROR,"unknown data received from background service: " + type);
						break;
				}
			}
		}

		this.init = function() {
			this.db=new JSONdb(this.dir+this.name+".json", this.name);
			/* load module background service file */
			if(file_exists(this.dir + "service.js")) {
				try {
					this.queue = load(true,this.dir + "service.js",this.dir);
				} catch(e) {
					log(LOG_ERROR,"(" + module.name + ") error loading module service");
				}
			}
			/* load module command file */
			if(file_exists(this.dir + "commands.js")) {
				try {
					load(this.commands,this.dir + "commands.js",this.dir);
				} catch(e) {
					log(LOG_ERROR,"(" + this.name + ") error loading module commands");
          log(e);
				}
			}
		}
		this.init();
	}

	this.init();
})();

/* error reporting/logging */
error = function(client,err,value) {
	var desc = format(err,value);
	log(LOG_ERROR,format(
		"JSON Service Error: (%s) %s",
		client.descriptor,desc
	));
	client.sendJSON({
		scope:undefined,
		func:"ERROR",
		oper:"ERROR",
		data:{
			description:desc,
			client:client.descriptor,
			ip:client.remote_ip_address
		}
	});
}

/* confirmation to client */
confirm = function(client,message) {
	client.sendJSON({
		scope:undefined,
		func:"OK",
		data:message
	});
}

/* packet request response to client */
respond = function(client,data) {
	client.sendJSON({
		scope:undefined,
		func:"RESPONSE",
		data:data
	});
}

main();
