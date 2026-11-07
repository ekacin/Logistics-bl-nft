use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{BillOfLadingState, Draft, DraftStatus, Status};

#[derive(Accounts)]
pub struct IssueBl<'info> {
    #[account(mut)]
    pub carrier: Signer<'info>,

    /// CHECK: sadece alıcı pubkey'i — issue_bl'da sadece Carrier imzalar, shipper'ın
    /// imzasına gerek yok (mimari-spec.md, çekirdek tablo #6). Kimliği `draft` üzerindeki
    /// `has_one = shipper` ile doğrulanıyor — carrier burada keyfi bir adres yazamaz,
    /// shipper'ın kendisi onayladığı taslaktaki adresle eşleşmek zorunda (onay kapısı).
    pub shipper: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [DRAFT_SEED, carrier.key().as_ref(), &draft.draft_id.to_le_bytes()],
        bump = draft.bump,
        has_one = carrier,
        has_one = shipper,
        constraint = draft.status == DraftStatus::Approved @ ErrorCode::DraftNotApproved,
    )]
    pub draft: Account<'info, Draft>,

    #[account(
        init,
        payer = carrier,
        mint::decimals = 0,
        mint::authority = carrier,
        mint::freeze_authority = carrier,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = carrier,
        associated_token::mint = mint,
        associated_token::authority = shipper,
    )]
    pub shipper_ata: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = carrier,
        space = 8 + BillOfLadingState::INIT_SPACE,
        seeds = [BL_STATE_SEED, mint.key().as_ref()],
        bump,
    )]
    pub bl_state: Account<'info, BillOfLadingState>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_issue_bl(ctx: Context<IssueBl>) -> Result<()> {
    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.shipper_ata.to_account_info(),
        authority: ctx.accounts.carrier.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::mint_to(cpi_ctx, 1)?;

    // Güvenlik madde 2: mint authority iptal — "tek adetlik NFT" garantisi.
    let cpi_accounts = SetAuthority {
        current_authority: ctx.accounts.carrier.to_account_info(),
        account_or_mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::set_authority(cpi_ctx, AuthorityType::MintTokens, None)?;

    // Güvenlik madde 3: freeze authority iptal — Carrier, Buyer hesabını baskı aracı yapamaz.
    let cpi_accounts = SetAuthority {
        current_authority: ctx.accounts.carrier.to_account_info(),
        account_or_mint: ctx.accounts.mint.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts);
    token::set_authority(cpi_ctx, AuthorityType::FreezeAccount, None)?;

    // Onay kapısı: taslak tüketildi, aynı taslakla ikinci bir NFT basılamaz.
    // draft_ref/pre_issuance_hash sayesinde "onaylanan içerik = mint edilen içerik" izi
    // zincirde kalıcı olarak duruyor (Consumed taslak bilinçli olarak kapatılmıyor, bkz.
    // docs/plan-onay-kapisi.md — kapatılırsa bu izin referansı boşa düşer).
    ctx.accounts.draft.status = DraftStatus::Consumed;

    let bl_state = &mut ctx.accounts.bl_state;
    bl_state.carrier = ctx.accounts.carrier.key();
    bl_state.shipper = ctx.accounts.shipper.key();
    bl_state.mint = ctx.accounts.mint.key();
    bl_state.status = Status::Issued;
    bl_state.si_ref = Pubkey::default();
    bl_state.draft_ref = ctx.accounts.draft.key();
    bl_state.pre_issuance_hash = ctx.accounts.draft.content_hash;
    bl_state.bump = ctx.bumps.bl_state;

    Ok(())
}
