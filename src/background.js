const DEFAULT_SETTINGS = {
  walletAddress: "",
  walletChainId: "",
  walletConnectedAt: "",
  quickBuyAmounts: ["0.01", "0.05", "0.1"],
};

const AGENT_PROXY_ENDPOINTS = [
  "http://158.220.89.254:8787/api/generate-token-plan",
  "http://100.92.181.120:8787/api/generate-token-plan",
  "http://localhost:8787/api/generate-token-plan",
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
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...current });
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
});

async function generateTokenPlan(payload) {
  const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const tweetText = payload?.tweetText?.trim();
  if (!tweetText) throw new Error("No tweet text captured.");

  return callAgentProxy(settings, payload);
}

async function callAgentProxy(settings, payload) {
  let lastError = null;

  for (const endpoint of AGENT_PROXY_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          walletAddress: settings.walletAddress || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Agent proxy failed with ${response.status}`);
      return typeof data.result === "string" ? data.result : JSON.stringify(data.result, null, 2);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError?.message || "No VEKTOR agent proxy is reachable.");
}
