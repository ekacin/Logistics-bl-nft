import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';

interface TrackBlProps {
  onOpen: (mint: PublicKey) => void;
}

/** UBLP'nin OpenDeal.tsx'inden birebir desen — "contract address" yerine "mint adresi"
 * (B/L'nin kimliği). Herhangi bir rol/B/L sahibi olan herkes bir mint adresini yapıştırıp
 * durumu görebilir (salt okunur, imza gerekmez) — aksiyon butonları BlStatus'ta, bağlı
 * cüzdanın kapasitesine göre ayrıca kapılanır. */
const TrackBl: React.FC<TrackBlProps> = ({ onOpen }) => {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const mint = new PublicKey(address.trim());
      onOpen(mint);
    } catch {
      setError('Invalid Solana address.');
    }
  };

  return (
    <div>
      <h2 className="section-title">Track a B/L</h2>
      <div className="card">
        <p className="empty-state" style={{ marginTop: 0 }}>
          Paste the mint address (the B/L's identity) the carrier gave you.
        </p>
        <form className="open-deal-form" onSubmit={submit}>
          <input
            type="text"
            placeholder="Mint address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
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
};

export default TrackBl;
