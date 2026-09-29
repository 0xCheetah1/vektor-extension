const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  profileBio: '[data-testid="UserDescription"]',
};

const state = {
  openPanel: null,
  closeHandlers: null,
};

const ASK_THRESHOLD = 50;
const LAUNCH_THRESHOLD = 70;
const CONTRACT_ADDRESS_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;
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
const LAUNCH_RECEIPT_ENDPOINTS = [
  "http://thecheetah11.com/vektor-agent/api/orbio/launch-receipt",
  "http://localhost:8787/api/orbio/launch-receipt",
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

let scanScheduled = false;

function init() {
  clearStaleVektorUi();
  setupDelegatedActions();
  setupWalletBridge();
  scanTweets();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}

function clearStaleVektorUi() {
  document.querySelectorAll(".vektor-launch-button, .vektor-buy-button, .vektor-panel").forEach((node) => node.remove());
}

function setupDelegatedActions() {
  if (document.documentElement.dataset.vektorDelegatedActions === "ready") return;
  document.documentElement.dataset.vektorDelegatedActions = "ready";
  document.addEventListener("click", (event) => {
    const buyButton = event.target?.closest?.(".vektor-buy-button");
    if (!buyButton) return;
    const contractAddress = buyButton.dataset.ca || findContractAddress(buyButton.title || "");
    if (!contractAddress) return;
    event.preventDefault();
    event.stopPropagation();
    openBuyPanel(contractAddress, buyButton.dataset.source || "post");
  }, true);
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  setTimeout(() => {
    scanScheduled = false;
    scanTweets();
  }, 400);
}

function scanTweets() {
  injectButtons();
  injectBuyButtons();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CONNECT_WALLET") {
    requestWallet(message.chain)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

function setupWalletBridge() {
  if (document.documentElement.dataset.vektorWalletBridge === "ready") return;
  document.documentElement.dataset.vektorWalletBridge = "ready";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/page-wallet.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "VEKTOR_PAGE_WALLET_RESPONSE") return;
    window.dispatchEvent(new CustomEvent(event.data.requestId, { detail: event.data }));
  });
}

function requestWallet(chain) {
  return new Promise((resolve, reject) => {
    const requestId = `vektor-wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const timeout = setTimeout(() => {
      window.removeEventListener(requestId, onResponse);
      reject(new Error("Wallet request timed out."));
    }, 30000);

    function onResponse(event) {
      clearTimeout(timeout);
      window.removeEventListener(requestId, onResponse);
      const detail = event.detail || {};
      if (detail.error) {
        reject(new Error(detail.error));
        return;
      }
      if (!detail.address) {
        reject(new Error("Wallet returned no account."));
        return;
      }
      resolve({ address: detail.address });
    }

    window.addEventListener(requestId, onResponse);
    window.postMessage({ source: "VEKTOR_CONTENT_WALLET_REQUEST", requestId, chain }, "*");
  });
}

function requestWalletTransaction(chain, transaction) {
  return new Promise((resolve, reject) => {
    const requestId = `vektor-tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const timeout = setTimeout(() => {
      window.removeEventListener(requestId, onResponse);
      reject(new Error("Wallet transaction request timed out."));
    }, 60000);

    function onResponse(event) {
      clearTimeout(timeout);
      window.removeEventListener(requestId, onResponse);
      const detail = event.detail || {};
      if (detail.error) {
        reject(new Error(detail.error));
        return;
      }
      if (!detail.transactionHash) {
        reject(new Error("Wallet returned no transaction hash."));
        return;
      }
      resolve({ address: detail.address, transactionHash: detail.transactionHash });
    }

    window.addEventListener(requestId, onResponse);
    window.postMessage({ source: "VEKTOR_CONTENT_WALLET_REQUEST", action: "SEND_TRANSACTION", requestId, chain, transaction }, "*");
  });
}

function injectButtons() {
  document.querySelectorAll(SELECTORS.tweet).forEach((tweet) => {
    if (tweet.querySelector(".vektor-launch-button")) return;
    if (!isLaunchablePost(tweet)) return;

    const tweetText = getTweetText(tweet);
    if (!tweetText) return;

    const button = document.createElement("button");
    button.className = "vektor-launch-button";
    button.type = "button";
    const analytics = analyzeLaunchFit(tweet, tweetText);
    if (analytics.launchFitScore < ASK_THRESHOLD) return;
    const action = "ask";
    button.textContent = analytics.launchFitScore >= LAUNCH_THRESHOLD ? "Ask VEKTOR · hot" : "Ask VEKTOR";
    button.title = "Ask VEKTOR if this post is worth launching before building a launch package";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPanel(tweet, action);
    });

    const target = tweet.querySelector('[role="group"]') || tweet;
    target.appendChild(button);
  });
}

function injectBuyButtons() {
  document.querySelectorAll(SELECTORS.tweet).forEach((tweet) => {
    if (!isLaunchablePost(tweet)) return;
    const contractAddress = findContractAddress(getTweetText(tweet));
    if (!contractAddress) return;
    injectBuyButton(tweet.querySelector('[role="group"]') || tweet, contractAddress, "post");
  });

  document.querySelectorAll(SELECTORS.profileBio).forEach((bio) => {
    const contractAddress = findContractAddress(bio.textContent || "");
    if (!contractAddress) return;
    injectBuyButton(bio, contractAddress, "bio");
  });
}

function injectBuyButton(target, contractAddress, source) {
  if (target.querySelector(`.vektor-buy-button[data-ca="${contractAddress.toLowerCase()}"]`)) return;

  const button = document.createElement("button");
  button.className = "vektor-buy-button";
  button.dataset.ca = contractAddress.toLowerCase();
  button.dataset.source = source;
  button.type = "button";
  button.textContent = "Buy token";
  button.title = `Quick buy ${contractAddress}`;
  target.appendChild(button);
}

function findContractAddress(text) {
  CONTRACT_ADDRESS_PATTERN.lastIndex = 0;
  return CONTRACT_ADDRESS_PATTERN.exec(text)?.[0] || "";
}

function isLaunchablePost(tweet) {
  const articleText = tweet.textContent || "";
  if (/\bReplying to\b/i.test(articleText)) return false;

  const socialContext = tweet.querySelector('[data-testid="socialContext"]')?.textContent || "";
  if (/\breplied\b/i.test(socialContext)) return false;

  if (/\/status\/\d+/.test(location.pathname)) {
    const main = tweet.closest('main[role="main"]') || document;
    const currentStatusPath = location.pathname.match(/\/[^/]+\/status\/\d+/)?.[0];
    const primaryTweet = Array.from(main.querySelectorAll(SELECTORS.tweet)).find((candidate) =>
      Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((link) => {
        try {
          return currentStatusPath && new URL(link.href).pathname.includes(currentStatusPath);
        } catch (_error) {
          return false;
        }
      }),
    );
    return primaryTweet === tweet;
  }

  return true;
}

