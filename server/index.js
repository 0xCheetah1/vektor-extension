const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { decodeEventLog, decodeFunctionResult, encodeFunctionData, parseEther, toHex } = require("viem");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PROVIDER = process.env.AGENT_PROVIDER || "deepseek";
const DEEPSEEK_ENDPOINT = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";
const CONFIGURED_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "";
const DEEPSEEK_MODEL = CONFIGURED_DEEPSEEK_MODEL && CONFIGURED_DEEPSEEK_MODEL !== "deepseek-chat" ? CONFIGURED_DEEPSEEK_MODEL : "deepseek-flash";
const ORBIO_ENDPOINT = process.env.ORBIO_ENDPOINT || "";
const ROBINHOOD_RPC_URL = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_EXPLORER_URL = "https://robin.etherscan.io";
const BASEDBID_SDK_API_URL = process.env.BASEDBID_SDK_API_URL || "https://static.based.bid/api";
const BASEDBID_PLATFORM_URL = process.env.BASEDBID_PLATFORM_URL || "https://www.based.bid/api";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ORBIO_TERMS_URL = process.env.ORBIO_TERMS_URL || "https://api.orbio.so/api/protocol/agents/terms";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const ASSET_PUBLIC_BASE_URL = (process.env.ASSET_PUBLIC_BASE_URL || "https://thecheetah11.com/vektor-agent/assets").replace(/\/$/, "");
const LAUNCH_SYSTEM_PROMPT = loadPromptFile(path.join(__dirname, "prompts", "launch-system.txt"));
const TRADE_FACET_ABI = [
  {
    inputs: [
      { internalType: "address", name: "memeToken", type: "address" },
      { internalType: "address", name: "referrer", type: "address" },
      { internalType: "bytes32[]", name: "proof", type: "bytes32[]" },
      { internalType: "uint256", name: "amountInBaseToken", type: "uint256" },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
    ],
    name: "buy",
    outputs: [
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "amountOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
];
const FLASH_LAUNCH_V4_ABI = readAbiFile(path.join(__dirname, "abi", "FlashLaunchForV4Facet.json"));
const ORBIO_AGENT_LAUNCH_ABI = [
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "logo", type: "string" },
          { name: "description", type: "string" },
          {
            name: "socials",
            type: "tuple",
            components: [
              { name: "twitter", type: "string" },
              { name: "telegram", type: "string" },
              { name: "discord", type: "string" },
              { name: "website", type: "string" },
              { name: "farcaster", type: "string" },
            ],
          },
          { name: "creatorFeeRecipient", type: "address" },
          { name: "creatorTaxBps", type: "uint16" },
          { name: "buybackEnabled", type: "bool" },
          { name: "expectedEconomics", type: "bytes32" },
          { name: "salt", type: "bytes32" },
        ],
      },
      { name: "agentWallet", type: "address" },
    ],
    outputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
    ],
  },
  {
    type: "event",
    name: "AgentLaunched",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: false },
      { name: "agentWallet", type: "address", indexed: false },
      { name: "beneficiary", type: "bytes32", indexed: false },
      { name: "feeBps", type: "uint16", indexed: false },
      { name: "launchedAt", type: "uint64", indexed: false },
    ],
  },
];

function readAbiFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, provider: PROVIDER });
    return;
  }

  if (request.method === "GET" && request.url === "/api/eth-price") {
    try {
      sendJson(response, 200, { ok: true, result: await getEthPrice() });
    } catch (error) {
      sendJson(response, error.statusCode || 500, { ok: false, error: error.message || "ETH price lookup failed." });
    }
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/assets/")) {
    serveUploadedAsset(request, response);
    return;
  }

  if (request.method !== "POST" || !["/api/generate-token-plan", "/api/token-info", "/api/basedbid/buy-preview", "/api/basedbid/create-flash", "/api/basedbid/launch-receipt", "/api/orbio/launch-prepare", "/api/orbio/launch-receipt", "/api/generate-image", "/api/upload-image"].includes(request.url)) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const payload = await readJson(request);
    if (request.url === "/api/upload-image") {
      const result = await uploadPublicImage(payload?.dataUrl || "");
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/generate-image") {
      const result = await generateTokenImage(payload?.prompt || "");
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/basedbid/launch-receipt") {
      const result = await getLaunchReceipt(payload?.txHash || "", payload?.expectedSymbol || "");
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/orbio/launch-receipt") {
      const result = await getOrbioLaunchReceipt(payload?.txHash || "", payload?.expectedSymbol || "");
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/token-info") {
      const result = await getTokenInfo(payload?.contractAddress || "");
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/basedbid/buy-preview") {
      const result = await prepareBasedBidBuy(payload || {});
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/basedbid/create-flash") {
      const result = await prepareBasedBidFlashLaunch(payload || {});
      sendJson(response, 200, { ok: true, result });
      return;
    }

    if (request.url === "/api/orbio/launch-prepare") {
      const result = await prepareOrbioLaunch(payload || {});
      sendJson(response, 200, { ok: true, result });
      return;
    }

    const tweetText = payload?.tweetText?.trim();
    if (!tweetText) throw new HttpError(400, "No tweet text captured.");

    const result = await generateTokenPlan(payload);
    sendJson(response, 200, { ok: true, result });
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, { ok: false, error: error.message || "Agent proxy failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`VEKTOR agent proxy listening on http://${HOST}:${PORT}`);
});

async function generateTokenPlan(payload) {
  if (PROVIDER !== "orbio") return callDeepSeek(payload);
  try {
    return await callOrbio(payload);
  } catch (error) {
    if (process.env.DEEPSEEK_API_KEY) return callDeepSeek(payload);
    throw error;
  }
}

