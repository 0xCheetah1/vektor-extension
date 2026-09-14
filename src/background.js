try {
  importScripts("agent-config.local.js");
} catch (_error) {
  globalThis.VEKTOR_AGENT_CONFIG = globalThis.VEKTOR_AGENT_CONFIG || {};
}

const DEFAULT_SETTINGS = {
  walletAddress: "",
  walletChainId: "",
  walletConnectedAt: "",
  quickBuyAmounts: ["0.01", "0.05", "0.1"],
};

const INTERNAL_ORBIO_ENDPOINT = "";
const INTERNAL_ORBIO_API_KEY = "";
const AGENT_CONFIG = globalThis.VEKTOR_AGENT_CONFIG || {};
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

  if (AGENT_CONFIG.provider === "deepseek" && AGENT_CONFIG.apiKey) {
    return callDeepSeek(AGENT_CONFIG, settings, payload);
  }

  if (INTERNAL_ORBIO_ENDPOINT) {
    return callOrbio(settings, payload);
  }

  return buildDemoPlan(payload, settings.walletAddress);
}

async function callDeepSeek(config, settings, payload) {
  const prompt = buildAgentPrompt(settings, payload);
  const response = await fetch(config.endpoint || "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "deepseek-chat",
      messages: [
        { role: "system", content: "You generate concise, launch-ready meme token plans from viral posts. Return JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek endpoint failed with ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

async function callOrbio(settings, payload) {
  const prompt = buildAgentPrompt(settings, payload);

  const response = await fetch(INTERNAL_ORBIO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(INTERNAL_ORBIO_API_KEY ? { Authorization: `Bearer ${INTERNAL_ORBIO_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You generate concise, launch-ready meme token plans from viral posts." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) throw new Error(`Orbio endpoint failed with ${response.status}`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.output || data?.text || data?.response;
  return typeof content === "string" ? content : JSON.stringify(data, null, 2);
}

function buildAgentPrompt(settings, payload) {
  return `You are VEKTOR Meme Launcher for the Orbio hackathon.
Analyze this X/Twitter post and generate a memecoin launch plan.
Do not claim a token was launched unless a transaction hash is provided.
Return JSON with keys: tokenName, ticker, memeThesis, viralAngle, launchCopy, imagePrompt, riskFlags, launchSteps.

Tweet author: ${payload.author || "unknown"}
Tweet text: ${payload.tweetText}
Tweet URL: ${payload.tweetUrl || "unknown"}
Launch analytics: ${JSON.stringify(payload.analytics || {}, null, 2)}
Wallet connected: ${settings.walletAddress ? "yes" : "no"}`;
}

function buildDemoPlan(payload, walletAddress) {
  const text = payload.tweetText.replace(/https?:\/\/\S+/g, "").trim();
  const analytics = payload.analytics || {};
  const words = text.match(/[a-z0-9]+/gi) || [];
  const signalWords = words.filter((word) => word.length > 3).slice(0, 4);
  const tokenName = titleCase(signalWords.join(" ") || "Viral Meme");
  const ticker = (signalWords[0] || "VMEME").slice(0, 6).toUpperCase();

  return JSON.stringify(
    {
      tokenName,
      ticker,
      launchFitScore: analytics.launchFitScore || payload.score,
      launchReadiness: analytics.label || "Needs review",
      memeThesis: analytics.thesis || "This post has meme potential because it is simple, repeatable, and can be turned into a social identity.",
      viralAngle: text.slice(0, 180),
      engagementSignals: analytics.engagement || {},
      launchCopy: `Launching $${ticker}: the internet saw the signal first.`,
      imagePrompt: `Create a high-contrast meme coin mascot inspired by: ${text.slice(0, 140)}`,
      wallet: walletAddress || "Connect wallet before launch",
      riskFlags: analytics.riskFlags?.length
        ? analytics.riskFlags
        : ["Verify this is not impersonation", "Avoid copyrighted names/logos", "Check liquidity and launch fees before submitting"],
      launchSteps: ["Review generated metadata", "Connect wallet", "Approve launch transaction", "Confirm token address", "Post launch reply"],
    },
    null,
    2,
  );
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
