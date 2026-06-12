import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../auth/auth.decorators';
import { ApiSessionAndCsrfAuth, ApiSessionAuth } from '../auth/openapi-security.decorators';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import { CsrfGuard } from '../auth/csrf.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { NamedResourceDto } from '../projects/projects.dto';
import { ValidatedBody } from '../validated-body.decorator';
import { CreatedIngestKeyModel, IngestKeyMetadataModel } from './ingest-keys.models';
import { IngestKeysService } from './ingest-keys.service';

@ApiTags('ingest keys')
@Controller('v1/teams/:teamId/projects/:projectId/environments/:environmentId/ingest-keys')
@UseGuards(SessionAuthGuard, CsrfGuard)
export class IngestKeysController {
  constructor(@Inject(IngestKeysService) private readonly ingestKeysService: IngestKeysService) {}

  @Get()
  @ApiSessionAuth()
  @ApiOkResponse({ isArray: true, type: IngestKeyMetadataModel })
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
  ): Promise<IngestKeyMetadataModel[]> {
    return this.ingestKeysService.list(principal.userId, teamId, projectId, environmentId);
  }

  @Post()
  @ApiBody({ type: NamedResourceDto })
  @ApiSessionAndCsrfAuth()
  @ApiCreatedResponse({ type: CreatedIngestKeyModel })
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @ValidatedBody(NamedResourceDto) input: NamedResourceDto,
  ): Promise<CreatedIngestKeyModel> {
    return this.ingestKeysService.create(principal.userId, teamId, projectId, environmentId, input);
  }

  @Post(':keyId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiSessionAndCsrfAuth()
  @ApiOkResponse({ type: IngestKeyMetadataModel })
  revoke(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('teamId', new ParseUUIDPipe({ version: '4' })) teamId: string,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Param('environmentId', new ParseUUIDPipe({ version: '4' })) environmentId: string,
    @Param('keyId', new ParseUUIDPipe({ version: '4' })) keyId: string,
  ): Promise<IngestKeyMetadataModel> {
    return this.ingestKeysService.revoke(principal.userId, teamId, projectId, environmentId, keyId);
  }
}
