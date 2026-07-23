// Editor migration: users with NO external editor selected -> FUTURE (HERMedIT).
//   jsexec editor_migrate.js              survey only (read-only)
//   jsexec editor_migrate.js -one 36      apply to a single user (test)
//   jsexec editor_migrate.js -apply       apply to all users with none
// Every change is logged to /sbbs/data/hermedit_editor_migration.log.
load('sbbsdefs.js');
var APPLY = false;
var ONE = 0;
for (var a = 0; a < argc; a++) {
  if (argv[a] === '-apply') APPLY = true;
  if (argv[a] === '-one' && a + 1 < argc) ONE = parseInt(argv[a + 1], 10);
}

function setEditor(num) {
  var u = new User(num);
  if (u === null || u.number === 0) { print('#' + num + ': no such user'); return false; }
  var before = String(u.editor || '');
  u.editor = 'FUTURE';
  var verify = new User(num);
  var after = String(verify.editor || '');
  var ok = after.toUpperCase() === 'FUTURE';
  print('#' + num + ' (' + u.alias + '): "' + before + '" -> "' + after + '" ' + (ok ? 'OK' : 'FAILED'));
  if (ok) {
    var f = new File('/sbbs/data/hermedit_editor_migration.log');
    if (f.open('a')) {
      f.writeln(strftime('%Y-%m-%d %H:%M', time()) + ' user #' + num + ' (' + u.alias + ') editor: "' + before + '" -> FUTURE');
      f.close();
    }
  }
  return ok;
}

if (ONE > 0) {
  setEditor(ONE);
  exit(0);
}

var counts = {};
var toChange = [];
for (var i = 1; i <= system.lastuser; i++) {
  var u = new User(i);
  if (u === null || u.number === 0) continue;
  if (u.settings & USER_DELETED) continue;
  var ed = String(u.editor || '');
  counts[ed === '' ? '(none/internal)' : ed] = (counts[ed === '' ? '(none/internal)' : ed] || 0) + 1;
  if (ed === '') toChange.push(i);
}
for (var k in counts) print('  ' + k + ': ' + counts[k]);
print('users with no editor selected: ' + toChange.length);
if (APPLY) {
  var okCount = 0;
  for (var c = 0; c < toChange.length; c++) if (setEditor(toChange[c])) okCount++;
  print('APPLY DONE: ' + okCount + '/' + toChange.length + ' migrated.');
}
