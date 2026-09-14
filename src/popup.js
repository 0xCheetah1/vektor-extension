const fields = ["walletAddress", "orbioEndpoint", "orbioApiKey"];

async function load() {
  const settings = await chrome.storage.local.get(fields);
  fields.forEach((field) => {
    document.getElementById(field).value = settings[field] || "";
  });
  renderStatus(settings);
}

async function save() {
  const payload = Object.fromEntries(fields.map((field) => [field, document.getElementById(field).value.trim()]));
  await chrome.storage.local.set(payload);
  renderStatus(payload);
  flash("Saved dashboard.");
}

function renderStatus(settings) {
  const wallet = settings.walletAddress || "";
  const endpoint = settings.orbioEndpoint || "";
  document.getElementById("walletStatus").textContent = wallet ? shortAddress(wallet) : "Not connected";
  document.getElementById("walletChip").textContent = wallet ? "Ready for prototype" : "Required before launch";
  document.getElementById("agentStatus").textContent = endpoint ? "Orbio connected" : "Demo mode";
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
  }, 1600);
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("connectWallet").addEventListener("click", () => {
  flash("Real wallet connection is next. Paste an address for now.");
});
load();
