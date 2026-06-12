import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { ApiSessionAndCsrfAuth, ApiSessionAuth } from '../auth/openapi-security.decorators';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ValidatedBody } from '../validated-body.decorator';
import { NamedResourceDto } from './projects.dto';
import { EnvironmentModel, ProjectModel } from './projects.models';
import { ProjectsService } from './projects.service';

@ApiTags('projects and environments')
@Controller('v1/teams/:teamId/projects')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiSessionAuth()
  @ApiOkResponse({ isArray: true, type: ProjectModel })
  listProjects(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ): Promise<ProjectModel[]> {
    return this.projectsService.listProjects(principal.userId, teamId);
  }

  @Post()
  @ApiBody({ type: NamedResourceDto })
  @ApiSessionAndCsrfAuth()
  @ApiCreatedResponse({ type: ProjectModel })
  createProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @ValidatedBody(NamedResourceDto) input: NamedResourceDto,
  ): Promise<ProjectModel> {
    return this.projectsService.createProject(principal.userId, teamId, input);
  }

  @Get(':projectId')
  @ApiSessionAuth()
  @ApiOkResponse({ type: ProjectModel })
  getProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ): Promise<ProjectModel> {
    return this.projectsService.getProject(principal.userId, teamId, projectId);
  }

  @Patch(':projectId')
  @ApiBody({ type: NamedResourceDto })
  @ApiSessionAndCsrfAuth()
  @ApiOkResponse({ type: ProjectModel })
  updateProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @ValidatedBody(NamedResourceDto) input: NamedResourceDto,
  ): Promise<ProjectModel> {
    return this.projectsService.updateProject(principal.userId, teamId, projectId, input);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSessionAndCsrfAuth()
  @ApiNoContentResponse()
  deleteProject(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ): Promise<void> {
    return this.projectsService.deleteProject(principal.userId, teamId, projectId);
  }

  @Get(':projectId/environments')
  @ApiSessionAuth()
  @ApiOkResponse({ isArray: true, type: EnvironmentModel })
  listEnvironments(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ): Promise<EnvironmentModel[]> {
    return this.projectsService.listEnvironments(principal.userId, teamId, projectId);
  }

  @Post(':projectId/environments')
  @ApiBody({ type: NamedResourceDto })
  @ApiSessionAndCsrfAuth()
  @ApiCreatedResponse({ type: EnvironmentModel })
  createEnvironment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @ValidatedBody(NamedResourceDto) input: NamedResourceDto,
  ): Promise<EnvironmentModel> {
    return this.projectsService.createEnvironment(principal.userId, teamId, projectId, input);
  }

  @Get(':projectId/environments/:environmentId')
  @ApiSessionAuth()
  @ApiOkResponse({ type: EnvironmentModel })
  getEnvironment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
  ): Promise<EnvironmentModel> {
    return this.projectsService.getEnvironment(principal.userId, teamId, projectId, environmentId);
  }

  @Patch(':projectId/environments/:environmentId')
  @ApiBody({ type: NamedResourceDto })
  @ApiSessionAndCsrfAuth()
  @ApiOkResponse({ type: EnvironmentModel })
  updateEnvironment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedBody(NamedResourceDto) input: NamedResourceDto,
  ): Promise<EnvironmentModel> {
    return this.projectsService.updateEnvironment(
      principal.userId,
      teamId,
      projectId,
      environmentId,
      input,
    );
  }

  @Delete(':projectId/environments/:environmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSessionAndCsrfAuth()
  @ApiNoContentResponse()
  deleteEnvironment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
  ): Promise<void> {
    return this.projectsService.deleteEnvironment(
      principal.userId,
      teamId,
      projectId,
      environmentId,
    );
  }
}
