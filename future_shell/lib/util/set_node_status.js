"use strict";

load("nodedefs.js");
if (typeof registerModuleExports !== "function") {
	try { load("future_shell/lib/util/lazy.js"); } catch (_) { }
}

function writeNodeExt(nodeIndex, value) {
	var file = new File(system.ctrl_dir + "node.exb");
	if (!file.open(file.exists ? "rb+" : "wb+")) return false;
	file.position = nodeIndex * 128;
	for (var i = 0; i < 128; i++) {
		if (!file.writeBin(i < value.length ? ascii(value.charAt(i)) : 0, 1)) {
			file.close();
			return false;
		}
	}
	file.close();
	return true;
}

function setNodeStatus(text) {
	var nodeIndex = bbs.node_num - 1;
	if (nodeIndex < 0) return false;

	var value = text == null ? "" : String(text);
	value = value.replace(/\x00/g, "");
	if (value.length > 127) value = value.substr(0, 127);

	var node = system.node_list[nodeIndex];
	if (!node) return false;

	if (!value.length) {
		var clearedMisc = node.misc & ~NODE_EXT;
		if (clearedMisc !== node.misc) node.misc = clearedMisc;
		return writeNodeExt(nodeIndex, "");
	}

	var misc = node.misc | NODE_EXT;
	if (misc !== node.misc) node.misc = misc;
	return writeNodeExt(nodeIndex, value);
}

registerModuleExports({ setNodeStatus: setNodeStatus });
