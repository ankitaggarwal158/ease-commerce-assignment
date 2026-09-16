import IORedis from 'ioredis';
import { appConfig } from '../config';

// Note: BullMQ requires maxRetriesPerRequest: null; lazyConnect avoids opening a socket
// until the queue/worker actually issues a command.
export const redisConnection = new IORedis(appConfig.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
