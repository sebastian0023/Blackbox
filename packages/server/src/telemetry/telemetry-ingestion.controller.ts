import { Controller, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiHeader,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { HeartbeatBatchDto } from './telemetry.dto';
import { TelemetryIngestionService } from './telemetry-ingestion.service';
import { IngestBatchResponseModel } from './telemetry.models';
import { ValidatedBody } from './validated-body.decorator';

@ApiTags('telemetry ingestion')
@Controller('v1/ingest')
export class TelemetryIngestionController {
  constructor(
    @Inject(TelemetryIngestionService) private readonly ingestion: TelemetryIngestionService,
  ) {}

  @Post('batches')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: HeartbeatBatchDto })
  @ApiHeader({ name: 'X-Blackbox-Ingest-Key', required: true })
  @ApiSecurity('ingestKey')
  @ApiAcceptedResponse({ type: IngestBatchResponseModel })
  @ApiResponse({ description: 'The batch is malformed or outside accepted bounds.', status: 400 })
  @ApiUnauthorizedResponse({ description: 'The ingest key is invalid or revoked.' })
  @ApiResponse({ description: 'The request body exceeds 100 KiB.', status: 413 })
  @ApiResponse({ description: 'Durable ingestion is temporarily unavailable.', status: 503 })
  ingest(
    @Headers('x-blackbox-ingest-key') ingestKey: string | undefined,
    @ValidatedBody(HeartbeatBatchDto) batch: HeartbeatBatchDto,
  ): Promise<IngestBatchResponseModel> {
    return this.ingestion.ingest(ingestKey ?? '', batch);
  }
}
