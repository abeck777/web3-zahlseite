import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import Web3Modal from "web3modal";
import axios from "axios";

// 1) Definiere deine Chains & Tokens
const chains = {
  eth: {
    name: "Ethereum",
    chainId: 1,
    coins: {
      ETH: { address: null, coingeckoId: "ethereum" },
      USDC: {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48",
        coingeckoId: "usd-coin",
      },
      USDT: {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        coingeckoId: "tether",
      },
      DAI: {
        address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        coingeckoId: "dai",
      },
      SHIB: {
        address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
        coingeckoId: "shiba-inu",
      },
      LINK: {
        address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
        coingeckoId: "chainlink",
      },
      AAVE: {
        address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
        coingeckoId: "aave",
      },
      GRT: {
        address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7",
        coingeckoId: "the-graph",
      },
    },
  },
  bnb: {
    name: "BNB Chain",
    chainId: 56,
    coins: {
      BNB: { address: null, coingeckoId: "binancecoin" },
      USDT: {
        address: "0x55d398326f99059fF775485246999027B3197955",
        coingeckoId: "tether",
      },
      USDC: {
        address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
        coingeckoId: "usd-coin",
      },
    },
  },
  matic: {
    name: "Polygon",
    chainId: 137,
    coins: {
      MATIC: { address: null, coingeckoId: "matic-network" },
      USDT: {
        address: "0x3813e82e6f7098b9583FC0F33a962D02018B6803",
        coingeckoId: "tether",
      },
      USDC: {
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        coingeckoId: "usd-coin",
      },
      DAI: {
        address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
        coingeckoId: "dai",
      },
      LINK: {
        address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39",
        coingeckoId: "chainlink",
      },
      AAVE: {
        address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b",
        coingeckoId: "aave",
      },
    },
  },
};

