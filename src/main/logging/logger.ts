import log from 'electron-log/main';
import path from 'node:path';
import type { AISettings } from '../../shared/types';
import { sanitizeForLog } from './sanitize';

export { sanitizeForLog } from './sanitize';

let initialized = false;

export function initLogger() {
  if (initialized) return;
  initialized = true;

  log.initialize();
  log.transports.ipc.level = false;
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.resolvePathFn = (variables) =>
    path.join(variables.userData, 'logs', 'main.log');
  log.transports.file.inspectOptions = { depth: 8 };
  log.hooks.push((message) => ({
    ...message,
    data: message.data.map((item) => sanitizeForLog(item)),
  }));

  log.info('logger.ready', { file: log.transports.file.getFile().path });
}

export const logger = log;

export function redactSettings(settings: AISettings) {
  return {
    ...settings,
    apiKey: settings.apiKey ? '***' : '',
  };
}
