const STORAGE_FIELDS = ["walletAddress", "walletChainId", "walletConnectedAt"];

async function load() {
  const settings = await chrome.storage.local.get(STORAGE_FIELDS);
  renderStatus(settings);
}

async function connectWallet() {
  const button = document.getElementById("connectWallet");
  button.disabled = true;
  button.textContent = "Connecting...";

  try {
    const chain = await getChainConfig();
    const response = await sendActiveTabMessage({ type: "CONNECT_WALLET", chain });
    if (!response?.ok) throw new Error(response?.error || "Wallet connection failed.");

    const payload = {
      walletAddress: response.result.address,
      walletChainId: response.result.chainId?.toLowerCase() || "",
      walletConnectedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set(payload);
    renderStatus(payload);
    flash("Wallet connected.");
  } catch (error) {
    flash(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Connect browser wallet";
  }
}

async function disconnectWallet() {
  const payload = { walletAddress: "", walletChainId: "", walletConnectedAt: "" };
  await chrome.storage.local.set(payload);
  renderStatus(payload);
  flash("Wallet disconnected.");
}

function sendActiveTabMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) {
        reject(new Error("Open X/Twitter and try again."));
        return;
      }

      chrome.tabs.sendMessage(tabId, message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error("Open or reload X/Twitter so VEKTOR can access the page wallet."));
          return;
        }
        resolve(response);
      });
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

function renderStatus(settings) {
  const wallet = settings.walletAddress || "";
  const chainId = settings.walletChainId?.toLowerCase() || "";
  document.getElementById("walletStatus").textContent = wallet ? shortAddress(wallet) : "Not connected";
  document.getElementById("walletChip").textContent = wallet && chainId === "0x1237" ? "Robinhood Chain" : "Required before launch";
  document.getElementById("walletAddress").textContent = wallet || "No wallet connected.";
  document.getElementById("disconnectWallet").disabled = !wallet;
  document.getElementById("agentStatus").textContent = "Internal";
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
  }, 2200);
}

document.getElementById("connectWallet").addEventListener("click", connectWallet);
document.getElementById("disconnectWallet").addEventListener("click", disconnectWallet);
load();
