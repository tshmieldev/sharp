<div align="center">

<img src="icons/icon128.png" width="76" height="76" alt="">

# Sharp

**Cut the slop.**

Filter your X timeline with an AI model you choose and pay for directly.
Describe what you want to see — or never see again — in plain language.

<a href="https://chromewebstore.google.com/detail/sharp/colokgnfkjacfaahjbionncilmjioedo"><img height="36" src="https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Install from the Chrome Web Store"></a>
&nbsp;
<a href="https://github.com/sponsors/tshmieldev"><img height="36" src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub"></a>

<br><br>

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
  hides, so the algorithm learns alongside the model.
- **Thread escape hatch.** One click above the reply box shows every comment in
  a thread, filters off.
- **Nothing shown before it's judged.** Undecided posts wait behind a
  placeholder, so nothing slips through and the timeline never jumps.
- **Any OpenAI-compatible provider.** OpenRouter, OpenAI, Anthropic, or your
  own endpoint.
- **YouTube, the quiet way.** Hide Shorts, hide comments, and show, blur or
  drop thumbnails. Durations stay. No model involved.
- **Greyscale.** Wash the colour out of the chrome, the content, or both, on X
  and on YouTube. Less pull, same information.

## Private by construction

There is no Sharp account, no Sharp server, and nothing to sign up for. Your API
key lives in your browser and talks to your provider — nobody else sees your
timeline, your filters, or what got hidden.

You pay your provider directly. Nothing is collected, measured, or sent anywhere
else.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/detail/sharp/colokgnfkjacfaahjbionncilmjioedo), or from source:

Sharp isn't in the Chrome Web Store yet. Grab the zip from
[Releases](https://github.com/tshmieldev/sharp/releases) and unzip it, or build
it yourself with [Bun](https://bun.sh):

```sh
git clone https://github.com/tshmieldev/sharp
cd sharp && bun install && bun run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load
unpacked**, and pick the folder.

## Set it up

1. **General › Connection** — choose a provider and paste an API key.
   [OpenRouter](https://openrouter.ai/keys) is the easiest start: one key reaches
   most models, topped up a few dollars at a time.
2. Pick a model. **Browse** sorts the catalogue by popularity, price, context or
   measured latency.
3. **X › Filtering** — write what you want filtered, then **Apply**.

Open X and scroll. **⌥⇧F** turns filtering on and off; **⌥⇧T** unfilters the
thread you're reading.

---

Found a bug? [Open an issue](https://github.com/tshmieldev/sharp/issues).
Building on it? See [CONTRIBUTING.md](CONTRIBUTING.md).

[Privacy policy](privacy-policy.md) · [MIT licensed](LICENSE) ·
Copyright © 2026 tshmieldev
