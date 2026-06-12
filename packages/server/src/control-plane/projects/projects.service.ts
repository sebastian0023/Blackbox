import { Prisma, TeamRole } from '@blackbox/database';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TeamAuthorizationService } from '../security/team-authorization.service';
import { runSerializable } from '../serializable-transaction';
import type { NamedResourceDto } from './projects.dto';
import type { EnvironmentModel, ProjectModel } from './projects.models';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TeamAuthorizationService) private readonly authorization: TeamAuthorizationService,
  ) {}

  async listProjects(userId: string, teamId: string): Promise<ProjectModel[]> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.viewer);
      return transaction.project.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: { teamId },
      });
    });
  }

  async getProject(userId: string, teamId: string, projectId: string): Promise<ProjectModel> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.viewer);
      const project = await transaction.project.findFirst({ where: { id: projectId, teamId } });

      if (!project) {
        throw new NotFoundException('Project not found');
      }
      return project;
    });
  }

  async createProject(
    userId: string,
    teamId: string,
    input: NamedResourceDto,
  ): Promise<ProjectModel> {
    try {
      return await runSerializable(this.prisma, async (transaction) => {
        await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.member);
        return transaction.project.create({ data: { name: input.name, teamId } });
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'A project with this name already exists');
    }
  }

  async updateProject(
    userId: string,
    teamId: string,
    projectId: string,
    input: NamedResourceDto,
  ): Promise<ProjectModel> {
    try {
      return await runSerializable(this.prisma, async (transaction) => {
        await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.member);
        const result = await transaction.project.updateMany({
          data: { name: input.name },
          where: { id: projectId, teamId },
        });

        if (result.count !== 1) {
          throw new NotFoundException('Project not found');
        }
        return transaction.project.findFirstOrThrow({ where: { id: projectId, teamId } });
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'A project with this name already exists');
    }
  }

  async deleteProject(userId: string, teamId: string, projectId: string): Promise<void> {
    await runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.admin);
      const result = await transaction.project.deleteMany({ where: { id: projectId, teamId } });

      if (result.count !== 1) {
        throw new NotFoundException('Project not found');
      }
    });
  }

  async listEnvironments(
    userId: string,
    teamId: string,
    projectId: string,
  ): Promise<EnvironmentModel[]> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.viewer);
      await this.requireProjectIn(transaction, teamId, projectId);
      return transaction.environment.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: { project: { id: projectId, teamId } },
      });
    });
  }

  async getEnvironment(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
  ): Promise<EnvironmentModel> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.viewer);
      const environment = await transaction.environment.findFirst({
        where: { id: environmentId, project: { id: projectId, teamId } },
      });

      if (!environment) {
        throw new NotFoundException('Environment not found');
      }
      return environment;
    });
  }

  async createEnvironment(
    userId: string,
    teamId: string,
    projectId: string,
    input: NamedResourceDto,
  ): Promise<EnvironmentModel> {
    try {
      return await runSerializable(this.prisma, async (transaction) => {
        await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.member);
        await this.requireProjectIn(transaction, teamId, projectId);
        return transaction.environment.create({ data: { name: input.name, projectId } });
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'An environment with this name already exists');
    }
  }

  async updateEnvironment(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    input: NamedResourceDto,
  ): Promise<EnvironmentModel> {
    try {
      return await runSerializable(this.prisma, async (transaction) => {
        await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.member);
        const result = await transaction.environment.updateMany({
          data: { name: input.name },
          where: { id: environmentId, project: { id: projectId, teamId } },
        });

        if (result.count !== 1) {
          throw new NotFoundException('Environment not found');
        }
        return transaction.environment.findFirstOrThrow({
          where: { id: environmentId, project: { id: projectId, teamId } },
        });
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, 'An environment with this name already exists');
    }
  }

  async deleteEnvironment(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    await runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.admin);
      const result = await transaction.environment.deleteMany({
        where: { id: environmentId, project: { id: projectId, teamId } },
      });

      if (result.count !== 1) {
        throw new NotFoundException('Environment not found');
      }
    });
  }

  private async requireProjectIn(
    transaction: Prisma.TransactionClient,
    teamId: string,
    projectId: string,
  ): Promise<void> {
    const project = await transaction.project.findFirst({
      where: { id: projectId, teamId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  private rethrowUniqueConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
