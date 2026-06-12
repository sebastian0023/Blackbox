import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterDto {
  @ApiProperty({ example: 'owner@example.com', maxLength: 320, type: String })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({ maxLength: 256, minLength: 12, type: String, writeOnly: true })
  @IsString()
  @Length(12, 256)
  readonly password!: string;

  @ApiProperty({ example: 'Production team', maxLength: 100, minLength: 1, type: String })
  @Transform(({ value }) => trim(value))
  @IsString()
  @Length(1, 100)
  readonly teamName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'owner@example.com', maxLength: 320, type: String })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({ maxLength: 256, minLength: 12, type: String, writeOnly: true })
  @IsString()
  @Length(12, 256)
  readonly password!: string;
}
