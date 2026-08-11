// Port so the application layer can log structured events (section 15)
// without depending on pino directly, per the architecture principles in
// section 7 of the design doc.
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}
