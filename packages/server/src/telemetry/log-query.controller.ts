import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LogQueryDto } from './log-query.dto';
import { LogQueryService } from './log-query.service';
import {
  CurrentTelemetryPrincipal,
  TelemetrySessionGuard,
  type TelemetryPrincipal,
} from './telemetry-auth';
import { LogQueryResponseModel } from './telemetry.models';
import { ValidatedQuery } from './validated-query.decorator';

@ApiTags('logs')
@Controller('v1/teams/:teamId/projects/:projectId/environments/:environmentId/logs')
@UseGuards(TelemetrySessionGuard)
export class LogQueryController {
  constructor(@Inject(LogQueryService) private readonly queries: LogQueryService) {}

  @Get()
  @ApiSecurity({ session: [] })
  @ApiOkResponse({ type: LogQueryResponseModel })
  @ApiBadRequestResponse({ description: 'The query bounds, level, or cursor are invalid.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiNotFoundResponse({ description: 'The scoped environment was not found.' })
  list(
    @CurrentTelemetryPrincipal() principal: TelemetryPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedQuery(LogQueryDto) query: LogQueryDto,
  ): Promise<LogQueryResponseModel> {
    return this.queries.list(principal.userId, teamId, projectId, environmentId, query);
  }
}
