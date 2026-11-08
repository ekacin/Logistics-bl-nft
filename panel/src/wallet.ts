// Phantom'a doğrudan bağlanma — UBLP'nin wallet/connector.ts'inin window.midnight'a
// bağlandığı deseninin birebir Solana karşılığı. @solana/wallet-adapter-* paketleri
// kasıtlı olarak kullanılmıyor (dış inceleme notu): tek hedef cüzdan (Phantom) için
// gereksiz bir soyutlama katmanı, kendi CSS'imizle çakışma riski de taşıyor.
import { PublicKey, type Transaction } from '@solana/web3.js';
import { useCallback, useEffect, useState } from 'react';

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction>(txs: T[]): Promise<T[]>;
  on(event: 'connect' | 'disconnect' | 'accountChanged', handler: (publicKey?: PublicKey) => void): void;
  off(event: 'connect' | 'disconnect' | 'accountChanged', handler: (publicKey?: PublicKey) => void): void;
}

export function getPhantomProvider(): PhantomProvider | null {
  const injected = (window as unknown as { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
  return injected?.isPhantom ? injected : null;
}

export interface WalletState {
  provider: PhantomProvider | null;
  publicKey: PublicKey | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/** Bağlı cüzdan state'i — Phantom'ın kendi `accountChanged` event'ini dinler, demo
 * sırasında Phantom'da hesap değiştirince sayfa yenilemeden güncellenir (dış inceleme
 * notu: Carrier→Shipper→Buyer geçişi böyle yapılacak, bkz. README). */
export function usePhantomWallet(): WalletState {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = getPhantomProvider();

  useEffect(() => {
    if (!provider) return;
    const onAccountChanged = (pk?: PublicKey) => setPublicKey(pk ?? null);
    const onDisconnect = () => setPublicKey(null);
    provider.on('accountChanged', onAccountChanged);
    provider.on('disconnect', onDisconnect);
    provider
      .connect({ onlyIfTrusted: true })
      .then((res) => setPublicKey(res.publicKey))
      .catch(() => {
        /* daha önce bağlanılmamış — sessizce yok say, kullanıcı butona basacak */
      });
    return () => {
      provider.off('accountChanged', onAccountChanged);
      provider.off('disconnect', onDisconnect);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    if (!provider) {
      setError('Phantom not found — is the browser extension installed?');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await provider.connect();
      setPublicKey(res.publicKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    await provider?.disconnect();
    setPublicKey(null);
  }, [provider]);

  return { provider, publicKey, connecting, error, connect, disconnect };
}
