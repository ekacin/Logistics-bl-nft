use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{Draft, DraftStatus};

#[derive(Accounts)]
pub struct ApproveDraft<'info> {
    pub shipper: Signer<'info>,

    #[account(
        mut,
        seeds = [DRAFT_SEED, draft.carrier.as_ref(), &draft.draft_id.to_le_bytes()],
        bump = draft.bump,
        has_one = shipper,
        constraint = draft.status == DraftStatus::Draft @ ErrorCode::InvalidState,
    )]
    pub draft: Account<'info, Draft>,
}

// Kritik: has_one = shipper olmazsa herkes onaylayabilir — kapının tüm anlamı bu satırda.
pub fn handle_approve_draft(ctx: Context<ApproveDraft>) -> Result<()> {
    ctx.accounts.draft.status = DraftStatus::Approved;
    Ok(())
}
