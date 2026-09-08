# Sharp

A small Chrome/Chromium Manifest V3 extension that filters X timelines using your
own AI provider, word blocklists, and author rules.

**TypeScript · Effect · Preact · esbuild**

## Run it

Use [Bun](https://bun.sh/) 1.3.10 or newer (CI uses 1.3.10).

```sh
bun install --frozen-lockfile
bun run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's **root directory**.
3. Open the popup. Add your provider's API key and model under **General ›
   Connection**, and describe what to filter under **X › Filtering**. **Save**
   applies both.
4. Optionally use **Test connection**, under **General › Connection**. This sends
   a small, paid test request.
5. Reload any already-open X tabs after installing, updating, or reloading the extension.

The build writes the bundled scripts, styles, and popup HTML beside `manifest.json`
in the repository root. This keeps the original unpacked-extension path and ID.
No runtime code is loaded from a CDN.

New installs default to OpenRouter's **Gemma 4 31B** (`google/gemma-4-31b-it`).
Updates preserve an existing saved model choice.

### Development

```sh
bun run dev          # rebuild scripts and styles as you edit
bun run typecheck    # strict TypeScript, without emitting
bun run test         # focused provider, storage, cache, RPC and menu checks
bun run format       # format source and docs
bun run check        # types + tests + formatting + production build
```

Use `bun run test`, not `bun test`: this project's tests use Vitest, including its
jsdom environments and mocks. `bunfig.toml` runs tool binaries with Bun rather
than their Node.js shebangs; a separate Node.js installation is not required.

`bun.lock` pins dependency versions. `--frozen-lockfile` refuses to change it;
use `bun install` when intentionally updating dependencies. The explicit empty
`trustedDependencies` list blocks dependency lifecycle scripts, including Bun's
default trusted packages. The current toolchain does not need these scripts.
This reduces install-time execution, not the risk of executing a malicious
dependency later during builds or tests.

Reload the extension and X tabs to use rebuilt code. Restart `bun run dev` after
changing the manifest, popup HTML, or icons; those static assets are copied at startup.
Generated output and dependencies are ignored by Git. CI runs the same `check`
command with the repository's dependency lockfile.

If Chrome shows an older UI, run `bun run build` in the repository directory
Chrome actually loaded, then reload the extension and X tab. Builds in another
checkout or an agent worktree do not update that ignored output directory.
Disable duplicate older extension instances so they cannot keep modifying the page.
The popup's **Build** timestamp identifies its compiled code. On X, evaluating
`document.documentElement.dataset.aitfBuild` in DevTools should return the same
timestamp. Missing or different values identify a missing/stale content script.

## Using the filter

- Changes are explicit: **Save**, or **Apply** beside the criteria box, applies
  them to open tabs. Closing the popup without saving discards your draft. Model
  loading and connection testing use the **saved** connection, not the draft.
- A post is withheld behind a placeholder while its verdict is outstanding. The
  placeholder keeps the post's own size, so the timeline does not move when the
  answer arrives. A confirmed hide then collapses or blurs the post, and **Show**
  reveals it for the current tab session.
- Open a post's **⋯ More menu** for **Never filter @author** and
  **Always hide @author**. The active action changes to an explicit undo.
  These rules are mutually exclusive: setting one removes the other atomically.
  Rules apply to the original author of the post, not the person reposting it.
  You can still add reposter rules in the popup.
- On an open post page, **Show all comments in this thread** appears immediately
  above the inline **Post your reply** section, not in the More menu. It bypasses
  this extension's author, word, and AI filters for the current thread.
  **Filter comments in this thread** restores filtering. This shares the
  popup/shortcut's saved thread setting; it does not reveal replies hidden by X
  itself. The control is absent when X does not show an inline reply composer.
- **Alt+Shift+F** toggles filtering. **Alt+Shift+T** toggles filtering for the open
  thread. Shortcuts can be changed at `chrome://extensions/shortcuts`.
- OpenRouter, OpenAI, Anthropic, and custom OpenAI-compatible HTTPS endpoints are
  supported. Select a model that supports image input before enabling images.
- Custom endpoints require a host-permission grant for that specific origin when
  saving. Enter the API base URL, including `/v1` if the server requires it.
- The model list is a convenience, not a guarantee of compatibility. Enter a model
  ID manually if the provider's list is unavailable or incomplete.

Rule precedence is intentional:

1. Disabled filtering, protected surfaces, bypassed threads, the opened post and
   its ancestors, allowed authors, and manually revealed posts stay visible.
2. Blocked authors (including reposters) are hidden.
3. Literal blocked words/phrases are hidden at Unicode word boundaries.
4. Remaining posts are sent for AI classification if a key, model, and criteria
   are configured.

Bookmarks, notifications, messages, and settings are protected surfaces.
Local block rules work without an API key. An empty AI criterion disables only
AI classification, not local rules.

## Privacy and cost

- API keys and settings are stored in **local extension storage**, not browser
  sync. This is not encrypted secret storage; someone with access to your browser
  profile or extension developer tools can read it.
- API requests run in the background worker. Content scripts receive settings
  with a `configured` flag, never API keys. Runtime messages are schema-validated,
  and privileged operations are restricted to the extension popup.
- The selected provider receives post text, author handles, and visible reply
  context. With images enabled, it also receives `pbs.twimg.com` photo/thumbnail
  URLs. This extension has no analytics or application backend.
- Successful verdicts are cached locally for seven days, up to 4,000 entries.
  Cache identities include provider, custom endpoint, model, routing pin,
  criteria, image configuration, post ID, author, and text. Mounted reply context
  and thumbnail variants are intentionally excluded to avoid charging again
  whenever X remounts a neighboring post.
- Provider batches are serialized in the worker to bound traffic and reuse
  overlapping decisions across tabs. Fetches abort after 25 seconds. Waiting
  evaluations have a 32-second overall timeout; content messages have a
  40-second deadline.
- Failed or missing verdicts are not cached. Posts stay visible, with at most
  three attempts per post in a tab before stopping. Reload X to retry after
  fixing a persistent provider/key error. A malformed paid response may still
  consume tokens.
- Clearing the cache and reloading X can incur new API charges. Changing AI
  criteria or model also creates new decisions. Appearance and local rule edits
  reuse existing AI verdicts.
- Counters track hide events (once per retained post identity in each tab),
  classification attempts, and reported tokens. They are not a billing ledger.
  The connection probe is not included.

### Migrating from the original scripts

When loaded as an update with the same extension ID, settings and API keys are
read from the old sync storage once, validated, and saved locally. Synced API keys
are removed **only after** the local save succeeds. Other legacy sync settings
remain as a backup, but are no longer read after migration.

Loading the build from a different directory can give an unpacked extension a
different ID. In that case Chrome does not expose the old extension's storage to
the new one; configure the new instance manually. Keep the original instance
until you have transferred your settings.

The old verdict cache is not reused because its identity could collide for
image-only posts and across providers. Existing criteria presets, model favorites,
author/word lists, and routing preferences retain their storage shapes.

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
extend that model explicitly, not reuse X's DOM assumptions.

**Effect owns external operations:** typed provider/storage failures, abortable
fetches, deadlines, and semaphore-protected writes and evaluations. Chrome
listeners and Preact handlers are the Promise interop boundaries. Pure parsing,
rules, and DOM extraction stay plain TypeScript.

**The timeline controller owns one state per post:** queued, running, decided,
or waiting to retry. DOM nodes are not post identities because X recycles them.
Changing AI inputs increments a generation, so stale replies cannot hide posts
under a new filter. DOM presentation uses scoped CSS attributes rather than
overwriting X's inline styles.

**The UI is deliberately small:** normal forms, explicit saving, model search
via a datalist, saved criteria, and favorites. The old live provider speed/price
rankings and sort-control injection were removed; thread controls are available
above the inline reply section, in the popup, and via keyboard shortcut. The inline
control reuses the timeline controller's scans and settings subscription, and is
removed on composer unmount, navigation, or controller shutdown. It never edits
the reply text or attaches to a modal composer.

**The rendered menu is the source of truth.** After settings load, an observer
watches X's `#layers` portal and direct ancestor removal/visibility. If the portal
has not mounted yet, a temporary body-subtree observer waits for it, then switches
to the scoped portal observation. There is no menu polling or click deadline.

A single visible dropdown must contain a native `tweetEngagements` link identifying
the exact author and post. Conflicting author markers and ambiguous menus are
rejected. This works for already-open menus, incremental mounts, and virtualized
articles without requiring a captured click or an ARIA relationship. A native
menu without a recognized identity is left untouched.

Replacing an entire portal or its contents is handled too. Preact owns only
the injected rows, placed first so they are not clipped below X's long native list.
Native items are never cloned, replaced, or activated by the
extension; successful saves request native dismissal via Escape. Keyboard
handling only bridges focus transitions involving the added rows. Typography,
color, padding and icon size are sampled from a native menu item, with scoped
hover/focus styles. The former author hover menu is gone.

### Validation and remaining limits

The small test suite covers provider responses, cache behavior, credential migration,
storage writes, RPC access control, and the reported already-open menu regression.
It does not establish that the UI works on a logged-in X page; check that directly.

Before shipping, manually check with your own browser and provider:

1. Build and load the repository root; check for manifest and service-worker errors.
2. Save a connection and test it, then open an X timeline.
3. Confirm collapse, blur, Show post, allowed authors, and blocked words.
4. Open a thread: its ancestors/root stay visible; replies may be filtered.
5. Toggle filtering and navigate without reloading; old decisions must not leak
   onto recycled posts.
6. Simulate an offline/rejected provider: posts stay visible and the popup/badge
   reports the error.
7. Try two tabs and reload the worker: cached posts should not create new requests.
8. Open the ⋯ menus of different posts in succession, including reposts, and
   check that author rules target the displayed original author. Check native
   actions, keyboard activation/dismissal, and light/dim/dark themes.

X's DOM is not a public API. Extraction and menu selectors are isolated in
`src/x/extract.ts` and `src/x/post-menu-dom.ts`. The current menu adapter targets
the desktop dropdown, not the mobile bottom sheet. Live X dropdown verification
was blocked by an access-denied response in the development browser. Automated
tests use representative DOM fixtures and mocked provider responses, not a
logged-in X account; verify against your current X layout before relying on it.
