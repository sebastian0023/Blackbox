import { Transform } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { HEARTBEAT_QUERY_MAX_LIMIT } from './telemetry.constants';

export class HeartbeatQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor returned by the previous page.',
    type: String,
  })
  @IsOptional()
  @IsString()
  readonly cursor?: string;

  @ApiPropertyOptional({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  @IsOptional()
  readonly from?: string;

  @ApiPropertyOptional({
    default: 50,
    maximum: HEARTBEAT_QUERY_MAX_LIMIT,
    minimum: 1,
    type: Number,
  })
  @IsInt()
  @Max(HEARTBEAT_QUERY_MAX_LIMIT)
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => Number(value))
  readonly limit?: number;

  @ApiPropertyOptional({ format: 'date-time', type: String })
  @IsISO8601({ strict: true })
  @IsOptional()
  readonly to?: string;
}
