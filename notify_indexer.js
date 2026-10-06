// notify_indexer.js - turn new forum messages into per-user notifications
// (data/notify/, see mods/load/notify_lib.js). Run by the NOTIFY timed event
// (ctrl/xtrn.ini) every minute; also safe to run by hand: jsexec notify_indexer
load(system.mods_dir + 'load/notify_lib.js');

var start = Date.now();
var report = Notify.indexAll();
if (report)
    log(report.messages || report.backfill ? LOG_INFO : LOG_DEBUG, 'notify_indexer: ' + report.messages + ' messages, '
        + report.users + ' users notified' + (report.backfill ? ' (backfill)' : '') + ', ' + (Date.now() - start) + 'ms');
else
    log(LOG_DEBUG, 'notify_indexer: another scan is running');
