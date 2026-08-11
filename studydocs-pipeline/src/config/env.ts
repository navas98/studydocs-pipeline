export interface AppConfig {
  port: number;
  mongoUri: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = env['MONGO_URI'];
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const port = env['PORT'] ? Number(env['PORT']) : 3000;
  if (Number.isNaN(port)) {
    throw new Error(`Invalid PORT: ${env['PORT']}`);
  }

  return { port, mongoUri };
}
