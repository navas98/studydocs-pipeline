import type { UserRole } from '../../domain/user/User.js';

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
}

export interface TokenService {
  sign(payload: AccessTokenPayload): string;
  // Throws if the token is malformed, expired, or has an invalid signature
  // — callers don't need to distinguish why, only that it isn't usable.
  verify(token: string): AccessTokenPayload;
}
