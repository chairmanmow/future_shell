load('future_shell/lib/subprograms/subprogram.js');

require('sbbsdefs.js',
    'BG_BLACK', 'BG_BLUE', 'BG_CYAN', 'BG_GREEN', 'BG_MAGENTA', 'BG_BROWN', 'BG_LIGHTGRAY',
    'LIGHTGRAY', 'WHITE', 'YELLOW', 'CYAN', 'MAGENTA', 'GREEN', 'RED', 'BLACK',
    'KEY_UP', 'KEY_DOWN', 'KEY_PGUP', 'KEY_PGDN', 'KEY_HOME', 'KEY_END', 'KEY_LEFT', 'KEY_RIGHT'
);

try { if (typeof Icon !== 'function') load('future_shell/lib/shell/icon.js'); } catch (e) { }

if (typeof KEY_UP === 'undefined') var KEY_UP = 0x4800;
if (typeof KEY_DOWN === 'undefined') var KEY_DOWN = 0x5000;
if (typeof KEY_PGUP === 'undefined') var KEY_PGUP = 0x4900;
if (typeof KEY_PGDN === 'undefined') var KEY_PGDN = 0x5100;
if (typeof KEY_HOME === 'undefined') var KEY_HOME = 0x4700;
if (typeof KEY_END === 'undefined') var KEY_END = 0x4F00;
if (typeof KEY_LEFT === 'undefined') var KEY_LEFT = 0x4B00;
if (typeof KEY_RIGHT === 'undefined') var KEY_RIGHT = 0x4D00;

var USAGE_VIEWER_VERSION = '20250108e';
var hideSysopXtrns = ['scfgansi'];

function UsageViewer(opts) {
    opts = opts || {};
    Subprogram.call(this, { name: 'usage-viewer', parentFrame: opts.parentFrame, shell: opts.shell, timer: opts.timer });
    var modsDir = system.mods_dir;
    if (modsDir && modsDir.slice(-1) !== '/' && modsDir.slice(-1) !== '\\') modsDir += '/';
    this.dataFile = modsDir + 'future_shell/data/external_usage.json';
    this.months = []; // includes synthesized All Time at index 0 after load
    this.index = 0; // month index (0 = All Time)
    this.top = 0; // scroll offset for program list
    this.listFrame = null;
    this.detailFrame = null;
    this.message = '';
    this.focus = 'program'; // unified list focus (no separate month/program focus now)
    this.programIndex = 0; // highlighted program row
    this.programTop = 0; // scroll offset for visible list window
    this._omitCodes = (opts.omitCodes || []); // array of program ids/codes to skip
    this._sortMode = 'time'; // 'time' | 'launches' | 'recent' | 'name'
    this._categoryFilter = null; // future: filter by xtrn category (not yet populated if catalog missing)
    this._categories = []; // unique categories collected (future enhancement)
    this._programFrames = [];
    this._programHotspots = {};
    this._iconLookup = null;
    this._version = USAGE_VIEWER_VERSION;
    this._programCatalog = null;
    this._programCategories = null; // id(lower) -> category label
    // Behavior flag: if true, unknown programs (not in catalog) are shown (fail-open). Default false -> fail-closed.
    this._failOpenOnUnknown = false;
    // Launch debounce tracking
    this._lastLaunchTime = 0;
    this._lastLaunchIndex = -1;
    // User filter state (null = no filter)
    this._userFilter = null; // user key from usage DB
    this._userFilterAlias = null; // cached alias
}
extend(UsageViewer, Subprogram);
UsageViewer.VERSION = USAGE_VIEWER_VERSION;

// Helper: derive a normalized access requirement string from varied field names.
UsageViewer.prototype._extractAccessRequirement = function (obj) {
    if (!obj) return '';
    var fields = ['ar', 'AR', 'access_requirements', 'required_ar', 'req_ar', 'sec_ar', 'secAR'];
    for (var i = 0; i < fields.length; i++) {
        var k = fields[i];
        if (obj[k] && typeof obj[k] === 'string' && obj[k].trim().length) return obj[k].trim();
    }
    return '';
};

UsageViewer.prototype.setParentFrame = function (frame) {
    this._ensureVersion(frame);
    this.parentFrame = frame;
    this._ownsParentFrame = !frame;
    this.listFrame = null;
    this.detailFrame = null;
    this._clearProgramResources();
};

UsageViewer.prototype.enter = function (done) {
    this._ensureVersion();
    this._loadData();
    Subprogram.prototype.enter.call(this, done);
};

UsageViewer.prototype._ensureVersion = function (frame) {
    if (this._version === USAGE_VIEWER_VERSION) return;
    try { this._clearProgramResources(); } catch (e1) { }
    if (this.listFrame) { try { this.listFrame.close(); } catch (e2) { } }
    if (this.detailFrame) { try { this.detailFrame.close(); } catch (e3) { } }
    this.listFrame = null;
    this.detailFrame = null;
    var opts = {
        parentFrame: (typeof frame !== 'undefined') ? frame : this.parentFrame,
        shell: this.shell,
        timer: this.timer
    };
    UsageViewer.call(this, opts);
    this._version = USAGE_VIEWER_VERSION;
};

