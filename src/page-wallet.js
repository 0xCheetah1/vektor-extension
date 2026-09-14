window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.source !== "VEKTOR_CONTENT_WALLET_REQUEST") return;

  const requestId = event.data.requestId;
  const chain = event.data.chain;
  try {
    if (!window.ethereum?.request) throw new Error("No injected EVM wallet found on this page.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const switchResult = chain?.chainId ? await switchToChain(chain) : { chainId: await window.ethereum.request({ method: "eth_chainId" }) };
    window.postMessage(
      {
        source: "VEKTOR_PAGE_WALLET_RESPONSE",
        requestId,
        address: accounts?.[0] || "",
        chainId: switchResult.chainId,
        chainSwitchError: switchResult.error || "",
      },
      "*",
    );
  } catch (error) {
    window.postMessage(
      { source: "VEKTOR_PAGE_WALLET_RESPONSE", requestId, error: error?.message || "Wallet rejected the request." },
      "*",
    );
  }
});

async function switchToChain(chain) {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
  } catch (error) {
    if (error?.code !== 4902) return switchFallback(error);
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain.chainId,
            chainName: chain.name,
            rpcUrls: chain.rpcUrls,
            nativeCurrency: chain.nativeCurrency,
            blockExplorerUrls: chain.blockExplorerUrls,
          },
        ],
      });
    } catch (addError) {
      return switchFallback(addError);
    }
  }

  return { chainId: await window.ethereum.request({ method: "eth_chainId" }) };
}

async function switchFallback(error) {
  let chainId = "";
  try {
    chainId = await window.ethereum.request({ method: "eth_chainId" });
  } catch (_error) {
    chainId = "";
  }

  const walletName = window.ethereum?.isPhantom ? "Phantom" : "wallet";
  return {
    chainId,
    error: `${walletName} connected, but rejected Robinhood Chain switching: ${error?.message || "unsupported network"}. Switch to Robinhood Chain manually in the wallet and reconnect.`,
  };
}
