import { TeamRole, type Prisma } from '@blackbox/database';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { NamedResourceDto } from '../projects/projects.dto';
import { SecretService } from '../security/secret.service';
import { TeamAuthorizationService } from '../security/team-authorization.service';
import { runSerializable } from '../serializable-transaction';
import type { CreatedIngestKeyModel, IngestKeyMetadataModel } from './ingest-keys.models';

const keySelection = Object.freeze({
  createdAt: true,
  environmentId: true,
  id: true,
  lastUsedAt: true,
  name: true,
  prefix: true,
  revokedAt: true,
});

@Injectable()
export class IngestKeysService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TeamAuthorizationService) private readonly authorization: TeamAuthorizationService,
    @Inject(SecretService) private readonly secrets: SecretService,
  ) {}

  async list(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
  ): Promise<IngestKeyMetadataModel[]> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.admin);
      await this.requireEnvironment(transaction, teamId, projectId, environmentId);
      return transaction.ingestKey.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: keySelection,
        where: { environment: { id: environmentId, project: { id: projectId, teamId } } },
      });
    });
  }

  async create(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    input: NamedResourceDto,
  ): Promise<CreatedIngestKeyModel> {
    const rawPrefix = this.secrets.createOpaqueSecret(8);
    const prefix = `bbx_${rawPrefix}`;
    const key = `${prefix}_${this.secrets.createOpaqueSecret()}`;

    const created = await runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.admin);
      await this.requireEnvironment(transaction, teamId, projectId, environmentId);

      return transaction.ingestKey.create({
        data: {
          environmentId,
          name: input.name,
          prefix,
          secretHash: this.secrets.hash(key),
        },
        select: keySelection,
      });
    });

    return { ...created, key };
  }

  async revoke(
    userId: string,
    teamId: string,
    projectId: string,
    environmentId: string,
    keyId: string,
  ): Promise<IngestKeyMetadataModel> {
    return runSerializable(this.prisma, async (transaction) => {
      await this.authorization.requireRoleIn(transaction, userId, teamId, TeamRole.admin);
      await this.requireEnvironment(transaction, teamId, projectId, environmentId);
      const existing = await transaction.ingestKey.findFirst({
        select: { id: true, revokedAt: true },
        where: {
          id: keyId,
          environment: { id: environmentId, project: { id: projectId, teamId } },
        },
      });

      if (!existing) {
        throw new NotFoundException('Ingest key not found');
      }
      if (!existing.revokedAt) {
        await transaction.ingestKey.updateMany({
          data: { revokedAt: new Date() },
          where: {
            id: existing.id,
            environment: { id: environmentId, project: { id: projectId, teamId } },
            revokedAt: null,
          },
        });
      }

      return transaction.ingestKey.findFirstOrThrow({
        select: keySelection,
        where: {
          id: existing.id,
          environment: { id: environmentId, project: { id: projectId, teamId } },
        },
      });
    });
  }

  private async requireEnvironment(
    database: Prisma.TransactionClient | PrismaService,
    teamId: string,
    projectId: string,
    environmentId: string,
  ): Promise<void> {
    const environment = await database.environment.findFirst({
      select: { id: true },
      where: { id: environmentId, project: { id: projectId, teamId } },
    });

    if (!environment) {
      throw new NotFoundException('Environment not found');
    }
  }
}
