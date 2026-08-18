import { User } from '../../domain/user/User.js';
import { EmailAlreadyRegisteredError } from './errors.js';
import type { PasswordHasher } from './PasswordHasher.js';
import type { UserRepository } from './UserRepository.js';

export interface RegisterUserInput {
  email: string;
  password: string;
}

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterUserInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyRegisteredError(email);
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = User.create({ email, passwordHash, authProvider: 'local' });
    await this.users.create(user);
    return user;
  }
}
