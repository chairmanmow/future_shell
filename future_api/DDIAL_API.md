# FUTURE_API DDial Bridge

Lets an external bot join the DDial chat station this BBS is linked to
(magviz.ca via the fshell_ts link multiplexer) as one of the station's local
lines: read the room, speak publicly, and exchange private messages — all
through the same FUTURE_API JSON service the bot already uses.

## Architecture

```
your bot (node)                      Synchronet host
--------------                      ----------------------------------------
SynchroClient  ── TCP :10088 ──►  JSON service (FUTURE_API scope)
                                    └─ routes/ddial.js  ("the bridge")
                                         └─ TCP 127.0.0.1:5001 (loopback only)
                                              └─ ddial mux (fshell_ts/dist/ddial_mux.js)
                                                   └─ telnet link ──► DDial station
                                                                      (magviz.ca:2301)
```

The mux holds ONE permanent telnet connection to the linked station; every
local user rides it as a numbered line. The bridge attaches the bot's BBS
account as one of those lines (same as an fshell chat session would), using
the mux's newline-JSON session protocol. The mux's attach port is loopback
only and authenticates with plaintext BBS passwords — that is exactly why the
bridge exists: the bot talks to the (exposed, secret-gated) FUTURE_API
instead.

**No pump between requests:** nothing reads the mux socket while the bot is
idle. Inbound frames wait in the OS socket buffer and are drained into an
in-memory ring buffer (default 500 frames) on every `ddial/*` request. A bot
that polls every few seconds sees everything; a bot that never polls
eventually loses old frames off the ring and, in extreme cases, stalls the
socket. Poll regularly or detach.

## Setup (one-time, sysop)

1. **Create a BBS account for the bot** (e.g. alias `FutureBot`) with a strong
   password. The mux verifies real accounts; this is the identity the bot
   chats under.

2. **Create the config** (fail-closed: every endpoint except `ddial/status`
   returns `ddial_api_not_configured` until this exists):

   ```sh
   cp /sbbs/data/future_api_ddial.json.example /sbbs/data/future_api_ddial.json
   # then edit: set secret (openssl rand -hex 32), botUser, botPassword
   ```

   It lives in `data/` (outside the mods repo) so credentials are never
   committed — same convention as `future_api_points.json`.

   | key | default | meaning |
   |---|---|---|
   | `secret` | — | shared secret the bot sends with every call (except status) |
   | `botUser` | — | the bot's BBS account alias |
   | `botPassword` | — | that account's password |
   | `handle` | botUser | public handle shown in chat (≤16 chars) |
   | `muxHost` / `muxPort` | 127.0.0.1 / 5001 | must match `listen_port` in `fshell_ts/config/ddial-link.ini` |
   | `backlog` | 500 | ring buffer size (50–5000) |

3. **Restart the JSON service** so `commands.js` picks up the new route
   (routes are loaded once per service process). A full `sbbs` restart is the
   reliable path on this system.

4. Verify: `{"scope":"FUTURE_API","func":"QUERY","oper":"READ","location":"__probe"}`
   should list `ddial` among the routes, and `ddial/status` should answer with
   `configured: true`.

## Endpoints

All packets ride the usual FUTURE_API envelope:

```json
{"scope":"FUTURE_API","func":"QUERY","oper":"<READ|WRITE>","location":"ddial/...","data":{...}}
```

Responses come back as `func:"RESPONSE"` with the payload in `data`. Every
payload has `ok:true` or `ok:false, error:"<code>"`.

### READ `ddial/status` — no secret

Bridge and link state. Safe to expose; reveals no chat content.

```json
{"ok":true, "configured":true, "attached":true, "line":"3", "handle":"FutureBot",
 "linkState":"linked", "station":"magviz", "locked":false,
 "rosterCount":5, "lastSeq":42, "epoch":1754300000000, "lastError":null}
```

`linkState` is the mux↔station link: `linked`, `authenticating`,
`disconnected` (or `unknown` before the first status frame). `attached` is
the bot↔mux session. The two are independent: you can be attached while the
station link is down — messages then reach only local BBS users until the mux
redials (it queues up to 50 wire lines meanwhile).

### WRITE `ddial/attach` — `{secret, handle?}`

