import { InvalidCredentialsError } from './errors.js';
import type { PasswordHasher } from './PasswordHasher.js';
import type { AccessTokenPayload, TokenService } from './TokenService.js';
import type { UserRepository } from './UserRepository.js';

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  userId: string;
}

export class LoginUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    // Same error for "no such user" and "wrong password" — see
    // InvalidCredentialsError's comment on why that distinction isn't
    // exposed to the caller.
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return { accessToken: this.tokens.sign(payload), userId: user.id };
  }
}
