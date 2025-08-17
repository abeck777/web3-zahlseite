// pages/index.js
import { useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';

// === Empfänger-Wallet (dein Treasury) ===
const RECIPIENT = '0x3cfDe8c9a3F1804aa9828BE38a966762d98DCeD1';

// === Chains & Token-Registry ===
// Keys MÜSSEN zu ?chain=ETH|BSC|POLYGON passen
const CHAINS = {
  ETH: {
    name: 'Ethereum',
    chainIdDec: 1,
    chainIdHex: '0x1',
    native: 'ETH',
    tokens: {
      // Offizielle Mainnet-Contracts:
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', coingeckoId: 'tether' },
      USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', coingeckoId: 'usd-coin' },
      DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', coingeckoId: 'dai' },
      LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', coingeckoId: 'chainlink' },
      AAVE: { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', coingeckoId: 'aave' },
      SHIB: { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', coingeckoId: 'shiba-inu' },
      GRT:  { address: '0xC944E90C64B2c07662A292be6244BDf05Cda44a7', coingeckoId: 'the-graph' },
    },
    coingeckoIds: { ETH: 'ethereum' },
  },
  BSC: {
    name: 'BNB Chain',
    chainIdDec: 56,
    chainIdHex: '0x38',
    native: 'BNB',
    tokens: {
      USDT: { address: '0x55d398326f99059fF775485246999027B3197955', coingeckoId: 'tether' },
      USDC: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', coingeckoId: 'usd-coin' },
      DAI:  { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', coingeckoId: 'dai' }, // bridged
    },
    coingeckoIds: { BNB: 'binancecoin' },
  },
  POLYGON: {
    name: 'Polygon',
    chainIdDec: 137,
    chainIdHex: '0x89',
    native: 'MATIC',
    tokens: {
      USDT: { address: '0xC2132D05D31c914a87C6611C10748AaCbC532EFD', coingeckoId: 'tether' },
      USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', coingeckoId: 'usd-coin' },
      DAI:  { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', coingeckoId: 'dai' },
      LINK: { address: '0x53E0bca35eC356BD5ddDFebbD1FC0fD03Fabad39', coingeckoId: 'chainlink' },
      AAVE: { address: '0xD6DF932A45C0f255f85145F286eA0b292B21C90B', coingeckoId: 'aave' },
      MATIC: { address: null, coingeckoId: 'matic-network' } // native alias
    },
    coingeckoIds: { MATIC: 'matic-network' },
  },
};

// Minimal ABI
const ERC20_ABI = [
  'function transfer(address to, uint amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const TEN_MIN = 600; // Sekunden

export default function IndexPage() {
  const [st, setSt] = useState({
    loading: true,
    verified: false,
    err: '',
    // vom Landing
    orderId: '',
    token: '',
    amountEur: 0,
    coin: '',
    chain: '',
    wallet: '',
    success: '',
    fail: '',
    dbg: false,
  });

  // Web3 state
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [addr, setAddr] = useState('');
  const [netId, setNetId] = useState(null);

  // Preis & Betrag
  const [eurPerCoin, setEurPerCoin] = useState(null);
  const [cryptoAmount, setCryptoAmount] = useState('');

  // Timer
  const [left, setLeft] = useState(TEN_MIN);
  const timerRef = useRef(null);

  // UI status
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const chainCfg = useMemo(() => CHAINS[st.chain] || null, [st.chain]);

  // ===== Read params + verify on mount =====
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const params = {
      orderId: sp.get('orderId') || '',
      token:   sp.get('token')   || '',
      amountEur:   Number(sp.get('amountEur') || 0),
      amountCents: Number(sp.get('amountCents') || 0),
      coin:   (sp.get('coin')  || '').toUpperCase(),
      chain:  (sp.get('chain') || '').toUpperCase(),
      wallet: sp.get('wallet') || '',
      success: sp.get('success') || '',
      fail:    sp.get('fail')    || '',
      dbg: (sp.get('dbg') || '') === '1'
    };

    // quick sanity
    if (!params.orderId || !params.token || !params.fail) {
      const url = params.fail || `https://www.goldsilverstuff.com/zahlung-fehlgeschlagen?orderId=${encodeURIComponent(params.orderId)}&reason=missing_params`;
      window.location.replace(url);
      return;
    }

    // Verify über Proxy (kein CORS)
    fetch(`/api/web3zahlung?orderId=${encodeURIComponent(params.orderId)}&token=${encodeURIComponent(params.token)}`)
      .then(async r => {
        if (!r.ok) {
          const url = `${params.fail}${params.fail.includes('?')?'&':'?'}orderId=${encodeURIComponent(params.orderId)}&reason=verify_failed_${r.status}`;
          window.location.replace(url);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        // verified ✅
        setSt(s => ({
          ...s,
          loading: false,
          verified: true,
          err: '',
          ...params
        }));
        // Timer starten
        startTimer();
      })
      .catch(e => {
        const url = `${params.fail}${params.fail.includes('?')?'&':'?'}orderId=${encodeURIComponent(params.orderId)}&reason=verify_error`;
        window.location.replace(url);
      });

    // cleanup timer on unmount
    return () => stopTimer();
  }, []);

  // ===== Timer =====
  function startTimer(){
    stopTimer();
    setLeft(TEN_MIN);
    timerRef.current = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) {
          stopTimer();
          // Auto-Abbruch
          const url = st.fail
            ? `${st.fail}${st.fail.includes('?')?'&':'?'}orderId=${encodeURIComponent(st.orderId)}&reason=timeout`
            : 'https://www.goldsilverstuff.com/zahlung-fehlgeschlagen';
          window.location.replace(url);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }
  function stopTimer(){
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }
  const leftMMSS = useMemo(() => {
    const m = Math.floor(left/60).toString().padStart(2,'0');
    const s = (left%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }, [left]);

  // ===== Preis laden & Betrag rechnen =====
  useEffect(() => {
    if (!st.verified || !chainCfg) return;
    const wantNative = st.coin && st.coin === chainCfg.native;
    const geckoId = wantNative
      ? (chainCfg.coingeckoIds && chainCfg.coingeckoIds[st.coin])
      : (chainCfg.tokens?.[st.coin]?.coingeckoId);

    if (!geckoId || !st.amountEur) return;

    (async () => {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(geckoId)}&vs_currencies=eur`);
        const j = await r.json();
        const eur = j?.[geckoId]?.eur;
        if (!eur) return;
        setEurPerCoin(eur);
        setCryptoAmount((st.amountEur / eur).toFixed(6));
      } catch (_) {}
    })();
  }, [st.verified, st.chain, st.coin, st.amountEur, chainCfg]);

  // ===== Wallet connect (MetaMask/injected only) =====
  async function connect(){
    try {
      if (!window.ethereum) {
        window.open('https://metamask.io/download/', '_blank');
        return;
      }
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send('eth_requestAccounts', []);
      const s = await prov.getSigner();
      const a = await s.getAddress();
      const net = await prov.getNetwork();

      setProvider(prov);
      setSigner(s);
      setAddr(a);
      setNetId(Number(net.chainId));

      // Auto Switch wenn falsches Netz
      if (chainCfg && Number(net.chainId) !== chainCfg.chainIdDec) {
        await switchNetwork(chainCfg.chainIdHex);
      }
    } catch (e) {
      setMsg('Wallet-Verbindung fehlgeschlagen');
    }
  }

  async function switchNetwork(chainIdHex){
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }]
      });
      // refresh netId
      const net = await provider.getNetwork();
      setNetId(Number(net.chainId));
    } catch (e) {
      // optional: wallet_addEthereumChain wenn fehlt (hier weggelassen, Mainnets sind bekannt)
      setMsg('Bitte Netzwerk manuell wechseln');
    }
  }

  // ===== PAY =====
  async function payNow(){
    if (!signer || !addr) { setMsg('Bitte zuerst Wallet verbinden'); return; }
    if (!chainCfg)        { setMsg('Ungültige Chain'); return; }
    if (netId !== chainCfg.chainIdDec) {
      await switchNetwork(chainCfg.chainIdHex);
      if (netId !== chainCfg.chainIdDec) return;
    }
    if (!cryptoAmount || Number(cryptoAmount) <= 0) {
      setMsg('Ungültiger Betrag'); return;
    }

    setBusy(true); setMsg('Transaktion wird gesendet …');
    try {
      let tx;
      const wantNative = st.coin === chainCfg.native;

      if (wantNative) {
        tx = await signer.sendTransaction({
          to: RECIPIENT,
          value: ethers.parseEther(cryptoAmount)
        });
      } else {
        const tok = chainCfg.tokens?.[st.coin];
        if (!tok || !tok.address) throw new Error('Token nicht auf dieser Chain verfügbar');
        const ctr = new ethers.Contract(tok.address, ERC20_ABI, signer);
        const dec = await ctr.decimals();
        const val = ethers.parseUnits(cryptoAmount, dec);
        tx = await ctr.transfer(RECIPIENT, val);
      }

      setMsg('Warte auf Bestätigung …');
      const rec = await tx.wait();
      const txHash = rec?.hash || rec?.transactionHash;

      // POST → Wix
      await fetch('/api/web3zahlung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: st.orderId,
          token:   st.token,
          coin:    st.coin,
          chain:   st.chain,
          walletAdresse: addr,
          cryptoAmount,
          txHash
        })
      });

      // Success-Redirect
      const okUrl = st.success
        ? `${st.success}${st.success.includes('?')?'&':'?'}orderId=${encodeURIComponent(st.orderId)}`
        : 'https://www.goldsilverstuff.com/zahlung-erfolgreich';
      window.location.replace(okUrl);
    } catch (e) {
      // Fail-Redirect
      const bad = st.fail
        ? `${st.fail}${st.fail.includes('?')?'&':'?'}orderId=${encodeURIComponent(st.orderId)}&reason=tx_failed`
        : 'https://www.goldsilverstuff.com/zahlung-fehlgeschlagen';
      window.location.replace(bad);
    } finally {
      setBusy(false);
    }
  }

  // ===== DEV: simulate (dbg=1) =====
  async function simulate(ok){
    if (!st.dbg) return;
    if (ok) {
      // so tun als ob – nur POST + Redirect
      await fetch('/api/web3zahlung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: st.orderId,
          token:   st.token,
          coin:    st.coin,
          chain:   st.chain,
          walletAdresse: st.wallet || '0x0',
          cryptoAmount: cryptoAmount || '0',
          txHash: '0xSIMULATED_HASH_DEBUG'
        })
      });
      const okUrl = st.success
        ? `${st.success}${st.success.includes('?')?'&':'?'}orderId=${encodeURIComponent(st.orderId)}`
        : 'https://www.goldsilverstuff.com/zahlung-erfolgreich';
      window.location.replace(okUrl);
    } else {
      const bad = st.fail
        ? `${st.fail}${st.fail.includes('?')?'&':'?'}orderId=${encodeURIComponent(st.orderId)}&reason=simulated_fail`
        : 'https://www.goldsilverstuff.com/zahlung-fehlgeschlagen';
      window.location.replace(bad);
    }
  }

  // ===== RENDER =====
  if (st.loading)   return <div style={{padding:20,fontFamily:'Inter,Arial'}}>Lade Zahlung …</div>;
  if (!st.verified) return <div style={{padding:20,fontFamily:'Inter,Arial'}}>Weiterleitung …</div>;

  const onWrongNet = chainCfg && netId && netId !== chainCfg.chainIdDec;

  return (
    <div style={{maxWidth:520, margin:'40px auto', padding:'24px', fontFamily:'Inter,Arial', border:'1px solid #eee', borderRadius:12}}>
      <div style={{textAlign:'center', marginBottom:12}}>
        <img src="/logo.png" alt="GoldSilverStuff" style={{maxWidth:160}} />
      </div>

      <h2 style={{margin:'6px 0 12px'}}>Web3 Checkout</h2>
      <div style={{fontSize:14, color:'#666', marginBottom:12}}>
        <div><b>Bestell-ID:</b> {st.orderId}</div>
        <div><b>Chain/Coin:</b> {st.chain} / {st.coin}</div>
        <div><b>Betrag:</b> {st.amountEur.toFixed(2)} EUR</div>
        <div><b>Timer:</b> <span style={{color:left<60?'#c00':'#333'}}>{leftMMSS}</span></div>
      </div>

      <div style={{padding:'12px', background:'#fafafa', border:'1px solid #eee', borderRadius:8, marginBottom:12}}>
        <div style={{marginBottom:6}}>
          <b>Kurs:</b>{' '}
          {eurPerCoin ? `${eurPerCoin.toFixed(2)} EUR / ${st.coin}` : 'lädt …'}
        </div>
        <div>
          <b>Zu zahlen:</b>{' '}
          {cryptoAmount ? `${cryptoAmount} ${st.coin}` : '—'}
        </div>
      </div>

      {!signer ? (
        <button
          onClick={connect}
          style={{width:'100%', padding:'12px 16px', borderRadius:10, cursor:'pointer', border:'none', background:'#222', color:'#fff', fontWeight:600}}
        >
          Mit MetaMask verbinden
        </button>
      ) : (
        <>
          <div style={{fontSize:13, color:'#555', marginBottom:8}}>
            Verbunden: {addr.slice(0,6)}…{addr.slice(-4)} {onWrongNet ? <span style={{color:'#c00'}}> (falsches Netzwerk)</span> : null}
          </div>

          {onWrongNet ? (
            <button
              onClick={() => switchNetwork(chainCfg.chainIdHex)}
              style={{width:'100%', padding:'12px 16px', borderRadius:10, cursor:'pointer', border:'1px solid #999', background:'#fff', fontWeight:600}}
            >
              Netzwerk auf {chainCfg.name} wechseln
            </button>
          ) : (
            <button
              onClick={payNow}
              disabled={busy || !cryptoAmount}
              style={{width:'100%', padding:'12px 16px', borderRadius:10, cursor:'pointer', border:'none', background: busy ? '#888' : '#0a7', color:'#fff', fontWeight:700}}
            >
              Jetzt mit Wallet bezahlen
            </button>
          )}
        </>
      )}

      {msg ? <div style={{marginTop:10, fontSize:13, color:'#444'}}>{msg}</div> : null}

      {st.dbg && (
        <div style={{marginTop:14, display:'flex', gap:8}}>
          <button onClick={() => simulate(true)}  style={{flex:1, padding:'10px 12px'}}>Simulate Success</button>
          <button onClick={() => simulate(false)} style={{flex:1, padding:'10px 12px'}}>Simulate Fail</button>
        </div>
      )}

      <div style={{marginTop:16, fontSize:12, color:'#666', lineHeight:1.4}}>
        ⚠️ Krypto-Zahlungen sind unwiderruflich. Stelle sicher, dass <b>Chain &amp; Coin</b> exakt stimmen.
      </div>
    </div>
  );
}