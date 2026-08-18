import { describe, expect, it } from 'vitest';
import { RegisterUserUseCase } from '../../src/application/auth/RegisterUser.js';
import { EmailAlreadyRegisteredError } from '../../src/application/auth/errors.js';
import type { PasswordHasher } from '../../src/application/auth/PasswordHasher.js';
import type { UserRepository } from '../../src/application/auth/UserRepository.js';
import { User } from '../../src/domain/user/User.js';

class InMemoryUserRepository implements UserRepository {
  private readonly byEmail = new Map<string, User>();

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

describe('RegisterUserUseCase', () => {
  it('creates a local-provider user with a hashed password, never the plaintext', async () => {
    const users = new InMemoryUserRepository();
    const useCase = new RegisterUserUseCase(users, new FakePasswordHasher());

    const user = await useCase.execute({ email: 'Ana@Example.com', password: 'secret123' });

    expect(user.email).toBe('ana@example.com'); // normalized to lowercase
    expect(user.authProvider).toBe('local');
    expect(user.passwordHash).toBe('hashed:secret123');
  });

  it('rejects a duplicate email', async () => {
    const users = new InMemoryUserRepository();
    const useCase = new RegisterUserUseCase(users, new FakePasswordHasher());
    await useCase.execute({ email: 'ana@example.com', password: 'secret123' });

    await expect(useCase.execute({ email: 'ana@example.com', password: 'other-pass' })).rejects.toThrow(
      EmailAlreadyRegisteredError,
    );
  });
});
