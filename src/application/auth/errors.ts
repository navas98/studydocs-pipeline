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

// Deliberate policy choice (not auto-merge): an email already registered
// with a password can't also sign in via Google — the user is told to use
// their password instead, rather than silently attaching a second login
// method to an account they may not have intended to share.
export class EmailRegisteredWithPasswordError extends Error {
  constructor(public readonly email: string) {
    super(`${email} is already registered with a password. Log in with your password instead.`);
    this.name = 'EmailRegisteredWithPasswordError';
  }
}