UsageViewer.prototype._loadData = function () {
    this.months = [];
    this.index = 0;
    this.top = 0;
    this.message = '';
    this.focus = 'program';
    this.programIndex = 0;
    this.programTop = 0;
    this._clearProgramResources();
    var file = new File(this.dataFile);
    if (!file.exists) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    if (!file.open('r', true)) {
        this.message = 'Unable to open usage data file.';
        return;
    }
    var raw = file.readAll().join('\n');
    file.close();
    if (!raw.length) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    var data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        this.message = 'Usage data is corrupt.';
        return;
    }
    var keys = Object.keys(data || {});
    if (!keys.length) {
        this.message = 'No usage data recorded yet.';
        return;
    }
    keys.sort();
    keys.reverse(); // newest first
    var allTime = { month: 'All Time', count: 0, seconds: 0, programs: [], users: {}, lastTimestamp: 0 };
    var allProgramMap = {}; // id -> {count, seconds, lastTimestamp}
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var entry = data[key] || {};
        var totals = entry.totals || {};
        var programs = entry.programs || {};
        var perProgUserSet = {}; // pid -> { userKey: true }
        var programList = [];
        for (var pid in programs) {
            if (!programs.hasOwnProperty(pid)) continue;
            var p = programs[pid] || {};
            programList.push({
                id: pid,
                count: p.count || 0,
                seconds: p.seconds || 0,
                lastTimestamp: p.lastTimestamp || 0,
                uniqueUsers: 0
            });
        }
        programList.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return (b.seconds || 0) - (a.seconds || 0);
        });
        // Build monthly entry
        var monthEntry = {
            month: key,
            count: totals.count || 0,
            seconds: totals.seconds || 0,
            programs: programList,
            users: entry.users || {},
            lastTimestamp: entry.lastTimestamp || 0
        };
        this.months.push(monthEntry);
        // Aggregate per-user stats into allTime.users
        var usersMap = entry.users || {};
        for (var uk in usersMap) {
            if (!usersMap.hasOwnProperty(uk)) continue;
            var uInfo = usersMap[uk] || {};
            if (!allTime.users[uk]) allTime.users[uk] = { alias: uInfo.alias || uk, programs: {} };
            var srcProgStats = (uInfo.programs || {});
            var dstUser = allTime.users[uk];
            for (var upid in srcProgStats) {
                if (!srcProgStats.hasOwnProperty(upid)) continue;
                var usp = srcProgStats[upid] || {};
                if (!dstUser.programs[upid]) dstUser.programs[upid] = { count: 0, seconds: 0, lastTimestamp: 0 };
                var dstp = dstUser.programs[upid];
                dstp.count += usp.count || 0;
                dstp.seconds += usp.seconds || 0;
                if ((usp.lastTimestamp || 0) > (dstp.lastTimestamp || 0)) dstp.lastTimestamp = usp.lastTimestamp || 0;
                if (!perProgUserSet[upid]) perProgUserSet[upid] = {};
                perProgUserSet[upid][uk] = true;
            }
        }
        for (var pl = 0; pl < programList.length; pl++) {
            var plProg = programList[pl];
            if (plProg && perProgUserSet[plProg.id]) {
                var cnt = 0; var setRef = perProgUserSet[plProg.id];
                for (var sKey in setRef) if (setRef.hasOwnProperty(sKey)) cnt++;
                plProg.uniqueUsers = cnt;
            }
        }
        // Aggregate into all-time (apply omit filter later)
        for (var ap = 0; ap < programList.length; ap++) {
            var apProg = programList[ap];
            if (!apProg || !apProg.id) continue;
            var omit = this._omitCodes && this._omitCodes.indexOf(apProg.id) !== -1;
            if (omit) continue;
            if (!allProgramMap[apProg.id]) allProgramMap[apProg.id] = { id: apProg.id, count: 0, seconds: 0, lastTimestamp: 0 };
            var tgt = allProgramMap[apProg.id];
            tgt.count += apProg.count || 0;
            tgt.seconds += apProg.seconds || 0;
            if (apProg.lastTimestamp > tgt.lastTimestamp) tgt.lastTimestamp = apProg.lastTimestamp;
        }
        allTime.count += totals.count || 0;
        allTime.seconds += totals.seconds || 0;
        if (entry.lastTimestamp > allTime.lastTimestamp) allTime.lastTimestamp = entry.lastTimestamp;
    }
    // Finalize all-time program list
    var allTimeUserSets = {};
    for (var au in allTime.users) if (allTime.users.hasOwnProperty(au)) {
        var auInfo = allTime.users[au] || {};
        var auProgMap = auInfo.programs || {};
        for (var apid in auProgMap) if (auProgMap.hasOwnProperty(apid)) {
            if (!allTimeUserSets[apid]) allTimeUserSets[apid] = {};
            allTimeUserSets[apid][au] = true;
        }
    }
    for (var pidAll in allProgramMap) if (allProgramMap.hasOwnProperty(pidAll)) {
        var allEntry = allProgramMap[pidAll];
        if (allTimeUserSets[pidAll]) {
            var cu = 0; var uset = allTimeUserSets[pidAll];
            for (var kU in uset) if (uset.hasOwnProperty(kU)) cu++;
            allEntry.uniqueUsers = cu;
        } else allEntry.uniqueUsers = 0;
        allTime.programs.push(allEntry);
    }
    // Sort all-time list by default sort (time)
    this._sortPrograms(allTime.programs);
    // Place all time at front
    this.months.unshift(allTime);
};

UsageViewer.prototype.ensureFrames = function () {
    var host = this.hostFrame || this.parentFrame;
    if (!host) return;
    var width = host.width;
    var height = host.height;
    if (height < 2) height = 2;
    // New layout: list consumes full height minus 1 header row (or 2 rows). We'll use 2-line header.
    var headerHeight = 1;  // doesn't look like we are using a frame for this.
    var listHeight = Math.max(1, height - headerHeight);
    var detailHeight = 0; // deprecated (still keep frame for compatibility)
    var detailY = host.y + height; // off-screen effectively
    if (this.listFrame) {
        var needsListRebuild = this.listFrame.width !== width || this.listFrame.height !== listHeight
            || this.listFrame.x !== host.x || this.listFrame.y !== host.y;
        if (needsListRebuild) {
            try { this.listFrame.close(); } catch (eCloseList) { }
            this.listFrame = null;
        }
    }
    if (!this.listFrame) {
        this.listFrame = new Frame(host.x, host.y, width, listHeight, BG_BLACK | LIGHTGRAY, host);
        log("Created list frame at y=" + host.y + ", height=" + listHeight);

        this.listFrame.open();
        this.registerFrame(this.listFrame);
    }
    this.setBackgroundFrame(this.listFrame);
    if (this.detailFrame) {
        var needsDetailRebuild = this.detailFrame.width !== width || this.detailFrame.height !== detailHeight
            || this.detailFrame.x !== host.x || this.detailFrame.y !== detailY;
        if (needsDetailRebuild) {
            try { this.detailFrame.close(); } catch (eCloseDetail) { }
            this.detailFrame = null;
        }
    }
    if (!this.detailFrame) { // stub frame retained for legacy refs; not displayed
        this.detailFrame = new Frame(host.x, detailY, width, Math.max(1, detailHeight), BG_BLACK | LIGHTGRAY, host);
        log("Created detail frame at y=" + detailY + ", height=" + detailHeight);
        try { this.detailFrame.open(); } catch (eDF) { }
        this.registerFrame(this.detailFrame);
    }
};

