# TextBrowser — Plan & Iteration Roadmap

A reusable modal component for rendering web content (primarily news articles)
in the BBS terminal. Strips ads/nav/scripts, extracts the readable article body,
and presents it with BBS-native formatting — Ctrl-A colors, TDF fonts for
headings, word-wrapped paragraphs, numbered link footnotes, and eventually
inline sixel images.

---

## Architecture Overview

```
TextBrowser (modal overlay, not a subprogram)
 ├── Fetcher            — HTTPRequest wrapper: redirect-following, timeout, UA spoofing
 ├── ContentExtractor   — Tokenizes HTML, finds article content, strips noise
 ├── TerminalRenderer   — Converts clean HTML tokens → Ctrl-A formatted lines
 └── ScrollView         — Frame-based full-screen modal with keyboard scroll
```

**Usage pattern** (reusable from anywhere a link exists):
```javascript
var browser = new TextBrowser({ parentFrame: shell.view });
browser.open('https://example.com/article');
// Blocks in its own key loop — scroll, read, ESC to dismiss
// Underlying shell content reappears when the overlay frame is destroyed
```

**Key design constraint:** This is NOT a subprogram. It's a lightweight
full-screen or 80-column-minimum modal that renders above the current content
via a child Frame and blocks until dismissed. This makes it trivially reusable —
launch it from the ticker, from the newsreader, from message boards, from
anywhere a URL appears.

---

## Existing Building Blocks

| Component | Location | What it provides |
|-----------|----------|------------------|
| `html2asc.js` | `/exec/load/` | HTML→Ctrl-A converter: headings, bold/italic/underline, links as footnotes, `<pre>`, lists, entity decode, word wrap |
| `HTTPRequest` | `/exec/load/http.js` | HTTP/HTTPS GET/POST, redirect following (301/302/307/308), custom headers, timeout |
| `tdfonts_lib.js` | `/exec/load/` | TheDraw ASCII art font rendering (`loadfont`, `renderfont`) |
| 1,071 TDF fonts | `/ctrl/tdfonts/` | Massive font library for header rendering |
| `html_decode()` | Built-in global | HTML entity → character conversion |
| `word_wrap()` | Built-in global | Text wrapping to column width |
| `img_loader.js` | `future_shell/lib/util/gif2ans/` | Image download, ImageMagick pipeline, `system.popen()`/`system.exec()` patterns, temp file management |
| `convertImageToANSI()` | `future_shell/lib/util/gif2ans/` | Full image→ANSI art pipeline with CGA color mapping |
| Frame system | `/exec/load/frame.js` | Layered terminal frames — child overlays parent, cycle/clear/putmsg |
| `_simplifyText()` | Newsreader | HTML strip, entity decode, Unicode→ASCII — battle-tested on RSS content |
| `_sanitizeTitle()` | `ticker_fetch.js` | Unicode→ASCII mapping (smart quotes, dashes, accented chars) |
| `console.write()` | Synchronet built-in | Raw byte output to terminal (needed for sixel) |
| `system.popen()` | Synchronet built-in | Capture stdout from external commands |

---

## V1 — Core Text Rendering

**Goal:** Fetch a URL, extract the article content, render it as readable
formatted text in a scrollable full-screen modal. No images. No clickable
links. Just clean, readable articles.

### Deliverables

1. **`text_browser.js`** — Main component (`/mods/future_shell/lib/util/text_browser.js`)
   - `TextBrowser(opts)` constructor — accepts `parentFrame`, optional config
   - `open(url)` — fetch, extract, render, enter scroll loop, return on dismiss
   - `close()` — destroy overlay frame, clean up
   - Frame-based overlay covering full parent frame area
   - Keyboard: UP/DOWN arrow scroll, PAGE UP/DOWN, HOME/END, ESC to dismiss

2. **Content Extraction** (inside text_browser.js or a small helper)
   - Strip `<script>`, `<style>`, `<nav>`, `<footer>`, `<aside>`, `<header>` blocks entirely
   - Look for content regions: `<article>`, `<main>`, `<div class="content">`,
     `<div class="entry-content">`, `<div class="post-content">`, etc.
   - If a content region is found, process only that region
   - If not found, process `<body>` with the noise blocks stripped
   - Simple tag-stack tokenizer (~200-300 lines) — not a full DOM, just enough
     to identify open/close tag boundaries and nesting depth

