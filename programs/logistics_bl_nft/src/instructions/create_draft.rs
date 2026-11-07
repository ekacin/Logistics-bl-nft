use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::{Draft, DraftStatus};

#[derive(Accounts)]
#[instruction(draft_id: u64)]
pub struct CreateDraft<'info> {
    #[account(mut)]
    pub carrier: Signer<'info>,

    /// CHECK: sadece alıcı pubkey'i — shipper bu adımda imzalamaz, onayı
    /// approve_draft'ta kendisi verir (onay kapısının tüm amacı bu).
    pub shipper: UncheckedAccount<'info>,

    #[account(
        init,
        payer = carrier,
        space = 8 + Draft::INIT_SPACE,
        seeds = [DRAFT_SEED, carrier.key().as_ref(), &draft_id.to_le_bytes()],
        bump,
    )]
    pub draft: Account<'info, Draft>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_draft(ctx: Context<CreateDraft>, draft_id: u64, content_hash: [u8; 32]) -> Result<()> {
    let draft = &mut ctx.accounts.draft;
    draft.carrier = ctx.accounts.carrier.key();
    draft.shipper = ctx.accounts.shipper.key();
    draft.content_hash = content_hash;
    draft.draft_id = draft_id;
    draft.status = DraftStatus::Draft;
    draft.bump = ctx.bumps.draft;

    Ok(())
}
