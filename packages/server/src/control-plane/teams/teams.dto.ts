import { TeamRole } from '@blackbox/database';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTeamMemberDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 320, type: String })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({ enum: TeamRole, type: String })
  @IsEnum(TeamRole)
  readonly role!: TeamRole;
}

export class UpdateTeamMemberRoleDto {
  @ApiProperty({ enum: TeamRole, type: String })
  @IsEnum(TeamRole)
  readonly role!: TeamRole;
}

export class UpdateTeamDto {
  @ApiProperty({ maxLength: 100, minLength: 1, type: String })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  readonly name!: string;
}
