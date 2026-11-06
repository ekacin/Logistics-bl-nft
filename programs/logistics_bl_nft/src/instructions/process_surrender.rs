use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, CloseAccount, Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{BillOfLadingState, Status, SurrenderRequest};

#[derive(Accounts)]
pub struct ProcessSurrender<'info> {
    pub carrier: Signer<'info>,

    #[account(
        mut,
        seeds = [BL_STATE_SEED, mint.key().as_ref()],
        bump = bl_state.bump,
        has_one = carrier,
        constraint = bl_state.status == Status::SurrenderRequested @ ErrorCode::InvalidState,
    )]
    pub bl_state: Account<'info, BillOfLadingState>,

    /// CHECK: sadece rent iade hedefi — surrender_request.buyer ile eşleştiği
    /// `address` kısıtıyla doğrulanıyor, rol/yetki kontrolü değil.
    #[account(mut, address = surrender_request.buyer)]
    pub buyer: UncheckedAccount<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [SURRENDER_REQUEST_SEED, mint.key().as_ref()],
        bump = surrender_request.bump,
        close = buyer,
    )]
    pub surrender_request: Account<'info, SurrenderRequest>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_process_surrender(ctx: Context<ProcessSurrender>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.bumps.vault;
    let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let cpi_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::burn(cpi_ctx, 1)?;

    // Terminal durumda (Redeemed) zorunlu değil ama ucuz bir iyi alışkanlık — vault'u
    // açık bırakmak yerine kapatıp rent'i buyer'a iade ediyoruz (dış inceleme notu,
    // refund_surrender_timeout'taki zorunlu düzeltmeyle tutarlılık için).
    let close_accounts = CloseAccount {
        account: ctx.accounts.vault.to_account_info(),
        destination: ctx.accounts.buyer.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let close_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        close_accounts,
        signer_seeds,
    );
    token::close_account(close_ctx)?;

    ctx.accounts.bl_state.status = Status::Redeemed;

    Ok(())
}
