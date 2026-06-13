import type {
  HeartbeatQueryItem,
  HeartbeatQueryResponse,
  ErrorQueryItem,
  ErrorQueryResponse,
  LogQueryItem,
  LogQueryResponse,
  IngestBatchResponse,
  ProcessMetricQueryItem,
  ProcessMetricQueryResponse,
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

export class ProcessMetricQueryItemModel implements ProcessMetricQueryItem {
  @ApiProperty({ type: Number })
  readonly cpuPercent!: number;

  @ApiProperty({ type: Number })
  readonly droppedEvents!: number;

  @ApiProperty({ format: 'uuid', type: String })
  readonly eventId!: string;

  @ApiProperty({ type: Number })
  readonly eventLoopDelayP99Ms!: number;

  @ApiProperty({ format: 'date-time', type: String })
  readonly occurredAt!: string;

  @ApiProperty({ format: 'date-time', type: String })
  readonly receivedAt!: string;

  @ApiProperty({ type: Number })
  readonly rssBytes!: number;

  @ApiProperty({ type: String })
  readonly serviceName!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  readonly serviceVersion!: string | null;

  @ApiProperty({ type: Number })
  readonly uptimeMs!: number;
}

export class ProcessMetricQueryResponseModel implements ProcessMetricQueryResponse {
  @ApiProperty({ isArray: true, type: ProcessMetricQueryItemModel })
  readonly items!: readonly ProcessMetricQueryItemModel[];

  @ApiPropertyOptional({ nullable: true, type: String })
  readonly nextCursor!: string | null;
}

export class LogQueryItemModel implements LogQueryItem {
  @ApiPropertyOptional({ type: String })
  readonly context?: string;
  @ApiProperty({ format: 'uuid', type: String })
  readonly eventId!: string;
  @ApiProperty({ enum: ['debug', 'error', 'fatal', 'log', 'verbose', 'warn'], type: String })
  readonly level!: LogQueryItem['level'];
  @ApiProperty({ type: String })
  readonly message!: string;
  @ApiPropertyOptional({ type: Object })
  readonly metadata?: LogQueryItem['metadata'];
  @ApiProperty({ format: 'date-time', type: String })
  readonly occurredAt!: string;
  @ApiProperty({ format: 'date-time', type: String })
  readonly receivedAt!: string;
  @ApiProperty({ type: String })
  readonly serviceName!: string;
  @ApiPropertyOptional({ type: String })
  readonly serviceVersion?: string;
}

export class LogQueryResponseModel implements LogQueryResponse {
  @ApiProperty({ isArray: true, type: LogQueryItemModel })
  readonly items!: readonly LogQueryItemModel[];
  @ApiPropertyOptional({ nullable: true, type: String })
  readonly nextCursor!: string | null;
}

export class ErrorQueryItemModel implements ErrorQueryItem {
  @ApiProperty({ format: 'uuid', type: String })
  readonly eventId!: string;
  @ApiProperty({ type: String })
  readonly message!: string;
  @ApiPropertyOptional({ type: Object })
  readonly metadata?: ErrorQueryItem['metadata'];
  @ApiProperty({ type: String })
  readonly name!: string;
  @ApiProperty({ format: 'date-time', type: String })
  readonly occurredAt!: string;
  @ApiProperty({ format: 'date-time', type: String })
  readonly receivedAt!: string;
  @ApiProperty({ type: String })
  readonly serviceName!: string;
  @ApiPropertyOptional({ type: String })
  readonly serviceVersion?: string;
  @ApiProperty({ enum: ['uncaught_exception', 'unhandled_rejection'], type: String })
  readonly source!: ErrorQueryItem['source'];
  @ApiPropertyOptional({ type: String })
  readonly stack?: string;
}

export class ErrorQueryResponseModel implements ErrorQueryResponse {
  @ApiProperty({ isArray: true, type: ErrorQueryItemModel })
  readonly items!: readonly ErrorQueryItemModel[];
  @ApiPropertyOptional({ nullable: true, type: String })
  readonly nextCursor!: string | null;
}
