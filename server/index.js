const http = require("http");
const fs = require("fs");
const path = require("path");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const PROVIDER = process.env.AGENT_PROVIDER || "deepseek";
const DEEPSEEK_ENDPOINT = process.env.DEEPSEEK_ENDPOINT || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ORBIO_ENDPOINT = process.env.ORBIO_ENDPOINT || "";
const ROBINHOOD_RPC_URL = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const LAUNCH_SYSTEM_PROMPT = loadPromptFile(path.join(__dirname, "prompts", "launch-system.txt"));

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

  if (request.method !== "POST" || !["/api/generate-token-plan", "/api/token-info"].includes(request.url)) {
    sendJson(response, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const payload = await readJson(request);
    if (request.url === "/api/token-info") {
      const result = await getTokenInfo(payload?.contractAddress || "");
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
  if (PROVIDER === "orbio") return callOrbio(payload);
  return callDeepSeek(payload);
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
        { role: "user", content: buildAgentPrompt(payload) },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new HttpError(response.status, `DeepSeek endpoint failed with ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

async function callOrbio(payload) {
  const apiKey = process.env.ORBIO_API_KEY || "";
  if (!ORBIO_ENDPOINT) throw new HttpError(503, "ORBIO_ENDPOINT is not configured on the server.");

  const response = await fetch(ORBIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: LAUNCH_SYSTEM_PROMPT },
        { role: "user", content: buildAgentPrompt(payload) },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new HttpError(response.status, `Orbio endpoint failed with ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.output || data?.text || data?.response;
  return typeof content === "string" ? content : JSON.stringify(data, null, 2);
}

function buildAgentPrompt(payload) {
  return `Analyze this captured X/Twitter context and generate a VEKTOR token launch plan.

Tweet author: ${payload.author || "unknown"}
Tweet text: ${payload.tweetText}
Tweet URL: ${payload.tweetUrl || "unknown"}
Launch analytics: ${JSON.stringify(payload.analytics || {}, null, 2)}
Wallet connected: ${payload.walletAddress ? "yes" : "no"}`;
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
      if (body.length > 64_000) {
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