UsageViewer.prototype.draw = function () {
    this.ensureFrames();
    if (!this.listFrame) return;
    var lf = this.listFrame;
    lf.attr = BG_BLACK | LIGHTGRAY;
    lf.clear(BG_BLACK | LIGHTGRAY);
    lf.gotoxy(1, 1);
    // Header (line 1 & 2)
    lf.clear(BG_BLACK | LIGHTGRAY);
    var current = this.months[this.index] || { month: 'All Time', count: 0, seconds: 0, programs: [] };
    // Prepare filtered program list early for header counts
    var rawProgsForHeader = (current.programs || []).slice(0);
    if (this._categoryFilter) {
        this._ensureProgramCatalog();
        var tmpCat = [];
        for (var hcp = 0; hcp < rawProgsForHeader.length; hcp++) {
            var hpid = rawProgsForHeader[hcp].id || '';
            var hcat = this._programCategories && this._programCategories[hpid.toLowerCase()];
            if (hcat === this._categoryFilter) tmpCat.push(rawProgsForHeader[hcp]);
        }
        rawProgsForHeader = tmpCat;
    }
    // Access filter (remove programs user cannot launch)
    var tmpAccess = [];
    for (var hap = 0; hap < rawProgsForHeader.length; hap++) {
        if (this._userHasAccess(rawProgsForHeader[hap].id)) tmpAccess.push(rawProgsForHeader[hap]);
    }
    rawProgsForHeader = tmpAccess;
    // Always filter to only programs that have an icon
    var tmpIcon = [];
    for (var hip = 0; hip < rawProgsForHeader.length; hip++) {
        if (this._lookupIconBase(rawProgsForHeader[hip].id)) tmpIcon.push(rawProgsForHeader[hip]);
    }
    rawProgsForHeader = tmpIcon;
    // Build directional month navigation header without explicit help text.
    var monthNav = '';
    var totalMonths = this.months.length;
    var monthName = current.month;
    // Color legend: cyan brackets/arrows (\x01c), light blue month (bright blue \x01h\x01b), yellow directional arrows (\x01h\x01y)
    if (totalMonths <= 1) {
        monthNav = '\x01c[\x01h\x01b' + monthName + '\x01c]';
    } else if (this.index === 0) {
        // First (All Time) only has a forward indicator to the right
        monthNav = '\x01c[\x01h\x01b' + monthName + '\x01h\x01y>';
    } else if (this.index === totalMonths - 1) {
        // Last month only has a backward indicator to the left
        monthNav = '\x01h\x01y<\x01h\x01b' + monthName + '\x01c]';
    } else {
        // Middle month(s) show both directions
        monthNav = '\x01h\x01y<\x01h\x01b' + monthName + '\x01h\x01y>';
    }

    // Color-coded sort mode
    var sortColor = '\x01h\x01w'; // default for launches (white/gray)
    if (this._sortMode === 'time') sortColor = '\x01h\x01g'; // light green
    else if (this._sortMode === 'recent') sortColor = '\x01h\x01r'; // bright red
    else if (this._sortMode === 'name') sortColor = '\x01h\x01c'; // light cyan
    else if (this._sortMode === 'launches') sortColor = '\x01h\x01w'; // white / gray
    else if (this._sortMode === 'unique') sortColor = '\x01h\x01b'; // light blue
    var sortLabel = (this._sortMode === 'unique') ? 'uniquePlayers' : this._sortMode;

    var headerParts = [];
    headerParts.push(monthNav);
    // Force the 'Sort:' label itself to white, then apply color to the mode value
    headerParts.push('\x01h\x01wSort:\x01n' + sortColor + sortLabel + '\x01n');
    var displayLaunches = current.count;
    var displaySeconds = current.seconds;
    if (this._userFilter) {
        // If user filter active, compute user-specific totals for selected month
        var monthUsers = current.users || {};
        var uf = monthUsers[this._userFilter];
        if (uf && uf.programs) {
            displayLaunches = 0; displaySeconds = 0;
            for (var upk in uf.programs) if (uf.programs.hasOwnProperty(upk)) {
                var ups = uf.programs[upk];
                displayLaunches += ups.count || 0;
                displaySeconds += ups.seconds || 0;
            }
        }
    }
    headerParts.push('Launches ' + displayLaunches);
    headerParts.push('Time ' + this._formatDuration(displaySeconds));
    headerParts.push('Programs ' + rawProgsForHeader.length);
    if (this._categoryFilter) headerParts.push('Cat:' + this._categoryFilter);
    if (this._userFilterAlias) headerParts.push('User ' + this._userFilterAlias);
    var header1 = headerParts.join('  ');
    if (header1.length > lf.width) header1 = header1.substr(0, lf.width);
    try { lf.gotoxy(1, 1); lf.putmsg(header1 + '\x01n'); } catch (_) { }
    // Dynamic help line: show user filter state inline.
    // Color legend: \x01m = magenta, \x01w = white/gray, \x01h = high intensity, \x01n = reset
    var userStateLabel = this._userFilterAlias ? this._userFilterAlias : 'All Users';
    // Surround variable user label with light magenta (high + magenta) for emphasis
    var help2 = '\x01h\x01mU\x01n=\x01h\x01m' + userStateLabel + '\x01n  S=Sort  C=Cat  R=Reload  ENTER=Launch';
    if (help2.length > lf.width) help2 = help2.substr(0, lf.width);
    try { lf.gotoxy(1, 2); lf.putmsg(help2 + '\x01n'); } catch (_) { }
    // Stylized icon block rendering (restored)
    var startRow = 3; // after two header lines
    var availableRows = lf.height - (startRow - 1);
    if (availableRows < 1) availableRows = 1;
    this._sortPrograms(current.programs);
    var progs = current.programs || [];
    // Apply user filter early: replace program list with user-specific stats
    if (this._userFilter) {
        var monthUsers2 = current.users || {};
        var uSel = monthUsers2[this._userFilter];
        if (uSel && uSel.programs) {
            var derived = [];
            for (var pidUF in uSel.programs) if (uSel.programs.hasOwnProperty(pidUF)) {
                // Only include if exists in aggregated list OR allow anyway (include icon filter later)
                var stats = uSel.programs[pidUF] || {};
                derived.push({ id: pidUF, count: stats.count || 0, seconds: stats.seconds || 0, lastTimestamp: stats.lastTimestamp || 0 });
            }
            progs = derived;
        } else {
            progs = [];
        }
    }
    if (this._categoryFilter) {
        this._ensureProgramCatalog();
        var filteredCat = [];
        for (var fcp = 0; fcp < progs.length; fcp++) {
            var cpid = progs[fcp].id || '';
            var ccat = this._programCategories && this._programCategories[cpid.toLowerCase()];
            if (ccat === this._categoryFilter) filteredCat.push(progs[fcp]);
        }
        progs = filteredCat;
    }
    // Apply user access filter before icon filtering
    var filteredAccess = [];
    for (var acp = 0; acp < progs.length; acp++) {
        if (this._userHasAccess(progs[acp].id)) filteredAccess.push(progs[acp]);
    }
    progs = filteredAccess;
    // Enforce icon presence
    var filteredIcon = [];
    for (var fip = 0; fip < progs.length; fip++) {
        if (this._lookupIconBase(progs[fip].id)) filteredIcon.push(progs[fip]);
    }
    progs = filteredIcon;
    // Clamp selection indices and handle empty list
    if (!progs.length) {
        this.programIndex = 0;
        this.programTop = 0;
        // Show a simple message when nothing is available
        try { lf.gotoxy(1, startRow); lf.putmsg('\x01h\x01c(No accessible icon programs)\x01n'); } catch (_m) { }
        try { lf.cycle(); } catch (_mc) { }
        return;
    }
    if (this.programIndex < 0) this.programIndex = 0;
    if (this.programIndex >= progs.length) this.programIndex = Math.max(0, progs.length - 1);
    if (this.programTop > this.programIndex) this.programTop = this.programIndex;
    // Compute block layout metrics
    var blockHeight = 7; // increased for Total players line
    var spacer = 1;
    var step = blockHeight + spacer;
    var maxVisible = Math.max(1, Math.floor((availableRows + spacer) / step));
    // Try to use leftover space if enough for an additional full block (not just spacer)
    var usedRows = (maxVisible * step) - spacer; // last block doesn't need trailing spacer
    var leftover = availableRows - usedRows;
    if (leftover >= blockHeight) maxVisible++;
    // Adjust scroll window to keep selection visible
    if (this.programIndex < this.programTop) this.programTop = this.programIndex;
    while (this.programIndex >= this.programTop + maxVisible) this.programTop++;
    // Clear existing program frames
    this._clearProgramResources();
    // Draw visible blocks
    var hotspots = {};
    for (var vis = 0; vis < maxVisible; vis++) {
        var idx = this.programTop + vis;
        if (idx >= progs.length) break;
        var y = startRow + vis * step;
        if (y > lf.height) break;
        var remaining = (lf.height - y) + 1;
        var blockHeightAdjusted = Math.min(blockHeight, remaining);
        if (blockHeightAdjusted <= 0) break;
        // Temporarily map month.programs to filtered list entry for block renderer
        var prog = progs[idx];
        this._drawProgramBlock(lf, y, blockHeightAdjusted, prog, idx, hotspots, vis);
    }
    this._programHotspots = hotspots;
    try { lf.cycle(); } catch (_c) { }
};
UsageViewer.prototype._formatProgramLine = function (index, prog) {
    if (!prog) return '';
    var name = this._formatProgramName(prog.id);
    var dur = this._formatDuration(prog.seconds);
    var launches = prog.count || 0;
    var recent = prog.lastTimestamp ? this._shortRecent(prog.lastTimestamp) : '---';
    var line = format('%3u %-20s %8s %6u %s', index + 1, name.substr(0, 20), dur, launches, recent);
    return line;
};

