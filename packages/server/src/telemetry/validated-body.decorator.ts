import { Body, type Type, ValidationPipe } from '@nestjs/common';

export function ValidatedBody<T extends object>(type: Type<T>): ParameterDecorator {
  return Body(
    new ValidationPipe({
      expectedType: type,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
