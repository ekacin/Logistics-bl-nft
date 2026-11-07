// UI'dan bağımsız, gerçek bir doğrulama: chain.ts'in YAZDIĞIMIZ fonksiyonlarını
// (Phantom yerine düz bir test Keypair'iyle) devnet'e karşı gerçekten çalıştırır.
// Amaç: mint-cosign deseni, Buffer/process sorunları, ATA-oluşturma gibi üç bilinen
// tuzağın (dış inceleme notu) UI'ya yatırım yapmadan ÖNCE çözüldüğünü kanıtlamak.
//
// Çalıştır: node scripts/smoke-test.ts  (panel/ içinden)
import { readFileSync } from 'node:fs';
import { Connection, Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import {
  approveDraft,
  createDraft,
  endorse,
  fetchBlState,
  getConnection,
  issueBl,
  processSurrender,
  requestSurrender,
  walletFromKeypair,
} from '../src/chain.ts';

function loadCarrierKeypair(): Keypair {
  const raw = JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// Devnet'in genel RPC faucet'i artık tamamen kapalı (410 "faucet is closed") — airdrop
// yerine zaten dolu olan carrier cüzdanından düz bir transfer yapılıyor.
async function fundFromCarrier(connection: Connection, carrier: Keypair, to: Keypair['publicKey'], sol = 0.1) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: carrier.publicKey, toPubkey: to, lamports: sol * 1e9 })
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = carrier.publicKey;
  tx.sign(carrier);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
}

async function main() {
  const connection = getConnection();
  const carrierKp = loadCarrierKeypair();
  const shipperKp = Keypair.generate();
  const buyerKp = Keypair.generate();

  console.log('carrier:', carrierKp.publicKey.toBase58());
  console.log('shipper:', shipperKp.publicKey.toBase58());
  console.log('buyer  :', buyerKp.publicKey.toBase58());

  console.log('\n[1/5] shipper/buyer\'a carrier\'dan devnet SOL gönderiliyor (tx ücretleri için)...');
  await fundFromCarrier(connection, carrierKp, shipperKp.publicKey);
  await fundFromCarrier(connection, carrierKp, buyerKp.publicKey);

  const carrierWallet = walletFromKeypair(carrierKp);
  const shipperWallet = walletFromKeypair(shipperKp);
  const buyerWallet = walletFromKeypair(buyerKp);

  console.log('\n[2/7] createDraft (onay kapısı adım 1, carrier)...');
  const { draft, signature: draftSig } = await createDraft(connection, carrierWallet, shipperKp.publicKey);
  console.log('  draft:', draft.toBase58(), 'tx:', draftSig);

  console.log('\n[3/7] approveDraft (onay kapısı adım 2, shipper)...');
  const approveSig = await approveDraft(connection, shipperWallet, draft);
  console.log('  tx:', approveSig);

  console.log('\n[4/7] issueBl (mint co-sign deseni + onaylı draft test ediliyor)...');
  const { mint, signature: issueSig } = await issueBl(connection, carrierWallet, shipperKp.publicKey, draft);
  console.log('  mint:', mint.toBase58(), 'tx:', issueSig);

  console.log('\n[5/7] endorse (ATA-oluştur+transfer bundle test ediliyor)...');
  const endorseSig = await endorse(connection, shipperWallet, mint, buyerKp.publicKey);
  console.log('  tx:', endorseSig);

  console.log('\n[6/7] requestSurrender...');
  const reqSig = await requestSurrender(connection, buyerWallet, mint);
  console.log('  tx:', reqSig);

  console.log('\n[7/7] processSurrender...');
  const procSig = await processSurrender(connection, carrierWallet, mint);
  console.log('  tx:', procSig);

  const final = await fetchBlState(connection, mint);
  console.log('\nSon durum:', final?.status);
  if (final?.status !== 'redeemed') {
    throw new Error(`Beklenen status 'redeemed', gelen: ${final?.status}`);
  }
  console.log('\n✔ chain.ts gerçekten çalışıyor — mint co-sign, ATA-oluşturma, Buffer/process hiçbiri patlamadı.');
}

main().catch((err) => {
  console.error('\n✘ smoke test başarısız:', err);
  process.exitCode = 1;
});
