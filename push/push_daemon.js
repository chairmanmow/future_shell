// push_daemon.js - sends the BBS's native (Web Push) notifications.
//
// Synchronet scripts queue jobs in data/push/queue/ (mods/load/push_lib.js);
// this sends each to every device the user enabled (data/push/subs/), drops
// devices the push service says are gone, and deletes the job.
//
// It also watches telegrams (data/msgs/NNNN.msg) for users with a device:
// the text a telegram appends is pushed as-is, except core's "X posted to
// you on ..." notices, which the forum push already announces with a link.
// Reading never consumes a telegram; the terminal and site still get it.
//
// Kept running by ensure-daemon.sh (cron, every minute). One instance only.

'use strict';

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const SBBS = '/sbbs/';
const PUSH = SBBS + 'data/push/';
const QUEUE = PUSH + 'queue/';
const SUBS = PUSH + 'subs/';
const MSGS = SBBS + 'data/msgs/';
const PREFS = SBBS + 'data/notify/';
const PIDFILE = PUSH + 'daemon.pid';
const SWEEP_MS = 2000;
const TELEGRAM_MS = 3000;
const JOB_MAX_AGE_SEC = 15 * 60;   // a push this late is noise
const POST_NOTICE = /\s(?:posted to you on|sent you EchoMail on)\s/i;
// ctrl/text.dat UserSentYouMail: "<from> sent you E-mail."
const MAIL_NOTICE = /^(.+?)\s+sent you E-?mail\b/i;

function log(msg) { console.log(new Date().toISOString() + ' ' + msg); }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_e) { return null; }
}

function writeJson(file, value) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function pad4(n) { return String(n).padStart(4, '0'); }

// ---- sender avatars as notification icons (avatar_png.js) ----
// Reloaded whenever the file changes, so drawing tweaks need no restart.
const AVATAR_MODULE = path.join(__dirname, 'avatar_png.js');
let avatarModule = null, avatarModuleAt = 0;
function avatarIcon(b64) {
  if (!b64) return null;
  try {
    const at = fs.statSync(AVATAR_MODULE).mtimeMs;
    if (!avatarModule || at !== avatarModuleAt) {
      delete require.cache[require.resolve(AVATAR_MODULE)];
      avatarModule = require(AVATAR_MODULE);
      avatarModuleAt = at;
    }
    return avatarModule.iconFor(b64);
  } catch (err) {
    log('avatar icon: ' + err.message);
    return null;
  }
}

// ---- single instance ----
function alreadyRunning() {
  try {
    const pid = parseInt(fs.readFileSync(PIDFILE, 'utf8'), 10);
    if (pid && pid !== process.pid) { process.kill(pid, 0); return true; }
  } catch (_e) { /* no pid file, or that process is gone */ }
  return false;
}

// ---- sending ----
const keys = readJson(SBBS + 'ctrl/push-vapid.json');
if (!keys || !keys.publicKey || !keys.privateKey) {
  log('no VAPID keys in ctrl/push-vapid.json; exiting');
  process.exit(1);
}
webpush.setVapidDetails(keys.subject || 'mailto:sysop@localhost', keys.publicKey, keys.privateKey);

async function sendToUser(user, payload, ttl) {
  const file = SUBS + pad4(user) + '.json';
  const devices = readJson(file);
  if (!Array.isArray(devices) || !devices.length) return;
  const gone = new Set();
  await Promise.all(devices.map(async (d) => {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, JSON.stringify(payload), { TTL: ttl, urgency: 'high' });
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) gone.add(d.endpoint);
      else log('user ' + user + ': push failed: ' + (err && (err.statusCode || err.message)));
    }
  }));
  if (gone.size) {
    // Re-read: a device may have been added while we were sending.
    const now = readJson(file) || [];
    const left = now.filter((d) => !gone.has(d.endpoint));
    if (left.length) writeJson(file, left); else fs.rmSync(file, { force: true });
    log('user ' + user + ': dropped ' + gone.size + ' expired device(s)');
  }
}

