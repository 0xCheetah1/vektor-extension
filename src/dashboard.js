const STORAGE_FIELDS = ["walletAddress", "walletChainId", "walletConnectedAt", "quickBuyAmounts"];
const ROBINHOOD_CHAIN_ID = "0x1237";

async function load() {
  const settings = await chrome.storage.local.get(STORAGE_FIELDS);
  renderStatus(settings);
  renderQuickBuyAmounts(settings.quickBuyAmounts);
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
    await chrome.storage.local.set(payload);
    renderStatus(payload);
    flash("Wallet connected on Robinhood Chain.");
  } catch (error) {
    flash(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Connect wallet";
  }
}

async function disconnectWallet() {
  const payload = { walletAddress: "", walletChainId: "", walletConnectedAt: "" };
  await chrome.storage.local.set(payload);
  renderStatus(payload);
  flash("Wallet disconnected.");
}

async function saveQuickBuyAmounts(event) {
  event.preventDefault();
  const amounts = ["quickBuyAmount1", "quickBuyAmount2", "quickBuyAmount3"].map((id) => document.getElementById(id).value.trim());
  if (amounts.some((amount) => !Number(amount) || Number(amount) <= 0)) {
    flash("Use three valid ETH amounts.");
    return;
  }

  await chrome.storage.local.set({ quickBuyAmounts: amounts });
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
  const wallet = settings.walletAddress || "";
  const chainId = settings.walletChainId?.toLowerCase() || "";
  const ready = wallet && chainId === ROBINHOOD_CHAIN_ID;
  const chainChip = document.getElementById("chainChip");

  document.getElementById("walletStatus").textContent = wallet ? shortAddress(wallet) : "Not connected";
  document.getElementById("walletAddress").textContent = wallet || "No wallet connected.";
  document.getElementById("walletChain").textContent = chainId ? `${chainId}${ready ? " Robinhood Chain" : ""}` : "Unknown";
  document.getElementById("walletConnectedAt").textContent = settings.walletConnectedAt ? new Date(settings.walletConnectedAt).toLocaleString() : "Never";
  document.getElementById("disconnectWallet").disabled = !wallet;

  chainChip.textContent = ready ? "Robinhood Chain ready" : "Robinhood Chain required";
  chainChip.classList.toggle("ready", Boolean(ready));
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
