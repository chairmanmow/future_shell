// MRC Test Harness: Validates store behavior with synthetic actions
// Run with: jsexec mods/future_shell/lib/mrc/test_harness.js

load('sbbsdefs.js');
load('future_shell/lib/mrc/store.js');
load('future_shell/lib/mrc/actions.js');

var PASS_COUNT = 0;
var FAIL_COUNT = 0;

function assert(condition, message) {
    if (condition) {
        PASS_COUNT++;
        log(LOG_INFO, '✓ ' + message);
    } else {
        FAIL_COUNT++;
        log(LOG_ERR, '✗ FAIL: ' + message);
    }
}

function assertEqual(actual, expected, message) {
    var match = JSON.stringify(actual) === JSON.stringify(expected);
    assert(match, message + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')');
}

function testInitialState() {
    log(LOG_INFO, '\n=== Test: Initial State ===');
    var store = new MrcStore();
    var state = store.snapshot();

    assert(state.connection.status === 'disconnected', 'Initial connection status is disconnected');
    assert(state.room.name === '', 'Initial room name is empty');
    assert(state.messages.length === 0, 'Initial messages array is empty');
    assert(state.prefs.maxMessages === 400, 'Default maxMessages is 400');
    assert(!store.isDirty(), 'Store is not dirty initially');
}

function testConnectionActions() {
    log(LOG_INFO, '\n=== Test: Connection Actions ===');
    var store = new MrcStore();

    store.apply(connecting());
    assert(store.getConnection().status === 'connecting', 'Status is connecting after CONNECTING action');
    assert(store.isDirty(), 'Store is dirty after action');

    store.clearDirty();
    assert(!store.isDirty(), 'Store is clean after clearDirty');

    store.apply(connected({ host: 'localhost', port: 5000 }));
    assert(store.getConnection().status === 'connected', 'Status is connected after CONNECTED action');
    assert(store.getConnection().connectedSince !== null, 'connectedSince is set');

    store.apply(disconnected('Test disconnect'));
    assert(store.getConnection().status === 'disconnected', 'Status is disconnected after DISCONNECTED action');

    store.apply(connectionError('Test error'));
    assert(store.getConnection().status === 'error', 'Status is error after CONNECTION_ERROR action');
    assertEqual(store.getConnection().errorMsg, 'Test error', 'Error message is set');
}

function testRoomActions() {
    log(LOG_INFO, '\n=== Test: Room Actions ===');
    var store = new MrcStore();

    store.apply(roomJoinRequest('testroom'));
    assert(store.getRoom().joinState === 'joining', 'joinState is joining after ROOM_JOIN_REQUEST');
    assertEqual(store.getRoom().name, 'testroom', 'Room name is set');

    var nicks = ['alice', 'bob', 'charlie'];
    store.apply(roomJoinSuccess('testroom', 'Test Topic', nicks));
    assert(store.getRoom().joinState === 'joined', 'joinState is joined after ROOM_JOIN_SUCCESS');
    assertEqual(store.getRoom().topic, 'Test Topic', 'Topic is set');
    assertEqual(store.getRoom().users.length, 3, 'User count is correct');
    assertEqual(store.getRoom().users[0].nick, 'alice', 'First user nick is correct');

    store.apply(roomJoinFail('badroom', 'Room not found'));
    assert(store.getRoom().joinState === 'failed', 'joinState is failed after ROOM_JOIN_FAIL');
}

function testMessageActions() {
    log(LOG_INFO, '\n=== Test: Message Actions ===');
    var store = new MrcStore();

    store.apply(messageReceived({
        from: 'alice',
        body: 'Hello world',
        plain: 'Hello world',
        display: '[12:00:00] alice: Hello world',
        system: false,
        mention: false,
        backlog: false,
        epoch: Date.now()
    }));

    var messages = store.getMessages();
    assertEqual(messages.length, 1, 'One message in store');
    assertEqual(messages[0].nick, 'alice', 'Message nick is correct');
    assertEqual(messages[0].text, 'Hello world', 'Message text is correct');
    assertEqual(messages[0].kind, 'chat', 'Message kind is chat');

    store.apply(systemMessage('Server restarting'));
    messages = store.getMessages();
    assertEqual(messages.length, 2, 'Two messages in store');
    assertEqual(messages[1].kind, 'system', 'Second message kind is system');
    assertEqual(messages[1].text, 'Server restarting', 'System message text is correct');
}

function testMessagePruning() {
    log(LOG_INFO, '\n=== Test: Message Pruning ===');
    var store = new MrcStore();
    store.apply(prefChanged('maxMessages', 10));

    for (var i = 0; i < 15; i++) {
        store.apply(messageReceived({
            from: 'user' + i,
            body: 'Message ' + i,
            plain: 'Message ' + i,
            display: 'Message ' + i,
            system: false,
            mention: false,
            backlog: false,
            epoch: Date.now()
        }));
    }

    var messages = store.getMessages();
    assertEqual(messages.length, 10, 'Messages pruned to maxMessages limit');
    assertEqual(messages[0].text, 'Message 5', 'Oldest message is correct after pruning');
    assertEqual(messages[9].text, 'Message 14', 'Newest message is correct after pruning');
}