// 2) Minimaler ERC20-ABI fürs Token-Transfer
const ERC20_ABI = [
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

function App() {
  // 3) URL-Parameter (orderId + token) auslesen
  const [orderId, setOrderId] = useState("");
  const [token, setToken] = useState("");
  const [chainKey, setChainKey] = useState("")
  const [coinKey, setCoinKey] = useState("")
  const [userId, setUserId] = useState("")

  // 4) Bestelldaten vom Backend (erst nach GET-Validierung)
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [cartValueEUR, setCartValueEUR] = useState(0);

  // 5) Weitere State-Variablen
  const [validating, setValidating] = useState(true); // Während GET-Request läuft
  const [validOrder, setValidOrder] = useState(false);

  const selectedChain = chainKey;
  const selectedCoin = coinKey;
  const [priceEUR, setPriceEUR] = useState(null);
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [timer, setTimer] = useState(180); // 3 Minuten
  const [timerActive, setTimerActive] = useState(false);

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(null);

  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");

  const web3Modal = new Web3Modal({ cacheProvider: true });

  // ───────────────────────────────────────────────────────────────────
  // 6) 1. useEffect: Nur orderId + token aus URL einlesen und validieren
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get("orderId");
    const tokenParam = params.get("token");

    if (!orderIdParam || !tokenParam) {
      // Fehlende Parameter → sofort auf Fehlerseite
      window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagene";
      return;
    }

    setOrderId(orderIdParam);
    setToken(tokenParam);

    // Jetzt zum Backend gehen und validieren
    (async () => {
      try {
        const res = await fetch(
          `https://www.goldsilverstuff.com/_functions/web3zahlung?orderId=${encodeURIComponent(
            orderIdParam
          )}&token=${encodeURIComponent(tokenParam)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );
        if (!res.ok) {
          // Nicht 200 OK → ungültige Bestellung oder Token
          window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
          return;
        }
        const data = await res.json();

        if (!data.chain || !data,coin) {
          window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
          return;
        }
        // data enthält { orderId, name, email, warenkorbWert }
        setCustomerName(data.name);
        setCustomerEmail(data.email);
        setCartValueEUR(data.warenkorbWert);
        setChainKey(data.chain)
        setCoinKey(data.coin)
        setUserId(data.userId)
        setValidOrder(true);
      } catch (e) {
        console.error("Validierungsfehler:", e);
        window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
      } finally {
        setValidating(false);
      }
    })();
  }, []);

  // 7) 2. useEffect: CoinGecko-Live-Preisabruf (läuft nur, wenn Bestellung validiert ist)
  useEffect(() => {
    if (!validOrder) return;
    async function fetchPrice() {
      try {
        const coinId = chains[selectedChain].coins[selectedCoin].coingeckoId;
        const res = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`
        );
        const eur = res.data[coinId]?.eur;
        setPriceEUR(eur);
        if (eur && cartValueEUR > 0) {
          setCryptoAmount((cartValueEUR / eur).toFixed(6));
        }
      } catch (e) {
        console.error("Preisabruf-Fehler:", e);
        setError("Fehler beim Abrufen des Kurses");
      }
    }
    fetchPrice();
  }, [validOrder, selectedChain, selectedCoin, cartValueEUR]);

  // 8) 3. Countdown-Timer (tickt jede Sekunde, wenn validOrder=true)
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      handleAbort();
      return;
    }
    const interval = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(interval);
  }, [timer, timerActive]);

  // 9) Wallet verbinden
  async function connectWallet() {
    try {
      const instance = await web3Modal.connect();
      const prov = new ethers.BrowserProvider(instance);
      const signerInstance = await prov.getSigner();
      const addr = await signerInstance.getAddress();
      const network = await prov.getNetwork();

      setProvider(prov);
      setSigner(signerInstance);
      setAddress(addr);
      setChainId(network.chainId);

      // Timer starten
      setTimer(180);
      setTimerActive(true);

      // Event-Listener
      instance.on("accountsChanged", (accounts) => setAddress(accounts[0]));
      instance.on("chainChanged", (hex) => setChainId(parseInt(hex, 16)));
      instance.on("disconnect", disconnectWallet);
    } catch (e) {
      console.error("connectWallet-Fehler:", e);
      setError("Wallet-Verbindung fehlgeschlagen");
    }
  }

  // 10) Wallet trennen
  function disconnectWallet() {
    web3Modal.clearCachedProvider();
    setProvider(null);
    setSigner(null);
    setAddress("");
    setChainId(null);
    setTimerActive(false);
    setTimer(180);
    setTxStatus("");
    setError("");
  }

  // 11) Timer-Abbruch (falls Zeit abläuft)
  function handleAbort() {
    setTimerActive(false);
    setTxStatus("");
    setError("Zeit abgelaufen. Zahlung abgebrochen.");
    window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
  }

  // 12) Zahlung absenden & POST-Request an Wix (nur wenn validOrder=false ist, alles validiert)
  async function sendPayment() {
    setError("");
    setTxStatus("");

    if (!signer) {
      setError("Bitte Wallet verbinden");
      return;
    }
    if (chainId !== chains[selectedChain].chainId) {
      setError(`Bitte Wallet auf ${chains[selectedChain].name} umstellen`);
      return;
    }
    if (!cryptoAmount || isNaN(cryptoAmount) || Number(cryptoAmount) <= 0) {
      setError("Ungültiger Betrag");
      return;
    }

    try {
      // 1) Signatur-Nachricht erstellen und signen
      const message = `Zahlung ${cartValueEUR} EUR in ${cryptoAmount} ${selectedCoin}`;
      await signer.signMessage(message);

      // 2) Transaktion ausführen
      const recipient = "0xAD335dF958dDB7a9ce7073c38fE31CaC81111DAb";
      const coinInfo = chains[selectedChain].coins[selectedCoin];
      let txResponse;

      setTxStatus("Transaktion läuft...");
      if (coinInfo.address === null) {
        // Native Coin (ETH/BNB/MATIC)
        txResponse = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther(cryptoAmount),
        });
      } else {
        // ERC20-Token
        const contract = new ethers.Contract(coinInfo.address, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const value = ethers.parseUnits(cryptoAmount, decimals);
        txResponse = await contract.transfer(recipient, value);
      }

      // 3) Auf Bestätigung der Transaktion warten
      const receipt = await txResponse.wait();
      const txHash = receipt.transactionHash;

      setTxStatus("Zahlung bestätigt!");

      // 4) Daten (inkl. orderId + token) an dein Wix-Backend senden
      await fetch("https://www.goldsilverstuff.com/_functions/web3zahlung", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId: orderId,
          token: token,
          coin: selectedCoin,
          chain: selectedChain,
          walletAdresse: address,
          cryptoAmount: cryptoAmount,
          txHash: txHash
        }),
      });

      // 5) Redirect bei Erfolg
      window.location.href = "https://www.goldsilverstuff.com/zahlung-erfolgreich";
    } catch (e) {
      console.error("sendPayment-Fehler:", e);
      setError("Zahlung fehlgeschlagen");
      // Redirect bei Fehler
      window.location.href = "https://www.goldsilverstuff.com/zahlung-fehlgeschlagen";
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 13) JSX-Rendering

  // Solange validating=true, noch nichts anzeigen (oder ein Loading)
  if (validating) {
    return (
      <div style={{ textAlign: "center", marginTop: 50 }}>
        <p>Lade Bestelldaten…</p>
      </div>
    );
  }

  // Wenn validOrder=false, würde bereits redirect passieren. Hier gilt: validOrder===true
  return (
    <div style={{ maxWidth: 480, margin: "auto", padding: 20, fontFamily: "Arial, sans-serif" }}>
      {/* Firmenlogo */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img src="/logo.png" alt="Firmenlogo" style={{ maxWidth: 200 }} />
      </div>

      <h2>Web3 Checkout</h2>

      {/* Kunden- und Bestelldaten */}
      {customerName && (
        <p>
          <strong>Kunde:</strong> {customerName}
        </p>
      )}
      {customerEmail && (
        <p>
          <strong>E-Mail:</strong> {customerEmail}
        </p>
      )}
      {orderId && (
        <p>
          <strong>Bestell-ID:</strong> {orderId}
        </p>
      )}
      <p>
        <strong>Warenkorb:</strong> {cartValueEUR.toFixed(2)} EUR
      </p>
      <p>
        <strong>Zeit verbleibend:</strong> {timerActive ? `${timer}s` : <span style={{ color: "#c00" }}>Inaktiv</span>}
      </p>

      {/* Live-Umrechnung anzeigen */}
      <p>
        <strong>Aktueller Preis (EUR):</strong> {priceEUR ? `${priceEUR.toFixed(2)} EUR` : "Lade..."}
      </p>
      <p>
        <strong>Betrag in {selectedCoin}:</strong> {cryptoAmount ? `${cryptoAmount} ${selectedCoin}` : "—"}
      </p>

      <br />

      {/* Wallet-Verbindung & Zahlung */}
      {!signer ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px", cursor: "pointer" }}>
          Wallet verbinden
        </button>
      ) : (
        <>
          <p>
            <strong>Verbunden mit:</strong> {address.slice(0, 6)}…{address.slice(-4)}
          </p>
          <button onClick={sendPayment} style={{ padding: "10px 20px", cursor: "pointer" }}>
            Zahlung senden
          </button>
          <button onClick={disconnectWallet} style={{ marginLeft: 10, padding: "10px 20px", cursor: "pointer" }}>
            Wallet trennen
          </button>
        </>
      )}

      <br />
      <br />

      {/* Statusmeldungen */}
      {txStatus && <p style={{ color: "green" }}>{txStatus}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <hr />

      <p style={{ fontSize: "0.8em", color: "#555" }}>
        ⚠️ Kryptowährungen unterliegen starken Kursschwankungen und Zahlungen sind unwiderruflich. Bitte prüfe Chain &
        Coin sorgfältig.
      </p>
    </div>
  );
}

export default App;