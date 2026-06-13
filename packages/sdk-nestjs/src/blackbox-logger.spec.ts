import type { LoggerService } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BlackboxLogger } from './blackbox-logger';

describe('BlackboxLogger', () => {
  it('always forwards host logs and captures explicitly wrapped calls', () => {
    const hostLogger = { log: vi.fn() } as unknown as LoggerService;
    const runtime = { captureLog: vi.fn() };
    const logger = new BlackboxLogger(hostLogger, runtime);

    logger.log('hello', { safe: true }, 'Checkout');

    expect(hostLogger.log).toHaveBeenCalledWith('hello', { safe: true }, 'Checkout');
    expect(runtime.captureLog).toHaveBeenCalledWith('log', 'hello', { safe: true }, 'Checkout');
  });

  it('preserves host logger failure and does not recursively use the host for capture failures', () => {
    const hostFailure = new Error('host logger failed');
    const hostLogger = {
      error: vi.fn(() => {
        throw hostFailure;
      }),
    } as unknown as LoggerService;
    const runtime = {
      captureLog: vi.fn(() => {
        throw new Error('capture failed');
      }),
    };
    const logger = new BlackboxLogger(hostLogger, runtime);

    expect(() => logger.error('message')).toThrow(hostFailure);
    expect(runtime.captureLog).toHaveBeenCalledOnce();
    expect(hostLogger.error).toHaveBeenCalledOnce();
  });
});
