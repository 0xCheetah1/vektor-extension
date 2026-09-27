# VEKTOR Meme Launcher Extension

VEKTOR is a browser extension for spotting memeable X/Twitter posts, generating launch-ready token plans, and launching agent tokens on Robinhood Chain through Orbio Launchpad.

## Features

- Adds VEKTOR actions to high-signal X/Twitter posts.
- Scores posts using visible engagement, memeability, timing, and originality.
- Generates a full launch package: token name, ticker, bio, launch copy, art prompt, and watch-outs.
- Lets you edit project info before launching (name, ticker, bio, X, website, Telegram, creator fee, agent wallet).
- Logo support: use an image from the post (picks between multiple images), upload your own, or generate one with AI.
- Launches the token on Robinhood Chain through Orbio/Pons, signed by your own wallet.
- Quick-buy panel for EVM contract addresses found in posts and bios.
- Dashboard with wallet status, launch history per wallet, and quick-buy presets.

## Install

No coding needed. Download the package for your browser, unzip it, and load it in your browser. This is a manual install because the extension is not in the add-on stores yet.

### Chrome / Chromium

1. Download [vektor-chrome.zip](https://github.com/hermitchase/vektor-extension/releases/latest/download/vektor-chrome.zip) and unzip it to a folder you'll keep (for example `Documents/vektor-chrome`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped `vektor-chrome` folder.
5. Open `https://x.com` and reload the tab.

### Firefox

1. Download [vektor-firefox.zip](https://github.com/hermitchase/vektor-extension/releases/latest/download/vektor-firefox.zip) and unzip it anywhere.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` inside the unzipped folder.
5. Open `https://x.com` and reload the tab.

Firefox temporary add-ons are removed when Firefox closes, so repeat steps 2–4 after a restart. Store installs (one click) will replace this once approved.

## Usage

1. Connect your wallet from the VEKTOR popup or dashboard, and approve Robinhood Chain.
2. On X/Twitter, high-signal posts show an action button:
   - `Ask VEKTOR` for medium-signal posts (analysis only).
   - `Launch meme` for strong posts (full launch package).
3. Click it, review the package, edit `Project info`, and pick a logo.
4. Click `Launch on Orbio` and confirm the transaction in your wallet.
5. The result shows the new token contract address and links to Orbio and the Robinhood explorer.

## Dashboard

Open the extension popup, then select `Open VEKTOR dashboard`. From there you can:

- Connect or disconnect a browser wallet.
- Check Robinhood Chain wallet status.
- See launch history for the connected wallet (token address, Orbio link, explorer link).
- Set quick-buy preset amounts.

Launch history is stored locally in your browser and grouped by wallet address.

## How it works

- The extension talks to a VEKTOR server that generates plans with an AI model, hosts/mirrors launch logos, and prepares launch/buy transactions.
- Transactions are signed and sent by your wallet on Robinhood Chain. VEKTOR never has access to your private keys or seed phrase.
- The post you act on (text and images) is sent to the VEKTOR server for AI processing.

## Robinhood Chain

- Chain ID: `4663`
- Hex chain ID: `0x1237`
- Native gas token: `ETH`
- Explorer: `https://robin.etherscan.io`

## For maintainers (building the packages)

Only needed if you are building the downloadable zips yourself. End users do not run any of this.

```bash
npm install
npm run check
npm run lint:firefox
npm run build:zips
```

`npm run build:zips` creates:

- `web-ext-artifacts/vektor-firefox.zip` (Manifest V2)
- `web-ext-artifacts/vektor-chrome.zip` (Manifest V3)

The server lives in `server/` and runs with `npm run server`.
