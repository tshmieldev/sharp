# Contributing

Technical notes for working on Sharp. For what it does and how to install it,
see the [README](README.md).

**TypeScript · Effect · Preact · esbuild · Chrome Manifest V3**

## Toolchain

Use [Bun](https://bun.sh/) 1.3.10 or newer (CI uses 1.3.10).

```sh
bun install --frozen-lockfile
bun run dev          # rebuild scripts and styles as you edit
bun run build:debug  # one unminified build with inline source maps
bun run typecheck    # strict TypeScript, without emitting
bun run test         # focused provider, storage, cache, RPC and menu checks
bun run format       # format source and docs
bun run check        # types + tests + formatting + production build
bun run release     # build, then zip it for a GitHub release
bun scripts/icon.mjs # regenerate icons/ from geometry
```

Use `bun run test`, not `bun test`: the tests use Vitest, including its jsdom
environments and mocks. `bunfig.toml` runs tool binaries with Bun rather than
their Node.js shebangs; a separate Node.js installation is not required.

`bun.lock` pins dependency versions. `--frozen-lockfile` refuses to change it;
use `bun install` when intentionally updating dependencies. The explicit empty
`trustedDependencies` list blocks dependency lifecycle scripts, including Bun's
default trusted packages. This reduces install-time execution, not the risk of
executing a malicious dependency later during builds or tests.

## Build output

The build writes the bundled scripts, styles, and popup HTML **beside
`manifest.json` in the repository root**, not into a subdirectory. This keeps
the original unpacked-extension path and ID. No runtime code is loaded from a
CDN.

`bun run build` minifies. When a stack trace points at `content.js:45`, use
`bun run build:debug` (or `bun run dev`): readable names, inline source maps, so
Chrome shows the TypeScript line. Do not ship a debug build; `release` rebuilds.

Reload the extension and X tabs to use rebuilt code. **The popup and content
script load from disk on every open, but the service worker keeps running until
the extension is reloaded.** After a rebuild that adds a settings field, a fresh
popup would otherwise be talking to a worker that has never heard of it; the
RPC layer fills missing settings fields with defaults so that window is
survivable, but it is still a mismatch. Reload. Restart `bun run dev` after
changing the manifest, popup HTML, or icons; those static assets are copied at
startup.

If Chrome shows an older UI, run `bun run build` in the repository directory
Chrome actually loaded, then reload the extension and the X tab. Builds in
another checkout or an agent worktree do not update that output. Disable
duplicate older extension instances so they cannot keep modifying the page.
The popup's **Build** timestamp identifies its compiled code; on X,
`document.documentElement.dataset.aitfBuild` should return the same timestamp.
Missing or different values identify a missing or stale content script.

## Code map

```text
src/
  index.ts      Content-script dispatcher: exact hostname → site entry
  common/       Settings/Post schemas, typed RPC, errors, shared rule operations
  background/   Provider protocols, verdict parsing, durable cache, storage, RPC
  x/
    index.ts    Explicit X adapter startup and teardown
    ...         X DOM extraction, local rules, timeline lifecycle, in-page UI
  popup/        Rail, per-site and general sections, model browser, list sheets
tests/          Focused provider/storage, cache, RPC and menu checks
scripts/        Three-entry extension build, and the icon generator
```

**Site entry points are inert until called.** `src/index.ts` dispatches HTTPS
`x.com` and `twitter.com` to `startX()`; importing `src/x/index.ts` alone installs
no listeners or observers. The background worker and popup remain separate
extension entry points.

To add a site, create `src/<site>/index.ts` with an explicit startup function,
add its exact hostname to the dispatcher, and add the necessary matches and host
permissions to `manifest.json`. Keep selectors and page UI inside the site folder.
Shared schemas still describe this extension's current filtering model; a future
adapter that needs different author identities or site-specific settings should
extend that model explicitly, not reuse X's DOM assumptions. Settings that read
as per-site in the popup — filtering on/off, image analysis — are still stored
flat, because X is the only adapter.

**Effect owns external operations:** typed provider/storage failures, abortable
fetches, deadlines, and semaphore-protected writes. Chrome listeners and Preact
handlers are the Promise interop boundaries. Pure parsing, rules, and DOM
extraction stay plain TypeScript.

**The timeline controller owns one state per post:** queued, running, decided,
or waiting to retry. A post is identified by its tweet id, not by a DOM node,
because X recycles nodes and rewrites text when "Show more" is pressed. Changing
AI inputs increments a generation, so stale replies cannot hide posts under a new
filter.

**Undecided posts keep their layout.** A pending post's own children are hidden
with `visibility`, and the skeleton is drawn over it from inside the article.
Nothing resizes when a verdict says show, so X's virtualiser never re-measures
the column and the scroll position holds. Only a confirmed hide resizes anything.
Presentation uses scoped CSS attributes rather than overwriting X's inline styles.

**The rendered menu is the source of truth.** After settings load, an observer
watches X's `#layers` portal and direct ancestor removal/visibility. If the portal
has not mounted yet, a temporary body-subtree observer waits for it, then switches
to the scoped portal observation. There is no menu polling or click deadline.

A single visible dropdown must contain a native `tweetEngagements` link identifying
the exact author and post. Conflicting author markers and ambiguous menus are
rejected. This works for already-open menus, incremental mounts, and virtualized
articles without requiring a captured click or an ARIA relationship. A native
menu without a recognized identity is left untouched.

Preact owns only the injected rows, appended **below** X's own actions. Native
items are never cloned, replaced, or activated by the extension; successful saves
request native dismissal via Escape. Keyboard handling only bridges focus
transitions involving the added rows. Typography, colour, padding and icon size
are sampled from a native menu item. Elements mounted outside a post — the thread
control — sample their typeface from the focal post, because X applies its face
to text elements rather than to their containers.

## Scheduling and batching

**Scanning.** A leading-edge throttle at `SCAN_INTERVAL` (100ms) drives scans
from a MutationObserver, backed by a `POLL_INTERVAL` (200ms) interval that also
covers SPA navigation, delayed focal posts, and expired retry deadlines.

**Selection.** `nearViewport` limits work to the reader's `lookahead` setting, a
percentage of a viewport either side, so posts far from the fold are neither
judged nor paid for. Batches fill to `batchSize` in DOM order, images or not.

**Concurrency.** A full batch is dispatched immediately and the next starts at
once, up to the reader's `concurrency` setting (default 3). Together with
`batchSize` this is the popup's **Spending** control: presets are named pairs
in `spendPresets`, and any other pair reads as Custom. `BATCH_WINDOW` (200ms) only bounds how long a
partial batch waits for stragglers. In the worker, the cache lock covers the
read and the merge but never the provider call, so requests overlap; the merge
re-reads under the lock rather than writing back its original snapshot, so
overlapping batches cannot drop each other's verdicts.

**Deadlines** nest: provider fetch 25s < evaluate 32s < content request 40s.

## Corrections and "Not interested"

**A correction is a verdict the reader made.** Once a hidden post is revealed
with **Show**, a "Wrong call?" strip takes the banner's place and discloses two
checks in flow: _Never filter @author_ (an author rule) and _Keep posts like
this_ (`CORRECT_VERDICT` with `keep`; unchecking sends `forget`). "Hide posts
like this" in the ⋯ menu sends `hide`. The worker replaces any correction with
the same text in `settings.corrections` (bounded to `MAX_CORRECTIONS`) and, for
`keep`/`hide`, writes the corrected verdict straight into the cache under the
current decision scope. A `hide` from the menu settles the post locally first;
a `keep` from a revealed post changes nothing on screen, it is already showing.

**Unsure is a flag, not a score.** The prompt's example row carries
`"unsure":false` so models reproduce the key; it is true only for a hide that
is a close call. It is carried through `parseVerdicts`,
the verdict, and the cache entry. The banner swaps the gavel for an accent
question mark, and
`hideFully` (no banner, article `display: none`) is skipped for unsure posts so
a close call always keeps its banner and its Show button. `showAuthor` only
drops the name from the banner.

Corrections are sent with every batch as JSON examples marked as data, and are
deliberately **not** part of `decisionScope`: they steer future decisions, and
throwing away every cached verdict on each correction would re-buy the visible
timeline for a one-post change. Verdicts cached before a correction stand until
they expire or **Clear cache** is used.

**"Not interested" is opt-in, only on `/home`, and never for an unsure verdict.**
It is sent over the wire first. `wire.js` runs in the page's world
(manifest `world: MAIN`) and decorates `window.fetch`: the original is called
with the original arguments and its promise returned untouched; for `/i/api/`
requests it also reads the signing headers X sent (`authorization`,
`x-csrf-token`, `x-client-transaction-id`, `x-twitter-*`) and, for GraphQL
JSON responses, clones the response and lifts each entry's
`feedbackInfo.feedbackMetadata` keyed by post id. Both cross to the content
script by `window.postMessage`, same-window and same-origin only. `Feedback`
then POSTs `/i/api/2/timeline/feedback.json?feedback_type=DontLike&action_metadata=…`
with body `feedback_type=DontLike&undo=false`, exactly what X's menu sends.
The banner shows "Telling X" then "Told X"; no menu opens and X draws no card,
so nothing in the timeline changes hands. The metadata is Thrift compact:
`{4: [{1: postId}, {2: authorId}], 5: 30 days}`; Sharp echoes X's blob rather
than encoding it. The `x-client-transaction-id` is reused from X's latest call;
if X ever rejects that, the request fails soft and the menu path below runs.

The menu path is the fallback, used when the wire has not yet supplied
metadata and headers for a post, or X refused the request. With `notInterested` on, a
hidden post's ⋯ caret is clicked, the dropdown that names the same post via its
`tweetEngagements` link is found, and the menu item whose text matches
_Not interested in this post_ is activated. While this runs the document carries
`data-aitf-auto`, which hides the dropdown; the menu adapter reads an invisible
dropdown as absent, so it never injects rows into a menu the extension opened.
Reports are serial because X shows one menu at a time; each takes as long as
the menu takes to open and close plus a 200ms gap. Each one makes X mount and
unmount a portal, and opening one closes any menu the reader has open, so the
runner waits for `requestIdleCallback`, never starts one within 250ms of a
scroll event, and holds while any dropdown, menu or dialog is visible in
`#layers`. The mutation observer re-claims a
swapped cell with O(1) work only; the page-wide lookup by handle runs from the
throttled scan. At most once per post
identity per tab, capped per tab, and abandoned after three menus without a
matching item (a non-English
interface). Nothing else in a native menu is ever activated.

The sequence is: verdict → hidden → "Not interested" clicked → the spot stays
hidden while X's "Thanks, X will use this" card materialises → nothing (hide
completely) or a "hidden, X told" banner with Undo. The card names the author
and must never be painted, so the controller claims the post's `cellInnerDiv`
**immediately before the menu item is clicked** (`NotInterested`'s `before`
hook; X can swap the post synchronously inside that click) and dresses it via
`view.applyFeedback` with a "Telling X…" tag (`told`, keyed by post id). X swaps the
cell's contents or the cell itself on its own schedule; the spot is remembered
by parent, index and previous sibling, and the mutation observer re-claims a
swapped cell synchronously, before the frame paints. As a last resort the card
is found by the author's handle, which X prints in "Show fewer posts from …". A cell with no post and a
button is the acknowledged card ("Told X", Undo enabled; Undo activates X's
own). The cell is handed back when X puts a post in it, but only Undo (the same
post, back in its cell) ends the claim; a recycled cell just drops the node,
and the claim waits to find its card again. Unanswered clicks expire after
`FEEDBACK_WAIT`. An acknowledged claim
is kept for the tab (bounded by `MAX_TOLD`): X redraws its card from memory
whenever it rebuilds the timeline, such as after opening a post and going
back, and the handle lookup claims it again each time. Hidden-state CSS is
therefore keyed on `[data-aitf-hidden]` rather than on `article`.

