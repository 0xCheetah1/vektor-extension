const STORAGE_FIELDS = ["walletAddress", "walletChainId", "walletConnectedAt", "quickBuyAmounts"];
const ROBINHOOD_CHAIN_ID = "0x1237";

async function load() {
  const settings = await getStorage(STORAGE_FIELDS);
  renderStatus(settings);
  renderQuickBuyAmounts(settings.quickBuyAmounts);
  renderLaunchHistory(settings.walletAddress);
}

async function renderLaunchHistory(wallet) {
  const container = document.getElementById("launchHistory");
  const count = document.getElementById("historyCount");
  const owner = document.getElementById("historyOwner");
  container.replaceChildren();

  const { launchHistory } = await getStorage(["launchHistory"]);
  const list = Array.isArray(launchHistory) ? launchHistory : [];
  const normalized = (wallet || "").toLowerCase();
  const mine = normalized ? list.filter((item) => (item.wallet || "").toLowerCase() === normalized) : [];

  if (!wallet) {
    count.textContent = "0";
    owner.textContent = "Connect a wallet to see launches from that account.";
    container.appendChild(emptyHistory("No wallet connected."));
    return;
  }

  count.textContent = String(mine.length);
  owner.textContent = `Showing launches from ${shortAddress(wallet)}.`;
  if (!mine.length) {
    container.appendChild(emptyHistory("No launches from this wallet yet."));
    return;
  }
  mine.forEach((item) => container.appendChild(createHistoryItem(item)));
}

function emptyHistory(text) {
  const empty = document.createElement("p");
  empty.className = "history-empty";
  empty.textContent = text;
  return empty;
}

function createHistoryItem(item) {
  const row = document.createElement("div");
  row.className = "history-item";

  const head = document.createElement("div");
  head.className = "history-item-head";
  const title = document.createElement("strong");
  title.textContent = `${item.name || "Untitled"}${item.ticker ? ` ($${item.ticker})` : ""}`;
  const date = document.createElement("span");
  date.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString() : "";
  head.append(title, date);
  row.appendChild(head);

  if (item.tokenAddress) {
    const ca = document.createElement("code");
    ca.className = "history-ca";
    ca.textContent = item.tokenAddress;
    row.appendChild(ca);
  }

  const links = document.createElement("div");
  links.className = "history-links";
  if (item.orbioUrl) links.appendChild(historyLink(item.orbioUrl, "Orbio"));
  else if (item.basedBidUrl) links.appendChild(historyLink(item.basedBidUrl, "based.bid"));
  if (item.explorerUrl) links.appendChild(historyLink(item.explorerUrl, "Etherscan"));
  else if (item.explorerTxUrl) links.appendChild(historyLink(item.explorerTxUrl, "Tx"));
  row.appendChild(links);

  return row;
}

function historyLink(href, label) {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

async function connectWallet() {
  const button = document.getElementById("connectWallet");
  button.disabled = true;
  button.textContent = "Connecting...";

  try {
    const chain = await getChainConfig();
    const response = await sendWalletMessage({ type: "CONNECT_WALLET", chain });
    if (!response?.ok) throw new Error(response?.error || "Wallet connection failed.");

    const payload = {
      walletAddress: response.result.address,
      walletChainId: response.result.chainId?.toLowerCase() || "",
      walletConnectedAt: new Date().toISOString(),
    };
    await setStorage(payload);
    renderStatus(payload);
    renderLaunchHistory(payload.walletAddress);
    flash(response.result.chainSwitchError || "Wallet connected on Robinhood Chain.");
  } catch (error) {
    flash(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Connect wallet";
  }
}

async function disconnectWallet() {
  const payload = { walletAddress: "", walletChainId: "", walletConnectedAt: "" };
  await setStorage(payload);
  renderStatus(payload);
  renderLaunchHistory("");
  flash("Wallet disconnected.");
}

async function saveQuickBuyAmounts(event) {
  event.preventDefault();
  const amounts = ["quickBuyAmount1", "quickBuyAmount2", "quickBuyAmount3"].map((id) => document.getElementById(id).value.trim());
  if (amounts.some((amount) => !Number(amount) || Number(amount) <= 0)) {
    flash("Use three valid ETH amounts.");
    return;
  }

  await setStorage({ quickBuyAmounts: amounts });
  flash("Quick buy presets saved.");
}

function sendWalletMessage(message) {
  const targetTabId = Number(new URLSearchParams(location.search).get("targetTabId"));
  if (!targetTabId) return Promise.reject(new Error("Open this dashboard from VEKTOR while an X/Twitter tab is active."));

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(targetTabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error("Reload X/Twitter, then reopen this dashboard from the VEKTOR popup."));
        return;
      }
      resolve(response);
    });
  });
}

function getChainConfig() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "GET_CHAIN_CONFIG" }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Unable to load chain config."));
        return;
      }
      resolve(response.result);
    });
  });
}

function openX() {
  chrome.tabs.create({ url: "https://x.com" });
}

function renderStatus(settings) {
  settings = settings || {};
  const wallet = settings.walletAddress || "";
  const chainId = settings.walletChainId?.toLowerCase() || "";
  const ready = wallet && chainId === ROBINHOOD_CHAIN_ID;
  const chainChip = document.getElementById("chainChip");

  document.getElementById("walletStatus").textContent = wallet ? shortAddress(wallet) : "Not connected";
  document.getElementById("walletAddress").textContent = wallet || "No wallet connected.";
  document.getElementById("walletChain").textContent = chainId ? `${chainId}${ready ? " Robinhood Chain" : ""}` : "Unknown";
  document.getElementById("walletConnectedAt").textContent = settings.walletConnectedAt ? new Date(settings.walletConnectedAt).toLocaleString() : "Never";
  document.getElementById("connectWallet").hidden = Boolean(wallet);
  document.getElementById("disconnectWallet").hidden = !wallet;

  chainChip.textContent = ready ? "Robinhood Chain ready" : wallet ? "Switch to Robinhood Chain" : "Robinhood Chain required";
  chainChip.classList.toggle("ready", Boolean(ready));
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

function renderQuickBuyAmounts(amounts) {
  const values = Array.isArray(amounts) && amounts.length ? amounts : ["0.01", "0.05", "0.1"];
  ["quickBuyAmount1", "quickBuyAmount2", "quickBuyAmount3"].forEach((id, index) => {
    document.getElementById(id).value = values[index] || "";
  });
}

function shortAddress(address) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function flash(message) {
  const status = document.getElementById("status");
  status.textContent = message;
  setTimeout(() => {
    status.textContent = "";
  }, 3200);
}

document.getElementById("connectWallet").addEventListener("click", connectWallet);
document.getElementById("disconnectWallet").addEventListener("click", disconnectWallet);
document.getElementById("openX").addEventListener("click", openX);
document.getElementById("quickBuyForm").addEventListener("submit", saveQuickBuyAmounts);
load();