async function getEthPrice() {
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new HttpError(response.status, `ETH price lookup failed with ${response.status}`);
  const data = await response.json();
  const usd = Number(data?.ethereum?.usd || 0);
  if (!usd) throw new HttpError(502, "ETH price unavailable.");
  return { symbol: "ETH", usd, source: "CoinGecko" };
}

async function callDeepSeek(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new HttpError(503, "DEEPSEEK_API_KEY is not configured on the server.");

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: LAUNCH_SYSTEM_PROMPT },
        { role: "user", content: await buildDeepSeekUserContent(payload) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new HttpError(response.status, `DeepSeek endpoint failed with ${response.status}: ${errorBody}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

function orbioChatEndpoint() {
  if (ORBIO_ENDPOINT) return ORBIO_ENDPOINT;
  const base = process.env.ORBIO_BASE_URL || "";
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

async function callOrbio(payload) {
  const apiKey = process.env.ORBIO_API_KEY || "";
  const endpoint = orbioChatEndpoint();
  if (!endpoint) throw new HttpError(503, "ORBIO_ENDPOINT or ORBIO_BASE_URL is not configured on the server.");

  const imageUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 4)
    : [];
  const imageParts = imageUrls.length ? await Promise.all(imageUrls.map(fetchImagePart)) : [];
  const prompt = await buildAgentPrompt(payload);
  const userContent = imageParts.filter(Boolean).length
    ? [{ type: "text", text: prompt }, ...imageParts.filter(Boolean)]
    : prompt;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.ORBIO_MODEL || undefined,
      messages: [
        { role: "system", content: LAUNCH_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new HttpError(response.status, `Orbio endpoint failed with ${response.status}: ${errorBody}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.output || data?.text || data?.response;
  return typeof content === "string" ? content : JSON.stringify(data, null, 2);
}

async function buildDeepSeekUserContent(payload) {
  const prompt = buildAgentPrompt(payload);
  const imageUrls = Array.isArray(payload.imageUrls)
    ? payload.imageUrls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 4)
    : [];

  if (!imageUrls.length) return prompt;

  const imageParts = (await Promise.all(imageUrls.map(fetchImagePart))).filter(Boolean);
  if (!imageParts.length) return `${prompt}\n\nImage note: image URLs were captured, but the server could not fetch them for vision analysis.`;

  return [
    { type: "text", text: `${prompt}\n\nVision input status: ${imageParts.length} image(s) are attached below as model-visible image inputs. Use what is visually present. Do not say images could not be analyzed unless you truly cannot identify anything in them.` },
    ...imageParts,
  ];
}

async function fetchImagePart(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 VEKTOR/0.1 image-context",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;

    const contentType = normalizeImageContentType(response.headers.get("content-type") || "");
    if (!contentType) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 6 * 1024 * 1024) return null;

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return {
      type: "image_url",
      image_url: { url: `data:${contentType};base64,${base64}`, detail: "low" },
    };
  } catch (_error) {
    return null;
  }
}

function normalizeImageContentType(contentType) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(type)) return type;
  return "";
}

function buildAgentPrompt(payload) {
  const intent = payload.intent === "analyze_only" ? "analyze_only" : "prepare_launch";
  return `Analyze this captured X/Twitter context as VEKTOR.

Intent: ${intent === "analyze_only" ? "judge whether this post is worth launching as a memecoin; verdict first; do not assume launch should happen" : "prepare a concrete launch package for a launchable post"}
Tweet author: ${payload.author || "unknown"}
Tweet text: ${payload.tweetText}
Tweet URL: ${payload.tweetUrl || "unknown"}
Attached image URLs: ${Array.isArray(payload.imageUrls) && payload.imageUrls.length ? payload.imageUrls.join(", ") : "none captured"}
Client radar analytics, for hinting only: ${JSON.stringify(payload.analytics || {}, null, 2)}
Extra user instructions: ${payload.extraInstructions || "none"}
Wallet connected: ${payload.walletAddress ? "yes" : "no"}
Robinhood Chain explorer: ${ROBINHOOD_EXPLORER_URL}`;
}

async function prepareBasedBidBuy(payload) {
  const contractAddress = String(payload.contractAddress || "").trim();
  const account = String(payload.account || "").trim();
  const amountEth = String(payload.amountEth || "").trim();
  const slippage = Number(payload.slippage || 5);
  const referrer = String(payload.referrer || ZERO_ADDRESS).trim() || ZERO_ADDRESS;

  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) throw new HttpError(400, "Invalid token contract address.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(account)) throw new HttpError(400, "Connect an EVM wallet before preparing a based.bid buy.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(referrer)) throw new HttpError(400, "Invalid referrer address.");
  if (![1, 5, 10].includes(slippage)) throw new HttpError(400, "Slippage must be 1, 5, or 10 percent.");
  if (!Number(amountEth) || Number(amountEth) <= 0) throw new HttpError(400, "Enter a valid ETH amount.");

  let preview;
  try {
    preview = await callBasedBidApi("lbp-buy-preview", {
      data: {
        chainId: 4663,
        address: contractAddress,
        account,
        slippage,
        referrer,
        amount: Number(amountEth),
      },
    });
  } catch (error) {
    if (/Token not found/i.test(error?.message || "")) {
      return prepareUniswapV2Buy(contractAddress, account, amountEth, slippage);
    }
    throw error;
  }

  if (preview.chain?.id && preview.chain.id !== 4663) throw new HttpError(502, "based.bid returned a non-Robinhood transaction.");
  if (!preview.address || !preview.functionName || !Array.isArray(preview.args)) throw new HttpError(502, "based.bid returned an invalid buy preview.");
  if (preview.functionName !== "buy") throw new HttpError(502, `Unsupported based.bid buy function: ${preview.functionName}`);

  const valueWei = BigInt(preview.value || parseEther(amountEth).toString());
  const data = encodeFunctionData({ abi: TRADE_FACET_ABI, functionName: preview.functionName, args: preview.args });

  return {
    chain: "Robinhood Chain",
    chainId: 4663,
    contractAddress,
    amountEth,
    slippage,
    transaction: {
      from: account,
      to: preview.address,
      value: toHex(valueWei),
      data,
      chainId: "0x1237",
    },
    preview: {
      to: preview.address,
      functionName: preview.functionName,
      valueWei: valueWei.toString(),
    },
    basedBidUrl: `${BASEDBID_PLATFORM_URL}/robin/token/${contractAddress}`,
  };
}

