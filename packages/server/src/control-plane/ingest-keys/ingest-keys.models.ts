import { ApiProperty } from '@nestjs/swagger';

export class IngestKeyMetadataModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ format: 'uuid', type: String })
  readonly environmentId!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ description: 'Non-secret prefix used to identify this key.', type: String })
  readonly prefix!: string;

  @ApiProperty({ format: 'date-time', type: String })
  readonly createdAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readonly lastUsedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readonly revokedAt!: Date | null;
}

export class CreatedIngestKeyModel extends IngestKeyMetadataModel {
  @ApiProperty({
    description: 'Secret ingest key. This value is returned only once.',
    type: String,
  })
  readonly key!: string;
}
