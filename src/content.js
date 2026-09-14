const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
};

const state = {
  openPanel: null,
};

function init() {
  injectButtons();
  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

function injectButtons() {
  document.querySelectorAll(SELECTORS.tweet).forEach((tweet) => {
    if (tweet.querySelector(".vektor-launch-button")) return;

    const tweetText = getTweetText(tweet);
    if (!tweetText) return;

    const button = document.createElement("button");
    button.className = "vektor-launch-button";
    button.type = "button";
    button.textContent = scoreTweet(tweetText) >= 70 ? "Launch meme" : "Ask VEKTOR";
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

function openPanel(tweet) {
  state.openPanel?.remove();

  const payload = {
    tweetText: getTweetText(tweet),
    author: getAuthor(tweet),
    tweetUrl: getTweetUrl(tweet),
    score: scoreTweet(getTweetText(tweet)),
  };

  const panel = document.createElement("section");
  panel.className = "vektor-panel";
  panel.append(
    createHeader(),
    createSignal(payload.score),
    createTweetQuote(payload.tweetText),
    createExtraInput(),
    createGenerateButton(),
    createOutput(),
  );

  document.body.appendChild(panel);
  state.openPanel = panel;

  panel.querySelector(".vektor-close").addEventListener("click", () => panel.remove());
  panel.querySelector(".vektor-generate").addEventListener("click", () => generatePlan(panel, payload));
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

function scoreTweet(text) {
  const lower = text.toLowerCase();
  let score = Math.min(55, Math.round(text.length / 3));
  if (/[!?]{2,}/.test(text)) score += 10;
  if (/\b(ai|crypto|solana|base|eth|btc|meme|coin|viral|trenches|degen|pump)\b/.test(lower)) score += 15;
  if (text.length < 280) score += 10;
  if (/\bwe are so back|it is over|send it|retail|ticker|cto\b/.test(lower)) score += 10;
  return Math.max(1, Math.min(100, score));
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

function createSignal(score) {
  const signal = document.createElement("div");
  signal.className = "vektor-signal";
  const label = document.createElement("span");
  label.textContent = "Virality score";
  const value = document.createElement("strong");
  value.textContent = `${score}/100`;
  signal.append(label, value);
  return signal;
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
