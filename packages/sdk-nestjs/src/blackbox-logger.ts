import type { LogLevel } from '@blackbox/contracts';
import type { LoggerService } from '@nestjs/common';
import type { HeartbeatRuntime } from './heartbeat-runtime';

export class BlackboxLogger implements LoggerService {
  constructor(
    private readonly hostLogger: LoggerService,
    private readonly runtime: Pick<HeartbeatRuntime, 'captureLog'>,
  ) {}

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('debug', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('error', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('fatal', message, optionalParams);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('log', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('verbose', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.forwardAndCapture('warn', message, optionalParams);
  }

  private forwardAndCapture(level: LogLevel, message: unknown, optionalParams: unknown[]): void {
    try {
      this.hostLogger[level]?.(message, ...optionalParams);
    } finally {
      try {
        const metadata = optionalParams.find(isPlainObject);
        const context = [...optionalParams].reverse().find((value) => typeof value === 'string');
        this.runtime.captureLog(level, message, metadata, context);
      } catch {
        // Capturing a log must never alter host logger behavior.
      }
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
