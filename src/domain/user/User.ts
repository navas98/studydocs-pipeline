import { randomUUID } from 'node:crypto';

export type UserRole = 'USER' | 'ADMIN';
export type AuthProvider = 'local' | 'google';

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  authProvider: AuthProvider;
}

export interface UserProps {
  id: string;
  email: string;
  // null for accounts created via Google — there's no password to check,
  // so LoginUserUseCase must never let one of these through.
  passwordHash: string | null;
  authProvider: AuthProvider;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

// Stores a passwordHash, never a plaintext password — hashing happens one
// layer up, in the RegisterUser use case via the PasswordHasher port, so
// the domain never has to know which hashing algorithm is in use.
export class User {
  private constructor(private props: UserProps) {}

  static create(input: CreateUserInput): User {
    const now = new Date();
    return new User({
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      authProvider: input.authProvider,
      role: 'USER',
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromProps(props: UserProps): User {
    return new User({ ...props });
  }

  toProps(): UserProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  get authProvider(): AuthProvider {
    return this.props.authProvider;
  }
}