const UNISWAP_V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
const UNISWAP_V2_FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const WETH_ROBINHOOD = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const UNISWAP_V2_ROUTER_ABI = [
  { inputs: [{ internalType: "uint256", name: "amountIn", type: "uint256" }, { internalType: "address[]", name: "path", type: "address[]" }], name: "getAmountsOut", outputs: [{ internalType: "uint256[]", name: "amounts", type: "uint256[]" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "uint256", name: "amountOutMin", type: "uint256" }, { internalType: "address[]", name: "path", type: "address[]" }, { internalType: "address", name: "to", type: "address" }, { internalType: "uint256", name: "deadline", type: "uint256" }], name: "swapExactETHForTokensSupportingFeeOnTransferTokens", outputs: [], stateMutability: "payable", type: "function" },
];

async function prepareUniswapV2Buy(contractAddress, account, amountEth, slippage) {
  const amountWei = parseEther(amountEth);
  const token = contractAddress;

  const pair = await rpcCall("eth_call", [{ to: UNISWAP_V2_FACTORY, data: encodePairCall(token) }, "latest"]).then(extractAddress);
  if (!pair || pair === ZERO_ADDRESS) {
    throw new HttpError(400, "No Uniswap V2 pool for this token on Robinhood Chain. Buy it on based.bid instead.");
  }

  const amountsOut = await rpcCall("eth_call", [{
    to: UNISWAP_V2_ROUTER,
    data: encodeFunctionData({ abi: UNISWAP_V2_ROUTER_ABI, functionName: "getAmountsOut", args: [amountWei, [WETH_ROBINHOOD, token]] }),
  }, "latest"]).then((result) => decodeFunctionResult({ abi: UNISWAP_V2_ROUTER_ABI, functionName: "getAmountsOut", data: result }));
  const expectedOut = amountsOut[amountsOut.length - 1];
  if (!expectedOut || expectedOut === 0n) throw new HttpError(400, "Pool returned no output for this amount.");
  const amountOutMin = (expectedOut * BigInt(10000 - slippage * 100)) / 10000n;

  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const data = encodeFunctionData({
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
    args: [amountOutMin, [WETH_ROBINHOOD, token], account, deadline],
  });

  return {
    chain: "Robinhood Chain",
    chainId: 4663,
    contractAddress,
    amountEth,
    slippage,
    route: "uniswap-v2",
    transaction: { from: account, to: UNISWAP_V2_ROUTER, value: toHex(amountWei), data, chainId: "0x1237" },
    preview: { to: UNISWAP_V2_ROUTER, functionName: "swapExactETHForTokens", valueWei: amountWei.toString(), expectedOut: expectedOut.toString(), pair },
    basedBidUrl: `https://trade.based.bid/robinhood/${contractAddress}`,
  };
}

function encodePairCall(token) {
  return "0xe6a43905" + "000000000000000000000000" + WETH_ROBINHOOD.slice(2) + "000000000000000000000000" + token.slice(2);
}

function extractAddress(result) {
  if (!result || result === "0x") return "";
  return "0x" + result.slice(26).toLowerCase();
}

