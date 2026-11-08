use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::{BillOfLadingState, Draft, DraftStatus, Status};

// Metaplex Token Metadata'nın CreateMetadataAccountV3 instruction'ı — crate'i dependency
// olarak eklemek yerine (solana-pubkey/solana-account-info sürüm çatışması çıkarıyor, bkz.
// commit mesajı) burada elle bina ediliyor. Alan sırası/discriminator Metaplex'in kendi
// şemasıyla (DataV2 + is_mutable + collection_details, discriminator=33) birebir aynı
// olmalı — creators/collection/uses hiç kullanılmadığı (hep None) için gerçek tipleri
// yerine herhangi bir BorshSerialize tipi yeterli (Borsh, None'ı tek bir 0 byte'a
// indirger, içindeki T hiç serileştirilmez).
#[derive(AnchorSerialize)]
struct BlDataV2 {
    name: String,
    symbol: String,
    uri: String,
    seller_fee_basis_points: u16,
    creators: Option<Vec<u8>>,
    collection: Option<u8>,
    uses: Option<u8>,
}

#[derive(AnchorSerialize)]
struct CreateMetadataAccountV3Args {
    data: BlDataV2,
    is_mutable: bool,
    collection_details: Option<u8>,
}

const CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR: u8 = 33;
const BL_METADATA_NAME: &str = "Bill of Lading";
const BL_METADATA_SYMBOL: &str = "BL";
// Belge içeriği zaten zincire yazılmıyor (bkz. document.ts / pre_issuance_hash) — bu
// metadata sadece cüzdanda "Unknown Token" yerine okunabilir bir isim/sembol göstermek
// için var. Gerçek bir görsel/JSON eklemek Metaplex'in 200 byte URI sınırı nedeniyle
// dışarıda herkese açık bir dosya barındırmayı gerektirir (data: URI'ler bu sınıra
// sığmıyor) — bilinçli olarak bu PR'ın kapsamı dışında tutuldu, roadmap.
const BL_METADATA_URI: &str = "";

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

    /// CHECK: Metaplex Token Metadata PDA — henüz yok, bu instruction'da CPI ile
    /// oluşturuluyor (crate dependency olarak eklenmediği için Anchor'ın kendi `init`i
    /// değil, elle invoke). seeds/bump sadece adresin doğru PDA olduğunu doğruluyor.
    #[account(
        mut,
        seeds = [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.as_ref(), mint.key().as_ref()],
        bump,
        seeds::program = TOKEN_METADATA_PROGRAM_ID,
    )]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: adres sabit kontrolle doğrulanıyor — carrier burada keyfi bir program
    /// gösteremez.
    #[account(address = TOKEN_METADATA_PROGRAM_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

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

    // Metaplex metadata (Name/Symbol) — authority iptalinden ÖNCE gelmeli: Metaplex
    // carrier'ın bu mint'in GEÇERLİ mint authority'si olduğunu istiyor, authority
    // iptal edildikten sonra bu CPI reddedilir.
    let mut data = vec![CREATE_METADATA_ACCOUNT_V3_DISCRIMINATOR];
    let args = CreateMetadataAccountV3Args {
        data: BlDataV2 {
            name: BL_METADATA_NAME.to_string(),
            symbol: BL_METADATA_SYMBOL.to_string(),
            uri: BL_METADATA_URI.to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        is_mutable: false,
        collection_details: None,
    };
    data.extend(borsh::to_vec(&args).unwrap());

    let ix = Instruction {
        program_id: TOKEN_METADATA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(ctx.accounts.metadata.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new_readonly(ctx.accounts.carrier.key(), true),
            AccountMeta::new(ctx.accounts.carrier.key(), true),
            AccountMeta::new_readonly(ctx.accounts.carrier.key(), true),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data,
    };
    invoke(
        &ix,
        &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.carrier.to_account_info(),
            ctx.accounts.carrier.to_account_info(),
            ctx.accounts.carrier.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

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
