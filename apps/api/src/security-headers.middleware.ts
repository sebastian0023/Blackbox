import { Injectable } from '@nestjs/common';

interface HttpRequest {
  readonly originalUrl?: string;
  readonly url: string;
}

interface HttpResponse {
  removeHeader(name: string): void;
  setHeader(name: string, value: string): void;
}

@Injectable()
export class SecurityHeadersMiddleware {
  use(request: HttpRequest, response: HttpResponse, next: () => void): void {
    response.removeHeader('X-Powered-By');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');

    const path = request.originalUrl ?? request.url;
    if (/^\/v1\/(?:auth|ingest|teams)(?:\/|$)/u.test(path)) {
      response.setHeader('Cache-Control', 'no-store');
    }

    next();
  }
}
