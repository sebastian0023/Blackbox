import { Prisma, type TeamRole } from '@blackbox/database';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_TTL_MS } from '../control-plane.constants';
import { PrismaService } from '../../infrastructure/prisma.service';
import { PasswordHasher } from '../security/password-hasher.service';
import { SecretService } from '../security/secret.service';
import { runSerializable } from '../../infrastructure/serializable-transaction';
import { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthEstablishedResponseModel, CurrentSessionResponseModel } from './auth.models';
import type { LoginDto, RegisterDto } from './auth.dto';
import type { AuthenticatedPrincipal } from './auth.types';

interface EstablishedSession {
  readonly body: AuthEstablishedResponseModel;
  readonly expiresAt: Date;
  readonly sessionToken: string;
}

interface SessionSecrets {
  readonly csrfToken: string;
  readonly csrfTokenHash: string;
  readonly expiresAt: Date;
  readonly sessionToken: string;
  readonly tokenHash: string;
}

const MAX_ACTIVE_SESSIONS_PER_USER = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordHasher) private readonly passwordHasher: PasswordHasher,
    @Inject(SecretService) private readonly secrets: SecretService,
    @Inject(AuthRateLimitService) private readonly rateLimit: AuthRateLimitService,
  ) {}

  async register(input: RegisterDto, ipAddress: string): Promise<EstablishedSession> {
    await this.rateLimit.consumeRegistrationAttempt(ipAddress);
    const email = this.normalizeEmail(input.email);
    const passwordHash = await this.passwordHasher.hash(input.password);
    const session = this.createSessionSecrets();

    try {
      const created = await runSerializable(this.prisma, async (transaction) => {
        const user = await transaction.user.create({
          data: { email, passwordHash },
          select: { email: true, id: true },
        });
        const team = await transaction.team.create({
          data: { name: input.teamName },
          select: { id: true, name: true },
        });
        const membership = await transaction.teamMembership.create({
          data: { role: 'owner', teamId: team.id, userId: user.id },
          select: { role: true },
        });

        await this.persistSession(transaction, user.id, session);

        return { membership, team, user };
      });

      return {
        body: {
          csrfToken: session.csrfToken,
          teams: [{ ...created.team, role: created.membership.role }],
          user: created.user,
        },
        expiresAt: session.expiresAt,
        sessionToken: session.sessionToken,
      };
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('Unable to register account');
      }
      throw error;
    }
  }

  async login(input: LoginDto, ipAddress: string): Promise<EstablishedSession> {
    await this.rateLimit.consumeLoginAttempt(input.email, ipAddress);
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(input.email) },
      select: { email: true, id: true, passwordHash: true },
    });

    if (!user) {
      await this.passwordHasher.hash(input.password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await this.passwordHasher.verify(user.passwordHash, input.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.rateLimit.resetLoginAttempts(input.email, ipAddress);

    const session = this.createSessionSecrets();
    const teams = await runSerializable(this.prisma, async (transaction) => {
      await this.persistSession(transaction, user.id, session);

      return this.listTeams(transaction, user.id);
    });

    return {
      body: {
        csrfToken: session.csrfToken,
        teams,
        user: { email: user.email, id: user.id },
      },
      expiresAt: session.expiresAt,
      sessionToken: session.sessionToken,
    };
  }

  async getCurrentSession(principal: AuthenticatedPrincipal): Promise<CurrentSessionResponseModel> {
    return {
      teams: await this.listTeams(this.prisma, principal.userId),
      user: { email: principal.email, id: principal.userId },
    };
  }

  async resolveSession(sessionToken: string): Promise<AuthenticatedPrincipal> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.secrets.hash(sessionToken) },
      select: {
        csrfTokenHash: true,
        expiresAt: true,
        id: true,
        user: { select: { email: true, id: true } },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) {
        await this.prisma.session.deleteMany({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Authentication required');
    }

    return {
      csrfTokenHash: session.csrfTokenHash,
      email: session.user.email,
      sessionId: session.id,
      userId: session.user.id,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  private createSessionSecrets(): SessionSecrets {
    const sessionToken = this.secrets.createOpaqueSecret();
    const csrfToken = this.secrets.createOpaqueSecret();

    return {
      csrfToken,
      csrfTokenHash: this.secrets.hash(csrfToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      sessionToken,
      tokenHash: this.secrets.hash(sessionToken),
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private async persistSession(
    transaction: Prisma.TransactionClient,
    userId: string,
    session: SessionSecrets,
  ): Promise<void> {
    await transaction.session.deleteMany({
      where: { expiresAt: { lte: new Date() }, userId },
    });
    const sessionsBeyondLimit = await transaction.session.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      skip: MAX_ACTIVE_SESSIONS_PER_USER - 1,
      where: { userId },
    });

    if (sessionsBeyondLimit.length > 0) {
      await transaction.session.deleteMany({
        where: { id: { in: sessionsBeyondLimit.map(({ id }) => id) } },
      });
    }

    await transaction.session.create({
      data: {
        csrfTokenHash: session.csrfTokenHash,
        expiresAt: session.expiresAt,
        tokenHash: session.tokenHash,
        userId,
      },
    });
  }

  private async listTeams(
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
  ): Promise<Array<{ id: string; name: string; role: TeamRole }>> {
    const memberships = await database.teamMembership.findMany({
      orderBy: { createdAt: 'asc' },
      where: { userId },
      select: {
        role: true,
        team: { select: { id: true, name: true } },
      },
    });

    return memberships.map(({ role, team }) => ({ ...team, role }));
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
