# VEKTOR Launchpad Integration Brief

VEKTOR is a browser extension that helps users discover, evaluate, launch, and buy meme tokens directly from X/Twitter.

The product is built around a simple idea: crypto culture moves fastest on social feeds, but launching or buying from that context is still fragmented. VEKTOR brings the workflow closer to where the signal starts.

## What VEKTOR Does

- Detects memeable X/Twitter posts and scores them for token-launch potential.
- Opens an overlay that turns a post into a launch-ready token concept.
- Generates token name, ticker, meme thesis, launch copy, image prompt, risk flags, and launch steps.
- Detects contract addresses in primary posts and profile bios.
- Shows a quick-buy speed dial for detected tokens with preset and custom buy amounts.
- Connects wallet on Robinhood Chain.
- Keeps AI and launchpad credentials server-side instead of exposing them in the extension.

## Why A Launchpad Integration Matters

VEKTOR can surface social opportunities and prepare the user intent, while the launchpad can provide the execution layer for token creation, quotes, buying, market state, and transaction submission.

The integration would let users move from social discovery to a launch or buy flow with fewer steps, while still keeping signing and execution inside a controlled launchpad-backed path.

## Target Chain

- Network: Robinhood Chain mainnet
- Chain ID: `4663`
- Hex chain ID: `0x1237`
- Native gas token: `ETH`
- Explorer: `https://robin.etherscan.io`

## Current State

- Extension UI is working for launch planning and quick-buy preparation.
- Wallet connection targets Robinhood Chain.
- Server-side agent generation is live.
- Contract-address detection and validation are implemented.
- Launch and buy execution are ready to be connected to a launchpad API.

## Technical Follow-Up

The detailed API surfaces that would make the integration smooth are listed here:

[Launchpad Technical Requirements](./LAUNCHPAD_TECHNICAL_REQUIREMENTS.md)
