// src/App.js
import React, { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import Web3Modal from "web3modal";
import axios from "axios";

function safeUrl(raw, fallbackPath) {
  try {
    if (!raw) throw new Error("no url");
    const u = new URL(raw);
    const allowed = new Set(["www.goldsilverstuff.com"]);
    if (!allowed.has(u.host)) throw new Error("bad host");
    return u.toString();
  } catch {
    return `https://www.goldsilverstuff.com/${fallbackPath}`;
  }
}

// === Händler-Wallet (gleiche Adresse auf allen Chains) ===
const RECIPIENT = "0x3cfde8c9a3f1804aa9828be38a966762d98dced1";

// === Chains & Coins ===
const CHAINS = {
  eth: {
    name: "Ethereum",
    chainId: 1,
    recipient: RECIPIENT,
    coins: {
      ETH:  { address: null, coingeckoId: "ethereum" },
      USDC: { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", coingeckoId: "usd-coin" },
      USDT: { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", coingeckoId: "tether" },
      DAI:  { address: "0x6b175474e89094c44da98b954eedeac495271d0f", coingeckoId: "dai" },
      LINK: { address: "0x514910771af9ca656af840dff83e8264ecf986ca", coingeckoId: "chainlink" },
      AAVE: { address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", coingeckoId: "aave" },
      SHIB: { address: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", coingeckoId: "shiba-inu" },
      GRT:  { address: "0xc944e90c64b2c07662a292be6244bdf05cda44a7", coingeckoId: "the-graph" },
    },
  },
  bnb: {
    name: "BNB Chain",
    chainId: 56,
    recipient: RECIPIENT,
    coins: {
      BNB:  { address: null, coingeckoId: "binancecoin" },
      USDT: { address: "0x55d398326f99059fF775485246999027B3197955", coingeckoId: "tether" },
      USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", coingeckoId: "usd-coin" },
    },
  },
  matic: {
    name: "Polygon",
    chainId: 137,
    recipient: RECIPIENT,
    coins: {
      MATIC: { address: null, coingeckoId: "matic-network" },
      USDT:  { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", coingeckoId: "tether" },
      USDC:  { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", coingeckoId: "usd-coin" },
      DAI:   { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", coingeckoId: "dai" },
      LINK:  { address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", coingeckoId: "chainlink" },
      AAVE:  { address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b", coingeckoId: "aave" },
      ETH:   { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", coingeckoId: "weth" }, // WETH auf Polygon
      WETH:  { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", coingeckoId: "weth" },
    },
  },
};

// === Normalisierung eingehender Chain-Namen ===
const CHAIN_ALIAS = {
  ETH: "eth",
  ETHEREUM: "eth",
  BSC: "bnb",
  BNB: "bnb",
  BINANCE: "bnb",
  POLYGON: "matic",
  MATIC: "matic",
};

// === Minimaler ERC20-ABI ===
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

function App() {
  // URL / Order
  const [orderId, setOrderId] = useState("");
  const [token, setToken] = useState("");

  // Bestelldaten
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [cartValueEUR, setCartValueEUR] = useState(0);
  const [userId, setUserId] = useState("");

  // Auswahl
  const [chainKey, setChainKey] = useState("");
  const [coinKey, setCoinKey] = useState("");

  // Validierung
  const [validating, setValidating] = useState(true);
  const [validOrder, setValidOrder] = useState(false);

  // Preise / Beträge
  const [priceEUR, setPriceEUR] = useState(null);
  const [cryptoAmount, setCryptoAmount] = useState("");

  // Timer
  const [timer, setTimer] = useState(600);
  const [timerActive, setTimerActive] = useState(false);

  // Web3
  const web3ModalRef = useRef(null);
  const providerRef = useRef(null);
  const signerRef = useRef(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(null);

  // UI Status
  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");

  // Web3Modal sicher initialisieren (nur im Browser)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        web3ModalRef.current = new Web3Modal({ cacheProvider: false });
      } catch (_) {
        // ignore
      }
    }
  }, []);

  // GET-Validierung & optionaler Debug-Bypass
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get("orderId");
    const tokenParam = params.get("token");
    const failUrl = params.get("fail") || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
    const dbg = params.get("dbg");

    // ✅ Debug-Bypass (kein Backend-GET!)
    if (dbg === "1") {
      const urlChain = params.get("chain") || "";
      const urlCoin  = params.get("coin")  || "";
      const urlEur   = Number(params.get("amountEur") || 0);

      const normChain = CHAIN_ALIAS[urlChain.toUpperCase()] || urlChain.toLowerCase();

      setOrderId(orderIdParam || "DBG");
      setToken(tokenParam || "DBG");
      setChainKey(normChain);
      setCoinKey(urlCoin.toUpperCase());
      setCartValueEUR(urlEur);

      setValidOrder(true);
      setTimer(600);
      setTimerActive(true);
      setValidating(false);
      return;
    }

    if (!orderIdParam || !tokenParam) {
      const url = `${failUrl}${failUrl.includes("?") ? "&" : "?"}orderId=${encodeURIComponent(orderIdParam || "")}&reason=missing_params`;
      window.location.href = url;
      return;
    }

    setOrderId(orderIdParam);
    setToken(tokenParam);

    (async () => {
      try {
        const res = await fetch(
          `https://www.goldsilverstuff.com/_functions/web3zahlung?orderId=${encodeURIComponent(orderIdParam)}&token=${encodeURIComponent(tokenParam)}`,
          { method: "GET", mode: "cors", credentials: "omit" }
        );
        if (!res.ok) {
          const url = `${failUrl}${failUrl.includes("?") ? "&" : "?"}orderId=${encodeURIComponent(orderIdParam)}&reason=verify_failed_${res.status}`;
          window.location.href = url;
          return;
        }
        const data = await res.json();

        const normChain = CHAIN_ALIAS[(data.chain || "").toUpperCase()] || (data.chain || "").toLowerCase();
        setChainKey(normChain);
        setCoinKey((data.coin || "").toUpperCase());

        setCustomerName(data.name || "");
        setCustomerEmail(data.email || "");
        setCartValueEUR(Number(data.warenkorbWert || 0));
        setUserId(data.userId || "");

        setValidOrder(true);
        setTimer(600);
        setTimerActive(true);
      } catch (e) {
        console.error("Validierungsfehler:", e);
        const url = `${failUrl}${failUrl.includes("?") ? "&" : "?"}orderId=${encodeURIComponent(orderIdParam)}&reason=verify_error`;
        window.location.href = url;
      } finally {
        setValidating(false);
      }
    })();
  }, []);

  // Preis laden & Crypto-Betrag berechnen
  useEffect(() => {
    if (!validOrder) return;
    async function fetchPrice() {
      try {
        setError("");
        if (!chainKey || !coinKey) return;
        const chainObj = CHAINS[chainKey];
        if (!chainObj) { setError(`Unbekannte Chain: ${chainKey}`); return; }
        const coinObj = chainObj.coins[coinKey];
        if (!coinObj) { setError(`Coin ${coinKey} auf ${chainObj.name} nicht unterstützt`); return; }
        const coinId = coinObj.coingeckoId;
        if (!coinId) { setError("Kein Preis-Lookup für diesen Coin"); return; }

        const res = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=eur`
        );
        const eur = Number(res.data?.[coinId]?.eur || 0);
        setPriceEUR(eur || null);
        if (eur > 0 && cartValueEUR > 0) {
          const amt = cartValueEUR / eur;
          setCryptoAmount((amt).toFixed(6));
        }
      } catch (e) {
        console.error("Preisabruf-Fehler:", e);
        setError("Fehler beim Abrufen des Kurses");
      }
    }
    fetchPrice();
  }, [validOrder, chainKey, coinKey, cartValueEUR]);

  // Countdown
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) { handleAbort(); return; }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, timerActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAbort() {
    setTimerActive(false);
    setTxStatus("");
    setError("Zeit abgelaufen. Zahlung abgebrochen.");
    const params = new URLSearchParams(window.location.search);
    const fail = params.get("fail") || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
    const url = `${fail}${fail.includes("?") ? "&" : "?"}orderId=${encodeURIComponent(orderId || "")}&reason=timeout`;
    window.location.href = url;
  }

  // Wallet connect
  async function connectWallet() {
    try {
      setError(""); setTxStatus("");

      // MetaMask / EIP-6963
      let ext = null;
      const eth = typeof window !== "undefined" ? window.ethereum : null;
      if (eth && Array.isArray(eth.providers) && eth.providers.length) {
        ext = eth.providers.find((p) => p.isMetaMask) || eth.providers[0];
      } else if (eth) {
        ext = eth;
      }

      let providerInstance;
      if (ext) {
        await ext.request({ method: "eth_requestAccounts" });
        providerInstance = new ethers.BrowserProvider(ext);
      } else {
        if (!web3ModalRef.current) {
          web3ModalRef.current = new Web3Modal({ cacheProvider: false });
        }
        const instance = await web3ModalRef.current.connect();
        providerInstance = new ethers.BrowserProvider(instance);
      }

      const signerInstance = await providerInstance.getSigner();
      const addr = await signerInstance.getAddress();
      const net = await providerInstance.getNetwork();

      providerRef.current = providerInstance;
      signerRef.current = signerInstance;
      setAddress(addr);
      setChainId(Number(net.chainId));

      const base = ext || (typeof window !== "undefined" ? window.ethereum : null);
      if (base && base.on) {
        base.on("accountsChanged", (accounts) => setAddress(accounts?.[0] || ""));
        base.on("chainChanged", (hex) => {
          try { setChainId(parseInt(hex, 16)); } catch { setChainId(null); }
        });
        base.on("disconnect", disconnectWallet);
      }
    } catch (e) {
      console.error("connectWallet-Fehler:", e);
      setError("Wallet-Verbindung fehlgeschlagen");
    }
  }

  function disconnectWallet() {
    try { web3ModalRef.current?.clearCachedProvider?.(); } catch (_) {}
    providerRef.current = null;
    signerRef.current = null;
    setAddress("");
    setChainId(null);
    setTxStatus("");
    setError("");
  }

  // Zahlung
  async function sendPayment() {
    setError(""); setTxStatus("");

    const url = new URL(window.location.href);
    const successURL = url.searchParams.get("success") || "https://www.goldsilverstuff.com/zahlung-erfolgreich";
    const failURL    = url.searchParams.get("fail")    || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";

    const signer = signerRef.current;
    if (!signer) { setError("Bitte Wallet verbinden"); return; }

    const chainConf = CHAINS[chainKey];
    if (!chainConf) { setError(`Unbekannte Chain (${chainKey})`); return; }
    if (Number(chainId) !== Number(chainConf.chainId)) { setError(`Bitte Wallet auf ${chainConf.name} umstellen`); return; }

    const amountNum = Number(cryptoAmount);
    if (!cryptoAmount || isNaN(amountNum) || amountNum <= 0) { setError("Ungültiger Betrag"); return; }

    const coinInfo = chainConf.coins?.[coinKey];
    if (!coinInfo) { setError(`Coin ${coinKey} auf ${chainKey} nicht konfiguriert`); return; }

    // Empfängeradresse robust normalisieren
    let recipient;
    try {
      const raw = String(chainConf.recipient || "").trim().replace(/\u200B|\u200C|\u200D|\uFEFF/g, "");
      recipient = ethers.getAddress(raw.toLowerCase());
    } catch (e) {
      console.error("[PAY] Invalid recipient:", chainConf.recipient, e);
      setError("Interne Empfängeradresse ungültig. Bitte Support kontaktieren.");
      return;
    }

    // Token-Adresse ggf. normalisieren
    let tokenAddr = null;
    if (coinInfo.address !== null) {
      const rawToken = String(coinInfo.address || "").trim().replace(/\u200B|\u200C|\u200D|\uFEFF/g, "");
      if (!ethers.isAddress(rawToken)) {
        console.error("[PAY] Invalid token address:", rawToken);
        setError(`Token-Adresse für ${coinKey} ungültig`);
        return;
      }
      tokenAddr = ethers.getAddress(rawToken.toLowerCase());
    }

    try {
      const message = `Zahlung ${cartValueEUR} EUR in ${cryptoAmount} ${coinKey} (Order ${orderId})`;
      await signer.signMessage(message);

      setTxStatus("Transaktion läuft…");

      let txResponse;
      if (tokenAddr === null) {
        // Native Coin (ETH / BNB / MATIC)
        txResponse = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther(String(cryptoAmount)),
        });
      } else {
        // ERC20 Transfer
        const contract = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const decimals = await contract.decimals(); // number
        const value = ethers.parseUnits(String(cryptoAmount), decimals);
        txResponse = await contract.transfer(recipient, value);
      }

      const receipt = await txResponse.wait();
      const txHash = receipt.transactionHash;
      setTxStatus("Zahlung bestätigt!");

      // Webhook POST (2 Versuche)
      const payload = {
        orderId,
        token,
        coin: coinKey,
        chain: chainKey,
        walletAdresse: address,
        cryptoAmount: String(cryptoAmount),
        txHash,
      };

      async function postWebhook() {
        return fetch("https://www.goldsilverstuff.com/_functions/web3zahlung", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          keepalive: true,
          body: JSON.stringify(payload),
        });
      }

      let posted = false;
      try {
        const r1 = await postWebhook(); posted = r1.ok;
        if (!posted) {
          await new Promise((r) => setTimeout(r, 600));
          const r2 = await postWebhook(); posted = r2.ok;
        }
      } catch (_) {
        // Falls Netzwerk blockt: nicht kritisch – On-Chain ist bezahlt
      }

      const sep1 = successURL.includes("?") ? "&" : "?";
      const successParams =
        `orderId=${encodeURIComponent(orderId)}` +
        `&tx=${encodeURIComponent(txHash)}` +
        `&posted=${posted ? 1 : 0}` +
        `&coin=${encodeURIComponent(coinKey)}` +
        `&chain=${encodeURIComponent(chainKey)}` +
        `&wallet=${encodeURIComponent(address)}` +
        `&amount=${encodeURIComponent(String(cryptoAmount))}`;
      window.location.href = `${successURL}${sep1}${successParams}`;
    } catch (e) {
      console.error("sendPayment ERROR:", e);
      let reason = "tx_failed";
      if (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) reason = "user_rejected";
      if (e && e.code === "BAD_DATA" && e.info && e.info.method === "resolver") reason = "bad_address";
      setError(e?.message || "Zahlung fehlgeschlagen");

      const sep2 = failURL.includes("?") ? "&" : "?";
      window.location.href = `${failURL}${sep2}orderId=${encodeURIComponent(orderId)}&reason=${encodeURIComponent(reason)}`;
    }
  }

  if (validating) {
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <p>Lade Bestelldaten…</p>
      </div>
    );
  }

  const chainObj = CHAINS[chainKey];

  return (
    <div style={{ maxWidth: 520, margin: "auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Firmenlogo" style={{ maxWidth: 200 }} />
      </div>

      <h2>Web3 Checkout</h2>

      {customerName && <p><strong>Kunde:</strong> {customerName}</p>}
      {customerEmail && <p><strong>E-Mail:</strong> {customerEmail}</p>}
      {orderId && <p><strong>Bestell-ID:</strong> {orderId}</p>}

      <p><strong>Warenkorb:</strong> {Number(cartValueEUR || 0).toFixed(2)} EUR</p>
      <p><strong>Auswahl:</strong> {coinKey || "—"} {chainObj ? `@ ${chainObj.name}` : (chainKey || "")}</p>
      <p><strong>Zeit verbleibend:</strong> {timerActive ? `${timer}s` : <span style={{ color: "#c00" }}>Inaktiv</span>}</p>
      <p><strong>Aktueller Preis (EUR):</strong> {priceEUR ? `${Number(priceEUR).toFixed(2)} EUR` : "Lade..."}</p>
      <p><strong>Betrag in {coinKey || "—"}:</strong> {cryptoAmount ? `${cryptoAmount} ${coinKey}` : "—"}</p>

      <br />

      {!address ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", cursor: "pointer" }}>
          Jetzt mit Wallet bezahlen
        </button>
      ) : (
        <>
          <p><strong>Verbunden mit:</strong> {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "-"}</p>
          <button onClick={sendPayment} style={{ padding: "10px 20px", cursor: "pointer" }}>
            Zahlung senden
          </button>
          <button onClick={disconnectWallet} style={{ marginLeft: 10, padding: "10px 20px", cursor: "pointer" }}>
            Wallet trennen
          </button>
        </>
      )}

      <br /><br />
      {txStatus && <p style={{ color: "green" }}>{txStatus}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <hr />
      <p style={{ fontSize: "0.8em", color: "#555" }}>
        ⚠️ Kryptowährungen unterliegen starken Kursschwankungen und Zahlungen sind unwiderruflich. Bitte prüfe Chain &amp; Coin sorgfältig.
      </p>
    </div>
  );
}

export default App;