Attach the bot's line (idempotent). Waits up to ~4 s for the mux handshake —
give the request a generous client timeout. Optional `handle` overrides the
configured one for this attachment. Returns the same payload as `status`.

Errors: `mux_unreachable` (mux service down), `Invalid credentials` (bot
account/password wrong), `All 7 lines are in use`, `attach_timeout`.

### WRITE `ddial/detach` — `{secret}`

Drop the line. The mux announces the logout to the station. Call this when
the bot goes offline — an attached line stays visible on the station forever
otherwise (there is no server-side idle timeout, see "No pump" above).

### READ `ddial/poll` — `{secret, since?, limit?, noAttach?}`

The bot's inbox. Auto-attaches when not attached (pass `noAttach:true` to
just peek). Returns frames with `seq > since`, oldest first:

```json
{"ok":true, "epoch":1754300000000, "attached":true, "linkState":"linked",
 "frames":[
   {"seq":41,"ts":"2026-08-04T20:11:02.000Z","kind":"chat",
    "from":{"handle":"Larry","line":"2","linkPrefix":""},"body":"hey bot","local":false,"dual":false},
   {"seq":42,"ts":"...","kind":"pm","from":{"handle":"Sue","line":"9","linkPrefix":"9"},"body":"psst"}
 ],
 "nextSince":42, "more":false, "reset":false, "lastError":null}
```

Cursor contract: store `nextSince` and `epoch` between calls and send
`since = nextSince` next time. If `epoch` changes or `reset:true` comes back,
the service restarted and the sequence space is new — just continue from the
returned `nextSince`. `limit` defaults to 50 (max 200); `more:true` means
poll again immediately.

Frame kinds:

| kind | fields | meaning |
|---|---|---|
| `chat` | `from{handle,line,linkPrefix}, body, local, dual, self?` | public chat line. `local:true` = from another user on THIS BBS; otherwise it arrived over the station link. `self:true` = the bot's own message (synthesized — the mux never echoes your own lines, the bridge adds them so the transcript is complete). |
| `pm` | `from, body, to?, self?` | private message **to the bot** (or from it, when `self:true`) |
| `presence` | `direction: login\|logout, users[]` | someone joined/left |
| `notice` | `text` | unstructured station/system text |
| `status` | `state, station, locked` | link state changed (`state:"detached"` = the bridge lost its mux socket) |

`linkPrefix` on a user means they're on a linked station beyond ours; their
PM-able line number is `linkPrefix + line` concatenated (e.g. prefix `9`,
line `2` → target `92`).

### WRITE `ddial/send` — `{secret, body}`

Say `body` in public chat as the bot. Auto-attaches. Body is trimmed of
control characters, newlines become ` / `, capped at 512 chars. The mux
splits long bodies into ≤255-char wire lines and trickles them to the station
at ~1 line/second (authentic 1980s pacing) — keep bot replies short.
`queued:true` in the response means delivery to the far station is not
immediate (link down or long body); local users see it instantly either way.

### WRITE `ddial/pm` — `{secret, target, body}`

Private message to line `target` (digits only, e.g. `"2"` or a linked-station
path like `"992"`). Get line numbers from `ddial/roster` or from frame
`from.line`/`from.linkPrefix`.

### READ `ddial/roster` — `{secret}`

Who's visible on the station (asks the far side for a fresh list, then
returns the merged roster):

```json
{"ok":true,"attached":true,"station":"magviz","locked":false,
 "entries":[{"handle":"Larry","line":"2","linkPrefix":"","role":"member","location":"T","channel":1}]}
```

### Error codes

`ddial_api_not_configured` · `unauthorized` · `mux_unreachable` ·
`mux_closed_connection` · `mux_send_failed` · `attach_timeout` ·
`attach_failed` · `missing_body` · `invalid_target` ·
`wrong_oper_for_ddial_endpoint` — plus mux hello errors passed through
verbatim (`Invalid credentials`, `All 7 lines are in use`, …).

## Using it from the bot

### SynchroClient helpers (connector/synchro-api.js)

