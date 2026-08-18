export class EmailAlreadyRegisteredError extends Error {
  constructor(public readonly email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

// Deliberately doesn't say whether the email or the password was wrong —
// telling an attacker which one is right leaks whether an account exists.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super('Invalid or expired token');
    this.name = 'InvalidTokenError';
  }
}