let sweeping = false;
async function sweepQueue() {
  if (sweeping) return;
  sweeping = true;
  try {
    const names = fs.readdirSync(QUEUE).filter((n) => n.endsWith('.json')).sort();
    for (const name of names) {
      const file = QUEUE + name;
      const job = readJson(file);
      fs.rmSync(file, { force: true });
      if (!job || !(job.user > 0)) continue;
      const age = Math.floor(Date.now() / 1000) - (job.at || 0);
      if (age > JOB_MAX_AGE_SEC) continue;
      const payload = { title: job.title, body: job.body, url: job.url, tag: job.tag, kind: job.kind };
      const icon = avatarIcon(job.avatar);
      if (icon) payload.icon = icon;
      await sendToUser(job.user, payload, Math.max(60, JOB_MAX_AGE_SEC - age));
    }
  } catch (err) {
    log('queue: ' + err.message);
  } finally {
    sweeping = false;
  }
}

// ---- telegrams ----
const telegramSize = {};   // user -> bytes already seen

function wantsTelegrams(user) {
  const prefs = readJson(PREFS + pad4(user) + '.prefs.json');
  return !(prefs && prefs.push && prefs.push.telegram === false);
}

function telegramText(raw) {
  return raw.replace(/\x01./g, '').replace(/\x07/g, '').split(/\r?\n/)
    .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())
    .filter((l) => l.length && !POST_NOTICE.test(' ' + l))
    .join('\n');
}

/**
 * Where a telegram's notification leads. New mail opens that message on the
 * mail page; anything else the home page. `tgdone` names the telegram so
 * the site doesn't pop it up again on arrival (common.js).
 */
function telegramPayload(text) {
  const first = text.split('\n')[0];
  const done = '&tgdone=' + encodeURIComponent(first.replace(/\s+/g, ' ').substr(0, 60));
  const mail = MAIL_NOTICE.exec(first);
  if (mail && text.split('\n').length === 1) {
    return { title: 'New mail', body: mail[1] + ' sent you mail.', tag: 'mail',
      url: './?page=000-mail.xjs&from=' + encodeURIComponent(mail[1]) + done, kind: 'telegram' };
  }
  return { title: 'Telegram', body: text.substr(0, 300), url: './?page=000-home.xjs' + done, tag: 'telegram', kind: 'telegram' };
}

function checkTelegrams() {
  let users;
  try { users = fs.readdirSync(SUBS).map((n) => /^(\d{4})\.json$/.exec(n)).filter(Boolean).map((m) => parseInt(m[1], 10)); }
  catch (_e) { return; }
  for (const user of users) {
    const file = MSGS + pad4(user) + '.msg';
    let size = 0;
    try { size = fs.statSync(file).size; } catch (_e) { size = 0; }
    const seen = telegramSize[user];
    telegramSize[user] = size;
    // First look only sets the baseline; a smaller file was read (consumed).
    if (seen === undefined || size <= seen) continue;
    if (!wantsTelegrams(user)) continue;
    let added = '';
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(Math.min(size - seen, 8192));
      fs.readSync(fd, buf, 0, buf.length, seen);
      fs.closeSync(fd);
      added = telegramText(buf.toString('latin1'));
    } catch (_e) { continue; }
    if (!added) continue;
    sendToUser(user, telegramPayload(added), 3600).catch((err) => log('telegram push: ' + err.message));
  }
}

// ---- main ----
if (alreadyRunning()) process.exit(0);
fs.mkdirSync(QUEUE, { recursive: true });
fs.mkdirSync(SUBS, { recursive: true });
fs.writeFileSync(PIDFILE, String(process.pid));
process.on('exit', () => {
  try { if (parseInt(fs.readFileSync(PIDFILE, 'utf8'), 10) === process.pid) fs.rmSync(PIDFILE); } catch (_e) { /* gone */ }
});
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => process.exit(0)));

try { fs.watch(QUEUE, () => { sweepQueue(); }); } catch (err) { log('watch failed, sweeping only: ' + err.message); }
setInterval(sweepQueue, SWEEP_MS);
setInterval(checkTelegrams, TELEGRAM_MS);
checkTelegrams();
sweepQueue();
log('push daemon started (pid ' + process.pid + ')');
