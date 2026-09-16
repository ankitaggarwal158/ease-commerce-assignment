import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  BULK_MAX_ORDERS: z.coerce.number().int().positive().default(100),
  BULK_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
});

// Fail fast on startup if required config is missing/invalid, instead of surfacing errors later.
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const appConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  apiKey: env.INTERNAL_API_KEY,
  mongoUri: env.MONGODB_URI,
  redisUrl: env.REDIS_URL,
  bulk: {
    maxOrders: env.BULK_MAX_ORDERS,
    workerConcurrency: env.BULK_WORKER_CONCURRENCY,
  },
};