UsageViewer.prototype._shortRecent = function (ts) {
    if (!ts) return '---';
    var seconds = Math.floor(ts / 1000);
    try { return strftime('%m-%d %H:%M', seconds); } catch (e) { return '' + seconds; }
};

UsageViewer.prototype._sortPrograms = function (list) {
    if (!list || !list.length) return;
    var mode = this._sortMode;
    list.sort(function (a, b) {
        if (mode === 'time') {
            if (b.seconds !== a.seconds) return b.seconds - a.seconds;
            if (b.count !== a.count) return b.count - a.count;
            return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
        } else if (mode === 'launches') {
            if (b.count !== a.count) return b.count - a.count;
            if (b.seconds !== a.seconds) return b.seconds - a.seconds;
            return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
        } else if (mode === 'recent') {
            if ((b.lastTimestamp || 0) !== (a.lastTimestamp || 0)) return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
            if (b.seconds !== a.seconds) return b.seconds - a.seconds;
            return b.count - a.count;
        } else if (mode === 'name') {
            var A = (a.id || '').toLowerCase(); var B = (b.id || '').toLowerCase();
            if (A > B) return 1; if (A < B) return -1;
            return 0;
        } else if (mode === 'unique') {
            var au = (typeof a.uniqueUsers === 'number') ? a.uniqueUsers : -1;
            var bu = (typeof b.uniqueUsers === 'number') ? b.uniqueUsers : -1;
            if (bu !== au) return bu - au;
            if (b.seconds !== a.seconds) return b.seconds - a.seconds;
            if (b.count !== a.count) return b.count - a.count;
            return (b.lastTimestamp || 0) - (a.lastTimestamp || 0);
        }
        return 0;
    });
    if (mode === 'unique') {
        try { log('[usage-viewer] sorted by unique, first item: ' + (list[0] ? list[0].id + ' (' + list[0].uniqueUsers + ')' : 'none')); } catch (_) { }
    }
};

UsageViewer.prototype._formatMonthLine = function (item) {
    var dur = this._formatDuration(item.seconds);
    var progCount = item.programs ? item.programs.length : 0;
    return format('%s  Launches: %5u  Time: %s  Programs: %u', item.month, item.count, dur, progCount);
};

UsageViewer.prototype._drawDetail = function () {
    if (!this.detailFrame) return;
    var df = this.detailFrame;
    df.attr = BG_BLACK | LIGHTGRAY;
    df.clear(BG_BLACK | LIGHTGRAY);
    df.gotoxy(1, 1);
    this._clearProgramResources();
    if (!this.months.length) {
        df.putmsg('ESC=Exit');
        df.cycle();
        return;
    }
    var current = this.months[this.index];
    var header = format('Month %s  Launches %u  Time %s  [v%s]', current.month, current.count, this._formatDuration(current.seconds), this._version || '?');
    if (header.length > df.width) header = header.substr(0, df.width);
    df.putmsg('\x01n\x01h' + header + '\x01n\r\n');
    df.putmsg('\r\n');
    this._drawProgramBlocks(df, current);
    var hasPrograms = (current.programs || []).length > 0;
    var instructions;
    if (this.focus === 'program') instructions = 'ESC=Exit  LEFT=Months  Up/Down=Programs  1-9=Select  R=Reload';
    else instructions = hasPrograms ? 'ESC=Exit  RIGHT=Programs  Up/Down=Months  R=Reload'
        : 'ESC=Exit  Up/Down=Months  R=Reload';
    if (instructions.length > df.width) instructions = instructions.substr(0, df.width);
    df.gotoxy(1, df.height);
    df.putmsg(instructions);
    df.cycle();
};

