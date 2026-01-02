# Copilot Instructions for synchro_gui (Synchronet Future Shell)

Purpose: Enable AI agents to quickly extend/maintain the modern JavaScript “Future Shell” (`mods/future_shell*`) that runs inside the Synchronet JS runtime (NOT a browser, NOT Node). Focus on existing patterns; avoid inventing frameworks.

## Big Picture
- Two-tier shell supervisor: `mods/future_shell.js` loads `iconshell.js` (advanced UI) with fallback to `basicshell.js` (stable minimal). Crashes in IconShell trigger BasicShell; repeated BasicShell crashes stop after `MAX_BASIC_RESTARTS`.
- Environment supplies global objects (`bbs`, `user`, `console`, `system`, `Frame`, `Timer`, etc.) from Synchronet. Do not import Node built‑ins (no `require('fs')`). Use `load("path.js")` for intra-project modules.
- UI = nested `Frame` objects manually positioned & cycled (`frame.cycle()`). Input is synchronous key polling (`console.getkey()`/ global key handlers). Modal & button components abstract some of this.
- Configuration layered: runtime INI files in `ctrl/` (system-level) + shell-specific config under `mods/future_shell/config/` (e.g. `guishell.ini`, `config.js`). Shell code often defensively wraps config loads in `try/catch` and proceeds with defaults.

## Key Directories / Files
- `mods/future_shell.js` – supervisor/entrypoint & crash-handling logic (reload advanced shell, fallback loops, timing backoff, sysop bypass rules).
- `mods/future_shell/iconshell.js` – advanced shell constructor; loads `config/config.js` then `lib/shell/index.js` (composes views, event loops, persistent subprogram instances like `HelloWorld`).
- `mods/future_shell/basicshell.js` – minimal text menu; keep it dependency-light (no complex Frames) for reliability.
- `mods/future_shell/lib/util/layout/button.js` & `modal.js` – reusable layout primitives (centered geometry, focus management, hotkeys, prompt handling). Study these before adding new UI widgets.
- `mods/future_shell/lib/util/perf.js` – optional instrumentation (idempotent). When present, it monkey-patches `Frame`, `Timer`; use existing hooks (`ICSH_PERF_TAG(frame, tag)`) rather than duplicating.
- `install-sbbs.mk` – build/install workflow for native C/C++ core; JS shell itself is hot-loaded (no bundling step).

## Runtime / Workflow
- Hot reloading advanced shell: in BasicShell press `R` (calls callback to reload `iconshell.js`). Supervisor then restarts IconShell without terminating session.
- Crash classification: throwing / raising 'Exit Shell' (string or `Error.message`) is a soft exit (no error log, returns to logoff or fallback depending on user security). Any other exception logs via `safeLog()` and may beep.
- Modal lifecycle: create via `new Modal({...}).open()`. Use `Modal.handleGlobalKey(key)` inside global key loop to delegate. Always call `.close()` or rely on `_emit()` to ensure frames cleaned up (leak prevention tracked by perf).
- Non-blocking waits: prefer `mswait(ms)` if available; fallback loop uses `yield(true)` with manual time math (see `sleepMs`). Replicate pattern for consistent CPU yield.

## Conventions / Patterns
- Always guard optional globals & APIs: `try { log(LOG_INFO, ...) } catch(_) {}` to stay resilient in different invocation contexts.
- Defensive config parsing: open `File`, read, regex match needed key(s), ignore rest; avoid heavy INI parsers unless already present.
- Attribute (color) resolution centralized through helper hooks (e.g. `ICSH_ATTR('MODAL')`); when adding components, first attempt theme hook, fallback to computed attr bits.
- Input components avoid hard-coding keycodes: reference constants (`KEY_LEFT`, `KEY_RIGHT`) if defined; otherwise allow ASCII escape sequences (`\x00K`, `\x00M`).
- Button / modal focus cycling uses wrap-around with disabled-skip logic; reuse `_focusNext/_focusPrevious` patterns when extending navigation.
- Keep BasicShell changes minimal—its stability is relied upon for recovery; no experimental features there.
- Performance instrumentation: do not double wrap `Frame`/`Timer`. Check `if(global.__ICSH_PERF__)` before adding new performance hooks.

## Adding Features Safely
- For new views or subprograms: load modules via `load("future_shell/lib/.../myfeature.js")` inside IconShell initialization chain (`lib/shell/index.js`) rather than modifying supervisor.
- For dialogs: extend `Modal` via composition (wrap instance) instead of altering core file unless fixing a reusable defect. If editing `modal.js`, preserve public API: `new Modal(opts)`, `.handleKey()`, `.close()`, `.result()`.
- When introducing timers/events, use existing `Timer.addEvent` so perf hooks auto-track. Avoid busy loops; yield.

## External Integration
- Synchronet core recompiled separately via makefile; shell JavaScript assumes binaries installed in `exec/`. Don’t add Node-based build tooling.
- Access to filesystem or network should go through Synchronet-provided objects (e.g., `File`, `system`, `bbs` APIs). If unsure, inspect similar existing code under `exec/` or `mods/`.
- Always prefer existing fields/methods from the Synchronet JavaScript Object Model (JSOBJ) before writing custom introspection logic. Official docs: https://www.synchro.net/docs/jsobjs.html  (bookmark this). For example, external program visibility and run-eligibility should use `can_access` / `can_run` flags from `xtrn_area` program objects instead of ad-hoc security/AR recomputation unless those flags are absent or clearly stale.
- When adding access control or metadata-driven features: 1) Look up object shape in JSOBJ docs, 2) Log (in dev) the raw object to confirm fields exist, 3) Only then design fallbacks. This reduces drift and brittle heuristics.

## Example Key Loop Snippet (Pattern)
```
while(bbs.online) {
  var k = console.inkey(K_NONE, 50);
  if(k && Modal.handleGlobalKey(k)) continue; // delegate to top modal
  // ... other key dispatch ...
  yield(true);
}
```

## Do / Avoid
- DO reuse Frame geometry helpers (`Modal.centerRect`) for consistent layout.
- DO wrap all logging in try/catch.
- DO prefer composition over modifying supervisor for feature additions.
- AVOID Node-specific APIs, promises, async/await (environment is synchronous/cooperative yield-based).
- AVOID leaking Frames (always `.close()` or ensure parent cleanup).
- AVOID adding complexity to BasicShell.
- DO consult the Synchronet JavaScript Object Model first (https://www.synchro.net/docs/jsobjs.html). Built-in flags like `can_access`, `can_run`, `settings`, `sec_level` often eliminate the need for custom duplicate logic.

Feedback: If any section is unclear (e.g., want more on view architecture in `lib/shell/`), ask and we can expand targeted details.