function openPanel(tweet, action) {
  closePanel();

  const payload = {
    tweetText: getTweetText(tweet),
    author: getAuthor(tweet),
    tweetUrl: getTweetUrl(tweet),
    imageUrls: getTweetImageUrls(tweet),
    analytics: analyzeLaunchFit(tweet, getTweetText(tweet)),
    intent: action === "launch" ? "prepare_launch" : "analyze_only",
  };
  payload.score = payload.analytics.launchFitScore;

  const panel = document.createElement("section");
  panel.className = "vektor-panel";
  panel.append(
    createHeader(action),
    createSignal(payload.analytics),
    createBreakdown(payload.analytics),
    createTweetQuote(payload.tweetText),
    createExtraInput(),
    createGenerateButton(action),
    createOutput(),
  );

  document.body.appendChild(panel);
  state.openPanel = panel;

  panel.querySelector(".vektor-close").addEventListener("click", closePanel);
  panel.querySelector(".vektor-generate").addEventListener("click", () => generatePlan(panel, payload));
  setupPanelDismiss(panel);
}

async function openBuyPanel(contractAddress, source) {
  closePanel();
  const settings = await getStorage(["quickBuyAmounts", "walletAddress", "walletChainId"]);
  const amounts = normalizeQuickBuyAmounts(settings.quickBuyAmounts);
  const panel = document.createElement("section");
  panel.className = "vektor-panel";
  panel.append(createBuyHeader(source, contractAddress), createContractBlock(contractAddress), createTokenInfoBlock(), createBuySpeedDial(amounts), createBuyOutput(settings));

  document.body.appendChild(panel);
  state.openPanel = panel;

  panel.querySelector(".vektor-close").addEventListener("click", closePanel);
  panel.querySelectorAll(".vektor-buy-option").forEach((button) => {
    button.addEventListener("click", () => prepareBuy(panel, contractAddress, button.dataset.amount));
  });
  panel.querySelector(".vektor-custom-buy").addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = panel.querySelector(".vektor-custom-amount").value.trim();
    prepareBuy(panel, contractAddress, amount);
  });
  setupPanelDismiss(panel);
  loadTokenInfo(panel, contractAddress);
}

function setupPanelDismiss(panel) {
  const onPointerDown = (event) => {
    if (panel.contains(event.target)) return;
    closePanel();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closePanel();
  };

  state.closeHandlers = { onPointerDown, onKeyDown };
  setTimeout(() => {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  }, 0);
}

function closePanel() {
  if (state.closeHandlers) {
    document.removeEventListener("pointerdown", state.closeHandlers.onPointerDown, true);
    document.removeEventListener("keydown", state.closeHandlers.onKeyDown, true);
    state.closeHandlers = null;
  }

  state.openPanel?.remove();
  state.openPanel = null;
}

async function generatePlan(panel, payload) {
  const button = panel.querySelector(".vektor-generate");
  const output = panel.querySelector(".vektor-output");
  const extra = panel.querySelector(".vektor-extra").value.trim();
  const isAsk = payload.intent !== "prepare_launch";
  let elapsed = 0;

  button.disabled = true;
  button.textContent = isAsk ? "Asking..." : "Preparing...";
  output.textContent = isAsk ? "Reading captured tweet and checking whether this is worth launching..." : "Reading captured tweet and preparing a launch package...";
  const statusTimer = setInterval(() => {
    elapsed += 5;
    if (!state.openPanel || state.openPanel !== panel) {
      clearInterval(statusTimer);
      return;
    }
    output.textContent = isAsk
      ? `Still asking VEKTOR... ${elapsed}s elapsed. Extra context can make this slower, but this should fail fast instead of hanging.`
      : `Still preparing the launch package... ${elapsed}s elapsed.`;
  }, 5000);

  try {
    const requestPayload = { ...payload, extraInstructions: extra };
    const result = await generateTokenPlanWithFallback(requestPayload);
    clearInterval(statusTimer);
    renderAgentResult(output, result, payload.intent, payload.imageUrls, requestPayload);
  } catch (error) {
    clearInterval(statusTimer);
    const version = chrome.runtime.getManifest?.().version || "unknown";
    output.textContent = `${cleanErrorMessage(error?.message || "Agent failed without returning an error.")}\n\nVEKTOR version: ${version}`;
  } finally {
    button.disabled = false;
    button.textContent = payload.intent === "prepare_launch" ? "Prepare launch package" : "Ask VEKTOR";
  }
}

async function generateTokenPlanWithFallback(payload) {
  try {
    return await sendRuntimeMessage({ type: "GENERATE_TOKEN_PLAN", payload });
  } catch (runtimeError) {
    try {
      return await postTextToFirstAvailable(AGENT_PROXY_ENDPOINTS, payload);
    } catch (proxyError) {
      throw new Error(cleanErrorMessage(proxyError?.message || runtimeError?.message || "VEKTOR request failed."));
    }
  }
}

async function postTextToFirstAvailable(endpoints, payload) {
  const result = await postJsonToFirstAvailable(endpoints, payload, payload?.intent === "analyze_only" ? 35_000 : undefined);
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

async function postJsonToFirstAvailable(endpoints, payload, timeoutMs = null) {
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, timeoutMs || getEndpointTimeout(endpoint));
      const data = await readProxyJson(response, endpoint);
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      return data.result;
    } catch (error) {
      failures.push(`${endpoint}: ${error?.message || "request failed"}`);
    }
  }
  throw new Error(failures.join("\n") || "No VEKTOR proxy is reachable.");
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

function cleanErrorMessage(message) {
  return String(message || "")
    .replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gi, "")
    .replace(/\n?http:\/\/localhost:8787\/api\/generate-token-plan: NetworkError when attempting to fetch resource\.?/gi, "")
    .replace(/\s+$/g, "")
    .trim() || "VEKTOR request failed.";
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

