var ANSI_COLORS = {
    BLACK: "\x1b[30m",
    RED: "\x1b[31m",
    GREEN: "\x1b[32m",
    YELLOW: "\x1b[33m",
    BLUE: "\x1b[34m",
    MAGENTA: "\x1b[35m",
    CYAN: "\x1b[36m",
    WHITE: "\x1b[37m",
    LIGHTGRAY: "\x1b[37;1m",
    RESET: "\x1b[0m"
};

var DEBUG_CONFIG = {
    hotspots: { active: false, log_color: ANSI_COLORS.BLUE },
    paint: { active: false, log_color: ANSI_COLORS.CYAN },
    chat: { active: false, log_color: ANSI_COLORS.MAGENTA },
    drawFolder: { active: false, log_color: ANSI_COLORS.GREEN },
    nav: { active: false, log_color: ANSI_COLORS.YELLOW },
    external: { active: false, log_color: ANSI_COLORS.RED },
    init: { active: false, log_color: ANSI_COLORS.RED },
    subprogram: { active: false, log_color: ANSI_COLORS.RED },
    keylog: { active: false, log_color: ANSI_COLORS.CYAN },
    hotkeys: { active: false, log_color: ANSI_COLORS.CYAN },
    icons: { active: false, log_color: ANSI_COLORS.CYAN },
    config: { active: false, log_color: ANSI_COLORS.CYAN },
    settings: { active: false, log_color: ANSI_COLORS.CYAN },
    view: { active: false, log_color: ANSI_COLORS.CYAN },
    messageboard: { active: true, log_color: ANSI_COLORS.CYAN },
    icon: { active: false, log_color: ANSI_COLORS.CYAN },
};



function dbug(msg, type) {
    try {
        var shouldLog = DEBUG_CONFIG[type].active;
        if (shouldLog) {
            log("[" + type + "] : " + msg);
        }
    } catch (err) {
        log("ERROR: [" + type + "] is not handled in DEBUG_CONFIG.  \r\n msg: " + msg);
    }

}
