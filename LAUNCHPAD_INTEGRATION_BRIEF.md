# VEKTOR Launchpad Integration Brief

VEKTOR is a Firefox browser extension that helps users act on memeable X/Twitter posts without leaving the page.

The extension detects high-signal posts, contract addresses, and token references on X/Twitter, then opens an overlay for launch planning or quick-buy actions. The agent and launch/buy execution run through a server-side proxy so private API keys and launchpad credentials are never exposed in the extension.

## What We Are Building

- Detect memeable X/Twitter posts and score them for launch suitability.
- Generate launch-ready token plans from the post context.
- Detect token contract addresses in primary posts and profile bios.
- Let users open a quick-buy panel directly from X/Twitter.
- Let users choose preset buy amounts or enter a custom amount.
- Connect wallet on Robinhood Chain.
- Route token creation and token buying through a launchpad API.

## Target Chain

- Network: Robinhood Chain mainnet
- Chain ID: `4663`
- Hex chain ID: `0x1237`
- Native gas token: `ETH`
- Explorer: `https://robin.etherscan.io`

## Launch Flow Needed

VEKTOR needs an API flow for creating a token from generated metadata.

Required launch inputs:

- `walletAddress`: user wallet address
- `chainId`: expected `4663`
- `tokenName`: generated or user-edited token name
- `ticker`: generated or user-edited token symbol
- `description`: meme thesis / launch description
- `image`: generated image URL or uploaded image payload
- `sourcePostUrl`: X/Twitter post used as launch source
- `sourcePostText`: captured post text
- `metadata`: optional JSON with risk flags, launch score, and agent output

Required launch API capabilities:

- Create draft launch quote or launch intent.
- Return expected fees, required wallet actions, and expiration time.
- Return transaction payload for wallet signing, or execute via launchpad-managed flow if applicable.
- Return launch status after submission.
- Return transaction hash after broadcast.
- Return deployed token contract address.
- Return explorer URL or enough data to build one.

Preferred launch endpoints:

- `POST /launch/quote`
- `POST /launch/prepare`
- `POST /launch/submit`
- `GET /launch/status/:id`

## Quick-Buy Flow Needed

VEKTOR needs an API flow for buying detected launchpad tokens directly from X/Twitter.

Required buy inputs:

- `walletAddress`: user wallet address
- `chainId`: expected `4663`
- `tokenAddress`: detected contract address
- `amountInEth`: selected preset or custom ETH amount
- `slippageBps`: user/default slippage in basis points
- `source`: `post` or `bio`
- `sourceUrl`: X/Twitter URL where the token was detected

Required buy API capabilities:

- Validate whether `tokenAddress` is a launchpad token.
- Return token metadata: name, symbol, decimals, image if available.
- Return bonding curve or pool state if the token has not graduated.
- Return price, market cap, liquidity/reserve, and graduation status.
- Return estimated output amount for a buy.
- Return price impact and fees.
- Return transaction payload for wallet signing.
- Return buy status after submission.
- Return transaction hash after broadcast.

Preferred buy endpoints:

- `GET /tokens/:tokenAddress`
- `GET /tokens/:tokenAddress/market`
- `POST /buy/quote`
- `POST /buy/prepare`
- `POST /buy/submit`
- `GET /buy/status/:id`

## Market Data Needed

VEKTOR currently checks public market APIs when a contract address is detected, but that is not enough for pre-graduation launchpad tokens.

For tokens that have not graduated, market cap should come from the launchpad bonding curve or launch state, not DexScreener.

Needed fields:

- `priceUsd` or `priceEth`
- `marketCapUsd` or `marketCapEth`
- `fdvUsd` if market cap is unavailable
- `liquidityUsd` or reserve values
- `virtualLiquidity` if the launchpad uses virtual reserves
- `tokensSold`
- `totalSupply`
- `circulatingSupply` if different from total supply
- `graduationProgressPercent`
- `graduated`: boolean
- `poolAddress` if graduated
- `bondingCurveAddress` if not graduated

If the launchpad cannot provide USD pricing directly, VEKTOR can compute it from ETH-denominated values plus an ETH/USD oracle or price feed.

## Security Requirements

- VEKTOR extension must never receive launchpad API keys.
- VEKTOR server proxy should hold any private credentials.
- API responses should include only public token/market data and wallet-signable transaction payloads.
- The API should validate chain ID and reject non-Robinhood Chain requests unless explicitly supported.
- The API should distinguish EOAs, unrelated contracts, launchpad tokens, and graduated pool tokens.

## Current VEKTOR State

- Extension UI is working for launch planning and quick-buy preparation.
- Wallet connection targets Robinhood Chain.
- Server-side DeepSeek agent is live for token-plan generation.
- Token validation checks contract bytecode and ERC-20 metadata through Robinhood Chain RPC.
- Quick-buy execution and token launch execution are waiting on launchpad API details.
