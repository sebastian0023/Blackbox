import type { ServerConfig } from '@blackbox/config';
import { Module, type DynamicModule } from '@nestjs/common';
import { SERVER_CONFIG } from '../health/health.constants';
import { AuthController } from './auth/auth.controller';
import { AuthRateLimitService } from './auth/auth-rate-limit.service';
import { AuthService } from './auth/auth.service';
import { CsrfGuard } from './auth/csrf.guard';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { IngestKeysController } from './ingest-keys/ingest-keys.controller';
import { IngestKeysService } from './ingest-keys/ingest-keys.service';
import { PrismaService } from '../infrastructure/prisma.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { PasswordHasher } from './security/password-hasher.service';
import { SecretService } from './security/secret.service';
import { TeamAuthorizationService } from './security/team-authorization.service';
import { TeamsController } from './teams/teams.controller';
import { TeamsService } from './teams/teams.service';

export interface ControlPlaneModuleOptions {
  readonly config: ServerConfig;
}

@Module({})
export class ControlPlaneModule {
  static register(options: ControlPlaneModuleOptions): DynamicModule {
    return {
      module: ControlPlaneModule,
      controllers: [AuthController, IngestKeysController, ProjectsController, TeamsController],
      providers: [
        { provide: SERVER_CONFIG, useValue: options.config },
        AuthRateLimitService,
        AuthService,
        CsrfGuard,
        IngestKeysService,
        PasswordHasher,
        PrismaService,
        ProjectsService,
        SecretService,
        SessionAuthGuard,
        TeamAuthorizationService,
        TeamsService,
      ],
    };
  }
}