function renderAgentResult(output, result, intent, imageUrls, sourcePayload = null) {
  const parsed = parseAgentResult(result);
  if (!parsed) {
    output.textContent = result;
    return;
  }
  parsed.imageUrls = Array.isArray(imageUrls) ? imageUrls : [];

  if (intent === "analyze_only") {
    renderAgentVerdict(output, parsed, sourcePayload);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "vektor-result";
  wrap.append(
    createResultHero(parsed, intent),
    createResultSection("Meme thesis", parsed.memeThesis),
    createResultSection("Viral angle", parsed.viralAngle),
    createResultSection("Launch copy", parsed.launchCopy, "copy"),
    createResultSection("Art prompt", parsed.imagePrompt),
    createResultList("Watch-outs", getUserRiskFlags(parsed.riskFlags)),
    createResultSection("Next move", parsed.nextAction || getDefaultNextAction(parsed, intent)),
    createLaunchConfig(parsed),
  );
  wrap.appendChild(createLaunchTokenButton(intent));
  output.replaceWith(wrap);
}

function renderAgentVerdict(output, parsed, sourcePayload) {
  const decision = normalizeLaunchDecision(parsed.launchDecision, parsed.launchReadiness);
  const wrap = document.createElement("div");
  wrap.className = `vektor-result verdict ${decision}`;
  wrap.append(
    createVerdictHero(parsed, decision),
    createVerdictScores(parsed),
    createResultSection("Verdict", parsed.verdict || parsed.memeThesis || "VEKTOR needs more signal before calling this launchable."),
    createResultSection("Why it works", parsed.whyItWorks || parsed.viralAngle),
    createResultSection("Why it might fail", parsed.whyItMightFail || getUserRiskFlags(parsed.riskFlags).join(" ") || "No major meme-quality failure mode flagged."),
    createResultSection("Best angle", parsed.bestAngle || parsed.memeThesis),
  );
  wrap.appendChild(createVerdictActions(decision, sourcePayload));
  output.replaceWith(wrap);
}

function createVerdictHero(result, decision) {
  const hero = document.createElement("div");
  hero.className = "vektor-result-hero verdict";
  const label = document.createElement("span");
  label.textContent = "VEKTOR verdict";
  const title = document.createElement("strong");
  title.textContent = getDecisionLabel(decision);
  const readiness = document.createElement("em");
  const score = clampScore(result.convictionScore);
  readiness.textContent = `${score}/100 conviction · ${result.launchWindow || result.launchReadiness || "fast read"}`;
  hero.append(label, title, readiness);
  return hero;
}

function createVerdictScores(result) {
  const section = document.createElement("section");
  section.className = "vektor-verdict-scores";
  [
    ["Meme", result.memeabilityScore],
    ["Social", result.socialEnergyScore],
    ["Timing", result.timingScore],
    ["Distribution", result.distributionScore],
    ["Originality", result.originalityScore],
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.textContent = `${label} ${clampScore(value)}/100`;
    section.appendChild(item);
  });
  return section;
}

function createVerdictActions(decision, sourcePayload) {
  const actions = document.createElement("div");
  actions.className = "vektor-verdict-actions";
  actions.append(createBuildPackageButton(decision, sourcePayload), createCancelVerdictButton());
  return actions;
}

function createBuildPackageButton(decision, sourcePayload) {
  const button = document.createElement("button");
  button.className = "vektor-build-package-action";
  button.type = "button";
  button.textContent = getBuildPackageLabel(decision);
  button.addEventListener("click", () => buildLaunchPackageFromVerdict(button, sourcePayload));
  return button;
}

function createCancelVerdictButton() {
  const button = document.createElement("button");
  button.className = "vektor-cancel-verdict-action";
  button.type = "button";
  button.textContent = "Cancel";
  button.addEventListener("click", closePanel);
  return button;
}

async function buildLaunchPackageFromVerdict(button, sourcePayload) {
  if (!sourcePayload) return;
  const resultNode = button.closest(".vektor-result");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Building launch package...";
  try {
    const result = await generateTokenPlanWithFallback({ ...sourcePayload, intent: "prepare_launch" });
    renderAgentResult(resultNode, result, "prepare_launch", sourcePayload.imageUrls, sourcePayload);
  } catch (error) {
    button.textContent = originalText;
    const section = createResultSection("Package failed", cleanErrorMessage(error?.message || "VEKTOR could not build the launch package."));
    resultNode?.appendChild(section);
  } finally {
    button.disabled = false;
  }
}

function normalizeLaunchDecision(value, readiness = "") {
  const text = String(value || readiness || "").toLowerCase();
  if (/launch[_ -]?now|prime|launchable/.test(text)) return "launch_now";
  if (/skip|weak|pass|do not/.test(text)) return "skip";
  if (/context|unclear|need/.test(text)) return "needs_context";
  return "watchlist";
}

function getDecisionLabel(decision) {
  if (decision === "launch_now") return "Launch now";
  if (decision === "skip") return "Skip this one";
  if (decision === "needs_context") return "Needs more context";
  return "Watchlist";
}

function getBuildPackageLabel(decision) {
  if (decision === "launch_now") return "Build launch package";
  if (decision === "skip") return "Override and build package";
  if (decision === "needs_context") return "Build with current context";
  return "Build draft package";
}

function getVerdictNextAction(decision) {
  if (decision === "launch_now") return "Build the launch package, review it, then launch through Orbio if it still feels hot.";
  if (decision === "skip") return "Skip this post unless you have extra context that changes the meme thesis.";
  if (decision === "needs_context") return "Add the missing lore or timing context, then ask VEKTOR again.";
  return "Watch engagement and only draft if the meme starts moving.";
}

function clampScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(100, Math.round(number)));
}

function createLaunchConfig(plan) {
  const section = document.createElement("section");
  section.className = "vektor-launch-config";
  const title = document.createElement("h3");
  title.textContent = "Project info";
  section.append(
    title,
    createLaunchInput("Name", "tokenName", plan.tokenName || ""),
    createLaunchInput("Ticker", "ticker", plan.ticker || ""),
    createLaunchTextarea("Bio", "description", plan.description || plan.memeThesis || ""),
    createLaunchInput("X / Twitter", "twitter", plan.twitter || plan.tweetUrl || ""),
    createLaunchInput("Website", "website", plan.website || ""),
    createLaunchInput("Telegram", "telegram", plan.telegram || ""),
    createLaunchInput("Extra creator fee %", "creatorTax", "0", "number"),
    createLaunchInput("Agent wallet (optional)", "agentWallet", ""),
    createLogoField(plan.imageUrls, plan.imagePrompt),
  );
  return section;
}

