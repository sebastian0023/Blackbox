import { TeamRole } from '@blackbox/database';
import { ApiProperty } from '@nestjs/swagger';

export class AuthenticatedUserModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ example: 'owner@example.com', type: String })
  readonly email!: string;
}

export class SessionTeamModel {
  @ApiProperty({ format: 'uuid', type: String })
  readonly id!: string;

  @ApiProperty({ example: 'Production team', type: String })
  readonly name!: string;

  @ApiProperty({ enum: TeamRole, type: String })
  readonly role!: TeamRole;
}

export class CurrentSessionResponseModel {
  @ApiProperty({ type: () => AuthenticatedUserModel })
  readonly user!: AuthenticatedUserModel;

  @ApiProperty({ isArray: true, type: () => SessionTeamModel })
  readonly teams!: SessionTeamModel[];
}

export class AuthEstablishedResponseModel extends CurrentSessionResponseModel {
  @ApiProperty({
    description: 'Synchronizer token required in X-CSRF-Token for authenticated mutations.',
    type: String,
  })
  readonly csrfToken!: string;
}
