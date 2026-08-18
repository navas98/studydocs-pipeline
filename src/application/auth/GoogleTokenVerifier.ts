export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
}

export interface GoogleTokenVerifier {
  // Throws InvalidTokenError (via the adapter) for a malformed, expired, or
  // wrong-audience token — same failure shape as our own JWTs, so the
  // route layer doesn't need a separate error case for it.
  verify(idToken: string): Promise<GoogleIdentity>;
}
