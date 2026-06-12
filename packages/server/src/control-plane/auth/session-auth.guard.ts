import { parse } from 'cookie';
import type { CanActivate } from '@nestjs/common';
import { type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from '../control-plane.constants';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

interface RequestWithHeaders extends AuthenticatedRequest {
  readonly headers: { readonly cookie?: string };
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    let sessionToken: string | undefined;

    try {
      sessionToken = parse(request.headers.cookie ?? '')[SESSION_COOKIE_NAME];
    } catch {
      throw new UnauthorizedException('Authentication required');
    }

    if (!sessionToken) {
      throw new UnauthorizedException('Authentication required');
    }

    request.principal = await this.authService.resolveSession(sessionToken);
    return true;
  }
}
