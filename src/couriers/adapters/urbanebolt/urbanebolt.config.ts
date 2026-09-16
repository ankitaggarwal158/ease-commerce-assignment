import { z } from 'zod';
import { loadCourierEnv } from '../../../config/courierEnv';

const schema = z.object({
  BASE_URL: z.string().url(),
  USERNAME: z.string().min(1),
  PASSWORD: z.string().min(1),
  TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  RETRY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),
});

export function loadUrbaneBoltConfig() {
  return loadCourierEnv('COURIER_URBANEBOLT', schema);
}

export type UrbaneBoltConfig = ReturnType<typeof loadUrbaneBoltConfig>;