function createLogoField(imageUrls, imagePrompt) {
  const wrap = document.createElement("div");
  wrap.className = "vektor-logo";

  const input = document.createElement("input");
  input.name = "logoDataUrl";
  input.type = "hidden";

  const file = document.createElement("input");
  file.type = "file";
  file.accept = "image/png,image/jpeg,image/webp,image/avif,image/gif";
  file.className = "vektor-logo-file";

  const label = document.createElement("label");
  label.textContent = "Logo";
  label.appendChild(file);

  const preview = document.createElement("img");
  preview.className = "vektor-logo-preview";
  preview.alt = "Token logo preview";

  const status = document.createElement("span");
  status.className = "vektor-image-gen-status";

  const options = document.createElement("div");
  options.className = "vektor-logo-options";

  async function applyLogo(source, value) {
    if (source === "post") {
      input.value = "";
      input.dataset.logoUrl = value;
      status.textContent = "Post image ready for launch.";
    } else {
      input.value = value;
      delete input.dataset.logoUrl;
      status.textContent = "Uploading logo for launch...";
    }
    preview.src = value;
    preview.hidden = false;
    if (source !== "post") {
      const uploaded = await uploadLogoImage(value);
      input.dataset.logoUrl = uploaded.url;
      status.textContent = "Logo uploaded and ready for Orbio.";
    }
  }

  const postImages = (Array.isArray(imageUrls) ? imageUrls : []).filter(Boolean).slice(0, 4);
  if (postImages.length) {
    const postLabel = document.createElement("span");
    postLabel.className = "vektor-logo-post-label";
    postLabel.textContent = postImages.length > 1 ? `Use a post image (${postImages.length})` : "Use post image";

    const row = document.createElement("div");
    row.className = "vektor-logo-thumbs";
    postImages.forEach((url) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "vektor-logo-thumb";
      thumb.title = "Use this post image as the logo";
      const thumbImage = document.createElement("img");
      thumbImage.src = url;
      thumbImage.alt = "Post image option";
      thumb.appendChild(thumbImage);
      thumb.addEventListener("click", () => {
        void applyLogo("post", url);
        row.querySelectorAll(".vektor-logo-thumb").forEach((node) => node.classList.toggle("selected", node === thumb));
      });
      row.appendChild(thumb);
    });
    options.append(postLabel, row);
  }

  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      status.textContent = "Preparing logo...";
      const dataUrl = await resizeImageToDataUrl(chosen, 512);
      await applyLogo("custom", dataUrl);
    } catch (error) {
      status.textContent = error?.message || "Logo upload failed.";
    }
  });

  const generator = createImageGenerator(imagePrompt, applyLogo);
  wrap.append(label, input, options, generator, preview, status);
  preview.hidden = true;
  return wrap;
}

function createImageGenerator(imagePrompt, applyLogo) {
  const wrap = document.createElement("div");
  wrap.className = "vektor-image-gen";

  const heading = document.createElement("span");
  heading.className = "vektor-image-gen-title";
  heading.textContent = "Generate logo with AI";

  const prompt = document.createElement("textarea");
  prompt.className = "vektor-image-prompt";
  prompt.placeholder = "Describe the token logo...";
  prompt.value = imagePrompt || "";

  const actions = document.createElement("div");
  actions.className = "vektor-image-gen-actions";

  const generate = document.createElement("button");
  generate.type = "button";
  generate.className = "vektor-logo-option";
  generate.textContent = "Generate image";

  const status = document.createElement("span");
  status.className = "vektor-image-gen-status";

  generate.addEventListener("click", async () => {
    const value = prompt.value.trim();
    if (value.length < 8) {
      status.textContent = "Write a longer image prompt first.";
      return;
    }
    generate.disabled = true;
    status.textContent = "Generating image...";
    try {
      const result = await generateImageWithFallback({ prompt: value });
      const compact = await downscaleDataUrl(result.dataUrl, 512);
      await applyLogo("custom", compact);
      status.textContent = `Generated with ${result.source}. Uploaded and ready for launch.`;
      wrap.dataset.generated = "true";
    } catch (error) {
      status.textContent = error?.message || "Image generation failed.";
    } finally {
      generate.disabled = false;
    }
  });

  actions.append(generate);
  wrap.append(heading, prompt, actions, status);
  return wrap;
}

function resizeImageToDataUrl(file, maxSize) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the logo file."));
    reader.onload = () => {
      downscaleDataUrl(reader.result, maxSize, "image/png").then(resolve, reject);
    };
    reader.readAsDataURL(file);
  });
}

function downscaleDataUrl(source, maxSize, outputType = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not load the logo image."));
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(outputType, 0.9));
    };
    image.src = source;
  });
}

function createLaunchInput(labelText, name, value, type = "text") {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value;
  if (type === "number") input.min = "0";
  if (name === "creatorTax") {
    input.step = "0.01";
    input.max = "10";
  }
  label.appendChild(input);
  return label;
}

async function setupInitialBuyConverter(section) {
  const input = section.querySelector('[name="initialBuyUsd"]');
  if (!input) return;

  const hint = document.createElement("span");
  hint.className = "vektor-usd-converter";
  hint.textContent = "USD estimate loading...";
  input.insertAdjacentElement("afterend", hint);

  let price = null;
  try {
    price = await getEthPriceWithFallback();
  } catch (_error) {
    hint.textContent = "USD estimate unavailable";
    return;
  }

  const update = () => {
    const usd = Number(input.value || 0);
    const eth = usd / Number(price.usd || 1);
    hint.textContent = usd > 0 ? `≈ ${formatDisplayNumber(eth)} ETH` : "";
  };
  input.addEventListener("input", update);
  update();
}

async function generateImageWithFallback(payload) {
  try {
    return await sendRuntimeMessage({ type: "GENERATE_IMAGE", payload });
  } catch (_runtimeError) {
    return postJsonToFirstAvailable(IMAGE_GEN_ENDPOINTS, payload);
  }
}

async function uploadLogoImage(dataUrl) {
  const payload = { dataUrl };
  try {
    return await sendRuntimeMessage({ type: "UPLOAD_IMAGE", payload });
  } catch (_runtimeError) {
    return postJsonToFirstAvailable(IMAGE_UPLOAD_ENDPOINTS, payload);
  }
}

async function getEthPriceWithFallback() {
  try {
    return await sendRuntimeMessage({ type: "GET_ETH_PRICE" });
  } catch (_runtimeError) {
    return getJsonFromFirstAvailable(ETH_PRICE_ENDPOINTS);
  }
}

async function getJsonFromFirstAvailable(endpoints) {
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
  throw new Error(failures.join("\n") || "No price service is reachable.");
}

