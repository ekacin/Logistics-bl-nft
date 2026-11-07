pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Cv8LVQWVR6t59hPQfSyf9LmFsG9ueouz5iZKfiNJV7nN");

#[program]
pub mod logistics_bl_nft {
    use super::*;

    pub fn create_draft(ctx: Context<CreateDraft>, draft_id: u64, content_hash: [u8; 32]) -> Result<()> {
        crate::instructions::create_draft::handle_create_draft(ctx, draft_id, content_hash)
    }

    pub fn approve_draft(ctx: Context<ApproveDraft>) -> Result<()> {
        crate::instructions::approve_draft::handle_approve_draft(ctx)
    }

    pub fn issue_bl(ctx: Context<IssueBl>) -> Result<()> {
        crate::instructions::issue_bl::handle_issue_bl(ctx)
    }

    pub fn request_surrender(ctx: Context<RequestSurrender>) -> Result<()> {
        crate::instructions::request_surrender::handle_request_surrender(ctx)
    }

    pub fn process_surrender(ctx: Context<ProcessSurrender>) -> Result<()> {
        crate::instructions::process_surrender::handle_process_surrender(ctx)
    }

    pub fn refund_surrender_timeout(ctx: Context<RefundSurrenderTimeout>) -> Result<()> {
        crate::instructions::refund_surrender_timeout::handle_refund_surrender_timeout(ctx)
    }
}