async function prepareBasedBidFlashLaunch(payload) {
  const account = String(payload.account || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(account)) throw new HttpError(400, "Connect an EVM wallet before launching.");

  const tokenName = cleanTokenName(payload.tokenName);
  const ticker = cleanTicker(payload.ticker);
  const launchCopy = String(payload.launchCopy || "").slice(0, 280);
  const memeThesis = String(payload.memeThesis || payload.description || "").slice(0, 600);
  const description = String(payload.description || memeThesis || launchCopy || "").slice(0, 1000);
  const initialBuyUsd = Number(payload.initialBuyUsd || 0);
  const initialBuyAmount = payload.initialBuyAmount !== undefined ? Number(payload.initialBuyAmount || 0) : initialBuyUsd;
  const marketCap = Number(payload.marketCap || 10000);
  const totalSupply = Number(payload.totalSupply || 1_000_000_000);
  const logo = await resolveBasedBidLogo(payload);

  const metadataUrl = await uploadBasedBidMetadata({
    name: tokenName,
    symbol: ticker,
    decimals: 18,
    totalSupply,
    logo,
    board: "",
    twitter: cleanUrl(payload.twitter || payload.tweetUrl || ""),
    telegram: cleanUrl(payload.telegram || ""),
    website: cleanUrl(payload.website || ""),
    discord: "",
    description,
  });

  const apiPayload = {
    isSandboxMode: false,
    chainId: 4663,
    initialBuySupplyPercent: 0,
    distributionWallets: [],
    distributionAmounts: [],
    token: {
      name: tokenName,
      symbol: ticker,
      totalSupply,
      initialBuyAmount,
      metadataUrl,
    },
    sale: {
      boardTitle: "",
      marketCap,
      maxTxAmountPercent: 0.1,
      protectBlocks: 20,
    },
    dex: {
      version: "uniswap_v4",
      feeTier: 3,
    },
    fees: {
      v4: false,
    },
  };

  const preview = await callBasedBidApi("create-flash", { data: apiPayload });
  if (preview.chain?.id && preview.chain.id !== 4663) throw new HttpError(502, "based.bid returned a non-Robinhood launch transaction.");
  if (!preview.address || !preview.functionName || !Array.isArray(preview.args)) throw new HttpError(502, "based.bid returned an invalid launch preview.");
  if (preview.functionName !== "customFlashLaunchV4") throw new HttpError(502, `Unsupported based.bid launch function: ${preview.functionName}`);

  patchFlashLaunchApiArgs(preview.functionName, preview.args, marketCap);
  const launchFunction = FLASH_LAUNCH_V4_ABI.find((item) => item.type === "function" && item.name === preview.functionName);
  if (!launchFunction) throw new HttpError(502, `Launch ABI is missing ${preview.functionName}.`);
  if (preview.args.length !== launchFunction.inputs.length) throw new HttpError(502, `based.bid returned ${preview.args.length} launch args, expected ${launchFunction.inputs.length}.`);
  const args = launchFunction.inputs.map((input, index) => normalizeByAbi(preview.args[index], input, `args[${index}]`));
  const valueWei = BigInt(preview.value || "0");
  const data = encodeFunctionData({ abi: FLASH_LAUNCH_V4_ABI, functionName: preview.functionName, args });

  return {
    chain: "Robinhood Chain",
    chainId: 4663,
    tokenName,
    ticker,
    metadataUrl,
    transaction: {
      from: account,
      to: preview.address,
      value: toHex(valueWei),
      data,
      chainId: "0x1237",
    },
    preview: {
      to: preview.address,
      functionName: preview.functionName,
      valueWei: valueWei.toString(),
      marketCap,
      totalSupply,
    },
  };
}