## Rule precedence

1. Disabled filtering, protected surfaces, bypassed threads, the opened post and
   its ancestors, allowed authors, and manually revealed posts stay visible.
2. Blocked authors (including reposters) are hidden.
3. Literal blocked words/phrases are hidden at Unicode word boundaries.
4. Remaining posts are sent for AI classification if a key, model, and criteria
   are configured.

Bookmarks, notifications, messages, and settings are protected surfaces.
Local block rules work without an API key. An empty AI criterion disables only
AI classification, not local rules.

## Storage, cache and cost

- API keys and settings are stored in **local extension storage**, not browser
  sync. This is not encrypted secret storage.
- API requests run in the background worker. Content scripts receive settings
  with a `configured` flag, never API keys. Runtime messages are schema-validated,
  and privileged operations are restricted to the extension popup.
- Stored settings are merged over defaults before decoding, so a build that adds
  a field cannot fail on older data.
- Successful verdicts are cached locally for seven days, up to 4,000 entries.
  Cache identities include `PROMPT_VERSION`, provider, custom endpoint, model,
  routing pin, criteria, image configuration, post ID, author, and text. Bump
  `PROMPT_VERSION` when the system prompt changes in a way that can change a
  verdict; that re-judges the visible timeline once. Mounted reply context
  and thumbnail variants are intentionally excluded to avoid charging again
  whenever X remounts a neighboring post.
