import {
  HEARTBEAT_CONTRACT_VERSION,
  HEARTBEAT_MAX_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
  TELEMETRY_CONTEXT_MAX_LENGTH,
  TELEMETRY_MAX_BATCH_EVENTS,
  TELEMETRY_STACK_MAX_LENGTH,
  TELEMETRY_STRING_MAX_LENGTH,
  type TelemetryMetadata,
} from '@blackbox/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IsSafeTelemetryMetadata } from './telemetry-metadata.validator';

export class HeartbeatEventDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly eventId!: string;

  @ApiProperty({
    maximum: HEARTBEAT_MAX_INTERVAL_MS,
    minimum: HEARTBEAT_MIN_INTERVAL_MS,
    type: Number,
  })
  @IsInt()
  @Max(HEARTBEAT_MAX_INTERVAL_MS)
  @Min(HEARTBEAT_MIN_INTERVAL_MS)
  readonly expectedIntervalMs!: number;

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly occurredAt!: string;

  @ApiProperty({ maxLength: 100, minLength: 1, type: String })
  @IsString()
  @Length(1, 100)
  readonly serviceName!: string;

  @ApiPropertyOptional({ maxLength: 100, minLength: 1, type: String })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly serviceVersion?: string;

  @ApiProperty({ enum: ['heartbeat'], type: String })
  @IsIn(['heartbeat'])
  readonly type!: 'heartbeat';

  @ApiProperty({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: Number })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  @Min(0)
  readonly uptimeMs!: number;
}

export class ProcessMetricEventDto {
  @ApiProperty({ maximum: 100_000, minimum: 0, type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Max(100_000)
  @Min(0)
  readonly cpuPercent!: number;

  @ApiProperty({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: Number })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  @Min(0)
  readonly droppedEvents!: number;

  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly eventId!: string;

  @ApiProperty({ maximum: 86_400_000, minimum: 0, type: Number })
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Max(86_400_000)
  @Min(0)
  readonly eventLoopDelayP99Ms!: number;

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly occurredAt!: string;

  @ApiProperty({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: Number })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  @Min(0)
  readonly rssBytes!: number;

  @ApiProperty({ maxLength: 100, minLength: 1, type: String })
  @IsString()
  @Length(1, 100)
  readonly serviceName!: string;

  @ApiPropertyOptional({ maxLength: 100, minLength: 1, type: String })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly serviceVersion?: string;

  @ApiProperty({ enum: ['process_metric'], type: String })
  @IsIn(['process_metric'])
  readonly type!: 'process_metric';

  @ApiProperty({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0, type: Number })
  @IsInt()
  @Max(Number.MAX_SAFE_INTEGER)
  @Min(0)
  readonly uptimeMs!: number;
}

export class LogEventDto {
  @ApiPropertyOptional({ maxLength: TELEMETRY_CONTEXT_MAX_LENGTH, type: String })
  @IsOptional()
  @IsString()
  @Length(1, TELEMETRY_CONTEXT_MAX_LENGTH)
  readonly context?: string;

  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly eventId!: string;

  @ApiProperty({ enum: ['debug', 'error', 'fatal', 'log', 'verbose', 'warn'], type: String })
  @IsIn(['debug', 'error', 'fatal', 'log', 'verbose', 'warn'])
  readonly level!: 'debug' | 'error' | 'fatal' | 'log' | 'verbose' | 'warn';

  @ApiProperty({ maxLength: TELEMETRY_STRING_MAX_LENGTH, type: String })
  @IsString()
  @Length(0, TELEMETRY_STRING_MAX_LENGTH)
  readonly message!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  @IsSafeTelemetryMetadata()
  readonly metadata?: TelemetryMetadata;

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly occurredAt!: string;

  @ApiProperty({ maxLength: 100, minLength: 1, type: String })
  @IsString()
  @Length(1, 100)
  readonly serviceName!: string;

  @ApiPropertyOptional({ maxLength: 100, minLength: 1, type: String })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly serviceVersion?: string;

  @ApiProperty({ enum: ['log'], type: String })
  @IsIn(['log'])
  readonly type!: 'log';
}

export class ErrorEventDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly eventId!: string;

  @ApiProperty({ maxLength: TELEMETRY_STRING_MAX_LENGTH, type: String })
  @IsString()
  @Length(0, TELEMETRY_STRING_MAX_LENGTH)
  readonly message!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  @IsSafeTelemetryMetadata()
  readonly metadata?: TelemetryMetadata;

  @ApiProperty({ maxLength: TELEMETRY_STRING_MAX_LENGTH, type: String })
  @IsString()
  @Length(1, TELEMETRY_STRING_MAX_LENGTH)
  readonly name!: string;

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly occurredAt!: string;

  @ApiProperty({ maxLength: 100, minLength: 1, type: String })
  @IsString()
  @Length(1, 100)
  readonly serviceName!: string;

  @ApiPropertyOptional({ maxLength: 100, minLength: 1, type: String })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  readonly serviceVersion?: string;

  @ApiProperty({ enum: ['uncaught_exception', 'unhandled_rejection'], type: String })
  @IsIn(['uncaught_exception', 'unhandled_rejection'])
  readonly source!: 'uncaught_exception' | 'unhandled_rejection';

  @ApiPropertyOptional({ maxLength: TELEMETRY_STACK_MAX_LENGTH, type: String })
  @IsOptional()
  @IsString()
  @Length(1, TELEMETRY_STACK_MAX_LENGTH)
  readonly stack?: string;

  @ApiProperty({ enum: ['error'], type: String })
  @IsIn(['error'])
  readonly type!: 'error';
}

export class TelemetryBatchDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly batchId!: string;

  @ApiProperty({
    items: {
      oneOf: [
        { $ref: getSchemaPath(HeartbeatEventDto) },
        { $ref: getSchemaPath(LogEventDto) },
        { $ref: getSchemaPath(ErrorEventDto) },
        { $ref: getSchemaPath(ProcessMetricEventDto) },
      ],
    },
    maxItems: TELEMETRY_MAX_BATCH_EVENTS,
    type: 'array',
  })
  @ArrayMaxSize(TELEMETRY_MAX_BATCH_EVENTS)
  @ArrayMinSize(1)
  @IsArray()
  @Type(() => Object, {
    discriminator: {
      property: 'type',
      subTypes: [
        { name: 'heartbeat', value: HeartbeatEventDto },
        { name: 'log', value: LogEventDto },
        { name: 'error', value: ErrorEventDto },
        { name: 'process_metric', value: ProcessMetricEventDto },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  @ValidateNested({ each: true })
  readonly events!: Array<ErrorEventDto | HeartbeatEventDto | LogEventDto | ProcessMetricEventDto>;

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly sentAt!: string;

  @ApiProperty({ enum: [HEARTBEAT_CONTRACT_VERSION], type: Number })
  @Equals(HEARTBEAT_CONTRACT_VERSION)
  readonly version!: typeof HEARTBEAT_CONTRACT_VERSION;
}
