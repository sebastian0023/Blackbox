import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorQueryDto } from './error-query.dto';
import { ErrorQueryService } from './error-query.service';
import {
  CurrentTelemetryPrincipal,
  TelemetrySessionGuard,
  type TelemetryPrincipal,
} from './telemetry-auth';
import { ErrorQueryResponseModel } from './telemetry.models';
import { ValidatedQuery } from './validated-query.decorator';

@ApiTags('errors')
@Controller('v1/teams/:teamId/projects/:projectId/environments/:environmentId/errors')
@UseGuards(TelemetrySessionGuard)
export class ErrorQueryController {
  constructor(@Inject(ErrorQueryService) private readonly queries: ErrorQueryService) {}

  @Get()
  @ApiSecurity({ session: [] })
  @ApiOkResponse({ type: ErrorQueryResponseModel })
  @ApiBadRequestResponse({ description: 'The query bounds or cursor are invalid.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiNotFoundResponse({ description: 'The scoped environment was not found.' })
  list(
    @CurrentTelemetryPrincipal() principal: TelemetryPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedQuery(ErrorQueryDto) query: ErrorQueryDto,
  ): Promise<ErrorQueryResponseModel> {
    return this.queries.list(principal.userId, teamId, projectId, environmentId, query);
  }
}
