use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bill of lading is not in the expected state for this operation")]
    InvalidState,
    #[msg("Surrender window deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Draft has not been approved by the shipper yet")]
    DraftNotApproved,
    #[msg("Draft has already been consumed by a previous issue_bl call")]
    DraftAlreadyConsumed,
}
