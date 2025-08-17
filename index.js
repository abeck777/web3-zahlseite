// pages/index.js
import { useEffect, useState } from 'react';

export default function IndexPage() {
  const [st, setSt] = useState({ loading: true, verified: false, params: {} });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const params = {
      orderId: sp.get('orderId') || '',
      token:   sp.get('token')   || '',
      amountEur:   sp.get('amountEur')   || '',
      amountCents: sp.get('amountCents') || '',
      coin:   (sp.get('coin')  || '').toUpperCase(),
      chain:  (sp.get('chain') || '').toUpperCase(),
      wallet: sp.get('wallet') || '',
      success: sp.get('success') || '',
      fail:    sp.get('fail')    || ''
    };
    console.log('[ONCHAIN] landing params', params);

    const hardFail = (reason) => {
      const base = params.fail || 'https://www.goldsilverstuff.com/zahlung-fehlgeschlagen';
      const url = `${base}${base.includes('?') ? '&' : '?'}orderId=${encodeURIComponent(params.orderId || '')}&reason=${encodeURIComponent(reason)}`;
      window.location.replace(url);
    };

    if (!params.orderId || !params.token || !params.fail) {
      hardFail('missing_params');
      return;
    }

    fetch(`/api/web3zahlung?orderId=${encodeURIComponent(params.orderId)}&token=${encodeURIComponent(params.token)}`)
      .then(async r => {
        if (!r.ok) {
          hardFail(`verify_failed_${r.status}`);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        console.log('[ONCHAIN] verify OK', data);
        setSt({ loading: false, verified: true, params });
      })
      .catch(e => {
        console.error('[ONCHAIN] verify ERROR', e);
        hardFail('verify_error');
      });
  }, []);

  if (st.loading)   return <div style={{padding:20}}>Lade Zahlung …</div>;
  if (!st.verified) return <div style={{padding:20}}>Weiterleitung …</div>;

  return (
    <div style={{padding:20, maxWidth:640}}>
      <h1>On-Chain Zahlung</h1>
      <p>Order: <b>{st.params.orderId}</b></p>
      <p>Betrag: {st.params.amountEur} EUR</p>
      <p>{st.params.coin} @ {st.params.chain}</p>
      <p>Wallet: {st.params.wallet}</p>
      <button onClick={() => alert('Wallet-Flow implementieren')}>Mit Wallet zahlen</button>
    </div>
  );
}