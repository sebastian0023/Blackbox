import type {
  HeartbeatQueryItem,
  HeartbeatQueryResponse,
  IngestBatchResponse,
} from '@blackbox/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestBatchResponseModel implements IngestBatchResponse {
  @ApiProperty({ format: 'uuid', type: String })
  readonly batchId!: string;

  @ApiProperty({ enum: ['queued'], type: String })
  readonly status!: 'queued';
}

export class HeartbeatQueryItemModel implements HeartbeatQueryItem {
  @ApiProperty({ format: 'uuid', type: String })
  readonly eventId!: string;

  @ApiProperty({ type: Number })
  readonly expectedIntervalMs!: number;

  @ApiProperty({ format: 'date-time', type: String })
  readonly occurredAt!: string;

  @ApiProperty({ format: 'date-time', type: String })
  readonly receivedAt!: string;

  @ApiProperty({ type: String })
  readonly serviceName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  readonly serviceVersion!: string | null;

  @ApiProperty({ type: Number })
  readonly uptimeMs!: number;
}

export class HeartbeatQueryResponseModel implements HeartbeatQueryResponse {
  @ApiProperty({ isArray: true, type: HeartbeatQueryItemModel })
  readonly items!: readonly HeartbeatQueryItemModel[];

  @ApiPropertyOptional({ nullable: true, type: String })
  readonly nextCursor!: string | null;
}