function createLaunchTextarea(labelText, name, value) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.value = value;
  label.appendChild(textarea);
  return label;
}

function createLaunchTokenButton(intent) {
  const button = document.createElement("button");
  button.className = "vektor-launch-token-action";
  button.type = "button";
  button.textContent = intent === "prepare_launch" ? "Launch on Orbio" : "Launch anyway on Orbio";
  button.addEventListener("click", () => launchToken(button, getEditedLaunchPlan(button)));
  return button;
}

function getEditedLaunchPlan(button) {
  const config = button.closest(".vektor-result")?.querySelector(".vektor-launch-config");
  const get = (name) => config?.querySelector(`[name="${name}"]`)?.value?.trim() || "";
  return {
    tokenName: get("tokenName"),
    ticker: get("ticker"),
    description: get("description"),
    twitter: get("twitter"),
    website: get("website"),
    telegram: get("telegram"),
    creatorTax: get("creatorTax"),
    agentWallet: get("agentWallet"),
    logoDataUrl: get("logoDataUrl"),
    logoUrl: config?.querySelector('[name="logoDataUrl"]')?.dataset.logoUrl || "",
  };
}

async function launchToken(button, plan) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Preparing Orbio launch...";

  try {
    button.dataset.stage = "wallet connect";
    const chain = await getChainConfig();
    const wallet = await requestWallet(chain);
    button.dataset.stage = "Orbio prep";
    const preview = await prepareOrbioLaunchWithFallback({ ...plan, account: wallet.address });
    button.dataset.stage = "wallet submit";
    button.textContent = "Confirm launch in wallet...";
    const sent = await requestWalletTransaction(chain, preview.transaction);
    const block = createLaunchSubmittedBlock(sent.transactionHash, preview);
    button.insertAdjacentElement("afterend", block);
    button.textContent = "Launch submitted";
    await recordLaunch({
      wallet: wallet.address,
      name: preview.tokenName,
      ticker: preview.ticker,
      txHash: sent.transactionHash,
      explorerTxUrl: `https://robin.etherscan.io/tx/${sent.transactionHash}`,
      launchpad: "orbio",
      createdAt: new Date().toISOString(),
    });
    resolveLaunchToken(block, sent.transactionHash, preview.ticker);
  } catch (error) {
    button.textContent = formatLaunchError(button.dataset.stage, error);
    setTimeout(() => {
      button.disabled = false;
      button.textContent = originalText;
    }, 4500);
  }
}

async function prepareOrbioLaunchWithFallback(payload) {
  try {
    return await sendRuntimeMessage({ type: "PREPARE_ORBIO_LAUNCH", payload });
  } catch (_runtimeError) {
    return postJsonToFirstAvailable(ORBIO_LAUNCH_PREPARE_ENDPOINTS, payload);
  }
}

function formatLaunchError(stage, error) {
  const message = error?.message || "An unexpected error occurred";
  if (/An unexpected error occurred/i.test(message)) {
    if (stage === "wallet connect") return "Wallet connect failed. Open MetaMask, enable it for X, then try again.";
    if (stage === "wallet submit") return "Wallet submit failed. Switch MetaMask to Robinhood Chain and make sure it has ETH for gas.";
    if (stage === "Orbio prep") return "Orbio launch prep failed. Try a shorter name/ticker.";
  }
  return `${stage || "Launch"} failed: ${message}`;
}

function createLaunchSubmittedBlock(transactionHash, preview) {
  const block = document.createElement("section");
  block.className = "vektor-result-section launch-submitted";
  const heading = document.createElement("h3");
  heading.textContent = "Launch submitted";
  const body = document.createElement("p");
  body.textContent = `${preview.tokenName} ($${preview.ticker}) transaction sent: ${transactionHash}`;
  const link = document.createElement("a");
  link.href = `https://robin.etherscan.io/tx/${transactionHash}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "View on Robinhood Etherscan";
  const status = document.createElement("p");
  status.className = "vektor-launch-token-status";
  status.textContent = "Reading token address from the chain...";
  block.append(heading, body, link, status);
  return block;
}

async function resolveLaunchToken(block, transactionHash, expectedSymbol) {
  const status = block.querySelector(".vektor-launch-token-status");
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const result = await postJsonToFirstAvailable(LAUNCH_RECEIPT_ENDPOINTS, { txHash: transactionHash, expectedSymbol });
      if (result?.status === "failed") {
        status.textContent = "Launch transaction failed on-chain.";
        return;
      }
      if (result?.status === "confirmed" && result.token) {
        status.replaceWith(createLaunchTokenBlock(result.token));
        await updateLaunchRecord(transactionHash, {
          tokenAddress: result.token.address,
          explorerUrl: result.token.explorerUrl,
          orbioUrl: result.token.orbioUrl,
        });
        return;
      }
    } catch (_error) {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  status.textContent = "Token confirmed, but the address could not be read yet. Open the transaction on Robinhood Etherscan.";
}

function createLaunchTokenBlock(token) {
  const block = document.createElement("section");
  block.className = "vektor-result-section launch-token";
  const heading = document.createElement("h3");
  heading.textContent = "Token live";
  const body = document.createElement("p");
  body.textContent = `${token.name} ($${token.symbol})`;

  const ca = document.createElement("strong");
  ca.className = "vektor-token-ca";
  ca.textContent = token.address;

  const links = document.createElement("div");
  links.className = "vektor-token-links";
  const orbioUrl = token.orbioUrl || (token.address ? `https://www.orbio.so/launchpad/${token.address}` : "");
  if (orbioUrl) links.append(createExternalLink(orbioUrl, "Open on Orbio"));
  links.append(createExternalLink(token.explorerUrl || `https://robin.etherscan.io/token/${token.address}`, "Robinhood Etherscan"));
  links.append(createCloseAction("Close"));

  block.append(heading, body, ca, links);
  return block;
}

function createExternalLink(href, text) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  return link;
}

function createCloseAction(text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "vektor-close-action";
  button.textContent = text;
  button.addEventListener("click", closePanel);
  return button;
}

function getUserRiskFlags(riskFlags) {
  const flags = Array.isArray(riskFlags) ? riskFlags : [];
  return flags.filter((flag) => {
    const text = String(flag || "").toLowerCase();
    return !/no attached image|no image|image.*not captured|visual context|low visual|could not analyze.*image|image could not be analyzed|ip|trademark|copyright|endorsement|association|name-dropping|named .*brands?|real people|public figure|likeness|without consent|legal/.test(text);
  });
}

