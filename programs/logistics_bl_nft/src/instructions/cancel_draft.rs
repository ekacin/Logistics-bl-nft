use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Draft, DraftStatus};

#[derive(Accounts)]
pub struct CancelDraft<'info> {
    #[account(mut)]
    pub carrier: Signer<'info>,

    #[account(
        mut,
        seeds = [DRAFT_SEED, carrier.key().as_ref(), &draft.draft_id.to_le_bytes()],
        bump = draft.bump,
        has_one = carrier,
        constraint = draft.status == DraftStatus::Draft @ ErrorCode::InvalidState,
        close = carrier,
    )]
    pub draft: Account<'info, Draft>,
}

// Sadece henüz onaylanmamış (Draft) bir taslak iptal edilebilir — shipper onayladıktan
// sonra carrier tek taraflı geri çekemez (onay kapısının simetrik güvencesi).
// Consumed olmuş bir taslağa zaten dokunulmaz (bl_state.draft_ref izini korur).
pub fn handle_cancel_draft(_ctx: Context<CancelDraft>) -> Result<()> {
    Ok(())
}
