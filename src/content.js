const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
};

const state = {
  openPanel: null,
  closeHandlers: null,
};

const ASK_THRESHOLD = 50;
const LAUNCH_THRESHOLD = 70;

function init() {
  setupWalletBridge();
  injectButtons();
  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });
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
    button.textContent = analytics.launchFitScore >= LAUNCH_THRESHOLD ? "Launch meme" : "Ask VEKTOR";
    button.title = "Generate a memecoin plan from this post";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPanel(tweet);
    });

    const target = tweet.querySelector('[role="group"]') || tweet;
    target.appendChild(button);
  });
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

function openPanel(tweet) {
  closePanel();

  const payload = {
    tweetText: getTweetText(tweet),
    author: getAuthor(tweet),
    tweetUrl: getTweetUrl(tweet),
    analytics: analyzeLaunchFit(tweet, getTweetText(tweet)),
  };
  payload.score = payload.analytics.launchFitScore;

  const panel = document.createElement("section");
  panel.className = "vektor-panel";
  panel.append(
    createHeader(),
    createSignal(payload.analytics),
    createBreakdown(payload.analytics),
    createTweetQuote(payload.tweetText),
    createExtraInput(),
    createGenerateButton(),
    createOutput(),
  );

  document.body.appendChild(panel);
  state.openPanel = panel;

  panel.querySelector(".vektor-close").addEventListener("click", closePanel);
  panel.querySelector(".vektor-generate").addEventListener("click", () => generatePlan(panel, payload));
  setupPanelDismiss(panel);
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

  button.disabled = true;
  button.textContent = "Routing to agent...";
  output.textContent = "Reading captured tweet and building launch package...";

  chrome.runtime.sendMessage(
    { type: "GENERATE_TOKEN_PLAN", payload: { ...payload, extraInstructions: extra } },
    (response) => {
      button.disabled = false;
      button.textContent = "Generate launch plan";
      output.textContent = response?.ok ? response.result : response?.error || "Agent failed.";
    },
  );
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

function createHeader() {
  const header = document.createElement("div");
  header.className = "vektor-panel-header";

  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.textContent = "VEKTOR MEME LAUNCHER";
  const title = document.createElement("h2");
  title.textContent = "Turn this post into a token";
  copy.append(eyebrow, title);

  const close = document.createElement("button");
  close.className = "vektor-close";
  close.type = "button";
  close.textContent = "×";

  header.append(copy, close);
  return header;
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
  input.placeholder = "Extra launch instructions. Example: make it degen, Base chain, funny ticker, no copyrighted names.";
  return input;
}

function createGenerateButton() {
  const button = document.createElement("button");
  button.className = "vektor-generate";
  button.type = "button";
  button.textContent = "Generate launch plan";
  return button;
}

function createOutput() {
  const output = document.createElement("pre");
  output.className = "vektor-output";
  output.textContent = "Agent will inspect the captured post text and produce token name, ticker, meme thesis, launch copy, image prompt, risk flags, and launch steps.";
  return output;
}

init();