UsageViewer.prototype._formatDuration = function (seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    var hrs = Math.floor(seconds / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var secs = Math.floor(seconds % 60);
    return format('%02d:%02d:%02d', hrs, mins, secs);
};

UsageViewer.prototype.handleKey = function (key) {
    if (!key) return;
    // Hotspot activation: if key corresponds to a hotspot index (1-9) in _programHotspots
    if (typeof key === 'string' && key.length === 1 && (key >= '1' && key <= '9') && this._programHotspots && this._programHotspots[key] !== undefined) {
        var idx = this._programHotspots[key];
        // Rebuild visible list to confirm bounds
        var list = this._currentVisiblePrograms ? this._currentVisiblePrograms() : [];
        if (idx >= 0 && idx < list.length) {
            this.programIndex = idx;
            this._launchSelected();
            log("Launching from hotspot key " + key);
            // try { this.draw(); } catch (e) { }
            return;
        }
    }
    switch (key) {
        case '\x1B': case 'Q': case 'q': this.exit(); return;
        case 'R': case 'r': this._loadData(); this.draw(); return;
        case 'S': case 's': this._cycleSort(); this.draw(); return;
        case 'C': case 'c': this._cycleCategory(); this.draw(); return;
        case 'U': case 'u': this._showUserFilter(); return;
        // case '\r':
        // case '\n':
        case KEY_ENTER:
            log("Launching from Enter/Return key" + key + String.charCodeAt(0));
            this._launchSelected();
            return;
        case KEY_LEFT: if (this.index > 0) { this.index--; this.programIndex = 0; this.programTop = 0; this.draw(); } return;
        case KEY_RIGHT: if (this.index < this.months.length - 1) { this.index++; this.programIndex = 0; this.programTop = 0; this.draw(); } return;
        case KEY_UP:
            if (this.programIndex > 0) {
                this.programIndex--; this.draw();
            } return;
        case KEY_DOWN:
            var progs = (this.months[this.index] && this.months[this.index].programs) ? this.months[this.index].programs : [];
            if (this.programIndex < progs.length - 1) { this.programIndex++; this.draw(); }
            return;
        case KEY_PGUP: this.programIndex = Math.max(0, this.programIndex - (this.listFrame ? this.listFrame.height - 2 : 5)); this.draw(); return;
        case KEY_PGDN: {
            var progs2 = (this.months[this.index] && this.months[this.index].programs) ? this.months[this.index].programs : [];
            this.programIndex = Math.min(progs2.length - 1, this.programIndex + (this.listFrame ? this.listFrame.height - 2 : 5));
            this.draw(); return;
        }
        default: return;
    }
};

UsageViewer.prototype._cycleSort = function () {
    var order = ['time', 'launches', 'recent', 'name', 'unique'];
    var idx = order.indexOf(this._sortMode);
    if (idx === -1) idx = 0; else idx = (idx + 1) % order.length;
    this._sortMode = order[idx];
};

UsageViewer.prototype._cycleCategory = function () {
    this._ensureProgramCatalog();
    if (!this._categories || !this._categories.length) { this._categoryFilter = null; return; }
    if (this._categoryFilter === null) { this._categoryFilter = this._categories[0]; return; }
    var idx = this._categories.indexOf(this._categoryFilter);
    if (idx === -1) { this._categoryFilter = null; return; }
    idx = (idx + 1) % (this._categories.length + 1);
    if (idx >= this._categories.length) this._categoryFilter = null; else this._categoryFilter = this._categories[idx];
};

// Reconstruct current visible (filtered) program list (same logic as draw)
UsageViewer.prototype._currentVisiblePrograms = function () {
    var current = this.months[this.index] || { programs: [] };
    var progs;
    if (this._userFilter) {
        var uEnt = (current.users || {})[this._userFilter];
        if (uEnt && uEnt.programs) {
            progs = [];
            for (var pid in uEnt.programs) if (uEnt.programs.hasOwnProperty(pid)) {
                var st = uEnt.programs[pid] || {};
                progs.push({ id: pid, count: st.count || 0, seconds: st.seconds || 0, lastTimestamp: st.lastTimestamp || 0 });
            }
        } else {
            progs = [];
        }
    } else {
        progs = (current.programs || []).slice(0);
    }
    this._sortPrograms(progs);
    if (this._categoryFilter) {
        this._ensureProgramCatalog();
        var filteredCat = [];
        for (var i = 0; i < progs.length; i++) {
            var pid = progs[i].id || '';
            var cat = this._programCategories && this._programCategories[pid.toLowerCase()];
            if (cat === this._categoryFilter) filteredCat.push(progs[i]);
        }
        progs = filteredCat;
    }
    var filteredAccess = [];
    for (var a = 0; a < progs.length; a++) if (this._userHasAccess(progs[a].id)) filteredAccess.push(progs[a]);
    progs = filteredAccess;
    var withIcons = [];
    for (var j = 0; j < progs.length; j++) if (this._lookupIconBase(progs[j].id)) withIcons.push(progs[j]);
    return withIcons;
};

UsageViewer.prototype._launchSelected = function () {
    var list = this._currentVisiblePrograms();
    if (!list.length) return;
    if (this.programIndex < 0 || this.programIndex >= list.length) return;
    this._launchProgram(list[this.programIndex].id);
    this._loadData();
    this.draw();
};

UsageViewer.prototype._launchProgram = function (programId) {
    if (!programId) return;
    var code = String(programId);
    var colon = code.lastIndexOf(':');
    if (colon !== -1) code = code.substr(colon + 1);
    try {
        if (this.shell && typeof this.shell.runExternal === 'function') {
            var self = this;
            this.shell.runExternal(function () { try { bbs.exec_xtrn(code); } catch (e) { } finally { try { self.draw(); } catch (e2) { } } }, { programId: code });
        } else if (typeof bbs !== 'undefined' && bbs && typeof bbs.exec_xtrn === 'function') {
            bbs.exec_xtrn(code);
            try { this.draw(); } catch (e3) { }
        }
    } catch (e) { }
};


UsageViewer.prototype.cleanup = function () {
    this._clearProgramResources();
    if (this.listFrame) { try { this.listFrame.close(); } catch (e) { } }
    if (this.detailFrame) { try { this.detailFrame.close(); } catch (e) { } }
    this.listFrame = this.detailFrame = null;
    Subprogram.prototype.cleanup.call(this);
};

UsageViewer.prototype._clearProgramResources = function () {
    if (this._programFrames && this._programFrames.length) {
        for (var i = 0; i < this._programFrames.length; i++) {
            try { this._programFrames[i].close(); } catch (e) { }
        }
    }
    this._programFrames = [];
    this._programHotspots = {};
    if (typeof console !== 'undefined' && typeof console.clear_hotspots === 'function') {
        try { console.clear_hotspots(); } catch (e) { }
    }
};

UsageViewer.prototype._ensureIconLookup = function () {
    if (this._iconLookup) return;
    this._iconLookup = {};
    var dirBase = system.mods_dir;
    if (dirBase && dirBase.slice(-1) !== '/' && dirBase.slice(-1) !== '\\') dirBase += '/';
    dirBase += 'future_shell/assets/';
    var patterns = ['*.bin', '*.ans'];
    for (var p = 0; p < patterns.length; p++) {
        var list;
        try { list = directory(dirBase + patterns[p]) || []; } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) {
            var full = list[i];
            if (!full) continue;
            var name = full.substr(full.lastIndexOf('/') + 1);
            if (!name) continue;
            var base = name.replace(/\.(ans|bin)$/i, '');
            if (!base) continue;
            this._iconLookup[base.toUpperCase()] = base;
        }
    }
};

UsageViewer.prototype._lookupIconBase = function (programId) {
    var key = programId ? String(programId).toUpperCase() : '';
    if (!key) return null;
    if (typeof ICON_LOOKUP === 'object' && ICON_LOOKUP && ICON_LOOKUP[key]) return ICON_LOOKUP[key];
    this._ensureIconLookup();
    return this._iconLookup[key] || null;
};

UsageViewer.prototype._getIconPalette = function () {
    function filter(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (typeof list[i] === 'number') out.push(list[i]);
        }
        return out;
    }
    var bg = filter([BG_BLUE, BG_CYAN, BG_GREEN, BG_MAGENTA, BG_BROWN, BG_LIGHTGRAY, BG_BLACK]);
    var fg = filter([WHITE, LIGHTGRAY, YELLOW, CYAN, GREEN, MAGENTA, BLACK]);
    if (!bg.length) bg.push(BG_BLACK);
    if (!fg.length) fg.push(LIGHTGRAY);
    return { bg: bg, fg: fg };
};

UsageViewer.prototype._hashString = function (str) {
    str = String(str || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    if (hash === 0) hash = 1;
    return Math.abs(hash);
};

UsageViewer.prototype._formatProgramName = function (programId) {
    if (!programId) return 'Unknown';
    var name = String(programId);
    var colon = name.lastIndexOf(':');
    if (colon !== -1) name = name.substr(colon + 1);
    name = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name.length) return 'Unknown';
    if (/^[A-Z0-9]+$/.test(name)) return name;
    var parts = name.split(' ');
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        if (!part.length) continue;
        parts[i] = part.charAt(0).toUpperCase() + part.substr(1);
    }
    return parts.join(' ');
};

