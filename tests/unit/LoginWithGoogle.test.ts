import { describe, expect, it } from 'vitest';
import { LoginWithGoogleUseCase } from '../../src/application/auth/LoginWithGoogle.js';
import { EmailRegisteredWithPasswordError, InvalidTokenError } from '../../src/application/auth/errors.js';
import type { GoogleIdentity, GoogleTokenVerifier } from '../../src/application/auth/GoogleTokenVerifier.js';
import type { AccessTokenPayload, TokenService } from '../../src/application/auth/TokenService.js';
import type { UserRepository } from '../../src/application/auth/UserRepository.js';
import { User } from '../../src/domain/user/User.js';

class InMemoryUserRepository implements UserRepository {
  private readonly byEmail = new Map<string, User>();

  seed(user: User): void {
    this.byEmail.set(user.email, user);
  }

  async create(user: User): Promise<void> {
    this.byEmail.set(user.email, user);
  }

  async findById(id: string): Promise<User | null> {
    return [...this.byEmail.values()].find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.byEmail.get(email) ?? null;
  }
}

class FakeGoogleTokenVerifier implements GoogleTokenVerifier {
  constructor(private readonly identity: GoogleIdentity | Error) {}
  async verify(): Promise<GoogleIdentity> {
    if (this.identity instanceof Error) throw this.identity;
    return this.identity;
  }
}

class FakeTokenService implements TokenService {
  sign(payload: AccessTokenPayload): string {
    return `token-for:${payload.sub}`;
  }
  verify(): AccessTokenPayload {
    throw new Error('not used in this test');
  }
}

describe('LoginWithGoogleUseCase', () => {
  it('creates a new google-provider user on first sign-in', async () => {
    const users = new InMemoryUserRepository();
    const verifier = new FakeGoogleTokenVerifier({ email: 'Ana@Example.com', emailVerified: true });
    const useCase = new LoginWithGoogleUseCase(users, verifier, new FakeTokenService());

    const result = await useCase.execute('fake-id-token');

    const created = await users.findByEmail('ana@example.com');
    expect(created).not.toBeNull();
    expect(created?.authProvider).toBe('google');
    expect(created?.passwordHash).toBeNull();
    expect(result).toEqual({ accessToken: `token-for:${created!.id}`, userId: created!.id });
  });

  it('logs an existing google-provider user back in without creating a duplicate', async () => {
    const users = new InMemoryUserRepository();
    const existing = User.create({ email: 'ana@example.com', passwordHash: null, authProvider: 'google' });
    users.seed(existing);
    const verifier = new FakeGoogleTokenVerifier({ email: 'ana@example.com', emailVerified: true });
    const useCase = new LoginWithGoogleUseCase(users, verifier, new FakeTokenService());

    const result = await useCase.execute('fake-id-token');

    expect(result.userId).toBe(existing.id);
  });

  it('rejects when the email is already registered with a password', async () => {
    const users = new InMemoryUserRepository();
    users.seed(User.create({ email: 'ana@example.com', passwordHash: 'hashed:whatever', authProvider: 'local' }));
    const verifier = new FakeGoogleTokenVerifier({ email: 'ana@example.com', emailVerified: true });
    const useCase = new LoginWithGoogleUseCase(users, verifier, new FakeTokenService());

    await expect(useCase.execute('fake-id-token')).rejects.toThrow(EmailRegisteredWithPasswordError);
  });

  it('rejects an unverified Google email', async () => {
    const users = new InMemoryUserRepository();
    const verifier = new FakeGoogleTokenVerifier({ email: 'ana@example.com', emailVerified: false });
    const useCase = new LoginWithGoogleUseCase(users, verifier, new FakeTokenService());

    await expect(useCase.execute('fake-id-token')).rejects.toThrow(InvalidTokenError);
  });

  it('propagates an invalid/expired Google token as InvalidTokenError', async () => {
    const users = new InMemoryUserRepository();
    const verifier = new FakeGoogleTokenVerifier(new InvalidTokenError());
    const useCase = new LoginWithGoogleUseCase(users, verifier, new FakeTokenService());

    await expect(useCase.execute('garbage')).rejects.toThrow(InvalidTokenError);
  });
});