3. **Terminal Renderer** (enhanced version of html2asc.js approach)
   - Block elements: `<p>`, `<div>` → paragraph breaks; `<br>` → newline;
     `<blockquote>` → indented block; `<pre>` → preserve whitespace
   - Inline formatting: `<b>`/`<strong>` → Ctrl-A bold; `<i>`/`<em>` → Ctrl-A cyan;
     `<u>` → Ctrl-A blue; `<s>`/`<strike>` → Ctrl-A strikethrough
   - Headings: `<h1>` → TDF font rendered via `tdfonts_lib.js` (single small font);
     `<h2>`–`<h5>` → colored text with divider decoration (like html2asc.js)
   - Lists: `<ul>`/`<ol>` → bulleted/numbered with indent
   - Links: `<a href="...">text</a>` → `text [1]` with numbered footnotes
     collected at the bottom of the article
   - Entity decoding: `html_decode()` + numeric entities + Unicode→ASCII cleanup
   - Word wrap to frame width

4. **HTTP Fetching**
   - Use `HTTPRequest` from `/exec/load/http.js`
   - Enable redirect following (`follow_redirects = 5`)
   - Set a reasonable User-Agent (some sites block the default)
   - Timeout handling — show error message on failure, don't hang

5. **Ticker Integration**
   - The top header row (ticker bar) should be clickable via hotspot when not
     in a subprogram — clicking it opens the current/most-recent headline link
   - Keyboard shortcut: CTRL-G opens the current headline in TextBrowser
     (CTRL-G is unused by the shell and not intercepted by terminals)
   - Grab `this._headlines[this._headlineIndex].link` and pass to TextBrowser
   - Headline objects already carry `link` (added in commit `a8bd62c`)
   - After TextBrowser dismissal, resume normal shell operation

### V1 Scope Boundaries (explicitly excluded)

