import pino from 'pino';
import { appConfig } from '../config';

export const logger = pino({
  level: appConfig.logLevel,
  transport:
    appConfig.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined, // prod logs raw JSON to stdout; ship to a collector (ELK/CloudWatch) via the container's log driver
});
