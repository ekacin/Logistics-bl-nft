import React, { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import {
  type DraftState,
  cancelDraft,
  createDraft,
  fetchDraft,
  getConnection,
  issueBl,
  watchDraft,
  type WalletLike,
} from '../chain';

interface IssueBlProps {
  wallet: WalletState;
  onIssued: (mint: PublicKey) => void;
}

/** Onay kapısı: issue_bl artık carrier'ın tek başına çağırabileceği bir işlem değil —
 * önce create_draft (carrier), sonra approve_draft (shipper, kendi imzasıyla) gerekiyor.
 * Bu yüzden sayfa iki aşamalı: taslak oluştur → shipper onaylasın (panel canlı izler) →
 * B/L'yi mint et. Rol hesaplama deseni BlStatus.tsx'teki ile aynı mantık: sabit bir
 * "sıradaki adım" state'i değil, draft'ın zincirdeki gerçek durumu kaynak. */
const IssueBl: React.FC<IssueBlProps> = ({ wallet, onIssued }) => {
  const [shipper, setShipper] = useState('');
  const [draft, setDraft] = useState<PublicKey | null>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connection = getConnection();
  const connected = !!wallet.publicKey && !!wallet.provider;

  useEffect(() => {
    if (!draft) return;
    const refresh = () => void fetchDraft(connection, draft).then(setDraftState);
    refresh();
    return watchDraft(connection, draft, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.toBase58()]);

  const walletLike = (): WalletLike => {
    if (!wallet.publicKey || !wallet.provider) throw new Error('Önce Phantom bağla.');
    const provider = wallet.provider;
    return { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    let shipperPk: PublicKey;
    try {
      shipperPk = new PublicKey(shipper.trim());
    } catch {
      setError('Geçersiz Solana adresi.');
      return;
    }

    setError(null);
    setBusy('Taslak oluşturuluyor…');
    try {
      const { draft: draftPda } = await createDraft(connection, walletLike(), shipperPk);
      setDraft(draftPda);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleIssue = async () => {
    if (!draft) return;
    let shipperPk: PublicKey;
    try {
      shipperPk = new PublicKey(shipper.trim());
    } catch {
      setError('Geçersiz Solana adresi.');
      return;
    }
    setError(null);
    setBusy('B/L oluşturuluyor…');
    try {
      const { mint } = await issueBl(connection, walletLike(), shipperPk, draft);
      onIssued(mint);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const isDraft = draftState?.status === 'draft';
  const isApproved = draftState?.status === 'approved';
  const isConsumed = draftState?.status === 'consumed';

  const handleCancel = async () => {
    if (!draft) return;
    setError(null);
    setBusy('Taslak iptal ediliyor…');
    try {
      await cancelDraft(connection, walletLike(), draft);
      setDraft(null);
      setDraftState(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <h2 className="section-title">Issue a new B/L</h2>
      <p className="action-note" style={{ marginTop: 0 }}>
        Onay kapısı: önce bir taslak oluşturursun, shipper kendi cüzdanıyla onaylamadan B/L
        mint edilemez — carrier tek taraflı bir shipper atayamaz.
      </p>

      {!connected && <p className="empty-state">Önce Phantom bağla.</p>}

      {!draft && (
        <form onSubmit={handleCreateDraft} className="new-deal-form">
          <label>
            Shipper adresi
            <input
              required
              type="text"
              placeholder="Solana adresi"
              value={shipper}
              onChange={(e) => setShipper(e.target.value)}
              disabled={!connected || busy !== null}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!connected || busy !== null || !shipper.trim()}>
            Taslak oluştur
          </button>
        </form>
      )}

      {draft && (
        <div className="status-grid">
          <dt>Draft adresi</dt>
          <dd>{draft.toBase58()}</dd>
          <dt>Durum</dt>
          <dd>
            <span className={`badge ${isApproved ? 'badge-confirmed' : 'badge-awaiting_approval'}`}>
              {draftState?.status ?? 'yükleniyor…'}
            </span>
          </dd>
        </div>
      )}

      {draft && !isApproved && !isConsumed && (
        <>
          <p className="empty-state">
            Shipper'a bu draft adresini ver — "Approve Draft" sekmesinden onaylaması gerekiyor.
            Onaylanınca bu sayfa otomatik güncellenecek.
          </p>
          {isDraft && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void handleCancel()}>
              Taslağı iptal et
            </button>
          )}
        </>
      )}

      {draft && isApproved && (
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void handleIssue()}>
          Issue B/L
        </button>
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
            <div className="blocking-title">{busy}</div>
            <div className="blocking-sub">Phantom'da imza isteği gelecek — onaylamayı unutma.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueBl;
