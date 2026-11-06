use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{BillOfLadingState, Status, SurrenderRequest};

#[derive(Accounts)]
pub struct RequestSurrender<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = buyer,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BL_STATE_SEED, mint.key().as_ref()],
        bump = bl_state.bump,
        constraint = bl_state.status == Status::Issued @ ErrorCode::InvalidState,
    )]
    pub bl_state: Account<'info, BillOfLadingState>,

    #[account(
        init,
        payer = buyer,
        space = 8 + SurrenderRequest::INIT_SPACE,
        seeds = [SURRENDER_REQUEST_SEED, mint.key().as_ref()],
        bump,
    )]
    pub surrender_request: Account<'info, SurrenderRequest>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_request_surrender(ctx: Context<RequestSurrender>) -> Result<()> {
    let cpi_accounts = Transfer {
        from: ctx.accounts.buyer_ata.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.buyer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::transfer(cpi_ctx, 1)?;

    let clock = Clock::get()?;
    let surrender_request = &mut ctx.accounts.surrender_request;
    surrender_request.buyer = ctx.accounts.buyer.key();
    surrender_request.deadline = clock.unix_timestamp + SURRENDER_WINDOW;
    surrender_request.bump = ctx.bumps.surrender_request;

    ctx.accounts.bl_state.status = Status::SurrenderRequested;

    Ok(())
}