UsageViewer.prototype._ensureProgramCatalog = function () {
    if (this._programCatalog) return;
    var catalog = {};
    var categories = {};
    this._rawProgramMeta = this._rawProgramMeta || {}; // lower id -> raw prog object (for access checks)
    this._rawSectionMeta = this._rawSectionMeta || {}; // lower id -> section access snapshot
    try {
        if (system && system.xtrn_area && system.xtrn_area.length) {
            for (var s = 0; s < system.xtrn_area.length; s++) {
                var area = system.xtrn_area[s];
                if (!area || !area.prog_list) continue;
                var areaName = (area.name || area.desc || area.code || ('Area' + s));
                for (var p = 0; p < area.prog_list.length; p++) {
                    var prog = area.prog_list[p];
                    if (!prog || !prog.code) continue;
                    var code = String(prog.code);
                    var label = prog.name ? String(prog.name) : code;
                    var lower = code.toLowerCase();
                    catalog[lower] = label;
                    catalog[code.replace(/\s+/g, '_').toLowerCase()] = label;
                    categories[lower] = areaName;
                    // Store reference plus snapshot of built-in access flags if present
                    if (prog && (typeof prog.can_access !== 'undefined' || typeof prog.can_run !== 'undefined')) {
                        prog._futureShellAccessFlags = {
                            can_access: prog.can_access,
                            can_run: prog.can_run
                        };
                    }
                    this._rawProgramMeta[lower] = prog; // store reference
                    // Store section meta keyed by program id (capture minimal fields)
                    if (area) {
                        var areaAr = this._extractAccessRequirement(area);
                        this._rawSectionMeta[lower] = {
                            level: (typeof area.sec_level === 'number') ? area.sec_level : (typeof area.level === 'number' ? area.level : undefined),
                            ar: areaAr
                        };
                    }
                }
            }
        }
        if (typeof xtrn_area !== 'undefined' && xtrn_area && xtrn_area.prog) {
            for (var key in xtrn_area.prog) {
                if (!xtrn_area.prog.hasOwnProperty(key)) continue;
                var progInfo = xtrn_area.prog[key];
                if (!progInfo) continue;
                var rawCode = progInfo.code ? String(progInfo.code) : String(key);
                var title = progInfo.name ? String(progInfo.name) : rawCode;
                var lk = rawCode.toLowerCase();
                catalog[lk] = title;
                catalog[rawCode.replace(/\s+/g, '_').toLowerCase()] = title;
                if (progInfo.area && progInfo.area.name) {
                    categories[lk] = progInfo.area.name;
                    var secAr = this._extractAccessRequirement(progInfo.area);
                    this._rawSectionMeta[lk] = {
                        level: (typeof progInfo.area.sec_level === 'number') ? progInfo.area.sec_level : (typeof progInfo.area.level === 'number' ? progInfo.area.level : undefined),
                        ar: secAr
                    };
                }
                if (progInfo && (typeof progInfo.can_access !== 'undefined' || typeof progInfo.can_run !== 'undefined')) {
                    progInfo._futureShellAccessFlags = {
                        can_access: progInfo.can_access,
                        can_run: progInfo.can_run
                    };
                }
                this._rawProgramMeta[lk] = progInfo;
            }
        }
    } catch (e) { }
    this._programCatalog = catalog;
    this._programCategories = categories;
    var catSet = {};
    for (var pid in categories) if (categories.hasOwnProperty(pid)) catSet[categories[pid]] = true;
    this._categories = [];
    for (var cname in catSet) if (catSet.hasOwnProperty(cname)) this._categories.push(cname);
    this._categories.sort();
};

UsageViewer.prototype._lookupProgramFriendlyName = function (programId) {
    if (!programId) return null;
    this._ensureProgramCatalog();
    var key = String(programId).toLowerCase();
    if (this._programCatalog && this._programCatalog[key]) return this._programCatalog[key];
    var underscored = key.replace(/\s+/g, '_');
    if (this._programCatalog && this._programCatalog[underscored]) return this._programCatalog[underscored];
    return null;
};

UsageViewer.prototype._userHasAccess = function (programId) {
    if (!programId) return false;
    var pid = String(programId).toLowerCase();
    // Sysop-hide list workaround: if program in hideSysopXtrns and user is not SYSOP (level >=90) then hide
    try {
        if (typeof hideSysopXtrns !== 'undefined' && hideSysopXtrns && hideSysopXtrns.length) {
            var checkList = [];
            for (var hs = 0; hs < hideSysopXtrns.length; hs++) {
                var c = hideSysopXtrns[hs];
                if (!c) continue;
                checkList.push(String(c).toLowerCase());
            }
            if (checkList.length && checkList.indexOf(pid) !== -1) {
                var userLevelCheck = 0;
                try {
                    if (typeof user !== 'undefined' && user) {
                        if (user.security && typeof user.security.level === 'number') userLevelCheck = user.security.level;
                        else if (typeof user.security === 'number') userLevelCheck = user.security;
                        else if (typeof user.level === 'number') userLevelCheck = user.level;
                    }
                } catch (elv) { }
                if (userLevelCheck < 90) return false; // hide from non-sysop
            }
        }
    } catch (eHideSys) { }
    if (!this._rawProgramMeta) return true; // if we lack metadata, allow
    var meta = this._rawProgramMeta[pid];
    var secMeta = this._rawSectionMeta ? this._rawSectionMeta[pid] : null;
    if (!meta && !secMeta) {
        return this._failOpenOnUnknown ? true : false;
    }
    try {
        // Prefer built-in Synchronet flags when available
        if (meta && (typeof meta.can_access !== 'undefined' || (meta._futureShellAccessFlags && typeof meta._futureShellAccessFlags.can_access !== 'undefined'))) {
            var ca = (typeof meta.can_access !== 'undefined') ? meta.can_access : (meta._futureShellAccessFlags ? meta._futureShellAccessFlags.can_access : undefined);
            if (ca === false) return false; // explicitly not accessible
        }
        if (meta && (typeof meta.can_run !== 'undefined' || (meta._futureShellAccessFlags && typeof meta._futureShellAccessFlags.can_run !== 'undefined'))) {
            var cr = (typeof meta.can_run !== 'undefined') ? meta.can_run : (meta._futureShellAccessFlags ? meta._futureShellAccessFlags.can_run : undefined);
            if (cr === false) return false; // explicitly cannot run
        }
        // Check security level requirement
        var requiredLevel = undefined;
        if (meta && typeof meta.level === 'number') requiredLevel = meta.level;
        if (requiredLevel === undefined && meta && typeof meta.sec_level === 'number') requiredLevel = meta.sec_level;
        if (requiredLevel === undefined && secMeta && typeof secMeta.level === 'number') requiredLevel = secMeta.level;
        if (typeof requiredLevel === 'number') {
            if (typeof user !== 'undefined' && user) {
                var userLevel = undefined;
                if (user.security && typeof user.security.level === 'number') userLevel = user.security.level;
                else if (typeof user.security === 'number') userLevel = user.security;
                if (typeof userLevel === 'number' && userLevel < requiredLevel) return false;
            }
        }
        // Check AR string if present
        if (typeof user !== 'undefined' && user && typeof user.compare_ars === 'function') {
            // Program AR AND Section AR must both pass if they exist.
            var progAr = meta && typeof meta.ar === 'string' ? meta.ar : '';
            var secAr = secMeta && typeof secMeta.ar === 'string' ? secMeta.ar : '';
            if (progAr) {
                try { if (!user.compare_ars(progAr)) return false; } catch (ePar) { /* allow on error */ }
            }
            if (secAr) {
                try { if (!user.compare_ars(secAr)) return false; } catch (eSar) { /* allow on error */ }
            }
        }
    } catch (e) {
        // On any unexpected error, default to visible to avoid over-filtering
    }
    return true;
};

