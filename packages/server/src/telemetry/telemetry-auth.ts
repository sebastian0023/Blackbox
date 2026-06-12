import { createParamDecorator, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parse } from 'cookie';
import { SESSION_COOKIE_NAME } from '../control-plane/control-plane.constants';
import { PrismaService } from '../infrastructure/prisma.service';

export interface TelemetryPrincipal {
  readonly userId: string;
}

interface TelemetryAuthenticatedRequest {
  readonly headers: { readonly cookie?: string };
  principal?: TelemetryPrincipal;
}

export const CurrentTelemetryPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TelemetryPrincipal | undefined =>
    context.switchToHttp().getRequest<TelemetryAuthenticatedRequest>().principal,
);

@Injectable()
export class TelemetrySessionGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TelemetryAuthenticatedRequest>();
    let token: string | undefined;
    try {
      token = parse(request.headers.cookie ?? '')[SESSION_COOKIE_NAME];
    } catch {
      throw new UnauthorizedException('Authentication required');
    }
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    const session = await this.prisma.session.findUnique({
      select: { expiresAt: true, userId: true },
      where: { tokenHash: createHash('sha256').update(token, 'utf8').digest('hex') },
    });
    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Authentication required');
    }
    request.principal = { userId: session.userId };
    return true;
  }
}