async function prepareOrbioLaunch(payload) {
  const account = String(payload.account || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(account)) throw new HttpError(400, "Connect an EVM wallet before launching.");

  const terms = await getOrbioLaunchTerms();
  validateOrbioTerms(terms);

  const tokenName = cleanOrbioTokenName(payload.tokenName);
  const ticker = cleanOrbioTicker(payload.ticker);
  const launchCopy = String(payload.launchCopy || "").slice(0, 280);
  const memeThesis = String(payload.memeThesis || payload.description || "").slice(0, 600);
  const description = String(payload.description || memeThesis || launchCopy || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  const logo = await resolveOrbioLogo(payload);
  const requestedAgentWallet = String(payload.agentWallet || "").trim().toLowerCase();
  const agentWallet = /^0x[a-f0-9]{40}$/.test(requestedAgentWallet) ? requestedAgentWallet : account;
  const creatorTaxBps = parseCreatorTaxBps(payload.creatorTax ?? payload.creatorTaxPercent ?? 0, terms.maxCreatorTaxBps ?? 1000);

  const params = {
    name: tokenName,
    symbol: ticker,
    logo,
    description,
    socials: {
      twitter: cleanHttpsUrl(payload.twitter || payload.tweetUrl || ""),
      telegram: cleanHttpsUrl(payload.telegram || ""),
      discord: cleanHttpsUrl(payload.discord || ""),
      website: cleanHttpsUrl(payload.website || ""),
      farcaster: cleanHttpsUrl(payload.farcaster || ""),
    },
    creatorFeeRecipient: ZERO_ADDRESS,
    creatorTaxBps,
    buybackEnabled: false,
    expectedEconomics: terms.economics,
    salt: ZERO_BYTES32,
  };

  const data = encodeFunctionData({ abi: ORBIO_AGENT_LAUNCH_ABI, functionName: "launch", args: [params, agentWallet] });
  const valueWei = BigInt(terms.launchFeeWei);

  return {
    chain: "Robinhood Chain",
    chainId: 4663,
    launchpad: "orbio",
    tokenName,
    ticker,
    logoUrl: logo,
    agentWallet,
    transaction: {
      from: account,
      to: terms.vault,
      value: toHex(valueWei),
      data,
      chainId: "0x1237",
    },
    preview: {
      to: terms.vault,
      functionName: "launch",
      valueWei: valueWei.toString(),
      launchFeeEth: (Number(valueWei) / 1e18).toString(),
      pairToken: terms.pairToken,
      feeBps: terms.feeBps,
      creatorTaxBps,
      cliffSeconds: terms.cliffSeconds,
      economics: terms.economics,
    },
  };
}

async function getOrbioLaunchTerms() {
  const response = await fetch(ORBIO_TERMS_URL, { headers: { Accept: "application/json" } });
  const body = await response.text();
  if (!response.ok) throw new HttpError(response.status, `Orbio launch terms failed: ${body}`);
  try {
    return JSON.parse(body);
  } catch (_error) {
    throw new HttpError(502, "Orbio launch terms returned invalid JSON.");
  }
}

function validateOrbioTerms(terms) {
  if (!terms?.live) throw new HttpError(503, "Orbio launching is not live yet.");
  if (terms.paused) throw new HttpError(503, "Orbio launching is paused.");
  if (terms.chainId !== 4663) throw new HttpError(502, "Orbio returned non-Robinhood launch terms.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(terms.vault || "")) throw new HttpError(502, "Orbio returned no launch vault.");
  if (!/^0x[a-fA-F0-9]{40}$/.test(terms.pairToken || "")) throw new HttpError(502, "Orbio returned no ORBIO pair token.");
  if (!/^0x[a-fA-F0-9]{64}$/.test(terms.economics || "") || terms.economics === ZERO_BYTES32) throw new HttpError(502, "Orbio returned invalid economics.");
  if (terms.pairApproved !== true) throw new HttpError(503, "Pons is not accepting ORBIO launches right now.");
  if (!terms.launchFeeWei || BigInt(terms.launchFeeWei) < 0n) throw new HttpError(502, "Orbio returned invalid launch fee.");
}

async function resolveOrbioLogo(payload) {
  const remoteUrl = cleanHttpsUrl(payload.logoUrl || "");
  if (remoteUrl) return remoteUrl;
  const dataUrl = String(payload.logoDataUrl || "").trim();
  if (dataUrl.startsWith("data:image/")) return (await uploadPublicImage(dataUrl)).url;
  return "";
}

async function uploadBasedBidMetadata(metadata) {
  const response = await fetch(`${BASEDBID_SDK_API_URL}/upload/json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const body = await response.text();
  if (!response.ok) throw new HttpError(response.status, `based.bid metadata upload failed: ${body}`);
  const json = JSON.parse(body);
  const url = json?.response?.url;
  if (!url) throw new HttpError(502, "based.bid metadata upload returned no URL.");
  return url;
}

async function generateTokenImage(prompt) {
  const clean = String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 900);
  if (clean.length < 8) throw new HttpError(400, "Write an image prompt first.");

  const provider = (process.env.IMAGE_PROVIDER || "pollinations").toLowerCase();
  const attempts = [];
  if (provider === "orbio") {
    attempts.push(() => generateOrbioImage(clean));
    if (process.env.CLAWROUTER_URL) attempts.push(() => generateClawRouterImage(clean));
  }
  if (provider === "clawrouter" || provider === "blockrun") attempts.push(() => generateClawRouterImage(clean));
  if (provider === "minimax" && process.env.MINIMAX_API_KEY) attempts.push(() => generateMiniMaxImage(clean));
  attempts.push(() => generatePollinationsImage(clean));

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new HttpError(502, "Image generation failed.");
}

async function generateOrbioImage(prompt) {
  const base = (process.env.ORBIO_BASE_URL || "").replace(/\/+$/, "");
  const endpoint = process.env.ORBIO_IMAGE_ENDPOINT || (base ? `${base}/chat/completions` : "");
  if (!endpoint) throw new HttpError(503, "ORBIO_IMAGE_ENDPOINT or ORBIO_BASE_URL is not configured.");
  const model = process.env.ORBIO_IMAGE_MODEL || "openai/gpt-5-image-mini";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ORBIO_API_KEY ? { Authorization: `Bearer ${process.env.ORBIO_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new HttpError(502, `Orbio image generation failed: ${body.slice(0, 300)}`);

  const json = JSON.parse(body);
  const imageUrl = extractOrbioImageUrl(json);
  if (!imageUrl) throw new HttpError(502, "Orbio returned no image.");

  let buffer;
  let contentType = "image/png";
  if (String(imageUrl).startsWith("http")) {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new HttpError(502, `Could not download Orbio image (${imageResponse.status}).`);
    contentType = normalizeImageContentType(imageResponse.headers.get("content-type") || "") || contentType;
    buffer = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    const match = String(imageUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) contentType = match[1];
    buffer = Buffer.from(String(imageUrl).replace(/^data:image\/\w+;base64,/, ""), "base64");
  }

  return { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, source: `Orbio (${model})`, prompt };
}

function extractOrbioImageUrl(json) {
  const message = json?.choices?.[0]?.message;
  if (message?.images?.length) {
    const first = message.images[0];
    return first?.image_url?.url || first?.url || first;
  }
  if (Array.isArray(message?.content)) {
    const part = message.content.find((item) => item?.type === "image_url" || item?.image_url);
    if (part) return part.image_url?.url || part.image_url;
  }
  const item = json?.data?.[0];
  if (item) return item.url || item.image_url || item.b64_json;
  return null;
}

async function generatePollinationsImage(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=flux`;
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(502, `Image generation failed with ${response.status}.`);
  const contentType = normalizeImageContentType(response.headers.get("content-type") || "") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new HttpError(502, "Image generation returned an empty image.");
  return { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, source: "Pollinations", prompt };
}

function rewriteLocalRouterUrl(returnedUrl, base) {
  try {
    const parsed = new URL(returnedUrl);
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
      return `${base}${parsed.pathname}${parsed.search}`;
    }
    return returnedUrl;
  } catch (_error) {
    return returnedUrl;
  }
}

async function generateClawRouterImage(prompt) {
  const base = process.env.CLAWROUTER_URL || "http://127.0.0.1:8402";
  const model = process.env.IMAGE_MODEL || "openai/gpt-image-1";
  const response = await fetch(`${base}/v1/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size: process.env.IMAGE_SIZE || "1024x1024", n: 1 }),
  });
  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      detail = JSON.parse(body)?.error || body;
    } catch (_error) {
      // keep raw body
    }
    throw new HttpError(502, `ClawRouter image generation failed: ${detail}`);
  }
  const json = JSON.parse(body);
  const returnedUrl = json?.data?.[0]?.url;
  if (!returnedUrl) throw new HttpError(502, "ClawRouter returned no image URL.");
  const imageUrl = rewriteLocalRouterUrl(returnedUrl, base);
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new HttpError(502, `Could not download generated image (${imageResponse.status}).`);
  const contentType = normalizeImageContentType(imageResponse.headers.get("content-type") || "") || "image/png";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  return { dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`, source: `ClawRouter (${model})`, prompt };
}

async function generateMiniMaxImage(prompt) {
  const response = await fetch("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MINIMAX_API_KEY}` },
    body: JSON.stringify({ model: "image-01", prompt, aspect_ratio: "1:1", response_format: "url", n: 1 }),
  });
  const json = await response.json();
  const imageUrl = json?.data?.image_urls?.[0];
  if (!imageUrl) throw new HttpError(502, json?.base_resp?.status_msg || "MiniMax image generation failed.");
  const imageResponse = await fetch(imageUrl);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  return { dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`, source: "MiniMax", prompt };
}

async function resolveBasedBidLogo(payload) {
  const fallback = "https://ipfs.based.bid/ipfs/null";
  const dataUrl = String(payload.logoDataUrl || "").trim();
  const remoteUrl = String(payload.logoUrl || "").trim();

  try {
    if (dataUrl.startsWith("data:image/")) {
      const { buffer, mime } = dataUrlToBuffer(dataUrl);
      return await uploadBasedBidImage(buffer, "logo", mime);
    }
    if (/^https?:\/\//i.test(remoteUrl)) {
      const part = await fetchImagePart(remoteUrl);
      if (part) {
        const { buffer, mime } = dataUrlToBuffer(part.image_url.url);
        return await uploadBasedBidImage(buffer, "logo", mime);
      }
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

function dataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new HttpError(400, "Invalid logo image data.");
  return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
}

async function uploadPublicImage(dataUrl) {
  const { buffer, mime } = dataUrlToBuffer(String(dataUrl || ""));
  const extension = imageExtension(mime);
  if (!extension) throw new HttpError(400, "Use a PNG, JPG, WebP, AVIF, or GIF image.");
  if (!buffer.length) throw new HttpError(400, "Logo image is empty.");
  if (buffer.length > 4 * 1024 * 1024) throw new HttpError(413, "Logo image must be under 4MB.");

  fs.mkdirSync(UPLOAD_DIR, { recursive: true, mode: 0o755 });
  const digest = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const filename = `${digest}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer, { mode: 0o644 });

  const localUrl = `${ASSET_PUBLIC_BASE_URL}/${filename}`;
  let url = localUrl;
  try {
    if (buffer.length <= 1024 * 1024) url = await uploadBasedBidImage(buffer, "logo", mime);
  } catch (_error) {
    url = localUrl;
  }

  return { url, localUrl, bytes: buffer.length, mime };
}