function getDefaultNextAction(result, intent) {
  if (intent !== "prepare_launch") return "Keep watching this meme until the signal is stronger.";
  if (/watchlist|weak/i.test(result.launchReadiness || "")) return "Do not launch yet; use this as a draft unless you override the signal.";
  return "Review the package, then launch it through Orbio on Robinhood Chain.";
}

function parseAgentResult(result) {
  if (!result) return null;
  if (typeof result === "object") return result;
  try {
    return JSON.parse(result);
  } catch (_error) {
    const match = String(result).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (__error) {
      return null;
    }
  }
}

function createResultHero(result, intent) {
  const hero = document.createElement("div");
  hero.className = "vektor-result-hero";
  const label = document.createElement("span");
  label.textContent = intent === "prepare_launch" ? "Launch package" : "VEKTOR verdict";
  const title = document.createElement("strong");
  title.textContent = `${result.tokenName || "Untitled token"} ${result.ticker ? `($${result.ticker})` : ""}`;
  const readiness = document.createElement("em");
  readiness.textContent = result.launchReadiness || "Needs review";
  hero.append(label, title, readiness);
  return hero;
}

function createResultSection(title, value, variant = "") {
  const section = document.createElement("section");
  section.className = `vektor-result-section${variant ? ` ${variant}` : ""}`;
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = value || "Not provided.";
  section.append(heading, body);
  return section;
}

function createResultList(title, items, ordered = false) {
  const section = document.createElement("section");
  section.className = "vektor-result-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement(ordered ? "ol" : "ul");
  const values = Array.isArray(items) && items.length ? items : ["None flagged."];
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  section.append(heading, list);
  return section;
}

async function prepareBuy(panel, contractAddress, amount) {
  const output = panel.querySelector(".vektor-output");
  if (panel.dataset.tokenValid !== "true") {
    output.textContent = "Token validation is required before buy prep. If this is a wallet address or non-ERC-20 contract, VEKTOR will not prepare a buy.";
    return;
  }
  if (!Number(amount) || Number(amount) <= 0) {
    output.textContent = "Enter a valid ETH amount.";
    return;
  }

  setBuyDisabled(panel, true);
  output.textContent = `Preparing Robinhood Chain buy route for ${amount} ETH...`;

  try {
    const chain = await getChainConfig();
    const wallet = await requestWallet(chain);
    const preview = await prepareBuyPreviewWithFallback({ contractAddress, amountEth: amount, account: wallet.address, slippage: 5 });
    output.textContent = "Preview ready. Confirm the Robinhood Chain transaction in your wallet.";
    const sent = await requestWalletTransaction(chain, preview.transaction);
    output.textContent = JSON.stringify(
      {
        status: "submitted",
        transactionHash: sent.transactionHash,
        explorerUrl: `https://robin.etherscan.io/tx/${sent.transactionHash}`,
        tradeUrl: preview.tradeUrl || preview.basedBidUrl,
      },
      null,
      2,
    );
  } catch (error) {
    renderBuyError(output, contractAddress, error);
  } finally {
    if (state.openPanel === panel && panel.dataset.tokenValid === "true") setBuyDisabled(panel, false);
  }
}

async function prepareBuyPreviewWithFallback(payload) {
  try {
    return await sendRuntimeMessage({ type: "PREPARE_BASEDBID_BUY", payload });
  } catch (_runtimeError) {
    return postJsonToFirstAvailable(BASEDBID_BUY_PREVIEW_ENDPOINTS, payload);
  }
}

function renderBuyError(output, contractAddress, error) {
  const message = normalizeBuyError(error?.message || "Buy route failed.");
  output.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  output.appendChild(text);

  if (/no supported buy route|couldn't find a supported/i.test(message)) {
    const link = createExternalLink(`https://robin.etherscan.io/token/${contractAddress}`, "Open on Robinhood Etherscan");
    output.appendChild(document.createElement("br"));
    output.appendChild(link);
  }
}

function normalizeBuyError(message) {
  if (/no uniswap v2 pool|token not found|not a based\.bid|basedbid|no pool|dex instead|buy it on based\.bid|no supported robinhood chain buy route/i.test(message)) {
    return "VEKTOR couldn't find a supported Robinhood Chain buy route for this token yet.";
  }
  return String(message || "Buy route failed.").replace(/based\.bid/gi, "buy route");
}

async function getChainConfig() {
  try {
    return await sendRuntimeMessage({ type: "GET_CHAIN_CONFIG" });
  } catch (_error) {
    return ROBINHOOD_CHAIN;
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || "Extension message failed.";
        if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
          reject(new Error("VEKTOR was reloaded. Reload the X/Twitter tab, then try again."));
          return;
        }
        reject(new Error(message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "VEKTOR request failed."));
        return;
      }
      resolve(response.result);
    });
  });
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

async function recordLaunch(record) {
  const { launchHistory } = await getStorage(["launchHistory"]);
  const list = Array.isArray(launchHistory) ? launchHistory : [];
  list.unshift(record);
  await setStorage({ launchHistory: list.slice(0, 300) });
}

async function updateLaunchRecord(txHash, patch) {
  const { launchHistory } = await getStorage(["launchHistory"]);
  const list = Array.isArray(launchHistory) ? launchHistory : [];
  const index = list.findIndex((item) => item.txHash === txHash);
  if (index === -1) return;
  list[index] = { ...list[index], ...patch };
  await setStorage({ launchHistory: list });
}

async function loadTokenInfo(panel, contractAddress) {
  const block = panel.querySelector(".vektor-token-info");
  block.textContent = "Validating contract on Robinhood Chain...";

  try {
    const response = await getTokenInfoWithFallback(contractAddress);
    if (!state.openPanel || state.openPanel !== panel) return;
    let token = response;
    if (typeof token === "string") {
      try {
        token = JSON.parse(token);
      } catch (_error) {
        token = {};
      }
    }

    panel.dataset.tokenValid = "true";
    updateBuyHeader(panel, token, contractAddress);
    setBuyDisabled(panel, false);
    block.replaceChildren(createTokenInfoRows(token));
  } catch (error) {
    if (!state.openPanel || state.openPanel !== panel) return;
    panel.dataset.tokenValid = "false";
    setBuyDisabled(panel, true);
    block.textContent = cleanErrorMessage(error?.message || "Token validation failed.");
  }
}

async function getTokenInfoWithFallback(contractAddress) {
  try {
    return await sendRuntimeMessage({ type: "GET_TOKEN_INFO", contractAddress });
  } catch (_runtimeError) {
    return postJsonToFirstAvailable(TOKEN_INFO_ENDPOINTS, { contractAddress });
  }
}