- No image rendering (placeholder text: `[Image: alt_text]`)
- No clickable/hotspot links (footnote numbers only)
- No CSS interpretation
- No table rendering (tables stripped to cell text with spacing)
- No JavaScript-rendered content (SPA sites won't work — server-rendered only)
- No caching of fetched pages
- No history/back navigation

---

## V2 — Images & Link Navigation

**Goal:** Add inline image rendering (sixel for capable terminals, ANSI art
fallback, placeholder for neither) and make link footnotes actionable so the
user can follow links to other pages.

### Deliverables

1. **Image Rendering Pipeline**
   - When `<img>` is encountered during content extraction, record `src` and `alt`
   - Decision point in renderer:
     ```
     if _canSixel()  → _renderSixelImage(src, width)
     else if _canAnsi() → _renderAnsiImage(src, width)  [existing gif2ans pipeline]
     else → _renderImagePlaceholder(alt)
     ```
   - **Sixel path:**
     - Requires `img2sixel` installed (`apt install libsixel-bin`)
     - Download image to temp file (reuse img_loader.js HTTPRequest pattern)
     - `system.popen('img2sixel -w <pixels> <tempfile>')` → capture sixel output
     - `console.write(sixelData)` — raw sixel escape sequence to terminal
     - Size images to fit terminal: assume 10x20 pixels/cell or query via `ESC[16t`
     - Clean up temp files
   - **ANSI art path:**
     - Reuse existing `convertImageToANSI()` from `img_loader.js`
     - Render into a sub-frame or inline at cursor position

2. **User Preference: `termSupportsSixel`**
   - Add boolean to user prefs JSON (same pattern as `use_favorites` in ticker)
   - Expose in shell settings UI so we can set it to `true` for testing.
   - Add to new user signup flow (can be part of follow-up work)
   - Default: `false` (safe default; majority of callers may support it, but
     we shouldn't assume until the user opts in)
   - Future: attempt DA1 auto-detection at login (`ESC[c` → check for `4` in
     response parameters), store result, let user override

3. **Actionable Link Footnotes**
   - After rendering, display footnote list at bottom: `[1] https://...`
   - User can press a number key (or type number + ENTER) to follow a link
   - Following a link opens a new TextBrowser instance for that URL
   - BACKSPACE navigates back to the previous page (simple stack)
   - Limit navigation depth to prevent runaway (e.g., max 10 levels)

4. **`<a>` Tag Hotspots (aspirational)**
   - If the shell's hotspot infrastructure supports it: register hotspot regions
     for link text so clicking/selecting them follows the link
   - This is stretch — footnote numbers are the reliable V2 path

### V2 Scope Boundaries

- No CSS color interpretation
- No form submission (`<form>`, `<input>`)
- No cookie/session state
- No page caching (each navigation re-fetches)
- No bookmark/favorites system

---

## V3 — Polish & Integration

**Goal:** Deeper integration with the shell ecosystem, richer formatting,
and quality-of-life features that make TextBrowser feel like a native part
of the BBS experience.

### Deliverables

1. **CSS-to-Ctrl-A Color Mapping (limited)**
   - Parse inline `style="color:..."` attributes on elements
   - Map common CSS color names and hex values to the nearest of 16 ANSI colors
   - Apply as Ctrl-A attribute codes in the rendered output
   - Skip external stylesheets entirely — only inline styles on content elements
   - This is cosmetic polish, not a layout engine

2. **Table Rendering**
   - Simple fixed-width column layout for `<table>`/`<tr>`/`<td>`
   - Calculate column widths from content (longest cell per column)
   - Render with box-drawing characters (CP437 single/double lines)
   - Truncate cells that exceed available width
   - Skip complex nested tables (flatten to text)

3. **Page Caching**
   - Cache rendered output (not raw HTML) keyed by URL
   - LRU with configurable max entries (e.g., 20)
   - Makes BACKSPACE navigation instant
   - Cache lives only for the TextBrowser session, not persisted to disk

4. **Newsreader Integration**
   - "Read full article" action from the newsreader's article view
   - Currently the newsreader shows RSS body content (often truncated summaries)
   - TextBrowser fetches the full article from `article.link`
   - Reuses the same `TextBrowser({ parentFrame })` pattern

5. **Message Board / Mail Integration**
   - URLs detected in message text become launchable
   - User highlights or selects a URL → opens in TextBrowser
   - Could use the hotspot system or a "follow link" key command

6. **Sixel Auto-Detection**
   - At login (or shell startup), send DA1 query: `ESC[c`
   - Parse response: `ESC[?<params>c` — if `4` in params → sixel supported
   - Store result in session, let it override the user pref if detected
   - Timeout gracefully (1-2 second window; if no response, fall back to pref)

7. **`<blockquote>` Nesting & Styling**
   - Render nested blockquotes with increasing indent and color shift
   - Vertical bar prefix (`│`) for quoted content — familiar to BBS users

8. **Loading / Progress Indicator**
   - Show "Fetching..." overlay while HTTP request is in flight
   - For large pages, show byte count or spinner
   - Reuse the toast/overlay patterns already in the shell

---

## Technical Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| SpiderMonkey memory from HTML parsing | Keep tokenizer lightweight — flat token stream, not a DOM tree. Null out tokens after rendering. |
| Sites blocking HTTPRequest User-Agent | Spoof a real browser UA string. Most news sites don't aggressively block. |
| JavaScript-rendered pages (SPAs) | Out of scope. TextBrowser works on server-rendered HTML only. Most news sites still server-render article content for SEO. |
| Malformed HTML breaking the tokenizer | Tokenizer should be forgiving — unclosed tags, missing quotes, etc. Don't try to be a validator. |
| Sixel output size for large images | Scale images to fit terminal width. `img2sixel -w <pixels>` handles this. |
| Sixel + Frame system interaction | Sixel renders at the cursor position via raw escape sequences. Frame system doesn't know about it. May need to `console.write()` sixel data outside the Frame pipeline and manually track cursor position. This needs experimentation. |
| DA1 response intermixing with keystrokes | Buffer and parse input carefully during detection window. Or just rely on the user pref and skip auto-detect until V3. |
| Content extraction heuristics failing | Fallback: if no `<article>`/`<main>` found, render full `<body>` with noise stripped. Won't be perfect but will be readable. |

---

## File Layout

```
/mods/future_shell/lib/util/
  text_browser.js          — Main TextBrowser component (all versions)

/mods/future_shell/lib/util/text_browser/
  content_extractor.js     — HTML tokenizer + article content finder (V1)
  terminal_renderer.js     — Token stream → Ctrl-A formatted lines (V1)
  sixel.js                 — Sixel image rendering pipeline (V2)
  link_navigator.js        — Footnote link following + back stack (V2)
```

---

## Implementation Order (V1)

1. HTML tokenizer + content extractor (the only novel code)
2. Terminal renderer (build on html2asc.js patterns, add TDF for `<h1>`)
3. Frame-based modal overlay with scroll input loop
4. HTTP fetch wrapper with redirect + UA + timeout
5. Wire up: `new TextBrowser(opts).open(url)`
6. Ticker integration: key press on header → open headline link
7. Test against real RSS article URLs from the configured feeds
