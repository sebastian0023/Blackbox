import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HeartbeatQueryDto } from './heartbeat-query.dto';
import { HeartbeatQueryService } from './heartbeat-query.service';
import {
  CurrentTelemetryPrincipal,
  TelemetrySessionGuard,
  type TelemetryPrincipal,
} from './telemetry-auth';
import { HeartbeatQueryResponseModel } from './telemetry.models';
import { ValidatedQuery } from './validated-query.decorator';

@ApiTags('heartbeats')
@Controller('v1/teams/:teamId/projects/:projectId/environments/:environmentId/heartbeats')
@UseGuards(TelemetrySessionGuard)
export class HeartbeatQueryController {
  constructor(@Inject(HeartbeatQueryService) private readonly queries: HeartbeatQueryService) {}

  @Get()
  @ApiSecurity({ session: [] })
  @ApiOkResponse({ type: HeartbeatQueryResponseModel })
  @ApiBadRequestResponse({ description: 'The query bounds or cursor are invalid.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiNotFoundResponse({ description: 'The scoped environment was not found.' })
  list(
    @CurrentTelemetryPrincipal() principal: TelemetryPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedQuery(HeartbeatQueryDto) query: HeartbeatQueryDto,
  ): Promise<HeartbeatQueryResponseModel> {
    return this.queries.list(principal.userId, teamId, projectId, environmentId, query);
  }
}
