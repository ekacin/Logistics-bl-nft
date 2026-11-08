use anchor_lang::prelude::*;

#[constant]
pub const BL_STATE_SEED: &[u8] = b"bl_state";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SURRENDER_REQUEST_SEED: &[u8] = b"surrender_request";

#[constant]
pub const DRAFT_SEED: &[u8] = b"draft";

// Demo için kısa tutuldu (30sn) — üretimde gün mertebesinde olur (pitch caveat).
#[constant]
pub const SURRENDER_WINDOW: i64 = 30;

#[constant]
pub const METADATA_SEED: &[u8] = b"metadata";

// Metaplex Token Metadata — mainnet ve devnet'te aynı adreste deploy edilmiş, resmi
// program. Crate olarak eklenmiyor (anchor-lang'ın bu fork'u ile solana-pubkey/solana-
// account-info sürüm çatışması çıkarıyor, bkz. commit mesajı) — instruction manuel
// bina ediliyor (issue_bl.rs), sadece program ID burada sabit.
pub const TOKEN_METADATA_PROGRAM_ID: Pubkey = anchor_lang::prelude::pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
