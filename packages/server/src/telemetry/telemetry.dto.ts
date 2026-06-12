import {
  HEARTBEAT_CONTRACT_VERSION,
  HEARTBEAT_MAX_BATCH_EVENTS,
  HEARTBEAT_MAX_INTERVAL_MS,
  HEARTBEAT_MIN_INTERVAL_MS,
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
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class HeartbeatBatchDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  readonly batchId!: string;

  @ApiProperty({ isArray: true, maxItems: HEARTBEAT_MAX_BATCH_EVENTS, type: HeartbeatEventDto })
  @ArrayMaxSize(HEARTBEAT_MAX_BATCH_EVENTS)
  @ArrayMinSize(1)
  @IsArray()
  @Type(() => HeartbeatEventDto)
  @ValidateNested({ each: true })
  readonly events!: HeartbeatEventDto[];

  @ApiProperty({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  readonly sentAt!: string;

  @ApiProperty({ enum: [HEARTBEAT_CONTRACT_VERSION], type: Number })
  @Equals(HEARTBEAT_CONTRACT_VERSION)
  readonly version!: typeof HEARTBEAT_CONTRACT_VERSION;
}
