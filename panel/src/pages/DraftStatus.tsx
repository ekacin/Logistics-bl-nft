import React, { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import {
  type BlState,
  type DraftState,
  approveDraft,
  cancelDraft,
  fetchDraft,
  findBlStateByDraft,
  getConnection,
  issueBl,
  watchDraft,
  type WalletLike,
} from '../chain';
import { type BlDocument, DOCUMENT_FIELDS, canonicalHash, hashesEqual, isZeroHash, parseDocument } from '../document';

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
  const [resultingBl, setResultingBl] = useState<BlState | null>(null);
  const [docText, setDocText] = useState('');
  const [uploadedDoc, setUploadedDoc] = useState<BlDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docMatch, setDocMatch] = useState<boolean | null>(null);

  const connection = getConnection();

  const hashIsZero = !!draftState && isZeroHash(draftState.contentHash);

  // Farklı bir draft adresi açılınca (Back → yeni adres → Open) önceki belge state'i
  // kalıyordu — canlı testte bulunan hata: yanlış taslağa karşı "eşleşiyor" gibi
  // görünebilirdi. Draft değişince belge alanı sıfırlanır.
  useEffect(() => {
    setDocText('');
    setUploadedDoc(null);
    setDocError(null);
    setDocMatch(null);
  }, [draft?.toBase58()]);

  // Belge yapıştırılınca/yüklenince ayrıştır, hash'ini hesapla, draft.content_hash ile
  // karşılaştır — belge hiç zincire gitmiyor, sadece bu karşılaştırma tarayıcıda olur.
  useEffect(() => {
    if (!docText.trim() || !draftState) {
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
    void canonicalHash(parsed).then((h) => setDocMatch(hashesEqual(h, draftState.contentHash)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docText, draftState?.contentHash && Array.from(draftState.contentHash).join(',')]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDocText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

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

  // issue_bl geçince draft "consumed" olur ama mint adresi hiçbir yerde kalıcı
  // tutulmaz — draft_ref'e göre zincirden geriye doğru arayıp hangi B/L'nin bu
  // taslaktan doğduğunu buluyoruz (kayıp "sonuç ekranı" sorununu kalıcı çözer).
  useEffect(() => {
    if (!draft || draftState?.status !== 'consumed') {
      setResultingBl(null);
      return;
    }
    void findBlStateByDraft(connection, draft).then(setResultingBl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.toBase58(), draftState?.status]);

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
  const canApprove = isShipper && draftState?.status === 'draft' && (hashIsZero || docMatch === true);
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
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setDraft(null);
          setInput('');
        }}
      >
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

        {draftState?.status === 'draft' && (
          <>
            <h3 className="form-section-label">Belge</h3>
            {hashIsZero ? (
              <p className="empty-state">Bu taslağa belge bağlanmamış (eski kayıt) — onay için belge gerekmiyor.</p>
            ) : (
              <>
                {/* Doğrulama herkese açık (salt okunur, imza gerektirmez) — sadece
                    Onayla butonu isShipper+docMatch'e kilitli. Carrier/denetleyen
                    biri de göndermeden önce aynı belgeyi kontrol edebilsin. */}
                <p className="form-section-hint">
                  Carrier'ın zincir dışında (e-posta vb.) ilettiği belgeyi yükle ya da yapıştır —
                  onaylamadan önce zincirdeki hash ile eşleştiğini doğrula.
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
                        ? '✓ Belge zincirdeki taslakla eşleşiyor.'
                        : '✗ Bu belge bu taslağa ait değil — hash eşleşmiyor.'}
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

        {draftState?.status === 'consumed' && (
          <>
            <p className="empty-state">
              Bu taslak zaten mint edilmiş. {resultingBl ? 'Doğan B/L aşağıda:' : 'B/L aranıyor…'}
            </p>
            {resultingBl && (
              <button type="button" className="btn btn-primary" onClick={() => onIssued(resultingBl.mint)}>
                B/L'yi aç ({resultingBl.mint.toBase58().slice(0, 4)}…{resultingBl.mint.toBase58().slice(-4)})
              </button>
            )}
          </>
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
