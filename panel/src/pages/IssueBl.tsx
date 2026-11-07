import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import { createDraft, getConnection, type WalletLike } from '../chain';
import { type BlDocument, canonicalHash, canonicalJson, emptyDocument } from '../document';

interface IssueBlProps {
  wallet: WalletState;
}

const FIELD_LABELS: Record<keyof BlDocument, string> = {
  document_id: 'Belge ID (otomatik)',
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

/** Onay kapısının ilk adımı — taslak oluşturur VE şimdi gerçek bir belge içeriği de
 * alır (docs/plan-belge-hash.md). Belge zincire hiç yazılmıyor, sadece kanonik hash'i
 * (TradeTrust/CargoX/WaveBL'nin evrensel deseni) — carrier belgeyi indirip shipper'a
 * zincir dışında iletir, shipper "Draft Status" sekmesinde yükleyip doğrular. Devamı
 * (onay, iptal, mint etme) o sekmede: o sayfa adresi yapıştırınca zincirden okuduğu için
 * hiçbir state sekme geçişinde kaybolmaz. */
const IssueBl: React.FC<IssueBlProps> = ({ wallet }) => {
  const [shipper, setShipper] = useState('');
  const [doc, setDoc] = useState<BlDocument>(emptyDocument());
  const [createdDraft, setCreatedDraft] = useState<PublicKey | null>(null);
  const [createdDoc, setCreatedDoc] = useState<BlDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connection = getConnection();
  const connected = !!wallet.publicKey && !!wallet.provider;

  const setField = <K extends keyof BlDocument>(key: K, value: BlDocument[K]) =>
    setDoc((d) => ({ ...d, [key]: value }));

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
      const hash = await canonicalHash(doc);
      const { draft } = await createDraft(connection, walletLike, shipperPk, hash);
      setCreatedDraft(draft);
      setCreatedDoc(doc);
      setShipper('');
      setDoc(emptyDocument());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadHref = createdDoc
    ? `data:application/json;charset=utf-8,${encodeURIComponent(canonicalJson(createdDoc))}`
    : null;

  const copyJson = async () => {
    if (!createdDoc) return;
    await navigator.clipboard.writeText(canonicalJson(createdDoc));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <h2 className="section-title">Create a draft</h2>
      <p className="action-note" style={{ marginTop: 0 }}>
        Onay kapısının ilk adımı: shipper'ı önerirsin, belgeyi doldurursun — ama B/L hemen
        basılmaz, shipper belgeyi görüp kendi cüzdanıyla onaylamadan mint edilemez. Belge
        zincire yazılmaz, sadece hash'i yazılır — belgenin kendisini aşağıda indirip
        shipper'a (e-posta vb. ile) sen ileteceksin.
      </p>

      {!connected && <p className="empty-state">Önce Phantom bağla.</p>}

      <form onSubmit={handleCreateDraft} className="new-deal-form">
        <label>
          Shipper'ın cüzdan adresi
          <input
            required
            type="text"
            placeholder="Solana adresi"
            value={shipper}
            onChange={(e) => setShipper(e.target.value)}
            disabled={!connected || busy}
          />
        </label>

        <div className="form-section">
          <h3 className="form-section-label">Belge içeriği</h3>
          <p className="form-section-hint">
            Konşimento alanları — zincire yazılmaz, sadece kanonik hash'i Draft.content_hash'e
            gider.
          </p>
          {(Object.keys(FIELD_LABELS) as (keyof BlDocument)[])
            .filter((f) => f !== 'document_id')
            .map((field) => (
              <label key={field}>
                {FIELD_LABELS[field]}
                <input
                  required
                  type="text"
                  value={doc[field]}
                  onChange={(e) => setField(field, e.target.value)}
                  disabled={busy}
                />
              </label>
            ))}
        </div>

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
        <>
          <p className="empty-state">
            Bu draft adresini VE aşağıdaki belgeyi shipper'a ilet (zincir dışında — e-posta
            vb.). Shipper <strong>Draft Status</strong> sekmesinde ikisini de kullanıp
            doğrulayacak. Onaydan sonra sen (carrier) aynı adresi oraya yapıştırıp "Issue B/L"
            ile mint edeceksin.
          </p>
          <div className="queue-item-actions">
            {downloadHref && (
              <a href={downloadHref} download={`bl-draft-${createdDoc?.document_id ?? 'document'}.json`} className="btn btn-sm">
                Belgeyi indir
              </a>
            )}
            <button type="button" className="btn btn-sm" onClick={() => void copyJson()}>
              {copied ? 'Kopyalandı ✓' : "JSON'u kopyala"}
            </button>
          </div>
        </>
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
