import type {
  DependencyReadiness,
  DependencyReadinessStatus,
  LivenessResponse,
  ReadinessResponse,
} from '@blackbox/contracts';
import { ApiProperty } from '@nestjs/swagger';

type ReadinessDependencies = ReadinessResponse['dependencies'];

export class LivenessResponseModel implements LivenessResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  readonly status = 'ok' as const;
}

export class DependencyReadinessModel implements DependencyReadiness {
  @ApiProperty({ enum: ['ready', 'unavailable'], example: 'ready' })
  readonly status!: DependencyReadinessStatus;
}

export class ReadinessDependenciesModel implements ReadinessDependencies {
  @ApiProperty({ type: DependencyReadinessModel })
  readonly postgres!: DependencyReadinessModel;

  @ApiProperty({ type: DependencyReadinessModel })
  readonly redis!: DependencyReadinessModel;
}

export class ReadinessResponseModel implements ReadinessResponse {
  @ApiProperty({ type: ReadinessDependenciesModel })
  readonly dependencies!: ReadinessDependenciesModel;

  @ApiProperty({ enum: ['ready', 'degraded'], example: 'ready' })
  readonly status!: 'ready' | 'degraded';
}