function updateBuyHeader(panel, token, contractAddress) {
  const title = panel.querySelector(".vektor-buy-token-title");
  if (!title) return;
  const name = token?.name || "Unknown token";
  const symbol = token?.symbol && token.symbol !== "UNKNOWN" ? ` ($${token.symbol})` : "";
  title.textContent = `${name}${symbol}`;
  title.title = contractAddress;
}

function setBuyDisabled(panel, disabled) {
  panel.querySelectorAll(".vektor-buy-option, .vektor-custom-buy button, .vektor-custom-amount").forEach((control) => {
    control.disabled = disabled;
  });
}

function normalizeQuickBuyAmounts(amounts) {
  const values = Array.isArray(amounts) ? amounts : ["0.01", "0.05", "0.1"];
  return values.map((amount) => String(amount).trim()).filter(Boolean).slice(0, 3);
}

function getTweetText(tweet) {
  return Array.from(tweet.querySelectorAll(SELECTORS.tweetText))
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join("\n");
}

function getAuthor(tweet) {
  return tweet.querySelector(SELECTORS.userName)?.textContent?.trim() || "";
}

function getTweetUrl(tweet) {
  const anchor = Array.from(tweet.querySelectorAll('a[href*="/status/"]')).find((link) => link.href);
  return anchor?.href || location.href;
}

function getTweetImageUrls(tweet) {
  const urls = Array.from(tweet.querySelectorAll("img"))
    .filter((image) => isTweetMediaImage(image))
    .map((image) => normalizeTweetImageUrl(image.src))
    .filter(Boolean);
  return Array.from(new Set(urls))
    .slice(0, 4);
}

function isTweetMediaImage(image) {
  const src = image.src || "";
  const alt = image.alt || "";
  if (!src) return false;
  if (/profile_images|emoji|hashflags|abs.twimg.com/i.test(src)) return false;
  if (/twimg\.com\/media|pbs\.twimg\.com\/media/i.test(src)) return true;
  if (/^https?:\/\//i.test(src) && /image|photo|media/i.test(alt)) return true;
  return image.closest('[data-testid="tweetPhoto"], [aria-label="Image"], a[href*="/photo/"]');
}

function normalizeTweetImageUrl(src) {
  try {
    const url = new URL(src);
    if (/pbs\.twimg\.com$/i.test(url.hostname) && url.pathname.includes("/media/")) {
      url.searchParams.set("format", url.searchParams.get("format") || "jpg");
      url.searchParams.set("name", "small");
    }
    return url.href;
  } catch (_error) {
    return src;
  }
}

function analyzeLaunchFit(tweet, text) {
  const lower = text.toLowerCase();
  const engagement = getEngagement(tweet);
  const memeability = scoreMemeability(text, lower);
  const socialEnergy = scoreSocialEnergy(text, lower, engagement);
  const timeliness = scoreTimeliness(text, lower, engagement);
  const originality = scoreOriginality(text, lower);
  const riskFlags = getRiskFlags(text, lower);
  const riskPenalty = Math.min(30, riskFlags.length * 8);
  const launchFitScore = clamp(Math.round(memeability * 0.35 + socialEnergy * 0.3 + timeliness * 0.2 + originality * 0.15 - riskPenalty));

  return {
    launchFitScore,
    label: getLaunchLabel(launchFitScore),
    memeability,
    socialEnergy,
    timeliness,
    originality,
    riskFlags,
    engagement,
    thesis: buildThesis({ text, launchFitScore, memeability, socialEnergy, timeliness, originality, riskFlags }),
  };
}

function getEngagement(tweet) {
  const values = {};
  const labels = [
    ["reply", /reply/i],
    ["repost", /repost|retweet/i],
    ["like", /like/i],
    ["view", /view/i],
  ];

  tweet.querySelectorAll('[role="group"] [aria-label], a[aria-label]').forEach((node) => {
    const label = node.getAttribute("aria-label") || "";
    labels.forEach(([key, regex]) => {
      if (values[key] !== undefined || !regex.test(label)) return;
      const parsed = parseCount(label);
      if (parsed !== null) values[key] = parsed;
    });
  });

  return values;
}

function parseCount(value) {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return null;
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[2]?.toLowerCase()] || 1;
  return Math.round(Number(match[1]) * multiplier);
}

function scoreMemeability(text, lower) {
  let score = text.length < 220 ? 36 : 22;
  if (/\b(ai|crypto|eth|btc|meme|coin|viral|trenches|degen|pump|ticker|cto|mascot)\b/.test(lower)) score += 24;
  if (/\bwe are so back|it is over|send it|retail|anon|lore|cult|goblin|frog|cat|dog\b/.test(lower)) score += 18;
  if (/[!?]{2,}|\p{Extended_Pictographic}/u.test(text)) score += 10;
  if (/\$[a-z0-9]{2,10}/i.test(text)) score += 8;
  return clamp(score);
}

function scoreSocialEnergy(text, lower, engagement) {
  const total = (engagement.reply || 0) * 4 + (engagement.repost || 0) * 3 + (engagement.like || 0) + (engagement.view || 0) * 0.02;
  let score = Math.min(70, Math.round(Math.log10(total + 1) * 18));
  if (/\bquote|ratio|everyone|timeline|breaking|wait|watch\b/.test(lower)) score += 12;
  if (text.length < 140) score += 8;
  return clamp(score);
}

