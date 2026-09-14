# VEKTOR Meme Launcher Extension

Browser extension prototype for turning viral X/Twitter posts into memecoin launch plans.

## What It Does

- Injects a VEKTOR button into X/Twitter posts.
- Captures visible tweet text, author text, URL, and a simple virality score.
- Opens an overlay beside the feed.
- Generates token name, ticker, meme thesis, launch copy, image prompt, risk flags, and launch steps.
- Can route generation to an Orbio LLM endpoint from extension settings.

## Test In Firefox Without Store Upload

Firefox lets you temporarily load unsigned extensions for local testing.

1. Open Firefox.
2. Go to `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Select this file: `/home/velo/vektor-extension/manifest.json`.
5. Open `https://x.com` or `https://twitter.com`.
6. Find a tweet and click the `Ask VEKTOR` or `Launch meme` button injected into the tweet action row.

Temporary add-ons unload when Firefox restarts. Reload the manifest from `about:debugging` when needed.

This project currently uses Manifest V2 because Firefox's extension validator does not accept Manifest V3 background service workers in this local test setup.

## Test With web-ext

Install dependencies:

```bash
npm install
```

Run syntax checks:

```bash
npm run check
```

Lint as a Firefox extension:

```bash
npm run lint:firefox
```

Launch a clean Firefox test profile:

```bash
npm run run:firefox
```

Build a local zip artifact:

```bash
npm run build:zip
```

## Settings

Open the extension popup to set:

- Wallet address
- Orbio LLM endpoint
- Optional Orbio API key

## Current Limits

- No real token launch transaction is implemented yet.
- No real wallet provider signing is implemented yet.
- The current prototype creates a launch plan and safety checklist only.