- Failed or missing verdicts are not cached. Posts stay visible, with at most
  three attempts per post in a tab (4s, 8s, 16s backoff) before stopping. A
  malformed paid response may still consume tokens.
- Counters track hide events (once per retained post identity in each tab),
  classification attempts, and reported tokens. They are not a billing ledger.
  The connection probe is not included.

### OpenRouter beyond the documented API

Two features read `openrouter.ai/api/frontend/v1/...`, which is **undocumented**
and may change without notice. Both are fetched without an auth header, on a 10s
timeout, and fail soft:

- **Popularity** (`/rankings/models`) — seven days of per-model token totals,
  summed and ranked once, joined to the catalogue by canonical slug. On failure,
  `Popular` falls back to A–Z and the sheet says so.
- **Endpoint speed** (`/stats/endpoint?permaslug=…`) — the documented endpoints
  API returns `latency_last_30m` and `throughput_last_30m` as `null` for every
  provider. The real p50 figures live here, keyed by dated permaslug, which is
  embedded in each endpoint's label. On failure the documented values are used.

### Migrating from the original scripts

When loaded as an update with the same extension ID, settings and API keys are
read from the old sync storage once, validated, and saved locally. Synced API keys
are removed **only after** the local save succeeds. Other legacy sync settings
remain as a backup, but are no longer read after migration.

