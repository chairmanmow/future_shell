// hm_leaderboards.js - rebuild the home page's rankings (Forums, Posters,
// Rico, Suave) into data/leaderboards/, so page loads only read them.
// Run by the HM_LEADERBOARDS timed event (ctrl/xtrn.ini) every few minutes;
// also safe to run by hand: jsexec hm_leaderboards
load('sbbsdefs.js');
load(system.mods_dir + 'load/leaderboards_lib.js');

var web = load('modopts.js', 'web') || {};
var guest = web.guest || 'Guest';
var report = [];

Leaderboards.names.forEach(function (name) {
    var start = Date.now();
    try {
        Leaderboards.build(name, guest);
        report.push(name + ' ' + (Date.now() - start) + 'ms');
    } catch (e) {
        report.push(name + ' FAILED: ' + e);
        log(LOG_WARNING, 'hm_leaderboards: ' + name + ' failed: ' + e);
    }
});

log(LOG_INFO, 'hm_leaderboards: ' + report.join(', '));
