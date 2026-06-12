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
import { AddTeamMemberDto, UpdateTeamDto, UpdateTeamMemberRoleDto } from './teams.dto';
import { TeamMemberModel, TeamModel } from './teams.models';
import { TeamsService } from './teams.service';

@ApiTags('teams')
@Controller('v1/teams')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class TeamsController {
  constructor(@Inject(TeamsService) private readonly teamsService: TeamsService) {}

  @Get()
  @ApiSessionAuth()
  @ApiOkResponse({ isArray: true, type: TeamModel })
  listTeams(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<TeamModel[]> {
    return this.teamsService.listTeams(principal.userId);
  }

  @Patch(':teamId')
  @ApiBody({ type: UpdateTeamDto })
  @ApiSessionAndCsrfAuth()
  @ApiOkResponse({ type: TeamModel })
  updateTeam(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @ValidatedBody(UpdateTeamDto) input: UpdateTeamDto,
  ): Promise<TeamModel> {
    return this.teamsService.updateTeam(principal.userId, teamId, input);
  }

  @Get(':teamId/members')
  @ApiSessionAuth()
  @ApiOkResponse({ isArray: true, type: TeamMemberModel })
  listMembers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
  ): Promise<TeamMemberModel[]> {
    return this.teamsService.listMembers(principal.userId, teamId);
  }

  @Post(':teamId/members')
  @ApiBody({ type: AddTeamMemberDto })
  @ApiSessionAndCsrfAuth()
  @ApiCreatedResponse({ type: TeamMemberModel })
  addMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @ValidatedBody(AddTeamMemberDto) input: AddTeamMemberDto,
  ): Promise<TeamMemberModel> {
    return this.teamsService.addMember(principal.userId, teamId, input);
  }

  @Patch(':teamId/members/:userId')
  @ApiBody({ type: UpdateTeamMemberRoleDto })
  @ApiSessionAndCsrfAuth()
  @ApiOkResponse({ type: TeamMemberModel })
  updateMemberRole(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @ValidatedBody(UpdateTeamMemberRoleDto) input: UpdateTeamMemberRoleDto,
  ): Promise<TeamMemberModel> {
    return this.teamsService.updateMemberRole(principal.userId, teamId, userId, input);
  }

  @Delete(':teamId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiSessionAndCsrfAuth()
  @ApiNoContentResponse()
  removeMember(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): Promise<void> {
    return this.teamsService.removeMember(principal.userId, teamId, userId);
  }
}
