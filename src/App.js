import React, { useState, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import Web3Modal from "web3modal";
import axios from "axios";

// Händler-Wallet (gleiche Adresse auf allen Chains ok)
const RECIPIENT = "0x3cfde8c9a3f1804aa9828be38a966762d98dced1";

/* 1) CHAINS + Mapping für eingehende Keys */
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
      // ✅ richtige USDT-Adresse auf Polygon:
      USDT:  { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", coingeckoId: "tether" },
      USDC:  { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", coingeckoId: "usd-coin" },
      DAI:   { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", coingeckoId: "dai" },
      LINK:  { address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", coingeckoId: "chainlink" },
      AAVE:  { address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b", coingeckoId: "aave" },
      // Optional: ETH alias via WETH auf Polygon (falls dein Checkout „ETH“ schickt)
      ETH:   { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", coingeckoId: "weth" },
      WETH:  { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", coingeckoId: "weth" },
    },
  },
};

// Normalisierung eingehender Chain-Namen
const CHAIN_ALIAS = {
  ETH: "eth",
  ETHEREUM: "eth",
  BSC: "bnb",
  BNB: "bnb",
  BINANCE: "bnb",
  POLYGON: "matic",
  MATIC: "matic",
};

/* 2) Minimaler ERC20-ABI */
const ERC20_ABI = [
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

function App() {
  /* 3) URL-Parameter (orderId + token) */
  const [orderId, setOrderId] = useState("");
  const [token, setToken] = useState("");

  /* 4) Bestelldaten vom Backend */
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [cartValueEUR, setCartValueEUR] = useState(0);

  /* 5) Auswahl + State */
  const [chainKey, setChainKey] = useState("");  // normalisiert (eth/bnb/matic)
  const [coinKey, setCoinKey] = useState("");    // z.B. USDT
  const [userId, setUserId] = useState("");

  const [validating, setValidating] = useState(true);
  const [validOrder, setValidOrder] = useState(false);

  const [priceEUR, setPriceEUR] = useState(null);
  const [cryptoAmount, setCryptoAmount] = useState("");

  // Timer 10 Minuten
  const [timer, setTimer] = useState(600);
  const [timerActive, setTimerActive] = useState(false);

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(null);

  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");

  // Web3Modal: Cache aus, damit nicht Coinbase hängen bleibt
  const web3Modal = useMemo(() => new Web3Modal({ cacheProvider: false }), []);

  /* ─────────────────────────────────────────────
     6) URL-Params lesen + GET-Validierung
     ───────────────────────────────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get("orderId");
    const tokenParam = params.get("token");
    const failUrl = params.get("fail") || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";

    if (!orderIdParam || !tokenParam) {
      const url = `${failUrl}${failUrl.includes('?') ? '&' : '?'}orderId=${encodeURIComponent(orderIdParam || '')}&reason=missing_params`;
      window.location.href = url;
      return;
    }

    setOrderId(orderIdParam);
    setToken(tokenParam);

    (async () => {
      try {
        const res = await fetch(
          `https://www.goldsilverstuff.com/_functions/web3zahlung?orderId=${encodeURIComponent(orderIdParam)}&token=${encodeURIComponent(tokenParam)}`,
          { method: "GET", mode: "cors" } 
        );
        if (!res.ok) {
          const url = `${failUrl}${failUrl.includes('?') ? '&' : '?'}orderId=${encodeURIComponent(orderIdParam)}&reason=verify_failed_${res.status}`;
          window.location.href = url;
          return;
        }
        const data = await res.json();

        // Normalisiere Chain-Key
        const normChain = CHAIN_ALIAS[(data.chain || "").toUpperCase()] || (data.chain || "").toLowerCase();
        setChainKey(normChain);
        setCoinKey((data.coin || "").toUpperCase());

        setCustomerName(data.name || "");
        setCustomerEmail(data.email || "");
        setCartValueEUR(Number(data.warenkorbWert || 0));
        setUserId(data.userId || "");

        // Bestellung ist valide
        setValidOrder(true);

        // Timer (10 Min) starten, sobald valide
        setTimer(600);
        setTimerActive(true);
      } catch (e) {
        console.error("Validierungsfehler:", e);
        const url = `${failUrl}${failUrl.includes('?') ? '&' : '?'}orderId=${encodeURIComponent(orderIdParam)}&reason=verify_error`;
        window.location.href = url;
      } finally {
        setValidating(false);
      }
    })();
  }, []);

  /* ─────────────────────────────────────────────
     7) CoinGecko-Preis abrufen (nur bei validOrder)
     Guarded, damit kein "undefined.coins" mehr auftritt
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!validOrder) return;

    async function fetchPrice() {
      try {
        if (!chainKey || !coinKey) return;

        const chainObj = CHAINS[chainKey];
        if (!chainObj) {
          console.warn("[PRICE] Unbekannte Chain:", chainKey);
          setError(`Unbekannte Chain: ${chainKey}`);
          return;
        }
        const coinObj = chainObj.coins[coinKey];
        if (!coinObj) {
          console.warn("[PRICE] Coin nicht auf Chain verfügbar:", chainKey, coinKey);
          setError(`Coin ${coinKey} auf ${chainObj.name} nicht unterstützt`);
          return;
        }

        const coinId = coinObj.coingeckoId;
        if (!coinId) {
          setError("Kein Preis-Lookup für diesen Coin");
          return;
        }

        const res = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`
        );
        const eur = res.data[coinId]?.eur;
        setPriceEUR(eur || null);

        if (eur && cartValueEUR > 0) {
          setCryptoAmount((cartValueEUR / eur).toFixed(6));
        }
      } catch (e) {
        console.error("Preisabruf-Fehler:", e);
        setError("Fehler beim Abrufen des Kurses");
      }
    }

    fetchPrice();
  }, [validOrder, chainKey, coinKey, cartValueEUR]);

  /* ─────────────────────────────────────────────
     8) Countdown (10 Minuten)
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      handleAbort();
      return;
    }
    const t = setTimeout(() => setTimer((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer, timerActive]);

  function handleAbort() {
    setTimerActive(false);
    setTxStatus("");
    setError("Zeit abgelaufen. Zahlung abgebrochen.");
    const params = new URLSearchParams(window.location.search);
    const fail = params.get("fail") || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
    const url = `${fail}${fail.includes('?') ? '&' : '?'}orderId=${encodeURIComponent(orderId || '')}&reason=timeout`;
    window.location.href = url;
  }

  /* ─────────────────────────────────────────────
     9) Wallet verbinden – MetaMask priorisieren
     ───────────────────────────────────────────── */
  async function connectWallet() {
    try {
      setError("");
      setTxStatus("");

      // 1) Wenn mehrere Provider injiziert sind → MetaMask bevorzugen
      let ext = null;
      const eth = typeof window !== 'undefined' ? window.ethereum : null;

      if (eth && Array.isArray(eth.providers) && eth.providers.length) {
        ext = eth.providers.find(p => p.isMetaMask) || eth.providers[0];
      } else if (eth) {
        ext = eth;
      }

      let provInstance;
      if (ext) {
        // Direkter Connect (MetaMask bevorzugt)
        await ext.request({ method: "eth_requestAccounts" });
        provInstance = new ethers.BrowserProvider(ext);
      } else {
        // Fallback: Web3Modal (z. B. WalletConnect/Mobile)
        const instance = await web3Modal.connect();
        provInstance = new ethers.BrowserProvider(instance);
      }

      const signerInstance = await provInstance.getSigner();
      const addr = await signerInstance.getAddress();
      const net = await provInstance.getNetwork();

      setProvider(provInstance);
      setSigner(signerInstance);
      setAddress(addr);
      setChainId(Number(net.chainId));

      // Events (nur wenn EIP-1193 Provider vorhanden)
      const base = ext || (typeof window !== 'undefined' ? window.ethereum : null);
      if (base && base.on) {
        base.on("accountsChanged", (accounts) => setAddress(accounts?.[0] || ""));
        base.on("chainChanged", (hex) => setChainId(parseInt(hex, 16)));
        base.on("disconnect", disconnectWallet);
      }
    } catch (e) {
      console.error("connectWallet-Fehler:", e);
      setError("Wallet-Verbindung fehlgeschlagen");
    }
  }

  function disconnectWallet() {
    try { web3Modal.clearCachedProvider?.(); } catch(_) {}
    setProvider(null);
    setSigner(null);
    setAddress("");
    setChainId(null);
    setTxStatus("");
    setError("");
  }

  /* ─────────────────────────────────────────────
     10) Zahlung ausführen
     ───────────────────────────────────────────── */
  async function sendPayment() {
    setError("");
    setTxStatus("");

    const url = new URL(window.location.href);
    const successURL = url.searchParams.get("success") || "https://www.goldsilverstuff.com/zahlung-erfolgreich";
    const failURL    = url.searchParams.get("fail")    || "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";

    if (!signer) { setError("Bitte Wallet verbinden"); return; }

    const chainConf = CHAINS[chainKey];
    if (!chainConf) { setError(`Unbekannte Chain (${chainKey})`); return; }

    if (Number(chainId) !== Number(chainConf.chainId)) {
      setError(`Bitte Wallet auf ${chainConf.name} umstellen`);
      return;
    }

    if (!cryptoAmount || isNaN(Number(cryptoAmount)) || Number(cryptoAmount) <= 0) {
      setError("Ungültiger Betrag");
      return;
    }

    // --- VALIDIERUNGEN ---
    const coinInfo = chainConf.coins?.[coinKey];
    if (!coinInfo) { setError(`Coin ${coinKey} auf ${chainKey} nicht konfiguriert`); return; }

    let recipient;
    try {
      const raw = String(chainConf.recipient || "")
        .trim()
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, ""); // Zero-width chars entfernen
      recipient = ethers.getAddress(raw.toLowerCase()); // normalisieren + Checksummenadresse
    } catch (e) {
      console.error("[PAY] Invalid recipient (normalized fail):", chainConf.recipient, e);
      setError("Interne Empfängeradresse ungültig. Bitte Support kontaktieren.");
      return;
    }

    let tokenAddr = null;
    if (coinInfo.address !== null) {
      const rawToken = String(coinInfo.address || "")
        .trim()
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "");
      if (!ethers.isAddress(rawToken)) {
        console.error("[PAY] Invalid token address:", rawToken);
        setError(`Token-Adresse für ${coinKey} ungültig`);
        return;
      }
      tokenAddr = ethers.getAddress(rawToken.toLowerCase());
    }

    console.log("[PAY] tx debug", {
      chainKey, coinKey, chainId, expectedChainId: chainConf.chainId,
      recipient, tokenAddr, cryptoAmount
    });

    try {
      // kleine Signatur zur Absicherung
      const message = `Zahlung ${cartValueEUR} EUR in ${cryptoAmount} ${coinKey} (Order ${orderId})`;
      await signer.signMessage(message);

      setTxStatus("Transaktion läuft…");
      let txResponse;

      if (tokenAddr === null) {
        // Native Transfer
        txResponse = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther(cryptoAmount),
        });
      } else {
        // ERC-20 Transfer
        const contract = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const value    = ethers.parseUnits(cryptoAmount, decimals);
        txResponse     = await contract.transfer(recipient, value);
      }

      const receipt = await txResponse.wait();
      const txHash  = receipt.transactionHash;
      setTxStatus("Zahlung bestätigt!");

      // Backend informieren (robust + CORS + Retry)
      const payload = {
        orderId, token,
        coin: coinKey, chain: chainKey,
        walletAdresse: address,
        cryptoAmount,
        txHash
      };

      async function postWebhook() {
        return fetch("https://www.goldsilverstuff.com/_functions/web3zahlung", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          mode: "cors",
          keepalive: true, // hilft beim Redirect
          body: JSON.stringify(payload),
        });
      }

      let posted = false;
      try {
        // 1. Versuch
        const r1 = await postWebhook();
        posted = r1.ok;

        // kurzer Retry, falls Netzwerk zickt (CORS/Preflight/Timing)
        if (!posted) {
          await new Promise(res => setTimeout(res, 600));
          const r2 = await postWebhook();
          posted = r2.ok;
        }
      } catch (_) {
        // ignorieren – On-Chain ist bezahlt
      }

      // Immer zur Success-Seite; tx & posted-Flag mitgeben
      const sep1 = successURL.includes("?") ? "&" : "?";
      window.location.href = `${successURL}${sep1}orderId=${encodeURIComponent(orderId)}&tx=${encodeURIComponent(txHash)}&posted=${posted ? 1 : 0}`;

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

  /* ─────────────────────────────────────────────
     11) UI
     ───────────────────────────────────────────── */
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
      <p><strong>Warenkorb:</strong> {cartValueEUR.toFixed(2)} EUR</p>

      <p>
        <strong>Auswahl:</strong>{" "}
        {coinKey || "—"} {chainObj ? `@ ${chainObj.name}` : (chainKey || "")}
      </p>

      <p><strong>Zeit verbleibend:</strong> {timerActive ? `${timer}s` : <span style={{ color: "#c00" }}>Inaktiv</span>}</p>

      <p>
        <strong>Aktueller Preis (EUR):</strong>{" "}
        {priceEUR ? `${priceEUR.toFixed(2)} EUR` : "Lade..."}
      </p>
      <p>
        <strong>Betrag in {coinKey || "—"}:</strong>{" "}
        {cryptoAmount ? `${cryptoAmount} ${coinKey}` : "—"}
      </p>

      <br />

      {!signer ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", cursor: "pointer" }}>
          Jetzt mit Wallet bezahlen
        </button>
      ) : (
        <>
          <p>
            <strong>Verbunden mit:</strong>{" "}
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "-"}
          </p>
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
        ⚠️ Kryptowährungen unterliegen starken Kursschwankungen und Zahlungen sind unwiderruflich. Bitte prüfe Chain &
        Coin sorgfältig. Wir haften nicht für Fehlangaben oder falsche Wahl der Chain.
      </p>
    </div>
  );
}

export default App;