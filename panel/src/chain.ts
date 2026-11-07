import { BN, Program, type Provider } from '@anchor-lang/core';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js';
import idl from './idl/logistics_bl_nft.json' with { type: 'json' };
import type { LogisticsBlNft } from './idl/logistics_bl_nft';

// import.meta.env Vite'a özgü — bu dosya smoke-test script'i tarafından düz Node'da da
// import edildiği için güvenli erişim (Vite dışında import.meta.env tanımsız olabilir).
const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
export const DEVNET_RPC = viteEnv?.VITE_RPC_URL ?? 'https://api.devnet.solana.com';

export const PROGRAM_ID = new PublicKey((idl as { address: string }).address);

export const BL_STATE_SEED = Buffer.from('bl_state');
export const VAULT_SEED = Buffer.from('vault');
export const SURRENDER_REQUEST_SEED = Buffer.from('surrender_request');
export const DRAFT_SEED = Buffer.from('draft');

function u64LeBytes(n: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return buf;
}

export function deriveDraft(carrier: PublicKey, draftId: bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([DRAFT_SEED, carrier.toBuffer(), u64LeBytes(draftId)], PROGRAM_ID);
}

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
 * arayüzünde wallet/publicKey opsiyonel, bkz. @anchor-lang/core/provider.d.ts).
 * `.instruction()` ile ix kurmak için de yeterli — asıl imza aşağıdaki sendTx'te,
 * WalletLike (Phantom ya da test Keypair'i) üzerinden olur. */
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

export type DraftStatusValue = 'draft' | 'approved' | 'consumed';

export interface DraftState {
  carrier: PublicKey;
  shipper: PublicKey;
  contentHash: Uint8Array;
  draftId: bigint;
  status: DraftStatusValue;
  bump: number;
}

export async function fetchDraft(connection: Connection, draft: PublicKey): Promise<DraftState | null> {
  const program = getReadOnlyProgram(connection);
  try {
    const account = await program.account.draft.fetch(draft);
    return {
      carrier: account.carrier,
      shipper: account.shipper,
      contentHash: new Uint8Array(account.contentHash as number[]),
      draftId: BigInt(account.draftId.toString()),
      status: decodeStatus(account.status as Record<string, unknown>) as DraftStatusValue,
      bump: account.bump,
    };
  } catch {
    return null;
  }
}

/** Onay kapısı: taslak onaylanınca (approve_draft) canlı güncellenmesi için — aynı
 * watchBlState deseni, PDA'sı sadece Draft. */
export function watchDraft(connection: Connection, draft: PublicKey, onChange: () => void): () => void {
  const subId = connection.onAccountChange(draft, () => onChange());
  return () => {
    void connection.removeAccountChangeListener(subId);
  };
}

// ---- yazma katmanı ----
// Hem Phantom (window.phantom.solana) hem de smoke-test'teki düz bir Keypair bu şekle
// uyar — ikisi de "publicKey + signTransaction" sağlıyor, chain.ts hangisiyle
// çağrıldığını bilmek zorunda değil.
export interface WalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
}

/** Düz bir Keypair'i WalletLike'a çevirir — sadece smoke test ve demo script'leri için,
 * UI hiç kullanmaz (UI her zaman gerçek Phantom'u kullanır). */
export function walletFromKeypair(kp: Keypair): WalletLike {
  return {
    publicKey: kp.publicKey,
    async signTransaction<T extends Transaction>(tx: T): Promise<T> {
      tx.partialSign(kp);
      return tx;
    },
  };
}

async function sendTx(
  connection: Connection,
  wallet: WalletLike,
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = []
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  for (const kp of extraSigners) tx.partialSign(kp);
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}

/** Onay kapısı adım 1 — Carrier çağırır, shipper bu adımda imzalamaz. draft_id olarak
 * panelde Date.now() kullanılıyor (benzersizlik için yeterli — çakışırsa `init` sessizce
 * değil gürültülü hata verir, kullanıcı tekrar dener). */
