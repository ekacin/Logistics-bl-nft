import { Program, type Provider } from '@anchor-lang/core';
import { Connection, PublicKey } from '@solana/web3.js';
import idl from './idl/logistics_bl_nft.json';
import type { LogisticsBlNft } from './idl/logistics_bl_nft';

export const DEVNET_RPC = import.meta.env.VITE_RPC_URL ?? 'https://api.devnet.solana.com';

export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

export const BL_STATE_SEED = Buffer.from('bl_state');
export const VAULT_SEED = Buffer.from('vault');
export const SURRENDER_REQUEST_SEED = Buffer.from('surrender_request');

export function deriveBlState(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([BL_STATE_SEED, mint.toBuffer()], PROGRAM_ID);
}

export function deriveVault(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, mint.toBuffer()], PROGRAM_ID);
}

export function deriveSurrenderRequest(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SURRENDER_REQUEST_SEED, mint.toBuffer()], PROGRAM_ID);
}

/** Salt okunur Program örneği — imza gerekmez, sadece connection yeterli (Provider
 * arayüzünde wallet/publicKey opsiyonel, bkz. @anchor-lang/core/provider.d.ts). Yazma
 * işlemleri için chain-write.ts kendi provider'ını (Phantom ile) kurar. */
export function getReadOnlyProgram(connection: Connection): Program<LogisticsBlNft> {
  const provider: Provider = { connection };
  return new Program(idl as LogisticsBlNft, provider);
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, 'confirmed');
}

export type Status = 'issued' | 'surrenderRequested' | 'redeemed';

export interface BlState {
  carrier: PublicKey;
  shipper: PublicKey;
  mint: PublicKey;
  status: Status;
  bump: number;
}

function decodeStatus(raw: Record<string, unknown>): Status {
  return Object.keys(raw)[0] as Status;
}

export async function fetchBlState(connection: Connection, mint: PublicKey): Promise<BlState | null> {
  const program = getReadOnlyProgram(connection);
  const [blStatePda] = deriveBlState(mint);
  try {
    const account = await program.account.billOfLadingState.fetch(blStatePda);
    return {
      carrier: account.carrier,
      shipper: account.shipper,
      mint: account.mint,
      status: decodeStatus(account.status as Record<string, unknown>),
      bump: account.bump,
    };
  } catch {
    return null;
  }
}

export interface SurrenderRequestState {
  buyer: PublicKey;
  deadline: number;
}

export async function fetchSurrenderRequest(
  connection: Connection,
  mint: PublicKey
): Promise<SurrenderRequestState | null> {
  const program = getReadOnlyProgram(connection);
  const [pda] = deriveSurrenderRequest(mint);
  try {
    const account = await program.account.surrenderRequest.fetch(pda);
    return { buyer: account.buyer, deadline: Number(account.deadline) };
  } catch {
    return null;
  }
}

/** Midnight indexer'ın GraphQL subscription'ının (indexerWatch.ts) birebir Solana
 * karşılığı: bl_state PDA'sında değişiklik olunca callback tetiklenir, polling yok. */
export function watchBlState(connection: Connection, mint: PublicKey, onChange: () => void): () => void {
  const [blStatePda] = deriveBlState(mint);
  const subId = connection.onAccountChange(blStatePda, () => onChange());
  return () => {
    void connection.removeAccountChangeListener(subId);
  };
}
