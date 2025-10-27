// MRC Action Type Definitions
// Defines all state mutations for the MRC store (pure action catalog)

// Connection lifecycle
var ACTION_CONNECTING = 'CONNECTING';
var ACTION_CONNECTED = 'CONNECTED';
var ACTION_DISCONNECTED = 'DISCONNECTED';
var ACTION_CONNECTION_ERROR = 'CONNECTION_ERROR';

// Room management
var ACTION_ROOM_JOIN_REQUEST = 'ROOM_JOIN_REQUEST';
var ACTION_ROOM_JOIN_SUCCESS = 'ROOM_JOIN_SUCCESS';
var ACTION_ROOM_JOIN_FAIL = 'ROOM_JOIN_FAIL';
var ACTION_ROOM_LEAVE = 'ROOM_LEAVE';

// Messages
var ACTION_MESSAGE_RECEIVED = 'MESSAGE_RECEIVED';
var ACTION_MESSAGE_SENT = 'MESSAGE_SENT';
var ACTION_SYSTEM_MESSAGE = 'SYSTEM_MESSAGE';

// Roster / nicklist
var ACTION_NICKLIST_UPDATED = 'NICKLIST_UPDATED';
var ACTION_USER_JOINED = 'USER_JOINED';
var ACTION_USER_LEFT = 'USER_LEFT';

// Room metadata
var ACTION_TOPIC_UPDATED = 'TOPIC_UPDATED';
var ACTION_STATS_UPDATED = 'STATS_UPDATED';
var ACTION_LATENCY_UPDATED = 'LATENCY_UPDATED';

// User preferences
var ACTION_PREF_CHANGED = 'PREF_CHANGED';

// Backlog replay
var ACTION_BACKLOG_LOAD_START = 'BACKLOG_LOAD_START';
var ACTION_BACKLOG_ITEM = 'BACKLOG_ITEM';
var ACTION_BACKLOG_LOAD_COMPLETE = 'BACKLOG_LOAD_COMPLETE';

// Future: presence & typing (optional)
var ACTION_USER_PRESENCE = 'USER_PRESENCE';
var ACTION_TYPING_START = 'TYPING_START';
var ACTION_TYPING_END = 'TYPING_END';

// UI control
var ACTION_MARK_DIRTY = 'MARK_DIRTY';
var ACTION_CLEAR_DIRTY = 'CLEAR_DIRTY';

/**
 * Action creator helpers (optional; can be called directly or via these factories)
 */
function createAction(type, payload) {
    return { type: type, payload: payload || {}, ts: Date.now() };
}

function connecting() {
    return createAction(ACTION_CONNECTING);
}

function connected(info) {
    return createAction(ACTION_CONNECTED, info);
}

function disconnected(reason) {
    return createAction(ACTION_DISCONNECTED, { reason: reason });
}

function connectionError(error) {
    return createAction(ACTION_CONNECTION_ERROR, { error: error });
}

function roomJoinRequest(room) {
    return createAction(ACTION_ROOM_JOIN_REQUEST, { room: room });
}

function roomJoinSuccess(room, topic, nicks) {
    return createAction(ACTION_ROOM_JOIN_SUCCESS, { room: room, topic: topic, nicks: nicks });
}

function roomJoinFail(room, reason) {
    return createAction(ACTION_ROOM_JOIN_FAIL, { room: room, reason: reason });
}

function messageReceived(msg) {
    return createAction(ACTION_MESSAGE_RECEIVED, msg);
}

function systemMessage(text) {
    return createAction(ACTION_SYSTEM_MESSAGE, { text: text });
}

function nicklistUpdated(room, nicks) {
    return createAction(ACTION_NICKLIST_UPDATED, { room: room, nicks: nicks });
}

function topicUpdated(room, topic) {
    return createAction(ACTION_TOPIC_UPDATED, { room: room, topic: topic });
}

function statsUpdated(stats) {
    return createAction(ACTION_STATS_UPDATED, { stats: stats });
}

