# Launchpad Technical Requirements

This document lists the API capabilities that would let VEKTOR route token launching and quick-buy execution through a launchpad.

## Launch Flow

VEKTOR needs an API flow for creating a token from generated metadata.

Launch inputs:

- `walletAddress`: user wallet address
- `chainId`: expected `4663`
- `tokenName`: generated or user-edited token name
- `ticker`: generated or user-edited token symbol
- `description`: meme thesis or launch description
- `image`: generated image URL or uploaded image payload
- `sourcePostUrl`: X/Twitter post used as launch source
- `sourcePostText`: captured post text
- `metadata`: optional JSON with risk flags, launch score, and agent output

Useful launch API capabilities:

- Create draft launch quote or launch intent.
- Return expected fees, required wallet actions, and expiration time.
- Return transaction payload for wallet signing, or execute through a launchpad-managed flow if applicable.
- Return launch status after submission.
- Return transaction hash after broadcast.
- Return deployed token contract address.
- Return explorer URL or enough data to build one.

Possible endpoint shape:

- `POST /launch/quote`
- `POST /launch/prepare`
- `POST /launch/submit`
- `GET /launch/status/:id`

## Quick-Buy Flow

VEKTOR needs an API flow for buying detected launchpad tokens directly from X/Twitter.

Buy inputs:

- `walletAddress`: user wallet address
- `chainId`: expected `4663`
- `tokenAddress`: detected contract address
- `amountInEth`: selected preset or custom ETH amount
- `slippageBps`: user/default slippage in basis points
- `source`: `post` or `bio`
- `sourceUrl`: X/Twitter URL where the token was detected

Useful buy API capabilities:

- Validate whether `tokenAddress` is a launchpad token.
- Return token metadata: name, symbol, decimals, image if available.
- Return bonding curve or pool state if the token has not graduated.
- Return price, market cap, liquidity/reserve, and graduation status.
- Return estimated output amount for a buy.
- Return price impact and fees.
- Return transaction payload for wallet signing.
- Return buy status after submission.
- Return transaction hash after broadcast.

Possible endpoint shape:

- `GET /tokens/:tokenAddress`
- `GET /tokens/:tokenAddress/market`
- `POST /buy/quote`
- `POST /buy/prepare`
- `POST /buy/submit`
- `GET /buy/status/:id`

## Market Data

Public market APIs are useful after a token is indexed or graduated, but pre-graduation launchpad tokens need launchpad-native market data.

Useful market fields:

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

If the launchpad returns ETH-denominated values only, VEKTOR can compute USD values using an ETH/USD price source.

## Validation And Security

- VEKTOR extension must never receive launchpad API keys.
- VEKTOR server proxy should hold private credentials when credentials are required.
- API responses should include public token/market data and wallet-signable transaction payloads.
- API should validate chain ID and reject unsupported networks.
- API should distinguish EOAs, unrelated contracts, launchpad tokens, and graduated pool tokens.
