# Logistics-bl-nft

A bill of lading, reimagined as a single-ownership token on Solana. Built for the MLH Solana hackathon.

## The problem

A bill of lading (B/L) is the single most important document in international trade. It is simultaneously a receipt for cargo, evidence of the carriage contract, and — critically — a **document of title**: whoever physically holds the original B/L is the only party legally entitled to claim the goods at the destination port. That last property is what makes it valuable, and it is also exactly what makes it fragile.

The entire system still runs on paper, and paper creates problems that have nothing to do with the cargo itself:

- **Physical custody is the only proof of title.** Carriers typically issue two or three "original" copies of the same B/L. Only one is ever meant to be presented, but nothing stops a dishonest holder from using the other originals to pledge the same cargo as collateral at more than one bank, or to sell it twice. Fraud detection depends on a port agent eyeballing a paper document for watermarks and signatures.
- **Paper travels slower than ships.** On short-sea and regional routes in particular, a vessel can arrive before the courier carrying the original B/L does — the document has to pass through a chain of banks (buyer's bank, correspondent bank, seller's bank) that is slower than the voyage itself. The industry's workaround is a **Letter of Indemnity**: the carrier releases the cargo without seeing the original document, on the promise that whoever asked for it will cover any damages if it turns out they weren't entitled to it. That workaround quietly defeats the entire point of the B/L.
- **No single source of truth.** Every party in the chain — seller, buyer, carrier, each bank — keeps its own paper trail. Reconciling "who currently holds the real original" across five or six organizations and two or three countries is a manual, trust-based process.
- **Electronic bills of lading exist, but they recreate the same trust problem one level up.** Platforms like Bolero or essDOCS replace paper with a database, but that database is run by a single commercial vendor. You've swapped "trust the paper is real" for "trust this one company's server never goes down, never gets hacked, and never favors one of its paying customers over another."

None of this is a cargo problem. It's a **bookkeeping-of-ownership** problem — exactly the kind of problem a blockchain is good at, because a blockchain's entire job is to make "who owns this right now" a fact nobody can quietly rewrite, without needing everyone to trust the same company.

## Why Solana

A title document needs exactly one property above all others: **at any moment, exactly one party can prove they hold it, and that holder can change hands without a central registry's permission.**

That is precisely what a token with `supply = 1` already guarantees, natively, for free. No custom database, no vendor, no single point of failure — just the ownership rules the chain itself enforces. A hash of a PDF can be copied infinitely; a token that only one wallet can hold cannot. That distinction is also the exact legal test that matters here: UNCITRAL's Model Law on Electronic Transferable Records (MLETR) requires a "reliable method" to guarantee **exclusive control** over an electronic record before it can carry the same legal weight as a paper original. A single-supply token satisfies that test on a technical level, not just a conceptual one.

Solana specifically, rather than any other chain, because a real trade-finance chain of title can involve many hand-offs in quick succession — exporter to importer, importer to their bank, bank to a correspondent bank — and each of those hand-offs should be a transfer that settles in roughly a second for a fraction of a cent, not minutes for several dollars. The SPL Token standard also already has the tooling (wallets, explorers, indexers) that a "one party, one token, exclusive ownership" model needs, so none of that had to be built from scratch. This is a system where speed and cost dominate the design, deliberately — it is not attempting to add privacy or confidentiality on top, because that isn't the problem being solved here.

## What this system actually does

One bill of lading = one SPL token, minted with `supply = 1` and `decimals = 0`. The token's entire lifecycle on-chain mirrors the real-world paper process step for step:

| Real-world act | On-chain action | What happens |
|---|---|---|
| Carrier drafts the B/L naming a shipper | `create_draft` | Carrier proposes the shipper and a content hash. Nothing is minted yet — this is a proposal, not a document. |
| Shipper agrees to be named on the document | `approve_draft` | The named shipper signs their own approval. Without this, nobody can be named as shipper against their will. |
| Carrier issues the bill of lading | `issue_bl` | A fresh SPL mint is created and sent to the shipper's wallet. In the same transaction, the mint authority and freeze authority are both permanently revoked — nobody, including the carrier, can ever mint a second copy or freeze the holder's wallet as leverage. |
| Seller endorses the B/L to a buyer | plain SPL token transfer | Endorsement is just a transfer of the token. No special instruction exists for it, because in the real world an endorsement is nothing more than a hand-off of the document — the chain doesn't need to know *why* it moved, only that it did. |
| Buyer presents ("surrenders") the original to the carrier | `request_surrender` | The token is locked into a program-controlled vault and a redemption window opens. This is the digital equivalent of physically handing the document to the carrier's agent. |
| Carrier verifies and releases the cargo | `process_surrender` | The token is burned. The document is "accomplished" — spent, and permanently incapable of being presented again. |
| Carrier never responds in time | `refund_surrender_timeout` | Anyone can trigger this once the window has passed — it is intentionally permissionless, since no central party should be a single point of failure for your own property. The token returns to the buyer and the B/L is simply "Issued" again, ready to be presented a second time. Nothing is lost by a carrier going silent. |

