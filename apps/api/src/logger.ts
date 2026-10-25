import type { FastifyServerOptions } from 'fastify';
import type { Config } from './config.js';

/** pino options for Fastify's logger: JSON to stdout, pretty-printed only in development. */
export function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'development') {
    return {
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }

  return { level: config.LOG_LEVEL };
}