UsageViewer.prototype._resolveProgramDisplayInfo = function (prog) {
    prog = prog || {};
    var friendly = this._lookupProgramFriendlyName(prog.id);
    var info = {
        displayName: friendly || this._formatProgramName(prog.id),
        iconFile: null,
        iconBg: null,
        iconFg: null
    };
    var base = this._lookupIconBase(prog.id);
    if (base) {
        info.iconFile = base;
    } else {
        var palette = this._getIconPalette();
        var hash = this._hashString(prog.id || info.displayName);
        var bg = palette.bg.length ? palette.bg[hash % palette.bg.length] : BG_BLACK;
        var fg = palette.fg.length ? palette.fg[(hash >> 3) % palette.fg.length] : LIGHTGRAY;
        info.iconBg = bg;
        info.iconFg = fg;
    }
    return info;
};

UsageViewer.prototype._renderProgramIcon = function (frame, info) {
    if (!frame || !info) return;
    var attr = ICSH_ATTR('FRAME_STANDARD');
    if (typeof info.iconBg === 'number' || typeof info.iconFg === 'number') {
        attr = (info.iconBg || 0) | (info.iconFg || 0);
    }
    var loaded = false;
    var width = frame.width || 0;
    var height = frame.height || 0;
    try { frame.open(); } catch (openErr) { }
    if (info.iconFile && width > 0 && height > 0) {
        var basePath = system.mods_dir;
        if (basePath && basePath.slice(-1) !== '/' && basePath.slice(-1) !== '\\') basePath += '/';
        basePath += 'future_shell/assets/' + info.iconFile;
        var binPath = basePath + '.bin';
        var ansPath = basePath + '.ans';
        try {
            if (file_exists(binPath)) {
                frame.load(binPath, width, height);
                loaded = true;
            } else if (file_exists(ansPath)) {
                frame.load(ansPath, width, height);
                loaded = true;
            }
        } catch (e) {
            loaded = false;
        }
    }
    if (!loaded) {
        frame.clear(attr);
    } else {
        if (typeof frame.makeContentTransparent === 'function') {
            try { frame.makeContentTransparent(); } catch (e2) { frame.transparent = true; }
        } else {
            frame.transparent = true;
        }
    }
    try { frame.cycle(); } catch (e4) { }
};

UsageViewer.prototype._drawProgramBlocks = function (df, month) {
    // Deprecated in new list layout (retain no-op for legacy safety)
    return;
};

UsageViewer.prototype._drawProgramBlock = function (df, baseY, height, prog, index, hotspots, vis) {
    var isSelected = (this.focus === 'program' && index === this.programIndex);
    var baseAttr = BG_BLACK | LIGHTGRAY;
    var width = df.width;
    if (width <= 0 || height <= 0) return;

    var blockFrame = new Frame(1, baseY + 1, width, height + 1, baseAttr, df);
    blockFrame.transparent = true;
    try { blockFrame.open(); } catch (e) { }
    blockFrame.clear(baseAttr);
    this._programFrames.push(blockFrame);

    var display = this._resolveProgramDisplayInfo(prog);
    var iconWidth = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS && ICSH_CONSTANTS.ICON_W) ? ICSH_CONSTANTS.ICON_W : 12;
    var iconHeight = (typeof ICSH_CONSTANTS !== 'undefined' && ICSH_CONSTANTS && ICSH_CONSTANTS.ICON_H) ? ICSH_CONSTANTS.ICON_H : 6;
    iconHeight = Math.min(iconHeight, height);
    var leftPad = 1;
    var gap = 2;
    var availableForIcon = Math.max(0, width - leftPad - gap - 1);
    var showIcon = iconWidth > 0 && iconHeight > 0 && availableForIcon >= iconWidth;
    var iconFrame = null;
    var iconAttr = baseAttr; // use base attribute for icon background
    var textStart = gap + 1;
    var iconError = null;
    if (showIcon) {
        var iconX = blockFrame.x + leftPad;
        var iconY = blockFrame.y;
        try {
            iconFrame = new Frame(iconX, iconY, iconWidth, iconHeight, iconAttr, df);
            iconFrame.transparent = true;
            this._programFrames.push(iconFrame);
            this._renderProgramIcon(iconFrame, display);
            textStart = leftPad + iconWidth + gap + 1;
        } catch (iconEx) {
            iconError = iconEx;
            iconFrame = null;
            textStart = gap + 1;
        }
    }
    if (textStart > width) textStart = Math.max(2, width - 10);
    var textWidth = Math.max(0, width - textStart + 1);

    var lines = [];
    var rankStr, nameStr;
    if (isSelected) {
        // Selected: rank in yellow, name in white, background blue applied via attr on first line
        rankStr = '\x01h\x01y#' + (index + 1); // no reset yet
        nameStr = ' \x01h\x01w' + display.displayName; // white name
        lines.push(rankStr + nameStr + '\x01n');
    } else {
        rankStr = '\x01h\x01y#' + (index + 1) + '\x01n';
        nameStr = '\x01h\x01c' + display.displayName + '\x01n';
        lines.push(rankStr + ' ' + nameStr);
    }
    lines.push('\x01gTime Played:\x01n  \x01h\x01g' + this._formatDuration(prog.seconds) + '\x01n');
    lines.push('Launches:     ' + prog.count);
    lines.push('\x01rLast Played:\x01n  \x01h\x01r' + this._formatTimestamp(prog.lastTimestamp) + '\x01n');
    lines.push('\x01mTop Players:\x01n  \x01h\x01m' + this._getTopPlayersString(prog.id) + '\x01n');
    var uCount = (typeof prog.uniqueUsers === 'number') ? prog.uniqueUsers : 0;
    lines.push('\x01bTotal players:\x01n  \x01h\x01b' + uCount + '\x01n');
    lines.push('');
    for (var row = 0; row < height && row < lines.length; row++) {
        var line = lines[row] || '';
        if (row === 0 && iconError) line += ' [icon error]';
        if (textWidth > 0) {
            var lineAttr = (isSelected && row === 0) ? (BG_BLUE | LIGHTGRAY) : baseAttr;
            blockFrame.attr = lineAttr;
            blockFrame.gotoxy(textStart, row + 1);
            // var padded = this._padColoredLine(line, textWidth);
            // blockFrame.putmsg(padded);
            blockFrame.putmsg(line)
        }
    }
    try { blockFrame.cycle(); } catch (cycleErr) { }

    if (vis < 9 && typeof console !== 'undefined' && typeof console.add_hotspot === 'function') {
        if (iconFrame && iconFrame.width > 0 && iconFrame.height > 0) {
            function absRect(f) {
                var x = f.x, y = f.y, p = f.parent;
                while (p) { x += (p.x - 1); y += (p.y - 1); p = p.parent; }
                return { x: x, y: y, w: f.width, h: f.height };
            }
            var hotKey = String.fromCharCode(49 + vis); // '1'..'9'
            hotspots[hotKey] = index;
            var r = absRect(iconFrame);
            var minX = r.x;
            var maxX = r.x + r.w - 1;
            var startY = r.y - 1; // shift up one row per request
            for (var y = 0; y < r.h; y++) {
                try { console.add_hotspot(hotKey, false, minX, maxX, startY + y); } catch (e2) { }
            }
        }
    }
};

