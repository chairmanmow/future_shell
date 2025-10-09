/* mods/iconshell/basicshell.js
 * BasicShell: minimal, stable shell used as fallback.
 */

load("sbbsdefs.js"); // LOG_* and K_* constants

function BasicShell(onReloadAdvancedShell) {
    if (typeof console.mouse_mode !== 'undefined') {
        console.mouse_mode = true;
    }
    console.clear();
    header();

    while (true) {
        writeln("");
        if (typeof console.clear_hotspots === 'function') {
            try { console.clear_hotspots(); } catch (_eCl) { }
        }
        console.mnemonics(" ~W Who's online   ~M Messages   ~F Files   ~X Doors   ~H Help   ~R Reload IconShell   ~Q Quit\r\n");
        write(" Select: ");
        var ch = console.getkey().toUpperCase();

        switch (ch) {
            case 'W':
                console.clear(); header("WHO'S ONLINE");
                bbs.whos_online();
                promptContinue(); break;

            case 'M':
                console.clear(); header("MESSAGES");
                bbs.scan_subs();
                bbs.msg_menu();
                header(); break;

            case 'F':
                console.clear(); header("FILES");
                bbs.file_menu();
                header(); break;

            case 'X':
                console.clear(); header("EXTERNAL PROGRAMS");
                bbs.xtrn_sec();
                header(); break;

            case 'H':
                // console.clear(); header("HELP");
                // help();
                // promptContinue();
                MouseTest();
                break;

            case 'R':
                if (typeof onReloadAdvancedShell === 'function') {
                    writeln("");
                    writeln("\x01cReloading IconShell...\x01n");
                    onReloadAdvancedShell();
                    return;
                } else {
                    beep(880, 80);
                }
                break;

            case 'Q':
            case '\x1B': // ESC
                if (typeof console.clear_hotspots === 'function') {
                    try { console.clear_hotspots(); } catch (_eQ) { }
                }
                bbs.logoff(false)
                return; // clean exit

            default:
                beep(880, 80);
                break;
        }
        yield(true);
    }
}

// --- UI helpers (local to BasicShell module) ---
function header(subtitle) {
    writeln("\x01n\x01h\x01c==[ \x01wSynchronet JS BasicShell\x01c ]===========================");
    if (subtitle) writeln("\x01w " + subtitle + "\x01n");
    writeln("");
}

function help() {
    writeln(" W - Who's Online   : Show active nodes");
    writeln(" M - Messages       : Message scan/menu");
    writeln(" F - Files          : File areas menu");
    writeln(" X - Doors          : External programs (doors)");
    writeln(" H - Hotspot Test   : Mouse debugging");
    writeln(" R - Reload IconShell: Reload and return to IconShell (if available)");
    writeln(" Q - Quit           : Exit this shell");
}

function promptContinue() {
    writeln("");
    write(" Press any key to return... ");
    console.getkey();
}