function serveUploadedAsset(request, response) {
  const filename = decodeURIComponent(new URL(request.url, "http://localhost").pathname.split("/").pop() || "");
  if (!/^[a-f0-9]{32}\.(png|jpg|webp|avif|gif)$/.test(filename)) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  const extension = path.extname(filename).slice(1);
  const mime = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", avif: "image/avif", gif: "image/gif" }[extension] || "application/octet-stream";
  response.writeHead(200, {
    "Content-Type": mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(filePath).pipe(response);
}

function imageExtension(mime) {
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
  }[String(mime || "").toLowerCase()] || "";
}

async function uploadBasedBidImage(buffer, name, mime = "image/png") {
  if (!buffer?.length) throw new HttpError(400, "Logo image is empty.");
  if (buffer.length > 1024 * 1024) throw new HttpError(413, "Logo image must be under 1MB.");

  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mime }), `${name}.${extension}`);

  const response = await fetch(`${BASEDBID_SDK_API_URL}/upload/`, { method: "POST", body: form });
  const body = await response.text();
  if (!response.ok) throw new HttpError(response.status, `based.bid image upload failed: ${body}`);
  const json = JSON.parse(body);
  const url = json?.response?.url;
  if (!url) throw new HttpError(502, "based.bid image upload returned no URL.");
  return url;
}

