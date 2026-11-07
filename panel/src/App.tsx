import React, { useState } from 'react';
import { usePhantomWallet } from './wallet';
import { PublicKey } from '@solana/web3.js';
import IssueBl from './pages/IssueBl';
import TrackBl from './pages/TrackBl';
import BlStatus from './pages/BlStatus';
import DraftStatus from './pages/DraftStatus';

type View = 'issue' | 'track' | 'approveDraft';

function shortAddr(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

/** UBLP'nin App.tsx'inden adapte edilen shell deseni (header/brand/nav/main) — ama
 * sabit bir "rol"/login kavramı yok (dış inceleme notu: rol, bağlı cüzdanın o spesifik
 * B/L'yle ilişkisinden dinamik hesaplanıyor, bkz. BlStatus.tsx). Header sadece bağlı
 * cüzdanı gösterir; UBLP'nin InstanceSwitcher'ı yok — Phantom'ın kendi hesap
 * değiştiricisi aynı işi görüyor (wallet.ts'teki accountChanged dinleyicisi sayesinde). */
const App: React.FC = () => {
  const wallet = usePhantomWallet();
  const { publicKey, connecting, error, connect, disconnect } = wallet;
  const [view, setView] = useState<View>('track');
  const [openedMint, setOpenedMint] = useState<PublicKey | null>(null);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" />
          <span className="brand">Logistics-bl-nft</span>
          <h1>Bill of Lading NFT</h1>
        </div>
        <div className="header-meta">
          {publicKey ? (
            <>
              <span className="network-badge">
                <span className="dot" />
                devnet
              </span>
              <span className="role-badge" title={publicKey.toBase58()}>
                {shortAddr(publicKey)}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect}>
                Bağlantıyı kes
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={connecting} onClick={connect}>
              {connecting ? 'Bağlanıyor…' : 'Phantom bağla'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      <main className="app-main">
        {openedMint ? (
          <BlStatus mint={openedMint} wallet={wallet} onClose={() => setOpenedMint(null)} />
        ) : (
          <>
            <nav className="app-nav">
              <button
                type="button"
                className={`btn btn-sm ${view === 'issue' ? 'btn-primary' : ''}`}
                onClick={() => setView('issue')}
              >
                Issue
              </button>
              <button
                type="button"
                className={`btn btn-sm ${view === 'track' ? 'btn-primary' : ''}`}
                onClick={() => setView('track')}
              >
                Track
              </button>
              <button
                type="button"
                className={`btn btn-sm ${view === 'approveDraft' ? 'btn-primary' : ''}`}
                onClick={() => setView('approveDraft')}
              >
                Draft Status
              </button>
            </nav>
            {view === 'issue' && <IssueBl wallet={wallet} />}
            {view === 'track' && <TrackBl onOpen={(mint) => setOpenedMint(mint)} />}
            {view === 'approveDraft' && <DraftStatus wallet={wallet} onIssued={(mint) => setOpenedMint(mint)} />}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
