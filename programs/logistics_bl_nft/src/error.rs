use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bill of lading is not in the expected state for this operation")]
    InvalidState,
    #[msg("Surrender window deadline has not been reached yet")]
    DeadlineNotReached,
}
