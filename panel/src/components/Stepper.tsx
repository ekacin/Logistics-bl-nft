import React from 'react';
import type { Status } from '../chain';

interface StepperProps {
  status: Status;
  /** Sadece status==='surrenderRequested' iken anlamlı — deadline geçtiyse refund mümkün. */
  deadlinePassed: boolean;
}

const STEPS = ['Issued', 'Surrender requested', 'Redeemed'];
const STATUS_INDEX: Record<Status, number> = { issued: 0, surrenderRequested: 1, redeemed: 2 };

/** UBLP'nin Stepper.tsx'inden adapte — 4 durum yerine 3 (Issued/SurrenderRequested/
 * Redeemed), ayrı bir milestoneConfirmed bayrağı yok çünkü bizim status enum'umuz zaten
 * tüm durumu tek başına taşıyor. "stuck" hali bizde kalıcı değil (UBLP'deki timeout gibi) —
 * deadline geçince refund_surrender_timeout çağrılabilir, bu yüzden not metni farklı. */
const Stepper: React.FC<StepperProps> = ({ status, deadlinePassed }) => {
  const idx = STATUS_INDEX[status];
  const done = STEPS.map((_, i) => i < idx || (i === idx && status === 'redeemed'));
  const current = status === 'redeemed' ? -1 : idx;
  const stuck = status === 'surrenderRequested' && deadlinePassed;

  return (
    <div className="stepper">
      <ol className="stepper-list">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className={`stepper-connector${done[i - 1] ? ' filled' : ''}`} />}
            <li
              className={`stepper-item${done[i] ? ' done' : ''}${i === current ? ' current' : ''}${
                stuck && i === current ? ' stuck' : ''
              }`}
            >
              <span className="stepper-dot">{done[i] ? '✓' : i + 1}</span>
              <span className="stepper-label">{label}</span>
            </li>
          </React.Fragment>
        ))}
      </ol>
      {stuck && (
        <p className="stepper-note stepper-note-warn">
          Deadline passed — the surrender timed out. The NFT can be refunded to the buyer
          via the timeout refund (anyone can call it), returning the B/L to "Issued".
        </p>
      )}
    </div>
  );
};

export default Stepper;
