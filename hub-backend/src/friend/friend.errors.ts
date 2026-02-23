export type FriendErrorCode =
  | 'INVALID_TARGET'
  | 'DUPLICATE_PENDING_REQUEST'
  | 'ALREADY_FRIENDS'
  | 'REQUEST_NOT_FOUND'
  | 'NOT_ALLOWED'
  | 'RATE_LIMITED';

export class FriendDomainError extends Error {
  constructor(
    public readonly code: FriendErrorCode,
    message: string,
  ) {
    super(message);
  }
}
