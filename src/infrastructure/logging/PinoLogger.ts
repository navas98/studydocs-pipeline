import type { Logger as PinoInstance } from 'pino';
import type { Logger } from '../../application/Logger.js';

export class PinoLogger implements Logger {
  constructor(private readonly pino: PinoInstance) {}

  info(fields: Record<string, unknown>, message: string): void {
    this.pino.info(fields, message);
  }

  error(fields: Record<string, unknown>, message: string): void {
    this.pino.error(fields, message);
  }
}
