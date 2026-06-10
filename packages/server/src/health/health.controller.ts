import type { LivenessResponse, ReadinessResponse } from '@blackbox/contracts';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { LivenessResponseModel, ReadinessResponseModel } from './health-response.models';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('v1/health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOkResponse({ description: 'The API process is running.', type: LivenessResponseModel })
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOkResponse({
    description: 'PostgreSQL and Redis are available.',
    type: ReadinessResponseModel,
  })
  @ApiServiceUnavailableResponse({
    description: 'At least one required dependency is unavailable.',
    type: ReadinessResponseModel,
  })
  async getReadiness(): Promise<ReadinessResponse> {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status === 'degraded') {
      throw new ServiceUnavailableException(readiness);
    }

    return readiness;
  }
}
