#!/bin/sh
# Keep the native push sender running (cron, every minute). The daemon's own
# pid check makes a second start exit at once.
cd /sbbs/mods/push || exit 1
pid=$(cat /sbbs/data/push/daemon.pid 2>/dev/null)
if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then exit 0; fi
nohup node push_daemon.js >> /sbbs/data/push/daemon.log 2>&1 &
