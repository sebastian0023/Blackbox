import { Injectable, type LoggerService } from '@nestjs/common';

@Injectable()
export class ExampleHostLogger implements LoggerService {
  forwardedCalls = 0;

  debug(): void {
    this.forwardedCalls += 1;
  }

  error(): void {
    this.forwardedCalls += 1;
  }

  fatal(): void {
    this.forwardedCalls += 1;
  }

  log(): void {
    this.forwardedCalls += 1;
  }

  verbose(): void {
    this.forwardedCalls += 1;
  }

  warn(): void {
    this.forwardedCalls += 1;
  }
}
