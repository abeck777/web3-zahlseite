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
      USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48", coingeckoId: "usd-coin" },
      USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", coingeckoId: "tether" },
      DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", coingeckoId: "dai" },
      SHIB: { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", coingeckoId: "shiba-inu" },
      LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", coingeckoId: "chainlink" },
      AAVE: { address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", coingeckoId: "aave" },
      GRT: { address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7", coingeckoId: "the-graph" },
    },
  },
  bnb: {
    name: "BNB Chain",
    chainId: 56,
    coins: {
      BNB: { address: null, coingeckoId: "binancecoin" },
      USDT: { address: "0x55d398326f99059fF775485246999027B3197955", coingeckoId: "tether" },
      USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", coingeckoId: "usd-coin" },
    },
  },
  matic: {
    name: "Polygon",
    chainId: 137,
    coins: {
      MATIC: { address: null, coingeckoId: "matic-network" },
      USDT: { address: "0x3813e82e6f7098b9583FC0F33a962D02018B6803", coingeckoId: "tether" },
      USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", coingeckoId: "usd-coin" },
      DAI: { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", coingeckoId: "dai" },
      LINK: { address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", coingeckoId: "chainlink" },
      AAVE: { address: "0xd6df932a45c0f255f85145f286ea0b292b21c90b", coingeckoId: "aave" },
    },
  },
};

// 2) Minimaler ERC20-ABI fürs Token-Transfer
const ERC20_ABI = [
  "function transfer(address to, uint amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

function App() {
  // --- State-Variablen ---
  const [selectedChain, setSelectedChain] = useState("eth");
  const [selectedCoin, setSelectedCoin] = useState("ETH");
  const [cartValueEUR] = useState(129.95); // Hardcoded Warenkorbwert
  const [priceEUR, setPriceEUR] = useState(null);
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [timer, setTimer] = useState(180); // 3 Minuten in Sekunden
  const [timerActive, setTimerActive] = useState(false);

  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(null);

  const [txStatus, setTxStatus] = useState("");
  const [error, setError] = useState("");

  const web3Modal = new Web3Modal({ cacheProvider: true });

  // 3) Countdown-Timer-Logik (tickt jede Sekunde)
  useEffect(() => {
    if (!timerActive) return;
    if (timer <= 0) {
      // Timer abgelaufen → Abbruch
      handleAbort();
      return;
    }
    const interval = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(interval);
  }, [timer, timerActive]);

  // 4) CoinGecko-Abruf: Live-Preis in EUR
  useEffect(() => {
    async function fetchPrice() {
      try {
        const coinId = chains[selectedChain].coins[selectedCoin].coingeckoId;
        const res = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=eur`
        );
        const eur = res.data[coinId]?.eur;
        setPriceEUR(eur);
        if (eur) {
          setCryptoAmount((cartValueEUR / eur).toFixed(6));
        }
      } catch (e) {
        console.error(e);
        setError("Fehler beim Abrufen des Kurses");
      }
    }
    setPriceEUR(null);
    setCryptoAmount("");
    fetchPrice();
  }, [selectedChain, selectedCoin]);

  // 5) Wallet-Verbindung
  async function connectWallet() {
    try {
      const instance = await web3Modal.connect();
      const prov = new ethers.BrowserProvider(instance);
      const signer = await prov.getSigner();
      const addr = await signer.getAddress();
      const network = await prov.getNetwork();

      setProvider(prov);
      setSigner(signer);
      setAddress(addr);
      setChainId(network.chainId);

      // Reset & starte Timer
      setTimer(180);
      setTimerActive(true);

      instance.on("accountsChanged", (accounts) => {
        setAddress(accounts[0]);
      });
      instance.on("chainChanged", (hex) => {
        setChainId(parseInt(hex, 16));
      });
      instance.on("disconnect", disconnectWallet);
    } catch {
      setError("Wallet-Verbindung fehlgeschlagen");
    }
  }

  function disconnectWallet() {
    web3Modal.clearCachedProvider();
    setProvider(null);
    setSigner(null);
    setAddress("");
    setChainId(null);
    setTxStatus("");
    setError("");
    setTimerActive(false);
    setTimer(180);
  }

  // 6) Abbruch-Routine (Timer oder Fenster schließen)
  function handleAbort() {
    setTimerActive(false);
    setTxStatus("");
    setError("Zeit abgelaufen. Zahlung abgebrochen.");
    window.location.href = "/zahlung-abgebrochen"; // Passe an deine URL an
  }

  // 7) Zahlung absenden
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
      // Signiere zuerst eine Bestätigungsnachricht
      const message = `Zahlung ${cartValueEUR} EUR in ${cryptoAmount} ${selectedCoin}`;
      await signer.signMessage(message);

      const recipient = "DEINE_WALLET_ADRESSE_HIER";
      const coinInfo = chains[selectedChain].coins[selectedCoin];

      setTxStatus("Transaktion läuft...");
      if (coinInfo.address === null) {
        // Native Coin (z. B. ETH, BNB, MATIC)
        const tx = await signer.sendTransaction({
          to: recipient,
          value: ethers.parseEther(cryptoAmount),
        });
        await tx.wait();
      } else {
        // ERC20 Token
        const contract = new ethers.Contract(coinInfo.address, ERC20_ABI, signer);
        const decimals = await contract.decimals();
        const value = ethers.parseUnits(cryptoAmount, decimals);
        const tx = await contract.transfer(recipient, value);
        await tx.wait();
      }
      setTxStatus("Zahlung bestätigt!");
      window.location.href = "/zahlung-erfolgreich"; // Passe an deine URL an
    } catch (e) {
      console.error(e);
      setError("Zahlung fehlgeschlagen");
      setTxStatus("");
      window.location.href = "/zahlung-abgebrochen";
    }
  }

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "auto",
        padding: 20,
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* 8) Firmenlogo */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <img
          src="/logo.png"
          alt="Firmenlogo"
          style={{ maxWidth: 200 }}
        />
      </div>

      <h2>Web3 Premium Checkout</h2>

      {/* Warenkorbwert & Timer */}
      <p>
        <strong>Warenkorb:</strong> {cartValueEUR.toFixed(2)} EUR
      </p>
      <p>
        <strong>Zeit verbleibend:</strong>{" "}
        {timerActive ? (
          <>{timer}s</>
        ) : (
          <span style={{ color: "#c00" }}>Inaktiv</span>
        )}
      </p>

      {/* Chain-Auswahl */}
      <label>
        Chain auswählen:&nbsp;
        <select
          value={selectedChain}
          onChange={(e) => {
            setSelectedChain(e.target.value);
            setSelectedCoin(
              Object.keys(chains[e.target.value].coins)[0]
            );
          }}
        >
          {Object.keys(chains).map((key) => (
            <option key={key} value={key}>
              {chains[key].name}
            </option>
          ))}
        </select>
      </label>

      <br />
      <br />

      {/* Coin-Auswahl */}
      <label>
        Coin auswählen:&nbsp;
        <select
          value={selectedCoin}
          onChange={(e) => setSelectedCoin(e.target.value)}
        >
          {Object.keys(chains[selectedChain].coins).map(
            (coin) => (
              <option key={coin} value={coin}>
                {coin}
              </option>
            )
          )}
        </select>
      </label>

      <br />
      <br />

      {/* Live-Umrechnung */}
      <p>
        <strong>Aktueller Preis:</strong>{" "}
        {priceEUR ? `${priceEUR.toFixed(2)} EUR` : "Lade..."}
      </p>
      <p>
        <strong>Betrag in {selectedCoin}:</strong>{" "}
        {cryptoAmount ? `${cryptoAmount} ${selectedCoin}` : "—"}
      </p>

      <br />

      {/* Wallet-Verbindung & Bezahl-Button */}
      {!signer ? (
        <button onClick={connectWallet} style={{ padding: "10px 20px" }}>
          Wallet verbinden
        </button>
      ) : (
        <>
          <p>
            <strong>Verbunden:</strong>{" "}
            {address.substring(0, 6)}…{address.slice(-4)}
          </p>
          <button onClick={sendPayment} style={{ padding: "10px 20px" }}>
            Zahlung senden
          </button>
          <button
            onClick={disconnectWallet}
            style={{ marginLeft: 10, padding: "10px 20px" }}
          >
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
        ⚠️ Kryptowährungen schwanken im Kurs. Zahlungen sind
        unwiderruflich. Bitte prüfe Chain & Coin sorgfältig.
      </p>
    </div>
  );
}

export default App;
