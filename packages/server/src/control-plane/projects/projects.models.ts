import { ApiProperty } from '@nestjs/swagger';

export class ProjectModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  readonly teamId!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ format: 'date-time', type: String })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time', type: String })
  readonly updatedAt!: Date;
}

export class EnvironmentModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  readonly projectId!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ format: 'date-time', type: String })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time', type: String })
  readonly updatedAt!: Date;
}