function testNicklistActions() {
    log(LOG_INFO, '\n=== Test: Nicklist Actions ===');
    var store = new MrcStore();

    // Setup initial room
    store.apply(roomJoinSuccess('lobby', 'Welcome', ['alice']));

    // Update nicklist for current room
    store.apply(nicklistUpdated('lobby', ['alice', 'bob', 'charlie']));
    var users = store.getRoom().users;
    assertEqual(users.length, 3, 'Nicklist updated for current room');
    assertEqual(users[1].nick, 'bob', 'Second user is correct');

    // Update nicklist for different room (should be ignored)
    store.apply(nicklistUpdated('other', ['dave']));
    users = store.getRoom().users;
    assertEqual(users.length, 3, 'Nicklist update for different room ignored');
}

function testStatsAndLatency() {
    log(LOG_INFO, '\n=== Test: Stats and Latency ===');
    var store = new MrcStore();

    store.apply(statsUpdated(['100', '25', '5', '3']));
    var stats = store.getStats();
    assertEqual(stats.uptime, '100', 'Uptime stat is correct');
    assertEqual(stats.userCount, '25', 'User count is correct');
    assertEqual(stats.roomCount, '5', 'Room count is correct');
    assertEqual(stats.sites, '3', 'Sites count is correct');

    store.apply(latencyUpdated(50));
    var latency = store.getLatency();
    assertEqual(latency.lastMs, 50, 'Last latency is correct');

    store.apply(latencyUpdated(60));
    store.apply(latencyUpdated(55));
    latency = store.getLatency();
    assert(latency.avgMs > 0, 'Average latency calculated');
    assert(latency.samples.length === 3, 'Latency samples tracked');
}

function testPreferences() {
    log(LOG_INFO, '\n=== Test: Preferences ===');
    var store = new MrcStore();

    store.apply(prefChanged('toastEnabled', false));
    var prefs = store.getPrefs();
    assertEqual(prefs.toastEnabled, false, 'Toast preference updated');

    store.apply(prefChanged('msgColor', 12));
    prefs = store.getPrefs();
    assertEqual(prefs.msgColor, 12, 'Message color preference updated');

    // Invalid preference key should be ignored
    store.apply(prefChanged('invalidKey', 'value'));
    prefs = store.getPrefs();
    assert(!prefs.hasOwnProperty('invalidKey'), 'Invalid preference key ignored');
}

function testBacklogActions() {
    log(LOG_INFO, '\n=== Test: Backlog Actions ===');
    var store = new MrcStore();

    store.apply(backlogLoadStart());
    var backlog = store.getBacklog();
    assert(backlog.loading === true, 'Backlog loading flag is true');
    assertEqual(backlog.appliedCount, 0, 'Backlog count is zero initially');

    store.apply(backlogItem({
        from: 'alice',
        body: 'Backlog message 1',
        plain: 'Backlog message 1',
        display: 'Backlog message 1',
        epoch: Date.now() - 10000
    }));

    store.apply(backlogItem({
        from: 'bob',
        body: 'Backlog message 2',
        plain: 'Backlog message 2',
        display: 'Backlog message 2',
        epoch: Date.now() - 5000
    }));

    backlog = store.getBacklog();
    assertEqual(backlog.appliedCount, 2, 'Backlog count is correct');

    var messages = store.getMessages();
    assertEqual(messages.length, 2, 'Backlog messages added to store');
    assert(messages[0].backlog === true, 'First message marked as backlog');
    assert(messages[1].backlog === true, 'Second message marked as backlog');

    store.apply(backlogLoadComplete(2));
    backlog = store.getBacklog();
    assert(backlog.loading === false, 'Backlog loading flag is false after complete');
}

function testDirtyFlag() {
    log(LOG_INFO, '\n=== Test: Dirty Flag ===');
    var store = new MrcStore();

    assert(!store.isDirty(), 'Store is clean initially');

    store.apply(markDirty());
    assert(store.isDirty(), 'Store is dirty after MARK_DIRTY action');

    store.apply(clearDirty());
    assert(!store.isDirty(), 'Store is clean after CLEAR_DIRTY action');

    // Any state-changing action should mark dirty
    store.apply(systemMessage('Test'));
    assert(store.isDirty(), 'Store is dirty after state change');
}

function runAllTests() {
    log(LOG_INFO, '╔════════════════════════════════════════╗');
    log(LOG_INFO, '║   MRC Store Test Harness v1.0         ║');
    log(LOG_INFO, '╚════════════════════════════════════════╝');

    testInitialState();
    testConnectionActions();
    testRoomActions();
    testMessageActions();
    testMessagePruning();
    testNicklistActions();
    testStatsAndLatency();
    testPreferences();
    testBacklogActions();
    testDirtyFlag();

    log(LOG_INFO, '\n╔════════════════════════════════════════╗');
    log(LOG_INFO, '║   Test Results                         ║');
    log(LOG_INFO, '╠════════════════════════════════════════╣');
    log(LOG_INFO, '║   PASSED: ' + PASS_COUNT + '                             ║');
    log(LOG_INFO, '║   FAILED: ' + FAIL_COUNT + '                              ║');
    log(LOG_INFO, '╚════════════════════════════════════════╝');

    if (FAIL_COUNT === 0) {
        log(LOG_INFO, '\n✓ All tests passed!\n');
    } else {
        log(LOG_ERR, '\n✗ Some tests failed. Review output above.\n');
    }

    exit(FAIL_COUNT > 0 ? 1 : 0);
}

// Run tests
runAllTests();
