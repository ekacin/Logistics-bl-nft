use anchor_lang::prelude::*;

#[constant]
pub const BL_STATE_SEED: &[u8] = b"bl_state";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const SURRENDER_REQUEST_SEED: &[u8] = b"surrender_request";

// Demo için kısa tutuldu (30sn) — üretimde gün mertebesinde olur (pitch caveat).
#[constant]
pub const SURRENDER_WINDOW: i64 = 30;