function scoreTimeliness(text, lower, engagement) {
  let score = 42;
  if (/\bnow|today|just|breaking|live|new|launched|hours?|minutes?\b/.test(lower)) score += 22;
  if ((engagement.view || 0) >= 10000 && ((engagement.like || 0) >= 100 || (engagement.repost || 0) >= 25)) score += 20;
  if (/https?:\/\//i.test(text)) score -= 8;
  return clamp(score);
}

function scoreOriginality(text, lower) {
  let score = 58;
  if (/^rt\b|giveaway|airdrop|whitelist|presale/i.test(lower)) score -= 25;
  if (text.length > 320) score -= 15;
  if (/\bcopy|stolen|fake|scam|impersonat/i.test(lower)) score -= 20;
  if (/\bfirst|only|new|nobody|invented|lore\b/.test(lower)) score += 12;
  return clamp(score);
}

function getRiskFlags(text, lower) {
  const flags = [];
  if (/\b(disney|nintendo|pokemon|marvel|tesla|apple|nike|robinhood)\b/.test(lower)) flags.push("Possible protected brand/IP reference");
  if (/\bpresale|airdrop|guaranteed|100x|risk[- ]?free|free money\b/.test(lower)) flags.push("Promotional or scam-adjacent wording");
  if (/\bkill|hate|slur|violence\b/.test(lower)) flags.push("Unsafe or inflammatory wording");
  if (text.length < 12) flags.push("Too little context for a reliable launch thesis");
  return flags;
}

function getLaunchLabel(score) {
  if (score >= 82) return "Prime launch candidate";
  if (score >= 70) return "Launchable with review";
  if (score >= 52) return "Watchlist";
  return "Weak launch fit";
}

function buildThesis(analytics) {
  if (analytics.riskFlags.length) return "Usable only after risk review because the post has potential compliance or originality issues.";
  if (analytics.launchFitScore >= 70) return "This post has enough meme clarity, social energy, and timing to justify preparing a token launch package.";
  return "This post needs stronger engagement, a cleaner meme hook, or fresher timing before launch.";
}

function clamp(value) {
  return Math.max(1, Math.min(100, value));
}

function createHeader(action = "launch") {
  const header = document.createElement("div");
  header.className = "vektor-panel-header";

  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.textContent = action === "ask" ? "VEKTOR LAUNCH CHECK" : "VEKTOR MEME LAUNCHER";
  const title = document.createElement("h2");
  title.textContent = action === "ask" ? "Should this become a token?" : "Prepare this token launch";
  copy.append(eyebrow, title);

  const close = document.createElement("button");
  close.className = "vektor-close";
  close.type = "button";
  close.textContent = "×";

  header.append(copy, close);
  return header;
}

function createBuyHeader(source, contractAddress = "") {
  const header = createHeader();
  header.querySelector("p").textContent = source === "bio" ? "VEKTOR TOKEN DETECTOR" : "VEKTOR CA DETECTOR";
  const title = header.querySelector("h2");
  title.classList.add("vektor-buy-token-title");
  title.textContent = shortAddress(contractAddress) || "Detected token";
  title.title = contractAddress;
  return header;
}

function createContractBlock(contractAddress) {
  const block = document.createElement("div");
  block.className = "vektor-contract";
  const label = document.createElement("span");
  label.textContent = "Contract address";
  const value = document.createElement("strong");
  value.textContent = contractAddress;
  block.append(label, value);
  return block;
}

function createTokenInfoBlock() {
  const block = document.createElement("div");
  block.className = "vektor-token-info";
  block.textContent = "Waiting for token validation...";
  return block;
}

function createTokenInfoRows(token) {
  const wrap = document.createElement("div");
  wrap.className = "vektor-token-info-grid";
  const rows = [
    ["Name", token.name || "Unknown token"],
    ["Symbol", token.symbol || "UNKNOWN"],
    ["Supply", token.totalSupply || "Unknown"],
    ["Price", token.priceUsd ? `$${formatDisplayNumber(token.priceUsd)}` : "Not indexed"],
    ["Liquidity", token.liquidityUsd ? `$${formatDisplayNumber(token.liquidityUsd)}` : "Not indexed"],
    ["Market cap", token.marketCap ? `$${formatDisplayNumber(token.marketCap)}` : token.marketCapNote || "Not indexed"],
    ["Source", token.marketCapSource || "none"],
    ["Explorer", token.explorerUrl || "https://robin.etherscan.io"],
  ];
  if (token.fdv) rows.splice(6, 0, ["FDV", `$${formatDisplayNumber(token.fdv)}`]);
  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    const key = document.createElement("span");
    const val = document.createElement("strong");
    key.textContent = label;
    val.textContent = value;
    row.append(key, val);
    wrap.appendChild(row);
  });
  return wrap;
}

function formatDisplayNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString(undefined, { maximumFractionDigits: number >= 1 ? 2 : 8 });
}

function createBuySpeedDial(amounts) {
  const wrap = document.createElement("div");
  wrap.className = "vektor-buy-dial";
  amounts.forEach((amount) => {
    const button = document.createElement("button");
    button.className = "vektor-buy-option";
    button.type = "button";
    button.dataset.amount = amount;
    button.disabled = true;
    button.textContent = `${amount} ETH`;
    wrap.appendChild(button);
  });

  const form = document.createElement("form");
  form.className = "vektor-custom-buy";
  const input = document.createElement("input");
  input.className = "vektor-custom-amount";
  input.inputMode = "decimal";
  input.placeholder = "Custom ETH";
  input.disabled = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.disabled = true;
  submit.textContent = "Buy custom";
  form.append(input, submit);
  wrap.appendChild(form);
  return wrap;
}

function createBuyOutput(settings) {
  const output = createOutput();
  output.textContent = settings.walletAddress
    ? "Pick a preset or enter a custom ETH amount. VEKTOR will prepare a supported Robinhood Chain buy route, then ask your wallet to sign."
    : "Connect wallet from VEKTOR dashboard or when prompted. VEKTOR never asks for private keys.";
  return output;
}

function createSignal(analytics) {
  const signal = document.createElement("div");
  signal.className = "vektor-signal";
  const label = document.createElement("span");
  label.textContent = analytics.label;
  const value = document.createElement("strong");
  value.textContent = `${analytics.launchFitScore}/100`;
  signal.append(label, value);
  return signal;
}

function createBreakdown(analytics) {
  const list = document.createElement("div");
  list.className = "vektor-breakdown";
  [
    ["Memeability", analytics.memeability],
    ["Social energy", analytics.socialEnergy],
    ["Timing", analytics.timeliness],
    ["Originality", analytics.originality],
  ].forEach(([label, value]) => {
    const item = document.createElement("span");
    item.textContent = `${label}: ${value}`;
    list.appendChild(item);
  });
  return list;
}

function createTweetQuote(tweetText) {
  const quote = document.createElement("blockquote");
  quote.textContent = tweetText;
  return quote;
}

function createExtraInput() {
  const input = document.createElement("textarea");
  input.className = "vektor-extra";
  input.placeholder = "Extra context for VEKTOR. Example: this is from today's Robinhood lore, ticker should feel culty.";
  return input;
}

function createGenerateButton(action = "launch") {
  const button = document.createElement("button");
  button.className = "vektor-generate";
  button.type = "button";
  button.textContent = action === "ask" ? "Ask VEKTOR" : "Prepare launch package";
  return button;
}

function createOutput() {
  const output = document.createElement("pre");
  output.className = "vektor-output";
  output.textContent = "VEKTOR will judge memeability, social energy, timing, and whether this deserves a token before building a launch package.";
  return output;
}

init();
