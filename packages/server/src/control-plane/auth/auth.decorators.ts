import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPrincipal, AuthenticatedRequest } from './auth.types';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.principal) {
      throw new Error('Authenticated principal was not attached');
    }

    return request.principal;
  },
);