UsageViewer.prototype._padColoredLine = function (str, width) {
    if (!str) str = '';
    if (width <= 0) return '';
    var out = '';
    var visible = 0;
    for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '\x01') {
            if (i + 1 < str.length) {
                out += ch + str.charAt(i + 1);
                i++;
            }
            continue;
        }
        if (visible >= width) break;
        out += ch;
        visible++;
    }
    if (visible < width) {
        out += Array(width - visible + 1).join(' ');
    }
    if (out.indexOf('\x01n') === -1) out += '\x01n';
    return out;
};

UsageViewer.prototype._getTopPlayersString = function (programId) {
    var month = this.months[this.index] || {};
    var players = this._getTopPlayers(month, programId);
    if (!players || !players.length) return 'None';
    var joined = players.join(', ');
    var maxLen = this.detailFrame ? this.detailFrame.width - 5 : 40;
    if (joined.length > maxLen) joined = joined.substr(0, maxLen);
    return joined;
};

UsageViewer.prototype._formatTimestamp = function (ts) {
    if (!ts) return 'Never';
    var seconds = Math.floor(ts / 1000);
    try {
        return strftime('%Y-%m-%d %H:%M', seconds);
    } catch (e) {
        var d = new Date(ts);
        return d.toISOString().replace('T', ' ').substr(0, 16);
    }
};

UsageViewer.prototype._getTopPlayers = function (month, programId) {
    var users = month.users || {};
    var ranking = [];
    for (var key in users) {
        if (!users.hasOwnProperty(key)) continue;
        var info = users[key];
        if (!info || !info.programs || !info.programs[programId]) continue;
        var stats = info.programs[programId];
        ranking.push({
            key: key,
            alias: info.alias || key,
            seconds: stats.seconds || 0,
            count: stats.count || 0
        });
    }
    ranking.sort(function (a, b) {
        if (b.seconds !== a.seconds) return b.seconds - a.seconds;
        return b.count - a.count;
    });
    return ranking.slice(0, 3).map(function (entry) {
        return entry.alias + ' (' + entry.count + ')';
    });
};

this.UsageViewer = UsageViewer;

// ================= User Filter Modal =================
UsageViewer.prototype._showUserFilter = function () {
    // Build user list from current aggregated data (All Time if on All Time, else current month)
    var month = this.months[this.index];
    if (!month) return;
    var usersMap = month.users || {};
    var entries = [];
    for (var k in usersMap) if (usersMap.hasOwnProperty(k)) {
        var alias = usersMap[k] && usersMap[k].alias ? usersMap[k].alias : k;
        entries.push({ key: k, alias: alias });
    }
    log("Building user filter list from " + JSON.stringify(entries) + " users");
    //[{"key":"Hm Derdoc","alias":"Hm Derdoc"},
    // {"key":"Larry Lagomorph","alias":"Larry Lagomorph"}]
    entries.sort(function (a, b) { var A = a.alias.toLowerCase(); var B = b.alias.toLowerCase(); if (A > B) return 1; if (A < B) return -1; return 0; });
    entries.unshift({ key: null, alias: 'Show All' });
    if (!entries.length) return;
    var self = this;
    if (this._activeUserModal) { try { this._activeUserModal.close(); } catch (_) { } this._activeUserModal = null; }
    var chooserItems = entries.map(function (e) { return { label: e.alias, value: e.key }; });
    var chooser = (typeof Modal !== 'undefined' && Modal && typeof Modal.createChooser === 'function') ? (function () {
        var c = Modal.createChooser({
            title: 'User Filter',
            items: chooserItems,
            initialIndex: 0,
            hotspots: {
                enabled: true,
                maxDigits: 9,
                immediate: true,   // just select
            },
            onChoose: function (value, item) {
                log('User filter chosen value : ' + value + ' item: ' + JSON.stringify(item));
                if (value === null) {
                    self._userFilter = null; self._userFilterAlias = null;
                } else {
                    self._userFilter = value; self._userFilterAlias = item && item.label ? item.label : value;
                }
                self.programIndex = 0; // reset selection within filtered list
                try { self.draw(); } catch (_) { }
            },
            onCancel: function () { log("User filter modal canceled"); },
            onClose: function () {
                try {
                    log("User filter modal closed");
                    self.draw();
                } catch (_) { } if (self._activeUserModal === c) self._activeUserModal = null;
            }
        });
        // Explicitly open chooser (createChooser does not auto-open)
        try {
            if (c && typeof c.open === 'function') {
                log('Opening user filter chooser modal');
                c.open();
            } else {
                log('Chooser modal missing open()');
            }
        } catch (eOpen) { try { log('Error opening chooser: ' + eOpen); } catch (_) { } }
        return c;
    })() : null;
    if (chooser) this._activeUserModal = chooser; else {
        // Fallback legacy inline modal (simplified) if chooser creation failed.
        var sel = 0;
        var legacy = new Modal({
            type: 'custom',
            title: 'User Filter',
            width: 40,
            height: Math.min(console.screen_rows - 2, entries.length + 6),
            overlay: true,
            autoOpen: true,
            render: function (frame) {
                try {
                    var innerW = frame.width - 4;
                    var startY = 2;
                    for (var cy = startY; cy < frame.height - 1; cy++) { frame.gotoxy(2, cy); frame.putmsg(Array(innerW + 1).join(' ')); }
                    for (var i = 0; i < entries.length && (startY + i) < frame.height - 1; i++) {
                        var e = entries[i];
                        var line = (i === sel ? '\x01h\x01w> ' : '  ') + e.alias;
                        if (line.length > innerW) line = line.substr(0, innerW);
                        frame.gotoxy(2, startY + i); frame.putmsg(line + '\x01n');
                    }
                    frame.cycle();
                } catch (er) { }
            },
            keyHandler: function (k, m) {
                if (!k) return false;
                if (k === '\x1B') { m.close(null); return true; }
                if ((typeof KEY_ENTER !== 'undefined' && k === KEY_ENTER) || (typeof KEY_ENTER === 'undefined' && k === '\r')) {
                    var chosen = entries[sel];
                    if (chosen) {
                        if (chosen.key === null) { self._userFilter = null; self._userFilterAlias = null; }
                        else { self._userFilter = chosen.key; self._userFilterAlias = chosen.alias; }
                    }
                    m.close(true); return true;
                }
                if (k === KEY_UP) { sel = (sel > 0) ? sel - 1 : entries.length - 1; m.options.render && m.options.render(m.frame, m); return true; }
                if (k === KEY_DOWN) { sel = (sel < entries.length - 1) ? sel + 1 : 0; m.options.render && m.options.render(m.frame, m); return true; }
                if (k.length === 1 && k >= ' ' && k <= '~') { var upper = k.toUpperCase(); for (var ii = 0; ii < entries.length; ii++) { if (entries[ii].alias && entries[ii].alias.toUpperCase().charAt(0) === upper) { sel = ii; break; } } m.options.render && m.options.render(m.frame, m); return true; }
                return false;
            },
            onClose: function () { try { self.draw(); } catch (_) { } if (self._activeUserModal === legacy) self._activeUserModal = null; }
        });
        this._activeUserModal = legacy;
    }
    // Reset selection context when opening (program list resets after filter change)
    this.programIndex = 0; this.programTop = 0;
};