export async function createDraft(
  connection: Connection,
  wallet: WalletLike,
  shipper: PublicKey,
  contentHash: Uint8Array = new Uint8Array(32)
): Promise<{ draft: PublicKey; draftId: bigint; signature: string }> {
  const program = getReadOnlyProgram(connection);
  const draftId = BigInt(Date.now());
  const [draft] = deriveDraft(wallet.publicKey, draftId);

  const ix = await program.methods
    .createDraft(new BN(draftId.toString()), Array.from(contentHash))
    .accountsPartial({
      carrier: wallet.publicKey,
      shipper,
      draft,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const signature = await sendTx(connection, wallet, [ix]);
  return { draft, draftId, signature };
}

/** Onay kapısı adım 2 — Shipper çağırır. has_one=shipper zincirde zaten kilitli; burada
 * ayrıca bir kontrole gerek yok, program reddederse hata olduğu gibi yukarı fırlar. */
export async function approveDraft(connection: Connection, wallet: WalletLike, draft: PublicKey): Promise<string> {
  const program = getReadOnlyProgram(connection);
  const ix = await program.methods
    .approveDraft()
    .accountsPartial({ shipper: wallet.publicKey, draft })
    .instruction();
  return sendTx(connection, wallet, [ix]);
}

/** Carrier çağırır. Mint taze bir Keypair — Phantom onu imzalayamaz, bu yüzden
 * `extraSigners`'a verilip `sendTx` içinde `partialSign` ile yerel (popup'sız)
 * imzalanıyor; Phantom sadece carrier'ın kendi imzasını atıyor (dış inceleme notu).
 * `draft` onaylanmış olmalı — değilse program DraftNotApproved ile reddeder. */
export async function issueBl(
  connection: Connection,
  wallet: WalletLike,
  shipper: PublicKey,
  draft: PublicKey
): Promise<{ mint: PublicKey; signature: string }> {
  const program = getReadOnlyProgram(connection);
  const mint = Keypair.generate();
  const [blState] = deriveBlState(mint.publicKey);
  const shipperAta = getAssociatedTokenAddressSync(mint.publicKey, shipper);

  const ix = await program.methods
    .issueBl()
    .accountsPartial({
      carrier: wallet.publicKey,
      shipper,
      draft,
      mint: mint.publicKey,
      shipperAta,
      blState,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const signature = await sendTx(connection, wallet, [ix], [mint]);
  return { mint: mint.publicKey, signature };
}

/** Düz SPL transfer — custom instruction değil (mimari-spec.md #7). Şu an token'ı
 * tutan taraf çağırır. Alıcının ATA'sı yoksa aynı transaction'a ekleniyor (dış
 * inceleme notu — endorse'da bu adım eksikse transfer patlar). */
export async function endorse(connection: Connection, wallet: WalletLike, mint: PublicKey, to: PublicKey): Promise<string> {
  const fromAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const toAta = getAssociatedTokenAddressSync(mint, to);
  const ixs: TransactionInstruction[] = [];
  const toInfo = await connection.getAccountInfo(toAta);
  if (!toInfo) {
    ixs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, toAta, to, mint));
  }
  ixs.push(createTransferInstruction(fromAta, toAta, wallet.publicKey, 1));
  return sendTx(connection, wallet, ixs);
}

/** Buyer çağırır — token'ı mint'e özel vault PDA'ya kilitler. */
export async function requestSurrender(connection: Connection, wallet: WalletLike, mint: PublicKey): Promise<string> {
  const program = getReadOnlyProgram(connection);
  const buyerAta = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const [vault] = deriveVault(mint);
  const [blState] = deriveBlState(mint);
  const [surrenderRequest] = deriveSurrenderRequest(mint);

  const ix = await program.methods
    .requestSurrender()
    .accountsPartial({
      buyer: wallet.publicKey,
      mint,
      buyerAta,
      vault,
      blState,
      surrenderRequest,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return sendTx(connection, wallet, [ix]);
}

/** Carrier çağırır — has_one=carrier kontrolü zincirde. Vault'taki token burn edilir. */
export async function processSurrender(connection: Connection, wallet: WalletLike, mint: PublicKey): Promise<string> {
  const sr = await fetchSurrenderRequest(connection, mint);
  if (!sr) throw new Error('Surrender request bulunamadı — önce request_surrender çağrılmış olmalı.');
  const program = getReadOnlyProgram(connection);
  const [blState] = deriveBlState(mint);
  const [vault] = deriveVault(mint);
  const [surrenderRequest] = deriveSurrenderRequest(mint);

  const ix = await program.methods
    .processSurrender()
    .accountsPartial({
      carrier: wallet.publicKey,
      blState,
      buyer: sr.buyer,
      mint,
      vault,
      surrenderRequest,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return sendTx(connection, wallet, [ix]);
}

/** Permissionless — kim çağırırsa çağırsın (mimari-spec.md 9b). `wallet` sadece tx
 * ücretini öder, hiçbir rol kısıtı yok; buyer_ata surrender_request.buyer'dan
 * türetiliyor, caller'ın geçtiği ham bir hesap değil. */
export async function refundSurrenderTimeout(connection: Connection, wallet: WalletLike, mint: PublicKey): Promise<string> {
  const sr = await fetchSurrenderRequest(connection, mint);
  if (!sr) throw new Error('Surrender request bulunamadı — önce request_surrender çağrılmış olmalı.');
  const program = getReadOnlyProgram(connection);
  const [blState] = deriveBlState(mint);
  const [vault] = deriveVault(mint);
  const [surrenderRequest] = deriveSurrenderRequest(mint);
  const buyerAta = getAssociatedTokenAddressSync(mint, sr.buyer);

  const ix = await program.methods
    .refundSurrenderTimeout()
    .accountsPartial({
      caller: wallet.publicKey,
      mint,
      blState,
      surrenderRequest,
      buyer: sr.buyer,
      vault,
      buyerAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return sendTx(connection, wallet, [ix]);
}
