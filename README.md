# Future Shell for Synchronet

Modern icon-driven shell, desktop, and supporting subprogram suite for Synchronet BBS systems. The Future Shell project powers the Futureland BBS experience and is intended as a reference implementation for building rich Synchronet shells with configurable menus, themed UI, toast notifications, and modular subprograms.

---

## Table of Contents
1. [Highlights](#highlights)
2. [Repository Layout](#repository-layout)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Notifications & Preferences](#notifications--preferences)
6. [Bundled Subprograms](#bundled-subprograms)
7. [Development Notes](#development-notes)
8. [Troubleshooting](#troubleshooting)
9. [Licensing](#licensing)

---

## Highlights
- **INI-driven desktop** &mdash; `guishell.ini` defines the icon layout, labels, actions, and welcome messaging without touching JavaScript.
- **Rich toast system** with mouse hotspots, keyboard tokens, and category-based suppression powered by per-user preferences.
- **Modular subprograms** (`chat`, `newsreader`, `mrc`, `file-area`, `message boards`, etc.) sharing a common `Subprogram` base for lifecycle, frames, color palettes, and timers.
- **Theme overrides** &mdash; `theme.ini` exposes all palette keys (including Newsreader surfaces) so sysops can recolor without recompile.
- **Shell preferences** &mdash; `ShellPrefs` subprogram persists JSON-backed per-user settings (notifications, future toggles) in `mods/future_shell/data/prefs/`.
- **Extensible asset pipeline** &mdash; ANSI / BIN icons resolved at runtime from `future_shell/assets/` with caching.
- **Graceful fallbacks** &mdash; if configuration or modules fail, the shell logs issues and falls back to safe defaults instead of leaving the user at a blank screen.

---

## Repository Layout
```
mods/
  future_shell.js                 # Entry point loaded at logon (?future_shell)
  README.md                       # This document
  future_shell/
    assets/                       # Icon artwork (*.ans / *.bin)
    config/
      guishell.ini                # Desktop/menu configuration
      config.js                   # INI loader, builtin actions, theme registry
      theme.ini                   # Optional color overrides (shared + newsreader)
      newsreader.ini              # Feed/category configuration
    data/                         # JSON data (usage stats, prefs, prefs.json, etc.)
    lib/
      shell/                      # Core shell UI (toast, launch, hotkeys, etc.)
      subprograms/                # Individual subprogram implementations
      util/                       # Shared helpers (layout, lazy loader, etc.)
```

---

## Installation
1. **Clone / copy** this repository into your Synchronet `exec/mods/` directory so that `mods/future_shell.js` exists.
2. **Ensure assets** from `future_shell/assets/` are deployed (add your own ANSI/BIN art as desired).
3. **Launch the shell** from your logon script or menu command:
   ```javascript
   load("mods/future_shell.js");
   ```
4. Optional: disable or adjust the matrix screensaver if using clients (like fTelnet) that do not handle continuous screen writes well.

---

## Configuration
### Desktop (`guishell.ini`)
Located in `mods/future_shell/config/guishell.ini`.
- `[GuiShell]` &mdash; global settings (welcome banner, inactivity).
- `[Menu]` &mdash; comma-separated list of item keys in display order.
- `[Item.<key>]` sections support types:
  - `builtin` &mdash; maps to built-in actions defined in `config.js` (chat, settings, exit, etc.).
  - `xtrn_section` &mdash; renders external door sections (0-based index).
  - `command` &mdash; external programs (`exec_xtrn:CODE`) or inline JavaScript (`js: ...`).
  - `who` &mdash; dynamic online user view.

### Theme (`theme.ini`)
- Overrides palette entries registered by the shell and subprograms.
- Newly added **Newsreader** keys mirror those passed to `registerColors` (LIGHTBAR, LIST_ACTIVE, LINK_BUTTON, etc.).
- Example override:
  ```ini
  newsreader.LIST_ACTIVE = BG_BLUE,WHITE
  shell.SELECTED = BG_MAGENTA,WHITE
  ```

### Other Config
- `config/newsreader.ini` &mdash; feed definitions, categories, icons.
- `config/config.js` &mdash; advanced customization (builtin actions, gating).

---

## Notifications & Preferences
- Toasts are created via `shell.showToast({ title, message, launch, category, sender })`.
- `ShellPrefs` stores per-user configuration in `mods/future_shell/data/prefs/shell_prefs.json`.
- Categories currently respected: `mrc`, `json-chat`, `email`, `launch_notice` (string identifiers).
- The **Shell Preferences** subprogram (accessible from the Settings folder) lets users toggle notification categories/states (`on`, `snooze`, `off`). Values take effect immediately and suppress toast creation at the shell level.

---

## Bundled Subprograms
| Subprogram | Description |
|------------|-------------|
| `chat.js` | JSON Chat client with avatars, roster modal, searchable controls. |
| `mrc.js` | MRC integration with toast notifications and backlog. |
| `newsreader.js` | Feed browser with category navigation, ANSI preview (blink stripping), and image conversion helpers. |
| `file_area.js` | NewsReader-style library/dir/file navigator. |
| `message_boards/` | Message board views with thread controls. |
| `usage-viewer.js` | Statistics dashboard backed by JSONdb usage logs. |
| `shell_prefs.js` | Persistent preference store and minimal UI for notification controls. |
| `sysop_commands.js`, `calendar.js`, `clock.js`, etc. | Additional utilities following the Subprogram base class.

All subprograms extend `Subprogram` for frame management, timers, and consistent lifecycle (`enter`, `draw`, `handleKey`, `cleanup`).

---

## Development Notes
- **Exports** &mdash; Each module should call `registerModuleExports({ SymbolName })` so consumers can destructure results instead of relying solely on globals.
- **Lazy loading** &mdash; Prefer `lazyLoadModule(path, opts)` when repeated loads need caching.
- **Preferences** &mdash; Call `shell.reloadShellPrefs()` (or `shell._getShellPrefs()`) to access current values; notify the shell via `shell.onShellPrefsSaved()` when writing new preferences.
- **Colors** &mdash; Register palettes with `this.registerColors({ ... }, namespace)` so they appear in `theme.ini`.
- **Toast hotspots** &mdash; Use `launch` or `action` when creating toasts so they reconnect to subprograms (e.g., chat and MRC toasts autolaunch their respective apps).

---

## Troubleshooting
| Symptom | Likely Cause / Fix |
|---------|--------------------|
| Desktop falls back to static menu | `guishell.ini` missing or has syntax errors. Check logs for `[icsh-config]` messages. |
| Icons not displaying | Missing corresponding ANSI/BIN in `future_shell/assets/`. Name must match `icon =` value. |
| Toasts ignore preferences | Ensure `category` is supplied to `showToast` and that `ShellPrefs` JSON can be created (verify `future_prefs/data/prefs/` writable). |
| Screensaver locks client | Disable in `guishell.ini` or set client (e.g., fTelnet) `AllowModernScrollback=false`. |
| Inline JS command fails silently | Errors log to Synchronet event log; confirm `command = js:` prefix is exact. |

---

## Licensing
This project is released under the **HM Watch Apps License (HMWA-1.1)**, a custom license crafted for the Futureland shell.

### You May
- Install and run the shell on your own BBS for personal/sysop use.
- Study and adapt source code snippets for educational purposes.
- Customize appearance, icons, and behavior for your own site.

### You May Not
- Provide shell access to non-sysop users without an extended license.
- Redistribute an unmodified or deceptively similar clone for public use.
- Remove attribution or claim the original work as your own.

### Extended Licenses
HM Watch Apps grants expanded permissions to community contributors (ANSI artists, door/game developers, long-running creative boards). Licenses are not sold; requests are evaluated case-by-case.

### Dormancy Clause
If the project is abandoned for ~12 months, the last available version automatically becomes freeware. Subsequent active development reinstates the custom license for new releases.

Full text: [`mods/future_shell/LICENSE.md`](future_shell/LICENSE.md)

---

Enjoy the shell, extend it, and share improvements back with the community. Pull requests and issue reports are welcome.
