import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { LogisticsBlNft } from "../target/types/logistics_bl_nft";

const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = anchor.web3;

async function airdrop(connection: anchor.web3.Connection, pubkey: anchor.web3.PublicKey, sol = 5) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("logistics_bl_nft — çekirdek B/L akışı", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.logisticsBlNft as Program<LogisticsBlNft>;
  const connection = provider.connection;

  // Carrier/Shipper/Buyer kasıtlı olarak 3 AYRI keypair — aynı cüzdanı birden
  // fazla role vermek has_one=carrier gibi kontrolleri gerçekten test etmez
  // (bkz. UBLP projesindeki "gerçekten ayrı olsa hâlâ doğru çalışır mıydı" kuralı).
  const carrier = Keypair.generate();
  const shipper = Keypair.generate();
  const buyer = Keypair.generate();

  const PROGRAM_ID = program.programId;

  before(async () => {
    await Promise.all([airdrop(connection, carrier.publicKey), airdrop(connection, shipper.publicKey), airdrop(connection, buyer.publicKey)]);
  });

  function deriveAddresses(mint: anchor.web3.PublicKey) {
    const [blState] = PublicKey.findProgramAddressSync(
      [Buffer.from("bl_state"), mint.toBuffer()],
      PROGRAM_ID
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), mint.toBuffer()],
      PROGRAM_ID
    );
    const [surrenderRequest] = PublicKey.findProgramAddressSync(
      [Buffer.from("surrender_request"), mint.toBuffer()],
      PROGRAM_ID
    );
    const shipperAta = getAssociatedTokenAddressSync(mint, shipper.publicKey);
    const buyerAta = getAssociatedTokenAddressSync(mint, buyer.publicKey);
    return { blState, vault, surrenderRequest, shipperAta, buyerAta };
  }

  // Onay kapısı: draft_id carrier tarafından verilir (panelde timestamp kullanılacak
  // deseni taklit ediyoruz) — her test kendi benzersiz id'sini bu sayaçtan alır.
  let draftIdCounter = BigInt(Date.now());
  function nextDraftId(): bigint {
    return draftIdCounter++;
  }

  function u64LeBytes(n: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(n);
    return buf;
  }

  function deriveDraft(draftId: bigint) {
    const [draft] = PublicKey.findProgramAddressSync(
      [Buffer.from("draft"), carrier.publicKey.toBuffer(), u64LeBytes(draftId)],
      PROGRAM_ID
    );
    return draft;
  }

  async function createDraft(draftId: bigint, contentHash = Buffer.alloc(32)) {
    const draft = deriveDraft(draftId);
    await program.methods
      .createDraft(new anchor.BN(draftId.toString()), Array.from(contentHash))
      .accountsPartial({
        carrier: carrier.publicKey,
        shipper: shipper.publicKey,
        draft,
        systemProgram: SystemProgram.programId,
      })
      .signers([carrier])
      .rpc();
    return draft;
  }

  async function approveDraft(draft: anchor.web3.PublicKey, approver = shipper) {
    await program.methods
      .approveDraft()
      .accountsPartial({ shipper: approver.publicKey, draft })
      .signers([approver])
      .rpc();
  }

  async function cancelDraft(draft: anchor.web3.PublicKey, signer = carrier) {
    await program.methods
      .cancelDraft()
      .accountsPartial({ carrier: signer.publicKey, draft })
      .signers([signer])
      .rpc();
  }

  async function issueBl(mint: anchor.web3.Keypair) {
    const draftId = nextDraftId();
    const draft = await createDraft(draftId);
    await approveDraft(draft);

    const { blState, shipperAta } = deriveAddresses(mint.publicKey);
    await program.methods
      .issueBl()
      .accountsPartial({
        carrier: carrier.publicKey,
        shipper: shipper.publicKey,
        draft,
        mint: mint.publicKey,
        shipperAta,
        blState,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([carrier, mint])
      .rpc();
  }

  async function endorseToBuyer(mint: anchor.web3.PublicKey) {
    const { shipperAta, buyerAta } = deriveAddresses(mint);
    const tx = new anchor.web3.Transaction().add(
      createAssociatedTokenAccountInstruction(buyer.publicKey, buyerAta, buyer.publicKey, mint),
      createTransferInstruction(shipperAta, buyerAta, shipper.publicKey, 1)
    );
    await provider.sendAndConfirm(tx, [buyer, shipper]);
  }

  async function requestSurrender(mint: anchor.web3.PublicKey) {
    const { blState, vault, surrenderRequest, buyerAta } = deriveAddresses(mint);
    await program.methods
      .requestSurrender()
      .accountsPartial({
        buyer: buyer.publicKey,
        mint,
        buyerAta,
        vault,
        blState,
        surrenderRequest,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }

  it("Senaryo A: issue_bl → endorse → request_surrender → process_surrender → Redeemed", async () => {
    const mint = Keypair.generate();
    await issueBl(mint);
    await endorseToBuyer(mint.publicKey);
    await requestSurrender(mint.publicKey);

    const { blState, vault, surrenderRequest } = deriveAddresses(mint.publicKey);
    await program.methods
      .processSurrender()
      .accountsPartial({
        carrier: carrier.publicKey,
        blState,
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        vault,
        surrenderRequest,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([carrier])
      .rpc();

    const state = await program.account.billOfLadingState.fetch(blState);
    expect(Object.keys(state.status)[0]).to.equal("redeemed");
  });

  it("Senaryo B: issue_bl → request_surrender → (deadline geçsin) → refund_surrender_timeout (permissionless) → Issued", async () => {
    const mint = Keypair.generate();
    await issueBl(mint);
    await endorseToBuyer(mint.publicKey);
    await requestSurrender(mint.publicKey);

    // SURRENDER_WINDOW = 30sn (constants.rs) — deadline'ın kesin geçmesi için 32sn bekle.
    await sleep(32_000);

    const { blState, vault, surrenderRequest, buyerAta } = deriveAddresses(mint.publicKey);

    // Permissionless: carrier/shipper/buyer'la hiçbir ilgisi olmayan rastgele bir
    // çağıran — spec'in "kim çağırırsa çağırsın" iddiasını gerçekten test eder.
    const randomCaller = Keypair.generate();
    await airdrop(connection, randomCaller.publicKey, 1);

    await program.methods
      .refundSurrenderTimeout()
      .accountsPartial({
        caller: randomCaller.publicKey,
        mint: mint.publicKey,
        blState,
        surrenderRequest,
        buyer: buyer.publicKey,
        vault,
        buyerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([randomCaller])
      .rpc();

    const state = await program.account.billOfLadingState.fetch(blState);
    expect(Object.keys(state.status)[0]).to.equal("issued");

    const buyerAccount = await getAccount(connection, buyerAta);
    expect(buyerAccount.amount.toString()).to.equal("1");

    // Dış inceleme bulgusu: refund'dan sonra vault kapatılmazsa B/L kalıcı olarak
    // kilitlenir — ikinci bir ibraz denemesi "already in use" ile patlar. Spec'in
    // "belge iptal olmuyor, tekrar ibraz edilebilir" iddiasını BUNU deneyerek kanıtla,
    // sadece ilk refund'da durmak yetmez (eski test suite'in kaçırdığı tam da buydu).
    await requestSurrender(mint.publicKey);
    const stateAfterSecondRequest = await program.account.billOfLadingState.fetch(blState);
    expect(Object.keys(stateAfterSecondRequest.status)[0]).to.equal("surrenderRequested");
  });

  it("Negatif: ilgisiz bir cüzdan process_surrender çağırırsa has_one=carrier ile patlar", async () => {
    const mint = Keypair.generate();
    await issueBl(mint);
    await endorseToBuyer(mint.publicKey);
    await requestSurrender(mint.publicKey);

    const { blState, vault, surrenderRequest } = deriveAddresses(mint.publicKey);
    const impostor = Keypair.generate();
    await airdrop(connection, impostor.publicKey, 1);

    let threw = false;
    try {
      await program.methods
        .processSurrender()
        .accountsPartial({
          carrier: impostor.publicKey,
          blState,
          buyer: buyer.publicKey,
          mint: mint.publicKey,
          vault,
          surrenderRequest,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([impostor])
        .rpc();
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/ConstraintHasOne|has_one|2001/);
    }
    expect(threw, "impostor'un process_surrender çağırması BAŞARILI olmamalıydı").to.equal(true);
  });

  it("Negatif: deadline dolmadan refund_surrender_timeout çağrılırsa patlar", async () => {
    const mint = Keypair.generate();
    await issueBl(mint);
    await endorseToBuyer(mint.publicKey);
    await requestSurrender(mint.publicKey);

    const { blState, vault, surrenderRequest, buyerAta } = deriveAddresses(mint.publicKey);
    const randomCaller = Keypair.generate();
    await airdrop(connection, randomCaller.publicKey, 1);

    let threw = false;
    try {
      await program.methods
        .refundSurrenderTimeout()
        .accountsPartial({
          caller: randomCaller.publicKey,
          mint: mint.publicKey,
          blState,
          surrenderRequest,
          buyer: buyer.publicKey,
          vault,
          buyerAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([randomCaller])
        .rpc();
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/DeadlineNotReached|6001/);
    }
    expect(threw, "deadline dolmadan refund BAŞARILI olmamalıydı").to.equal(true);
  });

  it("Negatif: onaysız taslakla issue_bl çağrılırsa DraftNotApproved ile patlar", async () => {
    const mint = Keypair.generate();
    const draftId = nextDraftId();
    const draft = await createDraft(draftId); // onaylanmadı

    const { blState, shipperAta } = deriveAddresses(mint.publicKey);

    let threw = false;
    try {
      await program.methods
        .issueBl()
        .accountsPartial({
          carrier: carrier.publicKey,
          shipper: shipper.publicKey,
          draft,
          mint: mint.publicKey,
          shipperAta,
          blState,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([carrier, mint])
        .rpc();
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/DraftNotApproved|6002/);
    }
    expect(threw, "onaysız taslakla issue_bl BAŞARILI olmamalıydı").to.equal(true);
  });

  it("Negatif: shipper olmayan biri approve_draft çağırırsa has_one ile patlar", async () => {
    const draftId = nextDraftId();
    const draft = await createDraft(draftId);
    const impostor = Keypair.generate();
    await airdrop(connection, impostor.publicKey, 1);

    let threw = false;
    try {
      await approveDraft(draft, impostor);
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/ConstraintHasOne|has_one|2001/);
    }
    expect(threw, "shipper olmayan birinin approve_draft çağırması BAŞARILI olmamalıydı").to.equal(true);
  });

  it("Negatif: aynı onaylı taslakla ikinci kez issue_bl çağrılırsa Consumed olduğu için patlar", async () => {
    const draftId = nextDraftId();
    const draft = await createDraft(draftId);
    await approveDraft(draft);

    // İlk kullanım başarılı olmalı.
    const mint1 = Keypair.generate();
    const { blState: blState1, shipperAta: shipperAta1 } = deriveAddresses(mint1.publicKey);
    await program.methods
      .issueBl()
      .accountsPartial({
        carrier: carrier.publicKey,
        shipper: shipper.publicKey,
        draft,
        mint: mint1.publicKey,
        shipperAta: shipperAta1,
        blState: blState1,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([carrier, mint1])
      .rpc();

    // Aynı (artık Consumed) taslakla ikinci bir mint denemesi patlamalı.
    const mint2 = Keypair.generate();
    const { blState: blState2, shipperAta: shipperAta2 } = deriveAddresses(mint2.publicKey);

    let threw = false;
    try {
      await program.methods
        .issueBl()
        .accountsPartial({
          carrier: carrier.publicKey,
          shipper: shipper.publicKey,
          draft,
          mint: mint2.publicKey,
          shipperAta: shipperAta2,
          blState: blState2,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([carrier, mint2])
        .rpc();
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/DraftNotApproved|6002/);
    }
    expect(threw, "Consumed taslakla ikinci issue_bl BAŞARILI olmamalıydı").to.equal(true);
  });

  it("cancel_draft: onaylanmamış taslak iptal edilip rent carrier'a döner", async () => {
    const draftId = nextDraftId();
    const draft = await createDraft(draftId);

    const balanceBefore = await connection.getBalance(carrier.publicKey);
    await cancelDraft(draft);
    const balanceAfter = await connection.getBalance(carrier.publicKey);

    expect(balanceAfter, "cancel_draft rent'i carrier'a iade etmeliydi").to.be.greaterThan(balanceBefore);

    const accountInfo = await connection.getAccountInfo(draft);
    expect(accountInfo, "iptal edilen draft hesabı kapatılmış olmalıydı").to.equal(null);
  });

  it("Negatif: onaylanmış bir taslak cancel_draft ile iptal edilemez", async () => {
    const draftId = nextDraftId();
    const draft = await createDraft(draftId);
    await approveDraft(draft);

    let threw = false;
    try {
      await cancelDraft(draft);
    } catch (err) {
      threw = true;
      expect((err as Error).toString()).to.match(/InvalidState|6000/);
    }
    expect(threw, "onaylanmış taslak cancel_draft ile BAŞARILI şekilde iptal edilmemeliydi").to.equal(true);
  });
});
