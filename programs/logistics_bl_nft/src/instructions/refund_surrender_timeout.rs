use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{BillOfLadingState, Status, SurrenderRequest};

#[derive(Accounts)]
pub struct RefundSurrenderTimeout<'info> {
    // Permissionless: deadline geçtikten sonra kim çağırırsa çağırsın (mimari-spec.md 9b).
    pub caller: Signer<'info>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [BL_STATE_SEED, mint.key().as_ref()],
        bump = bl_state.bump,
        constraint = bl_state.status == Status::SurrenderRequested @ ErrorCode::InvalidState,
    )]
    pub bl_state: Account<'info, BillOfLadingState>,

    #[account(
        mut,
        seeds = [SURRENDER_REQUEST_SEED, mint.key().as_ref()],
        bump = surrender_request.bump,
        close = buyer,
        constraint = Clock::get()?.unix_timestamp >= surrender_request.deadline @ ErrorCode::DeadlineNotReached,
    )]
    pub surrender_request: Account<'info, SurrenderRequest>,

    /// CHECK: sadece rent iade hedefi — surrender_request.buyer ile eşleştiği
    /// `close` kısıtıyla doğrulanıyor.
    #[account(mut, address = surrender_request.buyer)]
    pub buyer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,

    // Kasıtlı: caller'ın serbestçe geçtiği ham bir hesap DEĞİL — surrender_request.buyer'dan
    // türetiliyor, aksi halde permissionless caller NFT'yi başka bir hesaba yönlendirebilirdi
    // (dış inceleme bulgusu, bkz. plan dosyası). request_surrender zaten bu ATA'nın var
    // olmasını şart koştuğu için (buyer oraya transfer etmişti) burada `init` gerekmiyor.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_refund_surrender_timeout(ctx: Context<RefundSurrenderTimeout>) -> Result<()> {
    let mint_key = ctx.accounts.mint.key();
    let vault_bump = ctx.bumps.vault;
    let seeds: &[&[u8]] = &[VAULT_SEED, mint_key.as_ref(), &[vault_bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault.to_account_info(),
        to: ctx.accounts.buyer_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer_seeds,
    );
    token::transfer(cpi_ctx, 1)?;

    ctx.accounts.bl_state.status = Status::Issued;

    Ok(())
}
