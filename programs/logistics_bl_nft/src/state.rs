use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Status {
    Issued,
    SurrenderRequested,
    Redeemed,
}

#[account]
#[derive(InitSpace)]
pub struct BillOfLadingState {
    pub carrier: Pubkey,
    pub shipper: Pubkey,
    pub mint: Pubkey,
    pub status: Status,
    // İleri-uyumluluk: stretch (SI/draft) akışı gelirse dolacak, şimdilik default.
    pub si_ref: Pubkey,
    pub draft_ref: Pubkey,
    pub pre_issuance_hash: [u8; 32],
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SurrenderRequest {
    pub buyer: Pubkey,
    pub deadline: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DraftStatus {
    Draft,
    Approved,
    Consumed,
}

#[account]
#[derive(InitSpace)]
pub struct Draft {
    pub carrier: Pubkey,
    pub shipper: Pubkey,
    pub content_hash: [u8; 32],
    pub draft_id: u64,
    pub status: DraftStatus,
    pub bump: u8,
}
