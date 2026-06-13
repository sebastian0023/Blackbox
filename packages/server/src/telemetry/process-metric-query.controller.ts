import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProcessMetricQueryDto } from './process-metric-query.dto';
import { ProcessMetricQueryService } from './process-metric-query.service';
import {
  CurrentTelemetryPrincipal,
  TelemetrySessionGuard,
  type TelemetryPrincipal,
} from './telemetry-auth';
import { ProcessMetricQueryResponseModel } from './telemetry.models';
import { ValidatedQuery } from './validated-query.decorator';

@ApiTags('process metrics')
@Controller('v1/teams/:teamId/projects/:projectId/environments/:environmentId/process-metrics')
@UseGuards(TelemetrySessionGuard)
export class ProcessMetricQueryController {
  constructor(
    @Inject(ProcessMetricQueryService) private readonly queries: ProcessMetricQueryService,
  ) {}

  @Get()
  @ApiSecurity({ session: [] })
  @ApiOkResponse({ type: ProcessMetricQueryResponseModel })
  @ApiBadRequestResponse({ description: 'The query bounds or cursor are invalid.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiNotFoundResponse({ description: 'The scoped environment was not found.' })
  list(
    @CurrentTelemetryPrincipal() principal: TelemetryPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedQuery(ProcessMetricQueryDto) query: ProcessMetricQueryDto,
  ): Promise<ProcessMetricQueryResponseModel> {
    return this.queries.list(principal.userId, teamId, projectId, environmentId, query);
  }
}
