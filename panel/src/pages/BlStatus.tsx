import React, { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import type { WalletState } from '../wallet';
import {
  type BlState,
  type SurrenderRequestState,
  type WalletLike,
  endorse,
  fetchBlState,
  fetchSurrenderRequest,
  getConnection,
  processSurrender,
  refundSurrenderTimeout,
  requestSurrender,
  watchBlState,
} from '../chain';
import { type BlDocument, DOCUMENT_FIELDS, canonicalHash, hashesEqual, isZeroHash, parseDocument } from '../document';
import Stepper from '../components/Stepper';

interface BlStatusProps {
  mint: PublicKey;
  wallet: WalletState;
  onClose: () => void;
}

const FIELD_LABELS: Record<keyof BlDocument, string> = {
  document_id: 'Belge ID',
  date_of_issue: 'Düzenleme tarihi',
  place_of_issue: 'Düzenleme yeri',
  shipper: 'Shipper (ad/adres)',
  consignee: 'Consignee (alıcı, ad/adres)',
  notify_party: 'Notify party',
  vessel: 'Gemi adı',
  voyage_no: 'Sefer no',
  port_of_loading: 'Yükleme limanı',
  port_of_discharge: 'Boşaltma limanı',
  marks_and_numbers: 'İşaret ve numaralar',
  number_of_packages: 'Koli/paket sayısı',
  description_of_goods: 'Eşya tanımı',
  gross_weight: 'Brüt ağırlık',
  measurement: 'Hacim',
  freight_terms: 'Navlun şartı',
  number_of_originals: 'Orijinal nüsha sayısı',
};

const STATE_BADGE_CLASS: Record<string, string> = {
  issued: 'badge',
  surrenderRequested: 'badge badge-awaiting_approval',
  redeemed: 'badge badge-confirmed',
};

const NOW_TICK_MS = 5_000;

/** UBLP'nin DealStatus.tsx'inden adapte — Stepper + status kartı + busy-overlay + aksiyon
 * butonları deseni aynı, ama "rol" bağlı cüzdanın bu spesifik B/L ile gerçek ilişkisinden
 * canlı hesaplanıyor (sabit bir login/whoAmI yok, dış inceleme notu): carrier mi
 * (bl_state.carrier ile eşleşme), token'ı şu an tutan mı (kendi ATA bakiyesi), yoksa
 * sadece timeout refund'a uygun mu (permissionless, herkese açık). Canlı güncelleme
 * watchBlState ile (connection.onAccountChange — Midnight indexer subscription'ının
 * Solana karşılığı), UBLP'nin GraphQL indexerWatch.ts'i yerine. */
const BlStatus: React.FC<BlStatusProps> = ({ mint, wallet, onClose }) => {
  const [blState, setBlState] = useState<BlState | null>(null);
  const [surrenderRequest, setSurrenderRequest] = useState<SurrenderRequestState | null>(null);
  const [holderBalance, setHolderBalance] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [endorseTo, setEndorseTo] = useState('');
  const [docText, setDocText] = useState('');
  const [uploadedDoc, setUploadedDoc] = useState<BlDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docMatch, setDocMatch] = useState<boolean | null>(null);

  const connection = getConnection();

  const hashIsZero = !!blState && isZeroHash(blState.preIssuanceHash);

  // Farklı bir mint açılınca belge-doğrulama state'i kalmasın diye (DraftStatus.tsx'te
  // bulunan aynı hata sınıfı) — mint değişince belge alanı sıfırlanır.
  useEffect(() => {
    setDocText('');
    setUploadedDoc(null);
    setDocError(null);
    setDocMatch(null);
  }, [mint.toBase58()]);

  useEffect(() => {
    if (!docText.trim() || !blState) {
      setUploadedDoc(null);
      setDocMatch(null);
      setDocError(null);
      return;
    }
    const parsed = parseDocument(docText);
    if (!parsed) {
      setUploadedDoc(null);
      setDocMatch(null);
      setDocError('Bu metin geçerli bir belge JSON\'u değil (beklenen alanlardan biri eksik/string değil).');
      return;
    }
    setUploadedDoc(parsed);
    setDocError(null);
    void canonicalHash(parsed).then((h) => setDocMatch(hashesEqual(h, blState.preIssuanceHash)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docText, blState?.preIssuanceHash && Array.from(blState.preIssuanceHash).join(',')]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDocText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const refresh = async () => {
    try {
      const state = await fetchBlState(connection, mint);
      setBlState(state);
      setNotFound(state === null);

      if (state?.status === 'surrenderRequested') {
        setSurrenderRequest(await fetchSurrenderRequest(connection, mint));
      } else {
        setSurrenderRequest(null);
      }

      if (wallet.publicKey) {
        try {
          const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
          const acc = await getAccount(connection, ata);
          setHolderBalance(Number(acc.amount));
        } catch {
          setHolderBalance(0);
        }
      } else {
        setHolderBalance(0);
      }

      setLastUpdated(Date.now());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void refresh();
    const unsubscribe = watchBlState(connection, mint, () => void refresh());
    const tick = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => {
      unsubscribe();
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint.toBase58(), wallet.publicKey?.toBase58()]);

  const deadlinePassed = !!surrenderRequest && now >= surrenderRequest.deadline * 1000;
  const isCarrier = !!wallet.publicKey && !!blState && wallet.publicKey.equals(blState.carrier);
  const isHolder = holderBalance > 0;
  const canEndorse = isHolder && blState?.status === 'issued';
  const canRequestSurrender = isHolder && blState?.status === 'issued';
  const canProcessSurrender = isCarrier && blState?.status === 'surrenderRequested';
  const canClaimRefund = !!wallet.publicKey && blState?.status === 'surrenderRequested' && deadlinePassed;

  const capacityLabel = (() => {
    if (!wallet.publicKey) return 'Cüzdan bağlı değil — salt okunur görüntülüyorsun.';
    const labels: string[] = [];
    if (isCarrier) labels.push("Carrier'sın");
    if (isHolder) labels.push('Bu B/L şu an sende — NFT\'yi tutuyorsun');
    if (canClaimRefund) labels.push("Timeout refund'u talep edebilirsin (permissionless, herkes çağırabilir)");
    if (labels.length === 0) labels.push('Bu B/L ile ilgin yok (salt okunur)');
    return labels.join(' · ');
  })();

  const walletLike = (): WalletLike => {
    if (!wallet.publicKey || !wallet.provider) throw new Error('Önce Phantom bağla.');
    const provider = wallet.provider;
    return { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
  };

  const runAction = async (label: string, run: () => Promise<string>) => {
    setBusy(label);
    setActionError(null);
    try {
      await run();
      await refresh();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const submitEndorse = (e: React.FormEvent) => {
    e.preventDefault();
    let to: PublicKey;
    try {
      to = new PublicKey(endorseTo.trim());
    } catch {
      setActionError('Geçersiz Solana adresi.');
      return;
    }
    void runAction('Endorse ediliyor…', async () => {
      const sig = await endorse(connection, walletLike(), mint, to);
      setEndorseTo('');
      return sig;
    });
  };

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
        ← Back
      </button>
      <h2 className="section-title">B/L status</h2>

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
        <div className="deal-address">{mint.toBase58()}</div>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {!blState && !error && !notFound && <p className="empty-state">Yükleniyor…</p>}
        {notFound && !error && (
          <p className="empty-state">
            Bu mint adresinde bir B/L bulunamadı. Henüz issue edilmemiş olabilir ya da adres yanlış.
          </p>
        )}

        {blState && <Stepper status={blState.status} deadlinePassed={deadlinePassed} />}

        {blState && (
          <dl className="status-grid">
            <dt>State</dt>
            <dd>
              <span className={STATE_BADGE_CLASS[blState.status] ?? 'badge'}>{blState.status}</span>
            </dd>
            <dt>Carrier</dt>
            <dd>{blState.carrier.toBase58()}</dd>
            <dt>Shipper (ilk alıcı)</dt>
            <dd>{blState.shipper.toBase58()}</dd>
            {surrenderRequest && (
              <>
                <dt>Buyer (ibraz eden)</dt>
                <dd>{surrenderRequest.buyer.toBase58()}</dd>
                <dt>Deadline</dt>
                <dd>
                  {new Date(surrenderRequest.deadline * 1000).toLocaleString()}
                  {deadlinePassed && ' — geçti'}
                </dd>
              </>
            )}
            <dt>Senin kapasiten</dt>
            <dd>{capacityLabel}</dd>
          </dl>
        )}

        {blState && (
          <>
            <h3 className="form-section-label">Belge doğrulama</h3>
            {hashIsZero ? (
              <p className="empty-state">Bu B/L'ye belge bağlanmamış (eski kayıt) — doğrulanacak hash yok.</p>
            ) : (
              <>
                <p className="form-section-hint">
                  Eline geçen belgenin carrier'ın bastığı belge olduğunu kendi doğrula — belge
                  hiçbir zaman zincire yazılmaz, sadece hash'i karşılaştırılır.
                </p>
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} />
                <textarea
                  rows={4}
                  placeholder="...ya da belge JSON'unu buraya yapıştır"
                  value={docText}
                  onChange={(e) => setDocText(e.target.value)}
                  style={{ width: '100%', marginTop: 8, fontFamily: 'var(--mono)', fontSize: 12.5 }}
                />
                {docError && (
                  <div className="alert alert-error" role="alert">
                    {docError}
                  </div>
                )}
                {uploadedDoc && docMatch !== null && (
                  <>
                    <div className={`alert ${docMatch ? 'alert-success' : 'alert-error'}`} role="alert">
                      {docMatch
                        ? '✓ Belge zincirdeki B/L ile eşleşiyor.'
                        : '✗ Bu belge bu B/L\'ye ait değil — hash eşleşmiyor.'}
                    </div>
                    <dl className="status-grid">
                      {DOCUMENT_FIELDS.map((field) => (
                        <React.Fragment key={field}>
                          <dt>{FIELD_LABELS[field]}</dt>
                          <dd>{uploadedDoc[field]}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </>
                )}
              </>
            )}
          </>
        )}

        {canEndorse && (
          <>
            <h3 className="form-section-label">Endorse (ciro et)</h3>
            <form className="open-deal-form" onSubmit={submitEndorse}>
              <input
                type="text"
                placeholder="Devredilecek adres"
                value={endorseTo}
                onChange={(e) => setEndorseTo(e.target.value)}
                disabled={busy !== null}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={busy !== null}>
                Endorse
              </button>
            </form>
          </>
        )}

        {(canRequestSurrender || canProcessSurrender || canClaimRefund) && (
          <div className="queue-item-actions">
            {canRequestSurrender && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runAction('İbraz ediliyor…', () => requestSurrender(connection, walletLike(), mint))}
              >
                Request surrender (ibraz et)
              </button>
            )}
            {canProcessSurrender && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runAction('İşleniyor (redeem)…', () => processSurrender(connection, walletLike(), mint))}
              >
                Process surrender (redeem)
              </button>
            )}
            {canClaimRefund && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runAction('Refund alınıyor…', () => refundSurrenderTimeout(connection, walletLike(), mint))}
              >
                Claim timeout refund
              </button>
            )}
          </div>
        )}
        {actionError && (
          <div className="alert alert-error" role="alert">
            {actionError}
          </div>
        )}

        {lastUpdated && <div className="last-updated">Last updated {new Date(lastUpdated).toLocaleTimeString()}</div>}
      </div>
    </div>
  );
};

export default BlStatus;
