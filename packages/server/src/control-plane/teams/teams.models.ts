import { TeamRole } from '@blackbox/database';
import { ApiProperty } from '@nestjs/swagger';

export class TeamModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ type: String })
  readonly name!: string;

  @ApiProperty({ enum: TeamRole, type: String })
  readonly role!: TeamRole;
}

export class TeamMemberModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly userId!: string;

  @ApiProperty({ type: String })
  readonly email!: string;

  @ApiProperty({ enum: TeamRole, type: String })
  readonly role!: TeamRole;
}
