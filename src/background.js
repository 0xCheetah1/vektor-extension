const DEFAULT_SETTINGS = {
  walletAddress: "",
  walletChainId: "",
  walletConnectedAt: "",
  quickBuyAmounts: ["0.01", "0.05", "0.1"],
};

const AGENT_PROXY_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/generate-token-plan",
  "http://localhost:8787/api/generate-token-plan",
];
const TOKEN_INFO_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/token-info",
  "http://localhost:8787/api/token-info",
];
const BASEDBID_BUY_PREVIEW_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/basedbid/buy-preview",
  "http://localhost:8787/api/basedbid/buy-preview",
];
const ORBIO_LAUNCH_PREPARE_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/orbio/launch-prepare",
  "http://localhost:8787/api/orbio/launch-prepare",
];
const ETH_PRICE_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/eth-price",
  "http://localhost:8787/api/eth-price",
];
const IMAGE_GEN_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/generate-image",
  "http://localhost:8787/api/generate-image",
];
const IMAGE_UPLOAD_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/upload-image",
  "http://localhost:8787/api/upload-image",
];
const ROBINHOOD_CHAIN = {
  name: "Robinhood Chain",
  chainId: "0x1237",
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorerUrls: ["https://robin.etherscan.io"],
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await getStorage(Object.keys(DEFAULT_SETTINGS));
  await setStorage({ ...DEFAULT_SETTINGS, ...current });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GENERATE_TOKEN_PLAN") {
    generateTokenPlan(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_CHAIN_CONFIG") {
    sendResponse({ ok: true, result: ROBINHOOD_CHAIN });
  }

  if (message?.type === "GET_TOKEN_INFO") {
    getTokenInfo(message.contractAddress)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_ETH_PRICE") {
    getEthPrice()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GENERATE_IMAGE") {
    generateImage(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "UPLOAD_IMAGE") {
    uploadImage(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PREPARE_BASEDBID_BUY") {
    prepareBasedBidBuy(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PREPARE_ORBIO_LAUNCH") {
    prepareOrbioLaunch(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function generateTokenPlan(payload) {
  const settings = await getStorage(Object.keys(DEFAULT_SETTINGS));
  const tweetText = payload?.tweetText?.trim();
  if (!tweetText) throw new Error("No tweet text captured.");

  return callAgentProxy(settings, payload);
}

async function getTokenInfo(contractAddress) {
  return postToFirstAvailable(TOKEN_INFO_ENDPOINTS, { contractAddress }, "No token info service is reachable.", { stringifyResult: false });
}

async function prepareBasedBidBuy(payload) {
  const settings = await getStorage(Object.keys(DEFAULT_SETTINGS));
  return postToFirstAvailable(
    BASEDBID_BUY_PREVIEW_ENDPOINTS,
    {
      ...payload,
      account: payload?.account || settings.walletAddress || "",
    },
    "No supported Robinhood Chain buy route service is reachable.",
    { stringifyResult: false },
  );
}

async function prepareOrbioLaunch(payload) {
  const settings = await getStorage(Object.keys(DEFAULT_SETTINGS));
  return postToFirstAvailable(
    ORBIO_LAUNCH_PREPARE_ENDPOINTS,
    {
      ...payload,
      account: payload?.account || settings.walletAddress || "",
    },
    "No Orbio launch service is reachable.",
    { stringifyResult: false },
  );
}

async function getEthPrice() {
  return getFromFirstAvailable(ETH_PRICE_ENDPOINTS, "No ETH price service is reachable.");
}

async function generateImage(payload) {
  return postToFirstAvailable(IMAGE_GEN_ENDPOINTS, payload, "No image generation service is reachable.", { stringifyResult: false });
}

async function uploadImage(payload) {
  return postToFirstAvailable(IMAGE_UPLOAD_ENDPOINTS, payload, "No image upload service is reachable.", { stringifyResult: false });
}

function getStorage(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function setStorage(payload) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(payload, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function callAgentProxy(settings, payload) {
  return postToFirstAvailable(
    AGENT_PROXY_ENDPOINTS,
    {
      ...payload,
      walletAddress: settings.walletAddress || "",
    },
    "No VEKTOR agent proxy is reachable.",
    { stringifyResult: true },
  );
}

async function postToFirstAvailable(endpoints, payload, fallbackMessage, options = {}) {
  const failures = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }, getEndpointTimeout(endpoint));

      const data = await readProxyJson(response, endpoint);
      if (!response.ok) throw new Error(data?.error || `VEKTOR proxy failed with ${response.status}`);
      if (!options.stringifyResult) return data.result;
      return typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
    } catch (error) {
      failures.push(`${endpoint}: ${error?.message || "request failed"}`);
    }
  }

  throw new Error(failures.length ? failures.join("\n") : fallbackMessage);
}

async function getFromFirstAvailable(endpoints, fallbackMessage) {
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {}, getEndpointTimeout(endpoint));
      const data = await readProxyJson(response, endpoint);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      return data.result;
    } catch (error) {
      failures.push(`${endpoint}: ${error?.message || "request failed"}`);
    }
  }
  throw new Error(failures.length ? failures.join("\n") : fallbackMessage);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getEndpointTimeout(endpoint) {
  if (/generate-token-plan/i.test(endpoint)) return /localhost|127\.0\.0\.1/i.test(endpoint) ? 2500 : 75_000;
  return /localhost|127\.0\.0\.1/i.test(endpoint) ? 2500 : 15000;
}

async function readProxyJson(response, endpoint) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_error) {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120) || "empty response";
    throw new Error(`Non-JSON response from ${endpoint} (${response.status}): ${snippet}`);
  }
}
