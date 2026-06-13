import type { LogLevel } from '@blackbox/contracts';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { HeartbeatQueryDto } from './heartbeat-query.dto';

export class LogQueryDto extends HeartbeatQueryDto {
  @ApiPropertyOptional({
    enum: ['debug', 'error', 'fatal', 'log', 'verbose', 'warn'],
    type: String,
  })
  @IsIn(['debug', 'error', 'fatal', 'log', 'verbose', 'warn'])
  @IsOptional()
  readonly level?: LogLevel;
}
