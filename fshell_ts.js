/* mods/fshell_ts.js
 * Command-shell entry for fshell, the TypeScript port of future_shell.
 * Target of [shell:FSHELL_TS] in ctrl/main.ini (see fshell_ts/PORTING.md,
 * "Cutover").
 *
 * CANONICAL COPY: launcher/fshell_ts.js in the fshell_ts repository.
 * DEPLOYED COPY:  /sbbs/mods/fshell_ts.js — Synchronet resolves command
 * shells from the mods/exec ROOT only, so this stub is copied there while
 * everything else lives in the repo. Keep the two in sync.
 *
 * This stub is deliberately the ONLY uncompiled JavaScript in the fshell_ts
 * system: the supervisor (crash restart/backoff/fallback/logoff policy)
 * lives INSIDE the bundle where it is typed and tested. The stub's single
 * job is to guarantee that a bundle load/parse failure can never strand a
 * logged-on session at a dead prompt.
 */

"use strict";

try {
    load("/sbbs/mods/fshell_ts/dist/fshell.js");
} catch (e) {
    var msg = "fshell_ts: bundle failed: " +
        ((e && e.message) ? e.message : String(e)) +
        ((e && e.fileName) ? " (" + e.fileName + ":" + (e.lineNumber || "?") + ")" : "");
    try { log((typeof LOG_ERR === "number") ? LOG_ERR : 3, msg); } catch (_e1) { }
    try { writeln("\r\n\x01n\x01h\x01r" + msg + "\x01n"); } catch (_e2) { }
    try { bbs.logoff(false); } catch (_e3) { }
}
