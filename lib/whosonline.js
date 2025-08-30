// Returns an array of icon shell menu items for online users, with avatarObj attached
var getOnlineUserIcons = function() {
	var avatar_lib = load({}, '../exec/load/avatar_lib.js');
	var users = [];
	for (var n = 1; n <= system.nodes; n++) {
		var node = system.node_list[n-1];
		if (!node || !node.useron) continue;
		var user = new User(node.useron);
		var avatarObj = avatar_lib.read(user.number, user.alias);
        var iconFile = (avatar_lib.is_enabled && avatar_lib.is_enabled(avatarObj) && avatarObj.data) ? undefined : "user";
		users.push({
			label: user.alias + " (#" + n + ")",
			type: "item",
			iconFile: iconFile,
			avatarObj: avatarObj,
			node: n,
			usernum: user.number,
			hotkey: (n % 10).toString(), // 1-9, 0 for 10
			action: function() {
				// Show user info popup (placeholder)
				log(JSON.stringify(user));
				// console.clear();
				// console.putmsg("User: " + user.alias + "\r\nNode: " + n + "\r\n");
				// mswait(1000);
			}
		});
	}
	return users;
}