That last instruction is the one piece of this design that has **no clean paper equivalent** — once you physically hand someone a document, you no longer have it, full stop. A deliberate, blockchain-native safety net was added precisely because the paper process has no fallback for an unresponsive counterparty; digitizing the document gave us the opportunity to fix that gap, not just copy it.

### Security guarantees, in plain terms

- Only the carrier recorded on a specific bill of lading can redeem it — nobody else's signature will be accepted for that action.
- A single bill of lading can never be duplicated: the ability to mint more copies is destroyed in the same transaction that creates the first and only one.
- A carrier cannot freeze a buyer's wallet to pressure them during a trade — that ability is destroyed at the same moment.
- A carrier cannot invent a shipper out of thin air and issue a document in their name without that party's own cryptographic consent first.
- Every vault and escrow-style account is scoped to its own bill of lading; nothing shared is ever reused across unrelated transactions.
- The timeout refund is permissionless by design — no party, including the carrier, can hold a buyer's property hostage by simply going quiet.

### The actual document, without putting it on-chain

A bill of lading is more than an ownership token — it's a document with real content: vessel, voyage, ports, cargo description, weight, number of originals. None of that content is ever written on-chain. When the carrier drafts a bill of lading, the frontend canonicalizes that document (sorted keys, no whitespace) and hashes it with SHA-256; only that 32-byte hash travels with the `create_draft` instruction and is later copied onto the issued bill of lading. The document itself — the actual JSON — moves between carrier, shipper, and buyer the same way a PDF scan would today: off-chain, by whatever channel the parties already use.

This is deliberate, and it's the same pattern used by every production electronic bill of lading platform (TradeTrust/OpenAttestation, CargoX, WaveBL): the chain's only job is to answer "has this specific document been tampered with since it was issued?", not to be a document store. Anyone holding a copy of the document — the shipper before approving a draft, a buyer before relying on a bill of lading, in principle a bank before extending credit against it — can recompute the hash themselves and compare it to the one on-chain, with no server and no trusted intermediary involved. A single changed character anywhere in the document produces a completely different hash, so a tampered or substituted document is caught instantly rather than relying on anyone's word that "this is the real one."

## What this does not solve (yet)

Being honest about scope matters more than overstating it:

- **No cryptographic confidentiality.** Cargo details, prices, and counterparties are visible on-chain. This project is about proving exclusive, verifiable ownership — not about hiding commercial terms. A zero-knowledge layer for selective disclosure is a natural extension, not something built here.
- **No financing or collateral layer.** Banks, letters of credit, and trade finance integrations are out of scope.
- **No House/Master B/L distinction.** The "carrier" role here is the actual vessel operator — freight forwarders and NVOCCs sit outside this model for now.
- **Legal enforceability has not been verified in any specific jurisdiction.** The technical design satisfies MLETR's exclusive-control test; whether a given country's courts currently recognize that is a separate, unanswered question.
- **The redemption window is artificially short for demo purposes** (tens of seconds instead of the days a real shipment would need) so the full lifecycle can be shown live without an hours-long wait.

## Running it

```sh
anchor build
anchor test --validator legacy
```

The `--validator legacy` flag matters: this Anchor toolchain defaults to a local validator called `surfpool`, which may not be installed. The flag falls back to the standard `solana-test-validator` instead, with no extra setup required.

## Tests

The full lifecycle — issue, endorse, surrender, redeem, and the permissionless timeout refund — is covered end to end, run against a real local validator rather than mocked. Carrier, shipper, and buyer are always three genuinely separate keypairs, never the same wallet playing multiple roles, so that an authorization check failing silently can't hide behind a shortcut. Alongside the happy path, the suite also asserts the failure cases that matter for a title document: an unrelated wallet cannot redeem someone else's bill of lading, a redemption cannot be claimed early, and a document that times out and returns to the buyer can genuinely be presented a second time rather than getting stuck.

## Frontend

```sh
cd panel
npm install
npm run dev
```

The frontend connects straight to a Phantom wallet in the browser — no backend server, no custom login, no session tokens. Ownership is computed live from on-chain state: whichever wallet is currently connected, the interface works out what that wallet is allowed to do for the specific document being viewed (carrier, current holder, or simply an outside observer) and shows only the actions that apply. Switching Phantom accounts mid-session re-evaluates everything automatically, which is how a single browser tab can walk through every role in the lifecycle — carrier, shipper, and buyer — without ever needing three separate logins.

Phantom needs to be pointed at Devnet for any of this to work.
