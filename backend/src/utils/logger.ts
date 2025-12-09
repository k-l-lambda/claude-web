/**
 * Simple logger utility
 */

import { config } from '../config.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

const levelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR
};

const currentLevel = levelMap[config.logLevel] || LogLevel.INFO;

function log(level: LogLevel, message: string, ...args: any[]): void {
  if (level < currentLevel) return;

  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];
  const prefix = `[${timestamp}] [${levelName}]`;

  switch (level) {
    case LogLevel.ERROR:
      console.error(prefix, message, ...args);
      break;
    case LogLevel.WARN:
      console.warn(prefix, message, ...args);
      break;
    case LogLevel.INFO:
      console.log(prefix, message, ...args);
      break;
    case LogLevel.DEBUG:
      console.debug(prefix, message, ...args);
      break;
  }
}

export const logger = {
  debug: (message: string, ...args: any[]) => log(LogLevel.DEBUG, message, ...args),
  info: (message: string, ...args: any[]) => log(LogLevel.INFO, message, ...args),
  warn: (message: string, ...args: any[]) => log(LogLevel.WARN, message, ...args),
  error: (message: string, ...args: any[]) => log(LogLevel.ERROR, message, ...args)
};
