# IconShell / GuiShell for Synchronet

Modern-ish icon based shell and supporting subprograms for a Synchronet BBS.  
Provides a configurable home "desktop" with clickable (keyboard/mouse) icons for chat, external program sections, message/file viewers, online user list, settings, and exit.  The layout, labels, icons, and actions are driven at runtime by `guishell.ini` so a sysop can rearrange or extend the UI without editing JavaScript.

## Features

- Dynamic INI‑driven menu (`guishell.ini`) with ordering and per‑item configuration
- Item types: builtin (chat/settings/exit), xtrn_section (external program groups), command (exec_xtrn / inline JS), who (dynamic online users)
- Auto‑discovery of icon art (`*.ans` / `*.bin`) in `iconshell/lib/icons/`
- Chat subprogram with avatar columns and divider lines
- Extensible Subprogram base (`subprogram.js`) for future modules
- Graceful fallback to static menu if INI is missing or invalid

## Repository Layout (selected)

```
mods/
  guishell.js              Entry point that launches IconShell (or basic fallback)
  guishell.ini             Runtime configuration (menu + welcome message)
  iconshell/
	 lib/
		config.js            Loads INI, builds dynamic menu, color constants
		subfunctions/
		  chat.js            Chat implementation (extends Subprogram)
		  subprogram.js      Minimal base class for shell subprograms
		  gamesmenu.js       External program (games) helper
		  whosonline.js      Online user icon provider
		icons/               Icon art files (*.ans / *.bin)
```

## Requirements

- A working Synchronet BBS installation
- Place this project under `exec/mods` (i.e. `sbbs/exec/mods`)
- Terminal users should have ANSI / extended color enabled for best appearance

## Installation / Setup

1. Copy (or git clone) the contents of this directory into your Synchronet `exec/mods` directory so that `guishell.js` is at:  
	`sbbs/exec/mods/guishell.js`
2. Ensure icons are present in `sbbs/exec/mods/iconshell/lib/icons/`. You can add new ones (ANSI art) using the basename referenced by `icon =` in the INI.
3. Edit `guishell.ini` to taste (see inline comments). Minimal example:

	```ini
	[GuiShell]
	WelcomeMessage = Welcome to My BBS

	[Menu]
	items = chat,games,apps,exit

	[Item.chat]
	type = builtin
	builtin = chat
	label = Chat
	icon = chat

	[Item.games]
	type = xtrn_section
	section = 1
	label = Games
	icon = games

	[Item.apps]
	type = xtrn_section
	section = 0
	label = Apps
	icon = apps

	[Item.exit]
	type = builtin
	builtin = exit
	label = Exit
	icon = exit
	```
4. (Optional) Add a new command item launching an external program:
	```ini
	[Item.reader]
	type = command
	command = exec_xtrn:ECREADER
	label = Mail
	icon = messages
	```
	Then append `,reader` in the `[Menu] items` list where you want it to appear.
5. (Optional) Inline JS command example:
	```ini
	[Item.ping]
	type = command
	label = Ping
	icon = folder
	command = js: this.runExternal(function(){ console.putmsg('\r\nPONG!\r\n'); mswait(600); });
	```

## Making the Shell the User's Default

You can invoke the shell from a logon script or assign it as a command in your Synchronet menu. Typical simple approach in a `logon.js` (or existing mods/logon.js):

```javascript
load("mods/guishell.js");
```

If you want to fall back to the classic interface for low‑speed connections, wrap it with a test on `console.term_supports(USER_ANSI)` or similar flags.

## Runtime Behavior

- On load, `config.js` attempts to read `guishell.ini`. If parsing fails, a static array (hard-coded) supplies the menu.
- Builtin items map to functions registered in `config.js` (`chat`, `settings`, `exit`).
- `xtrn_section` items create dynamic folders whose children are the external programs for that section number (0-based).
- `who` builds a live list of online users each time it is opened.
- `command` items either run an external program (`exec_xtrn:CODE`) or execute inline JavaScript (`js: ...`).
- Chat frames are recreated as needed; avatars (if present) are pulled from user avatar storage via `avatar_lib.js`.

## Adding New Subprograms

1. Create a new file under `iconshell/lib/subfunctions/`, e.g. `notes.js`.
2. Implement a constructor calling `Subprogram.call(this, { name: 'notes' });` and override `draw`, `handleKey`, etc.
3. Expose it via a builtin map or a `command = js:` item that constructs and launches it.

## Troubleshooting

- Blank menu / only fallback: Check `guishell.ini` syntax (every `[Item.key]` referenced in `[Menu] items=` must exist).
- Icon not showing: Ensure `mods/iconshell/lib/icons/<name>.ans` (or .bin) exists and matches `icon =` value.
- Command item does nothing: Confirm prefix `exec_xtrn:` or `js:` is exact (case-sensitive). Errors in inline JS are logged.
- Chat not updating: Verify your JSON chat backend object (`jsonchat`) cycles and submit functions are wired.

## fTelnet and matrix rain screensaver settings
Set `AllowModernScrollback`to false with your fTelnet connection - If you don't change this / turn off the screensaver, the UI will become unresponsive. Something to be maybe be aware of in other terminals too, disabling screensaver in .ini file also works.

## Safety Notes

`js:` command items run arbitrary code in the shell context. Only grant edit access to trusted sysops.

## License / Attribution

No explicit license provided yet. Assume all rights reserved by the original author unless a license file is added. Add one (MIT, BSD, etc.) if you plan to distribute.

## Contributing

1. Fork / branch
2. Make focused change (doc, feature, fix)
3. Test on a live Synchronet instance
4. Submit PR with concise description

## Quick Reference (Cheat Sheet)

| Type           | Required Keys                 | Action                                      |
|----------------|-------------------------------|---------------------------------------------|
| builtin        | builtin=chat|settings|exit    | Runs internal function                      |
| xtrn_section   | section=<number>              | Lists external programs in that section     |
| command (xtrn) | command=exec_xtrn:CODE        | Launches external program CODE              |
| command (js)   | command=js: <JS>              | Executes inline JS in shell context         |
| who            | (none)                        | Shows online users                          |

Enjoy building your own Synchronet desktop experience.
