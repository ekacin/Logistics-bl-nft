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

const STATE_BADGE_CLASS: Record<string, string> = {
  issued: 'badge',
  surrenderRequested: 'badge badge-awaiting_approval',
  redeemed: 'badge badge-confirmed',
};

const NOW_TICK_MS = 5_000;

/** Adapted from UBLP's DealStatus.tsx — same Stepper + status card + busy-overlay + action
 * button pattern, but "role" is computed live from the connected wallet's actual
 * relationship to this specific B/L (no fixed login/whoAmI, per external review): is it
 * the carrier (matches bl_state.carrier), does it currently hold the token (its own ATA
 * balance), or is it merely eligible for the timeout refund (permissionless, open to
 * anyone). Live updates via watchBlState (connection.onAccountChange — the Solana
 * equivalent of UBLP's GraphQL indexer subscription), in place of UBLP's
 * indexerWatch.ts. */
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

  // Reset document-verification state when a different mint is opened (same bug class
  // found in DraftStatus.tsx) — document fields reset when the mint changes.
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
      setDocError('This text is not a valid document JSON (one of the expected fields is missing or not a string).');
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
    if (!wallet.publicKey) return 'No wallet connected — read-only view.';
    const labels: string[] = [];
    if (isCarrier) labels.push("You're the carrier");
    if (isHolder) labels.push("You're holding this B/L right now — you have the NFT");
    if (canClaimRefund) labels.push('You can claim the timeout refund (permissionless, anyone can call it)');
    if (labels.length === 0) labels.push('You have no relation to this B/L (read-only)');
    return labels.join(' · ');
  })();

  const walletLike = (): WalletLike => {
    if (!wallet.publicKey || !wallet.provider) throw new Error('Connect Phantom first.');
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
      setActionError('Invalid Solana address.');
      return;
    }
    void runAction('Endorsing…', async () => {
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
            <div className="blocking-sub">Phantom will ask you to sign — don't forget to approve.</div>
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
        {!blState && !error && !notFound && <p className="empty-state">Loading…</p>}
        {notFound && !error && (
          <p className="empty-state">
            No B/L found at this mint address. It may not have been issued yet, or the address is wrong.
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
            <dt>Shipper (first holder)</dt>
            <dd>{blState.shipper.toBase58()}</dd>
            {surrenderRequest && (
              <>
                <dt>Buyer (surrendering)</dt>
                <dd>{surrenderRequest.buyer.toBase58()}</dd>
                <dt>Deadline</dt>
                <dd>
                  {new Date(surrenderRequest.deadline * 1000).toLocaleString()}
                  {deadlinePassed && ' — passed'}
                </dd>
              </>
            )}
            <dt>Your role here</dt>
            <dd>{capacityLabel}</dd>
          </dl>
        )}

        {blState && (
          <>
            <h3 className="form-section-label">Document verification</h3>
            {hashIsZero ? (
              <p className="empty-state">No document is attached to this B/L (legacy record) — nothing to verify.</p>
            ) : (
              <>
                <p className="form-section-hint">
                  Verify for yourself that the document you received is the one the carrier
                  actually issued — the document is never written on-chain, only the hash is
                  compared.
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
                        ? '✓ Document matches the on-chain B/L.'
                        : "✗ This document doesn't belong to this B/L — hash mismatch."}
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
            <h3 className="form-section-label">Endorse</h3>
            <form className="open-deal-form" onSubmit={submitEndorse}>
              <input
                type="text"
                placeholder="Address to transfer to"
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
                onClick={() => void runAction('Requesting surrender…', () => requestSurrender(connection, walletLike(), mint))}
              >
                Request surrender
              </button>
            )}
            {canProcessSurrender && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runAction('Processing (redeem)…', () => processSurrender(connection, walletLike(), mint))}
              >
                Process surrender (redeem)
              </button>
            )}
            {canClaimRefund && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runAction('Claiming refund…', () => refundSurrenderTimeout(connection, walletLike(), mint))}
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
