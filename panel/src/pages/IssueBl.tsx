import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import { getConnection, issueBl, type WalletLike } from '../chain';

interface IssueBlProps {
  wallet: WalletState;
  onIssued: (mint: PublicKey) => void;
}

/** Carrier aksiyonu — spec'in çekirdek tablo #6'sı. UBLP'nin NewDeal.tsx'inin form
 * desenini kullanıyor (.new-deal-form class'ı), ama alan sayısı çok daha az: tek bir
 * shipper adresi. mint/freeze authority iptali zincirde otomatik (issue_bl ix'inin
 * kendisi), burada ayrı bir adım yok. */
const IssueBl: React.FC<IssueBlProps> = ({ wallet, onIssued }) => {
  const [shipper, setShipper] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = !!wallet.publicKey && !!wallet.provider;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.provider) return;

    let shipperPk: PublicKey;
    try {
      shipperPk = new PublicKey(shipper.trim());
    } catch {
      setError('Geçersiz Solana adresi.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const connection = getConnection();
      const provider = wallet.provider;
      const walletLike: WalletLike = {
        publicKey: wallet.publicKey,
        signTransaction: (tx) => provider.signTransaction(tx),
      };
      const { mint } = await issueBl(connection, walletLike, shipperPk);
      setShipper('');
      onIssued(mint);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Issue a new B/L</h2>
      <p className="action-note" style={{ marginTop: 0 }}>
        Carrier olarak imzalarsın — çıplak SPL mint (decimals=0) oluşturulur, shipper'ın
        ATA'sına mint edilir, mint/freeze authority aynı işlemde iptal edilir.
      </p>

      {!connected && <p className="empty-state">Önce Phantom bağla.</p>}

      <form onSubmit={handleSubmit} className="new-deal-form">
        <label>
          Shipper adresi
          <input
            required
            type="text"
            placeholder="Solana adresi"
            value={shipper}
            onChange={(e) => setShipper(e.target.value)}
            disabled={!connected || busy}
          />
        </label>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={!connected || busy || !shipper.trim()}>
          {busy ? 'İşleniyor…' : 'Issue B/L'}
        </button>
      </form>

      {busy && (
        <div className="blocking-overlay" role="alert" aria-busy="true">
          <div className="blocking-card">
            <div className="spinner" />
            <div className="blocking-title">B/L oluşturuluyor…</div>
            <div className="blocking-sub">Phantom'da imza isteği gelecek — onaylamayı unutma.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueBl;
