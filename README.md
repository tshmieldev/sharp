<div align="center">

<img src="icons/icon128.png" width="76" height="76" alt="">

# Sharp

**Cut the slop.**

Filter your X timeline with an AI model you choose and pay for directly.
Describe what you want to see — or never see again — in plain language.

<a href="https://chromewebstore.google.com/detail/sharp/colokgnfkjacfaahjbionncilmjioedo"><img height="36" src="https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Install from the Chrome Web Store"></a>
&nbsp;
<a href="https://addons.mozilla.org/firefox/addon/sharp/"><img height="36" src="https://img.shields.io/badge/Firefox_Add--ons-Install-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white" alt="Install from Firefox Add-ons"></a>
&nbsp;
<a href="https://github.com/sponsors/tshmieldev"><img height="36" src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub"></a>
<br>
<a href="https://ko-fi.com/tshmieldev"><img height="36" src="https://storage.ko-fi.com/cdn/kofi3.png?v=6" alt="Buy me a coffee at ko-fi.com"></a>
<br><br>
<img src="store/promo.gif" width="600" alt="Typing a filter into Sharp, then posts collapsing on the X timeline">

<sub><a href="store/promo-0.2.0-square.mp4">Square</a> · <a href="store/promo-0.2.0.mp4">Widescreen</a> full quality</sub>

</div>

---

## What it does

- **Filters in your own words.** "Hide engagement bait and crypto threads", or
  "only keep software engineering". Whatever you'd tell a person.
- **Per-author rules.** Never filter someone, or always hide them, straight from
  a post's ⋯ menu.
- **Blocked words**, matched before the model is asked.
- **Teach it.** Mark a hidden post as a wrong call, or pick "Hide posts like
  this" from the ⋯ menu; your recent corrections go to the model as examples.
- **Teach X too.** Optionally, Sharp tells X you're not interested in what it
  hides, so the algorithm learns alongside the model. This is the one feature
  that acts as you on X; the [privacy policy](privacy-policy.md) says exactly
  how.
- **Thread escape hatch.** One click above the reply box shows every comment in
  a thread, filters off.
- **Nothing shown before it's judged.** Undecided posts wait behind a
  placeholder, so the timeline never jumps. If your provider keeps failing, a
  post is shown after three tries rather than held back forever: a broken
  provider should not blank your timeline.
- **A classifier by default.** A decision model scores every post: fast, nearly
  free, and it says how sure it is. Close calls stay behind a tinted banner, and
  you set where the lines fall. Reach it through OpenRouter, Vercel AI Gateway or
  TypeSafe AI, each with a key of its own.
- **Or any chat model.** OpenRouter, OpenAI, Anthropic, or your own
  OpenAI-compatible endpoint, if you would rather have a written reason.
- **Images, when they matter.** Photos are described in words first, and only
  for the posts whose text leaves it in doubt.
- **Debug mode.** Open any judged post to see exactly what was sent, what came
  back and how long each step took.
- **YouTube, the quiet way.** Hide Shorts, hide comments, and show, blur or
  drop thumbnails. Durations stay. No model involved. Works on the mobile site
  too.
- **Greyscale.** Wash the colour out of the chrome, the content, or both, on X
  and on YouTube. Less pull, same information.

## Private by construction

There is no Sharp account, no Sharp server, and nothing to sign up for. Your API
key lives in your browser and talks to your provider — nobody else sees your
timeline, your filters, or what got hidden.

You pay your provider directly. Nothing is collected, measured, or sent anywhere
else.

## Install

**Chrome and other Chromium browsers:** from the
[Chrome Web Store](https://chromewebstore.google.com/detail/sharp/colokgnfkjacfaahjbionncilmjioedo).

**Firefox:** from
[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/sharp/). Firefox 140
or newer.

From source, with [Bun](https://bun.sh):

```sh
git clone https://github.com/tshmieldev/sharp
cd sharp && bun install
bun run build           # Chrome, into the repository root
bun run build:firefox   # Firefox, into firefox/
```

In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load
unpacked**, and pick the repository folder.

In Firefox, open `about:debugging` → **This Firefox** → **Load Temporary
Add-on**, and pick `firefox/manifest.json`. A temporary add-on is gone after a
restart; the listing above is the one that stays. Firefox hands out site
access one origin at a time, so open Sharp and use **Grant access** if it says
it has none for x.com, youtube.com or your provider; reload any tabs that were
already open.

## Set it up

1. **General › AI** — paste a key for the classifier.
   [OpenRouter](https://openrouter.ai/keys) is the easiest start: one key covers
   the classifier and image descriptions, topped up a few dollars at a time. A
   Vercel AI Gateway or TypeSafe AI key works too.
2. **X › Filtering** — write what you want filtered, then **Apply**.
3. Optional: **X › Advanced** sets where a hide starts, how wide the close-call
   margin is, and which posts get their images described. It is also where you
   switch to a chat model; set that model up under **General › AI**, where
   **Browse** sorts the catalogue by popularity, price, context or measured
   latency.

Open X and scroll. **⌥⇧F** turns filtering on and off; **⌥⇧T** unfilters the
thread you're reading.

---

Found a bug? [Open an issue](https://github.com/tshmieldev/sharp/issues).
Building on it? See [CONTRIBUTING.md](CONTRIBUTING.md).

[Privacy policy](privacy-policy.md) · [MIT licensed](LICENSE) ·
Copyright © 2026 tshmieldev
