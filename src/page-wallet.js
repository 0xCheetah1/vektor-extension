window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.source !== "VEKTOR_CONTENT_WALLET_REQUEST") return;

  const requestId = event.data.requestId;
  try {
    if (!window.ethereum?.request) throw new Error("No injected EVM wallet found on this page.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    window.postMessage({ source: "VEKTOR_PAGE_WALLET_RESPONSE", requestId, address: accounts?.[0] || "" }, "*");
  } catch (error) {
    window.postMessage(
      { source: "VEKTOR_PAGE_WALLET_RESPONSE", requestId, error: error?.message || "Wallet rejected the request." },
      "*",
    );
  }
});
