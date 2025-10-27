# MRC Rewrite Architecture

## Overview
This directory contains the modular, action-driven rewrite of the MRC (Multi Relay Chat) client. The new architecture eliminates shared state issues, unpredictable redraws, and tight coupling between network events and UI rendering.

## Module Boundaries

### `actions.js`
- **Purpose**: Define all state mutation action types
- **Exports**: Action type constants + creator functions
- **Usage**: Import to dispatch typed actions to the store
- **Pattern**: `{ type: ACTION_*, payload: {...}, ts: Date.now() }`

Action catalog:
- **Connection**: `CONNECTING`, `CONNECTED`, `DISCONNECTED`, `CONNECTION_ERROR`
- **Room**: `ROOM_JOIN_REQUEST`, `ROOM_JOIN_SUCCESS`, `ROOM_JOIN_FAIL`
- **Messages**: `MESSAGE_RECEIVED`, `SYSTEM_MESSAGE`
- **Roster**: `NICKLIST_UPDATED`, `USER_JOINED`, `USER_LEFT`
- **Metadata**: `TOPIC_UPDATED`, `STATS_UPDATED`, `LATENCY_UPDATED`
- **Prefs**: `PREF_CHANGED`
- **Backlog**: `BACKLOG_LOAD_START`, `BACKLOG_ITEM`, `BACKLOG_LOAD_COMPLETE`
- **UI**: `MARK_DIRTY`, `CLEAR_DIRTY`
- **Future**: `USER_PRESENCE`, `TYPING_START`, `TYPING_END`

### `store.js`
- **Purpose**: Pure state container (reducer pattern)
- **API**:
  - `apply(action)` — mutate state based on action
  - `snapshot()` — deep clone of entire state
  - `isDirty()` / `clearDirty()` — UI update flag
  - `getConnection()`, `getRoom()`, `getMessages()`, etc. — slice accessors
- **Guarantees**:
  - No side-effects (no I/O, no network, no timers)
  - All mutations via actions
  - Message pruning at `prefs.maxMessages`
  - Dirty flag set on every state change

State shape:
```javascript
{
  connection: { status, errorMsg, connectedSince },
  room: { name, topic, users: [{ nick, color, idle, flags }], joinState },
  messages: [{ id, ts, nick, text, kind, mention, backlog }],
  stats: { uptime, userCount, roomCount, sites },
  latency: { lastMs, avgMs, samples: [] },
  prefs: { autoJoinRoom, maxMessages, showJoins, toastEnabled, showNickList, msgColor, twitList },
  backlog: { loading, appliedCount }
}
```

### `client.js`
- **Purpose**: Thin wrapper around `MRC_Session`
- **API**:
  - `connect()`, `disconnect()`
  - `cycle()` — poll socket, send queued messages
  - `sendRoomMessage(text)`, `sendPrivateMessage(nick, text)`, `sendCommand(cmd)`
  - `joinRoom(room)`
  - `on(event, callback)` — register event listeners
- **Events emitted**:
  - `connect`, `disconnect`, `error`
  - `message`, `banner`, `nicks`, `topic`, `stats`, `latency`
  - `sent_privmsg`, `ctcp`
- **Design**: Isolates session implementation; controller translates events → actions

### `controller.js`
- **Purpose**: Orchestration layer (glue between client + store + persistence)
- **API**:
  - `connect()`, `disconnect()`
  - `tick()` — called by shell cycle (delegates to `client.cycle()`)
  - `joinRoom(room)`, `sendMessage(text)`, `sendPrivateMessage(nick, text)`, `executeCommand(cmd)`
  - `setPreference(key, value)`, `toggleToast()`, `toggleNickList()`
  - `getSnapshot()`, `isDirty()`, `clearDirty()`
  - `addListener(listener)`, `removeListener(listener)`
- **Responsibilities**:
  - Bind client events → dispatch store actions
  - Expose command API to view
  - Filter messages (twit list, room match, mention detection)
  - Notify listeners of state changes
- **Isolation**: One controller per shell/node (no shared singleton)

### `test_harness.js`
- **Purpose**: Unit tests for store behavior
- **Run**: `jsexec mods/future_shell/lib/mrc/test_harness.js`
- **Coverage**:
  - Initial state
  - Connection lifecycle
  - Room join/leave
  - Message receive/pruning
  - Nicklist updates
  - Stats/latency
  - Preferences
  - Backlog replay
  - Dirty flag
- **Output**: PASS/FAIL counts + detailed assertion logs