function latencyUpdated(ms) {
    return createAction(ACTION_LATENCY_UPDATED, { ms: ms });
}

function prefChanged(key, value) {
    return createAction(ACTION_PREF_CHANGED, { key: key, value: value });
}

function backlogLoadStart() {
    return createAction(ACTION_BACKLOG_LOAD_START);
}

function backlogItem(msg) {
    return createAction(ACTION_BACKLOG_ITEM, msg);
}

function backlogLoadComplete(count) {
    return createAction(ACTION_BACKLOG_LOAD_COMPLETE, { count: count });
}

function markDirty() {
    return createAction(ACTION_MARK_DIRTY);
}

function clearDirty() {
    return createAction(ACTION_CLEAR_DIRTY);
}

// Export for module system
if (typeof registerModuleExports === 'function') {
    registerModuleExports({
        // Action type constants
        ACTION_CONNECTING: ACTION_CONNECTING,
        ACTION_CONNECTED: ACTION_CONNECTED,
        ACTION_DISCONNECTED: ACTION_DISCONNECTED,
        ACTION_CONNECTION_ERROR: ACTION_CONNECTION_ERROR,
        ACTION_ROOM_JOIN_REQUEST: ACTION_ROOM_JOIN_REQUEST,
        ACTION_ROOM_JOIN_SUCCESS: ACTION_ROOM_JOIN_SUCCESS,
        ACTION_ROOM_JOIN_FAIL: ACTION_ROOM_JOIN_FAIL,
        ACTION_ROOM_LEAVE: ACTION_ROOM_LEAVE,
        ACTION_MESSAGE_RECEIVED: ACTION_MESSAGE_RECEIVED,
        ACTION_MESSAGE_SENT: ACTION_MESSAGE_SENT,
        ACTION_SYSTEM_MESSAGE: ACTION_SYSTEM_MESSAGE,
        ACTION_NICKLIST_UPDATED: ACTION_NICKLIST_UPDATED,
        ACTION_USER_JOINED: ACTION_USER_JOINED,
        ACTION_USER_LEFT: ACTION_USER_LEFT,
        ACTION_TOPIC_UPDATED: ACTION_TOPIC_UPDATED,
        ACTION_STATS_UPDATED: ACTION_STATS_UPDATED,
        ACTION_LATENCY_UPDATED: ACTION_LATENCY_UPDATED,
        ACTION_PREF_CHANGED: ACTION_PREF_CHANGED,
        ACTION_BACKLOG_LOAD_START: ACTION_BACKLOG_LOAD_START,
        ACTION_BACKLOG_ITEM: ACTION_BACKLOG_ITEM,
        ACTION_BACKLOG_LOAD_COMPLETE: ACTION_BACKLOG_LOAD_COMPLETE,
        ACTION_USER_PRESENCE: ACTION_USER_PRESENCE,
        ACTION_TYPING_START: ACTION_TYPING_START,
        ACTION_TYPING_END: ACTION_TYPING_END,
        ACTION_MARK_DIRTY: ACTION_MARK_DIRTY,
        ACTION_CLEAR_DIRTY: ACTION_CLEAR_DIRTY,
        // Action creators
        createAction: createAction,
        connecting: connecting,
        connected: connected,
        disconnected: disconnected,
        connectionError: connectionError,
        roomJoinRequest: roomJoinRequest,
        roomJoinSuccess: roomJoinSuccess,
        roomJoinFail: roomJoinFail,
        messageReceived: messageReceived,
        systemMessage: systemMessage,
        nicklistUpdated: nicklistUpdated,
        topicUpdated: topicUpdated,
        statsUpdated: statsUpdated,
        latencyUpdated: latencyUpdated,
        prefChanged: prefChanged,
        backlogLoadStart: backlogLoadStart,
        backlogItem: backlogItem,
        backlogLoadComplete: backlogLoadComplete,
        markDirty: markDirty,
        clearDirty: clearDirty
    });
}
