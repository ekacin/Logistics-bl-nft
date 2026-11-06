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

  async function issueBl(mint: anchor.web3.Keypair) {
    const { blState, shipperAta } = deriveAddresses(mint.publicKey);
    await program.methods
      .issueBl()
      .accountsPartial({
        carrier: carrier.publicKey,
        shipper: shipper.publicKey,
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

    // SURRENDER_WINDOW = 15sn (constants.rs) — deadline'ın kesin geçmesi için 17sn bekle.
    await sleep(17_000);

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
  });
});
