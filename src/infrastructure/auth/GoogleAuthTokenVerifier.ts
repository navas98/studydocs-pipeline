import { OAuth2Client } from 'google-auth-library';
import type { GoogleIdentity, GoogleTokenVerifier } from '../../application/auth/GoogleTokenVerifier.js';
import { InvalidTokenError } from '../../application/auth/errors.js';

export class GoogleAuthTokenVerifier implements GoogleTokenVerifier {
  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new InvalidTokenError();
    }

    if (!payload?.email) {
      throw new InvalidTokenError();
    }

    return { email: payload.email, emailVerified: payload.email_verified ?? false };
  }
}
