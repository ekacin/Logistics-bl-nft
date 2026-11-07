import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import { createDraft, getConnection, type WalletLike } from '../chain';

interface IssueBlProps {
  wallet: WalletState;
}

/** Onay kapısının ilk adımı — SADECE taslak oluşturur. Devamı (onay, iptal, mint etme)
 * "Draft Status" sekmesinde: o sayfa adresi yapıştırınca zincirden okuduğu için hiçbir
 * state sekme geçişinde kaybolmaz (bu sayfanın kendi local state'inde "hangi aşamadayız"
 * tutmanın canlı testte bulunan hatası — sekme değişince unutuluyordu — buradan tamamen
 * kaldırıldı). */
const IssueBl: React.FC<IssueBlProps> = ({ wallet }) => {
  const [shipper, setShipper] = useState('');
  const [createdDraft, setCreatedDraft] = useState<PublicKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection = getConnection();
  const connected = !!wallet.publicKey && !!wallet.provider;

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey || !wallet.provider) return;
    let shipperPk: PublicKey;
    try {
      shipperPk = new PublicKey(shipper.trim());
    } catch {
      setError('Geçersiz Solana adresi.');
      return;
    }

    const provider = wallet.provider;
    const walletLike: WalletLike = { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };

    setError(null);
    setBusy(true);
    try {
      const { draft } = await createDraft(connection, walletLike, shipperPk);
      setCreatedDraft(draft);
      setShipper('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Create a draft</h2>
      <p className="action-note" style={{ marginTop: 0 }}>
        Onay kapısının ilk adımı: shipper'ı önerirsin, ama B/L hemen basılmaz — shipper kendi
        cüzdanıyla onaylamadan mint edilemez. Onaydan sonra basma işlemi <strong>Draft
        Status</strong> sekmesinde (bu taslağın adresini yapıştırarak).
      </p>

      {!connected && <p className="empty-state">Önce Phantom bağla.</p>}

      <form onSubmit={handleCreateDraft} className="new-deal-form">
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
        <button type="submit" className="btn btn-primary" disabled={!connected || busy || !shipper.trim()}>
          Taslak oluştur
        </button>
      </form>

      {createdDraft && (
        <div className="status-grid" style={{ marginTop: 16 }}>
          <dt>Oluşan draft adresi</dt>
          <dd>{createdDraft.toBase58()}</dd>
        </div>
      )}
      {createdDraft && (
        <p className="empty-state">
          Bu adresi shipper'a ver. Onaylandıktan sonra sen (carrier) de aynı adresi{' '}
          <strong>Draft Status</strong> sekmesine yapıştırıp "Issue B/L" ile mint edeceksin.
        </p>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {busy && (
        <div className="blocking-overlay" role="alert" aria-busy="true">
          <div className="blocking-card">
            <div className="spinner" />
            <div className="blocking-title">Taslak oluşturuluyor…</div>
            <div className="blocking-sub">Phantom'da imza isteği gelecek — onaylamayı unutma.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueBl;
