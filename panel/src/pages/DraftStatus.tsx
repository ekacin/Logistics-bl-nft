import React, { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import {
  type DraftState,
  approveDraft,
  cancelDraft,
  fetchDraft,
  getConnection,
  issueBl,
  watchDraft,
  type WalletLike,
} from '../chain';

interface DraftStatusProps {
  wallet: WalletState;
  onIssued: (mint: PublicKey) => void;
}

/** Onay kapısının tek, ortak durumu sayfası — BlStatus.tsx'teki "kapasiteye göre aksiyon"
 * deseniyle aynı: hiçbir state tarayıcıda/sekmede taşınmıyor, her şey adresi yapıştırınca
 * zincirden okunuyor. Bu yüzden carrier "Issue" sekmesinde taslak oluşturup "Approve Draft"
 * sekmesine gidip geri dönse bile hiçbir şey kaybolmaz — aynı draft adresini buraya
 * yapıştırdığı an gerçek durum görünür. Üç olası kapasite:
 *  - Shipper, status==draft  → Onayla
 *  - Carrier,  status==draft  → İptal et (rent geri döner)
 *  - Carrier,  status==approved → Issue B/L (mint eder) */
const DraftStatus: React.FC<DraftStatusProps> = ({ wallet, onIssued }) => {
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<PublicKey | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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

  const walletLike = (): WalletLike => {
    if (!wallet.publicKey || !wallet.provider) throw new Error('Önce Phantom bağla.');
    const provider = wallet.provider;
    return { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
  };

  const isShipper = !!wallet.publicKey && !!draftState && wallet.publicKey.equals(draftState.shipper);
  const isCarrier = !!wallet.publicKey && !!draftState && wallet.publicKey.equals(draftState.carrier);
  const canApprove = isShipper && draftState?.status === 'draft';
  const canCancel = isCarrier && draftState?.status === 'draft';
  const canIssue = isCarrier && draftState?.status === 'approved';

  const capacityLabel = (() => {
    if (!wallet.publicKey) return 'Cüzdan bağlı değil — salt okunur görüntülüyorsun.';
    const labels: string[] = [];
    if (isCarrier) labels.push("Carrier'sın");
    if (isShipper) labels.push("Shipper'sın");
    if (labels.length === 0) labels.push('Bu taslakla ilgin yok (salt okunur)');
    return labels.join(' · ');
  })();

  const handleApprove = async () => {
    if (!draft) return;
    setBusy('Onaylanıyor…');
    setError(null);
    try {
      await approveDraft(connection, walletLike(), draft);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!draft) return;
    setBusy('Taslak iptal ediliyor…');
    setError(null);
    try {
      await cancelDraft(connection, walletLike(), draft);
      setDraft(null);
      setDraftState(null);
      setInput('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleIssue = async () => {
    if (!draft || !draftState) return;
    setBusy('B/L oluşturuluyor…');
    setError(null);
    try {
      const { mint } = await issueBl(connection, walletLike(), draftState.shipper, draft);
      onIssued(mint);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!draft) {
    return (
      <div>
        <h2 className="section-title">Draft status</h2>
        <div className="card">
          <p className="empty-state" style={{ marginTop: 0 }}>
            Taslağın adresini yapıştır — carrier'san kendi oluşturduğun, shipper'san
            carrier'ın sana verdiği adres.
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
            <div className="blocking-title">{busy}</div>
            <div className="blocking-sub">Phantom'da imza isteği gelecek — onaylamayı unutma.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="deal-address">{draft.toBase58()}</div>

        {notFound && <p className="empty-state">Bu adreste bir taslak bulunamadı (iptal edilmiş ya da yanlış adres olabilir).</p>}

        {draftState && (
          <dl className="status-grid">
            <dt>Durum</dt>
            <dd>
              <span
                className={`badge ${
                  draftState.status === 'approved' || draftState.status === 'consumed'
                    ? 'badge-confirmed'
                    : 'badge-awaiting_approval'
                }`}
              >
                {draftState.status}
              </span>
            </dd>
            <dt>Carrier</dt>
            <dd>{draftState.carrier.toBase58()}</dd>
            <dt>Shipper</dt>
            <dd>{draftState.shipper.toBase58()}</dd>
            <dt>Senin kapasiten</dt>
            <dd>{capacityLabel}</dd>
          </dl>
        )}

        {canApprove && (
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void handleApprove()}>
            Onayla
          </button>
        )}
        {canCancel && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void handleCancel()}>
            Taslağı iptal et
          </button>
        )}
        {canIssue && (
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void handleIssue()}>
            Issue B/L
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
