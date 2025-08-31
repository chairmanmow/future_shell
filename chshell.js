/* mods/chshell.js
 * Supervisor/entrypoint for IconShell (advanced) with BasicShell fallback.
 * Set Command Shell to: ?mods/chshell
 */

load("sbbsdefs.js"); // LOG_* and K_* constants

// Load shell modules (define global IconShell() and BasicShell())
load("iconshell/iconshell.js");
load("iconshell/basicshell.js");

// ---- Supervisor config ----
var MAX_BASIC_RESTARTS = 5;   // stop after N crashes in a row (0 = infinite)
var BASIC_BACKOFF_MS   = 1500;
var BEEP_ON_CRASH      = true;


main();
var icsh;

function main() {
    // Try the advanced shell first
    log("Load supervisor Shell WTFSDSSDWEWE")
    while (true) {
        try {
            icsh = new IconShell(); // provided by mods/iconshell/iconshell.js
            icsh.init();
            // If IconShell returns normally, we're done.
            return;
        } catch (e) {
            // If IconShell throws 'Exit Shell' (string or Error), treat as fallback, not logoff
            var exitSignal = (typeof e === 'string' && e === 'Exit Shell') || (e && e.message === 'Exit Shell');
            if (!exitSignal) {
                safeLog(LOG_ERR, "[chshell] IconShell crashed: " + crashText(e));
                if (BEEP_ON_CRASH) beep(880, 120);
            }
            // else: treat as fallback, do not log error
        }

        // Fallback: run BasicShell under its own mini-supervisor
        var attempts = 0;
        var reloadRequested = false;
        for (;;) {
            try {
                attempts = 0; // reset on any successful entry
                BasicShell(function reloadIconShell() {
                    reloadRequested = true;
                });
                // user exited normally
                break;
            } catch (e2) {
                attempts++;
                safeLog(LOG_ERR, "[chshell] BasicShell crash #" + attempts + ": " + crashText(e2));
                if (BEEP_ON_CRASH) beep(660, 120);

                if (MAX_BASIC_RESTARTS && attempts >= MAX_BASIC_RESTARTS) {
                    writeln("");
                    writeln("\x01h\x01rBasicShell crashed repeatedly and will not restart (max reached).\x01n");
                    return;
                }

                writeln("");
                writeln("\x01yRecovering...\x01n restarting BasicShell in " + (BASIC_BACKOFF_MS/1000).toFixed(1) + "s");
                sleepMs(BASIC_BACKOFF_MS);
            }
        }
        if (reloadRequested) {
            // Hard reload iconshell.js and re-enter advanced shell
            load("iconshell/iconshell.js");
            continue;
        } else {
            // User exited BasicShell normally
            return;
        }
    }
}

function crashText(e) {
    var msg  = (e && e.message) ? e.message : String(e);
    var file = (e && e.fileName) ? e.fileName : "<unknown>";
    var line = (e && e.lineNumber) ? e.lineNumber : "?";
    return msg + " (" + file + ":" + line + ")";
}

function safeLog(level, text) {
    try { log(level, text); } catch(_) {}
    try { writeln("\x01h\x01r" + text + "\x01n"); } catch(_) {}
}

function sleepMs(ms) {
    if (typeof mswait === "function")
        mswait(ms);
    else {
        var end = (new Date()).getTime() + ms;
        while ((new Date()).getTime() < end)
            yield(true);
    }
}