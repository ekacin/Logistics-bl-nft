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
  document_id: 'Document ID',
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

interface DraftStatusProps {
  wallet: WalletState;
  onIssued: (mint: PublicKey) => void;
}

/** The approval gate's single, shared status page — same "capacity-driven action" pattern
 * as BlStatus.tsx: no state is carried in the browser/tab, everything is re-read from
 * chain as soon as the address is pasted. So even if the carrier creates a draft on the
 * "Issue" tab, switches away, and comes back, nothing is lost — pasting the same draft
 * address here always shows the real on-chain state. Three possible capacities:
 *  - Shipper, status==draft  → Approve
 *  - Carrier,  status==draft  → Cancel (rent is returned)
 *  - Carrier,  status==approved → Issue B/L (mints) */
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

  // Opening a different draft address (Back → new address → Open) used to leave the
  // previous document state behind — a real bug found via live testing: it could look
  // like a "match" against the wrong draft. Document state resets when the draft changes.
  useEffect(() => {
    setDocText('');
    setUploadedDoc(null);
    setDocError(null);
    setDocMatch(null);
  }, [draft?.toBase58()]);

  // Once a document is pasted/uploaded, parse it, hash it, and compare against
  // draft.content_hash — the document never goes on-chain, this comparison happens
  // entirely in the browser.
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
      setDocError('This text is not a valid document JSON (one of the expected fields is missing or not a string).');
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

  // Once issue_bl runs, the draft becomes "consumed" but the mint address isn't stored
  // anywhere persistent — we search backwards on-chain by draft_ref to find which B/L
  // was born from this draft (permanently fixes the lost "result screen" problem).
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
      setError('Invalid Solana address.');
    }
  };

  const walletLike = (): WalletLike => {
    if (!wallet.publicKey || !wallet.provider) throw new Error('Connect Phantom first.');
    const provider = wallet.provider;
    return { publicKey: wallet.publicKey, signTransaction: (tx) => provider.signTransaction(tx) };
  };

  const isShipper = !!wallet.publicKey && !!draftState && wallet.publicKey.equals(draftState.shipper);
  const isCarrier = !!wallet.publicKey && !!draftState && wallet.publicKey.equals(draftState.carrier);
  const canApprove = isShipper && draftState?.status === 'draft' && (hashIsZero || docMatch === true);
  const canCancel = isCarrier && draftState?.status === 'draft';
  const canIssue = isCarrier && draftState?.status === 'approved';

  const capacityLabel = (() => {
    if (!wallet.publicKey) return 'No wallet connected — read-only view.';
    const labels: string[] = [];
    if (isCarrier) labels.push("You're the carrier");
    if (isShipper) labels.push("You're the shipper");
    if (labels.length === 0) labels.push("You have no relation to this draft (read-only)");
    return labels.join(' · ');
  })();

  const handleApprove = async () => {
    if (!draft) return;
    setBusy('Approving…');
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
    setBusy('Cancelling draft…');
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
    setBusy('Issuing B/L…');
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
            Paste the draft's address — if you're the carrier, the one you created; if
            you're the shipper, the one the carrier gave you.
          </p>
          <form className="open-deal-form" onSubmit={openDraft}>
            <input
              type="text"
              placeholder="Draft address"
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
            <div className="blocking-sub">Phantom will ask you to sign — don't forget to approve.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="deal-address">{draft.toBase58()}</div>

        {notFound && <p className="empty-state">No draft found at this address (it may have been cancelled, or the address is wrong).</p>}

        {draftState && (
          <dl className="status-grid">
            <dt>Status</dt>
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
            <dt>Your role here</dt>
            <dd>{capacityLabel}</dd>
          </dl>
        )}

        {draftState?.status === 'draft' && (
          <>
            <h3 className="form-section-label">Document</h3>
            {hashIsZero ? (
              <p className="empty-state">No document is attached to this draft (legacy record) — approval doesn't require one.</p>
            ) : (
              <>
                {/* Verification is public (read-only, no signature needed) — only the
                    Approve button is gated to isShipper+docMatch. The carrier or an
                    auditor can also check the same document before it's sent along. */}
                <p className="form-section-hint">
                  Upload or paste the document the carrier sent you off-chain (email, etc.) —
                  verify it matches the on-chain hash before approving.
                </p>
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} />
                <textarea
                  rows={4}
                  placeholder="...or paste the document JSON here"
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
                        ? '✓ Document matches the on-chain draft.'
                        : "✗ This document doesn't belong to this draft — hash mismatch."}
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
            Approve
          </button>
        )}
        {canCancel && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void handleCancel()}>
            Cancel draft
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
              This draft has already been minted. {resultingBl ? 'The resulting B/L is below:' : 'Looking up the B/L…'}
            </p>
            {resultingBl && (
              <button type="button" className="btn btn-primary" onClick={() => onIssued(resultingBl.mint)}>
                Open B/L ({resultingBl.mint.toBase58().slice(0, 4)}…{resultingBl.mint.toBase58().slice(-4)})
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