```js
import { SynchroClient } from "./synchro-api.js";

const c = new SynchroClient({ host: "futureland.today", port: 10088 });
await c.connect();
const SECRET = process.env.FUTURE_API_DDIAL_SECRET;

await c.ddialStatus();                      // no secret needed
await c.ddialAttach(SECRET);                // explicit attach (send/poll also auto-attach)
await c.ddialSend(SECRET, "hello from the future");
const inbox = await c.ddialPoll(SECRET, 0); // -> { frames, nextSince, epoch }
await c.ddialPm(SECRET, "2", "just for you");
await c.ddialRoster(SECRET);
await c.ddialDetach(SECRET);                // be polite when going offline
```

### A minimal live loop

```js
let since = 0, epoch = null;
setInterval(async () => {
  const r = await c.ddialPoll(SECRET, since);
  if (!r?.ok) return;
  if (epoch !== null && epoch !== r.epoch) console.log("bridge restarted, resyncing");
  epoch = r.epoch; since = r.nextSince;
  for (const f of r.frames) {
    if (f.self) continue;                         // our own messages
    if (f.kind === "pm") await answerPrivately(f);      // reply via ddialPm
    if (f.kind === "chat" && mentionsBot(f.body))
      await c.ddialSend(SECRET, await composeReply(f)); // keep it short!
  }
}, 3000);
```

### Ollama tool calling (connector/api_definitions/tools.js)

Five tools are defined: `getDdialStatus`, `getDdialRoster`,
`getDdialMessages`, `sendDdialMessage`, `sendDdialPrivateMessage`.

Two things your tool executor must honor beyond the existing
`_endpoint`/`_dataParams` mapping:

- **`_requiresSecret: true`** — merge the shared secret into `packet.data`
  yourself (e.g. `data.secret = process.env.FUTURE_API_DDIAL_SECRET`). It is
  deliberately **not** a tool parameter: the LLM must never see or control it.
- **`_oper: "WRITE"`** — send tools use oper `WRITE` instead of the default
  `READ` (`client.request({ oper: tool._oper ?? "READ", ... })`).

Practical bot-brain tips:

- Call `getDdialMessages` before composing a reply so the model has the live
  conversation; feed `frames` in chronological order and keep the
  `nextSince` cursor in your session state, not in the LLM context.
- Frames with `self:true` are the bot's own lines — include them in context
  (so it doesn't repeat itself) but never treat them as user input.
- Nudge the model toward one-liners: the wire is 255 chars/line at
  1 line/second; a paragraph takes half a minute to trickle out.

## Behavior notes & gotchas

- **One bridge per JSON service process.** Both the public service (:10088)
  and the private loopback one (:12088) load FUTURE_API; if you drive ddial
  through both, you get TWO bot lines on the station. Pick one (the public
  one is the normal choice for an external bot).
- **Cursor/backlog lifetime = service process lifetime.** A JSON service
  restart drops the socket, the backlog, and the epoch. The mux announces the
  bot's logout when the socket dies; the next poll re-attaches and starts a
  new epoch.
- **The bot is a real chat presence.** Attaching announces a login to the
  whole station (and its links); every send is public. Auto-attach means a
  bare `ddial/poll` makes the bot appear in the room — intended for a live
  bot, but worth knowing.
- **The mux itself can be down** (`mux_unreachable`) independently of the
  station link being down (`linkState:"disconnected"`). Status distinguishes
  them.
- **Line supply is finite:** 7 local lines (DDial hardware max), shared with
  human fshell users. The bot holds one while attached.
- **Route changes need a service restart**; config (`future_api_ddial.json`)
  changes do not — it's re-read on every request.

## Testing

Unit tests (no live mux contact): run
`jsexec -c /sbbs/ctrl /sbbs/mods/future_api/tests/test_ddial_route.js` — covers matching,
fail-closed config, secret checks, sanitizers, frame buffering, cursor/reset
semantics, and roster patching.

First live check after restart (from the connector dir):

```js
const s = await c.ddialStatus();        // configured:true, attached:false
await c.ddialAttach(SECRET);            // watch: bot logs into the station
await c.ddialSend(SECRET, "test 123");  // visible in fshell ddial + on magviz
console.log(await c.ddialPoll(SECRET, 0));
await c.ddialDetach(SECRET);            // bot logs out
```
