// avatar_icon.js - draw one avatar's notification icon from the command line:
//   node avatar_icon.js <base64 10x6 avatar>
// Same file avatar_png.js writes for push (push-avatars/<hash>.png); used by
// webv4 api/push.ssjs ?call=icon for the site's own desktop notifications.
'use strict';
const { iconFor } = require('./avatar_png.js');
process.exit(iconFor(process.argv[2] || '') ? 0 : 1);