Loading the build from a different directory can give an unpacked extension a
different ID. In that case Chrome does not expose the old extension's storage to
the new one; configure the new instance manually.

## Validation and remaining limits

The test suite covers provider responses, cache behavior, credential migration,
storage writes, RPC access control, formatting helpers, and the already-open menu
regression. It does not establish that the UI works on a logged-in X page; check
that directly.

Before shipping, manually check with your own browser and provider:

1. Build and load the repository root; check for manifest and service-worker errors.
2. Save a connection and test it, then open an X timeline.
3. Confirm collapse, blur, **Show**, allowed authors, and blocked words. After
   **Show**, open **Wrong call?** and check both rows; the author rule and the
   correction must appear in the popup, and a corrected post must stay decided
   after a reload without a new request. With **Hide completely** on, only
   close calls keep a banner with the question mark.
4. Open a thread: its ancestors/root stay visible; replies may be filtered.
5. Toggle filtering and navigate without reloading; old decisions must not leak
   onto recycled posts.
6. Simulate an offline/rejected provider: posts stay visible and the popup/badge
   reports the error.
7. Reload the worker mid-scroll: cached posts should not create new requests.
8. Open the ⋯ menus of different posts in succession, including reposts, and
   check that author rules target the displayed original author. Check native
   actions, keyboard activation/dismissal, and light/dim/dark themes.
9. Scroll fast in both directions and confirm the scroll position never jumps.
10. Turn on **Mark hidden posts "Not interested"** on Home: hidden posts turn
    into X's "Thanks for your feedback" card one at a time, no menu is visible,
    and the ⋯ menu still works by hand while it runs.

X's DOM is not a public API. Extraction and menu selectors are isolated in
`src/x/extract.ts` and `src/x/post-menu-dom.ts`. The current menu adapter targets
the desktop dropdown, not the mobile bottom sheet. Automated tests use
representative DOM fixtures and mocked provider responses, not a logged-in X
account; verify against your current X layout before relying on it.
