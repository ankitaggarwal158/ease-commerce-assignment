import { z, ZodType } from 'zod';

/**
 * Reads and validates the env vars for a single courier under its own prefix
 * (e.g. "COURIER_URBANEBOLT"), so adding a new courier never touches this file
 * or the global config module — only the new adapter's own config schema.
 */
export function loadCourierEnv<T extends ZodType>(prefix: string, schema: T): z.infer<T> {
  const scoped: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(`${prefix}_`)) {
      scoped[key.slice(prefix.length + 1)] = value;
    }
  }

  const result = schema.safeParse(scoped);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error(`Invalid config for courier "${prefix}":`, result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}