async function callBasedBidApi(endpoint, payload) {
  const response = await fetch(`${BASEDBID_SDK_API_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new HttpError(response.status, `based.bid ${endpoint} failed: ${body}`);
  try {
    return JSON.parse(body);
  } catch (_error) {
    throw new HttpError(502, `based.bid ${endpoint} returned invalid JSON.`);
  }
}

function cleanTokenName(value) {
  const name = String(value || "").replace(/[^a-zA-Z0-9 ._'-]/g, "").trim().slice(0, 80);
  if (!name) throw new HttpError(400, "Token name is required.");
  return name;
}

function cleanTicker(value) {
  const ticker = String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
  if (!ticker || ticker.length < 2) throw new HttpError(400, "Ticker must be 2-10 characters.");
  return ticker;
}

function cleanOrbioTokenName(value) {
  const name = String(value || "").replace(/\p{Cc}/gu, "").trim().slice(0, 64);
  if (!name) throw new HttpError(400, "Token name is required.");
  return name;
}

function cleanOrbioTicker(value) {
  const ticker = String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
  if (!/^[A-Z0-9]{1,12}$/.test(ticker)) throw new HttpError(400, "Symbol must be 1-12 letters or numbers.");
  return ticker;
}

function cleanUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url.slice(0, 300) : "";
}

function cleanHttpsUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.toString().slice(0, 2048);
  } catch (_error) {
    return "";
  }
}

function parseCreatorTaxBps(value, maxBps) {
  const text = String(value || "0").replace(/[^0-9.]/g, "").trim() || "0";
  if (!/^\d{1,2}(\.\d{0,2})?$|^100(\.0{0,2})?$/.test(text)) throw new HttpError(400, "Creator fee must be a percent with at most two decimals.");
  const [whole, fraction = ""] = text.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  if (bps < 0 || bps > Number(maxBps)) throw new HttpError(400, `Creator fee must be between 0% and ${Number(maxBps) / 100}%.`);
  return bps;
}

function patchFlashLaunchApiArgs(functionName, args, marketCap) {
  if (!["customFlashLaunchV4", "simpleFlashLaunchV4", "customFlashLaunchV3", "simpleFlashLaunchV3"].includes(functionName)) return;
  const poolInitialData = args[4];
  if (!Array.isArray(poolInitialData) || poolInitialData[5] != null) return;
  poolInitialData[5] = deriveVirtualEthWei(marketCap);
}

function deriveVirtualEthWei(marketCap) {
  return ((BigInt(marketCap) * 5498997997986328383n) / 10000n).toString();
}

function normalizeByAbi(value, input, pathLabel) {
  if (input.type.endsWith("[]")) {
    const itemInput = { ...input, type: input.type.slice(0, -2) };
    if (itemInput.type === "tuple") {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) return [normalizeByAbi(value, itemInput, `${pathLabel}[0]`)];
      if (Array.isArray(value)) {
        const first = value[0];
        const looksLikeArrayOfTuples = value.length === 0 || Array.isArray(first) || (first !== null && typeof first === "object");
        const tupleItems = looksLikeArrayOfTuples ? value : [value];
        return tupleItems.map((item, index) => normalizeByAbi(item, itemInput, `${pathLabel}[${index}]`));
      }
    }
    if (!Array.isArray(value)) throw new Error(`Expected array at ${pathLabel}`);
    return value.map((item, index) => normalizeByAbi(item, itemInput, `${pathLabel}[${index}]`));
  }

  if (input.type === "tuple") {
    const components = input.components || [];
    if (Array.isArray(value)) return components.map((component, index) => normalizeByAbi(value[index], component, `${pathLabel}[${index}]`));
    if (value !== null && typeof value === "object") {
      const orderedValues = Object.values(value);
      return components.map((component, index) => {
        const key = component.name || index;
        const item = component.name ? value[component.name] : orderedValues[index];
        return normalizeByAbi(item, component, `${pathLabel}.${key}`);
      });
    }
    throw new Error(`Expected tuple at ${pathLabel}`);
  }

  if (value === undefined) throw new Error(`Missing required ABI value at ${pathLabel} (${input.type})`);
  if (value !== null) return value;
  if (input.type === "bool") return false;
  if (input.type === "address") return ZERO_ADDRESS;
  if (input.type.startsWith("uint") || input.type.startsWith("int")) return 0;
  if (input.type === "string") return "";
  if (input.type.startsWith("bytes")) return "0x";
  throw new Error(`Unsupported null ABI value at ${pathLabel} (${input.type})`);
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function getLaunchReceipt(txHash, expectedSymbol) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new HttpError(400, "Invalid transaction hash.");

  const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { status: "pending", txHash };
  if (receipt.status !== "0x1") return { status: "failed", txHash };

  const candidates = new Set();
  for (const log of receipt.logs || []) {
    const topics = log.topics || [];
    const isErc20Mint = topics[0]?.toLowerCase() === TRANSFER_TOPIC
      && topics.length === 3
      && /^0x0{64}$/.test((topics[1] || "").toLowerCase())
      && (log.data || "").length === 66;
    if (isErc20Mint) candidates.add(log.address);
  }

  const tokens = [];
  for (const address of candidates) {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      readTokenString(address, "0x06fdde03"),
      readTokenString(address, "0x95d89b41"),
      readTokenUint(address, "0x313ce567"),
      readTokenUint(address, "0x18160ddd"),
    ]);
    if (!name && !symbol) continue;
    tokens.push({ address, name: name || "Unknown token", symbol: symbol || "", decimals, totalSupply: formatTokenAmount(totalSupply, decimals) });
  }

  const wanted = String(expectedSymbol || "").trim().toUpperCase();
  const token = (wanted && tokens.find((item) => item.symbol.toUpperCase() === wanted)) || tokens[0];
  if (!token) return { status: "confirmed", txHash, token: null };

  return {
    status: "confirmed",
    txHash,
    token: {
      ...token,
      explorerUrl: `${ROBINHOOD_EXPLORER_URL}/token/${token.address}`,
      basedBidUrl: `https://trade.based.bid/robinhood/${token.address}`,
    },
  };
}

async function getOrbioLaunchReceipt(txHash, expectedSymbol) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new HttpError(400, "Invalid transaction hash.");

  const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { status: "pending", txHash };
  if (receipt.status !== "0x1") return { status: "failed", txHash };

  let launched = null;
  for (const log of receipt.logs || []) {
    try {
      const decoded = decodeEventLog({ abi: ORBIO_AGENT_LAUNCH_ABI, eventName: "AgentLaunched", data: log.data, topics: log.topics });
      launched = { ...decoded.args, vault: log.address };
      break;
    } catch (_error) {
      // Ignore non-Orbio logs.
    }
  }

  if (!launched?.token) return { status: "confirmed", txHash, token: null };
  const address = String(launched.token).toLowerCase();
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readTokenString(address, "0x06fdde03"),
    readTokenString(address, "0x95d89b41"),
    readTokenUint(address, "0x313ce567"),
    readTokenUint(address, "0x18160ddd"),
  ]);

  return {
    status: "confirmed",
    txHash,
    agentId: launched.agentId?.toString?.() || "",
    token: {
      address,
      name: name || "Orbio agent token",
      symbol: symbol || String(expectedSymbol || ""),
      decimals,
      totalSupply: formatTokenAmount(totalSupply, decimals),
      explorerUrl: `${ROBINHOOD_EXPLORER_URL}/token/${address}`,
      orbioUrl: `https://www.orbio.so/launchpad/${address}`,
    },
  };
}

