// Ensures required env vars exist before any test file imports src/config (which validates
// eagerly and calls process.exit(1) on failure) — real values aren't needed since tests use
// mongodb-memory-server and never issue real Redis commands.
process.env.INTERNAL_API_KEY ??= 'test-api-key';
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/test-unused';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal'; // keep test output focused on jest's own reporting

// UrbaneBoltAdapter loads its config eagerly at construction (composition root import) \u2014
// dummy values are fine since tests only exercise MockCourierAdapter.
process.env.COURIER_URBANEBOLT_BASE_URL ??= 'https://uat.urbanebolt.in';
process.env.COURIER_URBANEBOLT_USERNAME ??= 'test-user';
process.env.COURIER_URBANEBOLT_PASSWORD ??= 'test-pass';
