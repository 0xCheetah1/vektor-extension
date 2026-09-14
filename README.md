# VEKTOR Meme Launcher Extension

VEKTOR is a browser extension for spotting memeable X/Twitter posts and turning them into launch-ready token plans.

## Features

- Adds VEKTOR actions to high-signal X/Twitter posts.
- Skips reply cards so actions stay focused on primary posts.
- Scores posts using visible engagement, memeability, timing, originality, and risk signals.
- Generates token name, ticker, meme thesis, launch copy, image prompt, risk flags, and launch steps.
- Detects EVM contract addresses in primary posts and profile bios.
- Shows a quick-buy speed dial with saved preset amounts and a custom amount field.
- Includes a full dashboard for wallet status and quick-buy presets.

## Dashboard

Open the extension popup, then select `Open VEKTOR dashboard`.

From the dashboard you can:

- Connect or disconnect a browser wallet.
- Check Robinhood Chain wallet status.
- Set quick-buy preset amounts.
- Review the active button/scoring behavior.

## Robinhood Chain

- Chain ID: `4663`
- Hex chain ID: `0x1237`
- Native gas token: `ETH`

## Local Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check
npm run lint:firefox
```

Run the extension in a temporary Firefox profile:

```bash
npm run run:firefox
```

Build a local extension zip:

```bash
npm run build:zip
```

## Current Limits

- Token launch execution is not live yet.
- Quick-buy execution is not live yet.
- Generated plans should be reviewed before taking any onchain action.
