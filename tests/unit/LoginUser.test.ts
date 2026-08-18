import { describe, expect, it } from 'vitest';
import { LoginUserUseCase } from '../../src/application/auth/LoginUser.js';
import { InvalidCredentialsError } from '../../src/application/auth/errors.js';
import type { PasswordHasher } from '../../src/application/auth/PasswordHasher.js';
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

class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return `hashed:${plaintext}`;
  }
  async verify(plaintext: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plaintext}`;
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

describe('LoginUserUseCase', () => {
  it('signs a token for a matching email and password', async () => {
    const users = new InMemoryUserRepository();
    const user = User.create({ email: 'ana@example.com', passwordHash: 'hashed:secret123', authProvider: 'local' });
    users.seed(user);
    const useCase = new LoginUserUseCase(users, new FakePasswordHasher(), new FakeTokenService());

    const result = await useCase.execute({ email: 'ana@example.com', password: 'secret123' });

    expect(result).toEqual({ accessToken: `token-for:${user.id}`, userId: user.id });
  });

  it('rejects a wrong password', async () => {
    const users = new InMemoryUserRepository();
    users.seed(User.create({ email: 'ana@example.com', passwordHash: 'hashed:secret123', authProvider: 'local' }));
    const useCase = new LoginUserUseCase(users, new FakePasswordHasher(), new FakeTokenService());

    await expect(useCase.execute({ email: 'ana@example.com', password: 'wrong' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects an email that was never registered', async () => {
    const users = new InMemoryUserRepository();
    const useCase = new LoginUserUseCase(users, new FakePasswordHasher(), new FakeTokenService());

    await expect(useCase.execute({ email: 'nobody@example.com', password: 'whatever' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('rejects a Google-only account (no password to check)', async () => {
    const users = new InMemoryUserRepository();
    users.seed(User.create({ email: 'ana@example.com', passwordHash: null, authProvider: 'google' }));
    const useCase = new LoginUserUseCase(users, new FakePasswordHasher(), new FakeTokenService());

    await expect(useCase.execute({ email: 'ana@example.com', password: 'anything' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
