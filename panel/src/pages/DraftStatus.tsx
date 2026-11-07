import React, { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import { type DraftState, approveDraft, fetchDraft, getConnection, watchDraft, type WalletLike } from '../chain';

interface DraftStatusProps {
  wallet: WalletState;
}

/** Onay kapısının shipper tarafı: carrier'dan aldığın draft adresini yapıştır, taslağı
 * gör, bağlı cüzdan draft.shipper ile eşleşiyorsa "Onayla" butonu çıkar. TrackBl'daki
 * "adresi yapıştır" deseninin aynısı, tek sayfada (Draft'ın etkileşimi BL'den çok daha
 * basit — tek olası aksiyon var). */
const DraftStatus: React.FC<DraftStatusProps> = ({ wallet }) => {
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<PublicKey | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection = getConnection();

  useEffect(() => {
    if (!draft) return;
    const refresh = () =>
      void fetchDraft(connection, draft).then((d) => {
        setDraftState(d);
        setNotFound(d === null);
      });
    refresh();
    return watchDraft(connection, draft, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.toBase58()]);

  const openDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setDraft(new PublicKey(input.trim()));
    } catch {
      setError('Geçersiz Solana adresi.');
    }
  };

  const isShipper = !!wallet.publicKey && !!draftState && wallet.publicKey.equals(draftState.shipper);
  const canApprove = isShipper && draftState?.status === 'draft';

  const handleApprove = async () => {
    if (!draft || !wallet.publicKey || !wallet.provider) return;
    const provider = wallet.provider;
    const walletLike: WalletLike = { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
    setBusy(true);
    setError(null);
    try {
      await approveDraft(connection, walletLike, draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!draft) {
    return (
      <div>
        <h2 className="section-title">Approve a draft</h2>
        <div className="card">
          <p className="empty-state" style={{ marginTop: 0 }}>
            Carrier'ın sana verdiği draft adresini yapıştır.
          </p>
          <form className="open-deal-form" onSubmit={openDraft}>
            <input
              type="text"
              placeholder="Draft adresi"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">
              Open
            </button>
          </form>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
        ← Back
      </button>
      <h2 className="section-title">Draft status</h2>

      {busy && (
        <div className="blocking-overlay" role="alert" aria-busy="true">
          <div className="blocking-card">
            <div className="spinner" />
            <div className="blocking-title">Onaylanıyor…</div>
            <div className="blocking-sub">Phantom'da imza isteği gelecek — onaylamayı unutma.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="deal-address">{draft.toBase58()}</div>

        {notFound && <p className="empty-state">Bu adreste bir taslak bulunamadı.</p>}

        {draftState && (
          <dl className="status-grid">
            <dt>Durum</dt>
            <dd>
              <span className={`badge ${draftState.status === 'approved' ? 'badge-confirmed' : draftState.status === 'consumed' ? 'badge-confirmed' : 'badge-awaiting_approval'}`}>
                {draftState.status}
              </span>
            </dd>
            <dt>Carrier</dt>
            <dd>{draftState.carrier.toBase58()}</dd>
            <dt>Shipper</dt>
            <dd>{draftState.shipper.toBase58()}</dd>
            <dt>Senin kapasiten</dt>
            <dd>
              {!wallet.publicKey
                ? 'Cüzdan bağlı değil — salt okunur görüntülüyorsun.'
                : isShipper
                  ? "Shipper'sın — bu taslağı onaylayabilirsin."
                  : 'Bu taslakla ilgin yok (salt okunur).'}
            </dd>
          </dl>
        )}

        {canApprove && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleApprove()}>
            Onayla
          </button>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftStatus;
