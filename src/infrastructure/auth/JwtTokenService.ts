import jwt from 'jsonwebtoken';
import type { AccessTokenPayload, TokenService } from '../../application/auth/TokenService.js';
import { InvalidTokenError } from '../../application/auth/errors.js';

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn } as jwt.SignOptions);
  }

  verify(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret);
      if (typeof decoded === 'string' || !decoded['sub'] || !decoded['role']) {
        throw new InvalidTokenError();
      }
      return { sub: decoded['sub'] as string, role: decoded['role'] as AccessTokenPayload['role'] };
    } catch {
      throw new InvalidTokenError();
    }
  }
}
