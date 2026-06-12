import type { CanActivate } from '@nestjs/common';
import { type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SecretService } from '../security/secret.service';
import type { AuthenticatedRequest } from './auth.types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface RequestWithHeaders extends AuthenticatedRequest {
  readonly headers: { readonly ['x-csrf-token']?: string | string[] };
  readonly method: string;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(SecretService) private readonly secrets: SecretService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const csrfToken = request.headers['x-csrf-token'];
    if (
      typeof csrfToken !== 'string' ||
      !request.principal ||
      !this.secrets.matchesHash(csrfToken, request.principal.csrfTokenHash)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
