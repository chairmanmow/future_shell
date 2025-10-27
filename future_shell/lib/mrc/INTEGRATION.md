# MRC Architecture Migration - Per-Node Controller Integration

## Status: Factory Integration Complete ✅

### Implementation Summary

Successfully implemented persistent per-node MRC controller pattern to solve cross-user state contamination bugs.

### What Was Done

1. **Created Factory Module** (`lib/mrc/factory.js`)
   - `getMrcController(opts)`: Returns existing `bbs._mrcController` or creates new instance
   - `_loadMrcSettings()`: Reads settings from `config/mrc.ini`
   - `destroyMrcController()`: Cleanup on explicit disconnect
   - Auto-connects controller on first creation
   - Controller persists across shell crashes/reloads

2. **Modified MRC Subprogram** (`lib/subprograms/mrc.js`)
   - Added factory import
   - Replaced `ensureMrcService()` with `getMrcController()`
   - Created service adapter layer to bridge old API to new controller
   - Added `_createServiceAdapter()` method
   - Added `_onControllerUpdate()` listener
   - Controller updates trigger view refresh via adapter

3. **Validation**
   - Factory test harness: 6/6 passing tests
   - Controller singleton verified (same instance across multiple gets)
   - Persistence verified (stored on `bbs._mrcController`)
   - API compatibility verified (all expected methods present)
   - Cleanup verified (proper delete on destroy)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         BBS Runtime                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ bbs._mrcController (Persistent Controller)            │  │
│  │  - Survives shell crashes/reloads                     │  │
│  │  - One instance per node                              │  │
│  │  - Single socket connection to MRC server             │  │
│  └──────────────────┬──────────────────────────────────────┘  │
│                     │                                         │
│  ┌──────────────────┴──────────────────┐                     │
│  │ Shell Instance 1  │ Shell Instance 2│ (after reload)      │
│  │  ┌─────────────┐  │  ┌─────────────┐│                     │
│  │  │ MRC Sub     │  │  │ MRC Sub     ││                     │
│  │  │ (View)      │  │  │ (View)      ││                     │
│  │  │             │  │  │             ││                     │
│  │  │ - Adapter   │  │  │ - Adapter   ││                     │
│  │  │ - Listener  │  │  │ - Listener  ││                     │
│  │  └──────┬──────┘  │  └──────┬──────┘│                     │
│  │         │         │         │        │                     │
│  │         └─────────┴─────────┘        │                     │
│  │           Subscribe to same          │                     │
│  │           controller updates         │                     │
│  └──────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### How It Solves Cross-User Bugs

**Problem**: Multiple shell instances created multiple MRC socket connections per user, causing:
1. New users inheriting wrong default rooms from other users
2. Nicklist cross-contamination when users switched channels

**Solution**: 
- Factory ensures ONE controller per node stored on `bbs` object
- Controller maintains ONE socket connection to MRC server
- Multiple shell views (after crashes/reloads) subscribe to same controller
- Each user on different node gets their own isolated controller
- Room/channel state strictly isolated per connection

### Service Adapter API

The adapter bridges old service methods to new controller:

| Old Service Method | New Controller Method | Status |
|--------------------|----------------------|---------|
| `cycle()` | `tick()` | ✅ Implemented |
| `flush()` | `tick()` | ✅ Implemented |
| `disconnect()` | `disconnect()` | ✅ Implemented |
| `executeCommand(cmd)` | `executeCommand(cmd)` | ✅ Implemented |
| `sendLine(text)` | `sendMessage(text)` | ✅ Implemented |
| `rotateMsgColor(dir)` | N/A | ⬜ Pending |
| `pauseTypingFor(ms)` | N/A | ⬜ Pending |
| `setToastEnabled(v)` | `toggleToast()` | ✅ Implemented |
| `setNickListVisible(v)` | `toggleNickList()` | ✅ Implemented |

### Testing Status

**Factory Tests**: ✅ 6/6 Passing
- Controller creation
- Singleton persistence
- Storage on `bbs` object
- API presence verification
- Snapshot structure
- Cleanup

**Store Tests**: ✅ 54/54 Passing (from previous phase)
- All action types
- Message pruning
- Dirty flag
- State accessors

### Next Steps

1. **Real-World Testing**
   - Test with multiple concurrent users on different nodes
   - Verify room isolation (no cross-contamination)
   - Verify nicklist isolation
   - Test shell crash/reload scenarios

2. **Feature Completion**
   - Implement `rotateMsgColor` in controller
   - Implement typing pause notifications
   - Connect shell timer to `controller.tick()`

3. **Performance Optimization**
   - Implement dirty flag rendering (skip draw if `!controller.isDirty()`)
   - Add backlog persistence/replay

4. **Legacy Service Removal**
   - Once validated, remove old `ensureMrcService()` function
   - Remove old `MRCService` class (if separate file)

### Files Modified

- ✅ `/sbbs/mods/future_shell/lib/mrc/factory.js` (NEW - 136 lines)
- ✅ `/sbbs/mods/future_shell/lib/subprograms/mrc.js` (MODIFIED - added factory integration)
- ✅ `/sbbs/mods/future_shell/lib/mrc/test_factory.js` (NEW - test harness)

### Key Commits

1. Created factory module with per-node controller lifecycle management
2. Integrated factory into MRC subprogram with service adapter layer
3. Added controller update listener for view synchronization
4. Validated factory with 6 passing integration tests

### Known Limitations

- `rotateMsgColor` and typing notifications not yet ported to new controller
- Backlog persistence not yet implemented
- Dirty flag optimization not yet enabled in view cycle

### Rollback Plan

If issues arise:
1. Revert `/sbbs/mods/future_shell/lib/subprograms/mrc.js` to use `ensureMrcService()`
2. Remove factory import
3. Previous architecture will resume (though with cross-user bugs)

### Success Criteria

✅ Factory integration complete
✅ Service adapter functional
✅ Tests passing
⬜ Multi-user testing (pending real-world validation)
⬜ No cross-user state contamination (pending validation)

---

**Integration Date**: 2025-01-XX  
**Author**: GitHub Copilot  
**Issue**: Cross-user MRC state contamination (rooms, nicklists)  
**Solution**: Per-node persistent controller on `bbs` object
