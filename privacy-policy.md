# Privacy policy

_Last updated: 8 September 2026_

Sharp collects nothing.

There is no Sharp account, no Sharp server, and no analytics, telemetry, crash
reporting, or usage measurement of any kind. No data about you or your browsing
is sent to the developer, and none is sold or shared with anyone.

## What stays on your computer

Everything Sharp saves is kept in your browser's local extension storage, on
your machine:

- **Your settings** — filter criteria, presets, author and word rules, model and
  routing choices, appearance preferences.
- **Your API key** for the provider you chose. It is never synced between
  browsers, and it is never given to the web page.
- **A cache of past decisions**, so scrolling past the same posts again does not
  cost you a second request.

You can clear all of it at any time by removing the extension, or clear the
cached decisions alone from **General › Connection › Clear verdicts**.

## What is sent to your AI provider

To decide whether a post matches your criteria, Sharp sends that post to the AI
provider **you** chose and configured, directly from your browser, using **your**
API key. That request contains:

- The visible text of the post
- The author's handle
- The visible reply context, when a post is a reply
- Your filter criteria
- Image and video thumbnail URLs, **only** if you turn image analysis on

Nothing else. No browsing history, no timeline outside the posts being checked,
no identity, no account details.

That request goes straight from your browser to the provider's API. It does not
pass through any server belonging to the developer, because there isn't one.

Your provider's own privacy policy and data-retention terms apply to what they
do with that request. Check them for the provider you pick — for example
[OpenRouter](https://openrouter.ai/privacy), [OpenAI](https://openai.com/policies/privacy-policy),
or [Anthropic](https://www.anthropic.com/legal/privacy).

## Permissions, and why

- **Storage** — to save your settings, key, and decision cache locally.
- **Access to x.com and twitter.com** — to read posts on the page and hide the
  ones that match your criteria.
- **Access to your provider's API** (`openrouter.ai`, `api.openai.com`,
  `api.anthropic.com`, or a custom endpoint you enter) — to send classification
  requests. A custom endpoint asks for its own permission when you save it.

Sharp requests no other permissions and reads no other sites.

## Children

Sharp is not directed at children and collects no personal information from
anyone.

## Changes

If this policy ever changes, the updated version will be published in this
repository and the date above will change.

## Contact

Questions: [open an issue](https://github.com/tshmieldev/sharp/issues).
