import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { WalletState } from '../wallet';
import { createDraft, getConnection, type WalletLike } from '../chain';
import { type BlDocument, canonicalHash, canonicalJson, emptyDocument } from '../document';

interface IssueBlProps {
  wallet: WalletState;
}

const FIELD_LABELS: Record<keyof BlDocument, string> = {
  document_id: 'Document ID (auto)',
  date_of_issue: 'Date of issue',
  place_of_issue: 'Place of issue',
  shipper: 'Shipper (name/address)',
  consignee: 'Consignee (buyer, name/address)',
  notify_party: 'Notify party',
  vessel: 'Vessel name',
  voyage_no: 'Voyage no.',
  port_of_loading: 'Port of loading',
  port_of_discharge: 'Port of discharge',
  marks_and_numbers: 'Marks and numbers',
  number_of_packages: 'Number of packages',
  description_of_goods: 'Description of goods',
  gross_weight: 'Gross weight',
  measurement: 'Measurement',
  freight_terms: 'Freight terms',
  number_of_originals: 'Number of originals',
};

/** First step of the approval gate — creates a draft AND now also takes a real document
 * payload (docs/plan-belge-hash.md). The document itself is never written on-chain, only
 * its canonical hash (the universal TradeTrust/CargoX/WaveBL pattern) — the carrier
 * downloads the document and sends it to the shipper off-chain, who uploads and verifies
 * it on the "Draft Status" tab. The rest (approve, cancel, mint) happens on that tab: since
 * it re-reads from chain as soon as the address is pasted, no state is ever lost across a
 * tab switch. */
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
      setError('Invalid Solana address.');
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
        First step of the approval gate: you propose the shipper and fill in the document —
        but the B/L isn't minted yet, it can't be until the shipper sees the document and
        approves it with their own wallet. The document is never written on-chain, only its
        hash is — you'll download the document itself below and send it to the shipper
        (by email, etc.) yourself.
      </p>

      {!connected && <p className="empty-state">Connect Phantom first.</p>}

      <form onSubmit={handleCreateDraft} className="new-deal-form">
        <label>
          Shipper's wallet address
          <input
            required
            type="text"
            placeholder="Solana address"
            value={shipper}
            onChange={(e) => setShipper(e.target.value)}
            disabled={!connected || busy}
          />
        </label>

        <div className="form-section">
          <h3 className="form-section-label">Document content</h3>
          <p className="form-section-hint">
            Bill of lading fields — never written on-chain, only their canonical hash goes
            into Draft.content_hash.
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
          Create draft
        </button>
      </form>

      {createdDraft && (
        <div className="status-grid" style={{ marginTop: 16 }}>
          <dt>Resulting draft address</dt>
          <dd>{createdDraft.toBase58()}</dd>
        </div>
      )}
      {createdDraft && (
        <>
          <p className="empty-state">
            Send this draft address AND the document below to the shipper (off-chain — email,
            etc.). The shipper will use both on the <strong>Draft Status</strong> tab to
            verify and approve. Once approved, you (the carrier) paste the same address there
            and mint with "Issue B/L".
          </p>
          <div className="queue-item-actions">
            {downloadHref && (
              <a href={downloadHref} download={`bl-draft-${createdDoc?.document_id ?? 'document'}.json`} className="btn btn-sm">
                Download document
              </a>
            )}
            <button type="button" className="btn btn-sm" onClick={() => void copyJson()}>
              {copied ? 'Copied ✓' : 'Copy JSON'}
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
            <div className="blocking-title">Creating draft…</div>
            <div className="blocking-sub">Phantom will ask you to sign — don't forget to approve.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssueBl;