async function getTokenInfo(contractAddress) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) throw new HttpError(400, "Invalid EVM address format.");

  const code = await rpcCall("eth_getCode", [contractAddress, "latest"]);
  if (!code || code === "0x") throw new HttpError(400, "Address is not a contract. It looks like a wallet address, not a token CA.");

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    readTokenString(contractAddress, "0x06fdde03"),
    readTokenString(contractAddress, "0x95d89b41"),
    readTokenUint(contractAddress, "0x313ce567"),
    readTokenUint(contractAddress, "0x18160ddd"),
  ]);
  const market = await fetchMarketData(contractAddress);

  if (!name && !symbol && decimals === null && totalSupply === null) {
    throw new HttpError(400, "Contract exists, but ERC-20 metadata could not be read.");
  }

  return {
    contractAddress,
    chain: "Robinhood Chain",
    chainId: 4663,
    isContract: true,
    explorerUrl: `${ROBINHOOD_EXPLORER_URL}/address/${contractAddress}`,
    name: name || "Unknown token",
    symbol: symbol || "UNKNOWN",
    decimals,
    totalSupply: formatTokenAmount(totalSupply, decimals),
    totalSupplyRaw: totalSupply,
    priceUsd: market.priceUsd,
    liquidityUsd: market.liquidityUsd,
    marketCap: market.marketCap,
    marketCapSource: market.source,
    marketCapNote: market.note,
  };
}

async function fetchMarketData(contractAddress) {
  const dexScreener = await fetchDexScreenerMarket(contractAddress);
  if (dexScreener.marketCap || dexScreener.priceUsd || dexScreener.liquidityUsd) return dexScreener;

  const geckoTerminal = await fetchGeckoTerminalMarket(contractAddress);
  if (geckoTerminal.marketCap || geckoTerminal.priceUsd || geckoTerminal.liquidityUsd) return geckoTerminal;

  return {
    priceUsd: null,
    liquidityUsd: null,
    marketCap: null,
    source: "not indexed",
    note: "No public market data found yet for this contract.",
  };
}

async function fetchDexScreenerMarket(contractAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
    if (!response.ok) return emptyMarket("DexScreener unavailable");
    const data = await response.json();
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    const best = pairs
      .filter((pair) => pair.baseToken?.address?.toLowerCase() === contractAddress.toLowerCase())
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0))[0];
    if (!best) return emptyMarket("DexScreener has no pair for this contract.");
    return {
      priceUsd: best.priceUsd || null,
      liquidityUsd: best.liquidity?.usd ? String(best.liquidity.usd) : null,
      marketCap: best.marketCap || best.fdv || null,
      source: "DexScreener",
      note: best.marketCap ? "Market cap from DexScreener." : best.fdv ? "FDV from DexScreener used when market cap is unavailable." : "Price/liquidity found; market cap unavailable.",
    };
  } catch (_error) {
    return emptyMarket("DexScreener lookup failed.");
  }
}

async function fetchGeckoTerminalMarket(contractAddress) {
  try {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(contractAddress)}`);
    if (!response.ok) return emptyMarket("GeckoTerminal unavailable.");
    const data = await response.json();
    const pools = Array.isArray(data.data) ? data.data : [];
    const best = pools
      .filter((pool) => JSON.stringify(pool).toLowerCase().includes(contractAddress.toLowerCase()))
      .sort((a, b) => Number(b.attributes?.reserve_in_usd || 0) - Number(a.attributes?.reserve_in_usd || 0))[0];
    if (!best) return emptyMarket("GeckoTerminal has no pool for this contract.");
    return {
      priceUsd: best.attributes?.base_token_price_usd || null,
      liquidityUsd: best.attributes?.reserve_in_usd || null,
      marketCap: best.attributes?.market_cap_usd || best.attributes?.fdv_usd || null,
      source: "GeckoTerminal",
      note: best.attributes?.market_cap_usd ? "Market cap from GeckoTerminal." : best.attributes?.fdv_usd ? "FDV from GeckoTerminal used when market cap is unavailable." : "Price/liquidity found; market cap unavailable.",
    };
  } catch (_error) {
    return emptyMarket("GeckoTerminal lookup failed.");
  }
}

function emptyMarket(note) {
  return { priceUsd: null, liquidityUsd: null, marketCap: null, source: "none", note };
}

async function rpcCall(method, params) {
  const response = await fetch(ROBINHOOD_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new HttpError(502, data.error?.message || `RPC ${method} failed.`);
  return data.result;
}

async function readTokenString(contractAddress, selector) {
  try {
    const result = await rpcCall("eth_call", [{ to: contractAddress, data: selector }, "latest"]);
    return decodeStringResult(result);
  } catch (_error) {
    return "";
  }
}

async function readTokenUint(contractAddress, selector) {
  try {
    const result = await rpcCall("eth_call", [{ to: contractAddress, data: selector }, "latest"]);
    if (!result || result === "0x") return null;
    return BigInt(result).toString();
  } catch (_error) {
    return null;
  }
}

function decodeStringResult(result) {
  if (!result || result === "0x") return "";
  const hex = result.slice(2);
  try {
    if (hex.length === 64) return Buffer.from(hex.replace(/00+$/, ""), "hex").toString("utf8").trim();
    const offset = Number.parseInt(hex.slice(0, 64), 16) * 2;
    const length = Number.parseInt(hex.slice(offset, offset + 64), 16) * 2;
    return Buffer.from(hex.slice(offset + 64, offset + 64 + length), "hex").toString("utf8").trim();
  } catch (_error) {
    return "";
  }
}

function formatTokenAmount(raw, decimals) {
  if (raw === null || decimals === null) return null;
  const value = BigInt(raw);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  const fractionText = fraction.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 6_000_000) {
        reject(new HttpError(413, "Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(new HttpError(400, "Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function loadPromptFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (_error) {
    return "You are VEKTOR. Return concise JSON token launch plans only.";
  }
}
