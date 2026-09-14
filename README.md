# VEKTOR Meme Launcher Extension

Browser extension prototype for turning viral X/Twitter posts into memecoin launch plans.

## What It Does

- Injects a VEKTOR button into X/Twitter posts.
- Skips reply cards so buttons stay focused on primary posts.
- Captures visible tweet text, author text, URL, engagement labels, and launch-fit analytics.
- Detects EVM contract addresses in primary posts and profile bios.
- Opens an overlay beside the feed.
- Generates token name, ticker, meme thesis, launch copy, image prompt, risk flags, and launch steps.
- Opens a quick-buy speed dial with three saved ETH presets plus a custom amount for detected contract addresses.
- Can route generation to an internal Orbio LLM endpoint when configured in the extension runtime.

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

## Test From The Local PC SSHFS Mount

The live VPS project can be mounted on the local PC at:

```text
/home/TheCheetah11/vektor-extension
```

When that SSHFS mount is active, load this file in Firefox:

```text
/home/TheCheetah11/vektor-extension/manifest.json
```

Then updates made on the VPS appear in the mounted folder without downloading or unzipping another release.

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

## Dashboard

Open the extension popup to:

- Open the full-page VEKTOR dashboard.
- Connect or disconnect an injected browser wallet from the active X/Twitter tab.
- Switch the browser wallet to Robinhood Chain mainnet when connecting.
- Set the three quick-buy preset amounts used when a contract address is detected.
- Confirm wallet status before preparing a launch.
- Confirm that agent routing is internal.

The full dashboard is available from the popup or Firefox extension options. For wallet connection, open it from the VEKTOR popup while an X/Twitter tab is active so the dashboard can route the request through the page wallet bridge.

## Test Agent With DeepSeek

For local testing, create `/home/velo/vektor-extension/src/agent-config.local.js` from `src/agent-config.example.js` and add your DeepSeek API key there. That local file is ignored by git and excluded from packaged builds.

```js
globalThis.VEKTOR_AGENT_CONFIG = {
  provider: "deepseek",
  endpoint: "https://api.deepseek.com/chat/completions",
  apiKey: "YOUR_DEEPSEEK_API_KEY",
  model: "deepseek-chat",
};
```

Reload the temporary Firefox add-on after creating or editing the local config file.

## Wallet Notes

If Phantom shows `unsupported network`, VEKTOR will still save the connected address and show a warning. Switch Phantom to Robinhood Chain manually, then reconnect. This happens when the wallet provider rejects `wallet_switchEthereumChain` or `wallet_addEthereumChain` even though the wallet app knows the chain.

## Current Limits

- No real token launch transaction is implemented yet.
- No real quick-buy swap/router transaction is implemented yet.
- The current prototype creates a launch plan and safety checklist only.

## Robinhood Chain

- Mainnet chain ID: `4663` (`0x1237`)
- Mainnet RPC: `https://rpc.mainnet.chain.robinhood.com`
- Mainnet explorer: `https://robinhoodchain.blockscout.com`
- Native gas token: `ETH`
- Testnet chain ID: `46630` (`0xb626`)
- Testnet RPC: `https://rpc.testnet.chain.robinhood.com`