## Integration Pattern

### Legacy `MRCService` → New Controller Migration
1. **Instantiate controller** (one per user/node):
   ```javascript
   this.controller = new MrcController({
       host: 'localhost',
       port: 5000,
       user: user.alias,
       pass: user.security.password,
       alias: ensureAlias(settings),
       nodeId: bbs.node_num
   });
   ```

2. **Connect**:
   ```javascript
   this.controller.connect();
   ```

3. **Tick from shell cycle** (replaces internal timer):
   ```javascript
   MRC.prototype.cycle = function() {
       if (this.controller) {
           this.controller.tick();
           if (this.controller.isDirty()) {
               this.draw();
               this.controller.clearDirty();
           }
       }
   };
   ```

4. **Command API**:
   ```javascript
   // Join room
   this.controller.joinRoom('lobby');
   
   // Send message
   this.controller.sendMessage('Hello world');
   
   // Execute command
   this.controller.executeCommand('LIST');
   
   // Set preference
   this.controller.setPreference('toastEnabled', false);
   ```

5. **Listen to state changes** (optional):
   ```javascript
   var listener = {
       onSnapshot: function(state) { /* initial state */ },
       onConnected: function(info) { /* handle connect */ },
       onDisconnected: function(info) { /* handle disconnect */ },
       onError: function(info) { /* handle error */ }
   };
   this.controller.addListener(listener);
   ```

6. **Render from state**:
   ```javascript
   MRC.prototype.draw = function() {
       var state = this.controller.getSnapshot();
       // Render messages: state.messages
       // Render nicklist: state.room.users
       // Render topic: state.room.topic
       // Render stats: state.stats
   };
   ```

7. **Cleanup**:
   ```javascript
   MRC.prototype.cleanup = function() {
       if (this.controller) {
           this.controller.removeListener(this);
           this.controller.disconnect();
       }
   };
   ```

## Key Differences from Legacy `MRCService`

| Legacy `MRCService` | New `MrcController` |
|---------------------|---------------------|
| Singleton fallback (`_sharedMrcService`) | One controller per user/node (isolated) |
| Internal `Timer` + `_scheduleCycle()` | Shell-driven `tick()` |
| `onServiceMessage()` → immediate `draw()` | Store dirty flag → debounced render |
| Direct `this.session.*` access | `client.*` wrapper with normalized events |
| Mixed concerns (network + UI + persistence) | Layered: client → controller → store → view |
| Implicit room switching (ensureActiveRoom) | Explicit `joinRoom()` command |
| Ad-hoc state mutations | Typed actions + reducer pattern |

## Debugging

Enable detailed logging by setting globals:
```javascript
global.__MRC_STORE_DEBUG__ = true;
global.__MRC_CLIENT_DEBUG__ = true;
global.__MRC_CONTROLLER_DEBUG__ = true;
```

Logs will appear via `log(LOG_DEBUG, ...)` calls.

## Next Steps

1. ✅ **Scaffold modules** (actions, store, client, controller, test harness)
2. ⬜ **Run test harness** — verify store behavior
3. ⬜ **Integrate persistence** (read/write INI, backlog JSON)
4. ⬜ **Shim `MRCService`** — provide compatibility layer for gradual migration
5. ⬜ **Refactor `mrc.js` subprogram** — switch to controller API
6. ⬜ **Remove direct `draw()` calls** — rely on dirty flag
7. ⬜ **Eliminate singleton** — pass controller instance explicitly
8. ⬜ **Test multi-user** — ensure no cross-bleed (multiple nodes)
9. ⬜ **Backlog replay** — implement `BACKLOG_*` action sequence
10. ⬜ **Polish** — typing indicators, presence, better latency calc

## Testing

Run the test suite:
```bash
jsexec /sbbs/mods/future_shell/lib/mrc/test_harness.js
```

Expected output:
```
✓ All tests passed!
PASSED: 40
FAILED: 0
```

## Contributing

When adding features:
1. **Define action type** in `actions.js`
2. **Add reducer case** in `store.js` (pure mutation)
3. **Bind client event** in `controller.js` (translate to action)
4. **Expose command** in `controller.js` API (if user-initiated)
5. **Add test** in `test_harness.js` (verify state transition)
6. **Update this README** (document new action + API method)

## License

Same as Synchronet BBS (GPLv2). See main project LICENSE.

---

**Status**: 🚧 Initial scaffold complete. Integration pending.  
**Last Updated**: 2025-10-26  
**Author**: AI-assisted rewrite per architectural plan
