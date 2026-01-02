// mods/future_shell/service.js
//
// Simple read-only usage analytics service
// Scope: ICSH_USAGE
// Reads external_usage.json directly, no JSONdb

log("ICSH_USAGE service.js loaded (direct JSON mode)");

var baseDir = system.mods_dir;
if (baseDir.slice(-1) !== "/" && baseDir.slice(-1) !== "\\") baseDir += "/";
baseDir += "future_shell/data/";
var usageFile = baseDir + "external_usage.json";

function readUsageFile() {
    try {
        if (!file_exists(usageFile)) return null;
        var f = new File(usageFile);
        if (!f.open("r")) return null;
        var txt = f.read();
        f.close();
        return JSON.parse(txt);
    } catch (e) {
        log("ICSH_USAGE parse error: " + e);
        return null;
    }
}

function summarize(data) {
    if (!data || typeof data !== "object") return null;

    var summary = {
        months: [],
        totals: {},
        programs: {},
        users: {}
    };

    for (var month in data) {
        if (!data.hasOwnProperty(month)) continue;
        summary.months.push(month);

        var m = data[month];

        if (m.programs) {
            for (var p in m.programs) {
                summary.programs[p] = (summary.programs[p] || 0) + (m.programs[p].count || 0);
            }
        }

        if (m.users) {
            for (var u in m.users) {
                summary.users[u] = (summary.users[u] || 0) + (m.users[u].count || 0);
            }
        }

        if (m.totals) {
            for (var k in m.totals) {
                summary.totals[k] = (summary.totals[k] || 0) + m.totals[k];
            }
        }
    }

    summary.months.sort();
    return summary;
}

function send(client, oper, location, data) {
    client.sendJSON({
        scope: "ICSH_USAGE",
        func: "RESPONSE",
        oper: oper,
        location: location,
        data: data
    });
}

this.query = function (client, packet) {
    var oper = String(packet.oper || "").toUpperCase();
    var location = String(packet.location || "");

    var raw = readUsageFile();
    if (!raw) {
        send(client, oper, location, { error: "usage file not available" });
        return;
    }

    // probe
    if (location === "__probe") {
        send(client, "READ", "__probe", {
            file: usageFile,
            months: Object.keys(raw).length
        });
        return;
    }

    // summary view
    if (location === "" || location === "summary") {
        send(client, "READ", location, summarize(raw));
        return;
    }

    // month view
    if (raw[location]) {
        send(client, "READ", location, raw[location]);
        return;
    }

    send(client, "READ", location, null);
};

this.cycle = function () {};
this.shutdown = function () {};