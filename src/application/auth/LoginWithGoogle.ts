import { User } from '../../domain/user/User.js';
import { EmailRegisteredWithPasswordError, InvalidTokenError } from './errors.js';
import type { GoogleTokenVerifier } from './GoogleTokenVerifier.js';
import type { AccessTokenPayload, TokenService } from './TokenService.js';
import type { UserRepository } from './UserRepository.js';

export interface LoginWithGoogleResult {
  accessToken: string;
  userId: string;
}

export class LoginWithGoogleUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly googleTokens: GoogleTokenVerifier,
    private readonly tokens: TokenService,
  ) {}

  async execute(idToken: string): Promise<LoginWithGoogleResult> {
    const identity = await this.googleTokens.verify(idToken);
    if (!identity.emailVerified) {
      throw new InvalidTokenError();
    }

    const email = identity.email.trim().toLowerCase();
    let user = await this.users.findByEmail(email);

    if (user && user.authProvider !== 'google') {
      // Policy choice (not auto-merge): don't silently attach Google as a
      // second login method to an account someone registered with a
      // password — see EmailRegisteredWithPasswordError.
      throw new EmailRegisteredWithPasswordError(email);
    }

    if (!user) {
      user = User.create({ email, passwordHash: null, authProvider: 'google' });
      await this.users.create(user);
    }

    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return { accessToken: this.tokens.sign(payload), userId: user.id };
  }
}
