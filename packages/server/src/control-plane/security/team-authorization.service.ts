import type { Prisma } from '@blackbox/database';
import { TeamRole } from '@blackbox/database';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const roleRank: Readonly<Record<TeamRole, number>> = Object.freeze({
  [TeamRole.viewer]: 0,
  [TeamRole.member]: 1,
  [TeamRole.admin]: 2,
  [TeamRole.owner]: 3,
});

export function roleAllows(actual: TeamRole, required: TeamRole): boolean {
  return roleRank[actual] >= roleRank[required];
}

@Injectable()
export class TeamAuthorizationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireRole(userId: string, teamId: string, requiredRole: TeamRole): Promise<TeamRole> {
    return this.requireRoleIn(this.prisma, userId, teamId, requiredRole);
  }

  async requireRoleIn(
    database: Prisma.TransactionClient | PrismaService,
    userId: string,
    teamId: string,
    requiredRole: TeamRole,
  ): Promise<TeamRole> {
    const membership = await database.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { role: true },
    });

    if (!membership) {
      throw new NotFoundException('Team not found');
    }
    if (!roleAllows(membership.role, requiredRole)) {
      throw new ForbiddenException('Insufficient team permission');
    }

    return membership.role;
  }
}
