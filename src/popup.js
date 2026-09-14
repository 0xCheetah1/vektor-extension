const fields = ["walletAddress", "orbioEndpoint", "orbioApiKey"];

async function load() {
  const settings = await chrome.storage.local.get(fields);
  fields.forEach((field) => {
    document.getElementById(field).value = settings[field] || "";
  });
}

async function save() {
  const payload = Object.fromEntries(fields.map((field) => [field, document.getElementById(field).value.trim()]));
  await chrome.storage.local.set(payload);
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

document.getElementById("save").addEventListener("click", save);
load();
