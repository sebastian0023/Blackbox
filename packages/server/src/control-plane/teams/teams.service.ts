import { Prisma, TeamRole } from '@blackbox/database';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TeamAuthorizationService } from '../security/team-authorization.service';
import { runSerializable } from '../../infrastructure/serializable-transaction';
import type { AddTeamMemberDto, UpdateTeamMemberRoleDto, UpdateTeamDto } from './teams.dto';
import type { TeamMemberModel, TeamModel } from './teams.models';

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TeamAuthorizationService) private readonly authorization: TeamAuthorizationService,
  ) {}

  async listTeams(userId: string): Promise<TeamModel[]> {
    const memberships = await this.prisma.teamMembership.findMany({
      orderBy: { createdAt: 'asc' },
      where: { userId },
      select: { role: true, team: { select: { id: true, name: true } } },
    });

    return memberships.map(({ role, team }) => ({ ...team, role }));
  }

  async updateTeam(userId: string, teamId: string, input: UpdateTeamDto): Promise<TeamModel> {
    return runSerializable(this.prisma, async (transaction) => {
      const role = await this.authorization.requireRoleIn(
        transaction,
        userId,
        teamId,
        TeamRole.admin,
      );
      const team = await transaction.team.update({
        data: { name: input.name },
        select: { id: true, name: true },
        where: { id: teamId },
      });

      return { ...team, role };
    });
  }

  async listMembers(userId: string, teamId: string): Promise<TeamMemberModel[]> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.viewer);
      const memberships = await transaction.teamMembership.findMany({
        orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
        where: { teamId },
        select: { role: true, user: { select: { email: true, id: true } } },
      });

      return memberships.map(({ role, user }) => ({ email: user.email, role, userId: user.id }));
    });
  }

  async addMember(
    userId: string,
    teamId: string,
    input: AddTeamMemberDto,
  ): Promise<TeamMemberModel> {
    try {
      return await runSerializable(this.prisma, async (transaction) => {
        await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.owner);
        const user = await transaction.user.findUnique({
          where: { email: input.email.trim().toLowerCase() },
          select: { email: true, id: true },
        });

        if (!user) {
          throw new NotFoundException('Registered user not found');
        }

        const membership = await transaction.teamMembership.create({
          data: { role: input.role, teamId, userId: user.id },
          select: { role: true },
        });

        return { email: user.email, role: membership.role, userId: user.id };
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException('User is already a team member');
      }
      throw error;
    }
  }

  async updateMemberRole(
    userId: string,
    teamId: string,
    memberUserId: string,
    input: UpdateTeamMemberRoleDto,
  ): Promise<TeamMemberModel> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.owner);
      const current = await transaction.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId: memberUserId } },
        select: { role: true, user: { select: { email: true } } },
      });

      if (!current) {
        throw new NotFoundException('Team member not found');
      }
      if (current.role === TeamRole.owner && input.role !== TeamRole.owner) {
        await this.requireAnotherOwner(transaction, teamId, memberUserId);
      }

      const updated = await transaction.teamMembership.update({
        data: { role: input.role },
        select: { role: true },
        where: { teamId_userId: { teamId, userId: memberUserId } },
      });

      return { email: current.user.email, role: updated.role, userId: memberUserId };
    });
  }

  async removeMember(userId: string, teamId: string, memberUserId: string): Promise<void> {
    await runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.owner);
      const membership = await transaction.teamMembership.findUnique({
        where: { teamId_userId: { teamId, userId: memberUserId } },
        select: { role: true },
      });

      if (!membership) {
        throw new NotFoundException('Team member not found');
      }
      if (membership.role === TeamRole.owner) {
        await this.requireAnotherOwner(transaction, teamId, memberUserId);
      }

      await transaction.teamMembership.delete({
        where: { teamId_userId: { teamId, userId: memberUserId } },
      });
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private async requireAnotherOwner(
    transaction: Prisma.TransactionClient,
    teamId: string,
    excludedUserId: string,
  ): Promise<void> {
    const anotherOwner = await transaction.teamMembership.findFirst({
      where: { role: TeamRole.owner, teamId, userId: { not: excludedUserId } },
      select: { userId: true },
    });

    if (!anotherOwner) {
      throw new ConflictException('The final team owner cannot be removed or demoted');
    }
  }
}
